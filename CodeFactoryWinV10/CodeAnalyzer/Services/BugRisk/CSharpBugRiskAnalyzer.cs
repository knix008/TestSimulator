using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace CodeAnalyzer.Services.BugRisk;

/// <summary>Roslyn 구문 트리를 사용한 C# 전용 버그 위험 분석기.</summary>
public static class CSharpBugRiskAnalyzer
{
    public static async Task<IReadOnlyList<BugRiskFinding>> AnalyzeAsync(
        IReadOnlyList<string> csharpFiles,
        CancellationToken cancellationToken = default)
    {
        var bag = new ConcurrentBag<BugRiskFinding>();

        await Parallel.ForEachAsync(
            csharpFiles,
            new ParallelOptions
            {
                CancellationToken = cancellationToken,
                MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount - 1)
            },
            async (file, ct) =>
            {
                ct.ThrowIfCancellationRequested();
                var found = await AnalyzeFileAsync(file, ct).ConfigureAwait(false);
                foreach (var f in found) bag.Add(f);
            });

        return bag.ToList();
    }

    // ── 파일 단위 분석 ──────────────────────────────────────────────────────
    private static async Task<List<BugRiskFinding>> AnalyzeFileAsync(
        string filePath, CancellationToken ct)
    {
        string src;
        try { src = await File.ReadAllTextAsync(filePath, ct).ConfigureAwait(false); }
        catch { return []; }

        SyntaxNode root;
        SyntaxTree tree;
        try
        {
            tree = CSharpSyntaxTree.ParseText(src, cancellationToken: ct);
            root = await tree.GetRootAsync(ct).ConfigureAwait(false);
        }
        catch { return []; }

        var lines = src.Split('\n');
        var findings = new List<BugRiskFinding>();

        // 모든 메서드·생성자·로컬 함수·연산자·소멸자 분석
        var methodNodes = root.DescendantNodes()
            .Where(n => n is BaseMethodDeclarationSyntax or LocalFunctionStatementSyntax);

        foreach (var method in methodNodes)
        {
            ct.ThrowIfCancellationRequested();
            var body = GetBody(method);
            if (body is null) continue;
            var name = GetName(method);

            CheckUnusedLocals(body, filePath, name, lines, findings);
            CheckDeadWrites(body, filePath, name, lines, findings);
            CheckConstantConditions(body, filePath, name, lines, findings);
            CheckNullAfterAsCast(body, filePath, name, lines, findings);
            CheckDuplicateIfConditions(body, filePath, name, lines, findings);
        }

        return findings;
    }

    // ── 사용되지 않는 지역 변수 ──────────────────────────────────────────────
    private static void CheckUnusedLocals(
        BlockSyntax body, string file, string func, string[] lines,
        List<BugRiskFinding> out_)
    {
        var declared = body.DescendantNodes()
            .OfType<LocalDeclarationStatementSyntax>()
            .SelectMany(d => d.Declaration.Variables)
            .Where(v => !Skip(v.Identifier.Text));

        foreach (var v in declared)
        {
            var name = v.Identifier.Text;
            var readCount = body.DescendantNodes()
                .OfType<IdentifierNameSyntax>()
                .Count(id => id.Identifier.Text == name
                    && id.SpanStart != v.Identifier.SpanStart
                    && !IsLhsOfAssignment(id));

            if (readCount == 0)
            {
                var ln = GetLine(body.SyntaxTree, v.SpanStart);
                out_.Add(F(BugRiskCategory.UnusedVariable, BugRiskSeverity.Warning,
                    $"변수 '{name}'이(가) 선언되었지만 사용되지 않습니다.",
                    file, ln, func, Snip(lines, ln)));
            }
        }
    }

    // ── Dead write (할당 후 읽히지 않는 값) ────────────────────────────────
    private static void CheckDeadWrites(
        BlockSyntax body, string file, string func, string[] lines,
        List<BugRiskFinding> out_)
    {
        var assigns = body.DescendantNodes()
            .OfType<AssignmentExpressionSyntax>()
            .Where(a => a.Left is IdentifierNameSyntax id
                && !Skip(id.Identifier.Text)
                && a.Parent is ExpressionStatementSyntax);

        foreach (var a in assigns)
        {
            var name = ((IdentifierNameSyntax)a.Left).Identifier.Text;
            var laterRead = body.DescendantNodes()
                .OfType<IdentifierNameSyntax>()
                .Any(id => id.Identifier.Text == name
                    && id.SpanStart > a.SpanStart
                    && !IsLhsOfAssignment(id));

            if (!laterRead)
            {
                var ln = GetLine(body.SyntaxTree, a.SpanStart);
                out_.Add(F(BugRiskCategory.DeadWrite, BugRiskSeverity.Info,
                    $"변수 '{name}'에 할당된 값이 이후에 읽히지 않습니다 (Dead Write).",
                    file, ln, func, Snip(lines, ln)));
            }
        }
    }

    // ── 항상 참/거짓인 조건, 자기 비교, null==null, 리터럴 비교 ─────────────
    private static void CheckConstantConditions(
        BlockSyntax body, string file, string func, string[] lines,
        List<BugRiskFinding> out_)
    {
        foreach (var ifStmt in body.DescendantNodes().OfType<IfStatementSyntax>())
        {
            var cond = ifStmt.Condition;

            // if (true) / if (false)
            if (cond is LiteralExpressionSyntax lit)
            {
                if (lit.Token.IsKind(SyntaxKind.TrueKeyword) || lit.Token.IsKind(SyntaxKind.FalseKeyword))
                {
                    var isTrue = lit.Token.IsKind(SyntaxKind.TrueKeyword);
                    var ln = GetLine(body.SyntaxTree, cond.SpanStart);
                    out_.Add(F(isTrue ? BugRiskCategory.AlwaysTrue : BugRiskCategory.AlwaysFalse,
                        BugRiskSeverity.Warning,
                        $"항상 {(isTrue ? "참" : "거짓")}인 조건: {cond}",
                        file, ln, func, Snip(lines, ln)));
                }
            }

            if (cond is BinaryExpressionSyntax bin)
            {
                var op = bin.IsKind(SyntaxKind.EqualsExpression) || bin.IsKind(SyntaxKind.NotEqualsExpression);

                // x == x (같은 식별자)
                if (op
                    && bin.Left is IdentifierNameSyntax lId
                    && bin.Right is IdentifierNameSyntax rId
                    && lId.Identifier.Text == rId.Identifier.Text)
                {
                    var ln = GetLine(body.SyntaxTree, cond.SpanStart);
                    out_.Add(F(BugRiskCategory.CompareToSelf, BugRiskSeverity.Warning,
                        $"변수 '{lId.Identifier.Text}'을(를) 자기 자신과 비교합니다: {cond}",
                        file, ln, func, Snip(lines, ln)));
                }

                // null == null
                if (op && IsNull(bin.Left) && IsNull(bin.Right))
                {
                    var ln = GetLine(body.SyntaxTree, cond.SpanStart);
                    out_.Add(F(BugRiskCategory.ConstantCondition, BugRiskSeverity.Warning,
                        $"null과 null을 비교합니다 — 항상 참입니다: {cond}",
                        file, ln, func, Snip(lines, ln)));
                }

                // 정수 리터럴 == 정수 리터럴
                if (IsCompOp(bin)
                    && bin.Left is LiteralExpressionSyntax ll && ll.Token.IsKind(SyntaxKind.NumericLiteralToken)
                    && bin.Right is LiteralExpressionSyntax lr && lr.Token.IsKind(SyntaxKind.NumericLiteralToken))
                {
                    var ln = GetLine(body.SyntaxTree, cond.SpanStart);
                    out_.Add(F(BugRiskCategory.ConstantCondition, BugRiskSeverity.Warning,
                        $"리터럴 상수끼리 비교합니다 (항상 참/거짓): {cond}",
                        file, ln, func, Snip(lines, ln)));
                }
            }
        }

        // while(false) 등 루프 조건도 확인
        foreach (var loop in body.DescendantNodes()
            .Where(n => n is WhileStatementSyntax or DoStatementSyntax))
        {
            var cond = loop is WhileStatementSyntax w ? w.Condition : ((DoStatementSyntax)loop).Condition;
            if (cond is LiteralExpressionSyntax lc && lc.Token.IsKind(SyntaxKind.FalseKeyword))
            {
                var ln = GetLine(body.SyntaxTree, cond.SpanStart);
                out_.Add(F(BugRiskCategory.AlwaysFalse, BugRiskSeverity.Warning,
                    $"루프 조건이 항상 거짓입니다: {cond}",
                    file, ln, func, Snip(lines, ln)));
            }
        }
    }

    // ── as 캐스트 결과에 null 검사 없이 멤버 접근 ───────────────────────────
    private static void CheckNullAfterAsCast(
        BlockSyntax body, string file, string func, string[] lines,
        List<BugRiskFinding> out_)
    {
        var asCasts = body.DescendantNodes()
            .OfType<VariableDeclaratorSyntax>()
            .Where(v => v.Initializer?.Value is BinaryExpressionSyntax b
                && b.IsKind(SyntaxKind.AsExpression));

        foreach (var decl in asCasts)
        {
            var varName = decl.Identifier.Text;

            // null 검사 (var != null / var is not null / var is SomeType t) 여부
            var hasNullCheck = body.DescendantNodes()
                .OfType<BinaryExpressionSyntax>()
                .Any(b => b.SpanStart > decl.SpanStart
                    && (b.IsKind(SyntaxKind.NotEqualsExpression) || b.IsKind(SyntaxKind.EqualsExpression))
                    && ((b.Left is IdentifierNameSyntax li && li.Identifier.Text == varName && IsNull(b.Right))
                        || (b.Right is IdentifierNameSyntax ri && ri.Identifier.Text == varName && IsNull(b.Left))));

            var hasIsPattern = body.DescendantNodes()
                .OfType<IsPatternExpressionSyntax>()
                .Any(ip => ip.SpanStart > decl.SpanStart);

            if (hasNullCheck || hasIsPattern) continue;

            var access = body.DescendantNodes()
                .OfType<MemberAccessExpressionSyntax>()
                .FirstOrDefault(ma => ma.SpanStart > decl.SpanStart
                    && ma.Expression is IdentifierNameSyntax id
                    && id.Identifier.Text == varName);

            if (access is null) continue;

            var ln = GetLine(body.SyntaxTree, access.SpanStart);
            out_.Add(F(BugRiskCategory.NullDereference, BugRiskSeverity.Warning,
                $"as 캐스트 변수 '{varName}'에 null 검사 없이 멤버를 접근합니다 (as는 실패 시 null 반환).",
                file, ln, func, Snip(lines, ln),
                $"as 캐스트 위치: 줄 {GetLine(body.SyntaxTree, decl.SpanStart)}"));
        }
    }

    // ── else-if 체인의 중복 조건 ─────────────────────────────────────────────
    private static void CheckDuplicateIfConditions(
        BlockSyntax body, string file, string func, string[] lines,
        List<BugRiskFinding> out_)
    {
        foreach (var ifStmt in body.Statements.OfType<IfStatementSyntax>())
        {
            var seen = new List<string>();
            var cur = ifStmt;

            while (cur is not null)
            {
                var condText = Normalize(cur.Condition.ToString());
                if (seen.Contains(condText))
                {
                    var ln = GetLine(body.SyntaxTree, cur.Condition.SpanStart);
                    out_.Add(F(BugRiskCategory.DuplicateCondition, BugRiskSeverity.Warning,
                        $"else-if 체인에서 이미 사용된 조건이 반복됩니다: {cur.Condition}",
                        file, ln, func, Snip(lines, ln)));
                }
                seen.Add(condText);
                cur = cur.Else?.Statement as IfStatementSyntax;
            }
        }
    }

    // ── 유틸리티 ────────────────────────────────────────────────────────────
    private static BlockSyntax? GetBody(SyntaxNode n) => n switch
    {
        MethodDeclarationSyntax m => m.Body,
        ConstructorDeclarationSyntax c => c.Body,
        LocalFunctionStatementSyntax lf => lf.Body,
        OperatorDeclarationSyntax op => op.Body,
        DestructorDeclarationSyntax d => d.Body,
        _ => null
    };

    private static string GetName(SyntaxNode n) => n switch
    {
        MethodDeclarationSyntax m => m.Identifier.Text,
        ConstructorDeclarationSyntax c => c.Identifier.Text + "()",
        LocalFunctionStatementSyntax lf => lf.Identifier.Text,
        _ => string.Empty
    };

    private static bool Skip(string name) =>
        name == "_" || name.Length <= 1
        || name.StartsWith("__", StringComparison.Ordinal)
        || name is "e" or "ex" or "err" or "exception" or "error";

    private static bool IsLhsOfAssignment(IdentifierNameSyntax id) =>
        id.Parent is AssignmentExpressionSyntax a && a.Left == id;

    private static bool IsNull(ExpressionSyntax e) =>
        e is LiteralExpressionSyntax l && l.IsKind(SyntaxKind.NullLiteralExpression);

    private static bool IsCompOp(BinaryExpressionSyntax b) =>
        b.IsKind(SyntaxKind.EqualsExpression) || b.IsKind(SyntaxKind.NotEqualsExpression)
        || b.IsKind(SyntaxKind.LessThanExpression) || b.IsKind(SyntaxKind.GreaterThanExpression)
        || b.IsKind(SyntaxKind.LessThanOrEqualExpression) || b.IsKind(SyntaxKind.GreaterThanOrEqualExpression);

    private static string Normalize(string s) =>
        Regex.Replace(s, @"\s+", " ").Trim();

    private static int GetLine(SyntaxTree tree, int pos)
    {
        var span = TextSpan.FromBounds(pos, pos);
        return tree.GetLineSpan(span).StartLinePosition.Line + 1;
    }

    private static string Snip(string[] lines, int line)
    {
        var idx = line - 1;
        var s = idx >= 0 && idx < lines.Length ? lines[idx].Trim() : string.Empty;
        return s.Length > 120 ? s[..120] + "…" : s;
    }

    private static BugRiskFinding F(
        BugRiskCategory cat, BugRiskSeverity sev, string msg,
        string file, int line, string func, string snippet,
        string detail = "") => new()
    {
        Category = cat,
        Severity = sev,
        Message = msg,
        FilePath = file,
        LineNumber = line,
        FunctionName = func,
        Snippet = snippet,
        Detail = detail,
        LanguageId = "csharp"
    };
}

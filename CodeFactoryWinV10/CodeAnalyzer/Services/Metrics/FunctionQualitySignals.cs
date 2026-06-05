using System.Text.RegularExpressions;
using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TreeSitter;
using CSharpSyntax = Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services.Metrics;

internal static class FunctionQualitySignals
{
    private static readonly Regex SwitchCaseRegex = new(
        @"\bcase\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex EmptyCatchRegex = new(
        @"catch\s*(?:\([^)]*\))?\s*\{\s*\}",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex BroadCatchRegex = new(
        @"catch\s*\(\s*(?:System\.)?Exception\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex AsyncVoidRegex = new(
        @"\basync\s+void\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public sealed record Signals(
        int StatementCount,
        int SwitchCaseCount,
        int EmptyCatchCount,
        int BroadCatchCount,
        bool IsAsyncVoid,
        int HalsteadVolume,
        int WeightedMethodCount);

    public static Signals FromCSharpMethod(SyntaxNode methodBody, IMethodSymbol? symbol)
    {
        var statements = CountCSharpStatements(methodBody);
        var switchCases = methodBody.DescendantNodes().OfType<CaseSwitchLabelSyntax>().Count()
            + methodBody.DescendantNodes().OfType<SwitchExpressionArmSyntax>().Count();
        var (emptyCatch, broadCatch) = CountCSharpCatches(methodBody);
        var isAsyncVoid = symbol is not null && symbol.IsAsync && symbol.ReturnsVoid;
        var halstead = EstimateHalsteadVolume(methodBody.ToString());
        var wmc = symbol is not null ? Math.Max(1, ComputeCyclomaticFromNode(methodBody)) : 0;

        return new Signals(statements, switchCases, emptyCatch, broadCatch, isAsyncVoid, halstead, wmc);
    }

    public static Signals FromSourceText(string body)
    {
        var statements = CountBraceStatements(body);
        var switchCases = SwitchCaseRegex.Matches(body).Count;
        var emptyCatch = EmptyCatchRegex.Matches(body).Count;
        var broadCatch = BroadCatchRegex.Matches(body).Count;
        var isAsyncVoid = AsyncVoidRegex.IsMatch(body);
        var halstead = EstimateHalsteadVolume(body);
        var wmc = Math.Max(1, 1 + MetricsDecisionPatterns.KeywordDecisionRegex.Matches(body).Count);

        return new Signals(statements, switchCases, emptyCatch, broadCatch, isAsyncVoid, halstead, wmc);
    }

    public static Signals FromSyntaxTree(Node bodyNode)
    {
        var body = bodyNode.Text;
        return FromSourceText(body);
    }

    public static bool IsEntryPointName(string displayName) =>
        displayName.Equals("Main", StringComparison.OrdinalIgnoreCase)
        || displayName.Equals("Program", StringComparison.OrdinalIgnoreCase);

    public static bool IsPossiblyUnused(FunctionMetric func) =>
        !func.IsPublic
        && !func.IsAsyncVoid
        && func.FanIn == 0
        && func.FanOut == 0
        && !IsEntryPointName(func.DisplayName);

    private static int CountCSharpStatements(SyntaxNode methodBody)
    {
        var count = 0;
        foreach (var node in methodBody.DescendantNodes())
        {
            if (node is CSharpSyntax.ExpressionStatementSyntax
                or CSharpSyntax.LocalDeclarationStatementSyntax
                or CSharpSyntax.IfStatementSyntax
                or CSharpSyntax.ForStatementSyntax
                or CSharpSyntax.ForEachStatementSyntax
                or CSharpSyntax.WhileStatementSyntax
                or CSharpSyntax.DoStatementSyntax
                or CSharpSyntax.SwitchStatementSyntax
                or CSharpSyntax.TryStatementSyntax
                or CSharpSyntax.ReturnStatementSyntax
                or CSharpSyntax.ThrowStatementSyntax
                or CSharpSyntax.LockStatementSyntax
                or CSharpSyntax.UsingStatementSyntax
                or CSharpSyntax.FixedStatementSyntax
                or CSharpSyntax.YieldStatementSyntax
                or CSharpSyntax.BreakStatementSyntax
                or CSharpSyntax.ContinueStatementSyntax
                or CSharpSyntax.GotoStatementSyntax
                or CSharpSyntax.LabeledStatementSyntax
                or CSharpSyntax.EmptyStatementSyntax)
            {
                count++;
            }
        }

        return Math.Max(1, count);
    }

    private static int CountBraceStatements(string body)
    {
        var count = 0;
        foreach (Match match in Regex.Matches(body, @";\s*$|^\s*(if|for|while|switch|return|throw)\b", RegexOptions.Multiline | RegexOptions.IgnoreCase))
        {
            count++;
        }

        return Math.Max(1, count);
    }

    private static (int Empty, int Broad) CountCSharpCatches(SyntaxNode methodBody)
    {
        var empty = 0;
        var broad = 0;

        foreach (var catchClause in methodBody.DescendantNodes().OfType<CatchClauseSyntax>())
        {
            if (catchClause.Block.Statements.Count == 0)
            {
                empty++;
            }

            if (catchClause.Declaration?.Type is IdentifierNameSyntax id
                && id.Identifier.Text.Equals("Exception", StringComparison.Ordinal))
            {
                broad++;
            }
            else if (catchClause.Declaration?.Type.ToString().EndsWith("Exception", StringComparison.Ordinal) == true
                && catchClause.Declaration.Type.ToString().Contains("Exception", StringComparison.Ordinal))
            {
                broad++;
            }
            else if (catchClause.Declaration is null)
            {
                broad++;
            }
        }

        return (empty, broad);
    }

    private static int ComputeCyclomaticFromNode(SyntaxNode methodBody)
    {
        var complexity = 1;
        foreach (var node in methodBody.DescendantNodes())
        {
            if (node is IfStatementSyntax
                or ForStatementSyntax
                or ForEachStatementSyntax
                or WhileStatementSyntax
                or DoStatementSyntax
                or SwitchStatementSyntax
                or CaseSwitchLabelSyntax
                or CatchClauseSyntax
                or ConditionalExpressionSyntax)
            {
                complexity++;
            }
        }

        return complexity;
    }

    private static int EstimateHalsteadVolume(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return 0;
        }

        var operators = Regex.Matches(body, @"[+\-*/%=<>!&|^~?:;{},.\[\]()]").Count;
        var operands = Regex.Matches(body, @"\b[A-Za-z_]\w*\b").Count;
        var vocabulary = operators + operands;
        var length = operators + operands;
        if (vocabulary <= 0 || length <= 0)
        {
            return 0;
        }

        return (int)Math.Round(length * Math.Log2(Math.Max(2, vocabulary)));
    }
}

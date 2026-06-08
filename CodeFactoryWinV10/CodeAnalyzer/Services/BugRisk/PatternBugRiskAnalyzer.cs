using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.BugRisk;

/// <summary>정규식 기반의 언어 독립적 버그 위험 패턴 분석기.</summary>
public static class PatternBugRiskAnalyzer
{
    private static readonly Regex AsyncVoidRe = new(
        @"\basync\s+void\s+\w+\s*[(<]",
        RegexOptions.Compiled);

    private static readonly Regex ConstantBoolCondRe = new(
        @"\b(?:if|while)\s*\(\s*(?:true|false)\s*\)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex SelfCompareRe = new(
        @"\b(\w{2,})\s*[=!]=\s*\1\b(?!\s*=>)",
        RegexOptions.Compiled);

    private static readonly Regex NullNullRe = new(
        @"\bnull\s*[=!]=\s*null\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex LiteralLiteralRe = new(
        @"(?<![""'\w])(\d+)\s*[=!]=\s*\1(?!\d)",
        RegexOptions.Compiled);

    // 빈 catch: catch (...) { <공백/주석만> }
    private static readonly Regex EmptyCatchRe = new(
        @"\bcatch\s*(?:\([^)]*\))?\s*\{(?:\s*(?://[^\n]*|/\*(?:[^*]|\*(?!/))*\*/))?\s*\}",
        RegexOptions.Compiled | RegexOptions.Singleline);

    // 빈 else / 빈 try 블록
    private static readonly Regex EmptyBlockRe = new(
        @"\b(?:else|try)\s*\{(?:\s*(?://[^\n]*))?\s*\}",
        RegexOptions.Compiled);

    private static readonly string[] DisposableTypes =
    [
        "FileStream", "StreamReader", "StreamWriter", "BinaryReader", "BinaryWriter",
        "MemoryStream", "BufferedStream", "GZipStream", "DeflateStream",
        "SqlConnection", "SqlCommand", "SqlDataReader", "SqlDataAdapter",
        "OleDbConnection", "OdbcConnection",
        "HttpClient", "WebClient", "TcpClient", "UdpClient", "NetworkStream",
        "XmlReader", "XmlWriter", "XmlTextReader", "XmlTextWriter",
        "Process", "Mutex", "Semaphore", "AutoResetEvent", "ManualResetEvent",
        "RegistryKey", "WaitHandle",
    ];

    // return/throw/break/continue 다음에 오는 도달 불가 코드 탐지
    private static readonly Regex TerminatorRe = new(
        @"^\s*(return|throw|break|continue|raise|exit)\b",
        RegexOptions.Compiled);

    public static async Task<IReadOnlyList<BugRiskFinding>> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var bag = new ConcurrentBag<BugRiskFinding>();
        var leakPattern = BuildLeakPattern();

        await Parallel.ForEachAsync(
            sourceFiles,
            new ParallelOptions
            {
                CancellationToken = cancellationToken,
                MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount - 1)
            },
            async (file, ct) =>
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var found = await Task.Run(() => AnalyzeFile(file, leakPattern), ct).ConfigureAwait(false);
                    foreach (var f in found) bag.Add(f);
                }
                catch (OperationCanceledException) { throw; }
                catch { /* 읽기 실패 파일 무시 */ }
            });

        return bag.ToList();
    }

    private static Regex BuildLeakPattern()
    {
        var escaped = string.Join("|", DisposableTypes.Select(Regex.Escape));
        return new Regex($@"(?<!using\s*\()(?<!\w)new\s+({escaped})\s*[<(]", RegexOptions.Compiled);
    }

    private static List<BugRiskFinding> AnalyzeFile(string filePath, Regex leakPattern)
    {
        string src;
        try { src = File.ReadAllText(filePath); }
        catch { return []; }

        var lang = ResolveLang(filePath);
        var lines = src.Split('\n');
        var findings = new List<BugRiskFinding>();

        // 1. async void (C#/VB 전용)
        if (lang is "csharp" or "vb")
        {
            foreach (Match m in AsyncVoidRe.Matches(src))
            {
                var ln = LineOf(src, m.Index);
                Add(findings, BugRiskCategory.AsyncVoidMethod, BugRiskSeverity.Critical,
                    "async void 메서드는 예외가 호출자로 전파되지 않아 프로그램이 비정상 종료될 수 있습니다.",
                    filePath, ln, Snippet(lines, ln), lang);
            }
        }

        // 2. 항상 참/거짓인 bool 조건 (while(true)는 관용적이므로 제외)
        foreach (Match m in ConstantBoolCondRe.Matches(src))
        {
            var raw = m.Value.Trim();
            if (raw.StartsWith("while", StringComparison.OrdinalIgnoreCase)
                && raw.Contains("true", StringComparison.OrdinalIgnoreCase))
                continue;

            var ln = LineOf(src, m.Index);
            var isTrue = raw.Contains("true", StringComparison.OrdinalIgnoreCase);
            Add(findings,
                isTrue ? BugRiskCategory.AlwaysTrue : BugRiskCategory.AlwaysFalse,
                BugRiskSeverity.Warning,
                isTrue ? $"항상 참인 조건: {raw.Split('{')[0].Trim()}"
                       : $"항상 거짓인 조건: {raw.Split('{')[0].Trim()}",
                filePath, ln, Snippet(lines, ln), lang);
        }

        // 3. 자기 자신과 비교 (x == x)
        foreach (Match m in SelfCompareRe.Matches(src))
        {
            var ln = LineOf(src, m.Index);
            Add(findings, BugRiskCategory.CompareToSelf, BugRiskSeverity.Warning,
                $"같은 값을 자기 자신과 비교합니다: {m.Value.Trim()}",
                filePath, ln, Snippet(lines, ln), lang);
        }

        // 4. null == null
        foreach (Match m in NullNullRe.Matches(src))
        {
            var ln = LineOf(src, m.Index);
            Add(findings, BugRiskCategory.ConstantCondition, BugRiskSeverity.Warning,
                "null과 null을 비교합니다 — 결과가 항상 같습니다.",
                filePath, ln, Snippet(lines, ln), lang);
        }

        // 5. 리터럴 == 리터럴 (1 == 1 등)
        foreach (Match m in LiteralLiteralRe.Matches(src))
        {
            var ln = LineOf(src, m.Index);
            Add(findings, BugRiskCategory.ConstantCondition, BugRiskSeverity.Warning,
                $"같은 리터럴 상수끼리 비교합니다 (항상 참/거짓): {m.Value.Trim()}",
                filePath, ln, Snippet(lines, ln), lang);
        }

        // 6. 빈 catch 블록 (예외 무음 처리)
        foreach (Match m in EmptyCatchRe.Matches(src))
        {
            var ln = LineOf(src, m.Index);
            Add(findings, BugRiskCategory.ExceptionSwallowing, BugRiskSeverity.Critical,
                "예외를 처리하지 않는 빈 catch 블록입니다. 오류가 자동으로 무시됩니다.",
                filePath, ln, Snippet(lines, ln), lang);
        }

        // 7. 빈 else / try 블록
        foreach (Match m in EmptyBlockRe.Matches(src))
        {
            var ln = LineOf(src, m.Index);
            var kw = m.Value.TrimStart().Split('{')[0].Trim();
            Add(findings, BugRiskCategory.EmptyBlock, BugRiskSeverity.Info,
                $"빈 블록: '{kw}' 블록의 본문이 비어 있습니다.",
                filePath, ln, Snippet(lines, ln), lang);
        }

        // 8. 리소스 누수 (IDisposable을 using/Dispose 없이 생성)
        if (lang is "csharp" or "vb")
        {
            foreach (Match m in leakPattern.Matches(src))
            {
                var ln = LineOf(src, m.Index);
                var lineText = Snippet(lines, ln);
                // 이미 using 문 안에 있으면 제외
                if (lineText.TrimStart().StartsWith("using ", StringComparison.OrdinalIgnoreCase))
                    continue;
                Add(findings, BugRiskCategory.ResourceLeak, BugRiskSeverity.Warning,
                    $"'{m.Groups[1].Value}'이(가) using/Dispose 없이 생성됩니다 — 리소스가 누수될 수 있습니다.",
                    filePath, ln, lineText, lang);
            }
        }

        // 9. 도달 불가 코드 (return/throw 뒤 줄)
        ScanUnreachable(lines, filePath, lang, findings);

        return findings;
    }

    private static void ScanUnreachable(
        string[] lines, string filePath, string lang, List<BugRiskFinding> findings)
    {
        for (var i = 0; i < lines.Length - 1; i++)
        {
            if (!TerminatorRe.IsMatch(lines[i])) continue;

            for (var j = i + 1; j < Math.Min(i + 4, lines.Length); j++)
            {
                var next = lines[j].Trim();
                if (string.IsNullOrEmpty(next)) continue;
                // 주석·전처리 지시어
                if (next.StartsWith("//", StringComparison.Ordinal)
                    || next.StartsWith("#", StringComparison.Ordinal)
                    || next.StartsWith("/*", StringComparison.Ordinal)) break;
                // 닫는 기호
                if (next[0] is '}' or ')' or ']') break;
                // else / catch / finally / case 는 제어 흐름의 일부
                if (next.StartsWith("else", StringComparison.Ordinal)
                    || next.StartsWith("catch", StringComparison.Ordinal)
                    || next.StartsWith("finally", StringComparison.Ordinal)
                    || next.StartsWith("case ", StringComparison.Ordinal)
                    || next.StartsWith("default:", StringComparison.Ordinal)) break;

                Add(findings, BugRiskCategory.DeadCode, BugRiskSeverity.Warning,
                    "return/throw/break/continue 이후 도달할 수 없는 코드입니다.",
                    filePath, j + 1, next, lang);
                break;
            }
        }
    }

    private static void Add(
        List<BugRiskFinding> list,
        BugRiskCategory cat, BugRiskSeverity sev, string msg,
        string filePath, int line, string snippet, string lang) =>
        list.Add(new BugRiskFinding
        {
            Category = cat,
            Severity = sev,
            Message = msg,
            FilePath = filePath,
            LineNumber = line,
            Snippet = snippet.Length > 120 ? snippet[..120] + "…" : snippet,
            LanguageId = lang
        });

    private static int LineOf(string src, int index)
    {
        var n = 1;
        for (var i = 0; i < index && i < src.Length; i++)
            if (src[i] == '\n') n++;
        return n;
    }

    private static string Snippet(string[] lines, int line)
    {
        var idx = line - 1;
        return idx >= 0 && idx < lines.Length ? lines[idx].Trim() : string.Empty;
    }

    private static string ResolveLang(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".cs" => "csharp",
            ".vb" => "vb",
            ".js" or ".jsx" or ".mjs" => "javascript",
            ".ts" or ".tsx" => "typescript",
            ".py" => "python",
            ".java" => "java",
            ".go" => "go",
            ".rb" => "ruby",
            ".rs" => "rust",
            ".php" => "php",
            ".cpp" or ".cc" or ".cxx" => "cpp",
            ".c" => "c",
            ".swift" => "swift",
            _ => "unknown"
        };
}

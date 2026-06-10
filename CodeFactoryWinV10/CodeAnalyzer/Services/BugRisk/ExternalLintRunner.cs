using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.BugRisk;

/// <summary>
/// ESLint (JS/TS), pylint (Python), RuboCop (Ruby) 등 외부 Lint 도구를 실행합니다.
/// 도구가 설치되어 있지 않으면 조용히 건너뜁니다.
/// </summary>
public static class ExternalLintRunner
{
    private const int MaxFilesPerBatch = 40;
    private const int ToolTimeoutMs = 90_000;

    public static async Task<IReadOnlyList<BugRiskFinding>> RunAsync(
        Dictionary<string, List<string>> filesByLanguage,
        CancellationToken ct = default)
    {
        var bag = new ConcurrentBag<BugRiskFinding>();
        var tasks = new List<Task>();
        using var wallClock = CancellationTokenSource.CreateLinkedTokenSource(ct);
        wallClock.CancelAfter(AnalysisScaleLimits.MaxExternalLintWallClockMs);

        var jsFiles = Get(filesByLanguage, "javascript");
        var tsFiles = Get(filesByLanguage, "typescript");
        var jsts = LimitExternalLintFiles(jsFiles.Concat(tsFiles));
        if (jsts.Count > 0)
            tasks.Add(BatchRunAsync(jsts, RunEsLintBatchAsync, bag, wallClock.Token));

        var py = LimitExternalLintFiles(Get(filesByLanguage, "python"));
        if (py.Count > 0)
            tasks.Add(BatchRunAsync(py, RunPylintBatchAsync, bag, wallClock.Token));

        var rb = LimitExternalLintFiles(Get(filesByLanguage, "ruby"));
        if (rb.Count > 0)
            tasks.Add(BatchRunAsync(rb, RunRubocopBatchAsync, bag, wallClock.Token));

        try
        {
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // 외부 Lint 전체 시간 상한 도달 — 수집된 결과만 반환
        }

        return bag.ToList();
    }

    private static List<string> LimitExternalLintFiles(IEnumerable<string> files)
    {
        return files
            .Where(SourceFileScanGuards.IsWithinHeavyRegexScanBudget)
            .Take(AnalysisScaleLimits.MaxFilesForExternalLint)
            .ToList();
    }

    private static List<string> Get(Dictionary<string, List<string>> d, string key)
        => d.TryGetValue(key, out var v) ? v : [];

    private static async Task BatchRunAsync(
        List<string> files,
        Func<List<string>, CancellationToken, Task<IReadOnlyList<BugRiskFinding>>> runner,
        ConcurrentBag<BugRiskFinding> bag,
        CancellationToken ct)
    {
        foreach (var batch in ToBatches(files, MaxFilesPerBatch))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var findings = await runner(batch, ct).ConfigureAwait(false);
                foreach (var f in findings)
                    bag.Add(f);
            }
            catch (OperationCanceledException) { throw; }
            catch { /* 도구 없음 또는 실행 실패 — 조용히 건너뜀 */ }
        }
    }

    // ── ESLint (JavaScript/TypeScript) ───────────────────────────────────────

    private static async Task<IReadOnlyList<BugRiskFinding>> RunEsLintBatchAsync(
        List<string> files, CancellationToken ct)
    {
        var workDir = Path.GetDirectoryName(files[0]) ?? Directory.GetCurrentDirectory();
        var fileArgs = string.Join(' ', files.Select(f => $"\"{f}\""));

        // npx --no-install eslint 시도 → 직접 eslint 시도
        var (_, stdout) = await TryRunAsync(
            "npx", $"--no-install eslint --format json --max-warnings -1 {fileArgs}",
            workDir, ct).ConfigureAwait(false);

        if (string.IsNullOrWhiteSpace(stdout))
        {
            (_, stdout) = await TryRunAsync(
                "eslint", $"--format json --max-warnings -1 {fileArgs}",
                workDir, ct).ConfigureAwait(false);
        }

        return ParseEsLintOutput(stdout);
    }

    private static IReadOnlyList<BugRiskFinding> ParseEsLintOutput(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];

        // JSON 배열 시작 위치 찾기 (헤더/경고 메시지 건너뜀)
        var start = json.IndexOf('[');
        if (start < 0) return [];

        try
        {
            var arr = JsonSerializer.Deserialize<JsonElement[]>(json[start..]);
            if (arr is null) return [];

            var findings = new List<BugRiskFinding>();
            foreach (var file in arr)
            {
                var path = file.TryGetProperty("filePath", out var fp) ? fp.GetString() ?? "" : "";
                var lang = path.EndsWith(".ts", StringComparison.OrdinalIgnoreCase)
                        || path.EndsWith(".tsx", StringComparison.OrdinalIgnoreCase)
                    ? "typescript" : "javascript";

                if (!file.TryGetProperty("messages", out var msgs)) continue;

                foreach (var msg in msgs.EnumerateArray())
                {
                    var sev = msg.TryGetProperty("severity", out var s) ? s.GetInt32() : 1;
                    var text = msg.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
                    var rule = msg.TryGetProperty("ruleId", out var r) ? r.GetString() ?? "" : "";
                    var line = msg.TryGetProperty("line", out var ln) ? ln.GetInt32() : 0;

                    if (string.IsNullOrWhiteSpace(text)) continue;

                    findings.Add(new BugRiskFinding
                    {
                        Category = MapEsLintCategory(rule),
                        Severity = sev >= 2 ? BugRiskSeverity.Critical : BugRiskSeverity.Warning,
                        Message = string.IsNullOrEmpty(rule) ? text : $"[{rule}] {text}",
                        FilePath = path,
                        LineNumber = line,
                        LanguageId = lang,
                        Detail = "ESLint"
                    });
                }
            }
            return findings;
        }
        catch { return []; }
    }

    private static BugRiskCategory MapEsLintCategory(string rule) => rule switch
    {
        "no-unused-vars" or "@typescript-eslint/no-unused-vars" => BugRiskCategory.UnusedVariable,
        "no-unreachable" or "no-unreachable-loop" => BugRiskCategory.DeadCode,
        "no-empty" or "no-empty-function" => BugRiskCategory.EmptyBlock,
        "no-constant-condition" => BugRiskCategory.ConstantCondition,
        "no-self-compare" or "no-self-assign" => BugRiskCategory.CompareToSelf,
        "no-undef" or "@typescript-eslint/no-explicit-any" => BugRiskCategory.NullDereference,
        _ => BugRiskCategory.LintViolation
    };

    // ── pylint (Python) ───────────────────────────────────────────────────────

    private static async Task<IReadOnlyList<BugRiskFinding>> RunPylintBatchAsync(
        List<string> files, CancellationToken ct)
    {
        var workDir = Path.GetDirectoryName(files[0]) ?? Directory.GetCurrentDirectory();
        var fileArgs = string.Join(' ', files.Select(f => $"\"{f}\""));

        // python -m pylint 시도 → pylint 직접 시도
        var (_, stdout) = await TryRunAsync(
            "python", $"-m pylint --output-format=json {fileArgs}",
            workDir, ct).ConfigureAwait(false);

        if (string.IsNullOrWhiteSpace(stdout))
        {
            (_, stdout) = await TryRunAsync(
                "pylint", $"--output-format=json {fileArgs}",
                workDir, ct).ConfigureAwait(false);
        }

        // python3 시도
        if (string.IsNullOrWhiteSpace(stdout))
        {
            (_, stdout) = await TryRunAsync(
                "python3", $"-m pylint --output-format=json {fileArgs}",
                workDir, ct).ConfigureAwait(false);
        }

        return ParsePylintOutput(stdout);
    }

    private static IReadOnlyList<BugRiskFinding> ParsePylintOutput(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];

        var start = json.IndexOf('[');
        if (start < 0) return [];

        try
        {
            var arr = JsonSerializer.Deserialize<JsonElement[]>(json[start..]);
            if (arr is null) return [];

            var findings = new List<BugRiskFinding>();
            foreach (var msg in arr)
            {
                var type = msg.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
                var text = msg.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
                var symbol = msg.TryGetProperty("symbol", out var s) ? s.GetString() ?? "" : "";
                var path = msg.TryGetProperty("path", out var p) ? p.GetString() ?? "" : "";
                var line = msg.TryGetProperty("line", out var ln) ? ln.GetInt32() : 0;
                var obj = msg.TryGetProperty("obj", out var o) ? o.GetString() ?? "" : "";

                if (string.IsNullOrWhiteSpace(text)) continue;

                findings.Add(new BugRiskFinding
                {
                    Category = MapPylintCategory(symbol),
                    Severity = type switch
                    {
                        "error" or "fatal" => BugRiskSeverity.Critical,
                        "warning" => BugRiskSeverity.Warning,
                        _ => BugRiskSeverity.Info
                    },
                    Message = string.IsNullOrEmpty(symbol) ? text : $"[{symbol}] {text}",
                    FilePath = path,
                    LineNumber = line,
                    FunctionName = obj,
                    LanguageId = "python",
                    Detail = "pylint"
                });
            }
            return findings;
        }
        catch { return []; }
    }

    private static BugRiskCategory MapPylintCategory(string symbol) => symbol switch
    {
        "unused-variable" or "unused-import" or "unused-argument" => BugRiskCategory.UnusedVariable,
        "unreachable" => BugRiskCategory.DeadCode,
        "empty-except" or "bare-except" or "broad-except" or "broad-exception-caught" => BugRiskCategory.ExceptionSwallowing,
        "comparison-to-itself" => BugRiskCategory.CompareToSelf,
        "no-else-return" or "no-else-raise" => BugRiskCategory.DeadCode,
        "consider-using-with" => BugRiskCategory.ResourceLeak,
        _ => BugRiskCategory.LintViolation
    };

    // ── RuboCop (Ruby) ────────────────────────────────────────────────────────

    private static async Task<IReadOnlyList<BugRiskFinding>> RunRubocopBatchAsync(
        List<string> files, CancellationToken ct)
    {
        var workDir = Path.GetDirectoryName(files[0]) ?? Directory.GetCurrentDirectory();
        var fileArgs = string.Join(' ', files.Select(f => $"\"{f}\""));

        var (_, stdout) = await TryRunAsync(
            "rubocop", $"--format json {fileArgs}",
            workDir, ct).ConfigureAwait(false);

        return ParseRubocopOutput(stdout);
    }

    private static IReadOnlyList<BugRiskFinding> ParseRubocopOutput(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];

        try
        {
            var root = JsonSerializer.Deserialize<JsonElement>(json);
            if (!root.TryGetProperty("files", out var filesArr)) return [];

            var findings = new List<BugRiskFinding>();
            foreach (var file in filesArr.EnumerateArray())
            {
                var path = file.TryGetProperty("path", out var p) ? p.GetString() ?? "" : "";
                if (!file.TryGetProperty("offenses", out var offenses)) continue;

                foreach (var off in offenses.EnumerateArray())
                {
                    var sev = off.TryGetProperty("severity", out var s) ? s.GetString() ?? "" : "";
                    var msg = off.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
                    var cop = off.TryGetProperty("cop_name", out var cn) ? cn.GetString() ?? "" : "";
                    var line = off.TryGetProperty("location", out var loc)
                        && loc.TryGetProperty("start_line", out var ln) ? ln.GetInt32() : 0;

                    if (string.IsNullOrWhiteSpace(msg)) continue;

                    findings.Add(new BugRiskFinding
                    {
                        Category = BugRiskCategory.LintViolation,
                        Severity = sev switch
                        {
                            "error" or "fatal" => BugRiskSeverity.Critical,
                            "warning" => BugRiskSeverity.Warning,
                            _ => BugRiskSeverity.Info
                        },
                        Message = string.IsNullOrEmpty(cop) ? msg : $"[{cop}] {msg}",
                        FilePath = path,
                        LineNumber = line,
                        LanguageId = "ruby",
                        Detail = "RuboCop"
                    });
                }
            }
            return findings;
        }
        catch { return []; }
    }

    // ── Process runner ────────────────────────────────────────────────────────

    private static async Task<(int ExitCode, string Stdout)> TryRunAsync(
        string exe, string args, string workingDir, CancellationToken ct)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = exe,
                Arguments = args,
                WorkingDirectory = workingDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8
            };

            using var proc = new Process { StartInfo = psi };
            var sb = new StringBuilder();
            proc.OutputDataReceived += (_, e) => { if (e.Data is not null) sb.AppendLine(e.Data); };

            proc.Start();
            proc.BeginOutputReadLine();

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(ToolTimeoutMs);

            try
            {
                await proc.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                // 타임아웃 — 도구 강제 종료
                try { proc.Kill(); } catch { /* ignore */ }
                return (-1, string.Empty);
            }

            return (proc.ExitCode, sb.ToString());
        }
        catch (OperationCanceledException) { throw; }
        catch { return (-1, string.Empty); }
    }

    private static IEnumerable<List<T>> ToBatches<T>(List<T> source, int size)
    {
        for (var i = 0; i < source.Count; i += size)
            yield return source.GetRange(i, Math.Min(size, source.Count - i));
    }
}

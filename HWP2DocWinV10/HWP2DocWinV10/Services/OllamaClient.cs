using HWP2DocWinV10.Export;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Services;

/// <summary>
/// 로컬 Ollama 서버를 호출해 변환 Markdown을 사용자가 선택한 대상(표·제목·목록·HTML)에 맞게 구조화합니다.
/// </summary>
internal static class OllamaClient
{
    private const string BaseUrl = "http://localhost:11434";
    private const string KeepAlive = "15m";
    private const int StreamPercentStart = 20;
    private const int StreamPercentEnd = 90;
    private const int BalancedMaxBatchChars = 3200;
    private const int FastMaxBatchChars = 6400;
    private const int SinglePassCharLimit = 4200;
    private const int BalancedMaxPredictTokens = 2048;
    private const int FastMaxPredictTokens = 1536;
    private const int StreamProgressIntervalMs = 200;

    private static readonly HttpClient SharedHttp = new()
    {
        Timeout = TimeSpan.FromMinutes(10)
    };

    private static readonly Regex MarkdownFenceRegex = new(
        @"^\s*```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex ExcessBlankLineRegex = new(
        @"\n{3,}",
        RegexOptions.Compiled);

    public static async Task<List<string>> GetModelsAsync(CancellationToken cancellationToken = default)
    {
        using var response = await SharedHttp.GetAsync($"{BaseUrl}/api/tags", cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        string body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        using var document = JsonDocument.Parse(body);

        var models = new List<string>();
        if (document.RootElement.TryGetProperty("models", out var modelsElement))
        {
            foreach (var item in modelsElement.EnumerateArray())
            {
                if (item.TryGetProperty("name", out var nameElement))
                {
                    string? name = nameElement.GetString();
                    if (!string.IsNullOrWhiteSpace(name))
                        models.Add(name);
                }
            }
        }

        return models;
    }

    public static async Task<LlmCleanupResult> CleanupMarkdownAsync(
        string markdown,
        string model,
        IProgress<LlmCleanupProgress>? progress = null,
        CancellationToken cancellationToken = default,
        LlmCleanupOptions options = default)
    {
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("LLM 설정에서 모델 이름을 먼저 입력하세요.");

        if (string.IsNullOrWhiteSpace(markdown))
            return new LlmCleanupResult(markdown, 0, 0, SkippedEntireDocument: false);

        bool fastMode = options.FastMode;
        LlmProcessingTargets targets = options.Targets;
        string targetSummary = LlmProcessingTargetCatalog.FormatSummary(targets);
        string stepTitle = "LLM 구조화";

        ReportStep(progress, 1, "준비", 5, "규칙 기반 정리");
        string prepared = MarkdownConversionPostProcessor.Apply(markdown);

        if (targets == LlmProcessingTargets.None)
        {
            ReportStep(progress, 4, "완료", 100, "LLM 생략 (처리 대상 없음)");
            return new LlmCleanupResult(prepared, 0, 0, SkippedEntireDocument: true);
        }

        ReportStep(progress, 2, "문서 분석", 12, fastMode ? $"빠른 모드 — {targetSummary}" : $"{targetSummary} 대상 검색");
        IReadOnlyList<MarkdownSection> sections = MarkdownLlmAnalyzer.SplitSections(prepared);
        if (sections.Count == 0)
            return new LlmCleanupResult(prepared, 0, 0, SkippedEntireDocument: true);

        var targetIndexes = new List<int>();
        for (int i = 0; i < sections.Count; i++)
        {
            if (MarkdownLlmAnalyzer.NeedsLlmProcessing(sections[i], targets, fastMode))
                targetIndexes.Add(i);
        }

        if (targetIndexes.Count == 0)
        {
            ReportStep(progress, 4, "완료", 100, $"LLM 생략 ({targetSummary} 작업 없음)");
            return new LlmCleanupResult(prepared, sections.Count, 0, SkippedEntireDocument: true);
        }

        string systemPrompt = BuildSystemPrompt(targets);
        int issueThreshold = fastMode ? 2 : 1;
        if (prepared.Length <= SinglePassCharLimit &&
            MarkdownLlmAnalyzer.ScoreForTargets(prepared, targets) >= issueThreshold)
        {
            string singleInput = CompressForLlm(prepared);
            ReportStep(progress, 3, stepTitle, 20, "단일 호출");

            string singleCleaned = await GenerateChatStreamingAsync(
                model,
                systemPrompt,
                BuildDocumentPrompt(singleInput, targets),
                EstimateNumPredict(singleInput.Length, fastMode),
                EstimateNumCtx(singleInput.Length),
                progress,
                stepTitle,
                20,
                cancellationToken).ConfigureAwait(false);

            singleCleaned = NormalizeResponse(singleCleaned);
            singleCleaned = MarkdownConversionPostProcessor.Apply(singleCleaned);

            if (LlmContentGuard.IsAcceptable(singleInput, singleCleaned))
            {
                ReportStep(progress, 4, "완료", 100, $"단일 호출 ({targetSummary})");
                return new LlmCleanupResult(singleCleaned, sections.Count, targetIndexes.Count, SkippedEntireDocument: false);
            }
        }

        int maxBatchChars = fastMode ? FastMaxBatchChars : BalancedMaxBatchChars;
        var batches = BuildBatches(sections, targetIndexes, maxBatchChars);
        var cleanedSections = sections.ToArray();
        int completedBatches = 0;

        foreach (IReadOnlyList<int> batch in batches)
        {
            cancellationToken.ThrowIfCancellationRequested();

            string input = CompressForLlm(ComposeBatchText(sections, batch));
            string prompt = BuildBatchPrompt(input, targets);
            int percentBase = 15 + (int)(completedBatches / (double)batches.Count * 70);

            string cleaned = await GenerateChatStreamingAsync(
                model,
                systemPrompt,
                prompt,
                EstimateNumPredict(input.Length, fastMode),
                EstimateNumCtx(input.Length),
                progress,
                stepTitle,
                percentBase,
                cancellationToken).ConfigureAwait(false);

            cleaned = NormalizeResponse(cleaned);
            cleaned = MarkdownConversionPostProcessor.Apply(cleaned);

            if (LlmContentGuard.IsAcceptable(input, cleaned))
                ApplyBatchResult(cleanedSections, sections, batch, cleaned);

            completedBatches++;
            ReportStep(
                progress,
                3,
                stepTitle,
                15 + (int)(completedBatches / (double)batches.Count * 75),
                $"{completedBatches}/{batches.Count}회 ({batch.Count}구간)");
        }

        ReportStep(progress, 4, "결과 적용", 96, "문서 병합");
        string merged = MergeSections(cleanedSections);
        merged = MarkdownConversionPostProcessor.Apply(merged);
        ReportStep(progress, 4, "완료", 100, $"{targetIndexes.Count}개 구간 ({targetSummary})");

        return new LlmCleanupResult(merged, sections.Count, targetIndexes.Count, SkippedEntireDocument: false);
    }

    private static string BuildSystemPrompt(LlmProcessingTargets targets)
    {
        var parts = new List<string>
        {
            "You fix Korean HWP-converted Markdown.",
        };

        if (targets.HasFlag(LlmProcessingTargets.Tables))
        {
            parts.Add(
                "Build/fix GFM pipe tables: header row (| A | B |), separator (| --- | --- |), matching data rows. " +
                "Fix broken | lines, missing separators, misaligned columns, and HTML <table>.");
        }

        if (targets.HasFlag(LlmProcessingTargets.Headings))
        {
            parts.Add(
                "Fix heading hierarchy with # levels. Convert bold-only lines and outline-number lines that look like headings.");
        }

        if (targets.HasFlag(LlmProcessingTargets.Lists))
        {
            parts.Add(
                "Convert bullet characters (•·) and broken numbered lists to Markdown lists (- or 1.).");
        }

        if (targets.HasFlag(LlmProcessingTargets.HtmlMarkup))
        {
            parts.Add(
                "Convert remaining HTML tags (p, div, br, h1-h6, table) to Markdown. Do not leave raw HTML.");
        }

        var untouched = new List<string>();
        if (!targets.HasFlag(LlmProcessingTargets.Tables))
            untouched.Add("tables");
        if (!targets.HasFlag(LlmProcessingTargets.Headings))
            untouched.Add("headings");
        if (!targets.HasFlag(LlmProcessingTargets.Lists))
            untouched.Add("lists");
        if (!targets.HasFlag(LlmProcessingTargets.HtmlMarkup))
            untouched.Add("HTML markup");

        if (untouched.Count > 0)
            parts.Add($"Do not rewrite {string.Join(", ", untouched)}.");

        parts.Add("Keep every cell value, number, and image path (![...](...)) unchanged.");
        parts.Add("Output Markdown only. No code fences or commentary.");
        return string.Join(' ', parts);
    }

    private static string BuildDocumentPrompt(string markdown, LlmProcessingTargets targets)
    {
        var hints = new List<string> { "다음 HWP 변환 Markdown을 정리하세요." };
        AppendTargetHints(hints, targets, markdown);
        hints.Add("선택하지 않은 요소는 수정하지 마세요.");

        return $"{string.Join(' ', hints)}\n\n---BEGIN---\n{markdown}\n---END---";
    }

    private static string BuildBatchPrompt(string sectionMarkdown, LlmProcessingTargets targets)
    {
        var hints = new List<string> { "이 구간만 정리하세요." };
        AppendTargetHints(hints, targets, sectionMarkdown);
        hints.Add("선택하지 않은 요소는 수정하지 마세요.");

        return $"{string.Join(' ', hints)}\n\n---BEGIN---\n{sectionMarkdown}\n---END---";
    }

    private static void AppendTargetHints(List<string> hints, LlmProcessingTargets targets, string text)
    {
        if (targets.HasFlag(LlmProcessingTargets.Tables))
        {
            hints.Add("표 데이터는 GFM 파이프 표(| 헤더 | + | --- | + 데이터 행)로 만드세요.");
            if (text.Contains("<table", StringComparison.OrdinalIgnoreCase))
                hints.Add("HTML <table>은 GFM 파이프 표로 변환하세요.");
            if (text.Contains('|') && MarkdownLlmAnalyzer.ScoreTableIssues(text) > 0)
                hints.Add("깨진 | 줄·구분선 누락·열 불일치를 복구하세요.");
        }

        if (targets.HasFlag(LlmProcessingTargets.Headings))
            hints.Add("제목 계층(#)을 정리하고 제목처럼 보이는 줄에 #을 부여하세요.");

        if (targets.HasFlag(LlmProcessingTargets.Lists))
            hints.Add("글머리 기호(•)와 번호 목록을 Markdown 목록으로 정리하세요.");

        if (targets.HasFlag(LlmProcessingTargets.HtmlMarkup))
            hints.Add("남아 있는 HTML 태그를 Markdown으로 변환하세요.");
    }

    private static string CompressForLlm(string text) =>
        ExcessBlankLineRegex.Replace(text.Trim(), "\n\n");

    private static int EstimateNumPredict(int inputLength, bool fastMode)
    {
        int cap = fastMode ? FastMaxPredictTokens : BalancedMaxPredictTokens;
        int floor = fastMode ? 384 : 512;
        int estimate = fastMode
            ? inputLength / 2 + 96
            : inputLength + 128;
        return Math.Min(cap, Math.Max(floor, estimate));
    }

    private static int EstimateNumCtx(int inputLength) =>
        Math.Clamp(inputLength / 2 + 768, 1536, 8192);

    private static List<IReadOnlyList<int>> BuildBatches(
        IReadOnlyList<MarkdownSection> sections,
        IReadOnlyList<int> targetIndexes,
        int maxChars)
    {
        var batches = new List<IReadOnlyList<int>>();
        var current = new List<int>();
        int currentChars = 0;

        foreach (int index in targetIndexes)
        {
            int sectionChars = ComposeSectionText(sections[index]).Length;
            if (current.Count > 0 && currentChars + sectionChars + 2 > maxChars)
            {
                batches.Add(current.ToArray());
                current.Clear();
                currentChars = 0;
            }

            current.Add(index);
            currentChars += sectionChars + 2;
        }

        if (current.Count > 0)
            batches.Add(current.ToArray());

        return batches;
    }

    private static string ComposeBatchText(IReadOnlyList<MarkdownSection> sections, IReadOnlyList<int> indexes)
    {
        if (indexes.Count == 1)
            return ComposeSectionText(sections[indexes[0]]);

        var parts = new List<string>(indexes.Count);
        foreach (int index in indexes)
            parts.Add(ComposeSectionText(sections[index]));

        return string.Join("\n\n", parts);
    }

    private static void ApplyBatchResult(
        MarkdownSection[] cleanedSections,
        IReadOnlyList<MarkdownSection> originalSections,
        IReadOnlyList<int> batch,
        string cleaned)
    {
        if (batch.Count == 1)
        {
            cleanedSections[batch[0]] = ParseCleanedSection(originalSections[batch[0]], cleaned);
            return;
        }

        cleanedSections[batch[0]] = ParseCleanedSection(originalSections[batch[0]], cleaned);
        for (int i = 1; i < batch.Count; i++)
            cleanedSections[batch[i]] = originalSections[batch[i]] with { HeadingLine = string.Empty, Body = string.Empty };
    }

    private static string ComposeSectionText(MarkdownSection section)
    {
        if (string.IsNullOrEmpty(section.HeadingLine))
            return section.Body;

        return string.IsNullOrEmpty(section.Body)
            ? section.HeadingLine
            : section.HeadingLine + "\n" + section.Body;
    }

    private static MarkdownSection ParseCleanedSection(MarkdownSection original, string cleaned)
    {
        string[] lines = cleaned.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        if (lines.Length == 0)
            return original with { Body = string.Empty };

        if (lines[0].TrimStart().StartsWith('#'))
            return new MarkdownSection(lines[0], string.Join('\n', lines.Skip(1)).TrimEnd(), original.Index);

        if (!string.IsNullOrEmpty(original.HeadingLine))
            return original with { Body = cleaned.TrimEnd() };

        return new MarkdownSection(string.Empty, cleaned.TrimEnd(), original.Index);
    }

    private static string MergeSections(IReadOnlyList<MarkdownSection> sections)
    {
        var builder = new StringBuilder();
        foreach (MarkdownSection section in sections.OrderBy(s => s.Index))
        {
            if (!string.IsNullOrEmpty(section.HeadingLine))
            {
                if (builder.Length > 0)
                    builder.Append('\n');

                builder.Append(section.HeadingLine);
            }

            if (!string.IsNullOrEmpty(section.Body))
            {
                if (builder.Length > 0)
                    builder.Append('\n');

                builder.Append(section.Body);
            }
        }

        return builder.ToString();
    }

    private static async Task<string> GenerateChatStreamingAsync(
        string model,
        string systemPrompt,
        string userPrompt,
        int numPredict,
        int numCtx,
        IProgress<LlmCleanupProgress>? progress,
        string stepTitle,
        int percentBase,
        CancellationToken cancellationToken)
    {
        string requestJson = JsonSerializer.Serialize(new
        {
            model,
            stream = true,
            keep_alive = KeepAlive,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            options = new
            {
                temperature = 0,
                top_p = 0.9,
                num_predict = numPredict,
                num_ctx = numCtx
            }
        });

        using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
        using var response = await SharedHttp.PostAsync($"{BaseUrl}/api/chat", content, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Ollama 호출에 실패했습니다. (상태 코드 {(int)response.StatusCode})");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        var builder = new StringBuilder();
        int adaptiveEstimate = Math.Max(numPredict / 2, 256);
        long lastProgressTick = 0;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            string? line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
                break;
            if (string.IsNullOrWhiteSpace(line))
                continue;

            using var document = JsonDocument.Parse(line);
            if (document.RootElement.TryGetProperty("message", out JsonElement messageElement) &&
                messageElement.TryGetProperty("content", out JsonElement contentElement))
            {
                string? chunk = contentElement.GetString();
                if (!string.IsNullOrEmpty(chunk))
                    builder.Append(chunk);
            }

            bool done = document.RootElement.TryGetProperty("done", out JsonElement doneElement) &&
                        doneElement.GetBoolean();

            if (builder.Length > adaptiveEstimate)
                adaptiveEstimate = Math.Max(adaptiveEstimate, (int)(builder.Length * 1.2));

            if (builder.Length > 0)
            {
                long now = Environment.TickCount64;
                if (done || now - lastProgressTick >= StreamProgressIntervalMs)
                {
                    lastProgressTick = now;
                    int percent = done
                        ? StreamPercentEnd
                        : StreamPercentStart + (int)(builder.Length / (double)adaptiveEstimate * (StreamPercentEnd - StreamPercentStart));
                    ReportStep(progress, 3, stepTitle, Math.Min(95, percentBase + percent / 10), $"{builder.Length:N0}자");
                }
            }

            if (done)
                break;
        }

        if (builder.Length == 0)
            throw new InvalidOperationException("Ollama 응답이 비어 있습니다.");

        return builder.ToString();
    }

    private static void ReportStep(
        IProgress<LlmCleanupProgress>? progress,
        int step,
        string stepTitle,
        int percent,
        string? detail = null)
    {
        progress?.Report(new LlmCleanupProgress
        {
            Step = step,
            Percent = percent,
            StepTitle = stepTitle,
            Detail = detail
        });
    }

    private static string NormalizeResponse(string response)
    {
        string trimmed = response.Trim();
        var fenceMatch = MarkdownFenceRegex.Match(trimmed);
        if (fenceMatch.Success)
            trimmed = fenceMatch.Groups[1].Value.Trim();

        trimmed = trimmed
            .Replace("---BEGIN---", string.Empty, StringComparison.Ordinal)
            .Replace("---END---", string.Empty, StringComparison.Ordinal)
            .Trim();

        return trimmed;
    }
}

internal sealed record LlmCleanupResult(
    string Markdown,
    int TotalSections,
    int CleanedSections,
    bool SkippedEntireDocument);

internal static class LlmContentGuard
{
    public static bool IsAcceptable(string original, string cleaned)
    {
        if (string.IsNullOrWhiteSpace(cleaned))
            return false;

        if (!ExtractImagePaths(original).SetEquals(ExtractImagePaths(cleaned)))
            return false;

        string orig = StripForContentCompare(original);
        string clean = StripForContentCompare(cleaned);
        if (orig.Length == 0)
            return clean.Length > 0;

        double ratio = clean.Length / (double)orig.Length;
        return ratio is >= 0.90 and <= 1.10;
    }

    private static string StripForContentCompare(string text)
    {
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var builder = new StringBuilder(text.Length);

        foreach (string rawLine in lines)
        {
            string line = rawLine.Trim();
            if (line.Length == 0)
                continue;

            line = Regex.Replace(line, @"^#{1,6}\s+", string.Empty);
            line = Regex.Replace(line, @"^[-*+]\s+", string.Empty);
            line = Regex.Replace(line, @"^\d+[.)]\s+", string.Empty);
            line = Regex.Replace(line, @"<[^>]+>", string.Empty);
            line = line.Replace("|", " ").Replace("**", string.Empty).Replace("__", string.Empty);
            builder.Append(line);
        }

        return Regex.Replace(builder.ToString(), @"\s+", string.Empty);
    }

    private static HashSet<string> ExtractImagePaths(string markdown)
    {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in Regex.Matches(markdown, @"!\[[^\]]*\]\(([^)]+)\)"))
            paths.Add(match.Groups[1].Value.Trim());

        return paths;
    }
}

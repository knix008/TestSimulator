using HWP2DocWinV10.Export;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Services;

/// <summary>
/// 로컬 Ollama 서버를 호출해 변환 Markdown의 문제 구간만 선택적으로 정리합니다.
/// </summary>
internal static class OllamaClient
{
    private const string BaseUrl = "http://localhost:11434";
    private const int StreamPercentStart = 20;
    private const int StreamPercentEnd = 90;
    private const int MaxSectionChars = 6000;

    private static readonly Regex MarkdownFenceRegex = new(
        @"^\s*```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private const string SystemPrompt =
        """
        You repair Markdown formatting produced from Korean HWP documents.
        Fix ONLY these issues when present:
        - missing heading markers (#, ##, ###) on obvious section titles
        - broken GFM pipe tables (split rows, missing separator, empty | | rows)
        - bullet symbols (•, ·) that should be "- " list items
        - HTML headings (<h1>..</h1>) that should become Markdown headings

        Hard rules:
        - Do NOT add, delete, paraphrase, translate, or summarize any words or numbers.
        - Keep every image path (![...](...)) exactly unchanged.
        - Output ONLY the repaired Markdown section. No explanation, no code fences.
        """;

    public static async Task<List<string>> GetModelsAsync(CancellationToken cancellationToken = default)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var response = await http.GetAsync($"{BaseUrl}/api/tags", cancellationToken).ConfigureAwait(false);
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
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("LLM 설정에서 모델 이름을 먼저 입력하세요.");

        if (string.IsNullOrWhiteSpace(markdown))
            return new LlmCleanupResult(markdown, 0, 0, SkippedEntireDocument: false);

        ReportStep(progress, 1, "준비", 5, "규칙 기반 정리");
        string prepared = MarkdownConversionPostProcessor.Apply(markdown);

        ReportStep(progress, 2, "문서 분석", 12, "문제 구간 검색");
        IReadOnlyList<MarkdownSection> sections = MarkdownLlmAnalyzer.SplitSections(prepared);
        if (sections.Count == 0)
            return new LlmCleanupResult(prepared, 0, 0, SkippedEntireDocument: true);

        var targetIndexes = new List<int>();
        for (int i = 0; i < sections.Count; i++)
        {
            if (MarkdownLlmAnalyzer.NeedsCleanup(sections[i]))
                targetIndexes.Add(i);
        }

        if (targetIndexes.Count == 0)
        {
            ReportStep(progress, 4, "완료", 100, "LLM 생략 (규칙 정리로 충분)");
            return new LlmCleanupResult(prepared, sections.Count, 0, SkippedEntireDocument: true);
        }

        var cleanedSections = sections.ToArray();
        int completed = 0;

        foreach (int sectionIndex in targetIndexes)
        {
            cancellationToken.ThrowIfCancellationRequested();

            MarkdownSection section = sections[sectionIndex];
            string input = ComposeSectionText(section);
            string prompt = BuildSectionPrompt(input);
            int percentBase = 15 + (int)(completed / (double)targetIndexes.Count * 70);

            string cleaned = await GenerateChatStreamingAsync(
                model,
                prompt,
                Math.Min(MaxSectionChars, Math.Max(512, input.Length + 256)),
                progress,
                percentBase,
                cancellationToken).ConfigureAwait(false);

            cleaned = NormalizeResponse(cleaned);
            cleaned = MarkdownConversionPostProcessor.Apply(cleaned);

            if (LlmContentGuard.IsAcceptable(input, cleaned))
                cleanedSections[sectionIndex] = ParseCleanedSection(section, cleaned);

            completed++;
            ReportStep(
                progress,
                3,
                "구간 정리",
                15 + (int)(completed / (double)targetIndexes.Count * 75),
                $"{completed}/{targetIndexes.Count} 구간");
        }

        ReportStep(progress, 4, "결과 적용", 96, "문서 병합");
        string merged = MergeSections(cleanedSections);
        merged = MarkdownConversionPostProcessor.Apply(merged);
        ReportStep(progress, 4, "완료", 100, $"{targetIndexes.Count}개 구간 정리");
        return new LlmCleanupResult(merged, sections.Count, targetIndexes.Count, SkippedEntireDocument: false);
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

    private static string BuildSectionPrompt(string sectionMarkdown)
    {
        var issues = new List<string>();
        if (MarkdownLlmAnalyzer.ScoreIssues(sectionMarkdown) >= 4)
            issues.Add("표 형식이 깨져 있을 수 있습니다.");
        if (sectionMarkdown.Contains('<') && sectionMarkdown.Contains('>'))
            issues.Add("HTML 제목 태그가 남아 있을 수 있습니다.");
        if (sectionMarkdown.Contains('•') || sectionMarkdown.Contains('·'))
            issues.Add("글머리 기호(•)가 목록으로 바뀌지 않았을 수 있습니다.");

        string hint = issues.Count == 0
            ? "제목(#) 누락 여부를 확인하세요."
            : string.Join(' ', issues);

        return
            $"""
             다음 Markdown 구간의 서식만 고칩니다. {hint}

             ---BEGIN---
             {sectionMarkdown}
             ---END---
             """;
    }

    private static async Task<string> GenerateChatStreamingAsync(
        string model,
        string userPrompt,
        int numPredict,
        IProgress<LlmCleanupProgress>? progress,
        int percentBase,
        CancellationToken cancellationToken)
    {
        string requestJson = JsonSerializer.Serialize(new
        {
            model,
            stream = true,
            messages = new[]
            {
                new { role = "system", content = SystemPrompt },
                new { role = "user", content = userPrompt }
            },
            options = new
            {
                temperature = 0,
                top_p = 0.9,
                num_predict = numPredict
            }
        });

        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
        using var response = await http.PostAsync($"{BaseUrl}/api/chat", content, cancellationToken)
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
                int percent = done
                    ? StreamPercentEnd
                    : StreamPercentStart + (int)(builder.Length / (double)adaptiveEstimate * (StreamPercentEnd - StreamPercentStart));
                ReportStep(progress, 3, "구간 생성", Math.Min(95, percentBase + percent / 10), $"{builder.Length:N0}자");
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

        string orig = NormalizeForCompare(original);
        string clean = NormalizeForCompare(cleaned);
        if (orig.Length == 0)
            return clean.Length > 0;

        int origChars = CountSignificantChars(orig);
        int cleanChars = CountSignificantChars(clean);
        if (origChars == 0)
            return cleanChars == 0;

        double ratio = cleanChars / (double)origChars;
        if (ratio < 0.92 || ratio > 1.08)
            return false;

        return ExtractImagePaths(original).SetEquals(ExtractImagePaths(cleaned));
    }

    private static string NormalizeForCompare(string text)
        => Regex.Replace(text, @"\s+", string.Empty);

    private static int CountSignificantChars(string text)
    {
        int count = 0;
        foreach (char ch in text)
        {
            if (!char.IsWhiteSpace(ch) && ch is not '#' and not '|' and not '-' and not '*')
                count++;
        }

        return count;
    }

    private static HashSet<string> ExtractImagePaths(string markdown)
    {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in Regex.Matches(markdown, @"!\[[^\]]*\]\(([^)]+)\)"))
            paths.Add(match.Groups[1].Value.Trim());

        return paths;
    }
}

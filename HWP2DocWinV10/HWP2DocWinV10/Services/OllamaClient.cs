using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Services;

/// <summary>
/// 로컬 Ollama 서버를 호출해 변환된 Markdown 전체를 한 번 정리합니다.
/// </summary>
internal static class OllamaClient
{
    private const string BaseUrl = "http://localhost:11434";
    private const int StreamPercentStart = 15;
    private const int StreamPercentEnd = 92;

    private static readonly Regex MarkdownFenceRegex = new(
        @"^\s*```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

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

    public static async Task<string> CleanupMarkdownAsync(
        string markdown,
        string model,
        IProgress<LlmCleanupProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("LLM 설정에서 모델 이름을 먼저 입력하세요.");

        if (string.IsNullOrWhiteSpace(markdown))
            return markdown;

        ReportStep(progress, 1, "준비", 2, "프롬프트 구성");

        string prompt =
            "다음은 HWP 문서에서 변환된 Markdown 전체입니다. 문서 전체의 서식을 정리해 주세요.\n" +
            "- 제목(#, ##, ###), 표(GFM 파이프 테이블), 목록, 이미지 링크, 단락 구분을 올바른 Markdown으로 다듬습니다.\n" +
            "- 본문의 단어, 숫자, 문장 의미를 임의로 추가·삭제·요약·번역·재작성하지 마세요.\n" +
            "- 이미지 경로(![...](...))는 그대로 유지하세요.\n" +
            "- 결과는 정리된 Markdown 문서만 출력하고, 설명·주석·코드블록 표시(```)는 넣지 마세요.\n\n" +
            "---\n" + markdown;

        int estimatedOutputChars = Math.Max((int)(markdown.Length * 1.05), 512);
        string result = await GenerateStreamingAsync(
            model,
            prompt,
            estimatedOutputChars,
            progress,
            cancellationToken).ConfigureAwait(false);

        ReportStep(progress, 4, "결과 적용", 96, "응답 형식 검증");
        string normalized = NormalizeResponse(result);
        ReportStep(progress, 4, "완료", 100);
        return normalized;
    }

    private static async Task<string> GenerateStreamingAsync(
        string model,
        string prompt,
        int estimatedOutputChars,
        IProgress<LlmCleanupProgress>? progress,
        CancellationToken cancellationToken)
    {
        ReportStep(progress, 2, "Ollama 요청", 8, "서버에 연결");

        string requestJson = JsonSerializer.Serialize(new
        {
            model,
            prompt,
            stream = true
        });

        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(15) };
        using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
        using var response = await http.PostAsync($"{BaseUrl}/api/generate", content, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Ollama 호출에 실패했습니다. (상태 코드 {(int)response.StatusCode})");
        }

        ReportStep(progress, 2, "Ollama 요청", 12, "응답 대기");

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        var builder = new StringBuilder();
        int adaptiveEstimate = estimatedOutputChars;
        int lastReportedPercent = -1;
        int lastReportedChars = 0;
        DateTime lastReportTime = DateTime.UtcNow;
        bool streamStepReported = false;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            string? line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
                break;
            if (string.IsNullOrWhiteSpace(line))
                continue;

            using var document = JsonDocument.Parse(line);
            if (document.RootElement.TryGetProperty("response", out JsonElement responseElement))
            {
                string? chunk = responseElement.GetString();
                if (!string.IsNullOrEmpty(chunk))
                    builder.Append(chunk);
            }

            bool done = document.RootElement.TryGetProperty("done", out JsonElement doneElement) &&
                        doneElement.GetBoolean();

            if (builder.Length > adaptiveEstimate)
                adaptiveEstimate = Math.Max(adaptiveEstimate, (int)(builder.Length * 1.15));

            int percent = done
                ? StreamPercentEnd
                : MapStreamPercent(builder.Length, adaptiveEstimate);

            if (!streamStepReported && builder.Length > 0)
            {
                ReportStep(progress, 3, "Markdown 생성", percent, $"{builder.Length:N0}자");
                streamStepReported = true;
                lastReportedPercent = percent;
                lastReportedChars = builder.Length;
                lastReportTime = DateTime.UtcNow;
            }
            else
            {
                bool percentChanged = percent != lastReportedPercent;
                bool charsMilestone = builder.Length - lastReportedChars >= 350;
                bool timeElapsed = (DateTime.UtcNow - lastReportTime).TotalMilliseconds >= 450;

                if (percentChanged || charsMilestone || timeElapsed || done)
                {
                    ReportStep(
                        progress,
                        3,
                        done ? "Markdown 생성 완료" : "Markdown 생성",
                        percent,
                        $"{builder.Length:N0}자 · {percent}%");
                    lastReportedPercent = percent;
                    lastReportedChars = builder.Length;
                    lastReportTime = DateTime.UtcNow;
                }
            }

            if (done)
                break;
        }

        if (builder.Length == 0)
            throw new InvalidOperationException("Ollama 응답이 비어 있습니다.");

        return builder.ToString();
    }

    private static int MapStreamPercent(int generatedChars, int estimatedOutputChars)
    {
        int target = Math.Max(estimatedOutputChars, 1);
        double ratio = Math.Min(1.0, generatedChars / (double)target);
        int percent = StreamPercentStart + (int)(ratio * (StreamPercentEnd - StreamPercentStart));
        return Math.Clamp(percent, StreamPercentStart, StreamPercentEnd);
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

        return trimmed;
    }
}

namespace ReqTrace.Persistence;

public static class LlmConfiguration
{
    public static bool IsConfigured(AppSettings settings) =>
        !string.IsNullOrWhiteSpace(settings.OllamaModel);

    public static bool ShouldUseLlmImport(AppSettings settings) =>
        settings.UseLlmForExcelImport && IsConfigured(settings);
}

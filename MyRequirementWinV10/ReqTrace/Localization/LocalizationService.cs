using System.Globalization;
using ReqTrace.Persistence;

namespace ReqTrace.Localization;

public static class LocalizationService
{
    public const string DefaultLanguage = "ko-KR";
    public const string EnglishLanguage = "en-US";

    public static event EventHandler? LanguageChanged;

    public static CultureInfo CurrentCulture { get; private set; } = new(DefaultLanguage);

    public static bool IsEnglish => CurrentCulture.TwoLetterISOLanguageName == "en";

    public static void Initialize(string? languageCode)
    {
        ApplyCulture(NormalizeLanguageCode(languageCode ?? DefaultLanguage));
    }

    public static void SetLanguage(string languageCode, AppSettings settings)
    {
        var normalized = NormalizeLanguageCode(languageCode);
        if (string.Equals(normalized, settings.Language, StringComparison.OrdinalIgnoreCase)
            && CurrentCulture.Name == normalized)
        {
            return;
        }

        settings.Language = normalized;
        AppSettingsService.Save(settings);
        ApplyCulture(normalized);
        LanguageChanged?.Invoke(null, EventArgs.Empty);
    }

    public static string NormalizeLanguageCode(string languageCode) =>
        languageCode.StartsWith("en", StringComparison.OrdinalIgnoreCase) ? EnglishLanguage : DefaultLanguage;

    private static void ApplyCulture(string languageCode)
    {
        CurrentCulture = languageCode.StartsWith("en", StringComparison.OrdinalIgnoreCase)
            ? new CultureInfo(EnglishLanguage)
            : new CultureInfo(DefaultLanguage);

        Thread.CurrentThread.CurrentUICulture = CurrentCulture;
        CultureInfo.DefaultThreadCurrentUICulture = CurrentCulture;
    }
}

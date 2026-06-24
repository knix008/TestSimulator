using System.Globalization;
using DeskSearch.Resources;

namespace DeskSearch.Services;

public static class LocalizationService
{
    public const string Korean = "ko";
    public const string English = "en";

    public static string CurrentLanguage { get; private set; } = Korean;

    public static event EventHandler? LanguageChanged;

    public static void Apply(string language)
    {
        CurrentLanguage = language == English ? English : Korean;
        var culture = CurrentLanguage == English
            ? new CultureInfo("en-US")
            : new CultureInfo("ko-KR");

        CultureInfo.CurrentUICulture = culture;
        CultureInfo.CurrentCulture = culture;
        CultureInfo.DefaultThreadCurrentUICulture = culture;
        CultureInfo.DefaultThreadCurrentCulture = culture;
        LocStrings.Culture = culture;

        LanguageChanged?.Invoke(null, EventArgs.Empty);
    }

    public static string T(string key) => LocStrings.Get(key);

    public static string F(string key, params object[] args) => LocStrings.Format(key, args);
}

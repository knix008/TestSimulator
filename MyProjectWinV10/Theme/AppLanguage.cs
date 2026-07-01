namespace MyProject.Theme
{
    public enum AppLanguage
    {
        Korean,
        English
    }

    public static class AppLanguageExtensions
    {
        public static string ToStorageCode(this AppLanguage language) =>
            language == AppLanguage.Korean ? "ko" : "en";

        public static AppLanguage Parse(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return AppLanguage.Korean;

            value = value.Trim();
            return value.ToLowerInvariant() switch
            {
                "ko" or "ko-kr" or "korean" or "kr" => AppLanguage.Korean,
                "en" or "en-us" or "english" => AppLanguage.English,
                _ => AppLanguage.Korean
            };
        }

        public static string GetDisplayName(this AppLanguage language, AppLanguage displayIn) =>
            language switch
            {
                AppLanguage.Korean when displayIn == AppLanguage.Korean => "한국어",
                AppLanguage.Korean => "Korean",
                AppLanguage.English when displayIn == AppLanguage.Korean => "English",
                _ => "English"
            };
    }
}

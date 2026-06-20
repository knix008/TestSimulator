namespace ReqTrace.Localization;

public static class Loc
{
    public static string T(string key) => StringResources.Get(key);

    public static string T(string key, params object[] args) => string.Format(T(key), args);

    public static string Enum<TEnum>(TEnum value) where TEnum : struct, Enum =>
        T($"{typeof(TEnum).Name}_{value}");
}

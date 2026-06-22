namespace ReqTrace.Localization;

public static class Loc
{
    public static string T(string key) => StringResources.Get(key);

    public static string T(string key, params object[] args)
    {
        if (args.Length == 0)
            return T(key);

        var formattedArgs = args.Select(PrepareFormatArgument).ToArray();
        return string.Format(T(key), formattedArgs);
    }

    public static string Enum<TEnum>(TEnum value) where TEnum : struct, Enum =>
        T($"{typeof(TEnum).Name}_{value}");

    private static object PrepareFormatArgument(object arg) =>
        arg is string text ? EscapeFormatBraces(text) : arg;

    private static string EscapeFormatBraces(string value) =>
        value.Replace("{", "{{", StringComparison.Ordinal)
            .Replace("}", "}}", StringComparison.Ordinal);
}

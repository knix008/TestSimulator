namespace MyWorkspace.Win;

internal static class StartupArguments
{
    public const string ImportWspSwitch = "--import-wsp";

    public static string? TryGetWspImportPath(string[]? args)
    {
        if (args is not { Length: > 0 })
            return null;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i].Trim('"');
            if (string.Equals(arg, ImportWspSwitch, StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                var path = args[++i].Trim('"');
                return File.Exists(path) ? path : null;
            }

            if (arg.EndsWith(".wsp", StringComparison.OrdinalIgnoreCase) && File.Exists(arg))
                return arg;
        }

        return null;
    }
}

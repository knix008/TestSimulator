using System;
using System.IO;

namespace TerminalWinV10
{
    internal static class LocalShellResolver
    {
        public static string Resolve(string? customPath)
        {
            if (!string.IsNullOrWhiteSpace(customPath))
            {
                var expanded = Environment.ExpandEnvironmentVariables(customPath.Trim());
                if (File.Exists(expanded))
                    return expanded;
            }

            var comspec = Environment.GetEnvironmentVariable("COMSPEC");
            if (!string.IsNullOrWhiteSpace(comspec) && File.Exists(comspec))
                return comspec;

            var system32 = Environment.GetFolderPath(Environment.SpecialFolder.System);
            var cmd = Path.Combine(system32, "cmd.exe");
            if (File.Exists(cmd))
                return cmd;

            return "cmd.exe";
        }

        public static string GetDisplayName(string resolvedPath)
        {
            try { return Path.GetFileName(resolvedPath); }
            catch { return resolvedPath; }
        }
    }
}

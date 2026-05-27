using System;
using System.Text;
using System.Text.RegularExpressions;

namespace TerminalWinV10
{
    internal static class TerminalTextNormalizer
    {
        private static readonly Regex AnsiCsi = new Regex(
            @"\x1B\[[0-?]*[ -/]*[@-~]",
            RegexOptions.Compiled);

        private static readonly Regex AnsiOsc = new Regex(
            @"\x1B\][^\x07]*(\x07|\x1B\\)",
            RegexOptions.Compiled);

        private static readonly Regex AnsiSt = new Regex(
            @"\x1B\\",
            RegexOptions.Compiled);

        public static string Normalize(string text)
        {
            if (string.IsNullOrEmpty(text))
                return string.Empty;

            var s = text.Replace("\r\n", "\n").Replace("\r", string.Empty);
            s = AnsiOsc.Replace(s, string.Empty);
            s = AnsiSt.Replace(s, string.Empty);
            s = AnsiCsi.Replace(s, string.Empty);

            if (s.IndexOf('\b') >= 0)
                s = ApplyBackspace(s);

            s = s.Replace("\t", "    ");
            return s;
        }

        private static string ApplyBackspace(string s)
        {
            if (string.IsNullOrEmpty(s))
                return s;

            var sb = new StringBuilder(s.Length);
            foreach (var ch in s)
            {
                if (ch == '\b')
                {
                    if (sb.Length > 0)
                        sb.Length--;
                    continue;
                }
                sb.Append(ch);
            }
            return sb.ToString();
        }
    }
}


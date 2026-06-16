using System.Reflection;

namespace MyProject
{
    public static class AppVersion
    {
        public static string DisplayVersion
        {
            get
            {
                var asm = Assembly.GetExecutingAssembly();

                if (TryNormalize(asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion, out string informational))
                    return informational;

                if (TryNormalize(Application.ProductVersion, out string product))
                    return product;

                if (TryNormalize(asm.GetCustomAttribute<AssemblyFileVersionAttribute>()?.Version, out string file))
                    return file;

                var assemblyVersion = asm.GetName().Version?.ToString();
                if (TryNormalize(assemblyVersion, out string asmVer))
                    return asmVer;

                return "1.0.0";
            }
        }

        private static bool TryNormalize(string? value, out string result)
        {
            result = "";
            if (string.IsNullOrWhiteSpace(value))
                return false;

            value = value.Trim();
            int plus = value.IndexOf('+');
            if (plus > 0)
                value = value[..plus];

            if (value is "0.0.0.0" or "0.0.0")
                return false;

            result = value;
            return true;
        }
    }
}

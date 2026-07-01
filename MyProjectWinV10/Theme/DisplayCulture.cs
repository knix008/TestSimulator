using System.Globalization;

namespace MyProject.Theme
{
    public static class DisplayCulture
    {
        public static CultureInfo Current => AppLocalizer.CurrentCulture;

        public static CultureInfo English => CultureInfo.GetCultureInfo("en-US");
    }
}

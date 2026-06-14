using System.ComponentModel;

namespace MyProject
{
    /// <summary>
    /// Detects Visual Studio WinForms designer / design-tool-server hosting.
    /// </summary>
    internal static class DesignTime
    {
        internal static bool IsActive =>
            LicenseManager.UsageMode == LicenseUsageMode.Designtime;
    }
}

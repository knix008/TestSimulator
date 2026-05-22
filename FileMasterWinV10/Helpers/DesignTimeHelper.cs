using System.ComponentModel;
using System.Reflection;

namespace FileMasterWinV10.Helpers;

internal static class DesignTimeHelper
{
    /// <summary>Visual Studio WinForms 디자이너에서 실행 중인지 여부.</summary>
    public static bool IsDesignTime =>
        LicenseManager.UsageMode == LicenseUsageMode.Designtime
        || Assembly.GetEntryAssembly() == null;
}

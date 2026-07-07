using Microsoft.Win32;
using System.Runtime.InteropServices;

namespace DCMViewer;

internal static class FileAssociationHelper
{
    public const string Extension = ".dcm";
    public const string ProgId = "DCMViewer.dcm";
    public const string FileTypeDescription = "DICOM Image";

    private const string AssociationMarkerKey = @"Software\TestSimulator\DCMViewer";
    private const string AssociationMarkerName = "DcmFileAssociation";

    public static bool IsRegistered()
    {
        using var extKey = Registry.CurrentUser.OpenSubKey($@"Software\Classes\{Extension}");
        if (extKey?.GetValue(null) as string != ProgId)
            return false;

        using var progKey = Registry.CurrentUser.OpenSubKey($@"Software\Classes\{ProgId}\shell\open\command");
        var command = progKey?.GetValue(null) as string;
        return !string.IsNullOrWhiteSpace(command)
               && command.Contains(GetExecutablePath(), StringComparison.OrdinalIgnoreCase);
    }

    public static void Register()
    {
        var exePath = GetExecutablePath();
        var iconPath = GetFileTypeIconPath();

        using (var extKey = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{Extension}"))
            extKey.SetValue(null, ProgId);

        using (var progKey = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProgId}"))
        {
            progKey.SetValue(null, FileTypeDescription);

            using var iconKey = progKey.CreateSubKey("DefaultIcon");
            iconKey.SetValue(null, $"\"{iconPath}\",0");

            using var commandKey = progKey.CreateSubKey(@"shell\open\command");
            commandKey.SetValue(null, $"\"{exePath}\" \"%1\"");
        }

        using var markerKey = Registry.CurrentUser.CreateSubKey(AssociationMarkerKey);
        markerKey.SetValue(AssociationMarkerName, 1, RegistryValueKind.DWord);

        NotifyAssociationChanged();
    }

    public static void Unregister()
    {
        Registry.CurrentUser.DeleteSubKeyTree($@"Software\Classes\{Extension}", throwOnMissingSubKey: false);
        Registry.CurrentUser.DeleteSubKeyTree($@"Software\Classes\{ProgId}", throwOnMissingSubKey: false);

        using var markerKey = Registry.CurrentUser.OpenSubKey(AssociationMarkerKey, writable: true);
        markerKey?.DeleteValue(AssociationMarkerName, throwOnMissingValue: false);

        NotifyAssociationChanged();
    }

    public static bool TrySetAsDefault(out string? errorMessage)
    {
        errorMessage = null;

        if (!IsRegistered())
            Register();

        var result = AssocSetAppAsDefault(ProgId, Extension, ASSOCIATIONTYPE.AT_FILEEXTENSION);
        if (result == 0)
        {
            NotifyAssociationChanged();
            return true;
        }

        errorMessage = result switch
        {
            unchecked((int)0x800704C7) => "사용자가 기본 프로그램 변경을 취소했습니다.",
            _ => $"기본 프로그램 설정에 실패했습니다. (오류 코드: 0x{result:X8})",
        };
        return false;
    }

    public static string GetExecutablePath() =>
        Application.ExecutablePath;

    public static string GetFileTypeIconPath()
    {
        var dcmIcon = Path.Combine(AppContext.BaseDirectory, "Assets", "DcmFile.ico");
        return File.Exists(dcmIcon) ? dcmIcon : GetExecutablePath();
    }

    public static Icon? LoadAppIcon()
    {
        var appIcon = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
        if (File.Exists(appIcon))
            return new Icon(appIcon);

        return Icon.ExtractAssociatedIcon(GetExecutablePath());
    }

    private static void NotifyAssociationChanged()
    {
        SHChangeNotify(SHCNE.SHCNE_ASSOCCHANGED, SHCNF.SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
    }

    private enum ASSOCIATIONTYPE
    {
        AT_FILEEXTENSION = 1,
        AT_URLPROTOCOL = 2,
        AT_STARTMENUCLIENT = 3,
    }

    private enum SHCNE : uint
    {
        SHCNE_ASSOCCHANGED = 0x08000000,
    }

    [Flags]
    private enum SHCNF : uint
    {
        SHCNF_IDLIST = 0x0000,
    }

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int AssocSetAppAsDefault(string pszAppRegistryName, string pszSet, ASSOCIATIONTYPE atSet);

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(SHCNE wEventId, SHCNF uFlags, IntPtr dwItem1, IntPtr dwItem2);
}

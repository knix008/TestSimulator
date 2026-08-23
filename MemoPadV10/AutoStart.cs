using System.Runtime.InteropServices;
using System.Text;

namespace MemoPadV10;

/// <summary>
/// 현재 사용자 기준(HKCU Run)으로 Windows 시작 시 자동 실행을 켜고 끕니다.
/// Microsoft.Win32.Registry 어셈블리 없이 advapi32 P/Invoke만 사용해
/// 설치본에서 FileNotFoundException이 나지 않게 합니다.
/// </summary>
internal static class AutoStart
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "MemoPadV10";

    private const uint HkeyCurrentUser = 0x80000001;
    private const uint KeyRead = 0x20019;
    private const uint KeyWrite = 0x20006;
    private const uint RegOptionNonVolatile = 0;
    private const uint RegSz = 1;
    private const int ErrorSuccess = 0;
    private const int ErrorFileNotFound = 2;

    /// <summary>시스템 시작 시 트레이만 표시하도록 하는 실행 인자.</summary>
    public const string StartupArg = "--autostart";

    private static string ExecutablePath =>
        Environment.ProcessPath ?? Application.ExecutablePath;

    public static string BuildRunCommand() =>
        $"\"{ExecutablePath}\" {StartupArg}";

    public static bool IsEnabled()
    {
        try
        {
            int open = RegOpenKeyEx(HkeyCurrentUser, RunKeyPath, 0, KeyRead, out nint key);
            if (open != ErrorSuccess || key == nint.Zero)
            {
                return false;
            }

            try
            {
                uint type = 0;
                uint dataSize = 0;
                int query = RegQueryValueEx(key, ValueName, nint.Zero, ref type, nint.Zero, ref dataSize);
                return query == ErrorSuccess && dataSize > 0;
            }
            finally
            {
                RegCloseKey(key);
            }
        }
        catch
        {
            return false;
        }
    }

    public static void SetEnabled(bool enabled)
    {
        try
        {
            int create = RegCreateKeyEx(
                HkeyCurrentUser,
                RunKeyPath,
                0,
                null,
                RegOptionNonVolatile,
                KeyWrite,
                nint.Zero,
                out nint key,
                out _);
            if (create != ErrorSuccess || key == nint.Zero)
            {
                return;
            }

            try
            {
                if (enabled)
                {
                    byte[] data = Encoding.Unicode.GetBytes(BuildRunCommand() + '\0');
                    RegSetValueEx(key, ValueName, 0, RegSz, data, (uint)data.Length);
                }
                else
                {
                    int delete = RegDeleteValue(key, ValueName);
                    if (delete != ErrorSuccess && delete != ErrorFileNotFound)
                    {
                        // ignore
                    }
                }
            }
            finally
            {
                RegCloseKey(key);
            }
        }
        catch
        {
            // 자동 실행 설정 실패는 치명적이지 않으므로 무시합니다.
        }
    }

    /// <summary>
    /// 자동 실행이 켜져 있으면 실행 파일 경로와 <see cref="StartupArg"/>를 최신 값으로 다시 씁니다.
    /// </summary>
    public static void RefreshRegisteredCommandIfEnabled()
    {
        if (IsEnabled())
        {
            SetEnabled(true);
        }
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegOpenKeyEx(
        uint hKey,
        string lpSubKey,
        uint ulOptions,
        uint samDesired,
        out nint phkResult);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegCreateKeyEx(
        uint hKey,
        string lpSubKey,
        uint Reserved,
        string? lpClass,
        uint dwOptions,
        uint samDesired,
        nint lpSecurityAttributes,
        out nint phkResult,
        out uint lpdwDisposition);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegQueryValueEx(
        nint hKey,
        string lpValueName,
        nint lpReserved,
        ref uint lpType,
        nint lpData,
        ref uint lpcbData);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegSetValueEx(
        nint hKey,
        string lpValueName,
        uint Reserved,
        uint dwType,
        byte[] lpData,
        uint cbData);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegDeleteValue(nint hKey, string lpValueName);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern int RegCloseKey(nint hKey);
}

using Microsoft.Win32;

namespace MemoPadV10;

/// <summary>
/// 현재 사용자 기준(HKCU Run)으로 Windows 시작 시 자동 실행을 켜고 끕니다.
/// 관리자 권한이 필요 없으며, 로그인한 사용자에게만 적용됩니다.
/// </summary>
internal static class AutoStart
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "MemoPadV10";

    private static string ExecutablePath =>
        Environment.ProcessPath ?? Application.ExecutablePath;

    public static bool IsEnabled()
    {
        try
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false);
            return key?.GetValue(ValueName) is string;
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
            using RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKeyPath, true);
            if (enabled)
            {
                key.SetValue(ValueName, $"\"{ExecutablePath}\"");
            }
            else if (key.GetValue(ValueName) != null)
            {
                key.DeleteValue(ValueName, false);
            }
        }
        catch
        {
            // 자동 실행 설정 실패는 치명적이지 않으므로 무시합니다.
        }
    }
}

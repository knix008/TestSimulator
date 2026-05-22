using System.ComponentModel;
using System.Reflection;

namespace FileMasterWinV10.Helpers;

public static class AppIconHelper
{
    public static string? FindIconPath()
    {
        foreach (var dir in new[]
        {
            AppContext.BaseDirectory,
            AppDomain.CurrentDomain.BaseDirectory,
            Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "",
        })
        {
            if (string.IsNullOrEmpty(dir)) continue;
            var path = Path.Combine(dir, "daemon_hammer.ico");
            if (File.Exists(path))
                return path;
        }
        return FindProjectIconPath();
    }

    /// <summary>디자이너가 실행 파일 폴더가 아닌 프로젝트 루트에서 ico를 찾도록 합니다.</summary>
    public static string? FindProjectIconPath()
    {
        try
        {
            var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            for (int i = 0; i < 10 && dir != null; i++, dir = dir.Parent)
            {
                var path = Path.Combine(dir.FullName, "daemon_hammer.ico");
                if (File.Exists(path))
                    return path;
            }
        }
        catch { }
        return null;
    }

    public static void TryApplyFormIcon(Form form)
    {
        try
        {
            var path = FindIconPath();
            if (path == null) return;
            form.Icon?.Dispose();
            form.Icon = new Icon(path);
        }
        catch
        {
            // 디자이너/런타임 모두 아이콘 실패 시 기본 아이콘 유지
        }
    }

    public static bool IsDesignMode(Control? control)
    {
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return true;
        return control?.Site?.DesignMode == true;
    }
}

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
            var path = Path.Combine(dir, "app_icon.ico");
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
                var path = Path.Combine(dir.FullName, "app_icon.ico");
                if (File.Exists(path))
                    return path;
            }
        }
        catch { }
        return null;
    }

    /// <summary>애플리케이션 아이콘을 지정 크기 비트맵으로 반환한다(없으면 null).</summary>
    public static Image? GetAppIconImage(int size)
    {
        try
        {
            var path = FindIconPath();
            if (path == null) return null;
            using var icon = new Icon(path, new Size(size, size));
            return icon.ToBitmap();
        }
        catch { return null; }
    }

    public static void TryApplyFormIcon(Form form)
    {
        try
        {
            var path = FindIconPath();
            if (path == null) return;
            // 이전 아이콘을 dispose하지 않는다: 아이콘을 지정하지 않은 폼의 Icon 게터는
            // WinForms 공유 기본 아이콘을 반환하므로, 이를 dispose하면 이후 다른 폼이
            // 표시될 때 ObjectDisposedException으로 크래시한다.
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

using System.Diagnostics;
using System.IO;

namespace DeskSearch.Services;

internal static class AppStoragePaths
{
    public static string DataFolder =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "DeskSearch");

    public static void OpenDataFolderInExplorer()
    {
        Directory.CreateDirectory(DataFolder);
        Process.Start(new ProcessStartInfo
        {
            FileName = DataFolder,
            UseShellExecute = true
        });
    }
}

namespace FileMasterWinV10.Models;

public class FileEntry
{
    public string Name { get; set; } = "";
    public string FullPath { get; set; } = "";
    public bool IsDirectory { get; set; }
    public long Size { get; set; }
    public DateTime LastModified { get; set; }
    public string Extension { get; set; } = "";
    public FileAttributes Attributes { get; set; }

    public string SizeDisplay => IsDirectory ? "<DIR>" : FormatSize(Size);
    public string TypeDisplay => IsDirectory ? "폴더" : (Extension.Length > 1 ? Extension[1..].ToUpper() + " 파일" : "파일");

    public static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        if (bytes < 1024L * 1024 * 1024) return $"{bytes / (1024.0 * 1024):F1} MB";
        return $"{bytes / (1024.0 * 1024 * 1024):F1} GB";
    }
}

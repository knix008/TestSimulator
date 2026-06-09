using System.Text;
using System.Text.RegularExpressions;

namespace MDMakerWinV10;

public enum FileSortOrder { NameAsc, NameDesc, DateNewest, DateOldest, Custom }

public class MergeOptions
{
    public string SourceDirectory { get; set; } = "";
    public bool Recursive { get; set; } = true;
    public FileSortOrder SortOrder { get; set; } = FileSortOrder.NameAsc;
    public string[] ExcludePatterns { get; set; } = [];
    public string OutputFile { get; set; } = "";
}

public static class MdMerger
{
    public static List<string> GetFiles(MergeOptions opts)
    {
        if (!Directory.Exists(opts.SourceDirectory)) return [];

        var search = opts.Recursive ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
        var files = Directory.EnumerateFiles(opts.SourceDirectory, "*.md", search).ToList();

        if (opts.ExcludePatterns.Length > 0)
            files = files.Where(f => !IsExcluded(f, opts.SourceDirectory, opts.ExcludePatterns)).ToList();

        return opts.SortOrder switch
        {
            FileSortOrder.NameAsc    => [.. files.OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)],
            FileSortOrder.NameDesc   => [.. files.OrderByDescending(Path.GetFileName, StringComparer.OrdinalIgnoreCase)],
            FileSortOrder.DateNewest => [.. files.OrderByDescending(File.GetLastWriteTime)],
            FileSortOrder.DateOldest => [.. files.OrderBy(File.GetLastWriteTime)],
            FileSortOrder.Custom     => files,
            _                        => [.. files.OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)],
        };
    }

    public static string Merge(IReadOnlyList<string> files, MergeOptions opts)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < files.Count; i++)
        {
            sb.AppendLine(File.ReadAllText(files[i], Encoding.UTF8).TrimEnd());
            if (i < files.Count - 1)
            {
                sb.AppendLine();
                sb.AppendLine("---");
                sb.AppendLine();
            }
        }
        return sb.ToString();
    }

    private static bool IsExcluded(string filePath, string baseDir, string[] patterns)
    {
        var rel = Path.GetRelativePath(baseDir, filePath);
        var segments = rel.Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar]);
        foreach (var raw in patterns)
        {
            var p = raw.Trim();
            if (string.IsNullOrEmpty(p)) continue;
            if (segments.Any(seg => GlobMatch(seg, p))) return true;
        }
        return false;
    }

    private static bool GlobMatch(string text, string pattern)
    {
        var rx = "^" + Regex.Escape(pattern).Replace(@"\*", ".*").Replace(@"\?", ".") + "$";
        return Regex.IsMatch(text, rx, RegexOptions.IgnoreCase);
    }
}

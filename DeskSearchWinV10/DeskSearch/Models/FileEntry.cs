namespace DeskSearch.Models;

public sealed record FileEntry(string FullPath, string FileName, string Directory, bool IsDirectory = false);

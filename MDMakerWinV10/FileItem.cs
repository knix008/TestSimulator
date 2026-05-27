namespace MDMakerWinV10;

public class FileItem
{
    public string FullPath { get; }
    private readonly string _baseDir;

    public FileItem(string fullPath, string baseDir)
    {
        FullPath = fullPath;
        _baseDir = baseDir;
    }

    public override string ToString() => Path.GetRelativePath(_baseDir, FullPath);
}

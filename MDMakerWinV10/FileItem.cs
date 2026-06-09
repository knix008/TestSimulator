namespace MDMakerWinV10;

public class FileItem
{
    public string FullPath { get; }

    public FileItem(string fullPath) => FullPath = fullPath;

    public override string ToString() => Path.GetFileName(FullPath);
}

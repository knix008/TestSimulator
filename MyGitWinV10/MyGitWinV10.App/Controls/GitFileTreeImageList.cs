using System.Drawing.Drawing2D;
using System.Drawing.Text;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Controls;

public enum GitFileTreeIconIndex
{
    Folder = 0,
    FolderChanged,
    File,
    FileUntracked,
    FileModified,
    FileDeleted,
    FileAdded,
    FileStaged,
    FileRenamed,
    FileMixed
}

public sealed class GitFileTreeImageList : IDisposable
{
    private const int IconSize = 16;

    private readonly ImageList _imageList = new()
    {
        ColorDepth = ColorDepth.Depth32Bit,
        ImageSize = new Size(IconSize, IconSize)
    };

    public GitFileTreeImageList()
    {
        foreach (GitFileTreeIconIndex icon in Enum.GetValues<GitFileTreeIconIndex>())
        {
            _imageList.Images.Add(CreateIcon(icon));
        }
    }

    public ImageList ImageList => _imageList;

    public void Attach(TreeView treeView)
    {
        treeView.ImageList = _imageList;
        treeView.ItemHeight = Math.Max(
            _imageList.ImageSize.Height + 4,
            TextRenderer.MeasureText("Ag", treeView.Font).Height + 2);
    }

    public int GetImageIndex(bool isDirectory, PathGitStatus? status)
    {
        if (status is null || !status.HasChanges)
        {
            return (int)(isDirectory ? GitFileTreeIconIndex.Folder : GitFileTreeIconIndex.File);
        }

        if (isDirectory)
        {
            return (int)GitFileTreeIconIndex.FolderChanged;
        }

        return (int)status.GetFileIconIndex();
    }

    public void Dispose()
    {
        _imageList.Dispose();
    }

    private static Bitmap CreateIcon(GitFileTreeIconIndex icon)
    {
        Image baseImage = icon switch
        {
            GitFileTreeIconIndex.Folder or GitFileTreeIconIndex.FolderChanged => IconFactory.Folder(IconSize),
            _ => IconFactory.File(IconSize)
        };

        var bitmap = new Bitmap(IconSize, IconSize);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.FromArgb(250, 250, 251));
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            graphics.DrawImage(baseImage, 0, 0, IconSize, IconSize);
        }

        baseImage.Dispose();

        return icon switch
        {
            GitFileTreeIconIndex.FolderChanged => AddBadge(bitmap, Color.FromArgb(37, 99, 235), null),
            GitFileTreeIconIndex.FileUntracked => AddBadge(bitmap, Color.FromArgb(5, 150, 105), "?"),
            GitFileTreeIconIndex.FileModified => AddBadge(bitmap, Color.FromArgb(37, 99, 235), "M"),
            GitFileTreeIconIndex.FileDeleted => AddBadge(bitmap, Color.FromArgb(220, 38, 38), "D"),
            GitFileTreeIconIndex.FileAdded => AddBadge(bitmap, Color.FromArgb(5, 150, 105), "A"),
            GitFileTreeIconIndex.FileStaged => AddBadge(bitmap, Color.FromArgb(124, 58, 237), "+"),
            GitFileTreeIconIndex.FileRenamed => AddBadge(bitmap, Color.FromArgb(37, 99, 235), "R"),
            GitFileTreeIconIndex.FileMixed => AddBadge(bitmap, Color.FromArgb(217, 119, 6), "~"),
            _ => bitmap
        };
    }

    private static Bitmap AddBadge(Bitmap baseBitmap, Color badgeColor, string? letter)
    {
        using var graphics = Graphics.FromImage(baseBitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

        var badgeRect = new RectangleF(9, 9, 6.5f, 6.5f);
        using (var badgeBrush = new SolidBrush(badgeColor))
        {
            graphics.FillEllipse(badgeBrush, badgeRect);
        }

        if (string.IsNullOrEmpty(letter))
        {
            return baseBitmap;
        }

        using var textBrush = new SolidBrush(Color.White);
        using var font = new Font("Segoe UI", 5.5f, FontStyle.Bold, GraphicsUnit.Point);
        var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };
        graphics.DrawString(letter, font, textBrush, badgeRect, format);
        return baseBitmap;
    }
}

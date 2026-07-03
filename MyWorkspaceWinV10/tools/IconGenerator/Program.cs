using System.Drawing.Imaging;

namespace IconGenerator;

internal static class Program
{
    private static readonly string AssetsRoot = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "MyWorkspace.Win", "Assets"));

    private static readonly (int Size, string[] Names)[] IconSets =
    [
        (16,
        [
            "h1", "h2", "h3", "h4", "h5", "h6",
            "bold", "italic", "strike", "code", "codeblock", "link", "image", "attach", "ul", "ol", "quote", "hr", "table",
            "undo", "redo", "outline", "info",
            "save", "history", "refresh", "search", "login", "logout", "exit", "file", "preferences", "export",
            "folder_plus_workspace", "folder_plus_sub", "page_plus", "rename", "delete",
            "members", "users", "database", "email", "profile", "password", "bell", "star", "log", "copy", "cut", "paste", "selectall", "lock", "unlock",
            "workspace", "workspace_fav", "workspace_locked", "workspace_fav_locked", "favorite", "page", "page_locked"
        ]),
        (20,
        [
            "h1", "h2", "h3", "h4", "h5", "h6",
            "bold", "italic", "strike", "code", "codeblock", "link", "image", "attach", "ul", "ol", "quote", "hr", "table",
            "undo", "redo", "outline", "info",
            "save", "page", "file", "export", "history", "log"
        ]),
        (28,
        [
            "h1", "h2", "h3", "h4", "h5", "h6",
            "bold", "italic", "strike", "code", "codeblock", "link", "image", "attach", "ul", "ol", "quote", "hr", "table",
            "undo", "redo", "outline", "info",
            "save", "page", "file", "export", "history", "log"
        ])
    ];

    private static int Main()
    {
        var iconsRoot = Path.Combine(AssetsRoot, "Icons");
        Directory.CreateDirectory(iconsRoot);

        RemoveLegacyFolders(iconsRoot);

        var generated = 0;
        foreach (var (size, names) in IconSets)
        {
            var folder = Path.Combine(iconsRoot, SizeFolder(size));
            Directory.CreateDirectory(folder);

            foreach (var name in names)
            {
                var path = Path.Combine(folder, $"{name}.png");
                using var bitmap = IconDrawing.Draw(name, size);
                bitmap.Save(path, ImageFormat.Png);
                generated++;
                Console.WriteLine($"Generated {path}");
            }
        }

        var appIconPath = Path.Combine(AssetsRoot, "app.ico");
        using var icon16 = IconDrawing.AppIcon(16);
        using var icon32 = IconDrawing.AppIcon(32);
        using var icon48 = IconDrawing.AppIcon(48);
        using var icon64 = IconDrawing.AppIcon(64);
        using var icon128 = IconDrawing.AppIcon(128);
        using var icon256 = IconDrawing.AppIcon(256);
        IcoWriter.Save(appIconPath, icon16, icon32, icon48, icon64, icon128, icon256);
        Console.WriteLine($"Generated {appIconPath}");

        var wspIconPath = Path.Combine(AssetsRoot, "wsp.ico");
        using var wsp16 = IconDrawing.WspFile(16);
        using var wsp32 = IconDrawing.WspFile(32);
        using var wsp48 = IconDrawing.WspFile(48);
        using var wsp64 = IconDrawing.WspFile(64);
        using var wsp128 = IconDrawing.WspFile(128);
        using var wsp256 = IconDrawing.WspFile(256);
        IcoWriter.Save(wspIconPath, wsp16, wsp32, wsp48, wsp64, wsp128, wsp256);
        Console.WriteLine($"Generated {wspIconPath}");

        Console.WriteLine($"Done. Generated {generated} PNG icons, app.ico, and wsp.ico in {AssetsRoot}.");
        return 0;
    }

    private static string SizeFolder(int size) => $"s{size}";

    private static void RemoveLegacyFolders(string iconsRoot)
    {
        foreach (var legacy in new[] { "16", "20" })
        {
            var path = Path.Combine(iconsRoot, legacy);
            if (!Directory.Exists(path))
                continue;

            Directory.Delete(path, recursive: true);
            Console.WriteLine($"Removed legacy folder {path}");
        }
    }
}

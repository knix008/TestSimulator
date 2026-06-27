using ImageRembgWinV10.Resources;

var assetsDirectory = args.Length > 0
    ? args[0]
    : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Assets"));

Directory.CreateDirectory(assetsDirectory);

var pngPath = Path.Combine(assetsDirectory, "AppIcon.png");
var icoPath = Path.Combine(assetsDirectory, "AppIcon.ico");

AppIconRenderer.SavePng(pngPath);
AppIconRenderer.SaveIco(icoPath);

Console.WriteLine($"Created {pngPath}");
Console.WriteLine($"Created {icoPath}");

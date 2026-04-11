using System.Reflection;

namespace YOLO26BrainV10.Services;

internal static class EmbeddedAssets
{
    private const string CocoResourceName = "YOLO26BrainV10.Assets.coco80_labels_comma.txt";

    internal static string ReadCoco80LabelsComma()
    {
        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream(CocoResourceName)
                           ?? throw new InvalidOperationException(
                               $"Embedded resource not found: {CocoResourceName}. Available: {string.Join(", ", asm.GetManifestResourceNames())}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().Trim();
    }
}

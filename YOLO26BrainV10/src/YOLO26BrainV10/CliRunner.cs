using System.Drawing.Imaging;
using YOLO26BrainV10.Inference;

namespace YOLO26BrainV10;

internal static class CliRunner
{
    private static readonly string[] DefaultLabels = { "negative", "positive" };

    public static int Run(string[] args)
    {
        var model = GetArg(args, "--model", "-m");
        var input = GetArg(args, "--input", "-i");
        if (string.IsNullOrEmpty(model) || string.IsNullOrEmpty(input))
        {
            Console.Error.WriteLine("Required: --model <file.onnx> --input <file|folder>");
            return 1;
        }

        var output = GetArg(args, "--output", "-o");
        var confStr = GetArg(args, "--conf", "-c");
        var conf = float.TryParse(confStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var c) ? c : 0.25f;
        var labelsArg = GetArg(args, "--labels", "-l");
        var labels = string.IsNullOrWhiteSpace(labelsArg)
            ? DefaultLabels
            : labelsArg.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

        if (!File.Exists(model))
        {
            Console.Error.WriteLine($"Model not found: {model}");
            return 1;
        }

        var paths = CollectInputs(input);
        if (paths.Count == 0)
        {
            Console.Error.WriteLine("No images found (.png, .jpg, .jpeg, .bmp).");
            return 1;
        }

        var outDir = !string.IsNullOrEmpty(output)
            ? output
            : Path.Combine(Path.GetDirectoryName(Path.GetFullPath(paths[0])) ?? ".", "brain_yolo_out");
        Directory.CreateDirectory(outDir);

        using var session = new BrainYolo26Session(model, labels);
        Console.WriteLine($"Execution: {session.ExecutionProviderSummary}");
        Console.WriteLine($"Input size: {session.NetSize}, classes: {string.Join(", ", labels)}");

        foreach (var path in paths)
        {
            try
            {
                using var bmp = new Bitmap(path);
                var (annotated, dets) = session.Detect(bmp, conf);
                using (annotated)
                {
                    var name = Path.GetFileNameWithoutExtension(path) + "_yolo.png";
                    var dest = Path.Combine(outDir, name);
                    annotated.Save(dest, ImageFormat.Png);
                    Console.WriteLine($"{path} -> {dest} ({dets.Count} detection(s))");
                    for (var i = 0; i < dets.Count; i++)
                    {
                        var d = dets[i];
                        Console.WriteLine($"  [{i}] {d.Label} p={d.Confidence:0.###} box=({d.Box.Left:0},{d.Box.Top:0})-({d.Box.Right:0},{d.Box.Bottom:0})");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"{path}: {ex.Message}");
            }
        }

        return 0;
    }

    private static bool HasFlag(string[] args, params string[] flags) =>
        args.Any(a => flags.Contains(a, StringComparer.OrdinalIgnoreCase));

    internal static bool WantsConsoleMode(string[] args) =>
        args.Length > 0 && (HasFlag(args, "--model", "-m") || HasFlag(args, "--help", "-h"));

    internal static void PrintHelp()
    {
        Console.WriteLine("""
            YOLO11 (Ultralytics) brain slice segmentation or detection via ONNX.

            GUI: run with no arguments.

            Console:
              YOLO26BrainV10 --model <brain.onnx> --input <file|folder> [--output dir] [--conf 0.25] [--labels a,b,c]

            --labels default: negative,positive (Ultralytics brain-tumor.yaml order). Must match your exported model.
            Segmentation ONNX: export a YOLO11n-seg (or compatible) model with ultralytics model.export(format="onnx").
            """);
    }

    private static string? GetArg(string[] args, string longName, string shortName)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], longName, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(args[i], shortName, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }

        return null;
    }

    private static List<string> CollectInputs(string input)
    {
        var list = new List<string>();
        var ext = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff" };
        if (File.Exists(input))
        {
            list.Add(Path.GetFullPath(input));
            return list;
        }

        if (!Directory.Exists(input))
            return list;

        foreach (var f in Directory.EnumerateFiles(input))
        {
            if (ext.Contains(Path.GetExtension(f)))
                list.Add(Path.GetFullPath(f));
        }

        list.Sort(StringComparer.OrdinalIgnoreCase);
        return list;
    }
}

using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using YOLO26BrainV20.Inference;
using YOLO26BrainV20.Services;

namespace YOLO26BrainV20;

internal static class CliRunner
{
    public static int Run(string[] args)
    {
        if (HasFlag(args, "--smoke-test"))
            return RunSmokeTest(args);

        var model = GetArg(args, "--model", "-m");
        var input = GetArg(args, "--input", "-i");
        if (string.IsNullOrEmpty(model) || string.IsNullOrEmpty(input))
        {
            Console.Error.WriteLine("Required: --model <file.onnx> --input <file|folder>");
            return 1;
        }

        var output = GetArg(args, "--output", "-o");
        var confStr = GetArg(args, "--conf", "-c");
        var conf = float.TryParse(confStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var c)
            ? c
            : (float)BrainCtInferenceDefaults.RecommendedMinConfidence;
        var labelsArg = GetArg(args, "--labels", "-l");
        var labels = ParseLabelsArg(labelsArg);

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
        Console.WriteLine(labels.Length > 0
            ? $"Input size: {session.NetSize}, class names: {string.Join(", ", labels)}"
            : $"Input size: {session.NetSize}, class names: (none — using class_N from ONNX)");

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

    /// <summary>
    /// Loads ONNX, runs one Detect on a sample or synthetic image, prints timing and up to 5 boxes. Exit 0 if no exception.
    /// </summary>
    private static int RunSmokeTest(string[] args)
    {
        var model = GetArg(args, "--model", "-m");
        if (string.IsNullOrEmpty(model) || !File.Exists(model))
        {
            Console.Error.WriteLine("Smoke test requires an existing file: --model <file.onnx>");
            return 1;
        }

        var labelsArg = GetArg(args, "--labels", "-l");
        var labels = ParseLabelsArg(labelsArg);

        try
        {
            var inputArg = GetArg(args, "--input", "-i");
            string sourceNote;
            if (!string.IsNullOrEmpty(inputArg) && File.Exists(inputArg))
                sourceNote = inputArg;
            else
            {
                var resolved = AppDataPaths.TryResolveBrainTumorSampleImagePath(
                    SampleAssetsDownloader.ReferenceImageFileName);
                sourceNote = resolved
                    ?? "(synthetic 640x640 — pass --input, GUI 샘플 다운로드, 또는 python download_sample_assets.py)";
            }

            Console.WriteLine($"Image source: {sourceNote}");
            using var bmp = LoadBitmapForSmokeTest(inputArg);
            Console.WriteLine($"Input: {bmp.Width}x{bmp.Height}px");

            using var session = new BrainYolo26Session(model, labels);
            Console.WriteLine(
                $"Session: NetSize={session.NetSize}, SupportsInstanceSegmentation={session.SupportsInstanceSegmentation}");
            Console.WriteLine($"Execution: {session.ExecutionProviderSummary}");

            var confStr = GetArg(args, "--conf", "-c");
            var conf = float.TryParse(confStr, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var c)
                ? c
                : 0.01f;

            var sw = Stopwatch.StartNew();
            var (annotated, dets) = session.Detect(bmp, conf);
            sw.Stop();
            annotated.Dispose();

            Console.WriteLine($"Detect OK in {sw.ElapsedMilliseconds} ms — {dets.Count} instance(s) (conf>={conf:0.###})");
            for (var i = 0; i < Math.Min(dets.Count, 5); i++)
            {
                var d = dets[i];
                Console.WriteLine(
                    $"  [{i}] {d.Label} p={d.Confidence:0.###} box=({d.Box.Left:0.0},{d.Box.Top:0.0})-({d.Box.Right:0.0},{d.Box.Bottom:0.0})");
            }

            if (HasFlag(args, "--smoke-require-detections") && dets.Count == 0)
            {
                Console.Error.WriteLine("Smoke test: --smoke-require-detections was set but no detections returned.");
                return 2;
            }

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Smoke test FAILED: {ex.GetType().Name}: {ex.Message}");
            Console.Error.WriteLine(ex.StackTrace);
            return 3;
        }
    }

    private static Bitmap LoadBitmapForSmokeTest(string? inputPath)
    {
        if (!string.IsNullOrEmpty(inputPath) && File.Exists(inputPath))
            return new Bitmap(inputPath);

        var resolved = AppDataPaths.TryResolveBrainTumorSampleImagePath(SampleAssetsDownloader.ReferenceImageFileName);
        if (resolved != null)
            return new Bitmap(resolved);

        return CreateSyntheticSmokeBitmap(640, 640);
    }

    private static Bitmap CreateSyntheticSmokeBitmap(int w, int h)
    {
        var b = new Bitmap(w, h, PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(b);
        g.Clear(Color.FromArgb(114, 114, 114));
        using var br = new SolidBrush(Color.White);
        g.FillEllipse(br, w / 4, h / 4, w / 2, h / 2);
        return b;
    }

    private static bool HasFlag(string[] args, params string[] flags) =>
        args.Any(a => flags.Contains(a, StringComparer.OrdinalIgnoreCase));

    internal static bool WantsConsoleMode(string[] args) =>
        args.Length > 0 &&
        (HasFlag(args, "--model", "-m") || HasFlag(args, "--help", "-h") || HasFlag(args, "--smoke-test"));

    internal static void PrintHelp()
    {
            Console.WriteLine("""
            YOLO26 (Ultralytics) brain slice segmentation or detection via ONNX.

            GUI: run with no arguments.

            Console (batch images):
              YOLO26BrainV20 --model <brain.onnx> --input <file|folder> [--output dir] [--conf 0.25] [--labels a,b,c]

            Smoke test (one forward pass, no output files):
              YOLO26BrainV20 --smoke-test --model <brain.onnx> [--input image.png] [--conf 0.01] [--labels a,b]
              Optional: --smoke-require-detections  (exit 2 if zero detections)

            --labels is optional; omit it to infer class count from the ONNX tensor and show names as class_0, class_1, …
            Segmentation ONNX: export a YOLO26n-seg (or compatible) model with ultralytics model.export(format="onnx").
            """);
    }

    private static string[] ParseLabelsArg(string? labelsArg)
    {
        if (string.IsNullOrWhiteSpace(labelsArg))
            return Array.Empty<string>();
        return labelsArg.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
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

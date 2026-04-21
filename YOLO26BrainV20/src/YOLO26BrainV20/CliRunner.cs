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
        var epArg = GetArg(args, "--ep", "-e");
        if (!TryParseExecutionProvider(epArg, out var ep, out var epErr))
        {
            Console.Error.WriteLine(epErr);
            return 1;
        }

        var cudaStr = GetArgSingle(args, "--cuda-device");
        if (!int.TryParse(string.IsNullOrWhiteSpace(cudaStr) ? "0" : cudaStr, System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var cudaDeviceId) || cudaDeviceId < 0)
        {
            Console.Error.WriteLine("Invalid --cuda-device (expected non-negative integer).");
            return 1;
        }

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
            : Path.Combine(Path.GetDirectoryName(Path.GetFullPath(paths[0])) ?? ".", "brain_ct_hemorrhage_seg_out");
        Directory.CreateDirectory(outDir);

        using var session = new BrainYolo26Session(model, labels, ep, cudaDeviceId);
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
                    var name = Path.GetFileNameWithoutExtension(path) + "_hemorrhage_seg.png";
                    var dest = Path.Combine(outDir, name);
                    annotated.Save(dest, ImageFormat.Png);
                    Console.WriteLine($"{path} -> {dest} ({dets.Count} hemorrhage region(s))");
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
        var epArg = GetArg(args, "--ep", "-e");
        if (!TryParseExecutionProvider(epArg, out var ep, out var epErr))
        {
            Console.Error.WriteLine(epErr);
            return 1;
        }

        var cudaStr = GetArgSingle(args, "--cuda-device");
        if (!int.TryParse(string.IsNullOrWhiteSpace(cudaStr) ? "0" : cudaStr, System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var cudaDeviceId) || cudaDeviceId < 0)
        {
            Console.Error.WriteLine("Invalid --cuda-device (expected non-negative integer).");
            return 1;
        }

        try
        {
            var inputArg = GetArg(args, "--input", "-i");
            string sourceNote;
            if (!string.IsNullOrEmpty(inputArg) && File.Exists(inputArg))
                sourceNote = inputArg;
            else
            {
                var resolved = AppDataPaths.TryResolveBrainTumorSampleImagePath(
                    AppDataPaths.BrainTumorReferenceImageFileName);
                sourceNote = resolved
                    ?? "(synthetic 640x640 — pass --input 또는 repo samples/brain_tumor_sample.jpg)";
            }

            Console.WriteLine($"Image source: {sourceNote}");
            using var bmp = LoadBitmapForSmokeTest(inputArg);
            Console.WriteLine($"Input: {bmp.Width}x{bmp.Height}px");

            using var session = new BrainYolo26Session(model, labels, ep, cudaDeviceId);
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
                Console.Error.WriteLine("Smoke test: --smoke-require-detections was set but zero instances returned.");
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

        var resolved = AppDataPaths.TryResolveBrainTumorSampleImagePath(AppDataPaths.BrainTumorReferenceImageFileName);
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
            YOLO26BrainV20: Brain CT hemorrhage instance segmentation via Ultralytics-style YOLO-seg ONNX.

            GUI: run with no arguments.

            Console (batch images):
              YOLO26BrainV20 --model <hemorrhage_seg.onnx> --input <file|folder> [--output dir] [--conf 0.25] [--labels hemorrhage] [--ep auto|cpu|cuda] [--cuda-device 0]

            Smoke test (one forward pass, no output files):
              YOLO26BrainV20 --smoke-test --model <hemorrhage_seg.onnx> [--input image.png] [--conf 0.01] [--labels hemorrhage]
              Optional: --smoke-require-detections  (exit 2 if zero instances)

            --ep, -e: ONNX Runtime execution — auto (CUDA then CPU), cpu (CPU only), cuda (CUDA only; fails if unavailable).
            --cuda-device: CUDA device index (default 0). Used with auto or cuda.

            --labels is optional; omit it to use the default single class name (hemorrhage) for display and channel layout.
            PT to ONNX: use tools/export_yolo26_brain_onnx.py (see README).
            """);
    }

    private static string[] ParseLabelsArg(string? labelsArg)
    {
        if (!string.IsNullOrWhiteSpace(labelsArg))
            return labelsArg.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return DefaultDisplayClassNames();
    }

    private static string[] DefaultDisplayClassNames() =>
        BrainCtInferenceDefaults.RecommendedClassLabelsComma.Split(
            ',',
            StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

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

    private static string? GetArgSingle(string[] args, string longName)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], longName, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }

        return null;
    }

    private static bool TryParseExecutionProvider(string? value, out OnnxExecutionProviderRequest ep, out string? error)
    {
        ep = OnnxExecutionProviderRequest.Auto;
        error = null;
        if (string.IsNullOrWhiteSpace(value))
            return true;

        switch (value.Trim().ToLowerInvariant())
        {
            case "auto":
                ep = OnnxExecutionProviderRequest.Auto;
                return true;
            case "cpu":
                ep = OnnxExecutionProviderRequest.CpuOnly;
                return true;
            case "cuda":
            case "gpu":
                ep = OnnxExecutionProviderRequest.CudaOnly;
                return true;
            default:
                error = $"Invalid --ep value \"{value}\". Use: auto, cpu, or cuda.";
                return false;
        }
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

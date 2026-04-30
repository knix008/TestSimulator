using System.Text.RegularExpressions;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace SuperResolutionApp;

public abstract class OnnxSuperResolutionEngine : ISuperResolutionEngine
{
    private string _lastRuntimeDevice = "CPU";

    public abstract SrAlgorithm Algorithm { get; }
    public string LastRuntimeDevice => _lastRuntimeDevice;

    public Task<Bitmap> UpscaleAsync(Bitmap input, SrOptions options, IProgress<int>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(options.ModelPath))
        {
            throw new InvalidOperationException($"{Algorithm} requires an ONNX model file.");
        }

        if (!File.Exists(options.ModelPath))
        {
            throw new FileNotFoundException("Model file not found.", options.ModelPath);
        }

        return Task.Run(() => RunOnnx(input, options, progress));
    }

    private Bitmap RunOnnx(Bitmap input, SrOptions options, IProgress<int>? progress)
    {
        progress?.Report(2);
        using var sessionOptions = BuildSessionOptions(options, out var runtimeDevice);
        _lastRuntimeDevice = runtimeDevice;
        using var session = CreateSessionWithHelpfulError(options.ModelPath!, sessionOptions);
        var imageInputName = ResolveImageInputName(session.InputMetadata);
        var outputMeta = session.OutputMetadata.First();
        progress?.Report(10);

        using var rgbBitmap = Ensure24bppRgb(input);
        var output = RunWithOptionalTiling(session, imageInputName, outputMeta.Key, rgbBitmap, options, progress);
        progress?.Report(100);
        return output;
    }

    private static InferenceSession CreateSessionWithHelpfulError(string modelPath, SessionOptions sessionOptions)
    {
        try
        {
            return new InferenceSession(modelPath, sessionOptions);
        }
        catch (Exception ex) when (ContainsExternalDataPathValidationError(ex))
        {
            var modelFile = Path.GetFileName(modelPath);
            var modelDir = Path.GetDirectoryName(modelPath) ?? "(unknown)";
            throw new InvalidOperationException(
                $"ONNX external data path validation failed.\n" +
                $"선택한 모델 '{modelFile}' 이(가) 외부 데이터 파일(.data 등)을 요구하지만 같은 폴더에서 찾지 못했습니다.\n" +
                $"모델 파일과 외부 데이터 파일을 함께 '{modelDir}' 에 두거나, 단일 파일 ONNX 모델을 선택해 주세요.",
                ex);
        }
    }

    private static bool ContainsExternalDataPathValidationError(Exception ex)
    {
        var message = ex.GetBaseException().Message;
        return Regex.IsMatch(message, "external\\s+data\\s+path\\s+validation\\s+failed", RegexOptions.IgnoreCase);
    }

    private static SessionOptions BuildSessionOptions(SrOptions srOptions, out string runtimeDevice)
    {
        var options = new SessionOptions();
        options.GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL;

        if (srOptions.RuntimeDevice == SrRuntimeDevice.CPU)
        {
            runtimeDevice = "CPU (manual)";
            return options;
        }

        if (TryEnableCuda(options, out var cudaDetail))
        {
            runtimeDevice = "GPU (CUDA)";
            return options;
        }

        throw new InvalidOperationException(
            string.IsNullOrWhiteSpace(cudaDetail)
                ? "CUDA runtime is unavailable."
                : cudaDetail);
    }

    private static Bitmap RunWithOptionalTiling(
        InferenceSession session,
        string imageInputName,
        string outputName,
        Bitmap rgbBitmap,
        SrOptions options,
        IProgress<int>? progress)
    {
        var imageMeta = session.InputMetadata[imageInputName];
        int modelInputH = GetFixedInputDimension(imageMeta, axis: 2);
        int modelInputW = GetFixedInputDimension(imageMeta, axis: 3);

        int tileSize = Math.Max(0, options.TileSize);
        if (modelInputH > 0 && modelInputW > 0)
        {
            // Fixed-shape models (AuraSR/ESRGAN in this project) must receive exact H/W.
            tileSize = Math.Min(modelInputH, modelInputW);
        }
        int overlap = Math.Max(0, options.TileOverlap);
        if (tileSize <= 0 || (rgbBitmap.Width <= tileSize && rgbBitmap.Height <= tileSize))
        {
            using var fullInputBmp = EnsureModelInputSize(rgbBitmap, modelInputW, modelInputH);
            var fullInput = ImageToTensor(fullInputBmp, progress);
            var fullOutput = RunSession(session, imageInputName, outputName, fullInput);
            progress?.Report(74);
            int outputW = rgbBitmap.Width;
            int outputH = rgbBitmap.Height;
            if (modelInputW > 0 && modelInputH > 0)
            {
                int sx = Math.Max(1, fullOutput.Dimensions[3] / modelInputW);
                int sy = Math.Max(1, fullOutput.Dimensions[2] / modelInputH);
                outputW = rgbBitmap.Width * sx;
                outputH = rgbBitmap.Height * sy;
            }

            return TensorToBitmapCropped(fullOutput, outputW, outputH, progress);
        }

        int step = Math.Max(1, tileSize - overlap * 2);
        var xStarts = BuildTileStarts(rgbBitmap.Width, tileSize, step);
        var yStarts = BuildTileStarts(rgbBitmap.Height, tileSize, step);
        int totalTiles = xStarts.Count * yStarts.Count;
        int tileIndex = 0;

        float[,,,]? stitched = null;
        int scale = options.Scale;

        foreach (var y0 in yStarts)
        {
            foreach (var x0 in xStarts)
            {
                int tileW = Math.Min(tileSize, rgbBitmap.Width - x0);
                int tileH = Math.Min(tileSize, rgbBitmap.Height - y0);
                using var tileBmp = rgbBitmap.Clone(new Rectangle(x0, y0, tileW, tileH), rgbBitmap.PixelFormat);
                using var tileModelInput = EnsureModelInputSize(tileBmp, modelInputW, modelInputH);
                var tileInput = ImageToTensor(tileModelInput, null);
                var tileOutput = RunSession(session, imageInputName, outputName, tileInput);

                int outH = tileOutput.Dimensions[2];
                int outW = tileOutput.Dimensions[3];
                int scaleBaseW = (modelInputW > 0 ? modelInputW : tileW);
                int tileScale = Math.Max(1, outW / Math.Max(1, scaleBaseW));
                if (stitched is null)
                {
                    scale = tileScale;
                    stitched = new float[1, 3, rgbBitmap.Height * scale, rgbBitmap.Width * scale];
                }

                int cropL = x0 == 0 ? 0 : overlap * scale;
                int cropT = y0 == 0 ? 0 : overlap * scale;
                int cropR = (x0 + tileW >= rgbBitmap.Width) ? 0 : overlap * scale;
                int cropB = (y0 + tileH >= rgbBitmap.Height) ? 0 : overlap * scale;

                int writeX = x0 * scale + cropL;
                int writeY = y0 * scale + cropT;
                int effectiveOutW = tileW * scale;
                int effectiveOutH = tileH * scale;
                int copyW = Math.Max(0, effectiveOutW - cropL - cropR);
                int copyH = Math.Max(0, effectiveOutH - cropT - cropB);

                for (int c = 0; c < 3; c++)
                {
                    for (int yy = 0; yy < copyH; yy++)
                    {
                        for (int xx = 0; xx < copyW; xx++)
                        {
                            stitched![0, c, writeY + yy, writeX + xx] = tileOutput[0, c, cropT + yy, cropL + xx];
                        }
                    }
                }

                tileIndex++;
                int tiledProgress = 62 + (int)Math.Round((tileIndex / (double)totalTiles) * 12d);
                progress?.Report(Math.Clamp(tiledProgress, 62, 74));
            }
        }

        return FloatArrayToBitmap(stitched!, rgbBitmap.Width * scale, rgbBitmap.Height * scale, progress);
    }

    private static int GetFixedInputDimension(NodeMetadata meta, int axis)
    {
        var dims = meta.Dimensions;
        if (dims is null || dims.Length <= axis)
        {
            return 0;
        }

        return dims[axis] > 0 ? dims[axis] : 0;
    }

    private static Bitmap EnsureModelInputSize(Bitmap src, int modelInputW, int modelInputH)
    {
        if (modelInputW <= 0 || modelInputH <= 0)
        {
            return (Bitmap)src.Clone();
        }

        if (src.Width == modelInputW && src.Height == modelInputH)
        {
            return (Bitmap)src.Clone();
        }

        var dst = new Bitmap(modelInputW, modelInputH, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(dst);
        g.Clear(Color.Black);
        g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height));
        return dst;
    }

    private static List<int> BuildTileStarts(int size, int tileSize, int step)
    {
        var starts = new List<int>();
        int pos = 0;
        while (true)
        {
            starts.Add(pos);
            if (pos + tileSize >= size)
            {
                break;
            }

            pos += step;
            if (pos + tileSize > size)
            {
                pos = Math.Max(0, size - tileSize);
            }
        }

        return starts;
    }

    private static DenseTensor<float> RunSession(
        InferenceSession session,
        string imageInputName,
        string outputName,
        DenseTensor<float> inputTensor)
    {
        var inputs = BuildNamedInputs(session.InputMetadata, imageInputName, inputTensor);
        using IDisposableReadOnlyCollection<DisposableNamedOnnxValue> results = session.Run(inputs);
        var outputTensor = results.First(x => x.Name == outputName).AsTensor<float>();
        var dims = outputTensor.Dimensions.ToArray();
        var copy = new DenseTensor<float>(dims);
        for (int n = 0; n < dims[0]; n++)
        {
            for (int c = 0; c < dims[1]; c++)
            {
                for (int y = 0; y < dims[2]; y++)
                {
                    for (int x = 0; x < dims[3]; x++)
                    {
                        copy[n, c, y, x] = outputTensor[n, c, y, x];
                    }
                }
            }
        }

        return copy;
    }

    private static List<NamedOnnxValue> BuildNamedInputs(
        IReadOnlyDictionary<string, NodeMetadata> inputMetadata,
        string imageInputName,
        DenseTensor<float> imageTensor)
    {
        var list = new List<NamedOnnxValue>(inputMetadata.Count);
        foreach (var (name, meta) in inputMetadata)
        {
            if (string.Equals(name, imageInputName, StringComparison.Ordinal))
            {
                list.Add(NamedOnnxValue.CreateFromTensor(name, imageTensor));
                continue;
            }

            if (meta.ElementType != typeof(float))
            {
                throw new NotSupportedException($"Unsupported ONNX input type for '{name}': {meta.ElementType}");
            }

            var dims = (meta.Dimensions ?? Array.Empty<int>())
                .Select(d => d > 0 ? d : 1)
                .ToArray();
            if (dims.Length == 0)
            {
                dims = new[] { 1 };
            }

            var aux = new DenseTensor<float>(dims);
            list.Add(NamedOnnxValue.CreateFromTensor(name, aux));
        }

        return list;
    }

    private static string ResolveImageInputName(IReadOnlyDictionary<string, NodeMetadata> inputMetadata)
    {
        foreach (var (name, meta) in inputMetadata)
        {
            var dims = meta.Dimensions;
            if (dims is not null && dims.Length == 4 && dims[1] is 3 or -1)
            {
                return name;
            }
        }

        return inputMetadata.First().Key;
    }

    private static Bitmap FloatArrayToBitmap(float[,,,] array, int width, int height, IProgress<int>? progress)
    {
        var bmp = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int r = ToByte(array[0, 0, y, x]);
                int g = ToByte(array[0, 1, y, x]);
                int b = ToByte(array[0, 2, y, x]);
                bmp.SetPixel(x, y, Color.FromArgb(r, g, b));
            }

            if (y % Math.Max(1, height / 20) == 0)
            {
                int pct = 74 + (int)Math.Round((y / (double)Math.Max(1, height - 1)) * 24d);
                progress?.Report(Math.Clamp(pct, 74, 98));
            }
        }

        return bmp;
    }

    private static bool TryEnableCuda(SessionOptions options, out string detail)
    {
        detail = string.Empty;
        EnsureCudaRuntimePathVisible();

        if (!HasAnyCudaDnnRuntime())
        {
            detail = "CUDA unavailable: cuDNN runtime (cudnn64_9.dll) not found in PATH";
            return false;
        }

        try
        {
            // Preferred path in recent ORT C# bindings.
            var makeCuda = typeof(SessionOptions).GetMethod(
                "MakeSessionOptionWithCudaProvider",
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static,
                binder: null,
                types: new[] { typeof(int) },
                modifiers: null);

            if (makeCuda is not null)
            {
                var cudaOptions = makeCuda.Invoke(null, new object?[] { 0 }) as SessionOptions;
                if (cudaOptions is not null)
                {
                    // Copy key options to the caller's SessionOptions by enabling CUDA directly as well.
                    // Some builds expose both APIs; fallback below handles append path.
                    options.AppendExecutionProvider_CUDA(0);
                    return true;
                }
            }

            var methods = typeof(SessionOptions)
                .GetMethods()
                .Where(m => m.Name == "AppendExecutionProvider_CUDA")
                .ToArray();

            foreach (var method in methods)
            {
                var args = BuildProviderArguments(method);
                if (args is null)
                {
                    continue;
                }

                method.Invoke(options, args);
                return true;
            }

            detail = "CUDA provider API not found";
        }
        catch (Exception ex)
        {
            detail = $"CUDA unavailable: {ex.GetBaseException().Message}";
        }

        return false;
    }

    private static bool HasAnyCudaDnnRuntime()
    {
        return IsDllReachable("cudnn64_9.dll") || IsDllReachable("cudnn64_8.dll");
    }

    private static bool IsDllReachable(string dllName)
    {
        foreach (var dir in GetCudaSearchDirectories())
        {
            try
            {
                if (File.Exists(Path.Combine(dir, dllName)))
                {
                    return true;
                }
            }
            catch
            {
                // Ignore invalid segments.
            }
        }

        return false;
    }

    private static void EnsureCudaRuntimePathVisible()
    {
        var candidates = GetCudaSearchDirectories().ToArray();
        var path = Environment.GetEnvironmentVariable("PATH");
        path ??= string.Empty;

        var existing = path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var toAppend = new List<string>();
        foreach (var dir in candidates)
        {
            if (Directory.Exists(dir) && !existing.Contains(dir))
            {
                toAppend.Add(dir);
            }
        }

        if (toAppend.Count == 0)
        {
            return;
        }

        var merged = string.IsNullOrWhiteSpace(path)
            ? string.Join(Path.PathSeparator, toAppend)
            : path + Path.PathSeparator + string.Join(Path.PathSeparator, toAppend);

        Environment.SetEnvironmentVariable("PATH", merged);
    }

    private static IEnumerable<string> GetCudaSearchDirectories()
    {
        // Explicitly include known Windows cuDNN/CUDA install locations.
        yield return @"C:\Program Files\NVIDIA\CUDNN\v9.5\bin\12.6";
        yield return @"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin";

        var path = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(path))
        {
            yield break;
        }

        foreach (var p in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            yield return p.Trim();
        }
    }

    private static bool TryEnableDirectMl(SessionOptions options)
    {
        try
        {
            var methods = typeof(SessionOptions)
                .GetMethods()
                .Where(m => m.Name == "AppendExecutionProvider_DML")
                .ToArray();

            foreach (var method in methods)
            {
                var args = BuildProviderArguments(method);
                if (args is null)
                {
                    continue;
                }

                method.Invoke(options, args);
                return true;
            }
        }
        catch
        {
            // Ignore and fallback.
        }

        return false;
    }

    private static object?[]? BuildProviderArguments(System.Reflection.MethodInfo method)
    {
        var parameters = method.GetParameters();
        if (parameters.Length == 0)
        {
            return Array.Empty<object>();
        }

        if (parameters.Length == 1 && parameters[0].ParameterType == typeof(int))
        {
            return new object?[] { 0 };
        }

        var args = new object?[parameters.Length];
        for (int i = 0; i < parameters.Length; i++)
        {
            var p = parameters[i];
            if (p.ParameterType == typeof(int))
            {
                args[i] = 0;
                continue;
            }

            if (p.HasDefaultValue)
            {
                args[i] = p.DefaultValue;
                continue;
            }

            var ctor = p.ParameterType.GetConstructor(Type.EmptyTypes);
            if (ctor is null)
            {
                return null;
            }

            args[i] = Activator.CreateInstance(p.ParameterType);
        }

        return args;
    }

    private static Bitmap Ensure24bppRgb(Bitmap src)
    {
        if (src.PixelFormat == System.Drawing.Imaging.PixelFormat.Format24bppRgb)
        {
            return (Bitmap)src.Clone();
        }

        var dst = new Bitmap(src.Width, src.Height, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(dst);
        g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height));
        return dst;
    }

    private static DenseTensor<float> ImageToTensor(Bitmap image, IProgress<int>? progress)
    {
        int h = image.Height;
        int w = image.Width;
        var tensor = new DenseTensor<float>(new[] { 1, 3, h, w });

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                var c = image.GetPixel(x, y);
                tensor[0, 0, y, x] = c.R / 255f;
                tensor[0, 1, y, x] = c.G / 255f;
                tensor[0, 2, y, x] = c.B / 255f;
            }
            if (y % Math.Max(1, h / 20) == 0)
            {
                int pct = 10 + (int)Math.Round((y / (double)Math.Max(1, h - 1)) * 50d);
                progress?.Report(Math.Clamp(pct, 10, 60));
            }
        }

        return tensor;
    }

    private static Bitmap TensorToBitmap(Tensor<float> tensor, IProgress<int>? progress)
    {
        if (tensor.Rank != 4 || tensor.Dimensions[0] != 1 || tensor.Dimensions[1] != 3)
        {
            throw new InvalidOperationException("Expected output tensor shape [1,3,H,W].");
        }

        int h = tensor.Dimensions[2];
        int w = tensor.Dimensions[3];
        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format24bppRgb);

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int r = ToByte(tensor[0, 0, y, x]);
                int g = ToByte(tensor[0, 1, y, x]);
                int b = ToByte(tensor[0, 2, y, x]);
                bmp.SetPixel(x, y, Color.FromArgb(r, g, b));
            }
            if (y % Math.Max(1, h / 20) == 0)
            {
                int pct = 74 + (int)Math.Round((y / (double)Math.Max(1, h - 1)) * 24d);
                progress?.Report(Math.Clamp(pct, 74, 98));
            }
        }

        return bmp;
    }

    private static Bitmap TensorToBitmapCropped(Tensor<float> tensor, int targetW, int targetH, IProgress<int>? progress)
    {
        if (tensor.Rank != 4 || tensor.Dimensions[0] != 1 || tensor.Dimensions[1] != 3)
        {
            throw new InvalidOperationException("Expected output tensor shape [1,3,H,W].");
        }

        int h = Math.Min(targetH, tensor.Dimensions[2]);
        int w = Math.Min(targetW, tensor.Dimensions[3]);
        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format24bppRgb);

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int r = ToByte(tensor[0, 0, y, x]);
                int g = ToByte(tensor[0, 1, y, x]);
                int b = ToByte(tensor[0, 2, y, x]);
                bmp.SetPixel(x, y, Color.FromArgb(r, g, b));
            }

            if (y % Math.Max(1, h / 20) == 0)
            {
                int pct = 74 + (int)Math.Round((y / (double)Math.Max(1, h - 1)) * 24d);
                progress?.Report(Math.Clamp(pct, 74, 98));
            }
        }

        return bmp;
    }

    private static int ToByte(float value)
    {
        value = Math.Clamp(value, 0f, 1f);
        return (int)Math.Round(value * 255f);
    }
}

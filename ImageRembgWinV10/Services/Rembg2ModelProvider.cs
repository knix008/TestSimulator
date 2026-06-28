using Microsoft.ML.OnnxRuntime;

using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10.Services;

internal sealed class Rembg2ModelProvider : IDisposable
{
    private const string ModelFileName = "rembg2.onnx";

    private static readonly Lock SessionLock = new();
    private static Rembg2ModelProvider? _instance;

    private InferenceSession? _session;
    private string? _inputName;

    public static Rembg2ModelProvider Instance => _instance ??= new Rembg2ModelProvider();

    /// <summary>
    /// Path under the app's own install/output folder. Only writable when running from a
    /// dev/portable build; an MSI install under Program Files is read-only for normal users.
    /// </summary>
    public static string BundledModelPath => Path.Combine(AppContext.BaseDirectory, "Assets", "Models", ModelFileName);

    /// <summary>
    /// Per-user, always-writable location. This is where a model the user browses to (via the
    /// "select the ONNX file you already have" prompt) gets copied, since the install folder
    /// may not be writable without elevation.
    /// </summary>
    public static string UserModelPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ImageRembgWinV10",
        "models",
        ModelFileName);

    /// <summary>The path to use when installing a user-supplied model file (always writable).</summary>
    public static string ModelPath => UserModelPath;

    public static bool IsModelAvailable() => File.Exists(BundledModelPath) || File.Exists(UserModelPath);

    private static string ResolveExistingModelPath() =>
        File.Exists(BundledModelPath) ? BundledModelPath : UserModelPath;

    public string InputName => _inputName ?? throw new InvalidOperationException(L.Get("Exception.RembgNotReady"));

    public InferenceSession Session => _session ?? throw new InvalidOperationException(L.Get("Exception.RembgNotReady"));

    public void EnsureReady(IProgress<string>? progress = null)
    {
        lock (SessionLock)
        {
            if (_session != null)
            {
                return;
            }

            var modelPath = ResolveExistingModelPath();
            if (!File.Exists(modelPath))
            {
                throw new InvalidOperationException(L.F("Exception.Rembg2ModelMissing", modelPath));
            }

            progress?.Report(L.Get("Rembg.LoadingModel"));
            try
            {
                var options = new SessionOptions
                {
                    GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_BASIC,
                };
                _session = new InferenceSession(modelPath, options);
                _inputName = _session.InputMetadata.Keys.First();
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    L.F("Exception.RembgLoadFailed", ex.Message, modelPath),
                    ex);
            }
        }
    }

    public void Dispose()
    {
        _session?.Dispose();
        _session = null;
    }
}

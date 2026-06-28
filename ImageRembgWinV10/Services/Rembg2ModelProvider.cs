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

            var modelPath = Path.Combine(AppContext.BaseDirectory, "Assets", "Models", ModelFileName);
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

using Microsoft.ML.OnnxRuntime;

namespace YOLO11BrainV10.Inference;

internal static class YoloOnnxSessionFactory
{
    public static InferenceSession CreateSession(string onnxPath, int cudaDeviceId, out string summary)
    {
        var threads = Math.Max(1, Environment.ProcessorCount);
        void ApplyCommon(SessionOptions o)
        {
            o.GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL;
            o.InterOpNumThreads = threads;
            o.IntraOpNumThreads = threads;
        }

        try
        {
            CudaRuntimeBootstrap.EnsureCudaBinOnPath();
            using var so = new SessionOptions();
            ApplyCommon(so);
            so.AppendExecutionProvider_CUDA(cudaDeviceId);
            var session = new InferenceSession(onnxPath, so);
            summary = $"CUDA GPU (device {cudaDeviceId})";
            return session;
        }
        catch (Exception ex)
        {
            using var soCpu = new SessionOptions();
            ApplyCommon(soCpu);
            var session = new InferenceSession(onnxPath, soCpu);
            summary = $"CPU (CUDA unavailable - {ex.GetType().Name}: {ex.Message})";
            if (ex.Message.Contains("126", StringComparison.Ordinal))
                summary += " [Ensure cuDNN 9 / CUDA 12 DLL directories are on PATH.]";
            return session;
        }
    }
}

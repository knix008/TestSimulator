namespace YOLO26BrainV20.Inference;

/// <summary>Which ONNX Runtime execution providers to use when creating an inference session.</summary>
public enum OnnxExecutionProviderRequest
{
    /// <summary>Try CUDA first, then fall back to CPU if CUDA is unavailable.</summary>
    Auto = 0,

    /// <summary>CPU execution provider only.</summary>
    CpuOnly = 1,

    /// <summary>CUDA only (fails if the CUDA EP cannot be loaded).</summary>
    CudaOnly = 2,
}

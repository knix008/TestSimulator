using System;
using Microsoft.ML.OnnxRuntime;

namespace YOLO26V10.yolo26
{
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
                using (var so = new SessionOptions())
                {
                    ApplyCommon(so);
                    so.AppendExecutionProvider_CUDA(cudaDeviceId);
                    var session = new InferenceSession(onnxPath, so);
                    summary = $"CUDA GPU (device {cudaDeviceId})";
                    return session;
                }
            }
            catch (Exception ex)
            {
                using (var soCpu = new SessionOptions())
                {
                    ApplyCommon(soCpu);
                    var session = new InferenceSession(onnxPath, soCpu);
                    summary = $"CPU (CUDA 사용 불가 - {ex.GetType().Name}: {ex.Message})";
                    if (ex.Message.IndexOf("126", StringComparison.Ordinal) >= 0)
                        summary += " [cuDNN 9(CUDA 12) DLL 경로를 확인하세요. cudnn64_9.dll 이 포함된 bin 폴더가 PATH에 있어야 합니다.]";
                    return session;
                }
            }
        }
    }
}

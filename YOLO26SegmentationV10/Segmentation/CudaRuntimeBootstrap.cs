using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace YOLO26SegmentationV10.Segmentation
{
    /// <summary>
    /// ONNX CUDA EP가 <c>onnxruntime_providers_cuda.dll</c> 로드 시 의존 DLL(cudart, cudnn 등)을 찾도록
    /// 표준 CUDA/cuDNN 설치 경로를 프로세스 PATH 앞에 추가합니다. (Windows 오류 126 완화)
    /// Microsoft.ML.OnnxRuntime.Gpu 1.19.x는 CUDA 12.x + cuDNN 9.x가 필요하며, cuDNN 9는 종종
    /// <c>...\CUDNN\v9.x\bin\12.6</c>처럼 CUDA 버전별 하위 폴더에 DLL을 둡니다.
    /// </summary>
    internal static class CudaRuntimeBootstrap
    {
        private static bool _done;

        public static void EnsureCudaBinOnPath()
        {
            if (_done)
                return;
            _done = true;

            var ordered = new List<string>();

            void AppendUnique(string dir)
            {
                if (string.IsNullOrWhiteSpace(dir))
                    return;
                try
                {
                    var full = Path.GetFullPath(dir);
                    if (!Directory.Exists(full))
                        return;
                    if (ordered.Any(b => string.Equals(b, full, StringComparison.OrdinalIgnoreCase)))
                        return;
                    ordered.Add(full);
                }
                catch
                {
                    // ignore
                }
            }

            var toolkitRoot = @"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA";
            if (Directory.Exists(toolkitRoot))
            {
                try
                {
                    foreach (var cudaHome in Directory.GetDirectories(toolkitRoot, "v12*")
                                 .OrderByDescending(s => s, StringComparer.OrdinalIgnoreCase))
                        AppendUnique(Path.Combine(cudaHome, "bin"));
                }
                catch
                {
                    // ignore
                }

                try
                {
                    foreach (var cudaHome in Directory.GetDirectories(toolkitRoot, "v11*")
                                 .OrderByDescending(s => s, StringComparer.OrdinalIgnoreCase))
                        AppendUnique(Path.Combine(cudaHome, "bin"));
                }
                catch
                {
                    // ignore
                }
            }

            foreach (var key in new[]
                     {
                         "CUDA_PATH_V12_8", "CUDA_PATH_V12_7", "CUDA_PATH_V12_6", "CUDA_PATH_V12_5",
                         "CUDA_PATH_V12_4", "CUDA_PATH_V12_3", "CUDA_PATH_V12_2", "CUDA_PATH_V12_1", "CUDA_PATH_V12_0",
                     })
            {
                var root = Environment.GetEnvironmentVariable(key);
                if (!string.IsNullOrEmpty(root))
                    AppendUnique(Path.Combine(root, "bin"));
            }

            var cudnnRoot = @"C:\Program Files\NVIDIA\CUDNN";
            if (Directory.Exists(cudnnRoot))
            {
                try
                {
                    foreach (var versionDir in Directory.GetDirectories(cudnnRoot)
                                 .OrderByDescending(s => s, StringComparer.OrdinalIgnoreCase))
                    {
                        var binDir = Path.Combine(versionDir, "bin");
                        if (!Directory.Exists(binDir))
                            continue;

                        string[] subBins;
                        try
                        {
                            subBins = Directory.GetDirectories(binDir);
                        }
                        catch
                        {
                            continue;
                        }

                        var forCuda12 = new List<string>();
                        var forCuda11 = new List<string>();
                        var otherNested = new List<string>();

                        foreach (var sub in subBins)
                        {
                            var name = Path.GetFileName(sub);
                            if (IsCuda12StyleBinDir(name))
                                forCuda12.Add(sub);
                            else if (IsCuda11StyleBinDir(name))
                                forCuda11.Add(sub);
                            else
                                otherNested.Add(sub);
                        }

                        foreach (var p in forCuda12.OrderByDescending(CudaStyleVersionSortKey))
                            AppendUnique(p);
                        foreach (var p in otherNested.OrderByDescending(CudaStyleVersionSortKey))
                            AppendUnique(p);

                        var hasCudnnInFlat = File.Exists(Path.Combine(binDir, "cudnn64_9.dll")) ||
                                             File.Exists(Path.Combine(binDir, "cudnn64_8.dll")) ||
                                             File.Exists(Path.Combine(binDir, "cudnn_ops_infer64_8.dll"));
                        if (hasCudnnInFlat || subBins.Length == 0)
                            AppendUnique(binDir);

                        foreach (var p in forCuda11.OrderByDescending(CudaStyleVersionSortKey))
                            AppendUnique(p);
                    }
                }
                catch
                {
                    // ignore
                }
            }

            var cudaPath = Environment.GetEnvironmentVariable("CUDA_PATH");
            if (!string.IsNullOrEmpty(cudaPath))
            {
                var leaf = Path.GetFileName(cudaPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                if (leaf.StartsWith("v12", StringComparison.OrdinalIgnoreCase))
                    AppendUnique(Path.Combine(cudaPath, "bin"));
            }

            foreach (var key in new[] { "CUDA_PATH_V11_8" })
            {
                var root = Environment.GetEnvironmentVariable(key);
                if (!string.IsNullOrEmpty(root))
                    AppendUnique(Path.Combine(root, "bin"));
            }

            if (!string.IsNullOrEmpty(cudaPath))
            {
                var leaf = Path.GetFileName(cudaPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                if (leaf.StartsWith("v11", StringComparison.OrdinalIgnoreCase))
                    AppendUnique(Path.Combine(cudaPath, "bin"));
            }

            if (ordered.Count == 0)
                return;

            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            var parts = new HashSet<string>(
                path.Split(new[] { Path.PathSeparator }, StringSplitOptions.RemoveEmptyEntries).Select(p =>
                {
                    try
                    {
                        return Path.GetFullPath(p.Trim());
                    }
                    catch
                    {
                        return p.Trim();
                    }
                }),
                StringComparer.OrdinalIgnoreCase);

            for (var i = ordered.Count - 1; i >= 0; i--)
            {
                if (parts.Contains(ordered[i]))
                    continue;
                path = ordered[i] + Path.PathSeparator + path;
                parts.Add(ordered[i]);
            }

            Environment.SetEnvironmentVariable("PATH", path, EnvironmentVariableTarget.Process);
        }

        /// <summary>폴더 이름(예: 12.6, 12)을 정렬 키로 사용합니다.</summary>
        private static string CudaStyleVersionSortKey(string directoryPath)
        {
            return Path.GetFileName(directoryPath) ?? "";
        }

        private static bool IsCuda12StyleBinDir(string name)
        {
            if (string.IsNullOrEmpty(name))
                return false;
            if (name.Equals("12", StringComparison.OrdinalIgnoreCase))
                return true;
            return name.StartsWith("12.", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsCuda11StyleBinDir(string name)
        {
            if (string.IsNullOrEmpty(name))
                return false;
            if (name.Equals("11", StringComparison.OrdinalIgnoreCase))
                return true;
            return name.StartsWith("11.", StringComparison.OrdinalIgnoreCase);
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace YOLO26V10.Segmentation
{
    /// <summary>
    /// ONNX CUDA EP媛 <c>onnxruntime_providers_cuda.dll</c> 濡쒕뱶 ???섏〈 DLL(cudart, cudnn ????李얜룄濡?
    /// ?쒖? CUDA/cuDNN ?ㅼ튂 寃쎈줈瑜??꾨줈?몄뒪 PATH ?욎뿉 異붽??⑸땲?? (Windows ?ㅻ쪟 126 ?꾪솕)
    /// Microsoft.ML.OnnxRuntime.Gpu 1.19.x??CUDA 12.x + cuDNN 9.x媛 ?꾩슂?섎ŉ, cuDNN 9??醫낆쥌
    /// <c>...\CUDNN\v9.x\bin\12.6</c>泥섎읆 CUDA 踰꾩쟾蹂??섏쐞 ?대뜑??DLL???〓땲??
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

                        var hasCudnnInFlat = File.Exists(Path.Combine(binDir, "cudnn64_9.dll"));
                        if (hasCudnnInFlat || subBins.Length == 0)
                            AppendUnique(binDir);
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

        /// <summary>?대뜑 ?대쫫(?? 12.6, 12)???뺣젹 ?ㅻ줈 ?ъ슜?⑸땲??</summary>
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


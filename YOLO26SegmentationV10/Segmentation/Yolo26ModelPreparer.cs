using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace YOLO26SegmentationV10.Segmentation
{
    /// <summary>
    /// GitHub에서 YOLO26-seg .pt를 받고, Python Ultralytics로 ONNX로 변환합니다.
    /// </summary>
    internal static class Yolo26ModelPreparer
    {
        public const string DefaultReleaseTag = "v8.4.0";

        /// <summary>다운로드·변환된 가중치(.pt) 및 ONNX 저장 폴더 (%LocalAppData%\YOLO26SegmentationV10\model).</summary>
        public static string ModelDirectory =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "YOLO26SegmentationV10",
                "model");

        /// <summary>모델 저장 폴더가 없으면 만듭니다. 앱 시작 시 한 번 호출해 두면 탐색기에서 경로를 열 수 있습니다.</summary>
        public static void EnsureModelDirectoryExists() => Directory.CreateDirectory(ModelDirectory);

        public static string GetPtPath(string variant) =>
            Path.Combine(ModelDirectory, $"yolo26{variant}-seg.pt");

        public static string GetOnnxPath(string variant) =>
            Path.Combine(ModelDirectory, $"yolo26{variant}-seg.onnx");

        public static string GetExportScriptPath()
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            return Path.GetFullPath(Path.Combine(baseDir, "tools", "export_yolo26_seg_onnx.py"));
        }

        public static async Task EnsureOnnxModelAsync(
            string variant,
            IProgress<string> log,
            CancellationToken cancellationToken,
            bool forceReexport = false,
            IProgress<ModelPrepareProgress> prepareProgress = null)
        {
            EnsureModelDirectoryExists();
            var pt = GetPtPath(variant);
            var onnx = GetOnnxPath(variant);
            var url =
                $"https://github.com/ultralytics/assets/releases/download/{DefaultReleaseTag}/yolo26{variant}-seg.pt";

            prepareProgress?.Report(new ModelPrepareProgress(ModelPreparePhase.Checking, 0, "상태 확인 중…"));

            if (File.Exists(onnx) && !forceReexport)
            {
                log?.Report($"ONNX 사용: {onnx}");
                prepareProgress?.Report(new ModelPrepareProgress(ModelPreparePhase.Done, 100, "이미 준비된 ONNX를 사용합니다."));
                return;
            }

            if (!File.Exists(pt))
            {
                log?.Report($".pt 다운로드: {url}");
                using (var client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromMinutes(60);
                    using (var resp = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                        .ConfigureAwait(false))
                    {
                        resp.EnsureSuccessStatusCode();
                        var total = resp.Content.Headers.ContentLength;
                        using (var fs = new FileStream(pt, FileMode.Create, FileAccess.Write, FileShare.None))
                        using (var stream = await resp.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        {
                            var buffer = new byte[81920];
                            long readTotal = 0;
                            int read;
                            while ((read = await stream.ReadAsync(buffer, 0, buffer.Length, cancellationToken)
                                       .ConfigureAwait(false)) > 0)
                            {
                                await fs.WriteAsync(buffer, 0, read, cancellationToken).ConfigureAwait(false);
                                readTotal += read;
                                if (total.HasValue && total.Value > 0)
                                {
                                    var pct = (int)(readTotal * 100L / total.Value);
                                    if (pct > 100)
                                        pct = 100;
                                    prepareProgress?.Report(new ModelPrepareProgress(
                                        ModelPreparePhase.Downloading,
                                        pct,
                                        FormatBytesProgress(readTotal, total.Value)));
                                }
                                else
                                {
                                    prepareProgress?.Report(new ModelPrepareProgress(
                                        ModelPreparePhase.Downloading,
                                        null,
                                        $"{FormatSize(readTotal)} 받는 중… (전체 용량 알 수 없음)"));
                                }
                            }
                        }
                    }
                }

                log?.Report($"저장: {pt}");
                prepareProgress?.Report(new ModelPrepareProgress(
                    ModelPreparePhase.Downloading,
                    100,
                    "가중치 다운로드 완료"));
            }
            else
            {
                log?.Report($"기존 .pt 사용: {pt}");
                prepareProgress?.Report(new ModelPrepareProgress(
                    ModelPreparePhase.Downloading,
                    100,
                    "기존 가중치 파일 사용"));
            }

            var script = GetExportScriptPath();
            if (!File.Exists(script))
                throw new FileNotFoundException("export 스크립트가 없습니다. tools 폴더를 출력 디렉터리에 복사했는지 확인하세요.", script);

            if (!TryResolvePython(out var pyExe, out var pyPrefixArgs))
                throw new InvalidOperationException(
                    "Python을 찾을 수 없습니다. Python 3와 pip install ultralytics 가 필요합니다.\n" +
                    "예: py -3 -m pip install -r tools\\requirements-export.txt");

            log?.Report("ONNX 변환 중 (Ultralytics)… 잠시 걸릴 수 있습니다.");
            prepareProgress?.Report(new ModelPrepareProgress(
                ModelPreparePhase.Converting,
                null,
                "ONNX 변환 중 (Python / Ultralytics)…"));

            var psi = new ProcessStartInfo
            {
                FileName = pyExe,
                Arguments =
                    $"{pyPrefixArgs}\"{script}\" --weights \"{pt}\" --out \"{onnx}\" --imgsz 640",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(script) ?? Environment.CurrentDirectory,
            };

            using (var proc = Process.Start(psi))
            {
                if (proc == null)
                    throw new InvalidOperationException("Python 프로세스를 시작할 수 없습니다.");

                var err = proc.StandardError.ReadToEnd();
                var std = proc.StandardOutput.ReadToEnd();
                proc.WaitForExit();
                if (proc.ExitCode != 0)
                    throw new InvalidOperationException(
                        $"ONNX 변환 실패 (코드 {proc.ExitCode}).\n{std}\n{err}");

                if (!string.IsNullOrWhiteSpace(std))
                    log?.Report(std.Trim());
            }

            if (!File.Exists(onnx))
                throw new InvalidOperationException($"ONNX 파일이 생성되지 않았습니다: {onnx}");

            log?.Report($"ONNX 준비 완료: {onnx}");
            prepareProgress?.Report(new ModelPrepareProgress(ModelPreparePhase.Done, 100, "완료"));
        }

        private static string FormatSize(long bytes)
        {
            if (bytes < 1024)
                return $"{bytes} B";
            double kb = bytes / 1024.0;
            if (kb < 1024)
                return $"{kb:0.0} KB";
            double mb = kb / 1024.0;
            if (mb < 1024)
                return $"{mb:0.0} MB";
            return $"{mb / 1024.0:0.0} GB";
        }

        private static string FormatBytesProgress(long read, long total) =>
            $"{FormatSize(read)} / {FormatSize(total)} ({read * 100L / total}%)";

        private static bool TryResolvePython(out string exe, out string prefixArgs)
        {
            exe = null;
            prefixArgs = null;
            if (TryPythonVersion("py", "-3"))
            {
                exe = "py";
                prefixArgs = "-3 ";
                return true;
            }

            if (TryPythonVersion("python", ""))
            {
                exe = "python";
                prefixArgs = "";
                return true;
            }

            if (File.Exists(@"C:\Windows\py.exe") && TryPythonVersion(@"C:\Windows\py.exe", "-3"))
            {
                exe = @"C:\Windows\py.exe";
                prefixArgs = "-3 ";
                return true;
            }

            return false;
        }

        private static bool TryPythonVersion(string fileName, string versionArgs)
        {
            try
            {
                var args = string.IsNullOrEmpty(versionArgs) ? "--version" : $"{versionArgs} --version";
                var psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = args,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };
                using (var p = Process.Start(psi))
                {
                    if (p == null)
                        return false;
                    p.WaitForExit(10000);
                    return p.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}

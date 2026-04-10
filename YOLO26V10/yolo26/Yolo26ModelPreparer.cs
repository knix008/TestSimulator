using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace YOLO26V10.yolo26
{
    /// <summary>
    /// GitHub?먯꽌 YOLO26-seg .pt瑜?諛쏄퀬, Python Ultralytics濡?ONNX濡?蹂?섑빀?덈떎.
    /// </summary>
    internal static class Yolo26ModelPreparer
    {
        /// <summary>ultralytics/assets 릴리스. v8.4.0에 YOLO26 사전학습 가중치(yolo26*.pt)가 포함됩니다.</summary>
        public const string DefaultReleaseTag = "v8.4.0";

        /// <summary>?ㅼ슫濡쒕뱶쨌蹂?섎맂 媛以묒튂(.pt) 諛?ONNX ????대뜑 (%LocalAppData%\YOLO26V10\model).</summary>
        public static string ModelDirectory =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "YOLO26V10",
                "model");

        /// <summary>紐⑤뜽 ????대뜑媛 ?놁쑝硫?留뚮벊?덈떎. ???쒖옉 ????踰??몄텧???먮㈃ ?먯깋湲곗뿉??寃쎈줈瑜??????덉뒿?덈떎.</summary>
        public static void EnsureModelDirectoryExists() => Directory.CreateDirectory(ModelDirectory);

        public static string GetPtPath(string variant, YoloModelKind kind)
        {
            var name = kind switch
            {
                YoloModelKind.Segmentation => $"yolo26{variant}-seg.pt",
                YoloModelKind.Detection => $"yolo26{variant}.pt",
                YoloModelKind.Pose => $"yolo26{variant}-pose.pt",
                YoloModelKind.Classify => $"yolo26{variant}-cls.pt",
                _ => $"yolo26{variant}.pt",
            };
            return Path.Combine(ModelDirectory, name);
        }

        public static string GetOnnxPath(string variant, YoloModelKind kind)
        {
            var name = kind switch
            {
                YoloModelKind.Segmentation => $"yolo26{variant}-seg.onnx",
                YoloModelKind.Detection => $"yolo26{variant}.onnx",
                YoloModelKind.Pose => $"yolo26{variant}-pose.onnx",
                YoloModelKind.Classify => $"yolo26{variant}-cls.onnx",
                _ => $"yolo26{variant}.onnx",
            };
            return Path.Combine(ModelDirectory, name);
        }

        public static string ReleaseDownloadFileName(string variant, YoloModelKind kind) =>
            kind switch
            {
                YoloModelKind.Segmentation => $"yolo26{variant}-seg.pt",
                YoloModelKind.Detection => $"yolo26{variant}.pt",
                YoloModelKind.Pose => $"yolo26{variant}-pose.pt",
                YoloModelKind.Classify => $"yolo26{variant}-cls.pt",
                _ => $"yolo26{variant}.pt",
            };

        /// <summary>하위 호환: 세그멘테이션 가중치 경로.</summary>
        public static string GetPtPath(string variant) => GetPtPath(variant, YoloModelKind.Segmentation);

        /// <summary>하위 호환: 세그멘테이션 ONNX 경로.</summary>
        public static string GetOnnxPath(string variant) => GetOnnxPath(variant, YoloModelKind.Segmentation);

        public static string GetExportScriptPath()
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            return Path.GetFullPath(Path.Combine(baseDir, "tools", "export_yolo26_onnx.py"));
        }

        public static async Task EnsureOnnxModelAsync(
            string variant,
            IProgress<string> log,
            CancellationToken cancellationToken,
            bool forceReexport = false,
            IProgress<ModelPrepareProgress> prepareProgress = null,
            YoloModelKind kind = YoloModelKind.Segmentation)
        {
            EnsureModelDirectoryExists();
            var pt = GetPtPath(variant, kind);
            var onnx = GetOnnxPath(variant, kind);
            var file = ReleaseDownloadFileName(variant, kind);
            if (!file.StartsWith("yolo26", StringComparison.OrdinalIgnoreCase) ||
                !file.EndsWith(".pt", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException(
                    "내부 오류: 다운로드 대상은 yolo26*.pt 여야 합니다. 실제 파일명: " + file);
            var url =
                $"https://github.com/ultralytics/assets/releases/download/{DefaultReleaseTag}/{file}";

            prepareProgress?.Report(new ModelPrepareProgress(ModelPreparePhase.Checking, 0, "Checking status..."));

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
                                        $"{FormatSize(readTotal)} 받는 중...(전체 용량 정보 없음)"));
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
                throw new FileNotFoundException("export 스크립트가 없습니다. tools 폴더를 출력 디렉터리로 복사했는지 확인하세요.", script);

            if (!TryResolvePython(out var pyExe, out var pyPrefixArgs))
                throw new InvalidOperationException(
                    "Python을 찾을 수 없습니다. Python 3 및 pip install ultralytics가 필요합니다.\n" +
                    "예: py -3 -m pip install -r tools\\requirements-export.txt");

            log?.Report("ONNX 변환 중(Ultralytics)... 잠시 걸릴 수 있습니다.");
            prepareProgress?.Report(new ModelPrepareProgress(
                ModelPreparePhase.Converting,
                0,
                "Converting ONNX... 0%"));

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

            using (var proc = new Process())
            {
                proc.StartInfo = psi;
                proc.EnableRaisingEvents = true;
                var stdBuilder = new StringBuilder();
                var errBuilder = new StringBuilder();
                var pctRegex = new Regex(@"(?<!\d)(\d{1,3})\s*%(?!\d)", RegexOptions.Compiled);
                var convertPercent = 0;
                var progressLock = new object();

                void ReportConvertProgress(int? percent, string detail = null)
                {
                    prepareProgress?.Report(new ModelPrepareProgress(
                        ModelPreparePhase.Converting,
                        percent,
                        detail ?? "Converting ONNX (Python / Ultralytics)..."));
                }

                void HandleOutputLine(string line, bool isError)
                {
                    if (string.IsNullOrWhiteSpace(line))
                        return;
                    if (isError)
                        errBuilder.AppendLine(line);
                    else
                        stdBuilder.AppendLine(line);

                    log?.Report(line);

                    var m = pctRegex.Match(line);
                    if (!m.Success)
                        return;
                    if (!int.TryParse(m.Groups[1].Value, out var parsed))
                        return;
                    if (parsed < 0)
                        parsed = 0;
                    if (parsed > 100)
                        parsed = 100;
                    if (parsed == 100)
                        parsed = 99;

                    lock (progressLock)
                    {
                        if (parsed <= convertPercent)
                            return;
                        convertPercent = parsed;
                        ReportConvertProgress(convertPercent, $"Converting ONNX... {convertPercent}%");
                    }
                }

                proc.OutputDataReceived += (_, e) => HandleOutputLine(e.Data, false);
                proc.ErrorDataReceived += (_, e) => HandleOutputLine(e.Data, true);

                if (!proc.Start())
                    throw new InvalidOperationException("Python process could not be started.");

                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                ReportConvertProgress(0, "Converting ONNX... 0%");

                try
                {
                    while (!proc.WaitForExit(500))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        lock (progressLock)
                        {
                            // Fallback smooth progress when python output has no percentage info.
                            if (convertPercent < 95)
                            {
                                convertPercent++;
                                ReportConvertProgress(convertPercent, $"Converting ONNX... {convertPercent}%");
                            }
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    try
                    {
                        if (!proc.HasExited)
                            proc.Kill();
                    }
                    catch
                    {
                        // Ignore termination race/permission errors on cancellation path.
                    }

                    throw;
                }

                proc.WaitForExit();
                cancellationToken.ThrowIfCancellationRequested();

                var err = errBuilder.ToString().Trim();
                var std = stdBuilder.ToString().Trim();
                if (proc.ExitCode != 0)
                    throw new InvalidOperationException(
                        $"ONNX 변환 실패 (코드 {proc.ExitCode}).\n{std}\n{err}");

                if (!string.IsNullOrWhiteSpace(std))
                    log?.Report(std);
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


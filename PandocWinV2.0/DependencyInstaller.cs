using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace PandocWinV2._0
{
    /// <summary>자동 설치 진행 단계(진행 표시줄 모드 전환용).</summary>
    internal enum DependencyInstallPhase
    {
        Downloading,
        RunningInstaller,
    }

    /// <summary>
    /// 공식 배포 파일을 내려받아 UAC(관리자) 설치를 시도한다.
    /// </summary>
    internal static class DependencyInstaller
    {
        private static readonly HttpClient Http = CreateHttp();

        private static HttpClient CreateHttp()
        {
            var c = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
            c.DefaultRequestHeaders.UserAgent.ParseAdd("PandocWinV2.0/2.0 (Windows; dependency auto-install)");
            return c;
        }

        internal static DependencyInstallTarget? GetInstallTarget(string probeName) =>
            probeName.ToLowerInvariant() switch
            {
                "pandoc"      => DependencyInstallTarget.Pandoc,
                "wkhtmltopdf" => DependencyInstallTarget.Wkhtmltopdf,
                "xelatex" or "lualatex" or "pdflatex" => DependencyInstallTarget.MiktexBasic,
                _ => null,
            };

        internal static bool CanAutoInstall(string probeName) => GetInstallTarget(probeName) is not null;

        /// <summary>
        /// 설치기가 갱신한 시스템 PATH를 현재 프로세스에 반영한다(재시작 없이 <c>pandoc</c> 등을 찾기 위함).
        /// </summary>
        internal static void RefreshProcessPathFromRegistry()
        {
            try
            {
                string machine = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine) ?? "";
                string user    = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User) ?? "";
                string merged  = string.Join(';', new[] { machine, user }.Where(static s => !string.IsNullOrWhiteSpace(s)));
                Environment.SetEnvironmentVariable("Path", merged, EnvironmentVariableTarget.Process);
            }
            catch
            {
                // 무시
            }
        }

        internal static string DisplayName(DependencyInstallTarget t) => t switch
        {
            DependencyInstallTarget.Pandoc        => "Pandoc",
            DependencyInstallTarget.MiktexBasic   => "MiKTeX (Basic, xelatex 등)",
            DependencyInstallTarget.Wkhtmltopdf => "wkhtmltopdf",
            _ => t.ToString(),
        };

        /// <summary>
        /// 다운로드 후 설치 프로그램을 실행하고 종료까지 대기한다. 오류 시 사용자에게 표시할 메시지를 반환한다.
        /// </summary>
        internal static async Task<string?> InstallAsync(
            DependencyInstallTarget target,
            IProgress<string>? status,
            IProgress<int>? downloadPercent,
            IProgress<DependencyInstallPhase>? installPhase = null,
            CancellationToken cancellationToken = default)
        {
            string? dir = null;
            string? setupPath = null;

            try
            {
                dir = Path.Combine(Path.GetTempPath(), "PandocWinV2.0-InstallCache");
                Directory.CreateDirectory(dir);

                status?.Report("다운로드 준비 중…");
                installPhase?.Report(DependencyInstallPhase.Downloading);

                setupPath = target switch
                {
                    DependencyInstallTarget.Pandoc        => await DownloadPandocMsiAsync(dir, downloadPercent, cancellationToken),
                    DependencyInstallTarget.MiktexBasic   => await DownloadMiktexBasicAsync(dir, downloadPercent, cancellationToken),
                    DependencyInstallTarget.Wkhtmltopdf => await DownloadWkhtmltopdfAsync(dir, downloadPercent, cancellationToken),
                    _ => throw new InvalidOperationException(),
                };

                installPhase?.Report(DependencyInstallPhase.RunningInstaller);
                status?.Report("설치 프로그램을 실행합니다. UAC 창이 뜨면 허용해 주세요…");

                int exit = target switch
                {
                    DependencyInstallTarget.Pandoc => await RunElevatedAsync(
                        Path.Combine(Environment.SystemDirectory, "msiexec.exe"),
                        $"/i \"{setupPath}\" /qn /norestart ALLUSERS=1",
                        cancellationToken),
                    DependencyInstallTarget.MiktexBasic => await RunElevatedAsync(
                        setupPath,
                        "--unattended --shared",
                        cancellationToken),
                    DependencyInstallTarget.Wkhtmltopdf => await RunElevatedAsync(
                        setupPath,
                        "/S",
                        cancellationToken),
                    _ => -1,
                };

                if (exit is 0 or 3010)
                {
                    status?.Report("설치가 완료되었습니다.");
                    return null;
                }

                return $"설치 프로그램이 비정상 종료되었습니다. (종료 코드: {exit})";
            }
            catch (OperationCanceledException)
            {
                return "작업이 취소되었습니다.";
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
            finally
            {
                TryDelete(setupPath);
                // 빈 캐시 폴더만 정리
                try
                {
                    if (dir is not null && Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any())
                        Directory.Delete(dir);
                }
                catch { /* ignore */ }
            }
        }

        private static async Task<string> DownloadPandocMsiAsync(
            string dir, IProgress<int>? pct, CancellationToken ct)
        {
            const string api = "https://api.github.com/repos/jgm/pandoc/releases/latest";
            string json = await Http.GetStringAsync(api, ct);
            var root = JsonNode.Parse(json) ?? throw new InvalidOperationException("Pandoc 릴리스 정보를 읽을 수 없습니다.");

            string? url = null;
            string? name = null;
            foreach (var a in root["assets"]?.AsArray() ?? [])
            {
                string n = a?["name"]?.GetValue<string>() ?? "";
                if (n.EndsWith("windows-x86_64.msi", StringComparison.OrdinalIgnoreCase))
                {
                    name = n;
                    url  = a?["browser_download_url"]?.GetValue<string>();
                    break;
                }
            }

            if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(name))
                throw new InvalidOperationException("Pandoc Windows MSI 다운로드 주소를 찾지 못했습니다.");

            string path = Path.Combine(dir, name);
            await DownloadToFileAsync(url, path, pct, ct);
            return path;
        }

        private static readonly Regex MiktexHref = new(
            @"href=[""'](/download/ctan/systems/win32/miktex/setup/windows-x64/basic-miktex-[^""']+\.exe)[""']",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        private static async Task<string> DownloadMiktexBasicAsync(
            string dir, IProgress<int>? pct, CancellationToken ct)
        {
            string page = await Http.GetStringAsync("https://miktex.org/download", ct);
            Match m = MiktexHref.Match(page);
            if (!m.Success)
                throw new InvalidOperationException("MiKTeX Basic 설치 파일 링크를 페이지에서 찾지 못했습니다.");

            string relative = m.Groups[1].Value;
            string url      = "https://miktex.org" + relative;
            string fileName = relative.Split('/').Last();
            string path = Path.Combine(dir, fileName);

            await DownloadToFileAsync(url, path, pct, ct);
            return path;
        }

        // 최신 packaging 릴리스에 Windows 빌드가 없어, 검증된 0.12.6-1 win64 설치 파일을 사용한다.
        private const string WkhtmlFixedUrl =
            "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe";

        private static async Task<string> DownloadWkhtmltopdfAsync(
            string dir, IProgress<int>? pct, CancellationToken ct)
        {
            string name = "wkhtmltox-0.12.6-1.msvc2015-win64.exe";
            string path = Path.Combine(dir, name);
            await DownloadToFileAsync(WkhtmlFixedUrl, path, pct, ct);
            return path;
        }

        private static async Task DownloadToFileAsync(
            string url, string path, IProgress<int>? pct, CancellationToken ct)
        {
            using HttpResponseMessage resp = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            resp.EnsureSuccessStatusCode();

            long? total = resp.Content.Headers.ContentLength;
            await using Stream stream = await resp.Content.ReadAsStreamAsync(ct);
            await using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true);

            var buffer = new byte[81920];
            long read = 0;
            int n;
            while ((n = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct)) > 0)
            {
                await fs.WriteAsync(buffer.AsMemory(0, n), ct);
                read += n;
                if (total is > 0 && pct is not null)
                {
                    int p = (int)(read * 100 / total.Value);
                    if (p > 100) p = 100;
                    pct.Report(p);
                }
            }

            pct?.Report(100);
        }

        /// <summary>
        /// 관리자 권한으로 자식 프로세스를 실행하고 종료 코드를 반환한다.
        /// </summary>
        private static async Task<int> RunElevatedAsync(string fileName, string arguments, CancellationToken ct)
        {
            var psi = new ProcessStartInfo
            {
                FileName        = fileName,
                Arguments       = arguments,
                UseShellExecute = true,
                Verb            = "runas",
            };

            using var proc = Process.Start(psi);
            if (proc is null)
                return -1;

            await proc.WaitForExitAsync(ct);
            return proc.ExitCode;
        }

        private static void TryDelete(string? path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
            try { File.Delete(path); } catch { /* 설치기가 잠깐 잡고 있을 수 있음 */ }
        }
    }

    internal enum DependencyInstallTarget
    {
        Pandoc,
        MiktexBasic,
        Wkhtmltopdf,
    }
}

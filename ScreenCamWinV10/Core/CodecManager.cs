using System.IO;
using System.Diagnostics;
using System.Net.Http;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using ScreenCamWin.Models;
using ScreenCamWin.Native;

namespace ScreenCamWin.Core;

public enum CodecStatus
{
    Available,
    RegisteredButUnloadable,
    Only32Bit,
    NotInstalled,
    /// <summary>64-bit VFW/ICM has no compressors (common on Windows 10/11 x64).</summary>
    VfwUnavailable,
}

public static class CodecManager
{
    // ── Availability ─────────────────────────────────────────────────────────

    public static bool IsCodecAvailable(CodecInfo codec)
        => GetCodecStatus(codec) == CodecStatus.Available;

    public static CodecStatus GetCodecStatus(CodecInfo codec)
    {
        if (codec.IsBuiltIn) return CodecStatus.Available;

        // Primary: try to actually open (load) the codec
        if (CanOpenVfwCodec(codec.FourCC)) return CodecStatus.Available;

        // Secondary: is it registered in the registry but fails to load?
        bool in64Registry = IsInRegistry(codec.FourCC, wow64: false);
        bool in32Registry = IsInRegistry(codec.FourCC, wow64: true);

        if (in64Registry || in32Registry)
        {
            if (IntPtr.Size == 8 && in32Registry && !in64Registry)
                return CodecStatus.Only32Bit;
            if (IntPtr.Size == 4 && in64Registry && !in32Registry)
                return CodecStatus.Only32Bit;
            if (IntPtr.Size == 8 && IsVfwSubsystemEmpty())
                return CodecStatus.VfwUnavailable;
            return CodecStatus.RegisteredButUnloadable;
        }

        return CodecStatus.NotInstalled;
    }

    private static bool CanOpenVfwCodec(string fourcc)
    {
        TryPreloadDriverDll(fourcc);
        try
        {
            uint fcc = NativeMethods.FourCCToUInt(fourcc);
            IntPtr hic = NativeMethods.ICOpen(
                NativeMethods.ICTYPE_VIDEO, fcc, NativeMethods.ICMODE_COMPRESS);
            if (hic != IntPtr.Zero) { NativeMethods.ICClose(hic); return true; }
        }
        catch { }
        return false;
    }

    private static void TryPreloadDriverDll(string fourcc)
    {
        foreach (bool wow64 in new[] { false, true })
        {
            string? dll = ResolveDriverDllPath(fourcc, wow64);
            if (dll is not null && File.Exists(dll))
                NativeMethods.LoadLibrary(dll);
        }
    }

    private static string? ResolveDriverDllPath(string fourcc, bool wow64)
    {
        try
        {
            string regPath = wow64
                ? @"SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Drivers32"
                : @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Drivers32";
            using var key = Registry.LocalMachine.OpenSubKey(regPath);
            string? fileName = key?.GetValue($"vidc.{fourcc}") as string;
            if (string.IsNullOrWhiteSpace(fileName)) return null;

            string sysDir = wow64
                ? Environment.GetFolderPath(Environment.SpecialFolder.SystemX86)
                : Environment.SystemDirectory;
            return Path.Combine(sysDir, fileName);
        }
        catch { return null; }
    }

    private static bool? _vfwSubsystemEmpty;

    private static bool IsVfwSubsystemEmpty()
    {
        if (_vfwSubsystemEmpty.HasValue) return _vfwSubsystemEmpty.Value;
        bool empty = true;
        try
        {
            uint next = 0;
            var ic = new NativeMethods.ICINFO
            {
                dwSize = (uint)Marshal.SizeOf<NativeMethods.ICINFO>(),
            };
            while (NativeMethods.ICInfo(NativeMethods.ICTYPE_VIDEO, next, ref ic))
            {
                empty = false;
                break;
            }
        }
        catch { }
        _vfwSubsystemEmpty = empty;
        return empty;
    }

    private static bool IsInRegistry(string fourcc, bool wow64)
    {
        try
        {
            string path = wow64
                ? @"SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Drivers32"
                : @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Drivers32";
            using var key = Registry.LocalMachine.OpenSubKey(path);
            if (key is null) return false;
            foreach (var name in key.GetValueNames())
                if (name.StartsWith("vidc.", StringComparison.OrdinalIgnoreCase) &&
                    name.EndsWith(fourcc, StringComparison.OrdinalIgnoreCase))
                    return true;
        }
        catch { }
        return false;
    }

    // ── Install ───────────────────────────────────────────────────────────────

    public static async Task<InstallResult> DownloadAndInstallAsync(
        CodecInfo codec,
        IProgress<(int Percent, string Status)> progress,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(codec.DirectDownloadUrl))
        {
            OpenDownloadPage(codec);
            return new InstallResult(false,
                $"브라우저에서 다운로드 페이지를 열었습니다.\n\n" +
                $"이 앱은 64비트입니다 — 반드시 64비트 파일을 선택하세요.\n\n" +
                $"설치 후 앱을 재시작하면 코덱이 인식됩니다.",
                BrowserOpened: true);
        }

        string tmpDir        = Path.Combine(Path.GetTempPath(), "ScreenCamWin");
        Directory.CreateDirectory(tmpDir);
        string installerPath = Path.Combine(tmpDir, $"{codec.FourCC}_setup.exe");

        try
        {
            // ── Download ──────────────────────────────────────────────────────
            progress.Report((0, "다운로드 중..."));
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
                http.DefaultRequestHeaders.UserAgent.ParseAdd("ScreenCamWin/1.0");
                using var resp = await http.GetAsync(codec.DirectDownloadUrl,
                    HttpCompletionOption.ResponseHeadersRead, ct);
                resp.EnsureSuccessStatusCode();
                long? total = resp.Content.Headers.ContentLength;
                await using var src  = await resp.Content.ReadAsStreamAsync(ct);
                await using var dest = new FileStream(installerPath, FileMode.Create,
                    FileAccess.Write, FileShare.None, 81920, useAsync: true);
                var buf = new byte[81920]; long written = 0; int read;
                while ((read = await src.ReadAsync(buf, ct)) > 0)
                {
                    await dest.WriteAsync(buf.AsMemory(0, read), ct);
                    written += read;
                    if (total > 0) progress.Report(((int)(written * 85 / total.Value),
                        $"다운로드 중... {written / 1024:N0} KB / {total / 1024:N0} KB"));
                }
                await dest.FlushAsync(ct);
            } // file fully closed here

            // ── Validate ──────────────────────────────────────────────────────
            if (!IsPeExecutable(installerPath))
            {
                try { File.Delete(installerPath); } catch { }
                OpenDownloadPage(codec);
                return new InstallResult(false,
                    "다운로드 링크가 만료되었거나 변경되었습니다.\n브라우저에서 직접 내려받아 설치해 주세요.",
                    BrowserOpened: true);
            }

            // ── Run installer ─────────────────────────────────────────────────
            progress.Report((90, "설치 중... (UAC 허용 필요)"));
            using var proc = Process.Start(new ProcessStartInfo(installerPath)
                { Arguments = "/S", UseShellExecute = true, Verb = "runas" });
            if (proc is not null) await proc.WaitForExitAsync(ct);

            // ── Verify ────────────────────────────────────────────────────────
            progress.Report((98, "설치 확인 중..."));
            await Task.Delay(800, ct);

            return GetCodecStatus(codec) switch
            {
                CodecStatus.Available => new InstallResult(true,
                    $"{codec.DisplayName} 설치 완료!"),
                CodecStatus.VfwUnavailable => new InstallResult(false,
                    "코덱 DLL은 설치되어 있으나, Windows 64비트의 VFW(ICM)에서\n" +
                    "압축 코덱을 사용할 수 없습니다.\n\n" +
                    "'H.264 (Windows 내장, .mp4)' 코덱을 사용해 주세요."),
                CodecStatus.RegisteredButUnloadable => new InstallResult(false,
                    "코덱이 등록되었지만 로드할 수 없습니다.\n" +
                    "이 앱은 64비트입니다. 64비트 코덱 DLL이 설치되었는지 확인하세요."),
                _ => new InstallResult(false,
                    "설치되었지만 코덱이 감지되지 않습니다.\n앱을 재시작한 후 다시 확인해 주세요."),
            };
        }
        catch (OperationCanceledException) { return new InstallResult(false, "취소되었습니다."); }
        catch (Exception ex)               { return new InstallResult(false, $"설치 실패: {ex.Message}"); }
        finally { try { File.Delete(installerPath); } catch { } }
    }

    public static void OpenDownloadPage(CodecInfo codec)
    {
        string? url = codec.DownloadPageUrl ?? codec.DirectDownloadUrl;
        if (!string.IsNullOrEmpty(url))
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    private static bool IsPeExecutable(string path)
    {
        try
        {
            using var fs = File.OpenRead(path);
            var h = new byte[2];
            return fs.Read(h, 0, 2) == 2 && h[0] == 0x4D && h[1] == 0x5A;
        }
        catch { return false; }
    }
}

public record InstallResult(bool Success, string Message, bool BrowserOpened = false);

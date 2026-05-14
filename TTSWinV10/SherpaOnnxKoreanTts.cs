using System.Diagnostics;
using System.Globalization;
using System.Net.Http;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using SherpaOnnx;

namespace TTSWinV10;

/// <summary>
/// Sherpa-ONNX 오프라인 TTS — 한국어 Mimic3/KSS low 모델
/// (<c>vits-mimic3-ko_KO-kss_low</c>, GitHub k2-fsa sherpa-onnx tts-models 릴리스).
/// </summary>
/// <remarks>
/// ONNX·토큰·espeak 데이터를 <b>원하는 폴더</b>에 둘 수 있습니다.
/// <list type="bullet">
/// <item><description><c>TTSWINV10_SHERPA_KO_MODEL_DIR</c> — 모델 폴더 전체 경로( onnx, tokens.txt, espeak-ng-data 가 바로 그 안에 있음).</description></item>
/// <item><description><c>TTSWINV10_SHERPA_MODELS_ROOT</c> — 그 아래에 <c>sherpa-onnx-models\vits-mimic3-ko_KO-kss_low\</c> 구조로 쓰거나 받습니다.</description></item>
/// <item><description>실행 파일과 같은 폴더의 <c>SherpaKoModelDir.txt</c> — 한 줄에 위와 같은 모델 폴더 전체 경로.</description></item>
/// <item><description><c>SherpaModelsRoot.txt</c> — 한 줄에 <c>TTSWINV10_SHERPA_MODELS_ROOT</c>와 동일 의미의 경로.</description></item>
/// </list>
/// 환경 변수가 설정 파일보다 우선합니다. 경로에 <c>%USERNAME%</c> 등을 쓸 수 있습니다.
/// </remarks>
internal static class SherpaOnnxKoreanTts
{
    internal const string ModelFolderName = "vits-mimic3-ko_KO-kss_low";
    internal const string ModelsRootFolderName = "sherpa-onnx-models";
    internal const string ModelDownloadUrl =
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mimic3-ko_KO-kss_low.tar.bz2";

    /// <summary>모델 폴더 전체를 가리키는 환경 변수 이름.</summary>
    internal const string EnvKoModelDir = "TTSWINV10_SHERPA_KO_MODEL_DIR";

    /// <summary><c>sherpa-onnx-models</c>의 상위 디렉터리(저장 루트).</summary>
    internal const string EnvModelsRoot = "TTSWINV10_SHERPA_MODELS_ROOT";

    internal const string FileKoModelDir = "SherpaKoModelDir.txt";
    internal const string FileModelsRoot = "SherpaModelsRoot.txt";

    private const string OnnxFileName = "ko_KO-kss_low.onnx";
    private const string TokensFileName = "tokens.txt";
    private const string EspeakDataDirName = "espeak-ng-data";

    private static readonly object DownloadLock = new();

    /// <summary>실행 파일·사용자 설정·사용자 데이터 폴더에서 모델 루트를 찾습니다.</summary>
    internal static string? TryResolveModelDirectory()
    {
        string baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string localData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TTSWinV10");

        foreach (string? dir in EnumerateModelDirectoryCandidates(baseDir, localData))
        {
            if (dir is not null && IsModelDirectoryComplete(dir))
            {
                return dir;
            }
        }

        return null;
    }

    private static IEnumerable<string?> EnumerateModelDirectoryCandidates(string baseDir, string localData)
    {
        string? koFromEnv = NormalizeOptionalPath(Environment.GetEnvironmentVariable(EnvKoModelDir), baseDir);
        if (koFromEnv is not null)
        {
            yield return koFromEnv;
        }

        string? koFromFile = NormalizeOptionalPath(ReadFirstNonCommentLine(Path.Combine(baseDir, FileKoModelDir)), baseDir);
        if (koFromFile is not null)
        {
            yield return koFromFile;
        }

        string? storeRoot = TryGetConfiguredModelsStoreRoot(baseDir);
        if (storeRoot is not null)
        {
            yield return Path.Combine(storeRoot, ModelsRootFolderName, ModelFolderName);
        }

        yield return Path.Combine(baseDir, ModelsRootFolderName, ModelFolderName);
        yield return Path.Combine(baseDir, ModelFolderName);
        yield return Path.Combine(localData, ModelsRootFolderName, ModelFolderName);
    }

    /// <summary>
    /// 자동 설치 시 tar의 <c>-C</c> 대상이 될 부모 경로.
    /// 사용자가 <see cref="EnvKoModelDir"/>로 <c>...\vits-mimic3-ko_KO-kss_low</c> 를 지정한 경우 그 부모를 반환합니다.
    /// </summary>
    private static string? TryGetTarExtractParentFromExplicitKoModelDir(string baseDir)
    {
        string? raw = Environment.GetEnvironmentVariable(EnvKoModelDir);
        if (string.IsNullOrWhiteSpace(raw))
        {
            raw = ReadFirstNonCommentLine(Path.Combine(baseDir, FileKoModelDir));
        }

        string? full = NormalizeOptionalPath(raw, baseDir);
        if (full is null)
        {
            return null;
        }

        string trimmed = full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!string.Equals(Path.GetFileName(trimmed), ModelFolderName, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return Path.GetDirectoryName(trimmed);
    }

    private static string? TryGetConfiguredModelsStoreRoot(string baseDir)
    {
        string? fromEnv = NormalizeOptionalPath(Environment.GetEnvironmentVariable(EnvModelsRoot), baseDir);
        if (fromEnv is not null)
        {
            return fromEnv;
        }

        return NormalizeOptionalPath(ReadFirstNonCommentLine(Path.Combine(baseDir, FileModelsRoot)), baseDir);
    }

    private static string? ReadFirstNonCommentLine(string filePath)
    {
        if (!File.Exists(filePath))
        {
            return null;
        }

        foreach (string line in File.ReadAllLines(filePath))
        {
            string t = line.Trim();
            if (t.Length == 0 || t.StartsWith("#", StringComparison.Ordinal))
            {
                continue;
            }

            return t;
        }

        return null;
    }

    private static string? NormalizeOptionalPath(string? raw, string baseDir)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        string r0 = raw!;
        string r = r0.Trim();
        string expanded = Environment.ExpandEnvironmentVariables(r);
        if (expanded.Length == 0)
        {
            return null;
        }

        string full = Path.IsPathRooted(expanded)
            ? Path.GetFullPath(expanded)
            : Path.GetFullPath(Path.Combine(baseDir, expanded));
        return full;
    }

    private static bool IsDirectoryWritable(string directoryPath)
    {
        try
        {
            Directory.CreateDirectory(directoryPath);
            string probe = Path.Combine(directoryPath, ".ttswinv10_write_probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
        catch (IOException)
        {
            return false;
        }
    }

    /// <summary>모델이 없으면 공식 아카이브를 내려받아 압축을 풉니다(스레드 안전).</summary>
    internal static void EnsureModelPresent(Action<string>? status, CancellationToken cancellationToken)
    {
        if (TryResolveModelDirectory() is not null)
        {
            return;
        }

        lock (DownloadLock)
        {
            if (TryResolveModelDirectory() is not null)
            {
                return;
            }

            status?.Invoke("Sherpa 한국어 모델 준비 중…");
            cancellationToken.ThrowIfCancellationRequested();

            string baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string? tarParentOverride = TryGetTarExtractParentFromExplicitKoModelDir(baseDir);
            string extractDir;
            string incomplete;
            if (tarParentOverride is { Length: > 0 } tp && IsDirectoryWritable(tp))
            {
                status?.Invoke($"지정한 위치에 압축을 풉니다: {tp}");
                extractDir = tp;
                incomplete = Path.Combine(extractDir, ModelFolderName);
            }
            else
            {
                string modelsStoreRoot = GetModelsStoreRootForDownload(status, baseDir);
                extractDir = Path.Combine(modelsStoreRoot, ModelsRootFolderName);
                incomplete = Path.Combine(extractDir, ModelFolderName);
            }

            Directory.CreateDirectory(extractDir);
            if (Directory.Exists(incomplete) && !IsModelDirectoryComplete(incomplete))
            {
                TryDeleteDirectoryRecursive(incomplete);
            }

            string tempArchive = Path.Combine(
                Path.GetTempPath(),
                "ttswinv10-sherpa-ko-" + Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture) + ".tar.bz2");
            try
            {
                status?.Invoke("Sherpa 한국어 모델 다운로드 중…");
                DownloadModelArchive(tempArchive, status, cancellationToken);

                status?.Invoke("Sherpa 한국어 모델 압축 해제 중…");
                ExtractTarBz2(tempArchive, extractDir, cancellationToken);

                if (!IsModelDirectoryComplete(incomplete))
                {
                    throw new InvalidOperationException(
                        "다운로드한 모델이 올바르지 않습니다. "
                        + $"수동 설치: {ModelDownloadUrl}");
                }
            }
            finally
            {
                TryDeleteFile(tempArchive);
            }
        }

        if (TryResolveModelDirectory() is null)
        {
            throw new InvalidOperationException("Sherpa ONNX 한국어 모델을 준비하지 못했습니다.");
        }
    }

    /// <summary><c>sherpa-onnx-models</c>의 상위 경로(저장 루트). 환경 변수·설정 파일을 반영합니다.</summary>
    private static string GetModelsStoreRootForDownload(Action<string>? status, string baseDir)
    {
        string? configured = TryGetConfiguredModelsStoreRoot(baseDir);
        if (configured is not null && IsDirectoryWritable(configured))
        {
            status?.Invoke($"Sherpa 모델 저장 루트: {configured}");
            return configured;
        }

        if (configured is not null)
        {
            status?.Invoke("설정한 Sherpa 모델 저장 루트에 쓸 수 없어 기본 위치를 사용합니다.");
        }

        return GetWritableExtractParentDirectory(status, baseDir);
    }

    private static string GetWritableExtractParentDirectory(Action<string>? status, string baseDir)
    {
        string testDir = Path.Combine(baseDir, ModelsRootFolderName);
        try
        {
            Directory.CreateDirectory(testDir);
            string probe = Path.Combine(testDir, ".ttswinv10_write_probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return baseDir;
        }
        catch (UnauthorizedAccessException)
        {
        }
        catch (IOException)
        {
        }

        status?.Invoke("프로그램 폴더에 쓸 수 없어 사용자 데이터에 저장합니다…");
        string fallback = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TTSWinV10");
        Directory.CreateDirectory(fallback);
        return fallback;
    }

    private static void DownloadModelArchive(string destPath, Action<string>? status, CancellationToken cancellationToken)
    {
        using var client = new HttpClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("TTSWinV10/1.0 (Sherpa-ONNX model fetch; +https://github.com/k2-fsa/sherpa-onnx)");
        client.Timeout = TimeSpan.FromMinutes(45);

        using HttpResponseMessage response = client
            .GetAsync(ModelDownloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .GetAwaiter()
            .GetResult();
        response.EnsureSuccessStatusCode();

        long? totalLen = response.Content.Headers.ContentLength;
        using Stream readStream = response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();
        using var fileOut = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None, 1024 * 1024, FileOptions.SequentialScan);
        byte[] buffer = new byte[1024 * 128];
        long done = 0;
        int lastPct = -1;
        int read;
        while ((read = readStream.Read(buffer, 0, buffer.Length)) > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            fileOut.Write(buffer, 0, read);
            done += read;
            if (totalLen is long tot && tot > 0)
            {
                int pct = (int)Math.Min(100, Math.Max(0, 100 * done / tot));
                if (pct != lastPct && pct % 5 == 0)
                {
                    lastPct = pct;
                    status?.Invoke($"Sherpa 한국어 모델 다운로드 중… {pct}%");
                }
            }
        }

        fileOut.Flush();
        if (new FileInfo(destPath).Length < 512 * 1024)
        {
            throw new InvalidOperationException("다운로드한 파일이 너무 작습니다. 네트워크 또는 프록시를 확인해 주세요.");
        }
    }

    private static void ExtractTarBz2(string archivePath, string extractDir, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        string tarExe = Path.Combine(Environment.SystemDirectory, "tar.exe");
        if (!File.Exists(tarExe))
        {
            tarExe = "tar";
        }

        string args = $"-xjf \"{archivePath}\" -C \"{extractDir}\"";
        var psi = new ProcessStartInfo(tarExe, args)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using Process? p = Process.Start(psi);
        if (p is null)
        {
            throw new InvalidOperationException("압축 해제(tar) 프로세스를 시작할 수 없습니다.");
        }

        p.WaitForExit();
        cancellationToken.ThrowIfCancellationRequested();
        if (p.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"압축 해제가 실패했습니다(exit {p.ExitCode}). Windows 10 이상의 tar가 필요합니다.");
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private static void TryDeleteDirectoryRecursive(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    internal static bool IsModelDirectoryComplete(string? dir)
    {
        if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir))
        {
            return false;
        }

        return File.Exists(Path.Combine(dir, OnnxFileName))
            && File.Exists(Path.Combine(dir, TokensFileName))
            && Directory.Exists(Path.Combine(dir, EspeakDataDirName));
    }

    /// <summary>WAV 바이트 생성. 실패 시 예외.</summary>
    internal static byte[] SynthesizeToWavBytes(
        string text,
        float speed,
        int speakerId,
        float synthVolume01,
        CancellationToken cancellationToken,
        Action<string>? downloadStatus = null)
    {
        cancellationToken.ThrowIfCancellationRequested();

        EnsureModelPresent(downloadStatus, cancellationToken);

        string? modelDir = TryResolveModelDirectory();
        if (modelDir is null)
        {
            throw new InvalidOperationException(
                "Sherpa ONNX 한국어 모델을 준비했지만 폴더를 찾을 수 없습니다. "
                + $"수동 설치: {ModelDownloadUrl}");
        }

        OfflineTtsConfig config = default;
        config.Model.Vits.Model = Path.Combine(modelDir, OnnxFileName);
        config.Model.Vits.Tokens = Path.Combine(modelDir, TokensFileName);
        config.Model.Vits.Lexicon = "";
        config.Model.Vits.DataDir = Path.Combine(modelDir, EspeakDataDirName);
        config.Model.Vits.NoiseScale = 0.667f;
        config.Model.Vits.NoiseScaleW = 0.8f;
        config.Model.Vits.LengthScale = 1f;
        config.Model.NumThreads = 2;
        config.Model.Debug = 0;
        config.Model.Provider = "cpu";
        config.MaxNumSentences = 1;

        cancellationToken.ThrowIfCancellationRequested();

        using var tts = new OfflineTts(config);
        OfflineTtsGeneratedAudio audio = tts.Generate(text, speed, speakerId);
        try
        {
            string tmp = Path.Combine(Path.GetTempPath(), "ttswinv10-sherpa-" + Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture) + ".wav");
            try
            {
                if (!audio.SaveToWaveFile(tmp))
                {
                    throw new InvalidOperationException("Sherpa ONNX가 WAV 파일을 쓰지 못했습니다.");
                }

                byte[] raw = File.ReadAllBytes(tmp);
                if (!IsLikelyWavePcm(raw))
                {
                    throw new InvalidOperationException("Sherpa ONNX 출력이 RIFF WAV 형식이 아닙니다.");
                }

                return ApplySynthVolumeToWaveBytes(raw, synthVolume01);
            }
            finally
            {
                try
                {
                    File.Delete(tmp);
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }
        finally
        {
            audio.Dispose();
        }
    }

    private static bool IsLikelyWavePcm(byte[] data)
    {
        if (data.Length < 12)
        {
            return false;
        }

        return data[0] == (byte)'R'
            && data[1] == (byte)'I'
            && data[2] == (byte)'F'
            && data[3] == (byte)'F'
            && data[8] == (byte)'W'
            && data[9] == (byte)'A'
            && data[10] == (byte)'V'
            && data[11] == (byte)'E';
    }

    private static byte[] ApplySynthVolumeToWaveBytes(byte[] wavBytes, float volume01)
    {
        if (volume01 >= 0.999f && volume01 <= 1.001f)
        {
            return wavBytes;
        }

        float v = volume01;
        if (v < 0f)
        {
            v = 0f;
        }
        else if (v > 1f)
        {
            v = 1f;
        }

        using var msIn = new MemoryStream(wavBytes, writable: false);
        using var reader = new WaveFileReader(msIn);
        var vol = new VolumeSampleProvider(reader.ToSampleProvider()) { Volume = v };
        IWaveProvider wave16 = vol.ToWaveProvider16();
        try
        {
            using var msOut = new MemoryStream();
            using (var writer = new WaveFileWriter(msOut, wave16.WaveFormat))
            {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = wave16.Read(buffer, 0, buffer.Length)) > 0)
                {
                    writer.Write(buffer, 0, read);
                }
            }

            return msOut.ToArray();
        }
        finally
        {
            if (wave16 is IDisposable d)
            {
                d.Dispose();
            }
        }
    }
}

using System.IO;
using Whisper.net;

namespace STTWinV20.Services;

public sealed class SttProcessor : IDisposable
{
    // Korean initial prompt for mic mode (suppresses hallucination on short silences)
    private const string MicPrompt =
        "안녕하세요. 다음은 한국어 대화입니다. 경비, 출퇴근, 회의 등 일상적인 내용입니다.";

    private WhisperFactory? _factory;
    private WhisperProcessor? _micProcessor;
    private WhisperProcessor? _fileProcessor;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private bool _disposed;

    public bool IsInitialized { get; private set; }

    public event EventHandler<string>? TranscriptionReceived;
    public event EventHandler<string>? ErrorOccurred;

    public async Task InitializeAsync(string modelPath, CancellationToken ct = default)
    {
        if (IsInitialized) return;

        if (!File.Exists(modelPath))
            throw new FileNotFoundException("모델 파일이 없습니다.", modelPath);

        await Task.Run(() =>
        {
            _factory = WhisperFactory.FromPath(modelPath);

            // Mic mode: use initial prompt to guide Korean recognition
            _micProcessor = _factory.CreateBuilder()
                .WithLanguage("ko")
                .WithPrompt(MicPrompt)
                .Build();

            // File mode: no initial prompt (prevents hallucination on quiet audio)
            _fileProcessor = _factory.CreateBuilder()
                .WithLanguage("ko")
                .Build();
        }, ct);

        IsInitialized = true;
    }

    // Process a single VAD segment. isFileMod=true uses file-mode processor.
    public async Task ProcessSegmentAsync(float[] audio, bool isFileMode, CancellationToken ct = default)
    {
        if (_disposed || !IsInitialized) return;

        await _lock.WaitAsync(ct);
        try
        {
            var processor = isFileMode ? _fileProcessor : _micProcessor;
            if (processor == null) return;

            await foreach (var seg in processor.ProcessAsync(audio, ct))
            {
                var text = seg.Text?.Trim();
                if (OutputFilter.Accept(text))
                    TranscriptionReceived?.Invoke(this, text!);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, $"STT 오류: {ex.Message}");
        }
        finally
        {
            SafeRelease();
        }
    }

    private void SafeRelease()
    {
        try { _lock.Release(); }
        catch (ObjectDisposedException) { }
        catch (SemaphoreFullException) { }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try { _lock.Wait(500); } catch { }

        _micProcessor?.Dispose();
        _fileProcessor?.Dispose();
        _factory?.Dispose();
        _micProcessor = null;
        _fileProcessor = null;
        _factory = null;
        IsInitialized = false;

        SafeRelease();
        _lock.Dispose();
    }
}

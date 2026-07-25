using LibVLCSharp.Shared;

namespace RTSPCall.Core.Services;

public sealed class RtspPlayerService : IDisposable
{
    private readonly LibVLC _libVlc;
    private MediaPlayer? _player;
    private Media? _media;
    private IntPtr _hwnd;
    private string? _lastUrl;

    public MediaPlayer Player => _player ?? throw new InvalidOperationException("Player not created.");
    public string? LastUrl => _lastUrl;

    public event Action<string>? Log;

    public RtspPlayerService()
    {
        LibVLCSharp.Shared.Core.Initialize();
        _libVlc = new LibVLC(
            "--network-caching=400",
            "--live-caching=400",
            "--clock-jitter=0",
            "--clock-synchro=0",
            "--avcodec-hw=none",
            "--vout=direct3d11",
            "--aout=directsound",
            "--no-video-title-show",
            "--verbose=1");
        _player = new MediaPlayer(_libVlc)
        {
            EnableHardwareDecoding = false
        };
        _player.EncounteredError += (_, _) => Log?.Invoke("LibVLC: playback error");
        _player.Playing += (_, _) => Log?.Invoke("LibVLC: playing");
        _player.EndReached += (_, _) => Log?.Invoke("LibVLC: end reached");
    }

    public void AttachHwnd(IntPtr hwnd)
    {
        _hwnd = hwnd;
        if (_player is not null && hwnd != IntPtr.Zero)
            _player.Hwnd = hwnd;
    }

    public void Play(string url)
    {
        // HTTP/TCP ffmpeg listen is one-shot: Stop()/reconnect kills the publisher.
        if (_player is { IsPlaying: true } &&
            string.Equals(_lastUrl, url, StringComparison.OrdinalIgnoreCase))
        {
            if (_hwnd != IntPtr.Zero)
                _player.Hwnd = _hwnd;
            Log?.Invoke($"LibVLC: already playing {url}");
            return;
        }

        Stop();
        if (_hwnd != IntPtr.Zero && _player is not null)
            _player.Hwnd = _hwnd;

        _lastUrl = url;
        _media = new Media(_libVlc, url, FromType.FromLocation);
        if (url.StartsWith("rtsp://", StringComparison.OrdinalIgnoreCase))
        {
            _media.AddOption(":rtsp-tcp");
            _media.AddOption(":network-caching=400");
        }
        else if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                 url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            // MPEG-TS over HTTP listen from ffmpeg
            _media.AddOption(":demux=ts");
            _media.AddOption(":network-caching=400");
        }
        else if (url.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase))
        {
            _media.AddOption(":demux=ts");
            _media.AddOption(":network-caching=400");
        }
        else if (url.StartsWith("udp://", StringComparison.OrdinalIgnoreCase))
        {
            _media.AddOption(":demux=ts");
            _media.AddOption(":network-caching=200");
            _media.AddOption(":udp-timeout=5000000");
        }

        _player!.Volume = 100;
        _player.Mute = false;
        Log?.Invoke($"LibVLC: play {url}");
        Player.Play(_media);
    }

    public void Stop()
    {
        if (_player is { IsPlaying: true } or { WillPlay: true })
            _player.Stop();
        _media?.Dispose();
        _media = null;
    }

    public void Dispose()
    {
        Stop();
        _player?.Dispose();
        _player = null;
        _libVlc.Dispose();
    }
}

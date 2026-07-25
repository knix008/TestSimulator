using LibVLCSharp.Shared;

namespace RTSPCall.Core.Services;

public sealed class RtspPlayerService : IDisposable
{
    private readonly LibVLC _libVlc;
    private MediaPlayer? _player;
    private Media? _media;

    public MediaPlayer Player => _player ?? throw new InvalidOperationException("Player not created.");

    public RtspPlayerService()
    {
        LibVLCSharp.Shared.Core.Initialize();
        _libVlc = new LibVLC(
            "--rtsp-tcp",
            "--network-caching=150",
            "--live-caching=150",
            "--avcodec-hw=any",
            "--no-video-title-show");
        _player = new MediaPlayer(_libVlc);
    }

    public void Play(string url)
    {
        Stop();
        _media = new Media(_libVlc, url, FromType.FromLocation);
        if (url.StartsWith("rtsp://", StringComparison.OrdinalIgnoreCase))
        {
            _media.AddOption(":rtsp-tcp");
            _media.AddOption(":network-caching=150");
        }
        else if (url.StartsWith("udp://", StringComparison.OrdinalIgnoreCase))
        {
            _media.AddOption(":network-caching=120");
            _media.AddOption(":udp-timeout=3000000");
        }

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

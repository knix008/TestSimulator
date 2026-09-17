using System.Windows.Media;
using System.Windows.Threading;
using MyClockWinV10.Models;

namespace MyClockWinV10.Services;

public sealed class AlarmSoundPlayer
{
    private readonly MediaPlayer _player = new();
    private readonly DispatcherTimer _loopTimer = new();
    private bool _loop;
    private string _soundId = AlarmSoundCatalog.DefaultId;
    private double _volume = 1.0;
    private string? _currentPath;

    public AlarmSoundPlayer()
    {
        _player.MediaEnded += (_, _) => RestartIfLooping();

        _loopTimer.Interval = TimeSpan.FromMilliseconds(250);
        _loopTimer.Tick += (_, _) =>
        {
            if (!_loop || _player.NaturalDuration.HasTimeSpan) return;
            RestartIfLooping();
        };
    }

    public string SoundId
    {
        get => _soundId;
        set => _soundId = AlarmSoundCatalog.IsValid(value) ? value : AlarmSoundCatalog.DefaultId;
    }

    public double Volume
    {
        get => _volume;
        set => _volume = Math.Clamp(value, 0, 1);
    }

    public bool IsPlaying { get; private set; }

    public void Preview()
        => PlayInternal(loop: false);

    public void PlayAlarm(bool loop = true)
        => PlayInternal(loop);

    public void Stop()
    {
        _loop = false;
        IsPlaying = false;
        _loopTimer.Stop();
        _player.Stop();
        _player.Close();
        _currentPath = null;
    }

    private void RestartIfLooping()
    {
        if (!_loop || !IsPlaying) return;

        try
        {
            _player.Position = TimeSpan.Zero;
            _player.Play();
        }
        catch
        {
            if (_currentPath != null)
                PlayInternal(loop: true);
        }
    }

    private void PlayInternal(bool loop)
    {
        Stop();
        _loop = loop;

        try
        {
            _currentPath = WavToneGenerator.GetSoundPath(_soundId);
            _player.Open(new Uri(_currentPath, UriKind.Absolute));
            _player.Volume = _volume;
            _player.Play();
            IsPlaying = true;

            if (loop)
                _loopTimer.Start();
        }
        catch
        {
            _loop = false;
            IsPlaying = false;
            System.Media.SystemSounds.Exclamation.Play();
        }
    }
}

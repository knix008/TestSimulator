using System.IO;
using System.Windows.Media;
using MyClockWinV10.Models;

namespace MyClockWinV10.Services;

public sealed class AlarmSoundPlayer
{
    private readonly MediaPlayer _player = new();
    private bool _loop;
    private string _soundId = AlarmSoundCatalog.DefaultId;
    private double _volume = 1.0;

    public AlarmSoundPlayer()
    {
        _player.MediaEnded += (_, _) =>
        {
            if (_loop)
                PlayInternal(loop: true);
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

    public void Preview()
        => PlayInternal(loop: false);

    public void PlayAlarm(bool loop = true)
        => PlayInternal(loop);

    public void Stop()
    {
        _loop = false;
        _player.Stop();
        _player.Close();
    }

    private void PlayInternal(bool loop)
    {
        Stop();
        _loop = loop;
        try
        {
            string path = WavToneGenerator.GetSoundPath(_soundId);
            _player.Open(new Uri(path, UriKind.Absolute));
            _player.Volume = _volume;
            _player.Play();
        }
        catch
        {
            _loop = false;
            System.Media.SystemSounds.Exclamation.Play();
        }
    }
}

using MIDIMasterWinV10.Constants;
using MIDIMasterWinV10.Core;
using MIDIMasterWinV10.Models;

namespace MIDIMasterWinV10;

public partial class MidiForm : Form
{
    private readonly MidiPlayer _player = new();
    private readonly SheetMusicRenderer _renderer = new();
    private readonly AudioExporter _exporter = new();

    private MidiFileInfo? _midiInfo;
    private System.Windows.Forms.Timer _uiTimer = new() { Interval = 50 };

    // View window for sheet music scrolling
    private double _viewDurationSeconds = 8.0;
    private bool _seekingPosition;
    private double _totalSeconds;

    public MidiForm()
    {
        InitializeComponent();
        LoadIconFromFile();   // after InitializeComponent so VS Designer is unaffected
        SetupInstrumentList();
        WireEvents();
    }

    // Fallback: load icon from the output directory when the .resx resource is not present.
    // Once you set the Icon property in VS Designer, this method becomes unused.
    private void LoadIconFromFile()
    {
        try
        {
            string icoPath = Path.Combine(AppContext.BaseDirectory, "daemon_hammer.ico");
            if (File.Exists(icoPath))
                Icon = new Icon(icoPath);
        }
        catch { /* non-fatal */ }
    }

    private void SetupInstrumentList()
    {
        cboInstrument.Items.Clear();
        for (int i = 0; i < 128; i++)
            cboInstrument.Items.Add($"{i:D3} - {GeneralMidi.GetName(i)}");
        cboInstrument.SelectedIndex = 0;
    }

    private void WireEvents()
    {
        openMenuItem.Click += (_, _) => OpenFile();
        exportWavMenuItem.Click += async (_, _) => await ExportAsync("wav");
        exportMp3MenuItem.Click += async (_, _) => await ExportAsync("mp3");
        exitMenuItem.Click += (_, _) => Close();

        btnPlay.Click += (_, _) => _player.Play();
        btnPause.Click += (_, _) => _player.Pause();
        btnStop.Click += (_, _) => _player.Stop();

        cboInstrument.SelectedIndexChanged += (_, _) =>
            _player.SetInstrument(cboInstrument.SelectedIndex);

        lblTempoValue.Text = "100%"; // tempo control not yet wired

        trkPosition.MouseDown += (_, _) => _seekingPosition = true;
        trkPosition.MouseUp += (_, e) =>
        {
            _seekingPosition = false;
            if (_totalSeconds > 0)
            {
                double t = trkPosition.Value / 1000.0 * _totalSeconds;
                _player.SeekToSeconds(t);
            }
        };

        _player.PositionChanged += OnPositionChanged;
        _player.PlaybackStopped += OnPlaybackStopped;

        _uiTimer.Tick += (_, _) => RefreshSheet();
        _uiTimer.Start();

        picSheet.Resize += (_, _) => RefreshSheet();

        // Mouse-wheel zoom on sheet
        picSheet.MouseWheel += (_, e) =>
        {
            _viewDurationSeconds = Math.Clamp(
                _viewDurationSeconds - e.Delta * 0.01,
                1.0, 60.0);
            RefreshSheet();
        };

        FormClosed += (_, _) =>
        {
            _uiTimer.Stop();
            _player.Dispose();
        };

        // Update transport button states
        _player.PlaybackStopped += () => UpdateTransportButtons(PlaybackState.Stopped);
        UpdateTransportButtons(PlaybackState.Stopped);
    }

    private void OpenFile()
    {
        using var dlg = new OpenFileDialog
        {
            Title = "MIDI 파일 열기",
            Filter = "MIDI 파일 (*.mid;*.midi)|*.mid;*.midi|모든 파일 (*.*)|*.*",
            DefaultExt = "mid"
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        try
        {
            _player.Stop();
            _midiInfo = MidiParser.Parse(dlg.FileName);
            _player.LoadFile(dlg.FileName);
            _totalSeconds = _midiInfo.TotalSeconds;

            // UI updates
            string name = Path.GetFileName(dlg.FileName);
            lblFileName.Text = $"파일: {name}";
            lblTrackInfo.Text = $"트랙: {_midiInfo.Tracks.Count}개   형식: Type {_midiInfo.MidiType}";
            lblNoteCount.Text = $"음표: {_midiInfo.AllNotes.Count}개   길이: {TimeSpan.FromSeconds(_totalSeconds):mm\\:ss}";
            lblTotalTime.Text = TimeSpan.FromSeconds(_totalSeconds).ToString(@"mm\:ss\.ff");

            exportWavMenuItem.Enabled = true;
            exportMp3MenuItem.Enabled = true;
            UpdateTransportButtons(PlaybackState.Stopped);
            SetStatus($"로드 완료: {name}");

            // Default: show entire piece so all notes are visible at once
            _viewDurationSeconds = Math.Max(1.0, _totalSeconds);
            RefreshSheet();
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, "MIDI 파일 열기 실패", "MIDI 파일을 여는 중 오류가 발생했습니다.", ex);
        }
    }

    private async Task ExportAsync(string format)
    {
        if (_midiInfo == null) return;

        string ext = format.ToLower();
        using var dlg = new SaveFileDialog
        {
            Title = $"{ext.ToUpper()} 파일로 내보내기",
            Filter = ext == "wav"
                ? "WAV 파일 (*.wav)|*.wav"
                : "MP3 파일 (*.mp3)|*.mp3",
            DefaultExt = ext,
            FileName = Path.GetFileNameWithoutExtension(_midiInfo.FilePath)
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        SetStatus($"{ext.ToUpper()} 변환 중...");
        progressBar.Value = 0;
        progressBar.Visible = true;
        exportWavMenuItem.Enabled = false;
        exportMp3MenuItem.Enabled = false;

        _exporter.SelectedInstrument = cboInstrument.SelectedIndex;
        _exporter.ProgressChanged += p =>
            Invoke(() => { progressBar.Value = Math.Min(100, p); });

        try
        {
            if (ext == "wav")
                await _exporter.ExportWavAsync(_midiInfo, dlg.FileName);
            else
                await _exporter.ExportMp3Async(_midiInfo, dlg.FileName);

            SetStatus($"내보내기 완료: {Path.GetFileName(dlg.FileName)}");
            MessageBox.Show($"내보내기 완료!\n{dlg.FileName}", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            SetStatus("내보내기 실패");
            ErrorDialog.Show(this, "내보내기 실패", $"{ext.ToUpper()} 내보내기 중 오류가 발생했습니다.", ex);
        }
        finally
        {
            progressBar.Visible = false;
            exportWavMenuItem.Enabled = true;
            exportMp3MenuItem.Enabled = true;
        }
    }

    private void OnPositionChanged(double seconds)
    {
        if (InvokeRequired)
        {
            Invoke(() => OnPositionChanged(seconds));
            return;
        }

        if (!_seekingPosition && _totalSeconds > 0)
        {
            trkPosition.Value = (int)(seconds / _totalSeconds * 1000);
        }

        lblCurrentTime.Text = TimeSpan.FromSeconds(seconds).ToString(@"mm\:ss\.ff");
        UpdateTransportButtons(PlaybackState.Playing);
    }

    private void OnPlaybackStopped()
    {
        if (InvokeRequired) { Invoke(OnPlaybackStopped); return; }
        trkPosition.Value = 0;
        lblCurrentTime.Text = "00:00.00";
        UpdateTransportButtons(PlaybackState.Stopped);
    }

    private void UpdateTransportButtons(PlaybackState state)
    {
        if (InvokeRequired) { Invoke(() => UpdateTransportButtons(state)); return; }

        bool hasFile = _midiInfo != null;
        btnPlay.Enabled = hasFile && state != PlaybackState.Playing;
        btnPause.Enabled = state == PlaybackState.Playing;
        btnStop.Enabled = state != PlaybackState.Stopped;
    }

    private void RefreshSheet()
    {
        if (picSheet.Width <= 0 || picSheet.Height <= 0) return;

        double playhead = _player.CurrentSeconds;

        // When playing, keep playhead at ~25% from the left by sliding the view window
        double viewStart = _player.State == PlaybackState.Playing
            ? Math.Max(0, playhead - _viewDurationSeconds * 0.25)
            : Math.Max(0, Math.Min(playhead - _viewDurationSeconds * 0.25,
                                   _totalSeconds - _viewDurationSeconds));

        var bmp = _renderer.Render(
            _midiInfo!,
            viewStart,
            _viewDurationSeconds,
            playhead,
            picSheet.Width,
            picSheet.Height);

        var old = picSheet.Image;
        picSheet.Image = bmp;
        old?.Dispose();
    }

    private void SetStatus(string text)
    {
        if (InvokeRequired) { Invoke(() => SetStatus(text)); return; }
        lblStatus.Text = text;
    }
}

using MIDIMasterWinV10.Constants;
using MIDIMasterWinV10.Core;
using MidiSheetMusic;

namespace MIDIMasterWinV10;

public partial class MidiForm : Form
{
    private readonly MidiPlayer _player = new();
    private readonly AudioExporter _exporter = new();

    private MidiFileInfo? _midiInfo;
    private MidiFile? _msmFile;
    private SheetMusic? _sheetMusic;
    private readonly System.Windows.Forms.Timer _uiTimer = new() { Interval = 50 };

    private bool _seekingPosition;
    private double _totalSeconds;
    private int _phX, _phY, _phH;
    private string? _sheetMusicPath;
    private int _lastSheetPageWidth;
    private readonly System.Windows.Forms.Timer _sheetResizeTimer = new() { Interval = 200 };

    public MidiForm()
    {
        InitializeComponent();
        LoadIconFromFile();
        SetupInstrumentList();
        WireEvents();
    }

    private void LoadIconFromFile()
    {
        try
        {
            string icoPath = Path.Combine(AppContext.BaseDirectory, "daemon_hammer.ico");
            if (File.Exists(icoPath))
                Icon = new Icon(icoPath);
        }
        catch { }
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

        btnPlay.Click  += (_, _) => _player.Play();
        btnPause.Click += (_, _) => _player.Pause();
        btnStop.Click  += (_, _) => _player.Stop();

        _player.StateChanged += state =>
        {
            if (InvokeRequired) Invoke(() => OnPlayerStateChanged(state));
            else OnPlayerStateChanged(state);
        };

        cboInstrument.SelectedIndexChanged += (_, _) =>
            _player.SetInstrument(cboInstrument.SelectedIndex);

        lblTempoValue.Text = "100%";

        trkPosition.MouseDown += (_, _) => _seekingPosition = true;
        trkPosition.MouseUp   += (_, _) =>
        {
            _seekingPosition = false;
            if (_totalSeconds > 0)
            {
                _player.SeekToSeconds(trkPosition.Value / 1000.0 * _totalSeconds);
                UpdatePlayhead(scroll: false);
            }
        };

        _player.PositionChanged += OnPositionChanged;
        _player.PlaybackStopped += OnPlaybackStopped;
        _player.PlaybackCompleted += OnPlaybackCompleted;

        _uiTimer.Tick += (_, _) =>
        {
            if (_player.State == PlaybackState.Playing)
                UpdatePlayhead(scroll: true);
        };
        _uiTimer.Start();

        FormClosed += (_, _) =>
        {
            _uiTimer.Stop();
            _sheetResizeTimer.Stop();
            _player.Dispose();
            DisposeSheetMusic();
        };

        _sheetResizeTimer.Tick += (_, _) =>
        {
            _sheetResizeTimer.Stop();
            RelayoutSheetForPanelWidth();
        };
        pnlSheet.Resize += (_, _) =>
        {
            if (_sheetMusicPath == null) return;
            _sheetResizeTimer.Stop();
            _sheetResizeTimer.Start();
        };

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

            string name = Path.GetFileName(dlg.FileName);
            lblFileName.Text  = $"파일: {name}";
            lblTrackInfo.Text = $"트랙: {_midiInfo.Tracks.Count}개   형식: Type {_midiInfo.MidiType}";
            lblNoteCount.Text = $"음표: {_midiInfo.AllNotes.Count}개   길이: {TimeSpan.FromSeconds(_totalSeconds):mm\\:ss}";
            lblTotalTime.Text = TimeSpan.FromSeconds(_totalSeconds).ToString(@"mm\:ss\.ff");

            exportWavMenuItem.Enabled = true;
            exportMp3MenuItem.Enabled = true;
            UpdateTransportButtons(PlaybackState.Stopped);
            SetStatus($"로드 완료: {name}");

            LoadSheetMusic(dlg.FileName);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, "MIDI 파일 열기 실패", "MIDI 파일을 여는 중 오류가 발생했습니다.", ex);
        }
    }

    private int GetSheetPageWidth()
    {
        int w = pnlSheet.ClientSize.Width;
        if (w < 100) w = ClientSize.Width;
        return Math.Max(500, w - 12);
    }

    private void RelayoutSheetForPanelWidth()
    {
        if (_sheetMusicPath == null) return;
        int w = GetSheetPageWidth();
        if (w == _lastSheetPageWidth) return;
        LoadSheetMusic(_sheetMusicPath);
    }

    private void LoadSheetMusic(string path)
    {
        _sheetMusicPath = path;
        int pageWidth = GetSheetPageWidth();
        _lastSheetPageWidth = pageWidth;
        SheetMusic.SetPageWidth(pageWidth);

        DisposeSheetMusic(clearPath: false);

        _msmFile = new MidiFile(path);
        var options = new MidiOptions(_msmFile)
        {
            scrollVert      = true,    // 패널 너비마다 줄바꿈
            largeNoteSize   = true,
            showNoteLetters = MidiOptions.NoteNameNone,
            showLyrics      = false,
            showMeasures    = true,
            twoStaffs       = _msmFile.Tracks.Count <= 2,
            combineInterval = 40
        };

        _sheetMusic = new SheetMusic(_msmFile, options);
        _sheetMusic.EnableDoubleBuffering();
        _sheetMusic.Parent = pnlSheet;
        _sheetMusic.Location = new Point(0, 0);
        _sheetMusic.SetZoom(1.0f);
        _sheetMusic.SizeChanged += SheetMusic_SizeChanged;

        pnlSheet.Controls.Clear();
        pnlSheet.Controls.Add(_sheetMusic);

        UpdatePlayhead(scroll: false);

        // 패널 레이아웃 확정 후 한 줄 너비를 다시 맞춤
        BeginInvoke(RelayoutSheetForPanelWidth);
    }

    private void SheetMusic_SizeChanged(object? sender, EventArgs e) =>
        UpdatePlayhead(scroll: false);

    private void DisposeSheetMusic(bool clearPath = true)
    {
        if (_sheetMusic != null)
        {
            _sheetMusic.SizeChanged -= SheetMusic_SizeChanged;
            pnlSheet.Controls.Remove(_sheetMusic);
            _sheetMusic.Dispose();
            _sheetMusic = null;
        }

        _msmFile = null;
        if (clearPath)
        {
            _sheetMusicPath = null;
            _lastSheetPageWidth = 0;
        }
    }

    private int SecondsToPulse(double seconds)
    {
        if (_msmFile == null) return 0;
        var time = _msmFile.Time;
        return (int)(seconds * 1_000_000.0 * time.Quarter / time.Tempo);
    }

    private void UpdatePlayhead(bool scroll)
    {
        if (_sheetMusic == null || _msmFile == null) return;

        int pulse = SecondsToPulse(_player.CurrentSeconds);

        if (scroll)
            _sheetMusic.ScrollToPlayhead(pulse, scrollGradually: true);

        Rectangle dirty = PlayheadInvalidateRect(_phX, _phY, _phH);

        if (!_sheetMusic.TryGetPlayheadSpan(pulse, out int x, out int y, out int spanH))
        {
            _sheetMusic.SetPlayhead(0, 0, 0, visible: false);
            if (!dirty.IsEmpty)
                _sheetMusic.Invalidate(dirty);
            return;
        }

        float zoom = _sheetMusic.ZoomLevel;
        int newX = (int)(x * zoom);
        int newY = (int)(y * zoom);
        int newH = (int)(spanH * zoom);

        dirty = Rectangle.Union(dirty, PlayheadInvalidateRect(newX, newY, newH));

        _phX = newX;
        _phY = newY;
        _phH = newH;

        _sheetMusic.SetPlayhead(newX, newY, newH, visible: true);
        _sheetMusic.Invalidate(dirty.IsEmpty ? _sheetMusic.ClientRectangle : dirty);
    }

    private static Rectangle PlayheadInvalidateRect(int x, int y, int h)
    {
        if (h <= 0) return Rectangle.Empty;
        return new Rectangle(x - 3, y, 7, h);
    }

    private void HidePlayhead()
    {
        if (_sheetMusic == null) return;
        Rectangle dirty = PlayheadInvalidateRect(_phX, _phY, _phH);
        _phH = 0;
        _sheetMusic.SetPlayhead(0, 0, 0, visible: false);
        if (!dirty.IsEmpty)
            _sheetMusic.Invalidate(dirty);
    }

    private async Task ExportAsync(string format)
    {
        if (_midiInfo == null) return;

        string ext = format.ToLower();
        using var dlg = new SaveFileDialog
        {
            Title  = $"{ext.ToUpper()} 파일로 보내기",
            Filter = ext == "wav" ? "WAV 파일 (*.wav)|*.wav" : "MP3 파일 (*.mp3)|*.mp3",
            DefaultExt = ext,
            FileName = Path.GetFileNameWithoutExtension(_midiInfo.FilePath)
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        string instrumentName = GeneralMidi.GetName(cboInstrument.SelectedIndex);
        SetStatus($"{ext.ToUpper()} 변환 중… ({instrumentName})");
        progressBar.Value   = 0;
        progressBar.Visible = true;
        exportWavMenuItem.Enabled = false;
        exportMp3MenuItem.Enabled = false;

        _exporter.SelectedInstrument = cboInstrument.SelectedIndex;
        _exporter.ProgressChanged += p => Invoke(() => progressBar.Value = Math.Min(100, p));

        try
        {
            if (ext == "wav")
                await _exporter.ExportWavAsync(_midiInfo, dlg.FileName);
            else
                await _exporter.ExportMp3Async(_midiInfo, dlg.FileName);

            SetStatus($"보내기 완료: {Path.GetFileName(dlg.FileName)} ({instrumentName})");
            MessageBox.Show(
                $"선택 악기: {instrumentName}\n보내기 완료!\n{dlg.FileName}",
                "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            SetStatus("보내기 실패");
            ErrorDialog.Show(this, "보내기 실패", $"{ext.ToUpper()} 보내기 중 오류가 발생했습니다.", ex);
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
        if (InvokeRequired) { Invoke(() => OnPositionChanged(seconds)); return; }

        if (!_seekingPosition && _totalSeconds > 0)
            trkPosition.Value = (int)(seconds / _totalSeconds * 1000);

        lblCurrentTime.Text = TimeSpan.FromSeconds(seconds).ToString(@"mm\:ss\.ff");

        if (_player.State is PlaybackState.Playing or PlaybackState.Paused)
            UpdatePlayhead(scroll: _player.State == PlaybackState.Playing);
    }

    private void OnPlaybackStopped()
    {
        if (InvokeRequired) { Invoke(OnPlaybackStopped); return; }
        trkPosition.Value = 0;
        lblCurrentTime.Text = "00:00.00";
        HidePlayhead();
        UpdateTransportButtons(PlaybackState.Stopped);
    }

    private void OnPlaybackCompleted()
    {
        if (InvokeRequired) { Invoke(OnPlaybackCompleted); return; }
        if (_totalSeconds > 0)
        {
            trkPosition.Value = trkPosition.Maximum;
            lblCurrentTime.Text = TimeSpan.FromSeconds(_totalSeconds).ToString(@"mm\:ss\.ff");
            UpdatePlayhead(scroll: false);
        }
        UpdateTransportButtons(PlaybackState.Stopped);
        SetStatus("재생 완료");
    }

    private void OnPlayerStateChanged(PlaybackState state)
    {
        if (InvokeRequired) { Invoke(() => OnPlayerStateChanged(state)); return; }
        UpdateTransportButtons(state);
    }

    private void UpdateTransportButtons(PlaybackState state)
    {
        if (InvokeRequired) { Invoke(() => UpdateTransportButtons(state)); return; }

        bool hasFile = _midiInfo != null;
        btnPlay.Enabled  = hasFile && state != PlaybackState.Playing;
        btnPause.Enabled = state == PlaybackState.Playing;
        btnStop.Enabled  = state != PlaybackState.Stopped;
    }

    private void SetStatus(string text)
    {
        if (InvokeRequired) { Invoke(() => SetStatus(text)); return; }
        lblStatus.Text = text;
    }
}

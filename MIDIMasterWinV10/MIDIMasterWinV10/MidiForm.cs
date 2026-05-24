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
    private Bitmap? _sheetBackground;               // pre-rendered sheet (no playhead)
    private System.Windows.Forms.Timer _uiTimer = new() { Interval = 50 };

    private bool _seekingPosition;
    private double _totalSeconds;

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
        // ── Menu ──────────────────────────────────────────────────────────────
        openMenuItem.Click += (_, _) => OpenFile();
        exportWavMenuItem.Click += async (_, _) => await ExportAsync("wav");
        exportMp3MenuItem.Click += async (_, _) => await ExportAsync("mp3");
        exitMenuItem.Click += (_, _) => Close();

        // ── Transport ────────────────────────────────────────────────────────
        btnPlay.Click  += (_, _) => _player.Play();
        btnPause.Click += (_, _) => _player.Pause();
        btnStop.Click  += (_, _) => _player.Stop();

        // Button state follows MidiPlayer state changes (Playing / Paused / Stopped).
        _player.StateChanged += state =>
        {
            if (InvokeRequired) Invoke(() => UpdateTransportButtons(state));
            else UpdateTransportButtons(state);
        };

        // ── Instrument ───────────────────────────────────────────────────────
        cboInstrument.SelectedIndexChanged += (_, _) =>
            _player.SetInstrument(cboInstrument.SelectedIndex);

        // ── Tempo label (static for now — no playback-speed control) ─────────
        lblTempoValue.Text = "100%";

        // ── Position slider ───────────────────────────────────────────────────
        trkPosition.MouseDown += (_, _) => _seekingPosition = true;
        trkPosition.MouseUp   += (_, _) =>
        {
            _seekingPosition = false;
            if (_totalSeconds > 0)
                _player.SeekToSeconds(trkPosition.Value / 1000.0 * _totalSeconds);
        };

        // ── Position updates from the player ─────────────────────────────────
        _player.PositionChanged += OnPositionChanged;
        _player.PlaybackStopped += OnPlaybackStopped;

        // ── Sheet: static background; only playhead is redrawn on timer ───────
        // PictureBox.Paint fires AFTER the control draws its Image, so our
        // handler draws the playhead on top without re-rendering the whole sheet.
        picSheet.Paint += (_, e) =>
        {
            if (_midiInfo != null && _renderer.SecondsPerSystem > 0)
                _renderer.DrawPlayhead(e.Graphics, _player.CurrentSeconds, picSheet.Width);
        };

        // Rebuild sheet when the panel is resized (width changes).
        pnlSheet.Resize += (_, _) => RebuildSheet();

        // Timer redraws the playhead and auto-scrolls to the current system.
        _uiTimer.Tick += (_, _) =>
        {
            picSheet.Invalidate();
            AutoScrollToPlayhead();
        };
        _uiTimer.Start();

        // ── Mouse-wheel zoom: change how many seconds are shown per system ────
        picSheet.MouseWheel += (_, e) =>
        {
            // (No zoom in static multi-row view — reserved for future use)
        };

        FormClosed += (_, _) =>
        {
            _uiTimer.Stop();
            _player.Dispose();
            _sheetBackground?.Dispose();
        };

        UpdateTransportButtons(PlaybackState.Stopped);
    }

    // ── File handling ─────────────────────────────────────────────────────────

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

            RebuildSheet();
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, "MIDI 파일 열기 실패", "MIDI 파일을 여는 중 오류가 발생했습니다.", ex);
        }
    }

    // ── Export ────────────────────────────────────────────────────────────────

    private async Task ExportAsync(string format)
    {
        if (_midiInfo == null) return;

        string ext = format.ToLower();
        using var dlg = new SaveFileDialog
        {
            Title  = $"{ext.ToUpper()} 파일로 내보내기",
            Filter = ext == "wav" ? "WAV 파일 (*.wav)|*.wav" : "MP3 파일 (*.mp3)|*.mp3",
            DefaultExt = ext,
            FileName = Path.GetFileNameWithoutExtension(_midiInfo.FilePath)
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        SetStatus($"{ext.ToUpper()} 변환 중...");
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

    // ── Player event handlers ─────────────────────────────────────────────────

    private void OnPositionChanged(double seconds)
    {
        if (InvokeRequired) { Invoke(() => OnPositionChanged(seconds)); return; }

        if (!_seekingPosition && _totalSeconds > 0)
            trkPosition.Value = (int)(seconds / _totalSeconds * 1000);

        lblCurrentTime.Text = TimeSpan.FromSeconds(seconds).ToString(@"mm\:ss\.ff");
        // Button state is managed exclusively via _player.StateChanged — do NOT call
        // UpdateTransportButtons here, otherwise it would fight with the Paused state.
    }

    private void OnPlaybackStopped()
    {
        if (InvokeRequired) { Invoke(OnPlaybackStopped); return; }
        trkPosition.Value = 0;
        lblCurrentTime.Text = "00:00.00";
        // StateChanged(Stopped) fires from Stop() / natural end → buttons already updated.
    }

    private void UpdateTransportButtons(PlaybackState state)
    {
        if (InvokeRequired) { Invoke(() => UpdateTransportButtons(state)); return; }

        bool hasFile = _midiInfo != null;
        btnPlay.Enabled  = hasFile && state != PlaybackState.Playing;
        btnPause.Enabled = state == PlaybackState.Playing;
        btnStop.Enabled  = state != PlaybackState.Stopped;
    }

    // ── Sheet music ───────────────────────────────────────────────────────────

    /// <summary>
    /// Renders the full sheet to a cached bitmap and sizes picSheet accordingly.
    /// Expensive — call only on file load or panel resize.
    /// </summary>
    private void RebuildSheet()
    {
        int w = pnlSheet.ClientSize.Width;
        if (w <= 0) return;

        picSheet.Width = w;

        var old = _sheetBackground;
        _sheetBackground = _renderer.RenderBackground(_midiInfo, w);
        picSheet.Height  = _sheetBackground.Height;
        picSheet.Image   = _sheetBackground;
        old?.Dispose();

        picSheet.Invalidate();
    }

    /// <summary>
    /// While playing, scrolls the sheet panel so the current system stays visible.
    /// </summary>
    private void AutoScrollToPlayhead()
    {
        if (_player.State != PlaybackState.Playing) return;
        if (_renderer.SecondsPerSystem <= 0) return;

        int currentSys = (int)(_player.CurrentSeconds / _renderer.SecondsPerSystem);
        int targetY = currentSys * SheetMusicRenderer.SystemHeight;
        // Scroll so that the system is near the top of the panel, with a small margin.
        var desired = new Point(0, Math.Max(0, targetY - 20));
        if (pnlSheet.AutoScrollPosition != new Point(-desired.X, -desired.Y))
            pnlSheet.AutoScrollPosition = desired;
    }

    private void SetStatus(string text)
    {
        if (InvokeRequired) { Invoke(() => SetStatus(text)); return; }
        lblStatus.Text = text;
    }
}

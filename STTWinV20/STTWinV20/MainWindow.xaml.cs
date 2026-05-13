using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using Microsoft.Win32;
using STTWinV20.Services;

namespace STTWinV20;

public partial class MainWindow : Window
{
    private readonly SttProcessor _stt = new();
    private MicSttService? _micStt;
    private FileSttService? _fileStt;

    private readonly DispatcherTimer _seekTimer = new()
        { Interval = TimeSpan.FromMilliseconds(200) };

    private bool _isDraggingSeek;
    private bool _isFileOpen;
    private string? _currentFilePath;
    private int _segmentCount;
    private ModelInfo? _selectedModel;

    // ── Colours used for status dot ──
    private static readonly Color ColGreen = Color.FromRgb(0x00, 0xD2, 0xA0);
    private static readonly Color ColOrange = Colors.Orange;
    private static readonly Color ColRed = Color.FromRgb(0xFF, 0x6B, 0x6B);

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closing += OnClosing;
        _seekTimer.Tick += SeekTimer_Tick;
    }

    // ══════════════════════════════════════════════════════════
    // Lifecycle
    // ══════════════════════════════════════════════════════════

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        LoadMicrophones();
        LoadModelList();
        SetStatus("준비", ColGreen);
    }

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _micStt?.Stop();
        _fileStt?.Stop();
        _seekTimer.Stop();
        VideoPlayer.Stop();
        _micStt?.Dispose();
        _fileStt?.Dispose();
        _stt.Dispose();
    }

    // ══════════════════════════════════════════════════════════
    // Microphone controls
    // ══════════════════════════════════════════════════════════

    private void LoadMicrophones()
    {
        var devices = MicSttService.GetDevices();
        MicComboBox.ItemsSource = devices;
        if (devices.Count > 0) MicComboBox.SelectedIndex = 0;
    }

    private void RefreshMicBtn_Click(object sender, RoutedEventArgs e) => LoadMicrophones();

    private void MicComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (MicComboBox.SelectedItem is AudioDevice dev)
            _micStt?.SetDevice(dev.DeviceNumber);
    }

    private void VolumeSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (VolumeValueText is null) return; // InitializeComponent 완료 전 이벤트 방어
        VolumeValueText.Text = $"{(int)e.NewValue}%";
        _micStt?.SetVolume((float)(e.NewValue / 100.0));
    }

    // ══════════════════════════════════════════════════════════
    // Model controls
    // ══════════════════════════════════════════════════════════

    private void LoadModelList()
    {
        var items = WhisperModelManager.Models.Select(m =>
            $"{m.DisplayName}  ({m.SizeLabel})  – {m.Description}" +
            (WhisperModelManager.IsDownloaded(m) ? "  ✓" : "")).ToList();

        ModelComboBox.ItemsSource = items;
        // Default: Small (index 2)
        ModelComboBox.SelectedIndex = 2;
        _selectedModel = WhisperModelManager.Models[2];
        UpdateDownloadBtn();
    }

    private void ModelComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        int idx = ModelComboBox.SelectedIndex;
        if (idx >= 0 && idx < WhisperModelManager.Models.Count)
        {
            _selectedModel = WhisperModelManager.Models[idx];
            UpdateDownloadBtn();
        }
    }

    private void UpdateDownloadBtn()
    {
        if (_selectedModel == null) return;
        bool have = WhisperModelManager.IsDownloaded(_selectedModel);
        DownloadBtn.Content = have ? "✓ 다운로드됨" : "⬇ 다운로드";
        DownloadBtn.Background = have
            ? new SolidColorBrush(Color.FromRgb(0x74, 0x7D, 0x8C))
            : new SolidColorBrush(ColGreen);
        DownloadBtn.IsEnabled = !have;
    }

    private async void DownloadBtn_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedModel == null) return;

        DownloadBtn.Visibility = Visibility.Collapsed;
        DownloadProgressPanel.Visibility = Visibility.Visible;
        SetStatus($"{_selectedModel.DisplayName} 모델 다운로드 중...", ColOrange);

        try
        {
            var progress = new Progress<double>(p =>
            {
                DownloadProgressBar.Value = p * 100;
                DownloadProgressText.Text = $"{p * 100:F0}%";
            });
            await WhisperModelManager.DownloadAsync(_selectedModel, progress);
            SetStatus($"{_selectedModel.DisplayName} 다운로드 완료!", ColGreen);
            LoadModelList();
        }
        catch (Exception ex)
        {
            SetStatus($"다운로드 실패: {ex.Message}", ColRed);
        }
        finally
        {
            DownloadProgressPanel.Visibility = Visibility.Collapsed;
            DownloadBtn.Visibility = Visibility.Visible;
            UpdateDownloadBtn();
        }
    }

    // ══════════════════════════════════════════════════════════
    // STT initialization
    // ══════════════════════════════════════════════════════════

    private async Task<bool> EnsureSttReadyAsync()
    {
        if (_stt.IsInitialized) return true;

        if (_selectedModel == null)
        { SetStatus("모델을 선택하세요", ColOrange); return false; }

        if (!WhisperModelManager.IsDownloaded(_selectedModel))
        {
            SetStatus("모델을 먼저 다운로드하세요", ColOrange);
            MessageBox.Show($"'{_selectedModel.DisplayName}' 모델이 없습니다.\n먼저 다운로드해 주세요.",
                "모델 없음", MessageBoxButton.OK, MessageBoxImage.Information);
            return false;
        }

        SetStatus("모델 로딩 중...", ColOrange);
        try
        {
            await _stt.InitializeAsync(WhisperModelManager.GetModelPath(_selectedModel));
            SetStatus("모델 준비 완료", ColGreen);
            return true;
        }
        catch (Exception ex)
        {
            SetStatus($"모델 로드 실패: {ex.Message}", ColRed);
            return false;
        }
    }

    // ══════════════════════════════════════════════════════════
    // Microphone STT
    // ══════════════════════════════════════════════════════════

    private async void MicBtn_Click(object sender, RoutedEventArgs e)
    {
        if (_micStt is { IsRunning: true })
        {
            StopMicStt();
            return;
        }

        if (_isFileOpen)
        {
            MessageBox.Show("파일 재생 중에는 마이크 STT를 사용할 수 없습니다.\n파일을 먼저 닫아주세요.",
                "안내", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!await EnsureSttReadyAsync()) return;

        _micStt ??= CreateMicService();

        if (MicComboBox.SelectedItem is AudioDevice dev)
            _micStt.SetDevice(dev.DeviceNumber);
        _micStt.SetVolume((float)(VolumeSlider.Value / 100.0));

        OutputFilter.Reset();
        _micStt.Start();

        MicBtn.Content = "⏹ STT 중지";
        MicBtn.Background = new SolidColorBrush(ColRed);
        FileOpenBtn.IsEnabled = false;
        MicLevelPanel.Visibility = Visibility.Visible;
    }

    private void StopMicStt()
    {
        _micStt?.Stop();
        MicBtn.Content = "🎙️ STT 시작";
        MicBtn.Background = new SolidColorBrush(ColGreen);
        FileOpenBtn.IsEnabled = true;
        MicLevelPanel.Visibility = Visibility.Collapsed;
        AudioLevelBar.Value = 0;
        SetStatus("중지됨", ColGreen);
    }

    private MicSttService CreateMicService()
    {
        var svc = new MicSttService(_stt);
        svc.TranscriptionReceived += (_, text) => AppendText(text);
        svc.AudioLevelChanged += (_, level) =>
            Dispatcher.InvokeAsync(() => AudioLevelBar.Value = level * 100);
        svc.StatusChanged += (_, msg) =>
            Dispatcher.InvokeAsync(() => SetStatus(msg, ColGreen));
        svc.ErrorOccurred += (_, err) =>
            Dispatcher.InvokeAsync(() => SetStatus(err, ColRed));
        return svc;
    }

    // ══════════════════════════════════════════════════════════
    // File STT + Video playback
    // ══════════════════════════════════════════════════════════

    private async void FileOpenBtn_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            Title = "동영상/오디오 파일 열기",
            Filter = "미디어 파일|*.mp4;*.mkv;*.avi;*.mov;*.webm;*.wmv;*.mp3;*.wav;*.aac;*.ogg;*.flac;*.m4a"
                   + "|모든 파일|*.*",
        };
        if (dlg.ShowDialog() != true) return;

        if (!await EnsureSttReadyAsync()) return;
        OpenFile(dlg.FileName);
    }

    private void OpenFile(string path)
    {
        CloseCurrentFile();

        _currentFilePath = path;
        _isFileOpen = true;

        // Start MediaElement playback
        VideoPlayer.Source = new Uri(path);
        VideoPlayer.Visibility = Visibility.Visible;
        VideoPlaceholder.Visibility = Visibility.Collapsed;
        PlaybackControls.Visibility = Visibility.Visible;
        VideoPlayer.Play();
        _seekTimer.Start();

        // Start background file STT
        _fileStt ??= CreateFileService();
        _fileStt.Start(path);

        CloseFileBtn.IsEnabled = true;
        FileOpenBtn.IsEnabled = false;
        MicBtn.IsEnabled = false;
        SetStatus($"재생 중: {Path.GetFileName(path)}", ColGreen);
    }

    private FileSttService CreateFileService()
    {
        var svc = new FileSttService(_stt);
        svc.TranscriptionReceived += (_, text) => AppendText(text);
        svc.StatusChanged += (_, msg) =>
            Dispatcher.InvokeAsync(() => SetStatus(msg, ColGreen));
        svc.ErrorOccurred += (_, err) =>
            Dispatcher.InvokeAsync(() => SetStatus(err, ColRed));
        svc.Completed += (_, _) =>
            Dispatcher.InvokeAsync(() => SetStatus("파일 STT 완료", ColGreen));
        return svc;
    }

    private void CloseFileBtn_Click(object sender, RoutedEventArgs e) => CloseCurrentFile();

    private void CloseCurrentFile()
    {
        _fileStt?.Stop();
        _seekTimer.Stop();

        VideoPlayer.Stop();
        VideoPlayer.Source = null;
        VideoPlayer.Visibility = Visibility.Collapsed;
        AudioOnlyPanel.Visibility = Visibility.Collapsed;
        PlaybackControls.Visibility = Visibility.Collapsed;
        VideoPlaceholder.Visibility = Visibility.Visible;

        SeekBar.Value = 0;
        TimeDisplay.Text = "0:00 / 0:00";
        PlayPauseBtn.Content = "⏸";

        _isFileOpen = false;
        _currentFilePath = null;
        CloseFileBtn.IsEnabled = false;
        FileOpenBtn.IsEnabled = true;
        MicBtn.IsEnabled = true;
        SetStatus("준비", ColGreen);
    }

    // ══════════════════════════════════════════════════════════
    // Playback controls
    // ══════════════════════════════════════════════════════════

    private void PlayPauseBtn_Click(object sender, RoutedEventArgs e)
    {
        if (!_isFileOpen) return;

        if (PlayPauseBtn.Content.ToString() == "⏸")
        {
            VideoPlayer.Pause();
            _fileStt?.Pause();
            PlayPauseBtn.Content = "▶";
            ShowOverlay("⏸");
        }
        else
        {
            VideoPlayer.Play();
            _fileStt?.Resume();
            PlayPauseBtn.Content = "⏸";
            ShowOverlay("▶");
        }
    }

    private void SeekBar_DragStarted(object sender, DragStartedEventArgs e)
    {
        _isDraggingSeek = true;
        VideoPlayer.Pause();
        _fileStt?.Pause();
    }

    private void SeekBar_DragCompleted(object sender, DragCompletedEventArgs e)
    {
        _isDraggingSeek = false;

        if (!VideoPlayer.NaturalDuration.HasTimeSpan) return;

        var dur = VideoPlayer.NaturalDuration.TimeSpan;
        var pos = TimeSpan.FromSeconds(SeekBar.Value * dur.TotalSeconds);
        VideoPlayer.Position = pos;

        if (_currentFilePath != null)
            _fileStt?.SeekTo(_currentFilePath, pos);

        VideoPlayer.Play();
        PlayPauseBtn.Content = "⏸";
    }

    private void SeekTimer_Tick(object? sender, EventArgs e)
    {
        if (_isDraggingSeek || !_isFileOpen) return;
        if (!VideoPlayer.NaturalDuration.HasTimeSpan) return;

        var pos = VideoPlayer.Position;
        var dur = VideoPlayer.NaturalDuration.TimeSpan;
        SeekBar.Value = dur.TotalSeconds > 0 ? pos.TotalSeconds / dur.TotalSeconds : 0;
        TimeDisplay.Text = $"{Fmt(pos)} / {Fmt(dur)}";
    }

    private static string Fmt(TimeSpan t) =>
        t.TotalHours >= 1
            ? $"{(int)t.TotalHours}:{t.Minutes:D2}:{t.Seconds:D2}"
            : $"{t.Minutes}:{t.Seconds:D2}";

    // ══════════════════════════════════════════════════════════
    // MediaElement events
    // ══════════════════════════════════════════════════════════

    private void VideoPlayer_MediaOpened(object sender, RoutedEventArgs e)
    {
        bool hasVideo = VideoPlayer.HasVideo;
        VideoPlayer.Visibility = hasVideo ? Visibility.Visible : Visibility.Collapsed;
        AudioOnlyPanel.Visibility = hasVideo ? Visibility.Collapsed : Visibility.Visible;
    }

    private void VideoPlayer_MediaEnded(object sender, RoutedEventArgs e)
    {
        PlayPauseBtn.Content = "▶";
        SetStatus("재생 완료", ColGreen);
    }

    private void VideoPlayer_MediaFailed(object sender, ExceptionRoutedEventArgs e)
    {
        SetStatus($"재생 오류: {e.ErrorException?.Message}", ColRed);
    }

    // ══════════════════════════════════════════════════════════
    // Play/Pause overlay animation
    // ══════════════════════════════════════════════════════════

    private void ShowOverlay(string icon)
    {
        PlayPauseOverlay.Text = icon;
        // Cancel any running animation then snap to visible
        PlayPauseOverlay.BeginAnimation(OpacityProperty, null);
        PlayPauseOverlay.Opacity = 1.0;

        var fade = new DoubleAnimation(1.0, 0.0, new Duration(TimeSpan.FromMilliseconds(600)))
        {
            BeginTime = TimeSpan.FromMilliseconds(400),
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn },
        };
        PlayPauseOverlay.BeginAnimation(OpacityProperty, fade);
    }

    // ══════════════════════════════════════════════════════════
    // Text result helpers
    // ══════════════════════════════════════════════════════════

    private void AppendText(string text)
    {
        Dispatcher.InvokeAsync(() =>
        {
            if (TranscriptionTextBox.Text.Length > 0)
                TranscriptionTextBox.Text += "\n";
            TranscriptionTextBox.Text += text;
            _segmentCount++;
            SegmentCountText.Text = $"{_segmentCount}개 세그먼트";
            ResultScroll.ScrollToEnd();
        });
    }

    private void ClearBtn_Click(object sender, RoutedEventArgs e)
    {
        TranscriptionTextBox.Clear();
        _segmentCount = 0;
        SegmentCountText.Text = "";
        OutputFilter.Reset();
    }

    private void CopyBtn_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(TranscriptionTextBox.Text))
        {
            Clipboard.SetText(TranscriptionTextBox.Text);
            SetStatus("클립보드에 복사됨", ColGreen);
        }
    }

    // ══════════════════════════════════════════════════════════
    // Status bar
    // ══════════════════════════════════════════════════════════

    private void SetStatus(string message, Color dotColor)
    {
        // Called from any thread
        Dispatcher.InvokeAsync(() =>
        {
            StatusText.Text = message;
            var brush = new SolidColorBrush(dotColor);
            StatusDot.Fill = brush;
            StatusDot.Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 6,
                Color = dotColor,
                ShadowDepth = 0,
                Opacity = 0.9,
            };
        });
    }
}

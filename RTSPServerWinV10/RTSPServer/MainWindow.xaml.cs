using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Win32;

namespace RTSPServer;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private const string PlayGlyph = "\uE768";
    private const string PauseGlyph = "\uE769";

    private RtspServer? _rtspServer;
    private VideoPlayer _videoPlayer = null!;
    private DispatcherTimer _uiUpdateTimer = null!;
    private DispatcherTimer _overlayIconTimer = null!;
    private string? _currentVideoFile;
    private bool _isUserDraggingSlider = false;

    public MainWindow()
    {
        InitializeComponent();
        InitializeComponents();
    }

    private void InitializeComponents()
    {
        _videoPlayer = new VideoPlayer();
        _videoPlayer.StateChanged += VideoPlayer_StateChanged;
        _videoPlayer.PositionChanged += VideoPlayer_PositionChanged;
        _videoPlayer.LogMessage += OnLogMessage;

        _uiUpdateTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(100)
        };
        _uiUpdateTimer.Tick += UiUpdateTimer_Tick;
        _uiUpdateTimer.Start();

        _overlayIconTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(800)
        };
        _overlayIconTimer.Tick += OverlayIconTimer_Tick;

        UpdateButtonStates();
        Log("애플리케이션 시작됨");
    }

    private void BtnOpenFile_Click(object sender, RoutedEventArgs e)
    {
        var openFileDialog = new OpenFileDialog
        {
            Title = "비디오 파일 선택",
            Filter = "비디오 파일 (*.mp4;*.avi;*.mkv;*.wmv;*.mov)|*.mp4;*.avi;*.mkv;*.wmv;*.mov|모든 파일 (*.*)|*.*",
            FilterIndex = 1
        };

        if (openFileDialog.ShowDialog() == true)
        {
            _currentVideoFile = openFileDialog.FileName;
            LoadVideo(_currentVideoFile);
        }
    }

    private void LoadVideo(string filePath)
    {
        try
        {
            MediaPlayer.Source = new Uri(filePath);
            _videoPlayer.LoadVideo(filePath);
            
            TxtVideoFile.Text = Path.GetFileName(filePath);
            PlaceholderText.Visibility = Visibility.Collapsed;
            
            Log($"비디오 로드됨: {Path.GetFileName(filePath)}");
            UpdateButtonStates();
        }
        catch (Exception ex)
        {
            Log($"비디오 로드 오류: {ex.Message}");
            MessageBox.Show($"비디오를 로드할 수 없습니다: {ex.Message}", "오류", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnPlay_Click(object sender, RoutedEventArgs e)
    {
        PlayVideo(showOverlayIcon: false);
    }

    private void BtnPause_Click(object sender, RoutedEventArgs e)
    {
        PauseVideo(showOverlayIcon: false);
    }

    private void BtnStop_Click(object sender, RoutedEventArgs e)
    {
        MediaPlayer.Stop();
        _videoPlayer.Stop();
        HideOverlayIcon();
    }

    private async void BtnStartServer_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_currentVideoFile))
        {
            MessageBox.Show("먼저 비디오를 로드하세요.", "알림", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        // 버튼을 즉시 비활성화하여 중복 클릭 방지
        BtnStartServer.IsEnabled = false;

        try
        {
            _rtspServer = new RtspServer(554);
            _rtspServer.SetVideoSource(_currentVideoFile);
            _rtspServer.LogMessage += OnLogMessage;

            await _rtspServer.StartAsync();

            BtnStopServer.IsEnabled = true;

            Log("RTSP 서버가 시작되었습니다.");
            Log($"클라이언트 연결 주소: {TxtServerUrl.Text}");
        }
        catch (Exception ex)
        {
            // 오류 발생 시 버튼 상태 복원
            BtnStartServer.IsEnabled = true;
            
            Log($"서버 시작 오류: {ex.Message}");
            MessageBox.Show($"RTSP 서버를 시작할 수 없습니다.\n\n" +
                $"포트 554를 사용하려면 관리자 권한이 필요합니다.\n\n" +
                $"오류: {ex.Message}", "오류", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnStopServer_Click(object sender, RoutedEventArgs e)
    {
        _rtspServer?.Stop();
        BtnStartServer.IsEnabled = true;
        BtnStopServer.IsEnabled = false;
    }

    private void VideoPlayer_StateChanged(object? sender, PlayerState state)
    {
        Dispatcher.Invoke(() =>
        {
            UpdateButtonStates();
            Log($"플레이어 상태: {state}");
        });
    }

    private void VideoPlayer_PositionChanged(object? sender, TimeSpan position)
    {
        // UI 업데이트는 타이머에서 처리하므로 여기서는 로그만 기록
    }

    private void UiUpdateTimer_Tick(object? sender, EventArgs e)
    {
        if (_isUserDraggingSlider)
            return;

        if (MediaPlayer.Source != null && MediaPlayer.NaturalDuration.HasTimeSpan)
        {
            var position = MediaPlayer.Position;
            var duration = MediaPlayer.NaturalDuration.TimeSpan;
            
            TxtCurrentTime.Text = position.ToString(@"hh\:mm\:ss");
            TxtDuration.Text = duration.ToString(@"hh\:mm\:ss");
            
            if (duration.TotalSeconds > 0)
            {
                TimelineSlider.Value = (position.TotalSeconds / duration.TotalSeconds) * 100;
            }
        }
    }

    private void TimelineSlider_PreviewMouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        _isUserDraggingSlider = true;
    }

    private void TimelineSlider_PreviewMouseLeftButtonUp(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        _isUserDraggingSlider = false;

        if (MediaPlayer.Source != null && MediaPlayer.NaturalDuration.HasTimeSpan)
        {
            var duration = MediaPlayer.NaturalDuration.TimeSpan;
            var newPosition = TimeSpan.FromSeconds((TimelineSlider.Value / 100) * duration.TotalSeconds);
            
            MediaPlayer.Position = newPosition;
            _videoPlayer.Seek(newPosition);
            
            Log($"재생 위치 이동: {newPosition:hh\\:mm\\:ss}");
        }
    }

    private void VideoSurfaceGrid_MouseLeftButtonUp(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (string.IsNullOrEmpty(_currentVideoFile))
        {
            return;
        }

        if (_videoPlayer.State == PlayerState.Playing)
        {
            PauseVideo(showOverlayIcon: true);
            return;
        }

        PlayVideo(showOverlayIcon: true);
    }

    private void PlayVideo(bool showOverlayIcon)
    {
        if (string.IsNullOrEmpty(_currentVideoFile))
        {
            MessageBox.Show("먼저 비디오를 로드하세요.", "알림",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        MediaPlayer.Play();
        _ = _videoPlayer.PlayAsync();

        if (showOverlayIcon)
        {
            ShowOverlayIcon(PlayGlyph, autoHide: true);
        }
    }

    private void PauseVideo(bool showOverlayIcon)
    {
        MediaPlayer.Pause();
        _videoPlayer.Pause();

        if (showOverlayIcon)
        {
            ShowOverlayIcon(PauseGlyph, autoHide: false);
        }
    }

    private void ShowOverlayIcon(string glyph, bool autoHide)
    {
        PlaybackOverlayGlyph.Text = glyph;
        PlaybackOverlayIcon.Visibility = Visibility.Visible;

        _overlayIconTimer.Stop();
        if (autoHide)
        {
            _overlayIconTimer.Start();
        }
    }

    private void HideOverlayIcon()
    {
        _overlayIconTimer.Stop();
        PlaybackOverlayIcon.Visibility = Visibility.Collapsed;
    }

    private void OverlayIconTimer_Tick(object? sender, EventArgs e)
    {
        HideOverlayIcon();
    }

    private void UpdateButtonStates()
    {
        bool hasVideo = !string.IsNullOrEmpty(_currentVideoFile);
        bool isPlaying = _videoPlayer.State == PlayerState.Playing;
        bool isPaused = _videoPlayer.State == PlayerState.Paused;

        BtnPlay.IsEnabled = hasVideo && !isPlaying;
        BtnPause.IsEnabled = hasVideo && isPlaying;
        BtnStop.IsEnabled = hasVideo && (isPlaying || isPaused);
    }

    private void OnLogMessage(object? sender, string message)
    {
        Dispatcher.Invoke(() => Log(message));
    }

    private void Log(string message)
    {
        TxtLog.AppendText($"{message}\n");
        TxtLog.ScrollToEnd();
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        _rtspServer?.Stop();
        MediaPlayer.Close();
        _uiUpdateTimer.Stop();
        _overlayIconTimer.Stop();
        base.OnClosing(e);
    }
}
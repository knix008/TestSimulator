using LibVLCSharp.Shared;
using System.ComponentModel;
using System.IO;
using System.Text.RegularExpressions;
using YoutubeExplode;
using YoutubeExplode.Videos.Streams;

namespace VideoPlayerV10.App;

public partial class MainForm : Form
{
    private LibVLC? _libVLC;
    private MediaPlayer? _mediaPlayer;
    private readonly YoutubeClient _youtubeClient = new();
    private bool _isUserSeeking;
    private string? _lastCodecHint;
    private string? _lastVlcErrorMessage;
    private string? _currentInput;
    private int _iconFadeCounter;
    private string _currentIcon = "▶";

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.Space)
        {
            TogglePlayPause();
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    public MainForm()
    {
        InitializeComponent();

        bool isDesignMode = LicenseManager.UsageMode == LicenseUsageMode.Designtime || (Site?.DesignMode ?? false);
        if (isDesignMode)
        {
            updateTimer.Enabled = false;
            return;
        }

        Core.Initialize();
        _libVLC = new LibVLC(
            "--avcodec-hw=d3d11va",
            "--network-caching=250",
            "--file-caching=150",
            "--live-caching=150"
        );

        _mediaPlayer = new MediaPlayer(_libVLC);
        _mediaPlayer.EnableMouseInput = false;
        _mediaPlayer.EnableKeyInput = false;
        videoView.MediaPlayer = _mediaPlayer;
        _mediaPlayer.EndReached += (_, _) => BeginInvoke(() => statusLabel.Text = "Playback ended");
        _mediaPlayer.EncounteredError += (_, _) => BeginInvoke(HandlePlaybackError);
        _mediaPlayer.Playing += (_, _) => BeginInvoke(() => statusLabel.Text = "Playing");
        _mediaPlayer.Paused += (_, _) => BeginInvoke(() => statusLabel.Text = "Paused");
        _mediaPlayer.Stopped += (_, _) => BeginInvoke(() => statusLabel.Text = "Stopped");
        _libVLC.Log += LibVlc_Log;

        AcceptButton = playButton;
        speedComboBox.SelectedIndex = 2;
        _mediaPlayer.Volume = volumeBar.Value;
        volumeValueLabel.Text = $"{volumeBar.Value}%";
        downloadButton.Enabled = false;
        updateTimer.Enabled = true;

    }

    private async void OpenFileButton_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter =
                "Video Files|*.mp4;*.mkv;*.avi;*.mov;*.wmv;*.flv;*.m4v;*.ts;*.m2ts;*.webm|" +
                "All Files|*.*"
        };

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            inputTextBox.Text = dialog.FileName;
            statusLabel.Text = $"Selected file: {Path.GetFileName(dialog.FileName)}";
            await PlayFromInputAsync();
        }
    }

    private async void PlayButton_Click(object? sender, EventArgs e)
    {
        await PlayFromInputAsync();
    }

    private void InputTextBox_TextChanged(object? sender, EventArgs e)
    {
        string input = inputTextBox.Text.Trim();
        bool isYouTube = IsYouTubeUrl(input);
        downloadButton.Enabled = isYouTube;
        
        if (isYouTube)
        {
            downloadButton.BackColor = Color.FromArgb(34, 197, 94);
        }
        else
        {
            downloadButton.BackColor = Color.FromArgb(156, 163, 175);
        }
    }

    private void PauseButton_Click(object? sender, EventArgs e)
    {
        _mediaPlayer?.Pause();
        statusLabel.Text = "Paused";
    }

    private void StopButton_Click(object? sender, EventArgs e)
    {
        _mediaPlayer?.Stop();
        seekBar.Value = seekBar.Minimum;
        timeLabel.Text = "00:00 / 00:00";
        statusLabel.Text = "Stopped";
    }

    private void VideoView_MouseClick(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        TogglePlayPause();
    }

    private void MainForm_KeyDown(object? sender, KeyEventArgs e)
    {
        statusLabel.Text = $"Key pressed: {e.KeyCode}";
        
        if (e.KeyCode == Keys.Space)
        {
            e.Handled = true;
            e.SuppressKeyPress = true;
            TogglePlayPause();
        }
    }

    private void TogglePlayPause()
    {
        if (_mediaPlayer is null)
        {
            return;
        }

        if (_mediaPlayer.Media is null)
        {
            return;
        }

        if (_mediaPlayer.IsPlaying)
        {
            _mediaPlayer.Pause();
            ShowPlayPauseIcon("⏸", false);
        }
        else
        {
            _mediaPlayer.Play();
            ShowPlayPauseIcon("▶", true);
        }
    }

    private void ShowPlayPauseIcon(string icon, bool autoHide)
    {
        if (playPauseIconPictureBox == null)
        {
            statusLabel.Text = "Icon picture box is null";
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(() => ShowPlayPauseIcon(icon, autoHide));
            return;
        }

        try
        {
            _currentIcon = icon;
            
            // 이전 이미지 해제
            playPauseIconPictureBox.Image?.Dispose();
            
            // 반투명 아이콘 이미지 생성
            playPauseIconPictureBox.Image = CreateIconImage(icon, 200, 200);
            playPauseIconPictureBox.Visible = true;
            playPauseIconPictureBox.BringToFront();
            statusLabel.Text = $"Showing icon: {icon}";

            iconFadeTimer.Stop();

            if (autoHide)
            {
                _iconFadeCounter = 0;
                iconFadeTimer.Start();
            }
        }
        catch (Exception ex)
        {
            statusLabel.Text = $"Icon error: {ex.Message}";
        }
    }

    private Bitmap CreateIconImage(string icon, int width, int height)
    {
        // 32비트 ARGB 비트맵 생성 (알파 채널 포함)
        Bitmap bitmap = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        
        using (Graphics g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
            
            // 투명한 배경으로 시작
            g.Clear(Color.Transparent);
            
            // 원형 반투명 배경 그리기
            int circleSize = Math.Min(width, height) - 20;
            int circleX = (width - circleSize) / 2;
            int circleY = (height - circleSize) / 2;
            
            using (SolidBrush circleBrush = new SolidBrush(Color.FromArgb(150, 0, 0, 0)))
            {
                g.FillEllipse(circleBrush, circleX, circleY, circleSize, circleSize);
            }
            
            // 아이콘 그리기 (Play: 삼각형, Pause: 두 개의 막대)
            using (SolidBrush iconBrush = new SolidBrush(Color.FromArgb(240, 255, 255, 255)))
            {
                float centerX = width / 2f;
                float centerY = height / 2f;
                
                if (icon == "▶") // Play 아이콘
                {
                    // 삼각형 그리기
                    float triangleSize = circleSize * 0.35f;
                    PointF[] triangle = new PointF[]
                    {
                        new PointF(centerX - triangleSize/3, centerY - triangleSize/2),
                        new PointF(centerX - triangleSize/3, centerY + triangleSize/2),
                        new PointF(centerX + triangleSize*2/3, centerY)
                    };
                    g.FillPolygon(iconBrush, triangle);
                }
                else if (icon == "⏸") // Pause 아이콘
                {
                    // 두 개의 수직 막대 그리기
                    float barWidth = circleSize * 0.12f;
                    float barHeight = circleSize * 0.4f;
                    float spacing = circleSize * 0.1f;
                    
                    RectangleF leftBar = new RectangleF(
                        centerX - spacing - barWidth,
                        centerY - barHeight/2,
                        barWidth,
                        barHeight
                    );
                    RectangleF rightBar = new RectangleF(
                        centerX + spacing,
                        centerY - barHeight/2,
                        barWidth,
                        barHeight
                    );
                    
                    g.FillRectangle(iconBrush, leftBar);
                    g.FillRectangle(iconBrush, rightBar);
                }
            }
        }
        
        return bitmap;
    }

    private void PlayPauseIcon_Click(object? sender, EventArgs e)
    {
        // 아이콘 클릭 시 재생/일시정지 토글
        TogglePlayPause();
    }



    private void IconFadeTimer_Tick(object? sender, EventArgs e)
    {
        _iconFadeCounter++;
        if (_iconFadeCounter >= 2)
        {
            iconFadeTimer.Stop();
            if (playPauseIconPictureBox != null)
            {
                playPauseIconPictureBox.Visible = false;
                playPauseIconPictureBox.Image?.Dispose();
                playPauseIconPictureBox.Image = null;
            }
            _iconFadeCounter = 0;
        }
    }

    private async void DownloadButton_Click(object? sender, EventArgs e)
    {
        string input = inputTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(input))
        {
            MessageBox.Show(this, "YouTube URL을 입력하세요.", "URL Required", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (!IsYouTubeUrl(input))
        {
            MessageBox.Show(this, "YouTube URL이 아닙니다.\n\nYouTube 동영상만 다운로드할 수 있습니다.", "Invalid URL", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            downloadButton.Enabled = false;
            statusLabel.Text = "YouTube 동영상 정보 가져오는 중...";

            var videoId = YoutubeExplode.Videos.VideoId.Parse(input);
            var video = await _youtubeClient.Videos.GetAsync(videoId);
            var streamManifest = await _youtubeClient.Videos.Streams.GetManifestAsync(videoId);

            IStreamInfo? streamInfo =
                streamManifest.GetMuxedStreams().TryGetWithHighestVideoQuality()
                ?? streamManifest.GetVideoOnlyStreams().TryGetWithHighestVideoQuality();

            if (streamInfo is null)
            {
                MessageBox.Show(this, "다운로드 가능한 스트림을 찾을 수 없습니다.", "Download Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string sanitizedTitle = SanitizeFileName(video.Title);
            string extension = streamInfo.Container.Name;

            using var saveDialog = new SaveFileDialog
            {
                FileName = $"{sanitizedTitle}.{extension}",
                Filter = $"Video Files|*.{extension}|All Files|*.*",
                Title = "Save YouTube Video"
            };

            if (saveDialog.ShowDialog(this) != DialogResult.OK)
            {
                statusLabel.Text = "다운로드 취소됨";
                return;
            }

            statusLabel.Text = "다운로드 중... 0%";

            var progress = new Progress<double>(p =>
            {
                int percent = (int)(p * 100);
                if (InvokeRequired)
                {
                    BeginInvoke(() => statusLabel.Text = $"다운로드 중... {percent}%");
                }
                else
                {
                    statusLabel.Text = $"다운로드 중... {percent}%";
                }
            });

            await _youtubeClient.Videos.Streams.DownloadAsync(streamInfo, saveDialog.FileName, progress);

            statusLabel.Text = $"다운로드 완료: {Path.GetFileName(saveDialog.FileName)}";
            MessageBox.Show(this, $"다운로드 완료!\n\n저장 위치:\n{saveDialog.FileName}", "Download Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            statusLabel.Text = "다운로드 실패";
            MessageBox.Show(this, $"다운로드 중 오류가 발생했습니다:\n\n{ex.Message}", "Download Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            downloadButton.Enabled = true;
        }
    }

    private static string SanitizeFileName(string fileName)
    {
        char[] invalidChars = Path.GetInvalidFileNameChars();
        string sanitized = string.Join("_", fileName.Split(invalidChars, StringSplitOptions.RemoveEmptyEntries));
        return sanitized.Length > 100 ? sanitized.Substring(0, 100) : sanitized;
    }

    private async Task PlayFromInputAsync()
    {
        if (_mediaPlayer is null || _libVLC is null)
        {
            return;
        }

        string rawInput = inputTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(rawInput))
        {
            MessageBox.Show(this, "파일 경로 또는 스트림 URL을 입력하세요.", "Input Required", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        bool isNewSource = !string.Equals(_currentInput, rawInput, StringComparison.OrdinalIgnoreCase);
        if (isNewSource)
        {
            PrepareForNewMedia();
        }

        bool isUriCreated = Uri.TryCreate(rawInput, UriKind.Absolute, out var parsedUri);
        bool isUrl = isUriCreated
                     && parsedUri is not null
                     && (parsedUri.Scheme == Uri.UriSchemeHttp
                         || parsedUri.Scheme == Uri.UriSchemeHttps
                         || parsedUri.Scheme == "rtsp"
                         || parsedUri.Scheme == "rtmp");

        if (IsYouTubeUrl(rawInput))
        {
            statusLabel.Text = "Resolving YouTube stream...";
            string? youtubeStreamUrl = await TryResolveYouTubeStreamUrlAsync(rawInput);

            if (string.IsNullOrWhiteSpace(youtubeStreamUrl))
            {
                MessageBox.Show(this, "YouTube 링크를 재생 가능한 스트림으로 변환하지 못했습니다.", "YouTube Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            ResetPlaybackHints(rawInput);
            using var youtubeMedia = new Media(_libVLC, new Uri(youtubeStreamUrl));
            _mediaPlayer.Play(youtubeMedia);
            statusLabel.Text = "Playing YouTube stream";
            return;
        }

        if (isUrl && parsedUri is not null)
        {
            ResetPlaybackHints(rawInput);
            using var media = new Media(_libVLC, parsedUri);
            _mediaPlayer.Play(media);
            statusLabel.Text = $"Playing stream: {parsedUri.Scheme}://...";
            return;
        }

        if (!File.Exists(rawInput))
        {
            MessageBox.Show(this, "유효한 파일 경로 또는 스트림 URL이 아닙니다.", "Invalid Source", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        ResetPlaybackHints(rawInput);
        using var fileMedia = new Media(_libVLC, new Uri(rawInput));
        _mediaPlayer.Play(fileMedia);
        statusLabel.Text = $"Playing file: {Path.GetFileName(rawInput)}";
    }

    private void PrepareForNewMedia()
    {
        if (_mediaPlayer is null)
        {
            return;
        }

        // Stop previous playback so last paused frame/state is cleared.
        _mediaPlayer.Stop();
        _isUserSeeking = false;
        seekBar.Value = seekBar.Minimum;
        timeLabel.Text = "00:00 / 00:00";

        iconFadeTimer.Stop();
        if (playPauseIconPictureBox != null)
        {
            playPauseIconPictureBox.Visible = false;
            playPauseIconPictureBox.Image?.Dispose();
            playPauseIconPictureBox.Image = null;
        }
    }

    private void ResetPlaybackHints(string source)
    {
        _currentInput = source;
        _lastCodecHint = null;
        _lastVlcErrorMessage = null;
    }

    private async Task<string?> TryResolveYouTubeStreamUrlAsync(string youtubeUrl)
    {
        try
        {
            var videoId = YoutubeExplode.Videos.VideoId.Parse(youtubeUrl);
            var streamManifest = await _youtubeClient.Videos.Streams.GetManifestAsync(videoId);
            IStreamInfo? streamInfo =
                streamManifest.GetMuxedStreams().TryGetWithHighestVideoQuality()
                ?? streamManifest.GetVideoOnlyStreams().TryGetWithHighestVideoQuality();

            return streamInfo?.Url;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsYouTubeUrl(string input)
    {
        if (!Uri.TryCreate(input, UriKind.Absolute, out Uri? uri))
        {
            return false;
        }

        return uri.Host.Contains("youtube.com", StringComparison.OrdinalIgnoreCase)
               || uri.Host.Contains("youtu.be", StringComparison.OrdinalIgnoreCase);
    }

    private void UpdateTimer_Tick(object? sender, EventArgs e)
    {
        if (_mediaPlayer is null)
        {
            return;
        }

        if (_mediaPlayer.Length > 0)
        {
            if (!_isUserSeeking)
            {
                int value = (int)Math.Clamp(_mediaPlayer.Position * seekBar.Maximum, 0, seekBar.Maximum);
                seekBar.Value = value;
            }

            TimeSpan current = TimeSpan.FromMilliseconds(Math.Max(0, _mediaPlayer.Time));
            TimeSpan total = TimeSpan.FromMilliseconds(Math.Max(0, _mediaPlayer.Length));
            timeLabel.Text = $"{current:mm\\:ss} / {total:mm\\:ss}";
        }
        else
        {
            timeLabel.Text = "00:00 / 00:00";
        }

        mediaInfoLabel.Text = BuildMediaInfoText();
    }

    private string BuildMediaInfoText()
    {
        if (_mediaPlayer is null)
        {
            return "Codec: -  Bitrate: -  Resolution: -  FPS: -  Playback: 1.0x";
        }

        uint width = 0;
        uint height = 0;
        _mediaPlayer.Size(0, ref width, ref height);
        string resolution = width > 0 && height > 0 ? $"{width}x{height}" : "-";
        string fps = _mediaPlayer.Fps > 0 ? $"{_mediaPlayer.Fps:0.##}" : "-";
        string codec = "-";
        string bitrate = "-";

        Media? media = _mediaPlayer.Media;
        MediaTrack[]? tracks = media?.Tracks;

        if (media is not null && tracks is not null)
        {
            foreach (MediaTrack track in tracks)
            {
                if (track.TrackType != TrackType.Video)
                {
                    continue;
                }

                codec = media.CodecDescription(TrackType.Video, track.Codec) ?? ConvertFourCc(track.Codec);
                if (track.Bitrate > 0)
                {
                    bitrate = $"{track.Bitrate / 1000.0:0.#} kbps";
                }

                break;
            }

            if (bitrate == "-")
            {
                MediaStats stats = media.Statistics;
                float statsBitrate = stats.DemuxBitrate > 0 ? stats.DemuxBitrate : stats.InputBitrate;
                if (statsBitrate > 0)
                {
                    bitrate = $"{statsBitrate:0.##} kb/s";
                }
            }
        }

        return $"Codec: {codec}  Bitrate: {bitrate}  Resolution: {resolution}  FPS: {fps}  Playback: {_mediaPlayer.Rate:0.##}x";
    }

    private static string ConvertFourCc(uint fourCc)
    {
        char c1 = (char)(fourCc & 0xFF);
        char c2 = (char)((fourCc >> 8) & 0xFF);
        char c3 = (char)((fourCc >> 16) & 0xFF);
        char c4 = (char)((fourCc >> 24) & 0xFF);
        return $"{c1}{c2}{c3}{c4}".Trim('\0', ' ');
    }

    private void LibVlc_Log(object? sender, LogEventArgs e)
    {
        string message = e.FormattedLog;
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        string lowered = message.ToLowerInvariant();
        bool isDecoderError =
            lowered.Contains("decoder") ||
            lowered.Contains("codec") ||
            lowered.Contains("not supported") ||
            lowered.Contains("cannot decode");

        if (!isDecoderError)
        {
            return;
        }

        _lastVlcErrorMessage = message.Trim();
        string? codec = ExtractCodecName(message);
        if (!string.IsNullOrWhiteSpace(codec))
        {
            _lastCodecHint = codec;
        }
    }

    private static string? ExtractCodecName(string message)
    {
        // Typical VLC errors include codec identifiers in quotes/backticks.
        Match quoted = Regex.Match(message, "[`'\\\"](?<codec>[a-zA-Z0-9_\\-]{2,20})[`'\\\"]");
        if (quoted.Success)
        {
            return quoted.Groups["codec"].Value;
        }

        Match knownCodec = Regex.Match(
            message,
            "\\b(?<codec>h264|avc1|hevc|h265|av1|vp9|vp8|mpeg2video|mpeg4|wmv3|aac|ac3|eac3|dts|flac|opus|vorbis)\\b",
            RegexOptions.IgnoreCase);

        return knownCodec.Success ? knownCodec.Groups["codec"].Value.ToLowerInvariant() : null;
    }

    private void HandlePlaybackError()
    {
        string codecPart = string.IsNullOrWhiteSpace(_lastCodecHint)
            ? "코덱 정보를 자동 추출하지 못했습니다."
            : $"필요한 코덱 추정: {_lastCodecHint}";

        string sourcePart = string.IsNullOrWhiteSpace(_currentInput)
            ? string.Empty
            : $"{Environment.NewLine}소스: {_currentInput}";

        statusLabel.Text = $"Playback error - {codecPart}";

        MessageBox.Show(
            this,
            $"동영상을 재생할 수 없습니다.{Environment.NewLine}{codecPart}{sourcePart}{Environment.NewLine}{Environment.NewLine}참고 로그: {_lastVlcErrorMessage ?? "-"}",
            "Codec Required",
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
    }

    private void SeekBar_MouseDown(object? sender, MouseEventArgs e)
    {
        _isUserSeeking = true;
    }

    private void SeekBar_MouseUp(object? sender, MouseEventArgs e)
    {
        _isUserSeeking = false;

        if (_mediaPlayer is not null && _mediaPlayer.Length > 0)
        {
            _mediaPlayer.Position = (float)seekBar.Value / seekBar.Maximum;
        }
    }

    private void VolumeBar_Scroll(object? sender, EventArgs e)
    {
        if (_mediaPlayer is not null)
        {
            _mediaPlayer.Volume = volumeBar.Value;
        }
        volumeValueLabel.Text = $"{volumeBar.Value}%";
    }

    private void SpeedComboBox_SelectedIndexChanged(object? sender, EventArgs e)
    {
        string selectedText = speedComboBox.SelectedItem?.ToString() ?? "1.0x";
        if (float.TryParse(selectedText.Replace("x", string.Empty), out float speed))
        {
            _mediaPlayer?.SetRate(speed);
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        videoView.MediaPlayer = null;
        if (_libVLC is not null)
        {
            _libVLC.Log -= LibVlc_Log;
        }

        _mediaPlayer?.Dispose();
        _libVLC?.Dispose();
        base.OnFormClosed(e);
    }
}

using LibVLCSharp.Shared;
using System.IO;
using System.Text.RegularExpressions;
using YoutubeExplode;
using YoutubeExplode.Videos.Streams;

namespace VideoPlayerV10.App;

public partial class MainForm : Form
{
    private readonly LibVLC _libVLC;
    private readonly MediaPlayer _mediaPlayer;
    private readonly YoutubeClient _youtubeClient = new();
    private bool _isUserSeeking;
    private string? _lastCodecHint;
    private string? _lastVlcErrorMessage;
    private string? _currentInput;

    public MainForm()
    {
        InitializeComponent();

        Core.Initialize();
        _libVLC = new LibVLC(
            "--avcodec-hw=d3d11va",
            "--network-caching=250",
            "--file-caching=150",
            "--live-caching=150"
        );

        _mediaPlayer = new MediaPlayer(_libVLC);
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

    private void PauseButton_Click(object? sender, EventArgs e)
    {
        _mediaPlayer.Pause();
        statusLabel.Text = "Paused";
    }

    private void StopButton_Click(object? sender, EventArgs e)
    {
        _mediaPlayer.Stop();
        statusLabel.Text = "Stopped";
    }

    private async Task PlayFromInputAsync()
    {
        string rawInput = inputTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(rawInput))
        {
            MessageBox.Show(this, "파일 경로 또는 스트림 URL을 입력하세요.", "Input Required", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
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

        if (_mediaPlayer.Length > 0)
        {
            _mediaPlayer.Position = (float)seekBar.Value / seekBar.Maximum;
        }
    }

    private void VolumeBar_Scroll(object? sender, EventArgs e)
    {
        _mediaPlayer.Volume = volumeBar.Value;
    }

    private void SpeedComboBox_SelectedIndexChanged(object? sender, EventArgs e)
    {
        string selectedText = speedComboBox.SelectedItem?.ToString() ?? "1.0x";
        if (float.TryParse(selectedText.Replace("x", string.Empty), out float speed))
        {
            _mediaPlayer.SetRate(speed);
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        videoView.MediaPlayer = null;
        _libVLC.Log -= LibVlc_Log;
        _mediaPlayer.Dispose();
        _libVLC.Dispose();
        base.OnFormClosed(e);
    }
}

using LibVLCSharp.Shared;
using System.IO;

namespace VideoPlayerV10.App;

public partial class MainForm : Form
{
    private readonly LibVLC _libVLC;
    private readonly MediaPlayer _mediaPlayer;

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

        AcceptButton = playButton;
    }

    private void OpenFileButton_Click(object? sender, EventArgs e)
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
            PlayFromInput();
        }
    }

    private void PlayButton_Click(object? sender, EventArgs e)
    {
        PlayFromInput();
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

    private void PlayFromInput()
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

        if (isUrl && parsedUri is not null)
        {
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

        using var fileMedia = new Media(_libVLC, new Uri(rawInput));
        _mediaPlayer.Play(fileMedia);
        statusLabel.Text = $"Playing file: {Path.GetFileName(rawInput)}";
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        videoView.MediaPlayer = null;
        _mediaPlayer.Dispose();
        _libVLC.Dispose();
        base.OnFormClosed(e);
    }
}

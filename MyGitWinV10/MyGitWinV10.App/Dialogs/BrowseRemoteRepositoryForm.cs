using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class BrowseRemoteRepositoryForm : Form
{
    private CancellationTokenSource? _browseCts;
    private readonly AppSettingsStore _settings = AppSettingsStore.Load();

    public BrowseRemoteRepositoryForm()
    {
        InitializeComponent();
        ResetProgress();

        urlTextBox.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
        urlTextBox.AutoCompleteSource = AutoCompleteSource.CustomSource;
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();
    }

    public string? RepositoryPath { get; private set; }

    public string? RepositoryUrl { get; private set; }

    private string? _lastUsername;
    private string? _lastPassword;

    private void CancelButton_Click(object? sender, EventArgs e)
    {
        if (_browseCts is { IsCancellationRequested: false })
        {
            RequestBrowseCancellation();
            return;
        }

        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void BrowseRemoteRepositoryForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (DialogResult == DialogResult.OK)
        {
            return;
        }

        if (_browseCts is { IsCancellationRequested: false })
        {
            e.Cancel = true;
            RequestBrowseCancellation();
        }
    }

    private void RequestBrowseCancellation()
    {
        statusLabel.Text = "Cancelling...";
        cancelButton.Enabled = false;
        browseButton.Enabled = false;
        _browseCts?.Cancel();
    }

    private async void BrowseButton_Click(object? sender, EventArgs e)
    {
        if (_browseCts is { IsCancellationRequested: false })
        {
            RequestBrowseCancellation();
            return;
        }

        var url = urlTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            MessageBox.Show(this, "Please enter a repository URL.", "MyGit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _settings.RecordRecentCloneUrl(url);
        _settings.Save();
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();

        _browseCts?.Dispose();
        _browseCts = new CancellationTokenSource();
        var cancellationToken = _browseCts.Token;

        SetBusy(true);
        ResetProgress();
        statusLabel.Text = "Downloading... 0%";
        var prompt = new CredentialsPrompt(this, _lastUsername, _lastPassword);
        try
        {
            var path = await Task.Run(
                () => RemoteRepositoryService.EnsureBareRepository(
                    url,
                    prompt.Handler,
                    ReportBrowseProgress,
                    cancellationToken),
                cancellationToken);

            UpdateProgress(1f);
            RepositoryPath = path;
            RepositoryUrl = url;
            _browseCts?.Dispose();
            _browseCts = null;
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Cancelled.";
        }
        catch (Exception) when (WasBrowseCancelled())
        {
            statusLabel.Text = "Cancelled.";
        }
        catch (Exception ex)
        {
            statusLabel.Text = "Failed.";
            ErrorDetailDialog.Show(this, "Browse Remote Failed", ex);
        }
        finally
        {
            if (prompt.LastEntered is { } entered)
            {
                _lastUsername = entered.Username;
                _lastPassword = entered.Password;
            }

            _browseCts?.Dispose();
            _browseCts = null;
            SetBusy(false);
            cancelButton.Enabled = true;

            if (DialogResult != DialogResult.OK)
            {
                ResetProgress();
                if (statusLabel.Text is "Complete." or "")
                {
                    statusLabel.Text = "Ready";
                }
            }
        }
    }

    private bool WasBrowseCancelled() => _browseCts?.IsCancellationRequested == true;

    private AutoCompleteStringCollection CreateRecentUrlSource()
    {
        var source = new AutoCompleteStringCollection();
        source.AddRange(_settings.RecentCloneUrls.ToArray());
        return source;
    }

    private void ReportBrowseProgress(float progress)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(ReportBrowseProgress, progress);
            }
            catch (ObjectDisposedException)
            {
            }

            return;
        }

        UpdateProgress(progress);
    }

    private void ResetProgress()
    {
        progressBar.Value = 0;
        progressPercentLabel.Text = "0%";
    }

    private void UpdateProgress(float progress)
    {
        if (IsDisposed)
        {
            return;
        }

        var percent = Math.Clamp((int)Math.Round(progress * 100f), 0, 100);
        progressBar.Value = percent;
        progressPercentLabel.Text = $"{percent}%";
        statusLabel.Text = percent >= 100 ? "Complete." : $"Downloading... {percent}%";
    }

    private void SetBusy(bool busy)
    {
        urlTextBox.Enabled = !busy;
        browseButton.Enabled = true;
        browseButton.Text = busy ? "Stop" : "Browse";
        browseButton.BackColor = busy
            ? Color.FromArgb(220, 38, 38)
            : Color.FromArgb(37, 99, 235);
        browseButton.Size = new Size(75, 28);
    }
}

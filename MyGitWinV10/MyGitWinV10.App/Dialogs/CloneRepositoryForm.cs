using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class CloneRepositoryForm : Form
{
    private CancellationTokenSource? _cloneCts;
    private readonly AppSettingsStore _settings = AppSettingsStore.Load();

    public CloneRepositoryForm()
    {
        InitializeComponent();
        ResetProgress();

        urlTextBox.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
        urlTextBox.AutoCompleteSource = AutoCompleteSource.CustomSource;
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();
    }

    public string? ClonedRepositoryPath { get; private set; }

    public string? RepositoryUrl { get; private set; }

    // Kept in memory only (not persisted to disk) so a failed attempt doesn't force retyping.
    private string? _lastUsername;
    private string? _lastPassword;

    private void BrowseButton_Click(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog { Description = "Select an empty destination folder for the clone" };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            destinationTextBox.Text = dialog.SelectedPath;
        }
    }

    private void CancelButton_Click(object? sender, EventArgs e)
    {
        if (_cloneCts is { IsCancellationRequested: false })
        {
            RequestCloneCancellation();
            return;
        }

        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void CloneRepositoryForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (DialogResult == DialogResult.OK)
        {
            return;
        }

        if (_cloneCts is { IsCancellationRequested: false })
        {
            e.Cancel = true;
            RequestCloneCancellation();
        }
    }

    private void RequestCloneCancellation()
    {
        statusLabel.Text = "Cancelling...";
        cancelButton.Enabled = false;
        cloneButton.Enabled = false;
        _cloneCts?.Cancel();
    }

    private async void CloneButton_Click(object? sender, EventArgs e)
    {
        if (_cloneCts is { IsCancellationRequested: false })
        {
            RequestCloneCancellation();
            return;
        }

        var url = urlTextBox.Text.Trim();
        var destination = destinationTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(destination))
        {
            MessageBox.Show(this, "Please enter both a repository URL and a destination folder.", "MyGit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        // Record the URL up front (not just on success) so a failed attempt doesn't force
        // the user to retype it — it will still show up in the autocomplete suggestions.
        _settings.RecordRecentCloneUrl(url);
        _settings.Save();
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();

        _cloneCts?.Dispose();
        _cloneCts = new CancellationTokenSource();
        var cancellationToken = _cloneCts.Token;

        SetBusy(true);
        ResetProgress();
        statusLabel.Text = "Cloning... 0%";
        var prompt = new CredentialsPrompt(this, _lastUsername, _lastPassword);
        try
        {
            await Task.Run(
                () => GitRepositoryService.Clone(
                    url,
                    destination,
                    prompt.Handler,
                    ReportCloneProgress,
                    cancellationToken),
                cancellationToken);

            UpdateProgress(1f);
            ClonedRepositoryPath = destination;
            RepositoryUrl = url;
            _cloneCts?.Dispose();
            _cloneCts = null;
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Cancelled.";
        }
        catch (Exception) when (WasCloneCancelled())
        {
            statusLabel.Text = "Cancelled.";
        }
        catch (Exception ex)
        {
            statusLabel.Text = "Failed.";
            ErrorDetailDialog.Show(this, "Clone Failed", ex);
        }
        finally
        {
            if (prompt.LastEntered is { } entered)
            {
                _lastUsername = entered.Username;
                _lastPassword = entered.Password;
            }

            _cloneCts?.Dispose();
            _cloneCts = null;
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

    private bool WasCloneCancelled() => _cloneCts?.IsCancellationRequested == true;

    private AutoCompleteStringCollection CreateRecentUrlSource()
    {
        var source = new AutoCompleteStringCollection();
        source.AddRange(_settings.RecentCloneUrls.ToArray());
        return source;
    }

    private void ReportCloneProgress(float progress)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(ReportCloneProgress, progress);
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
        statusLabel.Text = percent >= 100 ? "Complete." : $"Cloning... {percent}%";
    }

    private void SetBusy(bool busy)
    {
        urlTextBox.Enabled = !busy;
        destinationTextBox.Enabled = !busy;
        browseButton.Enabled = !busy;
        cloneButton.Enabled = true;
        cloneButton.Text = busy ? "Stop" : "Clone";
        cloneButton.BackColor = busy
            ? Color.FromArgb(220, 38, 38)
            : Color.FromArgb(37, 99, 235);
        cloneButton.Size = new Size(75, 28);
    }
}

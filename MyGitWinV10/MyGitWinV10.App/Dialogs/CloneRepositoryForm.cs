using MyGitWinV10.App.Controls;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class CloneRepositoryForm : Form
{
    private CancellationTokenSource? _cloneCts;
    private readonly AppSettingsStore _settings = AppSettingsStore.Load();
    private bool _busy;

    public CloneRepositoryForm()
    {
        InitializeComponent();
        ResetProgress();
        ApplyLocalizedText();

        urlTextBox.AutoCompleteMode = AutoCompleteMode.Suggest;
        urlTextBox.AutoCompleteSource = AutoCompleteSource.CustomSource;
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();
        RefreshRecentUrlItems();
        RecentUrlComboBoxBehavior.Attach(urlTextBox, () => _settings.RecentCloneUrls, RemoveRecentUrl);

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged()
    {
        ApplyLocalizedText();
        SetBusy(_busy);
    }

    private void ApplyLocalizedText()
    {
        Text = Localization.T("Clone.Title");
        urlLabel.Text = Localization.T("Clone.UrlLabel");
        destinationLabel.Text = Localization.T("Clone.DestLabel");
        browseButton.Text = Localization.T("Clone.BrowseFolder");
        cancelButton.Text = Localization.T("Common.Cancel");
        if (!_busy)
        {
            cloneButton.Text = Localization.T("Clone.CloneButton");
        }
    }

    private void RemoveRecentUrl(string url)
    {
        _settings.RemoveRecentCloneUrl(url);
        _settings.Save();
    }

    private void RefreshRecentUrlItems()
    {
        urlTextBox.Items.Clear();
        urlTextBox.Items.AddRange(_settings.RecentCloneUrls.ToArray());
    }

    public string? ClonedRepositoryPath { get; private set; }

    public string? RepositoryUrl { get; private set; }

    private string? _lastUsername;
    private string? _lastPassword;

    private void BrowseButton_Click(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog { Description = Localization.T("Clone.FolderPrompt") };
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
        statusLabel.Text = Localization.T("Status.Cancelling");
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
            MessageBox.Show(this, Localization.T("Clone.NeedUrlAndFolder"), Localization.T("App.Title"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _settings.RecordRecentCloneUrl(url);
        _settings.Save();
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();
        RefreshRecentUrlItems();

        _cloneCts?.Dispose();
        _cloneCts = new CancellationTokenSource();
        var cancellationToken = _cloneCts.Token;

        SetBusy(true);
        ResetProgress();
        statusLabel.Text = Localization.Tf("Status.Cloning", 0);
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
            statusLabel.Text = Localization.T("Status.Cancelled");
        }
        catch (Exception) when (WasCloneCancelled())
        {
            statusLabel.Text = Localization.T("Status.Cancelled");
        }
        catch (Exception ex)
        {
            statusLabel.Text = Localization.T("Status.Failed");
            ErrorDetailDialog.Show(this, Localization.T("Clone.Failed"), ex);
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
                if (statusLabel.Text is var text && (text == Localization.T("Status.Complete") || text == string.Empty))
                {
                    statusLabel.Text = Localization.T("Status.Ready");
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
        statusLabel.Text = percent >= 100
            ? Localization.T("Status.Complete")
            : Localization.Tf("Status.Cloning", percent);
    }

    private void SetBusy(bool busy)
    {
        _busy = busy;
        urlTextBox.Enabled = !busy;
        destinationTextBox.Enabled = !busy;
        browseButton.Enabled = !busy;
        cloneButton.Enabled = true;
        cloneButton.Text = busy ? Localization.T("Clone.StopButton") : Localization.T("Clone.CloneButton");
        cloneButton.BackColor = busy
            ? Color.FromArgb(220, 38, 38)
            : Color.FromArgb(37, 99, 235);
        cloneButton.Size = new Size(75, 28);
    }
}

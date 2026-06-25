using MyGitWinV10.App.Controls;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class BrowseRemoteRepositoryForm : Form
{
    private CancellationTokenSource? _browseCts;
    private readonly AppSettingsStore _settings = AppSettingsStore.Load();
    private bool _busy;

    public BrowseRemoteRepositoryForm()
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
        Text = Localization.T("Browse.Title");
        urlLabel.Text = Localization.T("Clone.UrlLabel");
        infoLabel.Text = Localization.T("Browse.Info");
        cancelButton.Text = Localization.T("Common.Cancel");
        if (!_busy)
        {
            browseButton.Text = Localization.T("Browse.BrowseButton");
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
        statusLabel.Text = Localization.T("Status.Cancelling");
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
            MessageBox.Show(this, Localization.T("Browse.NeedUrl"), Localization.T("App.Title"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _settings.RecordRecentCloneUrl(url);
        _settings.Save();
        urlTextBox.AutoCompleteCustomSource = CreateRecentUrlSource();
        RefreshRecentUrlItems();

        _browseCts?.Dispose();
        _browseCts = new CancellationTokenSource();
        var cancellationToken = _browseCts.Token;

        SetBusy(true);
        ResetProgress();
        statusLabel.Text = Localization.Tf("Status.Downloading", 0);
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
            statusLabel.Text = Localization.T("Status.Cancelled");
        }
        catch (Exception) when (WasBrowseCancelled())
        {
            statusLabel.Text = Localization.T("Status.Cancelled");
        }
        catch (Exception ex)
        {
            statusLabel.Text = Localization.T("Status.Failed");
            ErrorDetailDialog.Show(this, Localization.T("Browse.Failed"), ex);
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
                if (statusLabel.Text is var text && (text == Localization.T("Status.Complete") || text == string.Empty))
                {
                    statusLabel.Text = Localization.T("Status.Ready");
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
        statusLabel.Text = percent >= 100
            ? Localization.T("Status.Complete")
            : Localization.Tf("Status.Downloading", percent);
    }

    private void SetBusy(bool busy)
    {
        _busy = busy;
        urlTextBox.Enabled = !busy;
        browseButton.Enabled = true;
        browseButton.Text = busy ? Localization.T("Clone.StopButton") : Localization.T("Browse.BrowseButton");
        browseButton.BackColor = busy
            ? Color.FromArgb(220, 38, 38)
            : Color.FromArgb(37, 99, 235);
        browseButton.Size = new Size(75, 28);
    }
}

using System.Text.Json;
using Markdig;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win.Forms;

internal sealed class PageCommentsPanel : UserControl
{
    private const int ComposeBaseHeight = 132;
    private const int QuotePreviewHeight = 58;

    private readonly MarkdownPipeline _pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();
    private readonly Panel _pnlHeader = new();
    private readonly Label _lblHeader = new();
    private readonly Button _btnClose = new();
    private readonly ToolTip _toolTip = new();
    private readonly WebView2 _webView = new();
    private readonly Panel _pnlCompose = new();
    private readonly TextBox _txtQuotePreview = new();
    private readonly TextBox _txtCompose = new();
    private readonly FlowLayoutPanel _composeButtons = new();
    private readonly Button _btnAttachImage = new();
    private readonly Button _btnAttachFile = new();
    private readonly Button _btnPost = new();
    private bool _webViewReady;
    private int? _pageId;
    private string? _pendingQuotedText;

    public PageCommentsPanel()
    {
        Dock = DockStyle.Fill;
        BackColor = AppTheme.Sidebar;
        Padding = new Padding(0);

        _pnlHeader.Dock = DockStyle.Top;
        _pnlHeader.Height = 32;
        _pnlHeader.Padding = new Padding(12, 0, 4, 0);

        _lblHeader.Dock = DockStyle.Fill;
        _lblHeader.TextAlign = ContentAlignment.MiddleLeft;
        _lblHeader.Font = new Font("Segoe UI Semibold", 9.75F, FontStyle.Bold);

        _btnClose.Dock = DockStyle.Right;
        _btnClose.Width = 28;
        _btnClose.TabStop = false;
        _btnClose.Text = "×";
        _btnClose.Font = new Font("Segoe UI", 12F, FontStyle.Regular);
        _btnClose.FlatStyle = FlatStyle.Flat;
        _btnClose.FlatAppearance.BorderSize = 0;
        _btnClose.Cursor = Cursors.Hand;
        _btnClose.Click += (_, _) => CloseRequested?.Invoke(this, EventArgs.Empty);

        _pnlHeader.Controls.Add(_lblHeader);
        _pnlHeader.Controls.Add(_btnClose);

        _webView.Dock = DockStyle.Fill;
        _webView.DefaultBackgroundColor = AppTheme.Sidebar;

        _pnlCompose.Dock = DockStyle.Bottom;
        _pnlCompose.Padding = new Padding(10, 8, 10, 10);
        _pnlCompose.Height = ComposeBaseHeight;

        _txtQuotePreview.Multiline = true;
        _txtQuotePreview.ReadOnly = true;
        _txtQuotePreview.Dock = DockStyle.Top;
        _txtQuotePreview.Height = QuotePreviewHeight;
        _txtQuotePreview.Visible = false;
        _txtQuotePreview.BorderStyle = BorderStyle.None;
        _txtQuotePreview.Font = new Font("Segoe UI", 9F, FontStyle.Italic);
        _txtQuotePreview.ScrollBars = ScrollBars.Vertical;
        _txtQuotePreview.TabStop = false;

        _txtCompose.Multiline = true;
        _txtCompose.Dock = DockStyle.Fill;
        _txtCompose.ScrollBars = ScrollBars.Vertical;
        _txtCompose.Font = new Font("Segoe UI", 9.75F);
        _txtCompose.BorderStyle = BorderStyle.FixedSingle;

        _composeButtons.Dock = DockStyle.Bottom;
        _composeButtons.Height = 34;
        _composeButtons.FlowDirection = FlowDirection.RightToLeft;
        _composeButtons.WrapContents = false;
        _composeButtons.Padding = new Padding(0, 6, 0, 0);

        ConfigureComposeButton(_btnPost, Localization.Get(K.CommentsPost));
        ConfigureComposeButton(_btnAttachFile, Localization.Get(K.CommentsAttachFile));
        ConfigureComposeButton(_btnAttachImage, Localization.Get(K.CommentsAttachImage));

        _composeButtons.Controls.Add(_btnPost);
        _composeButtons.Controls.Add(_btnAttachFile);
        _composeButtons.Controls.Add(_btnAttachImage);

        var composeHost = new Panel { Dock = DockStyle.Fill, Height = 90 };
        composeHost.Controls.Add(_txtCompose);
        composeHost.Controls.Add(_composeButtons);

        _pnlCompose.Controls.Add(composeHost);
        _pnlCompose.Controls.Add(_txtQuotePreview);

        Controls.Add(_webView);
        Controls.Add(_pnlCompose);
        Controls.Add(_pnlHeader);

        _btnPost.Click += async (_, _) => await PostCommentAsync();
        _btnAttachImage.Click += async (_, _) => await AttachImageAsync();
        _btnAttachFile.Click += async (_, _) => await AttachFileAsync();
        _webView.CoreWebView2InitializationCompleted += OnWebViewInitializationCompleted;

        ApplyLocalization();
        ApplyTheme();
        SetComposeEnabled(false);
        _ = InitializeWebViewAsync();
    }

    public event EventHandler? CommentsChanged;
    public event EventHandler? CloseRequested;

    public async Task LoadPageAsync(int? pageId)
    {
        _pageId = pageId;
        _txtCompose.Clear();
        ClearQuotePreview();
        SetComposeEnabled(pageId.HasValue && SessionContext.IsLoggedIn);

        if (!pageId.HasValue || !_webViewReady)
        {
            if (_webViewReady)
                await RenderCommentsAsync([]);
            return;
        }

        await RefreshAsync();
    }

    public async Task RefreshAsync()
    {
        if (!_pageId.HasValue || !SessionContext.IsLoggedIn)
        {
            await RenderCommentsAsync([]);
            return;
        }

        try
        {
            var comments = AppConfig.Services.PageComments.GetComments(SessionContext.CurrentUser, _pageId.Value);
            await RenderCommentsAsync(comments);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(FindForm(), Localization.Get(K.CommentsTitle), ex);
        }
    }

    public void ApplyLocalization()
    {
        _lblHeader.Text = Localization.Get(K.CommentsTitle);
        _toolTip.SetToolTip(_btnClose, Localization.Get(K.ButtonClose));
        _btnPost.Text = Localization.Get(K.CommentsPost);
        _btnAttachFile.Text = Localization.Get(K.CommentsAttachFile);
        _btnAttachImage.Text = Localization.Get(K.CommentsAttachImage);
        _txtCompose.PlaceholderText = Localization.Get(K.CommentsComposePlaceholder);
    }

    public void BeginComposeWithQuote(string quotedText)
    {
        if (string.IsNullOrWhiteSpace(quotedText))
            return;

        _pendingQuotedText = quotedText.Trim();
        if (_pendingQuotedText.Length > 2000)
            _pendingQuotedText = _pendingQuotedText[..2000];

        _txtQuotePreview.Text = _pendingQuotedText;
        _txtQuotePreview.Visible = true;
        _pnlCompose.Height = ComposeBaseHeight + QuotePreviewHeight;
        _txtCompose.Clear();
        _txtCompose.Focus();
    }

    public void FocusCompose()
    {
        if (_txtCompose.CanFocus)
            _txtCompose.Focus();
    }

    public void ApplyTheme()
    {
        BackColor = AppTheme.Sidebar;
        _pnlHeader.BackColor = AppTheme.Sidebar;
        _lblHeader.ForeColor = AppTheme.TextPrimary;
        _lblHeader.BackColor = AppTheme.Sidebar;
        _btnClose.BackColor = AppTheme.Sidebar;
        _btnClose.ForeColor = AppTheme.TextSecondary;
        _btnClose.FlatAppearance.MouseOverBackColor = AppTheme.ChromeButtonHoverBackground;
        _btnClose.FlatAppearance.MouseDownBackColor = AppTheme.ChromeButtonPressedBackground;
        AppTheme.StyleToolTip(_toolTip);
        _pnlCompose.BackColor = AppTheme.Sidebar;
        _txtQuotePreview.BackColor = AppTheme.EditorCodeBackground;
        _txtQuotePreview.ForeColor = AppTheme.TextSecondary;
        _txtCompose.BackColor = AppTheme.EditorBackground;
        _txtCompose.ForeColor = AppTheme.EditorText;
        _webView.DefaultBackgroundColor = AppTheme.Sidebar;
        _ = RefreshAsync();
    }

    private static void ConfigureComposeButton(Button button, string text)
    {
        button.AutoSize = true;
        button.Margin = new Padding(6, 0, 0, 0);
        button.Padding = new Padding(10, 4, 10, 4);
        button.Text = text;
        AppTheme.StyleSecondaryButton(button);
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            var environment = await WebView2EnvironmentProvider.GetSharedEnvironmentAsync().ConfigureAwait(true);
            await _webView.EnsureCoreWebView2Async(environment).ConfigureAwait(true);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(FindForm(), Localization.Get(K.CommentsTitle), ex);
        }
    }

    private void OnWebViewInitializationCompleted(object? sender, CoreWebView2InitializationCompletedEventArgs e)
    {
        if (!e.IsSuccess || _webView.CoreWebView2 == null)
            return;

        _webViewReady = true;
        PageAssetStore.ConfigureEditorWebView(_webView.CoreWebView2);
        var settings = _webView.CoreWebView2.Settings;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsWebMessageEnabled = true;
        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        _webView.CoreWebView2.NavigationStarting += (_, args) =>
        {
            if (args.IsUserInitiated)
                args.Cancel = true;
        };

        _ = RefreshAsync();
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        var message = args.TryGetWebMessageAsString();
        if (string.IsNullOrWhiteSpace(message))
            return;

        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeElement))
                return;

            var type = typeElement.GetString();
            if (string.Equals(type, "delete-comment", StringComparison.Ordinal))
            {
                if (!root.TryGetProperty("id", out var idElement))
                    return;

                BeginInvoke(async () => await DeleteCommentAsync(idElement.GetInt32()));
                return;
            }

            if (string.Equals(type, "open", StringComparison.Ordinal) &&
                root.TryGetProperty("href", out var hrefElement))
            {
                var href = hrefElement.GetString();
                if (!string.IsNullOrWhiteSpace(href))
                    BeginInvoke(() => TryOpenResource(href));
            }
        }
        catch (JsonException)
        {
            // Ignore malformed messages.
        }
    }

    private static void TryOpenResource(string href)
    {
        try
        {
            if (EditorResourceOpener.TryOpen(href))
                return;

            MessageBox.Show(
                Localization.Get(K.OpenResourceFailed),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(null, Localization.Get(K.OpenResourceFailed), ex);
        }
    }

    private async Task RenderCommentsAsync(IReadOnlyList<PageCommentListItem> comments)
    {
        if (!_webViewReady || _webView.CoreWebView2 == null)
            return;

        var pageId = _pageId ?? 0;
        var html = CommentHtmlBuilder.BuildCommentsDocument(comments, pageId, _pipeline);
        _webView.CoreWebView2.NavigateToString(html);
        await Task.CompletedTask;
    }

    private async Task PostCommentAsync()
    {
        if (!_pageId.HasValue || !SessionContext.IsLoggedIn)
            return;

        var content = _txtCompose.Text.Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            MessageBox.Show(
                Localization.Get(K.CommentsEmptyBody),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            AppConfig.Services.PageComments.AddComment(
                SessionContext.CurrentUser,
                _pageId.Value,
                content,
                _pendingQuotedText);
            PageCommentAssetSync.SyncForPage(_pageId.Value);
            _txtCompose.Clear();
            ClearQuotePreview();
            await RefreshAsync();
            CommentsChanged?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(FindForm(), Localization.Get(K.CommentsPost), ex);
        }
    }

    private async Task DeleteCommentAsync(int commentId)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (MessageBox.Show(
                Localization.Get(K.CommentsConfirmDelete),
                Localization.Get(K.Confirm),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
        {
            return;
        }

        try
        {
            AppConfig.Services.PageComments.DeleteComment(SessionContext.CurrentUser, commentId);
            if (_pageId.HasValue)
                PageCommentAssetSync.SyncForPage(_pageId.Value);
            await RefreshAsync();
            CommentsChanged?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(FindForm(), Localization.Get(K.CommentsDelete), ex);
        }
    }

    private async Task AttachImageAsync()
    {
        if (!EnsurePageSelected())
            return;

        using var dialog = new OpenFileDialog
        {
            Title = Localization.Get(K.DialogImageFilePrompt),
            Filter = PageAssetStore.BuildOpenFileFilter(),
            Multiselect = false
        };

        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
            return;

        await InsertAttachmentMarkdownAsync(dialog.FileName, isImage: true);
    }

    private async Task AttachFileAsync()
    {
        if (!EnsurePageSelected())
            return;

        using var dialog = new OpenFileDialog
        {
            Title = Localization.Get(K.DialogAttachFilePrompt),
            Filter = PageAssetStore.BuildOpenAttachmentFilter(),
            Multiselect = false
        };

        if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
            return;

        await InsertAttachmentMarkdownAsync(dialog.FileName, isImage: false);
    }

    private async Task InsertAttachmentMarkdownAsync(string sourcePath, bool isImage)
    {
        if (!_pageId.HasValue)
            return;

        try
        {
            var pageId = _pageId.Value;
            string assetUri;
            string markdownSnippet;

            if (isImage)
            {
                var fileName = PageAssetStore.ImportImage(pageId, sourcePath);
                assetUri = PageAssetStore.BuildAssetUri(pageId, fileName);
                var alt = Path.GetFileNameWithoutExtension(sourcePath);
                markdownSnippet = $"![{alt}]({assetUri})";
            }
            else
            {
                var fileName = PageAssetStore.ImportFile(pageId, sourcePath);
                assetUri = PageAssetStore.BuildAssetUri(pageId, fileName);
                var displayName = Path.GetFileName(sourcePath);
                markdownSnippet = $"[{displayName}]({assetUri})";
            }

            InsertAtCaret(markdownSnippet);
            PageCommentAssetSync.SyncForPage(pageId);
            await Task.CompletedTask;
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(FindForm(), Localization.Get(K.CommentsTitle), ex);
        }
    }

    private void InsertAtCaret(string text)
    {
        var selectionStart = _txtCompose.SelectionStart;
        var selectionLength = _txtCompose.SelectionLength;
        _txtCompose.Text = _txtCompose.Text.Remove(selectionStart, selectionLength).Insert(selectionStart, text);
        _txtCompose.SelectionStart = selectionStart + text.Length;
        _txtCompose.Focus();
    }

    private bool EnsurePageSelected()
    {
        if (_pageId.HasValue)
            return true;

        MessageBox.Show(
            Localization.Get(K.CommentsRequiresPage),
            L.AppName,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
        return false;
    }

    private void SetComposeEnabled(bool enabled)
    {
        _txtCompose.Enabled = enabled;
        _btnPost.Enabled = enabled;
        _btnAttachImage.Enabled = enabled;
        _btnAttachFile.Enabled = enabled;
    }

    private void ClearQuotePreview()
    {
        _pendingQuotedText = null;
        _txtQuotePreview.Clear();
        _txtQuotePreview.Visible = false;
        _pnlCompose.Height = ComposeBaseHeight;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _toolTip.Dispose();
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }
}

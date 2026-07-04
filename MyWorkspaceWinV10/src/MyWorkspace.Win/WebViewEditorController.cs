using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;
using Markdig;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using ReverseMarkdown;

namespace MyWorkspace.Win;

internal sealed class WebViewEditorController
{
    private static readonly Converter MarkdownConverter = CreateConverter();

    private readonly WebView2 _webView;
    private readonly SemaphoreSlim _scriptGate = new(1, 1);
    private bool _isReady;
    private int _scriptSuspendDepth;
    private bool _fileDropHooksInstalled;
    private Func<string[], Point, Task>? _fileDropHandler;
    private Func<bool>? _canAcceptFileDrop;
    private Func<string, string?>? _pasteHtmlCloneHandler;
    private DateTime _lastDragCaretUpdateUtc = DateTime.MinValue;
    private DateTime _lastFileDropUtc = DateTime.MinValue;
    private string _lastFileDropKey = string.Empty;
    private int _hostFileDragDepth;
    private System.Windows.Forms.Timer? _fileDragLeaveTimer;

    public WebViewEditorController(WebView2 webView) => _webView = webView;

    public void ConfigureFileDrop(Func<string[], Point, Task> handler, Func<bool>? canAccept = null, Control? hostDropSurface = null)
    {
        _fileDropHandler = handler;
        _canAcceptFileDrop = canAccept;
        EnsureHostFileDropHooks();
        EnsureHostDropSurfaceHooks(hostDropSurface);
    }

    public void ConfigurePasteHtmlClone(Func<string, string?> cloneHtml) =>
        _pasteHtmlCloneHandler = cloneHtml;

    private Control? _hostDropSurface;
    private EditorDropTargetPanel? _dropTargetOverlay;
    private bool _hostDropSurfaceHooksInstalled;

    private void EnsureHostDropSurfaceHooks(Control? hostDropSurface)
    {
        if (hostDropSurface == null || _hostDropSurfaceHooksInstalled)
            return;

        _hostDropSurface = hostDropSurface;
        _hostDropSurfaceHooksInstalled = true;
        _hostDropSurface.AllowDrop = true;
        _hostDropSurface.DragEnter += OnHostDropSurfaceDragEnter;
        _hostDropSurface.DragOver += OnHostDropSurfaceDragOver;
        _hostDropSurface.DragLeave += OnHostDropSurfaceDragLeave;
        _hostDropSurface.DragDrop += OnHostDropSurfaceDragDrop;

        _dropTargetOverlay = new EditorDropTargetPanel
        {
            Dock = DockStyle.Fill
        };
        _hostDropSurface.Controls.Add(_dropTargetOverlay);
        _dropTargetOverlay.FileDragEnter += OnDropOverlayDragEnter;
        _dropTargetOverlay.FileDragOver += OnDropOverlayDragOver;
        _dropTargetOverlay.FileDragLeave += OnDropOverlayDragLeave;
        _dropTargetOverlay.FileDragDrop += OnDropOverlayDragDrop;
    }

    private bool IsPointerOverHostDropSurface()
    {
        if (_hostDropSurface == null || _hostDropSurface.IsDisposed)
            return false;

        var clientPoint = _hostDropSurface.PointToClient(Control.MousePosition);
        return _hostDropSurface.ClientRectangle.Contains(clientPoint);
    }

    private Point ToWebViewPointFromDropSurface(DragEventArgs e, Control dropSurface)
    {
        var surfacePoint = new Point(e.X, e.Y);
        var screenPoint = dropSurface.PointToScreen(surfacePoint);
        return _webView.PointToClient(screenPoint);
    }

    private bool TryAcceptHostDropSurfaceDrag(DragEventArgs e, out DragDropEffects effect)
    {
        effect = DragDropEffects.None;
        if (!CanAcceptHostFileDrop() || !IsFileDrag(e))
            return false;

        effect = DragDropEffects.Copy;
        return true;
    }

    private Point ToWebViewPointFromDropSurface(DragEventArgs e) =>
        ToWebViewPointFromDropSurface(
            e,
            _dropTargetOverlay is { Visible: true } ? _dropTargetOverlay : _hostDropSurface!);

    private void ShowDropTargetOverlay()
    {
        if (_dropTargetOverlay == null || _dropTargetOverlay.IsDisposed)
            return;

        if (!_dropTargetOverlay.Visible)
            _dropTargetOverlay.Visible = true;

        _dropTargetOverlay.BringToFront();
    }

    private void HideDropTargetOverlay()
    {
        if (_dropTargetOverlay == null || _dropTargetOverlay.IsDisposed)
            return;

        _dropTargetOverlay.Visible = false;
        if (_webView.Visible && !_webView.IsDisposed)
            _webView.BringToFront();
    }

    private void BeginFileDragFeedback(DragEventArgs e)
    {
        CancelFileDragLeaveTimer();
        _hostFileDragDepth++;
        ShowDropTargetOverlay();
        e.Effect = DragDropEffects.Copy;
        _ = SetFileDropHighlightAsync(true);
    }

    private void UpdateFileDragFeedback(DragEventArgs e, Control dropSurface)
    {
        e.Effect = DragDropEffects.Copy;

        var now = DateTime.UtcNow;
        if ((now - _lastDragCaretUpdateUtc).TotalMilliseconds < 50)
            return;

        _lastDragCaretUpdateUtc = now;
        _ = FocusCaretAtPointAsync(ToWebViewPointFromDropSurface(e, dropSurface));
    }

    private void EndFileDragFeedback(bool hideCaret = true)
    {
        CancelFileDragLeaveTimer();
        HideDropTargetOverlay();
        if (hideCaret)
        {
            _hostFileDragDepth = 0;
            _ = RunDragFeedbackScriptAsync("window.editorApi.cancelFileDropFeedback();");
        }
        else
        {
            _ = SetFileDropHighlightAsync(false, hideCaret: false);
        }
    }

    private void CancelFileDragLeaveTimer() => _fileDragLeaveTimer?.Stop();

    private void ScheduleFileDragLeaveEnd()
    {
        _fileDragLeaveTimer ??= new System.Windows.Forms.Timer { Interval = 150 };
        _fileDragLeaveTimer.Stop();
        _fileDragLeaveTimer.Tick -= OnFileDragLeaveTimerTick;
        _fileDragLeaveTimer.Tick += OnFileDragLeaveTimerTick;
        _fileDragLeaveTimer.Start();
    }

    private void OnFileDragLeaveTimerTick(object? sender, EventArgs e)
    {
        CancelFileDragLeaveTimer();
        if (IsPointerOverHostDropSurface())
            return;

        _hostFileDragDepth = 0;
        EndFileDragFeedback();
    }

    private void DecrementHostFileDragDepth() => ScheduleFileDragLeaveEnd();

    private static bool TryExtractFileDropPaths(DragEventArgs e, out string[] paths)
    {
        paths = Array.Empty<string>();
        if (e.Data?.GetDataPresent(DataFormats.FileDrop, autoConvert: true) != true)
            return false;

        return e.Data.GetData(DataFormats.FileDrop, autoConvert: true) switch
        {
            string[] files when files.Length > 0 => Set(out paths, files),
            string file when !string.IsNullOrWhiteSpace(file) => Set(out paths, [file]),
            _ => false
        };

        static bool Set(out string[] target, string[] value)
        {
            target = value;
            return true;
        }
    }

    private void HandleHostFileDrop(DragEventArgs e, Point webViewClientPoint)
    {
        CancelFileDragLeaveTimer();
        e.Effect = DragDropEffects.Copy;

        if (!TryExtractFileDropPaths(e, out var paths) || !CanAcceptHostFileDrop())
        {
            _hostFileDragDepth = 0;
            EndFileDragFeedback();
            return;
        }

        _hostFileDragDepth = 0;
        _ = CompleteHostFileDropAsync(paths, webViewClientPoint);
    }

    private async Task CompleteHostFileDropAsync(string[] paths, Point webViewClientPoint)
    {
        try
        {
            var cssPoint = ToWebViewCssPoint(webViewClientPoint);
            await CommitFileDropCaretAtPointAsync(cssPoint).ConfigureAwait(true);
            await InvokeFileDropHandlerAsync(paths, webViewClientPoint).ConfigureAwait(true);
        }
        finally
        {
            void Finish() => EndFileDragFeedback();

            if (_webView.InvokeRequired)
                _webView.BeginInvoke(Finish);
            else
                Finish();
        }
    }

    private void OnHostDropSurfaceDragEnter(object? sender, DragEventArgs e)
    {
        if (!TryAcceptHostDropSurfaceDrag(e, out _))
            return;

        BeginFileDragFeedback(e);
    }

    private void OnHostDropSurfaceDragOver(object? sender, DragEventArgs e)
    {
        if (!TryAcceptHostDropSurfaceDrag(e, out _))
            return;

        UpdateFileDragFeedback(e, _hostDropSurface!);
    }

    private void OnHostDropSurfaceDragLeave(object? sender, EventArgs e) =>
        DecrementHostFileDragDepth();

    private void OnHostDropSurfaceDragDrop(object? sender, DragEventArgs e) =>
        HandleHostFileDrop(e, ToWebViewPointFromDropSurface(e));

    private void OnDropOverlayDragEnter(object? sender, DragEventArgs e)
    {
        if (!TryAcceptHostDropSurfaceDrag(e, out _))
            return;

        BeginFileDragFeedback(e);
    }

    private void OnDropOverlayDragOver(object? sender, DragEventArgs e)
    {
        if (!TryAcceptHostDropSurfaceDrag(e, out _))
            return;

        UpdateFileDragFeedback(e, _dropTargetOverlay!);
    }

    private void OnDropOverlayDragLeave(object? sender, EventArgs e) =>
        DecrementHostFileDragDepth();

    private void OnDropOverlayDragDrop(object? sender, DragEventArgs e) =>
        HandleHostFileDrop(e, ToWebViewPointFromDropSurface(e, _dropTargetOverlay!));

    public event Action? ContentChanged;
    public event Action? CaretMoved;
    public event Action<Point>? ContextMenuRequested;
    public event Action<string>? OpenRequested;

    public bool IsReady => _isReady && _webView.CoreWebView2 != null;
    public bool IsScriptSuspended => _scriptSuspendDepth > 0;

    public void SuspendScripts() => Interlocked.Increment(ref _scriptSuspendDepth);

    public void ResumeScripts()
    {
        if (_scriptSuspendDepth > 0)
            Interlocked.Decrement(ref _scriptSuspendDepth);
    }

    public void ResetScriptSuspension() =>
        Interlocked.Exchange(ref _scriptSuspendDepth, 0);

    public void ApplyWebViewChrome()
    {
        _webView.DefaultBackgroundColor = AppTheme.EditorBackground;
        if (_webView.CoreWebView2 != null)
        {
            _webView.CoreWebView2.Profile.PreferredColorScheme = AppTheme.IsDark
                ? CoreWebView2PreferredColorScheme.Dark
                : CoreWebView2PreferredColorScheme.Light;
        }
    }

    public async Task ApplyThemeChromeAsync()
    {
        if (!IsReady || IsScriptSuspended)
            return;

        await ExecuteScriptExclusiveAsync(BuildThemeChromeScript());
    }

    public async Task SetEditingEnabledAsync(bool enabled)
    {
        if (!IsReady || IsScriptSuspended)
            return;

        var value = enabled ? "true" : "false";
        await ExecuteScriptExclusiveAsync(
            "(function(){var editor=document.getElementById('editor');if(editor){editor.contentEditable=" + value + ";}})();");
    }

    public async Task InitializeAsync(MarkdownPipeline pipeline)
    {
        var environment = await WebView2EnvironmentProvider.GetSharedEnvironmentAsync().ConfigureAwait(true);
        await _webView.EnsureCoreWebView2Async(environment).ConfigureAwait(true);
        PageAssetStore.ConfigureEditorWebView(_webView.CoreWebView2!);
        ApplyWebViewChrome();

        var settings = _webView.CoreWebView2.Settings;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsWebMessageEnabled = true;

        _webView.AllowExternalDrop = true;

        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        _webView.CoreWebView2.ContextMenuRequested += OnContextMenuRequested;
        _webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
        _webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
        EnsureHostFileDropHooks();
        await LoadMarkdownAsync(string.Empty, pipeline);
    }

    private Point ToWebViewCssPoint(Point webViewClientPoint)
    {
        var zoom = _webView.ZoomFactor;
        return new Point(
            (int)Math.Round(webViewClientPoint.X / zoom, MidpointRounding.AwayFromZero),
            (int)Math.Round(webViewClientPoint.Y / zoom, MidpointRounding.AwayFromZero));
    }

    public Task FocusCaretAtPointAsync(Point webViewClientPoint)
    {
        if (!IsReady || IsScriptSuspended)
            return Task.CompletedTask;

        var css = ToWebViewCssPoint(webViewClientPoint);
        return RunDragFeedbackScriptAsync($"window.editorApi.showFileDropCaretAtPoint({css.X},{css.Y});");
    }

    public async Task CommitFileDropCaretAtPointAsync(Point cssPoint)
    {
        if (!IsReady || IsScriptSuspended)
            return;

        await ExecuteScriptExclusiveAsync(
            $"window.editorApi.commitFileDropCaretAtPoint({cssPoint.X},{cssPoint.Y});");
    }

    public Task SetFileDropHighlightAsync(bool active, bool hideCaret = true) =>
        RunDragFeedbackScriptAsync(
            $"window.editorApi.setFileDropHighlight({(active ? "true" : "false")},{(hideCaret ? "true" : "false")});");

    private void EnsureHostFileDropHooks()
    {
        if (_fileDropHooksInstalled || _fileDropHandler == null)
            return;

        _fileDropHooksInstalled = true;
        _webView.AllowExternalDrop = true;
    }

    private bool CanAcceptHostFileDrop() =>
        _fileDropHandler != null &&
        _isReady &&
        _scriptSuspendDepth == 0 &&
        (_canAcceptFileDrop?.Invoke() ?? true);

    private static bool IsFileDrag(DragEventArgs e) =>
        e.Data?.GetDataPresent(DataFormats.FileDrop) == true;

    private Task InvokeFileDropHandlerFromCssPointAsync(string[] paths, Point cssPoint) =>
        InvokeFileDropHandlerCoreAsync(paths, cssPoint);

    private async Task InvokeFileDropHandlerAsync(string[] paths, Point webViewClientPoint)
    {
        if (_fileDropHandler == null || paths.Length == 0)
            return;

        await InvokeFileDropHandlerCoreAsync(paths, ToWebViewCssPoint(webViewClientPoint)).ConfigureAwait(true);
    }

    private async Task InvokeFileDropHandlerCoreAsync(string[] paths, Point cssPoint)
    {
        if (_fileDropHandler == null || paths.Length == 0)
            return;

        var key = string.Join("|", paths.OrderBy(static p => p, StringComparer.OrdinalIgnoreCase));
        var now = DateTime.UtcNow;
        if (string.Equals(key, _lastFileDropKey, StringComparison.Ordinal) &&
            (now - _lastFileDropUtc).TotalMilliseconds < 750)
        {
            return;
        }

        _lastFileDropKey = key;
        _lastFileDropUtc = now;

        try
        {
            await _fileDropHandler(paths, cssPoint).ConfigureAwait(true);
        }
        catch
        {
            // MainForm shows user-facing errors.
        }
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _isReady = e.IsSuccess;
        if (!e.IsSuccess)
            return;

        ApplyWebViewChrome();
        _ = ApplyThemeChromeAsync();
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (e.IsUserInitiated)
            e.Cancel = true;
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        var message = args.TryGetWebMessageAsString();
        void Handle()
        {
            if (message == "changed")
                ContentChanged?.Invoke();
            else if (message == "caret")
                CaretMoved?.Invoke();
            else if (TryHandleFileDropMessage(args, message))
                return;
            else if (TryHandleClonePastedHtmlMessage(message))
                return;
            else
                TryHandleOpenMessage(message);
        }

        if (_webView.InvokeRequired)
            _webView.BeginInvoke(Handle);
        else
            Handle();
    }

    private bool TryHandleFileDropMessage(CoreWebView2WebMessageReceivedEventArgs args, string? message)
    {
        if (string.IsNullOrWhiteSpace(message) || !CanAcceptHostFileDrop())
            return false;

        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeElement) ||
                !string.Equals(typeElement.GetString(), "file-drop", StringComparison.Ordinal))
            {
                return false;
            }

            var x = root.TryGetProperty("x", out var xElement) ? xElement.GetInt32() : 0;
            var y = root.TryGetProperty("y", out var yElement) ? yElement.GetInt32() : 0;
            var cssPoint = new Point(x, y);

            var paths = new List<string>();
            foreach (var obj in args.AdditionalObjects)
            {
                switch (obj)
                {
                    case CoreWebView2File file when !string.IsNullOrWhiteSpace(file.Path):
                        paths.Add(file.Path);
                        break;
                    case FileInfo fileInfo when !string.IsNullOrWhiteSpace(fileInfo.FullName):
                        paths.Add(fileInfo.FullName);
                        break;
                }
            }

            if (paths.Count > 0)
            {
                _ = InvokeFileDropHandlerFromCssPointAsync(paths.ToArray(), cssPoint);
                return true;
            }

            if (root.TryGetProperty("dataUri", out var dataUriElement) &&
                TryParseDataUriImage(dataUriElement.GetString(), out var imageBytes, out var extension))
            {
                var fileName = root.TryGetProperty("fileName", out var fileNameElement)
                    ? fileNameElement.GetString()
                    : null;
                _ = InvokeImageDataDropHandlerAsync(imageBytes, extension, fileName, cssPoint);
                return true;
            }

            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private bool TryHandleClonePastedHtmlMessage(string? message)
    {
        if (string.IsNullOrWhiteSpace(message) || _pasteHtmlCloneHandler == null)
            return false;

        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeElement) ||
                !string.Equals(typeElement.GetString(), "clone-pasted-html", StringComparison.Ordinal))
            {
                return false;
            }

            var html = root.TryGetProperty("html", out var htmlElement)
                ? htmlElement.GetString()
                : null;
            if (string.IsNullOrWhiteSpace(html))
                return true;

            _ = InvokePasteHtmlCloneAsync(html);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private async Task InvokePasteHtmlCloneAsync(string html)
    {
        if (_pasteHtmlCloneHandler == null)
            return;

        try
        {
            var rewritten = _pasteHtmlCloneHandler(html) ?? html;
            await RunApiAsync($"window.editorApi.insertHtml('{EscapeJs(rewritten)}');").ConfigureAwait(true);
            await RunApiAsync("window.editorApi.finalizeImageSizes();").ConfigureAwait(true);
        }
        catch
        {
            // MainForm clone handler should not throw; ignore unexpected failures.
        }
    }

    private Func<byte[], string, string?, Point, Task>? _imageDataDropHandler;

    public void ConfigureImageDataDrop(Func<byte[], string, string?, Point, Task> handler) =>
        _imageDataDropHandler = handler;

    private async Task InvokeImageDataDropHandlerAsync(
        byte[] imageBytes,
        string extension,
        string? fileName,
        Point cssPoint)
    {
        if (_imageDataDropHandler == null || imageBytes.Length == 0)
            return;

        try
        {
            await _imageDataDropHandler(imageBytes, extension, fileName, cssPoint).ConfigureAwait(true);
        }
        catch
        {
            // MainForm shows user-facing errors.
        }
    }

    private static bool TryParseDataUriImage(string? dataUri, out byte[] bytes, out string extension)
    {
        bytes = Array.Empty<byte>();
        extension = ".png";

        if (string.IsNullOrWhiteSpace(dataUri) ||
            !dataUri.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var commaIndex = dataUri.IndexOf(',');
        if (commaIndex <= 0)
            return false;

        var metadata = dataUri[..commaIndex];
        var payload = dataUri[(commaIndex + 1)..];
        if (string.IsNullOrWhiteSpace(payload))
            return false;

        extension = metadata.Contains("image/jpeg", StringComparison.OrdinalIgnoreCase) ? ".jpg"
            : metadata.Contains("image/gif", StringComparison.OrdinalIgnoreCase) ? ".gif"
            : metadata.Contains("image/webp", StringComparison.OrdinalIgnoreCase) ? ".webp"
            : metadata.Contains("image/avif", StringComparison.OrdinalIgnoreCase) ? ".avif"
            : metadata.Contains("image/svg+xml", StringComparison.OrdinalIgnoreCase) ? ".svg"
            : ".png";

        try
        {
            if (!metadata.Contains(";base64", StringComparison.OrdinalIgnoreCase))
                return false;

            bytes = Convert.FromBase64String(payload);
            return bytes.Length > 0;
        }
        catch (FormatException)
        {
            bytes = Array.Empty<byte>();
            return false;
        }
    }

    private void TryHandleOpenMessage(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return;

        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeElement))
                return;

            if (!string.Equals(typeElement.GetString(), "open", StringComparison.Ordinal))
                return;

            if (!root.TryGetProperty("href", out var hrefElement))
                return;

            var href = hrefElement.GetString();
            if (string.IsNullOrWhiteSpace(href))
                return;

            OpenRequested?.Invoke(href);
        }
        catch (JsonException)
        {
            // Ignore non-JSON editor messages.
        }
    }

    private void OnContextMenuRequested(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2ContextMenuRequestedEventArgs args)
    {
        args.Handled = true;

        var location = args.Location;
        void ShowMenu()
        {
            ContextMenuRequested?.Invoke(new Point(location.X, location.Y));
        }

        if (_webView.InvokeRequired)
            _webView.BeginInvoke(ShowMenu);
        else
            ShowMenu();
    }

    public async Task LoadMarkdownAsync(string markdown, MarkdownPipeline pipeline, int? pageId = null)
    {
        if (_webView.CoreWebView2 == null)
            return;

        ApplyWebViewChrome();
        _isReady = false;
        var normalized = pageId.HasValue
            ? PageMarkdownNormalizer.ExpandAssetReferences(markdown, pageId.Value)
            : markdown;
        var html = EditorHtmlBuilder.BuildEditablePage(normalized, pipeline);
        _webView.NavigateToString(html);
        await WaitForReadyAsync();
        await ApplyThemeChromeAsync();
        await RunApiAsync("window.editorApi.finalizeImageSizes();");
    }

    public Task ClearAsync(MarkdownPipeline pipeline, int? pageId = null) =>
        LoadMarkdownAsync(string.Empty, pipeline, pageId);

    public async Task<string> GetMarkdownAsync(int? pageId = null)
    {
        if (IsScriptSuspended)
            return string.Empty;

        var html = await GetHtmlAsync();
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;

        if (pageId.HasValue)
            html = PageMarkdownNormalizer.PrepareHtmlForMarkdown(html, pageId.Value);

        IReadOnlyList<string> preservedSizedImages = Array.Empty<string>();
        if (pageId.HasValue)
        {
            (html, preservedSizedImages) = PageMarkdownNormalizer.ExtractSizedImages(html);
        }

        var normalized = NormalizeHtml(html);
        var markdown = MarkdownConverter.Convert(normalized).Trim();

        if (pageId.HasValue)
        {
            markdown = PageMarkdownNormalizer.RestoreSizedImages(markdown, preservedSizedImages);
            markdown = PageMarkdownNormalizer.PersistSizedImagesInMarkdown(markdown, pageId.Value);
            markdown = PageMarkdownNormalizer.CollapseEditorImages(markdown, pageId.Value);
            return PageMarkdownNormalizer.CollapseEditorFileLinks(markdown, pageId.Value);
        }

        return markdown;
    }

    public Task ApplyHeadingAsync(int level) =>
        RunApiAsync($"window.editorApi.applyHeading({level});");

    public Task ApplyFormatAsync(string command) =>
        RunApiAsync($"window.editorApi.applyFormat('{EscapeJs(command)}');");

    public Task CutAsync() => ApplyFormatAsync("cut");
    public Task CopyAsync() => ApplyFormatAsync("copy");
    public Task PasteAsync() => ApplyFormatAsync("paste");
    public Task SelectAllAsync() => ApplyFormatAsync("selectAll");
    public Task UndoAsync() => RunApiAsync("window.editorApi.undo();");
    public Task RedoAsync() => RunApiAsync("window.editorApi.redo();");

    public Task ApplyBlockquoteAsync() =>
        RunApiAsync("window.editorApi.applyBlockquote();");

    public Task WrapInlineCodeAsync() =>
        RunApiAsync("window.editorApi.wrapInlineCode();");

    public Task InsertHtmlAsync(string html) =>
        RunApiAsync($"window.editorApi.insertHtml('{EscapeJs(html)}');");

    public Task SaveInsertMarkerAsync() =>
        RunApiAsync("window.editorApi.saveInsertMarker();");

    public Task ClearInsertMarkerAsync() =>
        RunApiAsync("window.editorApi.clearInsertMarker();");

    public Task InsertImageAsync(string src, string alt) =>
        RunApiAsync($"window.editorApi.insertImage('{EscapeJs(src)}','{EscapeJs(alt)}');");

    public Task InsertImageAtDropPointAsync(Point cssPoint, string src, string alt) =>
        RunApiAsync(
            $"window.editorApi.insertImageAtDropPoint({cssPoint.X},{cssPoint.Y},'{EscapeJs(src)}','{EscapeJs(alt)}');");

    public Task FinalizeImageSizesAsync() =>
        RunApiAsync("window.editorApi.finalizeImageSizes();");

    public Task InsertFileAttachmentAsync(string href, string fileName) =>
        RunApiAsync($"window.editorApi.insertFileAttachment('{EscapeJs(href)}','{EscapeJs(fileName)}');");

    public Task CreateLinkAsync(string text, string url) =>
        RunApiAsync($"window.editorApi.createLink('{EscapeJs(text)}','{EscapeJs(url)}');");

    public async Task<string> GetSelectedTextAsync()
    {
        if (!IsReady || IsScriptSuspended)
            return string.Empty;

        var result = await ExecuteScriptExclusiveAsync("window.editorApi.getSelectedText();");
        return DeserializeScriptResult(result) ?? string.Empty;
    }

    public async Task<EditorContextMenuContext> GetContextMenuContextAsync(Point webViewClientPoint)
    {
        if (!IsReady || IsScriptSuspended)
            return EditorContextMenuContext.ForEditor();

        var css = ToWebViewCssPoint(webViewClientPoint);
        var result = await ExecuteScriptExclusiveAsync(
            $"window.editorApi.getContextMenuContext({css.X},{css.Y});");
        return EditorContextMenuContext.Parse(DeserializeScriptResult(result));
    }

    public Task CutSelectedImageAsync() =>
        RunApiAsync("window.editorApi.cutSelectedImage();");

    public Task CopySelectedImageAsync() =>
        RunApiAsync("window.editorApi.copySelectedImage();");

    public Task DeleteSelectedImageAsync() =>
        RunApiAsync("window.editorApi.deleteSelectedImage();");

    public Task DeleteSelectedFileAttachmentAsync() =>
        RunApiAsync("window.editorApi.deleteSelectedFileAttachment();");

    public Task ReplaceSelectedImageAsync(string src, string alt) =>
        RunApiAsync($"window.editorApi.replaceSelectedImage('{EscapeJs(src)}','{EscapeJs(alt)}');");

    public Task FocusAsync() =>
        RunApiAsync("window.editorApi.focus();");

    public Task SetFirstHeadingTitleAsync(string title) =>
        RunApiAsync($"window.editorApi.setFirstHeadingTitle('{EscapeJs(title)}');");

    public async Task ScrollToHeadingAsync(string headingId)
    {
        if (!IsReady || string.IsNullOrWhiteSpace(headingId) || IsScriptSuspended)
            return;

        await ExecuteScriptExclusiveAsync(
            $"window.editorApi.scrollToHeading('{EscapeJs(headingId)}');");
    }

    public async Task<bool> ScrollToSearchTextAsync(string query, bool matchInContent)
    {
        if (!IsReady || string.IsNullOrWhiteSpace(query) || IsScriptSuspended)
            return false;

        await WaitForReadyAsync();
        var result = await ExecuteScriptExclusiveAsync(
            $"window.editorApi.scrollToSearchText('{EscapeJs(query)}',{(matchInContent ? "true" : "false")});");
        return string.Equals(DeserializeScriptResult(result), "true", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<IReadOnlyList<EditorHeading>> GetHeadingsAsync()
    {
        if (!IsReady || IsScriptSuspended)
            return [];

        var json = await ExecuteScriptExclusiveAsync("window.editorApi.getHeadings();");
        return ParseHeadings(json);
    }

    public async Task<string?> GetActiveHeadingIdAsync()
    {
        if (!IsReady || IsScriptSuspended)
            return null;

        var result = await ExecuteScriptExclusiveAsync("window.editorApi.getActiveHeadingId();");
        return DeserializeScriptResult(result);
    }

    private Task RunDragFeedbackScriptAsync(string script)
    {
        if (!IsReady || IsScriptSuspended || _webView.CoreWebView2 == null)
            return Task.CompletedTask;

        return _webView.CoreWebView2.ExecuteScriptAsync(script);
    }

    private async Task RunApiAsync(string script)
    {
        if (!IsReady || IsScriptSuspended)
            return;

        await ExecuteScriptExclusiveAsync(script);
    }

    private async Task<string> GetHtmlAsync()
    {
        if (!IsReady || IsScriptSuspended)
            return string.Empty;

        var result = await ExecuteScriptExclusiveAsync("window.editorApi.getHtml();");
        return DeserializeScriptResult(result) ?? string.Empty;
    }

    private async Task<string> ExecuteScriptExclusiveAsync(string script)
    {
        await _scriptGate.WaitAsync().ConfigureAwait(true);
        try
        {
            return await _webView.CoreWebView2!.ExecuteScriptAsync(script).ConfigureAwait(true);
        }
        finally
        {
            _scriptGate.Release();
        }
    }

    private static string NormalizeHtml(string html)
    {
        if (html.Contains("<br>", StringComparison.OrdinalIgnoreCase) &&
            !html.Contains("<p", StringComparison.OrdinalIgnoreCase) &&
            !html.Contains("<h", StringComparison.OrdinalIgnoreCase))
        {
            return $"<p>{html}</p>";
        }

        return html;
    }

    private async Task WaitForReadyAsync()
    {
        for (var i = 0; i < 50 && !_isReady; i++)
            await Task.Delay(50);
    }

    private static IReadOnlyList<EditorHeading> ParseHeadings(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "null")
            return [];

        try
        {
            var raw = DeserializeScriptResult(json);
            if (string.IsNullOrWhiteSpace(raw))
                return [];

            return JsonSerializer.Deserialize<List<EditorHeading>>(raw, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string? DeserializeScriptResult(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "null")
            return null;

        try
        {
            return JsonSerializer.Deserialize<string>(json);
        }
        catch
        {
            return json.Trim('"');
        }
    }

    private static string EscapeJs(string value) =>
        value.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\r", "").Replace("\n", "\\n");

    private static string BuildThemeChromeScript()
    {
        var chrome = EditorChromeOptions.CreateCurrent();
        var p = chrome.Palette;
        var fontSizePx = (15F * chrome.FontScaleFactor).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
        var themeJson = JsonSerializer.Serialize(new
        {
            bg = ToCss(p.Sidebar),
            text = ToCss(p.EditorText),
            caret = ToCss(p.EditorCaret),
            placeholder = ToCss(p.EditorPlaceholder),
            focus = ToCssAlpha(p.EditorFocusRing, 51),
            codeBg = ToCss(p.EditorCodeBackground),
            border = ToCss(p.Border),
            borderLight = ToCss(p.BorderLight),
            surface = ToCss(p.Surface),
            accent = ToCss(p.Accent),
            muted = ToCss(p.TextSecondary),
            selection = ToCssAlpha(p.Accent, 51),
            colorScheme = AppTheme.IsDark ? "dark" : "light",
            fontSizePx
        });
        return $"window.editorApi.applyThemeChrome({themeJson});";
    }

    private static string ToCss(Color color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    private static string ToCssAlpha(Color color, int alpha) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}{alpha:X2}";

    private static Converter CreateConverter()
    {
        var config = new Config
        {
            GithubFlavored = true,
            RemoveComments = true,
            UnknownTags = Config.UnknownTagsOption.Bypass,
            SmartHrefHandling = true
        };
        return new Converter(config);
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };
}

internal sealed class EditorHeading
{
    public int Level { get; set; }
    public string Text { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;
}

internal sealed class EditorContextMenuContext
{
    public string Target { get; init; } = "editor";
    public string? ImageSrc { get; init; }
    public string? ImageAlt { get; init; }
    public string? FileHref { get; init; }
    public string? FileLabel { get; init; }
    public string? LineQuote { get; init; }

    public bool IsImage => string.Equals(Target, "image", StringComparison.OrdinalIgnoreCase);
    public bool IsFile => string.Equals(Target, "file", StringComparison.OrdinalIgnoreCase);

    public static EditorContextMenuContext ForEditor() => new();

    public static EditorContextMenuContext Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return ForEditor();

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var target = root.TryGetProperty("target", out var targetElement)
                ? targetElement.GetString() ?? "editor"
                : "editor";

            if (string.Equals(target, "image", StringComparison.OrdinalIgnoreCase))
            {
                var src = root.TryGetProperty("src", out var srcElement) ? srcElement.GetString() : null;
                var alt = root.TryGetProperty("alt", out var altElement) ? altElement.GetString() : null;
                return new EditorContextMenuContext
                {
                    Target = "image",
                    ImageSrc = src,
                    ImageAlt = alt
                };
            }

            if (string.Equals(target, "file", StringComparison.OrdinalIgnoreCase))
            {
                var href = root.TryGetProperty("href", out var hrefElement) ? hrefElement.GetString() : null;
                var label = root.TryGetProperty("label", out var labelElement) ? labelElement.GetString() : null;
                return new EditorContextMenuContext
                {
                    Target = "file",
                    FileHref = href,
                    FileLabel = label
                };
            }

            var lineQuote = root.TryGetProperty("lineQuote", out var lineQuoteElement)
                ? lineQuoteElement.GetString()
                : null;
            return new EditorContextMenuContext
            {
                Target = "editor",
                LineQuote = lineQuote
            };
        }
        catch
        {
            return ForEditor();
        }
    }
}

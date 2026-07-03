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
    private DateTime _lastDragCaretUpdateUtc = DateTime.MinValue;
    private DateTime _lastFileDropUtc = DateTime.MinValue;
    private string _lastFileDropKey = string.Empty;

    public WebViewEditorController(WebView2 webView) => _webView = webView;

    public void ConfigureFileDrop(Func<string[], Point, Task> handler, Func<bool>? canAccept = null, Control? hostDropSurface = null)
    {
        _fileDropHandler = handler;
        _canAcceptFileDrop = canAccept;
        EnsureHostFileDropHooks();
        EnsureHostDropSurfaceHooks(hostDropSurface);
    }

    private Control? _hostDropSurface;
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
    }

    private bool TryAcceptHostDropSurfaceDrag(DragEventArgs e, out DragDropEffects effect)
    {
        effect = DragDropEffects.None;
        if (!CanAcceptHostFileDrop() || !IsFileDrag(e))
            return false;

        effect = DragDropEffects.Copy;
        return true;
    }

    private Point ToWebViewPointFromDropSurface(DragEventArgs e)
    {
        if (_hostDropSurface == null)
            return Point.Empty;

        var surfacePoint = new Point(e.X, e.Y);
        var screenPoint = _hostDropSurface.PointToScreen(surfacePoint);
        return _webView.PointToClient(screenPoint);
    }

    private void OnHostDropSurfaceDragEnter(object? sender, DragEventArgs e)
    {
        if (!TryAcceptHostDropSurfaceDrag(e, out var effect))
            return;

        e.Effect = effect;
        _ = SetFileDropHighlightAsync(true);
    }

    private void OnHostDropSurfaceDragOver(object? sender, DragEventArgs e)
    {
        if (!TryAcceptHostDropSurfaceDrag(e, out var effect))
            return;

        e.Effect = effect;

        var now = DateTime.UtcNow;
        if ((now - _lastDragCaretUpdateUtc).TotalMilliseconds < 50)
            return;

        _lastDragCaretUpdateUtc = now;
        _ = FocusCaretAtPointAsync(ToWebViewPointFromDropSurface(e));
    }

    private void OnHostDropSurfaceDragLeave(object? sender, EventArgs e) =>
        _ = SetFileDropHighlightAsync(false);

    private void OnHostDropSurfaceDragDrop(object? sender, DragEventArgs e)
    {
        _ = SetFileDropHighlightAsync(false);

        if (!CanAcceptHostFileDrop() || !IsFileDrag(e))
            return;

        if (e.Data?.GetData(DataFormats.FileDrop) is not string[] paths || paths.Length == 0)
            return;

        _ = InvokeFileDropHandlerAsync(paths, ToWebViewPointFromDropSurface(e));
    }

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

    public Task FocusCaretAtPointAsync(Point clientPoint)
    {
        if (!IsReady || IsScriptSuspended)
            return Task.CompletedTask;

        var zoom = _webView.ZoomFactor;
        var x = (int)Math.Round(clientPoint.X / zoom, MidpointRounding.AwayFromZero);
        var y = (int)Math.Round(clientPoint.Y / zoom, MidpointRounding.AwayFromZero);
        return RunApiAsync($"window.editorApi.focusCaretAtPoint({x},{y});");
    }

    public Task SetFileDropHighlightAsync(bool active) =>
        RunApiAsync($"window.editorApi.setFileDropHighlight({(active ? "true" : "false")});");

    private void EnsureHostFileDropHooks()
    {
        if (_fileDropHooksInstalled || _fileDropHandler == null)
            return;

        _fileDropHooksInstalled = true;
        _webView.AllowExternalDrop = true;
        _webView.DragEnter += OnWebViewDragEnter;
        _webView.DragOver += OnWebViewDragOver;
        _webView.DragLeave += OnWebViewDragLeave;
        _webView.DragDrop += OnWebViewDragDrop;
    }

    private static Point ToWebViewClientPoint(DragEventArgs e) =>
        new(e.X, e.Y);

    private bool CanAcceptHostFileDrop() =>
        _fileDropHandler != null &&
        _isReady &&
        _scriptSuspendDepth == 0 &&
        (_canAcceptFileDrop?.Invoke() ?? true);

    private static bool IsFileDrag(DragEventArgs e) =>
        e.Data?.GetDataPresent(DataFormats.FileDrop) == true;

    private void OnWebViewDragEnter(object? sender, DragEventArgs e)
    {
        if (!CanAcceptHostFileDrop() || !IsFileDrag(e))
        {
            e.Effect = DragDropEffects.None;
            return;
        }

        e.Effect = DragDropEffects.Copy;
        _ = SetFileDropHighlightAsync(true);
    }

    private void OnWebViewDragOver(object? sender, DragEventArgs e)
    {
        if (!CanAcceptHostFileDrop() || !IsFileDrag(e))
        {
            e.Effect = DragDropEffects.None;
            return;
        }

        e.Effect = DragDropEffects.Copy;

        var now = DateTime.UtcNow;
        if ((now - _lastDragCaretUpdateUtc).TotalMilliseconds < 50)
            return;

        _lastDragCaretUpdateUtc = now;
        var point = ToWebViewClientPoint(e);
        _ = FocusCaretAtPointAsync(point);
    }

    private void OnWebViewDragLeave(object? sender, EventArgs e) =>
        _ = SetFileDropHighlightAsync(false);

    private void OnWebViewDragDrop(object? sender, DragEventArgs e)
    {
        _ = SetFileDropHighlightAsync(false);

        if (!CanAcceptHostFileDrop() || !IsFileDrag(e))
            return;

        if (e.Data?.GetData(DataFormats.FileDrop) is not string[] paths || paths.Length == 0)
            return;

        var point = ToWebViewClientPoint(e);
        _ = InvokeFileDropHandlerAsync(paths, point);
    }

    private async Task InvokeFileDropHandlerAsync(string[] paths, Point point)
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
            await _fileDropHandler(paths, point).ConfigureAwait(true);
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

            var paths = new List<string>();
            foreach (var obj in args.AdditionalObjects)
            {
                if (obj is CoreWebView2File file && !string.IsNullOrWhiteSpace(file.Path))
                    paths.Add(file.Path);
            }

            if (paths.Count == 0)
                return false;

            var zoom = _webView.ZoomFactor;
            var point = new Point(
                (int)Math.Round(x / zoom, MidpointRounding.AwayFromZero),
                (int)Math.Round(y / zoom, MidpointRounding.AwayFromZero));

            _ = InvokeFileDropHandlerAsync(paths.ToArray(), point);
            return true;
        }
        catch (JsonException)
        {
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

    public Task InsertImageAsync(string src, string alt) =>
        RunApiAsync($"window.editorApi.insertImage('{EscapeJs(src)}','{EscapeJs(alt)}');");

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

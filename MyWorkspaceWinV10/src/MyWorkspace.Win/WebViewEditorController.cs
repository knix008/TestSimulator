using System.Drawing;
using System.Text.Json;
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

    public WebViewEditorController(WebView2 webView) => _webView = webView;

    public event Action? ContentChanged;
    public event Action? CaretMoved;
    public event Action<Point>? ContextMenuRequested;

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

    public async Task InitializeAsync(MarkdownPipeline pipeline)
    {
        var environment = await WebView2EnvironmentProvider.GetSharedEnvironmentAsync().ConfigureAwait(true);
        await _webView.EnsureCoreWebView2Async(environment).ConfigureAwait(true);
        ApplyWebViewChrome();

        var settings = _webView.CoreWebView2.Settings;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.IsStatusBarEnabled = false;

        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        _webView.CoreWebView2.ContextMenuRequested += OnContextMenuRequested;
        _webView.CoreWebView2.NavigationCompleted += (_, _) => _isReady = true;
        await LoadMarkdownAsync(string.Empty, pipeline);
    }

    private void OnWebMessageReceived(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs args)
    {
        var message = args.TryGetWebMessageAsString();
        void Handle()
        {
            if (message == "changed")
                ContentChanged?.Invoke();
            else if (message == "caret")
                CaretMoved?.Invoke();
        }

        if (_webView.InvokeRequired)
            _webView.BeginInvoke(Handle);
        else
            Handle();
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
            html = PageMarkdownNormalizer.CollapseHtmlImages(html, pageId.Value);

        var normalized = NormalizeHtml(html);
        var markdown = MarkdownConverter.Convert(normalized).Trim();
        return pageId.HasValue
            ? PageMarkdownNormalizer.CollapseEditorImages(markdown, pageId.Value)
            : markdown;
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

    public Task CreateLinkAsync(string url) =>
        RunApiAsync($"window.editorApi.createLink('{EscapeJs(url)}');");

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
        var themeJson = JsonSerializer.Serialize(new
        {
            bg = ToCss(p.EditorBackground),
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
            colorScheme = AppTheme.IsDark ? "dark" : "light"
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

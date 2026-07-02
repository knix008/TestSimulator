using Markdig;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MyWorkspace.Win;

internal static class PageExportService
{
    public static void ExportMarkdown(string title, string markdownBody, string outputPath, int pageId, bool includeFrontMatter = true)
    {
        var materialized = PageMarkdownNormalizer.MaterializeAssetsForExport(markdownBody, pageId, outputPath);
        var content = PageDocumentBuilder.BuildMarkdownFile(title, materialized, includeFrontMatter);
        File.WriteAllText(outputPath, content);
    }

    public static void ExportWord(string title, string markdownBody, string outputPath, MarkdownPipeline pipeline, int pageId)
    {
        PageAssetStore.EnsureAssetsMaterialized(pageId, markdownBody);
        var prepared = PageMarkdownNormalizer.MaterializeAssetsForExport(markdownBody, pageId, outputPath);
        var withTitle = PageTitleHelper.EnsureTitleHeading(title, prepared);
        MarkdownDocxExporter.Export(withTitle, outputPath, pipeline);
    }

    public static async Task ExportPdfAsync(string title, string markdownBody, string outputPath, MarkdownPipeline pipeline, int pageId)
    {
        PageAssetStore.EnsureAssetsMaterialized(pageId, markdownBody);
        PageMarkdownNormalizer.MaterializeAssetsForExport(markdownBody, pageId, outputPath);
        var expanded = PageMarkdownNormalizer.ExpandAssetReferences(markdownBody, pageId);
        var html = PreviewHtmlBuilder.Build(title, expanded, pipeline);
        await PdfExportHelper.ExportAsync(html, outputPath);
    }
}

internal static class PdfExportHelper
{
    public static async Task ExportAsync(string html, string outputPath)
    {
        using var host = new PdfExportHostForm();
        host.Show();
        await host.ExportAsync(html, outputPath);
    }
}

internal sealed class PdfExportHostForm : Form
{
    private readonly WebView2 _webView = new();
    private bool _navigationCompleted;

    public PdfExportHostForm()
    {
        ShowInTaskbar = false;
        Opacity = 0;
        Size = new Size(1, 1);
        StartPosition = FormStartPosition.Manual;
        Location = new Point(-2000, -2000);
        Controls.Add(_webView);
        _webView.Dock = DockStyle.Fill;
    }

    public async Task ExportAsync(string html, string outputPath)
    {
        var environment = await WebView2EnvironmentProvider.GetSharedEnvironmentAsync().ConfigureAwait(true);
        await _webView.EnsureCoreWebView2Async(environment).ConfigureAwait(true);
        PageAssetStore.ConfigureEditorWebView(_webView.CoreWebView2!);
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void OnCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            _webView.CoreWebView2!.NavigationCompleted -= OnCompleted;
            tcs.TrySetResult();
        }

        _webView.CoreWebView2!.NavigationCompleted += OnCompleted;
        _webView.NavigateToString(html);
        await tcs.Task.ConfigureAwait(true);
        await WaitForImagesAsync().ConfigureAwait(true);

        var settings = _webView.CoreWebView2.Environment.CreatePrintSettings();
        settings.ShouldPrintBackgrounds = true;
        await _webView.CoreWebView2.PrintToPdfAsync(outputPath, settings).ConfigureAwait(true);
        _navigationCompleted = true;
    }

    private async Task WaitForImagesAsync()
    {
        if (_webView.CoreWebView2 == null)
            return;

        await _webView.CoreWebView2.ExecuteScriptAsync(
            """
            (function () {
              return new Promise(function (resolve) {
                var images = Array.from(document.images || []);
                if (images.length === 0) {
                  resolve(true);
                  return;
                }
                var remaining = images.length;
                function done() {
                  remaining -= 1;
                  if (remaining <= 0)
                    resolve(true);
                }
                images.forEach(function (img) {
                  if (img.complete)
                    done();
                  else {
                    img.onload = done;
                    img.onerror = done;
                  }
                });
              });
            })();
            """).ConfigureAwait(true);

        await Task.Delay(150).ConfigureAwait(true);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        if (!_navigationCompleted)
            _webView.Dispose();
        base.OnFormClosed(e);
    }
}

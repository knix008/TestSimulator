using Markdig;
using Microsoft.Web.WebView2.WinForms;

namespace MyWorkspace.Win.Forms;

internal sealed class PageEditorSession : IDisposable
{
    public PageEditorSession(TabPage tabPage, WebView2 webView, WebViewEditorController editor)
    {
        TabPage = tabPage;
        WebView = webView;
        Editor = editor;
    }

    public TabPage TabPage { get; }
    public WebView2 WebView { get; }
    public WebViewEditorController Editor { get; }
    public int? PageId { get; set; }
    public int? DraftWorkspaceId { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsDirty { get; set; }
    public bool IsLoading { get; set; }

    public bool IsDraft => !PageId.HasValue && DraftWorkspaceId.HasValue;

    public void Dispose()
    {
        TabPage.Dispose();
        WebView.Dispose();
    }
}

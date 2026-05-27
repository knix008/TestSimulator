using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.ComponentModel;
using System.Text;

namespace MDMakerWinV10;

public partial class DocumentViewForm : Form
{
    private WebView2? _webView;
    private string? _filePath;
    private bool _isDirty;
    private bool _webViewReady;
    private bool _needsRerender;
    private bool _initializing;
    private List<OutlineItem> _outline = [];
    private readonly System.Windows.Forms.Timer _outlineTimer = new() { Interval = 800 };
    private CancellationTokenSource _statusCts = new();

    private const int SplitPreferredDistance = 230;
    private const int SplitPanel1Min = 130;
    private const int SplitPanel2Min = 200;

    public DocumentViewForm()
    {
        InitializeComponent();
    }

    public DocumentViewForm(string content, string? filePath = null) : this()
    {
        if (IsDesignMode)
            return;

        InitializeDocument(content, filePath);
    }

    private static bool IsDesignMode =>
        LicenseManager.UsageMode == LicenseUsageMode.Designtime;

    private void InitializeDocument(string content, string? filePath)
    {
        _filePath = filePath;

        _outlineTimer.Tick += (_, _) =>
        {
            _outlineTimer.Stop();
            _outline = MarkdownConverter.GetOutline(_editor.Text);
            BuildOutlineTree();
        };

        _split.Resize += (_, _) => ApplySplitterDistance(_split.SplitterDistance);
        Shown += (_, _) => ConfigureSplitLayout();

        _initializing = true;
        _editor.Text = content;
        _initializing = false;
        _isDirty = false;

        _outline = MarkdownConverter.GetOutline(_editor.Text);
        BuildOutlineTree();
        UpdateTitle();
        UpdateSaveButton();

        Load += DocumentViewForm_Load;
    }

    private void EnsureWebView()
    {
        if (_webView != null)
            return;

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.White,
            AllowExternalDrop = true
        };
        _pnlPreview.Controls.Add(_webView);
    }

    private async void DocumentViewForm_Load(object? sender, EventArgs e)
    {
        if (IsDesignMode)
            return;

        ConfigureSplitLayout();
        await InitWebViewAsync();
    }

    private void ConfigureSplitLayout()
    {
        if (_split.IsDisposed || _split.Width <= 0) return;

        _split.Panel1MinSize = SplitPanel1Min;
        _split.Panel2MinSize = SplitPanel2Min;
        ApplySplitterDistance(SplitPreferredDistance);
    }

    private void ApplySplitterDistance(int preferred)
    {
        if (_split.IsDisposed || _split.Width <= 0) return;

        int min = _split.Panel1MinSize;
        int max = _split.Width - _split.Panel2MinSize - _split.SplitterWidth;
        if (max < min) return;

        int distance = Math.Clamp(preferred, min, max);
        if (_split.SplitterDistance != distance)
            _split.SplitterDistance = distance;
    }

    private async Task InitWebViewAsync()
    {
        try
        {
            EnsureWebView();
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MDMakerWinV10", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
            await _webView!.EnsureCoreWebView2Async(env);
            _webView.DefaultBackgroundColor = Color.White;
            try
            {
                _webView.CoreWebView2.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Light;
            }
            catch { /* older WebView2 runtime */ }
            _webViewReady = true;
            _btnExportPdf.Enabled = true;
            RenderPreview();
        }
        catch (Exception ex)
        {
            if (IsDisposed) return;
            _btnExportPdf.Enabled = false;
            if (_webView != null)
                _webView.Visible = false;
            _pnlPreview.Controls.Add(new Label
            {
                Text = $"WebView2 초기화 실패\n{ex.Message}\n\nWebView2 Runtime이 설치되어 있는지 확인해 주세요.",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.Gray
            });
        }
    }

    private void RenderPreview()
    {
        if (!_webViewReady || _webView == null || IsDisposed) return;
        var md = _editor.Text;
        _outline = MarkdownConverter.GetOutline(md);
        BuildOutlineTree();
        _webView.NavigateToString(MarkdownConverter.ToHtmlWithAnchors(md));
        _needsRerender = false;
    }

    private void BuildOutlineTree()
    {
        _tree.BeginUpdate();
        _tree.Nodes.Clear();
        var stack = new Stack<TreeNode>();
        foreach (var item in _outline)
        {
            var node = new TreeNode(item.Text) { Tag = item };
            while (stack.Count > 0 && ((OutlineItem)stack.Peek().Tag!).Level >= item.Level)
                stack.Pop();
            if (stack.Count == 0) _tree.Nodes.Add(node);
            else stack.Peek().Nodes.Add(node);
            stack.Push(node);
        }
        _tree.ExpandAll();
        _tree.EndUpdate();
    }

    private async void Tree_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (e.Node?.Tag is not OutlineItem item) return;
        if (_tabs.SelectedIndex == 0 && _webViewReady && _webView?.CoreWebView2 != null)
        {
            await _webView.CoreWebView2.ExecuteScriptAsync(
                $"document.getElementById('h-{item.Index}')?.scrollIntoView({{behavior:'smooth',block:'start'}})");
        }
        else
        {
            JumpEditorToLine(item.Line);
        }
    }

    private void Tabs_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_tabs.SelectedIndex == 0 && _needsRerender)
            RenderPreview();
    }

    private void Editor_TextChanged(object? sender, EventArgs e)
    {
        if (_initializing) return;
        _isDirty = true;
        _needsRerender = true;
        UpdateTitle();
        UpdateSaveButton();
        _outlineTimer.Stop();
        _outlineTimer.Start();
    }

    private async void Save_Click(object? sender, EventArgs e) => await SaveAsync();

    private async void ExportHtml_Click(object? sender, EventArgs e)
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "HTML (*.html)|*.html",
            FileName = SuggestName(".html"),
            DefaultExt = "html"
        };
        if (_filePath != null) dlg.InitialDirectory = Path.GetDirectoryName(_filePath);
        if (dlg.ShowDialog() != DialogResult.OK) return;
        try
        {
            await File.WriteAllTextAsync(dlg.FileName,
                MarkdownConverter.ToHtml(_editor.Text), new UTF8Encoding(false));
            SetStatus($"HTML 저장 완료: {Path.GetFileName(dlg.FileName)}");
            ShowExportSuccess("HTML", dlg.FileName);
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private void ExportWord_Click(object? sender, EventArgs e)
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "Word (*.docx)|*.docx",
            FileName = SuggestName(".docx"),
            DefaultExt = "docx"
        };
        if (_filePath != null) dlg.InitialDirectory = Path.GetDirectoryName(_filePath);
        if (dlg.ShowDialog() != DialogResult.OK) return;
        try
        {
            MarkdownConverter.ToDocx(_editor.Text, dlg.FileName);
            SetStatus($"Word 저장 완료: {Path.GetFileName(dlg.FileName)}");
            ShowExportSuccess("Word", dlg.FileName);
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private async void ExportPdf_Click(object? sender, EventArgs e)
    {
        if (!_webViewReady || _webView?.CoreWebView2 == null) return;
        using var dlg = new SaveFileDialog
        {
            Filter = "PDF (*.pdf)|*.pdf",
            FileName = SuggestName(".pdf"),
            DefaultExt = "pdf"
        };
        if (_filePath != null) dlg.InitialDirectory = Path.GetDirectoryName(_filePath);
        if (dlg.ShowDialog() != DialogResult.OK) return;

        SetStatus("PDF 생성 중...");
        _btnExportPdf.Enabled = false;
        try
        {
            var tcs = new TaskCompletionSource();
            void OnNav(object? s, CoreWebView2NavigationCompletedEventArgs ev)
            {
                _webView!.CoreWebView2!.NavigationCompleted -= OnNav;
                tcs.TrySetResult();
            }
            _webView.CoreWebView2.NavigationCompleted += OnNav;
            _webView.NavigateToString(MarkdownConverter.ToHtmlForPdf(_editor.Text));
            await tcs.Task;

            var settings = _webView.CoreWebView2.Environment.CreatePrintSettings();
            settings.ShouldPrintBackgrounds = true;
            settings.MarginTop = 0.75;
            settings.MarginBottom = 0.75;
            settings.MarginLeft = 1.0;
            settings.MarginRight = 1.0;

            bool ok = await _webView.CoreWebView2.PrintToPdfAsync(dlg.FileName, settings);
            if (ok)
            {
                SetStatus($"PDF 저장 완료: {Path.GetFileName(dlg.FileName)}");
                ShowExportSuccess("PDF", dlg.FileName);
            }
            else
            {
                SetStatus("PDF 생성 실패");
                MessageBox.Show("PDF 생성에 실패했습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex) { ShowError(ex); }
        finally { _btnExportPdf.Enabled = _webViewReady; }
    }

    private async void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Control && e.KeyCode == Keys.S)
        {
            e.Handled = true;
            await SaveAsync();
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_isDirty)
        {
            var name = _filePath != null ? Path.GetFileName(_filePath) : "문서";
            var result = MessageBox.Show(
                $"'{name}'의 변경 사항을 저장하시겠습니까?",
                "저장 확인", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
            if (result == DialogResult.Cancel) { e.Cancel = true; return; }
            if (result == DialogResult.Yes) SaveBeforeClose();
        }
        _outlineTimer.Dispose();
        _statusCts.Dispose();
        base.OnFormClosing(e);
    }

    private void SaveBeforeClose()
    {
        try
        {
            if (_filePath == null)
            {
                using var dlg = new SaveFileDialog { Filter = "Markdown (*.md)|*.md", DefaultExt = "md" };
                if (dlg.ShowDialog() != DialogResult.OK) return;
                _filePath = dlg.FileName;
            }
            File.WriteAllText(_filePath, _editor.Text, new UTF8Encoding(false));
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private async Task SaveAsync()
    {
        if (_filePath == null)
        {
            using var dlg = new SaveFileDialog
            {
                Filter = "Markdown (*.md)|*.md|모든 파일 (*.*)|*.*",
                DefaultExt = "md",
                FileName = "document.md"
            };
            if (dlg.ShowDialog() != DialogResult.OK) return;
            _filePath = dlg.FileName;
        }
        try
        {
            await File.WriteAllTextAsync(_filePath, _editor.Text, new UTF8Encoding(false));
            _isDirty = false;
            UpdateTitle();
            UpdateSaveButton();
            SetStatus("저장 완료");
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private void JumpEditorToLine(int line)
    {
        if (line < 0) return;
        int idx = _editor.GetFirstCharIndexFromLine(line);
        if (idx < 0) return;
        _editor.Focus();
        _editor.SelectionStart = idx;
        _editor.SelectionLength = 0;
        _editor.ScrollToCaret();
    }

    private void UpdateTitle() =>
        Text = (_filePath != null ? Path.GetFileName(_filePath) : "미리보기")
             + (_isDirty ? " *" : "")
             + " — MD Maker";

    private void UpdateSaveButton() => _btnSave.Enabled = _isDirty;

    private string SuggestName(string ext) =>
        _filePath != null
            ? Path.GetFileNameWithoutExtension(_filePath) + ext
            : "document" + ext;

    private async void SetStatus(string msg)
    {
        _statusCts.Cancel();
        _statusCts = new CancellationTokenSource();
        var token = _statusCts.Token;
        if (!IsDisposed) _lblStatus.Text = msg;
        try
        {
            await Task.Delay(4000, token);
            if (!IsDisposed) _lblStatus.Text = "";
        }
        catch (TaskCanceledException) { }
    }

    private static void ShowError(Exception ex) =>
        MessageBox.Show(ex.Message, "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);

    private static void ShowExportSuccess(string format, string filePath) =>
        MessageBox.Show(
            $"{format} 파일을 저장했습니다.\n\n{filePath}",
            "보내기 완료",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
}

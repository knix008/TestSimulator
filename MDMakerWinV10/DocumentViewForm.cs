using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.ComponentModel;
using System.Text;

namespace MDMakerWinV10;

public partial class DocumentViewForm : Form
{
    private WebView2? _webView;
    private string? _filePath;
    private string? _previewTempFile;
    private bool _isDirty;
    private bool _webViewReady;
    private bool _needsRerender;
    private bool _initializing;
    private bool _isExporting;
    private PdfSettings _pdfSettings = new();
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
        _pdfSettings = AppSettings.Load().PdfSettings ?? new();

        _outlineTimer.Tick += (_, _) =>
        {
            _outlineTimer.Stop();
            _outline = MarkdownConverter.GetOutline(_editor.Text);
            BuildOutlineTree();
        };

        _split.Resize += (_, _) => ApplySplitterDistance(_split.SplitterDistance);
        Shown += DocumentViewForm_Shown;

        _initializing = true;
        _editor.Text = content;
        _initializing = false;
        _isDirty = false;

        _outline = MarkdownConverter.GetOutline(_editor.Text);
        BuildOutlineTree();
        UpdateTitle();
        UpdateSaveButton();
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

    private async void DocumentViewForm_Shown(object? sender, EventArgs e)
    {
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
            if (_webView == null || IsDisposed) return;
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

            string detail = $"{ex.GetType().Name}: {ex.Message}";
            _pnlPreview.Controls.Add(new Label
            {
                Text = "WebView2 초기화 실패. 자세한 내용은 상단 알림을 확인하세요.",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.Gray
            });
            ShowWebView2Error(detail);
        }
    }

    private void RenderPreview()
    {
        if (!_webViewReady || _webView == null || IsDisposed || _isExporting) return;
        var md = _editor.Text;
        _outline = MarkdownConverter.GetOutline(md);
        BuildOutlineTree();
        NavigateToHtml(MarkdownConverter.ToHtmlWithAnchors(md));
        _needsRerender = false;
    }

    private void NavigateToHtml(string html)
    {
        _previewTempFile ??= Path.ChangeExtension(Path.GetTempFileName(), ".html");
        File.WriteAllText(_previewTempFile, html, new UTF8Encoding(false));
        _webView!.CoreWebView2.Navigate(new Uri(_previewTempFile).AbsoluteUri);
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

    private async void Save_Click(object? sender, EventArgs e)
    {
        // 저장 버튼 클릭 시 편집 탭으로 전환
        if (_tabs.SelectedTab != _tabEdit)
            _tabs.SelectedTab = _tabEdit;
        await SaveAsync();
    }

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
        BeginExport("HTML 변환 중...");
        try
        {
            var md  = _editor.Text;
            var cfg = _pdfSettings;
            var html = await Task.Run(() => MarkdownConverter.ToHtml(md, cfg));
            await File.WriteAllTextAsync(dlg.FileName, html, new UTF8Encoding(false));
            EndExport($"HTML 저장 완료: {Path.GetFileName(dlg.FileName)}");
            ShowExportSuccess("HTML", dlg.FileName);
        }
        catch (Exception ex) { EndExport(); ShowError(ex); }
    }

    private async void ExportWord_Click(object? sender, EventArgs e)
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "Word (*.docx)|*.docx",
            FileName = SuggestName(".docx"),
            DefaultExt = "docx"
        };
        if (_filePath != null) dlg.InitialDirectory = Path.GetDirectoryName(_filePath);
        if (dlg.ShowDialog() != DialogResult.OK) return;
        BeginExport("Word 변환 중...");
        try
        {
            var md   = _editor.Text;
            var dest = dlg.FileName;
            var cfg  = _pdfSettings;
            await Task.Run(() => MarkdownConverter.ToDocx(md, dest, cfg));
            EndExport($"Word 저장 완료: {Path.GetFileName(dlg.FileName)}");
            ShowExportSuccess("Word", dlg.FileName);
        }
        catch (Exception ex) { EndExport(); ShowError(ex); }
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

        BeginExport("1/3  페이지 준비 중...");
        try
        {
            var md = _editor.Text;
            var cfg = _pdfSettings;
            var pdfHtml = await Task.Run(() => MarkdownConverter.ToHtmlForPdf(md, cfg));

            UpdateExportStatus("2/3  페이지 렌더링 중...");
            var tcs = new TaskCompletionSource();
            void OnNav(object? s, CoreWebView2NavigationCompletedEventArgs ev)
            {
                _webView!.CoreWebView2!.NavigationCompleted -= OnNav;
                tcs.TrySetResult();
            }
            _webView.CoreWebView2.NavigationCompleted += OnNav;
            NavigateToHtml(pdfHtml);
            await tcs.Task;

            UpdateExportStatus("3/3  PDF 변환 중...");
            var settings = _webView.CoreWebView2.Environment.CreatePrintSettings();
            settings.ShouldPrintBackgrounds = true;
            settings.MarginTop    = cfg.MarginVerticalInch;
            settings.MarginBottom = cfg.MarginVerticalInch;
            settings.MarginLeft   = cfg.MarginHorizontalInch;
            settings.MarginRight  = cfg.MarginHorizontalInch;

            bool ok = await _webView.CoreWebView2.PrintToPdfAsync(dlg.FileName, settings);
            if (ok)
            {
                EndExport($"PDF 저장 완료: {Path.GetFileName(dlg.FileName)}");
                ShowExportSuccess("PDF", dlg.FileName);
            }
            else
            {
                EndExport("PDF 생성 실패");
                MessageBox.Show("PDF 생성에 실패했습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex) { EndExport(); ShowError(ex); }
        finally
        {
            _needsRerender = true;
        }
    }

    private void ExportSettings_Click(object? sender, EventArgs e)
    {
        using var dlg = new PdfSettingsDialog(_pdfSettings);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        _pdfSettings = dlg.Result;
        var s = AppSettings.Load();
        s.PdfSettings = _pdfSettings;
        s.Save();
    }

    private async void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Control && e.KeyCode == Keys.S)
        {
            e.Handled = true;
            await SaveAsync();
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        _statusCts.Cancel();
        _outlineTimer.Dispose();
        _statusCts.Dispose();
        _webView?.Dispose();
        _webView = null;
        if (_previewTempFile != null)
        {
            try { File.Delete(_previewTempFile); } catch { }
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

    private void BeginExport(string status)
    {
        _isExporting = true;
        _outlineTimer.Stop();
        _tsspProgress.Visible = true;
        _btnSave.Enabled = false;
        _btnExportHtml.Enabled = false;
        _btnExportWord.Enabled = false;
        _btnExportPdf.Enabled = false;
        _btnExportSettings.Enabled = false;
        if (!IsDisposed) _tsslStatus.Text = status;
    }

    private void UpdateExportStatus(string status)
    {
        if (!IsDisposed) _tsslStatus.Text = status;
    }

    private void EndExport(string? completionStatus = null)
    {
        _isExporting = false;
        _tsspProgress.Visible = false;
        UpdateSaveButton();
        _btnExportHtml.Enabled = true;
        _btnExportWord.Enabled = true;
        _btnExportPdf.Enabled = _webViewReady;
        _btnExportSettings.Enabled = true;
        if (completionStatus != null) SetStatus(completionStatus);
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
        if (!IsDisposed) _tsslStatus.Text = msg;
        try
        {
            await Task.Delay(4000, token);
            if (!IsDisposed) _tsslStatus.Text = "";
        }
        catch (TaskCanceledException) { }
    }

    private void ShowWebView2Error(string detail)
    {
        using var dlg = new Form
        {
            Text = "WebView2 초기화 실패",
            ClientSize = new Size(520, 220),
            MinimumSize = new Size(400, 200),
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false
        };

        string msg = detail + "\n\nWebView2 Runtime이 설치되어 있는지 확인해 주세요.\n"
                   + "Windows 11은 기본 내장, Windows 10은 별도 설치가 필요합니다.";

        var txt = new TextBox
        {
            Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
            Dock = DockStyle.Fill, Font = new Font("Consolas", 9F),
            BackColor = Color.FromArgb(245, 245, 245), Text = msg
        };
        var pnlBtn = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom, Height = 40, FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(4)
        };
        var btnClose = new Button { Text = "닫기", Width = 72, Height = 28, DialogResult = DialogResult.OK };
        var btnCopy  = new Button { Text = "복사", Width = 72, Height = 28 };
        btnCopy.Click += (_, _) => { Clipboard.SetText(detail); btnCopy.Text = "복사됨"; };

        pnlBtn.Controls.Add(btnClose);
        pnlBtn.Controls.Add(btnCopy);
        dlg.Controls.Add(txt);
        dlg.Controls.Add(pnlBtn);
        dlg.AcceptButton = btnClose;
        dlg.ShowDialog(this);
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

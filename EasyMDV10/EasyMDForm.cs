using Markdig;
using Microsoft.Web.WebView2.Core;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace EasyMDV10;

public partial class EasyMDForm : Form
{
    private sealed record OutlineTarget(int LineIndex, string HeadingId);

    private string _currentFilePath = string.Empty;
    private bool _isDirty = false;
    private bool _isSyncing = false;
    private bool _suppressOutlineNavigation = false;
    private bool _suppressCaretPreviewSync = false;
    private string _lastPreviewHeadingId = string.Empty;
    private readonly MarkdownPipeline _pipeline;
    private readonly System.Windows.Forms.Timer _caretSyncTimer;

    public EasyMDForm()
    {
        InitializeComponent();
        ApplyModernTheme();

        _pipeline = new MarkdownPipelineBuilder()
            .UseAdvancedExtensions()
            .Build();

        _caretSyncTimer = new System.Windows.Forms.Timer(components) { Interval = 200 };
        _caretSyncTimer.Tick += (_, _) =>
        {
            _caretSyncTimer.Stop();
            SyncPreviewToCaret();
        };

        txtMarkdown.TextChanged += (s, e) =>
        {
            if (_isSyncing) return;
            MarkDirty();
            renderTimer.Stop();
            renderTimer.Start();
        };

        txtMarkdown.SelectionChanged += (_, _) =>
        {
            if (_isSyncing || _suppressOutlineNavigation || _suppressCaretPreviewSync) return;
            _caretSyncTimer.Stop();
            _caretSyncTimer.Start();
        };

        renderTimer.Tick += (s, e) =>
        {
            renderTimer.Stop();
            UpdatePreview();
            UpdateOutline();
            SyncPreviewToCaret(force: true);
        };
    }

    private int _savedSidebarWidth = 240;

    private void ApplyModernTheme()
    {
        UiTheme.Apply(
            this,
            menuStrip1,
            toolStrip1,
            outerSplitContainer,
            splitContainer1,
            pnlSidebar,
            pnlSidebarHeader,
            lblOutline,
            btnCollapse,
            treeOutline,
            txtMarkdown,
            webViewPreview);
    }

    private void SetupToolbarIcons()
    {
        treeOutline.ImageList = ToolbarIcons.HeadingImageList;
        toolStrip1.ImageList = ToolbarIcons.ToolbarImageList;
        toolStrip1.ImageScalingSize = new Size(20, 20);

        ToolbarIcons.ConfigureButton(btnToggleSidebar, "sidebar", "구조", "문서 구조 사이드바 열기/닫기");

        ToolbarIcons.ConfigureHeadingButton(btnH1, 0, "# ", "제목 1");
        ToolbarIcons.ConfigureHeadingButton(btnH2, 1, "## ", "제목 2");
        ToolbarIcons.ConfigureHeadingButton(btnH3, 2, "### ", "제목 3");
        ToolbarIcons.ConfigureHeadingButton(btnH4, 3, "#### ", "제목 4");
        ToolbarIcons.ConfigureHeadingButton(btnH5, 4, "##### ", "제목 5");
        ToolbarIcons.ConfigureHeadingButton(btnH6, 5, "###### ", "제목 6");

        ToolbarIcons.ConfigureButton(btnBold, "bold", "B", "굵게  (**텍스트**)", fontStyle: FontStyle.Bold);
        ToolbarIcons.ConfigureButton(btnItalic, "italic", "I", "기울임  (*텍스트*)", fontStyle: FontStyle.Italic);
        ToolbarIcons.ConfigureButton(btnStrike, "strike", "S", "취소선  (~~텍스트~~)");
        ToolbarIcons.ConfigureButton(btnCode, "code", "코드", "인라인 코드  (`코드`)", font: UiTheme.EditorFont);
        ToolbarIcons.ConfigureButton(btnCodeBlock, "codeblock", "블록", "코드 블록  (``` ... ```)", font: UiTheme.EditorFont);
        ToolbarIcons.ConfigureButton(btnLink, "link", "링크", "링크 삽입  ([텍스트](URL))");
        ToolbarIcons.ConfigureButton(btnImage, "image", "이미지", "이미지 삽입  (![설명](URL))");
        ToolbarIcons.ConfigureButton(btnUL, "ul", "목록", "글머리 기호 목록  (- 항목)");
        ToolbarIcons.ConfigureButton(btnOL, "ol", "번호", "번호 목록  (1. 항목)");
        ToolbarIcons.ConfigureButton(btnQuote, "quote", "인용", "인용구  (> 텍스트)");
        ToolbarIcons.ConfigureButton(btnHR, "hr", "구분선", "수평선  (---)");
        ToolbarIcons.ConfigureButton(btnTable, "table", "표", "표 삽입");
    }

    private static string LoadDefaultSampleDocument()
    {
        const string resourceName = "EasyMDV10.Resources.SampleDocument.md";
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream == null)
            return string.Empty;

        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private async void EasyMDForm_Load(object sender, EventArgs e)
    {
        SetupToolbarIcons();

        try
        {
            await webViewPreview.EnsureCoreWebView2Async(null);
            webViewPreview.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            webViewPreview.CoreWebView2.Settings.IsStatusBarEnabled = false;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"WebView2 런타임을 초기화할 수 없습니다.\n\n{ex.Message}\n\n" +
                "Microsoft Edge WebView2 런타임을 설치한 후 다시 시작해 주세요.\n" +
                "https://developer.microsoft.com/microsoft-edge/webview2/",
                "초기화 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        _isSyncing = true;
        txtMarkdown.Text = LoadDefaultSampleDocument();
        _isSyncing = false;
        _isDirty = false;
        UpdateTitleBar();
        UpdatePreview();
        UpdateOutline();
    }

    // ─── Preview ─────────────────────────────────────────────────────────────

    private void UpdatePreview()
    {
        if (webViewPreview.CoreWebView2 == null) return;
        webViewPreview.NavigateToString(BuildPreviewHtml());
    }

    private string BuildPreviewHtml()
        => PreviewHtmlBuilder.BuildFullPage(txtMarkdown.Text, _pipeline);

    // ─── Outline Sidebar ─────────────────────────────────────────────────────

    private const int MaxOutlineLevel = 3;

    private static readonly Regex HeadingRegex = new(@"^(#{1,6})\s+(.+)", RegexOptions.Compiled);

    private void UpdateOutline()
    {
        _suppressOutlineNavigation = true;
        treeOutline.BeginUpdate();
        treeOutline.Nodes.Clear();

        var stack = new List<(int level, TreeNode? node)>();
        string[] lines = txtMarkdown.Lines;
        int headingIndex = 0;

        for (int i = 0; i < lines.Length; i++)
        {
            var m = HeadingRegex.Match(lines[i]);
            if (!m.Success) continue;

            int level = m.Groups[1].Length;
            string text = m.Groups[2].Value.Trim();
            headingIndex++;

            while (stack.Count > 0 && stack[^1].level >= level)
                stack.RemoveAt(stack.Count - 1);

            TreeNode? node = null;
            if (level <= MaxOutlineLevel)
            {
                int imgIdx = ToolbarIcons.LevelToImageIndex(level);
                node = new TreeNode(text)
                {
                    Tag = new OutlineTarget(i, $"outline-heading-{headingIndex}"),
                    ImageIndex = imgIdx,
                    SelectedImageIndex = imgIdx
                };

                TreeNode? parent = null;
                for (int s = stack.Count - 1; s >= 0; s--)
                {
                    if (stack[s].node is TreeNode p)
                    {
                        parent = p;
                        break;
                    }
                }

                if (parent == null)
                    treeOutline.Nodes.Add(node);
                else
                    parent.Nodes.Add(node);
            }

            stack.Add((level, node));
        }

        treeOutline.ExpandAll();
        treeOutline.EndUpdate();
        _suppressOutlineNavigation = false;
    }

    private void treeOutline_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressOutlineNavigation) return;
        if (e.Node?.Tag is OutlineTarget target)
            NavigateToOutlineTarget(target);
    }

    private void NavigateToOutlineTarget(OutlineTarget target)
    {
        if (target.LineIndex < 0) return;

        _suppressCaretPreviewSync = true;
        _lastPreviewHeadingId = target.HeadingId;
        ScrollPreviewToHeading(target.HeadingId);

        BeginInvoke(() =>
        {
            txtMarkdown.ScrollLineToTop(target.LineIndex);
            _suppressCaretPreviewSync = false;
        });
    }

    private void SyncPreviewToCaret(bool force = false)
    {
        if (webViewPreview.CoreWebView2 == null) return;

        int line = txtMarkdown.GetLineFromCharIndex(txtMarkdown.SelectionStart);
        if (line < 0) line = 0;

        string? headingId = GetHeadingIdForLine(line);
        if (string.IsNullOrEmpty(headingId))
            return;

        if (!force && headingId == _lastPreviewHeadingId)
            return;

        _lastPreviewHeadingId = headingId;
        ScrollPreviewToHeading(headingId);
    }

    private string? GetHeadingIdForLine(int lineIndex)
    {
        string[] lines = txtMarkdown.Lines;
        if (lines.Length == 0) return null;

        int headingIndex = 0;
        string? lastId = null;

        int lastLine = Math.Min(lineIndex, lines.Length - 1);
        for (int i = 0; i <= lastLine; i++)
        {
            if (!HeadingRegex.IsMatch(lines[i])) continue;
            headingIndex++;
            lastId = $"outline-heading-{headingIndex}";
        }

        return lastId;
    }

    private void ScrollPreviewToHeading(string headingId)
    {
        if (webViewPreview.CoreWebView2 == null || string.IsNullOrWhiteSpace(headingId))
            return;

        string escapedId = headingId.Replace("\\", "\\\\").Replace("'", "\\'");
        _ = webViewPreview.CoreWebView2.ExecuteScriptAsync(
            $"document.getElementById('{escapedId}')?.scrollIntoView({{ behavior: 'auto', block: 'start' }});");
    }

    private void btnToggleSidebar_Click(object sender, EventArgs e)
        => SetSidebarVisible(outerSplitContainer.Panel1Collapsed);

    private void btnCollapse_Click(object sender, EventArgs e)
        => SetSidebarVisible(false);

    private void SetSidebarVisible(bool visible)
    {
        if (visible)
        {
            outerSplitContainer.Panel1Collapsed = false;
            BeginInvoke(() =>
            {
                if (_savedSidebarWidth < outerSplitContainer.Panel1MinSize)
                    _savedSidebarWidth = outerSplitContainer.Panel1MinSize;
                outerSplitContainer.SplitterDistance = _savedSidebarWidth;
            });
        }
        else
        {
            _savedSidebarWidth = outerSplitContainer.SplitterDistance;
            outerSplitContainer.Panel1Collapsed = true;
        }
    }

    // ─── State ───────────────────────────────────────────────────────────────

    private void MarkDirty()
    {
        if (_isDirty) return;
        _isDirty = true;
        UpdateTitleBar();
    }

    private void UpdateTitleBar()
    {
        string name = string.IsNullOrEmpty(_currentFilePath)
            ? "새 파일"
            : Path.GetFileName(_currentFilePath);
        Text = _isDirty ? $"EasyMD - {name} *" : $"EasyMD - {name}";
    }

    // ─── Toolbar ─────────────────────────────────────────────────────────────

    private void InsertInline(string prefix, string suffix, string placeholder = "텍스트")
    {
        int start = txtMarkdown.SelectionStart;
        int len = txtMarkdown.SelectionLength;
        string inner = len > 0 ? txtMarkdown.SelectedText : placeholder;
        txtMarkdown.SelectedText = prefix + inner + suffix;
        if (len == 0)
        {
            txtMarkdown.SelectionStart = start + prefix.Length;
            txtMarkdown.SelectionLength = placeholder.Length;
        }
        txtMarkdown.Focus();
    }

    private void InsertAtLineStart(string prefix)
    {
        int line = txtMarkdown.GetLineFromCharIndex(txtMarkdown.SelectionStart);
        int lineStart = txtMarkdown.GetFirstCharIndexFromLine(line);
        int saved = txtMarkdown.SelectionStart;
        txtMarkdown.SelectionStart = lineStart;
        txtMarkdown.SelectionLength = 0;
        txtMarkdown.SelectedText = prefix;
        txtMarkdown.SelectionStart = saved + prefix.Length;
        txtMarkdown.Focus();
    }

    private void btnH1_Click(object sender, EventArgs e) => InsertAtLineStart("# ");
    private void btnH2_Click(object sender, EventArgs e) => InsertAtLineStart("## ");
    private void btnH3_Click(object sender, EventArgs e) => InsertAtLineStart("### ");
    private void btnH4_Click(object sender, EventArgs e) => InsertAtLineStart("#### ");
    private void btnH5_Click(object sender, EventArgs e) => InsertAtLineStart("##### ");
    private void btnH6_Click(object sender, EventArgs e) => InsertAtLineStart("###### ");
    private void btnBold_Click(object sender, EventArgs e) => InsertInline("**", "**");
    private void btnItalic_Click(object sender, EventArgs e) => InsertInline("*", "*");
    private void btnStrike_Click(object sender, EventArgs e) => InsertInline("~~", "~~");
    private void btnCode_Click(object sender, EventArgs e) => InsertInline("`", "`", "코드");
    private void btnCodeBlock_Click(object sender, EventArgs e) => InsertInline("```\n", "\n```", "코드");
    private void btnLink_Click(object sender, EventArgs e) => InsertInline("[", "](https://)", "링크 텍스트");
    private void btnImage_Click(object sender, EventArgs e) => InsertInline("![", "](https://)", "이미지 설명");
    private void btnUL_Click(object sender, EventArgs e) => InsertAtLineStart("- ");
    private void btnOL_Click(object sender, EventArgs e) => InsertAtLineStart("1. ");
    private void btnQuote_Click(object sender, EventArgs e) => InsertAtLineStart("> ");

    private void btnHR_Click(object sender, EventArgs e)
    {
        txtMarkdown.SelectedText = "\n---\n";
        txtMarkdown.Focus();
    }

    private void btnTable_Click(object sender, EventArgs e)
    {
        txtMarkdown.SelectedText = "| 열1 | 열2 | 열3 |\n| --- | --- | --- |\n| 내용 | 내용 | 내용 |\n";
        txtMarkdown.Focus();
    }

    // ─── File Menu ───────────────────────────────────────────────────────────

    private void newToolStripMenuItem_Click(object sender, EventArgs e)
    {
        if (!PromptSaveIfDirty()) return;
        _isSyncing = true;
        txtMarkdown.Clear();
        _isSyncing = false;
        _currentFilePath = string.Empty;
        _isDirty = false;
        UpdateTitleBar();
        UpdatePreview();
        UpdateOutline();
    }

    private void openToolStripMenuItem_Click(object sender, EventArgs e)
    {
        if (!PromptSaveIfDirty()) return;
        using var dlg = new OpenFileDialog
        {
            Filter = "Markdown 파일 (*.md)|*.md|텍스트 파일 (*.txt)|*.txt|모든 파일 (*.*)|*.*",
            Title = "Markdown 파일 열기"
        };
        if (dlg.ShowDialog() == DialogResult.OK) LoadFile(dlg.FileName);
    }

    private async void saveToolStripMenuItem_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrEmpty(_currentFilePath))
            await SaveAsAsync();
        else
            await CommitSaveAsync(_currentFilePath);
    }

    private async void saveAsToolStripMenuItem_Click(object sender, EventArgs e) => await SaveAsAsync();

    private async void exportHtmlToolStripMenuItem_Click(object sender, EventArgs e)
        => await SaveExportAsAsync("HTML 문서 (*.html)|*.html", "html", "HTML로 저장");

    private async void exportPdfToolStripMenuItem_Click(object sender, EventArgs e)
        => await SaveExportAsAsync("PDF 문서 (*.pdf)|*.pdf", "pdf", "PDF로 저장");

    private async void exportWordToolStripMenuItem_Click(object sender, EventArgs e)
        => await SaveExportAsAsync("Word 문서 (*.docx)|*.docx", "docx", "Word 문서로 저장");

    private void exitToolStripMenuItem_Click(object sender, EventArgs e) => Close();

    private void aboutToolStripMenuItem_Click(object sender, EventArgs e)
    {
        using var dlg = new AboutDialog();
        dlg.ShowDialog(this);
    }

    private void LoadFile(string path)
    {
        _isSyncing = true;
        txtMarkdown.Text = File.ReadAllText(path, Encoding.UTF8);
        _isSyncing = false;
        _currentFilePath = path;
        _isDirty = false;
        UpdateTitleBar();
        UpdatePreview();
        UpdateOutline();
    }

    private async Task SaveAsAsync()
    {
        using var dlg = CreateSaveDialog(
            "Markdown 파일 (*.md)|*.md|" +
            "HTML 문서 (*.html)|*.html|" +
            "PDF 문서 (*.pdf)|*.pdf|" +
            "Word 문서 (*.docx)|*.docx|" +
            "텍스트 파일 (*.txt)|*.txt|" +
            "모든 파일 (*.*)|*.*",
            "md",
            "다른 이름으로 저장");
        if (dlg.ShowDialog() == DialogResult.OK)
            await CommitSaveAsync(dlg.FileName);
    }

    private async Task SaveExportAsAsync(string filter, string defaultExt, string title)
    {
        using var dlg = CreateSaveDialog(filter, defaultExt, title);
        if (dlg.ShowDialog() == DialogResult.OK)
            await CommitSaveAsync(dlg.FileName);
    }

    private SaveFileDialog CreateSaveDialog(string filter, string defaultExt, string title) =>
        new()
        {
            Filter = filter,
            Title = title,
            DefaultExt = defaultExt,
            FileName = string.IsNullOrEmpty(_currentFilePath)
                ? "새 파일"
                : Path.GetFileNameWithoutExtension(_currentFilePath)
        };

    private async Task CommitSaveAsync(string path)
    {
        string ext = Path.GetExtension(path).ToLowerInvariant();
        try
        {
            switch (ext)
            {
                case ".html":
                case ".htm":
                    await File.WriteAllTextAsync(path, BuildPreviewHtml(), Encoding.UTF8);
                    ShowExportSuccess(path);
                    return;

                case ".pdf":
                    if (!await ExportPreviewToPdfAsync(path))
                        throw new InvalidOperationException("PDF 생성에 실패했습니다.");
                    ShowExportSuccess(path);
                    return;

                case ".docx":
                    MarkdownDocxExporter.ExportPreviewHtml(BuildPreviewHtml(), path);
                    ShowExportSuccess(path);
                    return;

                default:
                    await File.WriteAllTextAsync(path, txtMarkdown.Text, Encoding.UTF8);
                    _currentFilePath = path;
                    _isDirty = false;
                    UpdateTitleBar();
                    return;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"파일을 저장하지 못했습니다.\n\n{ex.Message}",
                "저장 오류",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private void CommitSave(string path)
        => CommitSaveAsync(path).GetAwaiter().GetResult();

    private async Task<bool> ExportPreviewToPdfAsync(string path)
    {
        if (webViewPreview.CoreWebView2 == null)
            throw new InvalidOperationException("미리보기(WebView2)가 준비되지 않았습니다.");

        string html = BuildPreviewHtml();
        var navigation = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            webViewPreview.CoreWebView2!.NavigationCompleted -= OnNavigationCompleted;
            navigation.TrySetResult(e.IsSuccess);
        }

        webViewPreview.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
        webViewPreview.NavigateToString(html);

        if (!await navigation.Task.ConfigureAwait(true))
            return false;

        var printSettings = webViewPreview.CoreWebView2.Environment.CreatePrintSettings();
        printSettings.ShouldPrintBackgrounds = true;

        return await webViewPreview.CoreWebView2
            .PrintToPdfAsync(path, printSettings)
            .ConfigureAwait(true);
    }

    private static void ShowExportSuccess(string path)
    {
        MessageBox.Show(
            $"미리보기와 동일한 내용으로 저장했습니다.\n\n{path}",
            "저장 완료",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private bool PromptSaveIfDirty()
    {
        if (!_isDirty) return true;
        var r = MessageBox.Show(
            "저장되지 않은 변경사항이 있습니다. 저장하시겠습니까?",
            "저장 확인", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (r == DialogResult.Yes)
        {
            saveToolStripMenuItem_Click(this, EventArgs.Empty);
            return !_isDirty;
        }
        return r == DialogResult.No;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!PromptSaveIfDirty()) e.Cancel = true;
        base.OnFormClosing(e);
    }
}

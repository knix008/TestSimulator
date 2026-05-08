using Markdig;
using System.Text;
using System.Text.RegularExpressions;

namespace EaxyMDV10;

public partial class EasyMDForm : Form
{
    private sealed record OutlineTarget(int LineIndex, string HeadingId);

    private string _currentFilePath = string.Empty;
    private bool _isDirty = false;
    private bool _isSyncing = false;
    private readonly MarkdownPipeline _pipeline;

    public EasyMDForm()
    {
        InitializeComponent();

        _pipeline = new MarkdownPipelineBuilder()
            .UseAdvancedExtensions()
            .Build();

        txtMarkdown.TextChanged += (s, e) =>
        {
            if (_isSyncing) return;
            MarkDirty();
            renderTimer.Stop();
            renderTimer.Start();
        };

        renderTimer.Tick += (s, e) =>
        {
            renderTimer.Stop();
            UpdatePreview();
            UpdateOutline();
        };
    }

    private int _savedSidebarWidth = 220;

    // ─── Outline Icons ────────────────────────────────────────────────────────

    private static ImageList CreateOutlineImageList()
    {
        var il = new ImageList { ImageSize = new Size(20, 20), ColorDepth = ColorDepth.Depth32Bit };

        // EmbeddedResource로 포함된 PNG 파일 로드 (h1.png ~ h6.png)
        // 교체하려면 Resources/Icons/ 폴더의 PNG 파일을 교체 후 재빌드
        var asm = System.Reflection.Assembly.GetExecutingAssembly();
        string[] names = { "h1", "h2", "h3", "h4", "h5", "h6" };

        foreach (var name in names)
        {
            string resourceName = $"EaxyMDV10.Resources.Icons.{name}.png";
            using var stream = asm.GetManifestResourceStream(resourceName);
            if (stream != null)
                il.Images.Add(new Bitmap(stream));
            else
                il.Images.Add(CreateFallbackIcon(name));
        }

        return il;
    }

    private static Bitmap CreateFallbackIcon(string label)
    {
        var bmp = new Bitmap(20, 20, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.FromArgb(150, 150, 150));
        using var font = new Font("Segoe UI", 7f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.White);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString(label.ToUpper(), font, brush, new RectangleF(0, 0, 20, 20), sf);
        return bmp;
    }

    private async void EasyMDForm_Load(object sender, EventArgs e)
    {
        treeOutline.ImageList = CreateOutlineImageList();

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

        string sample = "# EaxyMD 마크다운 편집기\n\n" +
                        "왼쪽에서 **마크다운**을 입력하면 오른쪽에서 *미리보기*를 확인할 수 있습니다.\n\n" +
                        "## 기능\n\n" +
                        "- 도구 모음으로 마크다운 기호 삽입\n" +
                        "- 실시간 미리보기\n" +
                        "- 파일 열기 및 저장\n\n" +
                        "## 예제 코드\n\n" +
                        "```csharp\nConsole.WriteLine(\"Hello, Markdown!\");\n```\n\n" +
                        "| 제목 | 설명 |\n| --- | --- |\n| 항목 1 | 내용 |\n| 항목 2 | 내용 |\n";

        _isSyncing = true;
        txtMarkdown.Text = sample;
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
        string html = InjectHeadingIds(Markdown.ToHtml(txtMarkdown.Text, _pipeline));
        webViewPreview.NavigateToString(BuildPage(html));
    }

    private static string InjectHeadingIds(string html)
    {
        int headingIndex = 0;
        return Regex.Replace(
            html,
            "<h([1-6])([^>]*)>",
            m =>
            {
                string level = m.Groups[1].Value;
                string attrs = m.Groups[2].Value;
                headingIndex++;
                // Markdig가 이미 id를 생성한 경우가 있어 기존 id를 제거하고
                // 아웃라인-프리뷰 동기화용 id를 항상 동일 규칙으로 부여한다.
                attrs = Regex.Replace(attrs, @"\sid\s*=\s*(""[^""]*""|'[^']*')", "", RegexOptions.IgnoreCase);
                return $"<h{level}{attrs} id=\"outline-heading-{headingIndex}\">";
            });
    }

    private static string BuildPage(string body) => $$"""
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 15px; line-height: 1.7; color: #24292e;
              padding: 24px 32px; background: #fff;
            }
            h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 24px 0 16px; line-height: 1.3; }
            h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
            h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
            h3 { font-size: 1.25em; }
            p { margin: 0 0 16px; }
            a { color: #0366d6; text-decoration: none; }
            a:hover { text-decoration: underline; }
            code {
              font-family: 'Consolas', 'Courier New', monospace;
              font-size: 0.875em; background: #f6f8fa;
              padding: 0.2em 0.4em; border-radius: 3px; border: 1px solid #e1e4e8;
            }
            pre {
              background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px;
              padding: 16px; overflow-x: auto; margin: 0 0 16px;
            }
            pre code { background: none; border: none; padding: 0; font-size: 0.875em; }
            blockquote {
              border-left: 4px solid #0366d6; margin: 0 0 16px;
              padding: 8px 16px; color: #6a737d; background: #f8f9fa;
            }
            ul, ol { margin: 0 0 16px; padding-left: 2em; }
            li { margin: 4px 0; }
            table { border-collapse: collapse; width: 100%; margin: 0 0 16px; }
            th, td { border: 1px solid #dfe2e5; padding: 8px 12px; }
            th { background: #f6f8fa; font-weight: 600; }
            tr:nth-child(even) { background: #fafafa; }
            img { max-width: 100%; border-radius: 4px; }
            hr { border: none; border-top: 2px solid #eaecef; margin: 24px 0; }
            del { color: #6a737d; }
          </style>
        </head>
        <body>{{body}}</body>
        </html>
        """;

    // ─── Outline Sidebar ─────────────────────────────────────────────────────

    private static readonly Regex HeadingRegex = new(@"^(#{1,6})\s+(.+)", RegexOptions.Compiled);

    private void UpdateOutline()
    {
        treeOutline.BeginUpdate();
        treeOutline.Nodes.Clear();

        var stack = new Stack<(int level, TreeNode node)>();
        string[] lines = txtMarkdown.Lines;
        int headingIndex = 0;

        for (int i = 0; i < lines.Length; i++)
        {
            var m = HeadingRegex.Match(lines[i]);
            if (!m.Success) continue;

            int level = m.Groups[1].Length;
            string text = m.Groups[2].Value.Trim();
            int imgIdx = Math.Clamp(level - 1, 0, 5);
            headingIndex++;
            var node = new TreeNode(text)
            {
                Tag = new OutlineTarget(i, $"outline-heading-{headingIndex}"),
                ImageIndex = imgIdx,
                SelectedImageIndex = imgIdx
            };

            while (stack.Count > 0 && stack.Peek().level >= level)
                stack.Pop();

            if (stack.Count == 0)
                treeOutline.Nodes.Add(node);
            else
                stack.Peek().node.Nodes.Add(node);

            stack.Push((level, node));
        }

        treeOutline.ExpandAll();
        treeOutline.EndUpdate();
    }

    private void treeOutline_NodeMouseClick(object sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Node.Tag is not OutlineTarget target) return;
        int charIndex = txtMarkdown.GetFirstCharIndexFromLine(target.LineIndex);
        if (charIndex < 0) return;
        txtMarkdown.SelectionStart = charIndex;
        txtMarkdown.SelectionLength = 0;
        txtMarkdown.ScrollToCaret();
        txtMarkdown.Focus();
        ScrollPreviewToHeading(target.HeadingId);
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
        Text = _isDirty ? $"EaxyMD - {name} *" : $"EaxyMD - {name}";
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

    private void saveToolStripMenuItem_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrEmpty(_currentFilePath)) SaveAs();
        else CommitSave(_currentFilePath);
    }

    private void saveAsToolStripMenuItem_Click(object sender, EventArgs e) => SaveAs();

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

    private void SaveAs()
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "Markdown 파일 (*.md)|*.md|텍스트 파일 (*.txt)|*.txt|모든 파일 (*.*)|*.*",
            Title = "다른 이름으로 저장",
            DefaultExt = "md",
            FileName = string.IsNullOrEmpty(_currentFilePath)
                ? "새 파일"
                : Path.GetFileNameWithoutExtension(_currentFilePath)
        };
        if (dlg.ShowDialog() == DialogResult.OK) CommitSave(dlg.FileName);
    }

    private void CommitSave(string path)
    {
        File.WriteAllText(path, txtMarkdown.Text, Encoding.UTF8);
        _currentFilePath = path;
        _isDirty = false;
        UpdateTitleBar();
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

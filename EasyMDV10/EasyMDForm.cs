using Markdig;
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
    private readonly MarkdownPipeline _pipeline;

    public EasyMDForm()
    {
        InitializeComponent();
        ApplyModernTheme();

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

    private int _savedSidebarWidth = 240;

    private void ApplyModernTheme()
    {
        UiTheme.Apply(
            this,
            menuStrip1,
            toolStrip1,
            btnToggleSidebar,
            btnH1, btnH2, btnH3,
            btnBold, btnItalic, btnStrike,
            btnCode, btnCodeBlock,
            btnLink, btnImage,
            btnUL, btnOL, btnQuote,
            btnHR, btnTable,
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
            string resourceName = $"EasyMDV10.Resources.Icons.{name}.png";
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
          <meta name="color-scheme" content="light">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
              font-size: 15px; line-height: 1.75; color: #1f2328;
              padding: 28px 36px 40px; background: #ffffff;
              -webkit-font-smoothing: antialiased;
            }
            h1,h2,h3,h4,h5,h6 {
              font-weight: 600; margin: 28px 0 14px; line-height: 1.35;
              letter-spacing: -0.02em; color: #1f2328;
            }
            h1 { font-size: 1.875em; padding-bottom: 0.35em; border-bottom: 1px solid #d8dee4; }
            h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #eaeef2; }
            h3 { font-size: 1.25em; }
            p { margin: 0 0 16px; }
            a { color: #0969da; text-decoration: none; font-weight: 500; }
            a:hover { text-decoration: underline; }
            code {
              font-family: "Cascadia Mono", Consolas, monospace;
              font-size: 0.9em; background: #f6f8fa;
              padding: 0.15em 0.45em; border-radius: 6px;
              border: 1px solid #d0d7de;
            }
            pre {
              background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 10px;
              padding: 18px 20px; overflow-x: auto; margin: 0 0 18px;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
            }
            pre code { background: none; border: none; padding: 0; font-size: 0.875em; }
            blockquote {
              border-left: 4px solid #0969da; margin: 0 0 18px;
              padding: 10px 18px; color: #57606a; background: #f6f8fa;
              border-radius: 0 8px 8px 0;
            }
            ul, ol { margin: 0 0 16px; padding-left: 1.75em; }
            li { margin: 6px 0; }
            li::marker { color: #57606a; }
            table {
              border-collapse: separate; border-spacing: 0; width: 100%;
              margin: 0 0 18px; border: 1px solid #d0d7de; border-radius: 10px;
              overflow: hidden;
            }
            th, td { border-bottom: 1px solid #d0d7de; border-right: 1px solid #d0d7de; padding: 10px 14px; }
            th:last-child, td:last-child { border-right: none; }
            tr:last-child td { border-bottom: none; }
            th { background: #f6f8fa; font-weight: 600; text-align: left; }
            tr:nth-child(even) td { background: #fafbfc; }
            img { max-width: 100%; border-radius: 8px; box-shadow: 0 1px 3px rgba(27,31,36,0.12); }
            hr { border: none; border-top: 1px solid #d8dee4; margin: 28px 0; }
            del { color: #6e7781; }
            strong { font-weight: 600; }
          </style>
        </head>
        <body>{{body}}</body>
        </html>
        """;

    // ─── Outline Sidebar ─────────────────────────────────────────────────────

    private const int MaxOutlineLevel = 3;

    private static readonly Regex HeadingRegex = new(@"^(#{1,6})\s+(.+)", RegexOptions.Compiled);

    private void UpdateOutline()
    {
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
                int imgIdx = level - 1;
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

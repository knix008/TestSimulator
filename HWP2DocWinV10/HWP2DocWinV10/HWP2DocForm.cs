using HWP2DocWinV10.Export;
using HWP2DocWinV10.Services;
using Microsoft.Web.WebView2.Core;
using System.Text;
using System.Text.Json;

namespace HWP2DocWinV10;

public partial class HWP2DocForm : Form
{
    private string? _sourceFilePath;
    private string? _assetDirectory;
    private string _markdownText = string.Empty;
    private bool _isUpdatingEditor;
    private bool _isUpdatingStructure;
    private bool _isBusy;
    private StructurePanelSide _structurePanelSide = StructurePanelSide.Right;
    private bool _structurePanelVisible = true;
    private int _savedStructurePanelWidth;
    private float _fontSize = AppUserSettings.DefaultFontSize;
    private bool _isUpdatingFontSizeUi;
    private const int DefaultStructurePanelWidth = 280;

    private static readonly int[] FontSizeOptions = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

    public HWP2DocForm()
    {
        InitializeComponent();
        WireWebViewSplitRefresh();
        _savedStructurePanelWidth = DefaultStructurePanelWidth;
        AppUserSettings.Load();
        InitializeFontSizeUi();
        ApplyStructurePanelSide(AppUserSettings.StructurePanelSide, preserveWidth: false);
        ApplyStructurePanelVisibility(AppUserSettings.StructurePanelVisible, save: false);
        ApplyFontSize(AppUserSettings.FontSize, save: false);
        ApplyCommandIcons();
        TryLoadApplicationIcon();
    }

    private void WireWebViewSplitRefresh()
    {
        splitContainer1.SplitterMoving += SplitContainer_SplitterMoving;
        splitContainer1.SplitterMoved += SplitContainer_SplitterMoved;
        splitContainerMain.SplitterMoving += SplitContainer_SplitterMoving;
        splitContainerMain.SplitterMoved += SplitContainer_SplitterMoved;
        webViewMarkdown.Resize += WebView_Resize;
        webViewPreview.Resize += WebView_Resize;
    }

    private void SplitContainer_SplitterMoving(object? sender, SplitterCancelEventArgs e)
        => RefreshWebViewPanels();

    private void SplitContainer_SplitterMoved(object? sender, SplitterEventArgs e)
        => RefreshWebViewPanels();

    private void WebView_Resize(object? sender, EventArgs e)
    {
        if (sender is Microsoft.Web.WebView2.WinForms.WebView2 webView)
            RefreshWebView(webView);
    }

    private void RefreshWebViewPanels()
    {
        RefreshWebView(webViewMarkdown);
        RefreshWebView(webViewPreview);
    }

    private void RefreshWebView(Microsoft.Web.WebView2.WinForms.WebView2 webView)
    {
        if (webView.CoreWebView2 == null || webView.IsDisposed)
            return;

        webView.Invalidate(true);
        webView.Update();

        if (!IsHandleCreated)
            return;

        BeginInvoke(new Action(() =>
        {
            if (webView.CoreWebView2 == null || webView.IsDisposed)
                return;

            _ = webView.CoreWebView2.ExecuteScriptAsync(
                """
                (() => {
                  window.dispatchEvent(new Event('resize'));
                  if (window.hwp2docSyncLayout) {
                    window.hwp2docSyncLayout();
                  }
                  return true;
                })();
                """);
        }));
    }

    private void InitializeFontSizeUi()
    {
        foreach (int size in FontSizeOptions)
        {
            cboFontSize.Items.Add(size.ToString());
            var menuItem = new ToolStripMenuItem($"{size} pt")
            {
                Tag = size,
                CheckOnClick = true
            };
            menuItem.Click += FontSizeMenuItem_Click;
            fontSizeToolStripMenuItem.DropDownItems.Add(menuItem);
        }
    }

    private void ApplyCommandIcons()
    {
        ToolbarIcons.ApplyCommandIcons(
            fileToolStripMenuItem,
            infoToolStripMenuItem,
            viewToolStripMenuItem,
            openToolStripMenuItem,
            convertToolStripMenuItem,
            exportMarkdownToolStripMenuItem,
            exportWordToolStripMenuItem,
            exportPdfToolStripMenuItem,
            exitToolStripMenuItem,
            programInfoToolStripMenuItem,
            structurePanelVisibleToolStripMenuItem,
            structurePositionToolStripMenuItem,
            structurePanelLeftToolStripMenuItem,
            structurePanelRightToolStripMenuItem,
            fontSizeToolStripMenuItem,
            btnOpen,
            btnConvert,
            btnExportMarkdown,
            btnExportWord,
            btnExportPdf,
            btnProgramInfo);
    }

    private void TryLoadApplicationIcon()
    {
        try
        {
            string iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
            if (File.Exists(iconPath))
                Icon = new Icon(iconPath);
        }
        catch
        {
            // Designer/runtime에서 아이콘 로드 실패 시 기본 아이콘 사용
        }
    }

    private async void HWP2DocForm_Load(object? sender, EventArgs e)
    {
        try
        {
            await webViewMarkdown.EnsureCoreWebView2Async();
            webViewMarkdown.CoreWebView2.Settings.IsWebMessageEnabled = true;
            webViewMarkdown.CoreWebView2.WebMessageReceived += MarkdownEditor_WebMessageReceived;
            webViewMarkdown.CoreWebView2.NavigationCompleted += MarkdownEditor_NavigationCompleted;
            UpdateMarkdownEditor();

            await webViewPreview.EnsureCoreWebView2Async();
            UpdatePreview();
            UpdateStructure();
            if (!_structurePanelVisible)
                ApplyEqualEditorPreviewSplit();
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(
                this,
                "초기화 오류",
                "미리보기(WebView2) 초기화에 실패했습니다.",
                ex);
        }
    }

    private async void openToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        if (!EnsureNotBusy())
            return;

        if (openFileDialog1.ShowDialog(this) != DialogResult.OK)
            return;

        await ConvertFileAsync(openFileDialog1.FileName);
    }

    private async void convertToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_sourceFilePath))
        {
            MessageBox.Show(
                "먼저 HWP/HWPX 파일을 열어 주세요.",
                "변환",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        await ConvertFileAsync(_sourceFilePath);
    }

    private async Task ConvertFileAsync(string inputPath)
    {
        if (!EnsureNotBusy())
            return;

        SetBusy(true, "문서 변환 중...");
        try
        {
            var progress = new Progress<string>(message => SetStatus(message));
            HwpConversionResult result = await HwpConversionService.ConvertAsync(inputPath, progress);

            _sourceFilePath = result.SourceFilePath;
            _assetDirectory = result.AssetDirectory;
            _isUpdatingEditor = true;
            _markdownText = MarkdownLineBreakRestorer.FormatForEditor(result.Markdown);
            UpdateMarkdownEditor();

            UpdatePreview();
            UpdateStructure();
            Text = $"HWP2Doc - {Path.GetFileName(result.SourceFilePath)}";
            SetStatus($"변환 완료: {Path.GetFileName(result.SourceFilePath)}");
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(
                this,
                "변환 오류",
                "문서 변환에 실패했습니다.",
                ex);
            SetStatus("변환 실패");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void MarkdownEditor_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (_isUpdatingEditor || _isBusy)
            return;

        try
        {
            using JsonDocument document = JsonDocument.Parse(e.WebMessageAsJson);
            if (document.RootElement.GetProperty("type").GetString() != "textChanged")
                return;

            string text = document.RootElement.GetProperty("text").GetString() ?? string.Empty;
            if (text == _markdownText)
                return;

            _markdownText = text;
            previewTimer.Stop();
            previewTimer.Start();
        }
        catch
        {
            // 편집기 메시지 파싱 실패 시 무시합니다.
        }
    }

    private void MarkdownEditor_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
            _isUpdatingEditor = false;
    }

    private void UpdateMarkdownEditor()
    {
        if (webViewMarkdown.CoreWebView2 == null)
            return;

        _isUpdatingEditor = true;
        webViewMarkdown.NavigateToString(PreviewHtmlBuilder.BuildEditorPage(_markdownText, _fontSize));
    }

    private void previewTimer_Tick(object? sender, EventArgs e)
    {
        previewTimer.Stop();
        UpdatePreview();
        UpdateStructure();
    }

    private void UpdatePreview()
    {
        if (webViewPreview.CoreWebView2 == null)
            return;

        string html = PreviewHtmlBuilder.BuildFullPage(_markdownText, _assetDirectory, _fontSize);
        webViewPreview.NavigateToString(html);
    }

    private void UpdateStructure()
    {
        if (_isUpdatingStructure)
            return;

        _isUpdatingStructure = true;
        try
        {
            treeStructure.BeginUpdate();
            treeStructure.Nodes.Clear();

            IReadOnlyList<MarkdownStructureNode> roots = MarkdownStructureParser.ParseTree(_markdownText);
            foreach (MarkdownStructureNode node in roots)
                treeStructure.Nodes.Add(CreateStructureTreeNode(node));

            treeStructure.ExpandAll();
            lblStructure.Text = roots.Count == 0
                ? "문서 구조"
                : $"문서 구조 ({CountStructureNodes(roots)}개)";
        }
        finally
        {
            treeStructure.EndUpdate();
            _isUpdatingStructure = false;
        }
    }

    private static TreeNode CreateStructureTreeNode(MarkdownStructureNode node)
    {
        var treeNode = new TreeNode(GetStructureNodeText(node))
        {
            Tag = node
        };

        foreach (MarkdownStructureNode child in node.Children)
            treeNode.Nodes.Add(CreateStructureTreeNode(child));

        return treeNode;
    }

    private static string GetStructureNodeText(MarkdownStructureNode node)
    {
        return node.Kind switch
        {
            MarkdownStructureKind.Heading or MarkdownStructureKind.HtmlHeading =>
                node.Title,
            MarkdownStructureKind.Section => node.Title,
            MarkdownStructureKind.Table => node.Title,
            MarkdownStructureKind.List => node.Title,
            MarkdownStructureKind.Image => node.Title,
            MarkdownStructureKind.BlockQuote => $"인용: {node.Title}",
            MarkdownStructureKind.CodeBlock => node.Title,
            _ => node.Title
        };
    }

    private static int CountStructureNodes(IReadOnlyList<MarkdownStructureNode> nodes)
    {
        int count = nodes.Count;
        foreach (MarkdownStructureNode node in nodes)
            count += CountStructureNodes(node.Children);

        return count;
    }

    private void treeStructure_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_isUpdatingStructure)
            return;

        if (e.Node?.Tag is not MarkdownStructureNode structureNode)
            return;

        GoToMarkdownLine(structureNode.LineNumber, structureNode.Title);
    }

    private void treeStructure_NodeMouseDoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Node?.Tag is not MarkdownStructureNode structureNode)
            return;

        GoToMarkdownLine(structureNode.LineNumber, structureNode.Title);
        webViewMarkdown.Focus();
    }

    private string[] MarkdownLines =>
        string.IsNullOrEmpty(_markdownText)
            ? []
            : _markdownText.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');

    private void GoToMarkdownLine(int lineNumber, string? titleHint)
    {
        int editorLine = ResolveEditorLine(lineNumber, titleHint);
        if (editorLine < 0 || editorLine >= MarkdownLines.Length)
            return;

        _ = ScrollMarkdownEditorToLineAsync(editorLine);
        _ = ScrollPreviewToLineAsync(lineNumber);
    }

    private async Task ScrollMarkdownEditorToLineAsync(int editorLine)
    {
        if (webViewMarkdown.CoreWebView2 == null)
            return;

        try
        {
            await webViewMarkdown.CoreWebView2
                .ExecuteScriptAsync($"window.hwp2docGoToLine({editorLine})")
                .ConfigureAwait(true);
        }
        catch
        {
            // 편집기가 아직 로드되지 않은 경우 무시합니다.
        }
    }

    private int ResolveEditorLine(int normalizedLine, string? titleHint)
    {
        if (normalizedLine >= 0 && normalizedLine < MarkdownLines.Length)
            return normalizedLine;

        if (string.IsNullOrWhiteSpace(titleHint))
            return normalizedLine;

        string[] editorLines = MarkdownLines;
        for (int i = 0; i < editorLines.Length; i++)
        {
            if (editorLines[i].Contains(titleHint, StringComparison.OrdinalIgnoreCase))
                return i;
        }

        return normalizedLine;
    }

    private async Task ScrollPreviewToLineAsync(int lineNumber)
    {
        if (webViewPreview.CoreWebView2 == null || lineNumber < 0)
            return;

        string script = $$"""
            (() => {
              const target = document.getElementById('md-line-{{lineNumber}}');
              if (!target) {
                return false;
              }

              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              return true;
            })();
            """;

        try
        {
            await webViewPreview.CoreWebView2.ExecuteScriptAsync(script).ConfigureAwait(true);
        }
        catch
        {
            // 미리보기가 아직 로드되지 않은 경우 무시합니다.
        }
    }

    private async void exportMarkdownToolStripMenuItem_Click(object? sender, EventArgs e)
        => await ExportAsync("Markdown (*.md)|*.md", "md", ExportMarkdownAsync);

    private async void exportWordToolStripMenuItem_Click(object? sender, EventArgs e)
        => await ExportAsync("Word (*.docx)|*.docx", "docx", ExportWordAsync);

    private async void exportPdfToolStripMenuItem_Click(object? sender, EventArgs e)
        => await ExportAsync("PDF (*.pdf)|*.pdf", "pdf", ExportPdfAsync);

    private async Task ExportAsync(string filter, string defaultExt, Func<string, Task> exportAction)
    {
        if (string.IsNullOrWhiteSpace(_markdownText))
        {
            MessageBox.Show(
                "내보낼 Markdown 내용이 없습니다.",
                "내보내기",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        saveFileDialog1.Filter = filter;
        saveFileDialog1.DefaultExt = defaultExt;
        saveFileDialog1.FileName = string.IsNullOrWhiteSpace(_sourceFilePath)
            ? "document"
            : Path.GetFileNameWithoutExtension(_sourceFilePath);

        if (saveFileDialog1.ShowDialog(this) != DialogResult.OK)
            return;

        if (!EnsureNotBusy())
            return;

        SetBusy(true, "내보내는 중...");
        try
        {
            await exportAction(saveFileDialog1.FileName);
            MessageBox.Show(
                $"저장했습니다.\n\n{saveFileDialog1.FileName}",
                "내보내기 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            SetStatus($"내보내기 완료: {Path.GetFileName(saveFileDialog1.FileName)}");
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(
                this,
                "내보내기 오류",
                "파일 내보내기에 실패했습니다.",
                ex);
            SetStatus("내보내기 실패");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async Task ExportMarkdownAsync(string outputPath)
    {
        await File.WriteAllTextAsync(outputPath, _markdownText, Encoding.UTF8);
        await CopyAssetDirectoryAsync(Path.GetDirectoryName(outputPath)!);
    }

    private Task ExportWordAsync(string outputPath)
    {
        string html = PreviewHtmlBuilder.BuildForExport(_markdownText, _assetDirectory, _fontSize);
        MarkdownDocxExporter.ExportPreviewHtml(html, outputPath);
        return Task.CompletedTask;
    }

    private async Task ExportPdfAsync(string outputPath)
    {
        if (webViewPreview.CoreWebView2 == null)
            throw new InvalidOperationException("미리보기(WebView2)가 준비되지 않았습니다.");

        string html = PreviewHtmlBuilder.BuildForExport(_markdownText, _assetDirectory, _fontSize);
        var navigation = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            webViewPreview.CoreWebView2!.NavigationCompleted -= OnNavigationCompleted;
            navigation.TrySetResult(e.IsSuccess);
        }

        webViewPreview.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
        webViewPreview.NavigateToString(html);

        if (!await navigation.Task.ConfigureAwait(true))
            throw new InvalidOperationException("PDF 미리보기 렌더링에 실패했습니다.");

        var printSettings = webViewPreview.CoreWebView2.Environment.CreatePrintSettings();
        printSettings.ShouldPrintBackgrounds = true;

        if (!await webViewPreview.CoreWebView2.PrintToPdfAsync(outputPath, printSettings).ConfigureAwait(true))
            throw new InvalidOperationException("PDF 생성에 실패했습니다.");
    }

    private async Task CopyAssetDirectoryAsync(string destinationDirectory)
    {
        if (string.IsNullOrWhiteSpace(_assetDirectory) || !Directory.Exists(_assetDirectory))
            return;

        foreach (string sourceFile in Directory.EnumerateFiles(_assetDirectory, "*", SearchOption.AllDirectories))
        {
            if (sourceFile.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                continue;

            string relativePath = Path.GetRelativePath(_assetDirectory, sourceFile);
            string targetPath = Path.Combine(destinationDirectory, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
            await Task.Run(() => File.Copy(sourceFile, targetPath, overwrite: true));
        }
    }

    private void programInfoToolStripMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new AboutDialog();
        dialog.ShowDialog(this);
    }

    private void structurePanelLeftToolStripMenuItem_Click(object? sender, EventArgs e)
        => ApplyStructurePanelSide(StructurePanelSide.Left);

    private void structurePanelRightToolStripMenuItem_Click(object? sender, EventArgs e)
        => ApplyStructurePanelSide(StructurePanelSide.Right);

    private void structurePanelVisibleToolStripMenuItem_Click(object? sender, EventArgs e)
        => ApplyStructurePanelVisibility(structurePanelVisibleToolStripMenuItem.Checked);

    private void FontSizeMenuItem_Click(object? sender, EventArgs e)
    {
        if (sender is not ToolStripMenuItem menuItem || menuItem.Tag is not int size)
            return;

        ApplyFontSize(size);
    }

    private void cboFontSize_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_isUpdatingFontSizeUi || cboFontSize.SelectedItem is not string selectedText)
            return;

        if (int.TryParse(selectedText, out int size))
            ApplyFontSize(size);
    }

    private void ApplyFontSize(float fontSize, bool save = true)
    {
        fontSize = Math.Clamp(fontSize, FontSizeOptions[0], FontSizeOptions[^1]);
        _fontSize = fontSize;

        treeStructure.Font = new Font("Segoe UI", fontSize, treeStructure.Font.Style);

        _isUpdatingFontSizeUi = true;
        try
        {
            string sizeText = ((int)fontSize).ToString();
            if (cboFontSize.Items.Contains(sizeText))
                cboFontSize.SelectedItem = sizeText;

            foreach (ToolStripItem item in fontSizeToolStripMenuItem.DropDownItems)
            {
                if (item is ToolStripMenuItem menuItem && menuItem.Tag is int optionSize)
                    menuItem.Checked = optionSize == (int)fontSize;
            }
        }
        finally
        {
            _isUpdatingFontSizeUi = false;
        }

        UpdateMarkdownEditor();
        UpdatePreview();

        if (save)
            AppUserSettings.SetFontSize(fontSize);
    }

    private void ApplyEqualEditorPreviewSplit()
    {
        if (splitContainer1.Width <= 0)
            return;

        int available = splitContainer1.Width - splitContainer1.SplitterWidth;
        int half = available / 2;
        int maxDistance = available - splitContainer1.Panel2MinSize;
        int minDistance = splitContainer1.Panel1MinSize;
        splitContainer1.SplitterDistance = Math.Clamp(half, minDistance, Math.Max(minDistance, maxDistance));
        RefreshWebViewPanels();
    }

    private void ApplyStructurePanelSide(StructurePanelSide side, bool preserveWidth = true)
    {
        if (_structurePanelSide == side && preserveWidth)
        {
            UpdateStructurePanelMenuChecks();
            return;
        }

        int structureWidth = preserveWidth ? GetCurrentStructurePanelWidth() : DefaultStructurePanelWidth;

        splitContainerMain.SuspendLayout();
        splitContainerMain.Panel1Collapsed = false;
        splitContainerMain.Panel2Collapsed = false;
        splitContainerMain.Panel1.Controls.Clear();
        splitContainerMain.Panel2.Controls.Clear();

        const int editorMinSize = 500;
        const int structureMinSize = 180;

        if (side == StructurePanelSide.Right)
        {
            splitContainerMain.Panel1.Controls.Add(splitContainer1);
            splitContainerMain.Panel2.Controls.Add(pnlStructure);
            splitContainerMain.FixedPanel = FixedPanel.Panel2;
            splitContainerMain.Panel1MinSize = editorMinSize;
            splitContainerMain.Panel2MinSize = structureMinSize;
        }
        else
        {
            splitContainerMain.Panel1.Controls.Add(pnlStructure);
            splitContainerMain.Panel2.Controls.Add(splitContainer1);
            splitContainerMain.FixedPanel = FixedPanel.Panel1;
            splitContainerMain.Panel1MinSize = structureMinSize;
            splitContainerMain.Panel2MinSize = editorMinSize;
        }

        structureWidth = Math.Clamp(
            structureWidth,
            structureMinSize,
            Math.Max(structureMinSize, splitContainerMain.Width - editorMinSize - splitContainerMain.SplitterWidth));

        _structurePanelSide = side;
        _savedStructurePanelWidth = structureWidth;
        splitContainerMain.ResumeLayout(true);

        SetStructureSplitterDistance(structureWidth);
        UpdateStructurePanelMenuChecks();
        ApplyStructurePanelVisibility(_structurePanelVisible, save: false);
        AppUserSettings.SetStructurePanelSide(side);
        RefreshWebViewPanels();
    }

    private void ApplyStructurePanelVisibility(bool visible, bool save = true)
    {
        if (visible && !_structurePanelVisible)
        {
            splitContainerMain.Panel1Collapsed = false;
            splitContainerMain.Panel2Collapsed = false;
            SetStructureSplitterDistance(_savedStructurePanelWidth);
        }
        else if (!visible && _structurePanelVisible)
        {
            _savedStructurePanelWidth = GetCurrentStructurePanelWidth();
        }

        _structurePanelVisible = visible;

        if (_structurePanelSide == StructurePanelSide.Right)
        {
            splitContainerMain.Panel1Collapsed = false;
            splitContainerMain.Panel2Collapsed = !visible;
        }
        else
        {
            splitContainerMain.Panel1Collapsed = !visible;
            splitContainerMain.Panel2Collapsed = false;
        }

        structurePanelVisibleToolStripMenuItem.Checked = visible;
        structurePositionToolStripMenuItem.Enabled = visible;
        structurePanelLeftToolStripMenuItem.Enabled = visible;
        structurePanelRightToolStripMenuItem.Enabled = visible;

        if (!visible)
            ApplyEqualEditorPreviewSplit();

        if (save)
            AppUserSettings.SetStructurePanelVisible(visible);

        RefreshWebViewPanels();
    }

    private int GetCurrentStructurePanelWidth()
    {
        if (!_structurePanelVisible)
            return _savedStructurePanelWidth > 0 ? _savedStructurePanelWidth : DefaultStructurePanelWidth;

        if (splitContainerMain.Width <= 0)
            return DefaultStructurePanelWidth;

        if (_structurePanelSide == StructurePanelSide.Right)
        {
            if (splitContainerMain.Panel2Collapsed)
                return _savedStructurePanelWidth;

            return splitContainerMain.Panel2.Width > 0 ? splitContainerMain.Panel2.Width : DefaultStructurePanelWidth;
        }

        if (splitContainerMain.Panel1Collapsed)
            return _savedStructurePanelWidth;

        return splitContainerMain.Panel1.Width > 0 ? splitContainerMain.Panel1.Width : DefaultStructurePanelWidth;
    }

    private void SetStructureSplitterDistance(int structureWidth)
    {
        int editorMinSize = _structurePanelSide == StructurePanelSide.Right
            ? splitContainerMain.Panel1MinSize
            : splitContainerMain.Panel2MinSize;
        int structureMinSize = _structurePanelSide == StructurePanelSide.Right
            ? splitContainerMain.Panel2MinSize
            : splitContainerMain.Panel1MinSize;

        int maxStructureWidth = splitContainerMain.Width - editorMinSize - splitContainerMain.SplitterWidth;
        int width = Math.Clamp(structureWidth, structureMinSize, Math.Max(structureMinSize, maxStructureWidth));

        if (_structurePanelSide == StructurePanelSide.Right)
            splitContainerMain.SplitterDistance = splitContainerMain.Width - width - splitContainerMain.SplitterWidth;
        else
            splitContainerMain.SplitterDistance = width;
    }

    private void UpdateStructurePanelMenuChecks()
    {
        structurePanelLeftToolStripMenuItem.Checked = _structurePanelSide == StructurePanelSide.Left;
        structurePanelRightToolStripMenuItem.Checked = _structurePanelSide == StructurePanelSide.Right;
    }

    private void exitToolStripMenuItem_Click(object? sender, EventArgs e) => Close();

    private bool EnsureNotBusy()
    {
        if (!_isBusy)
            return true;

        MessageBox.Show(
            "작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
            "HWP2Doc",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
        return false;
    }

    private void SetBusy(bool busy, string? statusMessage = null)
    {
        _isBusy = busy;
        statusProgress.Visible = busy;
        menuStrip1.Enabled = !busy;
        toolStrip1.Enabled = !busy;
        _ = SetEditorReadOnlyAsync(busy);

        if (!string.IsNullOrWhiteSpace(statusMessage))
            SetStatus(statusMessage);
        else if (!busy)
            SetStatus("준비");
    }

    private void SetStatus(string message) => lblStatus.Text = message;

    private async Task SetEditorReadOnlyAsync(bool readOnly)
    {
        if (webViewMarkdown.CoreWebView2 == null)
            return;

        try
        {
            await webViewMarkdown.CoreWebView2
                .ExecuteScriptAsync($"window.hwp2docSetReadOnly({readOnly.ToString().ToLowerInvariant()})")
                .ConfigureAwait(true);
        }
        catch
        {
            // 편집기가 아직 로드되지 않은 경우 무시합니다.
        }
    }
}

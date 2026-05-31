using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Text;
using OCRWinV10.Ocr;
using OCRWinV10.Ui;

namespace OCRWinV10;

public partial class OCRForm : Form
{
    private readonly OcrService _ocrService = new();
    private readonly ImagePreprocessor _preprocessor = new();
    private AppSettings _settings;
    private bool _suppressEngineChange;

    private readonly List<Bitmap> _pages = [];
    private int _currentPage = 0;
    private CancellationTokenSource? _cts;
    private string? _currentFilePath;
    private PreprocessMode _preprocessMode = PreprocessMode.Auto;

    public OCRForm()
    {
        _settings = SettingsManager.Load();
        InitializeComponent();
        ApplySettingsToWindow();
        ApplyModernTheme();
        SetAppIcon();
        InitializeEngineCombo();
        tscbMode.SelectedIndex = Math.Clamp(_settings.PreprocessMode, 0, 2);
        UpdateSaveButtonsState();
    }

    private void ApplySettingsToWindow()
    {
        if (_settings.WindowWidth >= MinimumSize.Width && _settings.WindowHeight >= MinimumSize.Height)
            Size = new Size(_settings.WindowWidth, _settings.WindowHeight);

        if (_settings.WindowX >= 0 && _settings.WindowY >= 0)
        {
            StartPosition = FormStartPosition.Manual;
            Location = new Point(_settings.WindowX, _settings.WindowY);
        }

        if (Enum.IsDefined(_settings.WindowState))
            WindowState = _settings.WindowState;

        ApplySplitterDistance(outerSplitContainer, _settings.OuterSplitterDistance, 120);
        ApplySplitterDistance(innerSplitContainer, _settings.InnerSplitterDistance, 120);
    }

    private static void ApplySplitterDistance(SplitContainer split, int distance, int minPanel)
    {
        if (distance <= 0) return;

        int max = split.Orientation == Orientation.Horizontal
            ? split.Height - minPanel
            : split.Width - minPanel;

        if (max > minPanel)
            split.SplitterDistance = Math.Clamp(distance, minPanel, max);
    }

    private void CaptureSettingsFromUi()
    {
        _settings.PreprocessMode = tscbMode.SelectedIndex;
        if (_ocrService.ActiveProvider != null)
            _settings.OcrProviderId = _ocrService.ActiveProvider.Id;

        _settings.OuterSplitterDistance = outerSplitContainer.SplitterDistance;
        _settings.InnerSplitterDistance = innerSplitContainer.SplitterDistance;

        var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        _settings.WindowWidth = bounds.Width;
        _settings.WindowHeight = bounds.Height;
        _settings.WindowX = bounds.X;
        _settings.WindowY = bounds.Y;
        _settings.WindowState = WindowState;
    }

    private void ApplyModernTheme()
    {
        Font = UiTheme.BodyFont;
        BackColor = UiTheme.FormBackground;
        ForeColor = UiTheme.TextPrimary;

        menuStrip.BackColor = UiTheme.Surface;
        menuStrip.ForeColor = UiTheme.TextPrimary;
        toolStrip.BackColor = UiTheme.ToolStripBackground;
        toolStrip.ForeColor = UiTheme.TextPrimary;
        toolStrip.Renderer = new ModernToolStripRenderer();
        statusStrip.BackColor = UiTheme.StatusBackground;
        statusStrip.ForeColor = UiTheme.TextMuted;
        statusStrip.LayoutStyle = ToolStripLayoutStyle.HorizontalStackWithOverflow;
        tslStatus.Spring = true;
        tspProgress.Alignment = ToolStripItemAlignment.Right;
        tspProgress.Size = new Size(200, 18);

        PanelHeaderHelper.StylePanel(panelOriginalHeader);
        PanelHeaderHelper.Style(lblOriginalTitle, "원본 이미지");
        PanelHeaderHelper.StylePanel(panelBoxesHeader);
        PanelHeaderHelper.Style(lblBoxesTitle, "인식 결과 (박스)");
        PanelHeaderHelper.StylePanel(panelTextHeader);
        PanelHeaderHelper.Style(lblResultTitle, "텍스트 결과");

        pictureOriginal.BackColor = UiTheme.ImageCanvas;
        pictureBoxes.BackColor = UiTheme.ImageCanvas;

        richTextBoxResult.BackColor = UiTheme.Surface;
        richTextBoxResult.ForeColor = UiTheme.TextPrimary;
        richTextBoxResult.Font = UiTheme.ResultFont;
        richTextBoxResult.BorderStyle = BorderStyle.None;

        panelResultBar.BackColor = UiTheme.StatusBackground;
        StyleResultActionButton(btnCopyResult);
        StyleResultActionButton(btnSaveText);
        StyleResultActionButton(btnSaveBoxes);
        StyleResultActionButton(btnSaveAll);
        btnClearResult.FlatStyle = FlatStyle.Flat;
        btnClearResult.FlatAppearance.BorderColor = UiTheme.Border;
        btnClearResult.BackColor = UiTheme.Surface;
        btnClearResult.ForeColor = UiTheme.TextMuted;
        btnClearResult.Font = UiTheme.BodyFont;
        btnClearResult.Cursor = Cursors.Hand;
        outerSplitContainer.BackColor = UiTheme.Border;
        innerSplitContainer.BackColor = UiTheme.Border;
        outerSplitContainer.Panel1.BackColor = UiTheme.FormBackground;
        outerSplitContainer.Panel2.BackColor = UiTheme.FormBackground;
        innerSplitContainer.Panel1.BackColor = UiTheme.FormBackground;
        innerSplitContainer.Panel2.BackColor = UiTheme.FormBackground;

        tsbOcr.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        tsbOcr.ForeColor = UiTheme.OcrButtonIdleText;
        tsbOcr.BackColor = UiTheme.OcrButtonIdle;
        tsbOcr.Margin = new Padding(4, 1, 4, 1);
        tsbCancel.ForeColor = Color.FromArgb(220, 38, 38);

        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();
    }

    private void SetAppIcon()
    {
        try
        {
            var iconPath = Path.Combine(AppContext.BaseDirectory, "app.ico");
            if (File.Exists(iconPath))
                Icon = new System.Drawing.Icon(iconPath);
            else
                Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch { }
    }

    private void InitializeEngineCombo()
    {
        _suppressEngineChange = true;
        tscbEngine.Items.Clear();
        foreach (var p in _ocrService.Providers)
        {
            var status = p.IsInstalled ? "" : " (미설치)";
            tscbEngine.Items.Add($"{p.DisplayName}{status}");
        }

        var index = _ocrService.GetProviderIndex(_settings.OcrProviderId);
        if (index < 0)
            index = _ocrService.GetProviderIndex(OcrService.GetDefaultProviderId());
        if (index < 0) index = 0;
        tscbEngine.SelectedIndex = index;
        _ocrService.SelectProviderByIndex(index);
        _suppressEngineChange = false;

        UpdateEngineStatusLabel();
    }

    private void UpdateEngineStatusLabel()
    {
        var p = _ocrService.ActiveProvider;
        if (p == null)
        {
            tslLang.Text = "엔진: -";
            return;
        }

        var install = p.IsInstalled ? "준비됨" : "미설치";
        tslLang.Text = $"언어: {OcrLanguageProfile.DisplayName} · {p.DisplayName} ({install})";
    }

    private void tscbEngine_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (_suppressEngineChange || tscbEngine.SelectedIndex < 0) return;

        _ocrService.SelectProviderByIndex(tscbEngine.SelectedIndex);
        _settings.OcrProviderId = _ocrService.ActiveProvider!.Id;
        UpdateEngineStatusLabel();
    }

    // ── 파일 열기 ───────────────────────────────────────────────────────────

    private async void tsbOpen_Click(object sender, EventArgs e) => await OpenFileAsync();
    private async void tsmiOpen_Click(object sender, EventArgs e) => await OpenFileAsync();

    private async Task OpenFileAsync()
    {
        using var dlg = new OpenFileDialog
        {
            Title = "파일 열기",
            Filter = ImageFileLoader.OpenFileDialogFilter,
            FilterIndex = 1,
            InitialDirectory = Directory.Exists(_settings.LastDirectory) ? _settings.LastDirectory : ""
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;
        await LoadFileAsync(dlg.FileName);
    }

    private async Task LoadFileAsync(string filePath)
    {
        SetBusy(true, "파일 로딩 중...");
        ClearPages();

        try
        {
            var ext = Path.GetExtension(filePath).ToLowerInvariant();

            if (ext == ".pdf")
            {
                var pages = await PdfRenderer.RenderPagesAsync(filePath, dpi: 200);
                _pages.AddRange(pages);
            }
            else if (ImageFileLoader.IsSupportedImage(filePath))
            {
                _pages.Add(await Task.Run(() => ImageFileLoader.Load(filePath)));
            }
            else
            {
                throw new NotSupportedException(
                    $"지원하지 않는 이미지 형식입니다: {Path.GetExtension(filePath)}");
            }

            _currentFilePath = filePath;
            _settings.LastDirectory = Path.GetDirectoryName(filePath) ?? "";
            SettingsManager.Save(_settings);

            _currentPage = 0;
            DisplayCurrentPage();
            UpdatePageControls();
            UpdateTitle();
            tsbOcr.Enabled = true;
            SetStatus($"파일 로드 완료: {Path.GetFileName(filePath)}  ({_pages.Count}페이지)");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"파일 열기 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("파일 열기 실패");
        }
        finally
        {
            SetBusy(false);
        }
    }

    // ── 페이지 표시 ─────────────────────────────────────────────────────────

    private void DisplayCurrentPage()
    {
        if (_pages.Count == 0) return;
        SetOriginalImage(new Bitmap(_pages[_currentPage]));
        SetBoxesImage(null);
    }

    private void SetOriginalImage(Bitmap? bmp)
    {
        var old = pictureOriginal.Image;
        pictureOriginal.Image = bmp;
        old?.Dispose();
    }

    private void SetBoxesImage(Bitmap? bmp)
    {
        var old = pictureBoxes.Image;
        pictureBoxes.Image = bmp;
        old?.Dispose();
        UpdateSaveButtonsState();
    }

    private void UpdateSaveButtonsState()
    {
        bool hasText = !string.IsNullOrEmpty(richTextBoxResult.Text);
        bool hasBoxes = pictureBoxes.Image != null;
        btnCopyResult.Enabled = hasText;
        btnSaveText.Enabled = hasText;
        btnSaveBoxes.Enabled = hasBoxes;
        btnSaveAll.Enabled = hasText || hasBoxes;
        tsmiSaveResult.Enabled = hasText;
        tsmiSaveBoxesImage.Enabled = hasBoxes;
        tsmiSaveAll.Enabled = hasText || hasBoxes;
    }

    private static void StyleResultActionButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = UiTheme.Border;
        button.BackColor = UiTheme.Surface;
        button.ForeColor = UiTheme.TextPrimary;
        button.Font = UiTheme.BodyFont;
        button.Cursor = Cursors.Hand;
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(239, 246, 255);
    }

    private void ClearPages()
    {
        foreach (var p in _pages) p.Dispose();
        _pages.Clear();
        SetOriginalImage(null);
        SetBoxesImage(null);
        richTextBoxResult.Clear();
        UpdateSaveButtonsState();
        tsbOcr.Enabled = false;
        tslPage.Text = "0 / 0";
        tsbPrev.Enabled = false;
        tsbNext.Enabled = false;
    }

    private void UpdatePageControls()
    {
        tslPage.Text = $"{_currentPage + 1} / {_pages.Count}";
        tsbPrev.Enabled = _currentPage > 0;
        tsbNext.Enabled = _currentPage < _pages.Count - 1;
    }

    private void UpdateTitle()
    {
        Text = _currentFilePath != null
            ? $"한국어 OCR - {Path.GetFileName(_currentFilePath)}"
            : "한국어 OCR";
    }

    // ── 페이지 이동 ─────────────────────────────────────────────────────────

    private void tsbPrev_Click(object sender, EventArgs e)
    {
        if (_currentPage <= 0) return;
        _currentPage--;
        DisplayCurrentPage();
        UpdatePageControls();
    }

    private void tsbNext_Click(object sender, EventArgs e)
    {
        if (_currentPage >= _pages.Count - 1) return;
        _currentPage++;
        DisplayCurrentPage();
        UpdatePageControls();
    }

    // ── OCR 실행 ────────────────────────────────────────────────────────────

    private async void tsbOcr_Click(object sender, EventArgs e) => await RunOcrAsync();

    private async Task<(OcrResult Result, OcrBoxTransform Transform)> RunAlternateEngineOcrAsync(
        Bitmap original, string providerId, CancellationToken cancellationToken)
    {
        SetOcrProgress(8, "문서 전처리 패스 생성 중");
        var candidates = await Task.Run(
            () => _preprocessor.ProcessAlternateEnginePassesWithMetadata(original, providerId),
            cancellationToken);

        return await RunMultiPassOcrAsync(candidates, "문서 인식", cancellationToken);
    }

    private async Task<(OcrResult Result, OcrBoxTransform Transform)> RunHandwritingOcrAsync(
        Bitmap original, CancellationToken cancellationToken)
    {
        SetOcrProgress(8, "손글씨 전처리 패스 생성 중");
        var candidates = await Task.Run(
            () => _preprocessor.ProcessHandwritingPassesWithMetadata(original),
            cancellationToken);

        return await RunMultiPassOcrAsync(candidates, "손글씨 인식", cancellationToken);
    }

    private async Task<(OcrResult Result, OcrBoxTransform Transform)> RunMultiPassOcrAsync(
        IReadOnlyList<PreprocessResult> candidates,
        string progressLabel,
        CancellationToken cancellationToken)
    {
        var ocrResults = new List<OcrResult>(candidates.Count);
        try
        {
            SetOcrProgress(12, $"{progressLabel} 준비 완료");

            for (int i = 0; i < candidates.Count; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                int pct = 15 + (65 * (i + 1) / candidates.Count);
                SetOcrProgress(pct, $"{progressLabel} ({i + 1}/{candidates.Count})");
                ocrResults.Add(await _ocrService.RecognizeAsync(candidates[i].Image, cancellationToken));
            }

            SetOcrProgress(82, "최적 결과 선택 중");

            int bestIndex = 0;
            double bestScore = double.MinValue;
            for (int i = 0; i < ocrResults.Count; i++)
            {
                var score = OcrResultScorer.Score(ocrResults[i]);
                if (score > bestScore)
                {
                    bestScore = score;
                    bestIndex = i;
                }
            }

            return (ocrResults[bestIndex], candidates[bestIndex].Transform);
        }
        finally
        {
            foreach (var candidate in candidates)
                candidate.Dispose();
        }
    }

    private async Task RunOcrAsync()
    {
        if (_pages.Count == 0) return;

        _cts = new CancellationTokenSource();
        var ocrStopwatch = Stopwatch.StartNew();
        SetOcrInProgress(true);
        SetOcrProgress(0, "OCR 시작");
        richTextBoxResult.Clear();
        SetBoxesImage(null);

        try
        {
            SetOcrProgress(5, "OCR 엔진 준비 중");
            if (!await _ocrService.EnsureReadyAsync(this, _cts.Token))
            {
                var provider = _ocrService.ActiveProvider!;
                if (!_cts.Token.IsCancellationRequested)
                {
                    MessageBox.Show(
                        $"{provider.DisplayName}을(를) 사용할 수 없습니다.\n\n{provider.Description}\n\n" +
                        "설치가 완료되지 않았거나 취소되었습니다.",
                        "OCR 엔진", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                ocrStopwatch.Stop();
                SetStatus($"OCR 엔진 준비 실패  ·  소요 {FormatOcrElapsed(ocrStopwatch.Elapsed)}");
                return;
            }

            RefreshEngineComboLabels();

            var original = _pages[_currentPage];

            OcrResult result;
            OcrBoxTransform boxTransform = OcrBoxTransform.Identity(original);

            SetOcrProgress(12, "엔진 준비 완료");

            var providerId = _ocrService.ActiveProvider?.Id;

            if (_preprocessMode == PreprocessMode.Handwriting)
            {
                (result, boxTransform) = await RunHandwritingOcrAsync(original, _cts.Token);
            }
            else if (_preprocessMode == PreprocessMode.Auto
                     && OcrProviderPreprocess.UsesDocumentPreprocess(providerId)
                     && providerId is not null)
            {
                (result, boxTransform) = await RunAlternateEngineOcrAsync(original, providerId, _cts.Token);
            }
            else
            {
                PreprocessResult preprocessed;
                if (_preprocessMode == PreprocessMode.None)
                {
                    SetOcrProgress(25, "원본 이미지 사용");
                    preprocessed = await Task.Run(
                        () => _preprocessor.ProcessWithMetadata(original, PreprocessMode.None, providerId),
                        _cts.Token);
                }
                else
                {
                    SetOcrProgress(25, "이미지 전처리 중");
                    preprocessed = await Task.Run(
                        () => _preprocessor.ProcessWithMetadata(original, _preprocessMode, providerId),
                        _cts.Token);
                    SetOcrProgress(45, "전처리 완료");
                }

                boxTransform = preprocessed.Transform;

                SetOcrProgress(55, "OCR 인식 중");
                result = await _ocrService.RecognizeAsync(preprocessed.Image, _cts.Token);
                preprocessed.Dispose();
                SetOcrProgress(85, "인식 완료");
            }

            SetOcrProgress(92, "결과 표시 중");
            richTextBoxResult.Text = OcrTextPostProcessor.FormatForDisplay(result);
            UpdateSaveButtonsState();

            var boxImage = DrawBoundingBoxes(original, result, boxTransform);
            SetBoxesImage(boxImage);

            int wordCount = result.Lines.Sum(l => l.Words.Count);
            ocrStopwatch.Stop();
            var elapsed = FormatOcrElapsed(ocrStopwatch.Elapsed);
            SetOcrProgress(100, "OCR 완료");
            SetStatus($"OCR 완료  —  {result.Lines.Count}줄, {wordCount}단어, {result.Text.Length}자  ·  소요 {elapsed}");
            HideOcrProgressBar();
        }
        catch (OperationCanceledException)
        {
            ocrStopwatch.Stop();
            HideOcrProgressBar();
            SetStatus($"OCR 취소됨  ·  소요 {FormatOcrElapsed(ocrStopwatch.Elapsed)}");
        }
        catch (Exception ex)
        {
            ocrStopwatch.Stop();
            HideOcrProgressBar();
            MessageBox.Show($"OCR 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"OCR 실패  ·  소요 {FormatOcrElapsed(ocrStopwatch.Elapsed)}");
        }
        finally
        {
            SetOcrInProgress(false);
            _cts?.Dispose();
            _cts = null;
        }
    }

    private static Bitmap DrawBoundingBoxes(Bitmap original, OcrResult result, OcrBoxTransform transform)
    {
        var boxImage = new Bitmap(original);
        using var g = Graphics.FromImage(boxImage);
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using var fillBrush = new SolidBrush(UiTheme.BoxFill);
        using var wordPen = new Pen(UiTheme.BoxStroke, 2f);
        using var linePen = new Pen(UiTheme.BoxStroke, 1.5f) { DashStyle = DashStyle.Dot };

        int drawn = 0;

        foreach (var line in result.Lines)
        {
            foreach (var word in line.Words)
            {
                var r = transform.MapRectToOriginal(word.BoundingRect);
                if (r.Width < 1 || r.Height < 1) continue;

                g.FillRectangle(fillBrush, r);
                g.DrawRectangle(wordPen, r);
                drawn++;
            }
        }

        // 단어 박스가 비어 있으면 줄 단위 합성 박스로 표시
        if (drawn == 0)
        {
            foreach (var line in result.Lines)
            {
                if (line.Words.Count == 0) continue;

                var union = UnionRect(line.Words.Select(w => w.BoundingRect));
                var r = transform.MapRectToOriginal(union);
                if (r.Width < 1 || r.Height < 1) continue;

                g.FillRectangle(fillBrush, r);
                g.DrawRectangle(linePen, r);
            }
        }

        return boxImage;
    }

    private static RectangleF UnionRect(IEnumerable<RectangleF> rects)
    {
        var list = rects.ToList();
        if (list.Count == 0)
            return RectangleF.Empty;

        float minX = list.Min(r => r.Left);
        float minY = list.Min(r => r.Top);
        float maxX = list.Max(r => r.Right);
        float maxY = list.Max(r => r.Bottom);
        return RectangleF.FromLTRB(minX, minY, maxX, maxY);
    }

    private void tsbCancel_Click(object sender, EventArgs e) => _cts?.Cancel();

    // ── 결과 조작 ───────────────────────────────────────────────────────────

    private void btnCopyResult_Click(object sender, EventArgs e)
    {
        if (!string.IsNullOrEmpty(richTextBoxResult.Text))
        {
            Clipboard.SetText(richTextBoxResult.Text);
            SetStatus("클립보드에 복사됨");
        }
    }

    private async void btnSaveText_Click(object sender, EventArgs e) => await SaveTextAsync();
    private async void tsmiSaveResult_Click(object sender, EventArgs e) => await SaveTextAsync();
    private async void btnSaveBoxes_Click(object sender, EventArgs e) => await SaveBoxesImageAsync();
    private async void tsmiSaveBoxesImage_Click(object sender, EventArgs e) => await SaveBoxesImageAsync();
    private async void btnSaveAll_Click(object sender, EventArgs e) => await SaveTextAndBoxesAsync();
    private async void tsmiSaveAll_Click(object sender, EventArgs e) => await SaveTextAndBoxesAsync();

    private string GetResultBaseName() =>
        _currentFilePath != null
            ? Path.GetFileNameWithoutExtension(_currentFilePath)
            : "ocr_result";

    private async Task SaveTextAsync()
    {
        if (string.IsNullOrEmpty(richTextBoxResult.Text))
        {
            MessageBox.Show("저장할 텍스트가 없습니다.", "저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "텍스트 결과 저장",
            Filter = "텍스트 파일 (UTF-8)|*.txt|모든 파일|*.*",
            FileName = GetResultBaseName() + "_ocr.txt",
            InitialDirectory = Directory.Exists(_settings.LastDirectory) ? _settings.LastDirectory : ""
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        try
        {
            await File.WriteAllTextAsync(dlg.FileName, richTextBoxResult.Text, Encoding.UTF8);
            RememberSaveDirectory(dlg.FileName);
            SetStatus($"텍스트 저장: {Path.GetFileName(dlg.FileName)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"저장 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private Task SaveBoxesImageAsync()
    {
        if (pictureBoxes.Image == null)
        {
            MessageBox.Show(
                "저장할 박스 이미지가 없습니다.\nOCR 실행 후 인식 박스가 표시된 상태에서 저장하세요.",
                "저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return Task.CompletedTask;
        }

        var imageExt = ResultSaveHelper.GetBoxesImageExtension(_currentFilePath);
        using var dlg = new SaveFileDialog
        {
            Title = "박스 이미지 저장",
            Filter = ResultSaveHelper.GetBoxesSaveFileDialogFilter(imageExt),
            FileName = ResultSaveHelper.BuildBoxesFileName(GetResultBaseName(), _currentFilePath),
            InitialDirectory = Directory.Exists(_settings.LastDirectory) ? _settings.LastDirectory : ""
        };

        if (dlg.ShowDialog() != DialogResult.OK)
            return Task.CompletedTask;

        try
        {
            var savePath = EnsureImageExtension(dlg.FileName, imageExt);
            ResultSaveHelper.SaveBitmap(pictureBoxes.Image, savePath);
            RememberSaveDirectory(savePath);
            SetStatus($"박스 이미지 저장: {Path.GetFileName(savePath)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"이미지 저장 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        return Task.CompletedTask;
    }

    private async Task SaveTextAndBoxesAsync()
    {
        if (string.IsNullOrEmpty(richTextBoxResult.Text) && pictureBoxes.Image == null)
        {
            MessageBox.Show("저장할 OCR 결과가 없습니다.", "저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Title = "텍스트 + 박스 이미지 저장",
            Filter = "텍스트 파일 (UTF-8)|*.txt",
            FileName = GetResultBaseName() + "_ocr.txt",
            InitialDirectory = Directory.Exists(_settings.LastDirectory) ? _settings.LastDirectory : ""
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        try
        {
            var dir = Path.GetDirectoryName(dlg.FileName)!;
            var resultBase = GetResultBaseName();

            if (!string.IsNullOrEmpty(richTextBoxResult.Text))
                await File.WriteAllTextAsync(dlg.FileName, richTextBoxResult.Text, Encoding.UTF8);

            string? imagePath = null;
            if (pictureBoxes.Image != null)
            {
                imagePath = Path.Combine(dir, ResultSaveHelper.BuildBoxesFileName(resultBase, _currentFilePath));
                ResultSaveHelper.SaveBitmap(pictureBoxes.Image, imagePath);
            }

            RememberSaveDirectory(dlg.FileName);
            var msg = imagePath != null
                ? $"저장 완료: {Path.GetFileName(dlg.FileName)}, {Path.GetFileName(imagePath)}"
                : $"저장 완료: {Path.GetFileName(dlg.FileName)}";
            SetStatus(msg);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"저장 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    /// <summary>
    /// 대화상자에서 사용자가 다른 확장자를 고른 경우, 원본 형식(또는 PDF→PNG)으로 맞춥니다.
    /// </summary>
    private static string EnsureImageExtension(string chosenPath, string preferredExtension)
    {
        var current = Path.GetExtension(chosenPath);
        if (string.Equals(current, preferredExtension, StringComparison.OrdinalIgnoreCase))
            return chosenPath;

        return Path.ChangeExtension(chosenPath, preferredExtension);
    }

    private void RememberSaveDirectory(string savedPath)
    {
        _settings.LastDirectory = Path.GetDirectoryName(savedPath) ?? _settings.LastDirectory;
        SettingsManager.Save(_settings);
    }

    private void btnClearResult_Click(object sender, EventArgs e)
    {
        richTextBoxResult.Clear();
        SetBoxesImage(null);
        UpdateSaveButtonsState();
        SetStatus("지워짐");
    }

    // ── 전처리 모드 ─────────────────────────────────────────────────────────

    private void RefreshEngineComboLabels()
    {
        var providerId = _ocrService.ActiveProvider?.Id ?? _settings.OcrProviderId;
        _suppressEngineChange = true;
        tscbEngine.Items.Clear();
        foreach (var p in _ocrService.Providers)
        {
            var status = p.IsInstalled ? "" : " (미설치)";
            tscbEngine.Items.Add($"{p.DisplayName}{status}");
        }
        var index = Math.Max(0, _ocrService.GetProviderIndex(providerId));
        tscbEngine.SelectedIndex = index;
        _suppressEngineChange = false;
        UpdateEngineStatusLabel();
    }

    private void tscbMode_SelectedIndexChanged(object sender, EventArgs e)
    {
        _preprocessMode = tscbMode.SelectedIndex switch
        {
            0 => PreprocessMode.Auto,
            1 => PreprocessMode.Handwriting,
            2 => PreprocessMode.None,
            _ => PreprocessMode.Auto
        };
        _settings.PreprocessMode = tscbMode.SelectedIndex;
    }

    // ── 드래그 앤 드롭 ──────────────────────────────────────────────────────

    private void OCRForm_DragEnter(object sender, DragEventArgs e)
    {
        e.Effect = e.Data?.GetDataPresent(DataFormats.FileDrop) == true
            ? DragDropEffects.Copy
            : DragDropEffects.None;
    }

    private async void OCRForm_DragDrop(object sender, DragEventArgs e)
    {
        if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            await LoadFileAsync(files[0]);
    }

    // ── 키보드 단축키 ───────────────────────────────────────────────────────

    private async void OCRForm_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F5 && tsbOcr.Enabled)
            await RunOcrAsync();
    }

    // ── 메뉴 ────────────────────────────────────────────────────────────────

    private void tsmiExit_Click(object sender, EventArgs e) => Close();

    private void tsmiAbout_Click(object sender, EventArgs e)
    {
        var engineInfo = string.Join("\n", _ocrService.Providers.Select(p =>
            $"  • {p.DisplayName}: {(p.IsInstalled ? "설치됨" : "미설치")} — {p.Description}"));

        MessageBox.Show(
            "한국어 OCR v1.0\n\n" +
            $"인식 언어: {OcrLanguageProfile.DisplayName} (한글 우선, 영문 병행)\n\n" +
            "OCR 엔진 (한·영 혼합 문서는 PaddleOCR 또는 EasyOCR 권장):\n" +
            engineInfo + "\n\n" +
            "전처리 모드:\n" +
            "  • 자동: 한글 인쇄 문서\n" +
            "  • 손글씨: 한글 손글씨 (3종 전처리 + 최적 결과)\n" +
            "  • 없음: 원본 그대로",
            "정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    // ── 유틸리티 ────────────────────────────────────────────────────────────

    private void SetBusy(bool busy, string? status = null)
    {
        tsbOpen.Enabled = !busy;
        if (busy)
        {
            tspProgress.Style = ProgressBarStyle.Marquee;
            tspProgress.MarqueeAnimationSpeed = 30;
            tspProgress.Visible = true;
            if (status != null) SetStatus(status);
        }
        else
        {
            HideOcrProgressBar();
        }
    }

    private void SetOcrInProgress(bool inProgress)
    {
        tsbOpen.Enabled = !inProgress;
        tsbOcr.Enabled = !inProgress && _pages.Count > 0;
        tsbOcr.Tag = inProgress ? UiTheme.OcrRunningTag : null;
        RefreshOcrButtonAppearance();
        tsbCancel.Enabled = inProgress;
        tsbCancel.Visible = inProgress;
        if (inProgress)
        {
            tspProgress.Style = ProgressBarStyle.Continuous;
            tspProgress.MarqueeAnimationSpeed = 0;
            tspProgress.Value = 0;
            tspProgress.Visible = true;
        }
        else
        {
            HideOcrProgressBar();
        }
    }

    private void RefreshOcrButtonAppearance()
    {
        if (InvokeRequired)
        {
            BeginInvoke(RefreshOcrButtonAppearance);
            return;
        }

        bool running = string.Equals(tsbOcr.Tag as string, UiTheme.OcrRunningTag, StringComparison.Ordinal);
        tsbOcr.ForeColor = running ? UiTheme.OcrButtonRunningText : UiTheme.OcrButtonIdleText;
        tsbOcr.BackColor = running ? UiTheme.OcrButtonRunning : UiTheme.OcrButtonIdle;
        toolStrip.Invalidate(tsbOcr.Bounds);
    }

    private static string FormatOcrElapsed(TimeSpan elapsed)
    {
        if (elapsed.TotalHours >= 1)
            return $"{(int)elapsed.TotalHours}시간 {elapsed.Minutes}분 {elapsed.Seconds}초";

        if (elapsed.TotalMinutes >= 1)
            return $"{elapsed.Minutes}분 {elapsed.Seconds}초";

        if (elapsed.TotalSeconds >= 10)
            return $"{elapsed.TotalSeconds:F1}초";

        return elapsed.TotalSeconds < 0.01
            ? "0초"
            : $"{elapsed.TotalSeconds:F2}초";
    }

    private void SetStatus(string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => SetStatus(message));
            return;
        }

        tslStatus.Text = message;
    }

    private void SetOcrProgress(int percent, string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => SetOcrProgress(percent, message));
            return;
        }

        percent = Math.Clamp(percent, 0, 100);
        tslStatus.Text = message;
        tspProgress.Style = ProgressBarStyle.Continuous;
        tspProgress.MarqueeAnimationSpeed = 0;
        tspProgress.Value = percent;
        tspProgress.Visible = true;
    }

    private void HideOcrProgressBar()
    {
        if (InvokeRequired)
        {
            BeginInvoke(HideOcrProgressBar);
            return;
        }

        tspProgress.Visible = false;
        tspProgress.Value = 0;
    }

    // ── 종료 처리 ───────────────────────────────────────────────────────────

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        CaptureSettingsFromUi();
        SettingsManager.Save(_settings);

        _ocrService.Dispose();
        foreach (var page in _pages) page.Dispose();
        pictureOriginal.Image?.Dispose();
        pictureBoxes.Image?.Dispose();

        base.OnFormClosing(e);
    }
}

namespace Image2TextWin;

public partial class Image2TextForm : Form
{
    private Bitmap? _sourceBitmap;
    private AsciiArtResult? _lastResult;
    private AppSettings _settings = new();
    private bool _editMode = false;
    private float _currentFontSize = 4f;
    private string _currentFontName = "Consolas";

    // 다시 그리기 - 문자 집합 순환
    private static readonly string[] CharSetCycle = { "Standard", "Detailed", "Block", "Simple", "Custom" };
    private int _charSetCycleIndex = 0;

    // 출력 캔버스 드래그
    private bool _isDragging = false;
    private Point _dragStart;
    private Point _scrollStart;

    private static readonly string[] MonospaceFonts =
    {
        "Consolas", "Courier New", "Lucida Console", "NSimSun",
        "MS Gothic", "Cascadia Code", "Fira Code", "Source Code Pro",
        "DejaVu Sans Mono", "Liberation Mono"
    };

    public Image2TextForm()
    {
        InitializeComponent();
    }

    private void Image2TextForm_Load(object sender, EventArgs e)
    {
        _settings = AppSettings.Load();
        ApplySettings();
        PopulateMonospaceFonts();
        UpdateSplitterLayout();
        LoadAppIcon();
        InitializeIcons();
        SetupCanvasDrag();
    }

    // ─── 아이콘 초기화 ────────────────────────────────────────────────────

    private void InitializeIcons()
    {
        const int ms = 20; // 메뉴 아이콘 크기
        const int ts = 20; // 툴바 아이콘 크기

        // 파일 메뉴
        menuFileOpenImage.Image = AppIcons.Get("open-image", ms);
        menuFileOpenText.Image = AppIcons.Get("open-text", ms);
        menuFileSaveText.Image = AppIcons.Get("save", ms);
        menuFileExport.Image = AppIcons.Get("export", ms);
        menuFileExportHtml.Image = AppIcons.Get("export-html", ms);
        menuFileExportPdf.Image = AppIcons.Get("export-pdf", ms);
        menuFileExportWord.Image = AppIcons.Get("export-word", ms);
        menuFileExportImage.Image = AppIcons.Get("export-image", ms);
        menuFileExit.Image = AppIcons.Get("exit", ms);

        // 편집 메뉴
        menuEditCopy.Image = AppIcons.Get("copy", ms);
        menuEditSelectAll.Image = AppIcons.Get("select-all", ms);
        menuEditToggleEdit.Image = AppIcons.Get("edit-mode", ms);

        // 변환 메뉴
        menuConvertRun.Image = AppIcons.Get("convert", ms);
        menuConvertRedraw.Image = AppIcons.Get("redraw", ms);
        menuConvertRedrawWith.Image = AppIcons.Get("charset-next", ms);
        menuConvertRedrawDetailed.Image = AppIcons.Get("charset-next", ms);
        menuConvertRedrawStandard.Image = AppIcons.Get("charset-next", ms);
        menuConvertRedrawSimple.Image = AppIcons.Get("charset-next", ms);
        menuConvertRedrawBlock.Image = AppIcons.Get("charset-next", ms);
        menuConvertRedrawCustom.Image = AppIcons.Get("charset-next", ms);

        // 보기 메뉴
        menuViewZoomIn.Image = AppIcons.Get("zoom-in", ms);
        menuViewZoomOut.Image = AppIcons.Get("zoom-out", ms);
        menuViewZoomReset.Image = AppIcons.Get("zoom-reset", ms);

        // 툴바 버튼
        btnOpenImage.Image = AppIcons.Get("open-image", ts);
        btnOpenText.Image = AppIcons.Get("open-text", ts);
        btnSaveText.Image = AppIcons.Get("save", ts);
        btnCopy.Image = AppIcons.Get("copy", ts);
        btnConvertToolbar.Image = AppIcons.Get("convert", ts);
        btnRedraw.Image = AppIcons.Get("redraw", ts);
        btnToggleEdit.Image = AppIcons.Get("edit-mode", ts);
        btnResetToolbar.Image = AppIcons.Get("zoom-reset", ts);
    }

    private void LoadAppIcon()
    {
        try
        {
            // 1순위: exe에 내장된 아이콘 (<ApplicationIcon> 태그로 포함됨)
            var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (exeIcon != null)
            {
                Icon = exeIcon;
                return;
            }
        }
        catch { }

        try
        {
            // 2순위: 출력 폴더의 .ico 파일
            string iconPath = Path.Combine(AppContext.BaseDirectory, "AppIcon.ico");
            if (File.Exists(iconPath))
                Icon = new Icon(iconPath);
        }
        catch { }
    }

    // ─── 캔버스 드래그 설정 ───────────────────────────────────────────────

    private void SetupCanvasDrag()
    {
        richTextBoxOutput.MouseDown += RichText_MouseDown;
        richTextBoxOutput.MouseMove += RichText_MouseMove;
        richTextBoxOutput.MouseUp += RichText_MouseUp;
        pnlOutputCanvas.MouseDown += Canvas_MouseDown;
        pnlOutputCanvas.MouseMove += Canvas_MouseMove;
        pnlOutputCanvas.MouseUp += Canvas_MouseUp;
        pnlOutputCanvas.Resize += PnlOutputCanvas_Resize;
    }

    private void RichText_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Middle || (!_editMode && e.Button == MouseButtons.Left))
        {
            _isDragging = true;
            _dragStart = e.Location;
            _scrollStart = new Point(pnlOutputCanvas.HorizontalScroll.Value,
                                     pnlOutputCanvas.VerticalScroll.Value);
            richTextBoxOutput.Cursor = Cursors.SizeAll;
            e.Handled(richTextBoxOutput);
        }
    }

    private void RichText_MouseMove(object? sender, MouseEventArgs e)
    {
        if (_isDragging)
        {
            int dx = _dragStart.X - e.X;
            int dy = _dragStart.Y - e.Y;
            ScrollCanvas(_scrollStart.X + dx, _scrollStart.Y + dy);
        }
    }

    private void RichText_MouseUp(object? sender, MouseEventArgs e)
    {
        _isDragging = false;
        richTextBoxOutput.Cursor = _editMode ? Cursors.IBeam : Cursors.SizeAll;
    }

    private void Canvas_MouseDown(object? sender, MouseEventArgs e)
    {
        _isDragging = true;
        _dragStart = e.Location;
        _scrollStart = new Point(pnlOutputCanvas.HorizontalScroll.Value,
                                 pnlOutputCanvas.VerticalScroll.Value);
        pnlOutputCanvas.Cursor = Cursors.SizeAll;
    }

    private void Canvas_MouseMove(object? sender, MouseEventArgs e)
    {
        if (_isDragging)
        {
            int dx = _dragStart.X - e.X;
            int dy = _dragStart.Y - e.Y;
            ScrollCanvas(_scrollStart.X + dx, _scrollStart.Y + dy);
        }
    }

    private void Canvas_MouseUp(object? sender, MouseEventArgs e)
    {
        _isDragging = false;
        pnlOutputCanvas.Cursor = Cursors.Default;
    }

    private void ScrollCanvas(int x, int y)
    {
        int maxH = pnlOutputCanvas.HorizontalScroll.Maximum;
        int maxV = pnlOutputCanvas.VerticalScroll.Maximum;
        x = Math.Clamp(x, 0, maxH);
        y = Math.Clamp(y, 0, maxV);
        pnlOutputCanvas.HorizontalScroll.Value = x;
        pnlOutputCanvas.VerticalScroll.Value = y;
        pnlOutputCanvas.PerformLayout();
    }

    private void PnlOutputCanvas_Resize(object? sender, EventArgs e)
    {
        CenterRichTextBox();
    }

    // ─── 폰트/모노스페이스 ────────────────────────────────────────────────

    private void PopulateMonospaceFonts()
    {
        var installed = new System.Drawing.Text.InstalledFontCollection();
        var installedNames = installed.Families.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);

        cmbFontName.BeginUpdate();
        cmbFontName.Items.Clear();
        foreach (var name in MonospaceFonts)
        {
            if (installedNames.Contains(name))
                cmbFontName.Items.Add(name);
        }
        foreach (var family in installed.Families)
        {
            if (!cmbFontName.Items.Contains(family.Name))
            {
                try
                {
                    using var testFont = new Font(family.Name, 10f);
                    if (testFont.Name.Equals(family.Name, StringComparison.OrdinalIgnoreCase))
                        cmbFontName.Items.Add(family.Name);
                }
                catch { }
            }
        }
        cmbFontName.EndUpdate();

        int idx = cmbFontName.Items.IndexOf(_settings.FontName);
        cmbFontName.SelectedIndex = idx >= 0 ? idx : 0;
        if (cmbFontName.SelectedItem is string sel)
            _currentFontName = sel;
    }

    // ─── 설정 적용/저장 ───────────────────────────────────────────────────

    private void ApplySettings()
    {
        numWidth.Value = Math.Clamp(_settings.OutputWidth, (int)numWidth.Minimum, (int)numWidth.Maximum);
        numHeight.Value = Math.Clamp(_settings.OutputHeight, (int)numHeight.Minimum, (int)numHeight.Maximum);
        chkAutoHeight.Checked = _settings.AutoHeight;
        numHeight.Enabled = !_settings.AutoHeight;

        switch (_settings.CharSet)
        {
            case "Detailed": rbCharDetailed.Checked = true; break;
            case "Block":    rbCharBlock.Checked = true; break;
            case "Simple":   rbCharSimple.Checked = true; break;
            case "Custom":
                rbCharCustom.Checked = true;
                txtCustomChars.Text = _settings.CustomChars;
                break;
            default: rbCharStandard.Checked = true; break;
        }

        _currentFontSize = _settings.FontSize;
        numFontSize.Value = (decimal)Math.Clamp(_settings.FontSize,
            (double)numFontSize.Minimum, (double)numFontSize.Maximum);
        _currentFontName = _settings.FontName;

        chkColorOutput.Checked = _settings.ColorOutput;
        chkInvert.Checked = _settings.InvertBrightness;
        chkEdgeDetect.Checked = _settings.EdgeDetect;
        trkContrast.Value = Math.Clamp(_settings.Contrast, trkContrast.Minimum, trkContrast.Maximum);
        trkBrightness.Value = Math.Clamp(_settings.Brightness, trkBrightness.Minimum, trkBrightness.Maximum);
        lblContrast.Text = $"대비:\n{_settings.Contrast:+#;-#;0}";
        lblBrightness.Text = $"밝기:\n{_settings.Brightness:+#;-#;0}";

        UpdateOutputFont();
    }

    private void ApplyDefaultSettings()
    {
        var def = new AppSettings();
        _settings.OutputWidth = def.OutputWidth;
        _settings.OutputHeight = def.OutputHeight;
        _settings.AutoHeight = def.AutoHeight;
        _settings.CharSet = def.CharSet;
        _settings.CustomChars = def.CustomChars;
        _settings.FontName = def.FontName;
        _settings.FontSize = def.FontSize;
        _settings.ColorOutput = def.ColorOutput;
        _settings.InvertBrightness = def.InvertBrightness;
        _settings.EdgeDetect = def.EdgeDetect;
        _settings.Contrast = def.Contrast;
        _settings.Brightness = def.Brightness;
        ApplySettings();
        PopulateMonospaceFonts();
        SetStatus("모든 설정이 기본값으로 복원되었습니다.");
    }

    private void SaveCurrentSettings()
    {
        _settings.OutputWidth = (int)numWidth.Value;
        _settings.OutputHeight = (int)numHeight.Value;
        _settings.AutoHeight = chkAutoHeight.Checked;
        _settings.FontName = _currentFontName;
        _settings.FontSize = _currentFontSize;
        _settings.ColorOutput = chkColorOutput.Checked;
        _settings.InvertBrightness = chkInvert.Checked;
        _settings.EdgeDetect = chkEdgeDetect.Checked;
        _settings.Contrast = trkContrast.Value;
        _settings.Brightness = trkBrightness.Value;
        _settings.CharSet = GetSelectedCharSet();
        _settings.CustomChars = txtCustomChars.Text;
        if (splitContainerMain.SplitterDistance > 0)
            _settings.SplitterDistance = splitContainerMain.SplitterDistance;
        _settings.Save();
    }

    private string GetSelectedCharSet()
    {
        if (rbCharDetailed.Checked) return "Detailed";
        if (rbCharStandard.Checked) return "Standard";
        if (rbCharSimple.Checked) return "Simple";
        if (rbCharBlock.Checked) return "Block";
        if (rbCharCustom.Checked) return "Custom";
        return "Standard";
    }

    private void UpdateSplitterLayout()
    {
        if (_settings.SplitterDistance > 100 &&
            _settings.SplitterDistance < splitContainerMain.Width - 100)
            splitContainerMain.SplitterDistance = _settings.SplitterDistance;
    }

    private void UpdateOutputFont()
    {
        try
        {
            var newFont = new Font(_currentFontName, _currentFontSize);
            richTextBoxOutput.Font = newFont;
            UpdateZoomLabel();
        }
        catch
        {
            richTextBoxOutput.Font = new Font("Courier New", _currentFontSize);
        }
    }

    private void UpdateZoomLabel()
    {
        float zoomPct = _currentFontSize / 4f * 100f;
        lblZoom.Text = $"글자크기: {_currentFontSize:F1}pt  배율: {zoomPct:F0}%  |  {_currentFontName}";
    }

    // ─── 이미지 열기 ──────────────────────────────────────────────────────

    private void menuFileOpenImage_Click(object? sender, EventArgs e)
    {
        openImageDialog.InitialDirectory = _settings.LastImageDirectory;
        if (openImageDialog.ShowDialog() != DialogResult.OK) return;
        LoadImageFile(openImageDialog.FileName);
    }

    private void LoadImageFile(string path)
    {
        try
        {
            _sourceBitmap?.Dispose();
            _sourceBitmap = new Bitmap(path);
            pictureBoxOriginal.Image = _sourceBitmap;
            _settings.LastImageDirectory = Path.GetDirectoryName(path) ?? _settings.LastImageDirectory;

            string info = $"{_sourceBitmap.Width}×{_sourceBitmap.Height}px  {GetFileSizeText(path)}";
            statusImageInfo.Text = $"이미지: {info}";
            statusFilePath.Text = Path.GetFileName(path);
            lblOriginal.Text = $"원본 이미지  [{Path.GetFileName(path)}]";
            SetStatus($"이미지 로드 완료: {Path.GetFileName(path)}");
            _lastResult = null;
            richTextBoxOutput.Clear();
            statusOutputInfo.Text = "출력: -";
        }
        catch (Exception ex)
        {
            MessageBox.Show($"이미지를 열 수 없습니다:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string GetFileSizeText(string path)
    {
        try
        {
            long bytes = new FileInfo(path).Length;
            if (bytes < 1024) return $"{bytes}B";
            if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1}KB";
            return $"{bytes / (1024.0 * 1024):F1}MB";
        }
        catch { return ""; }
    }

    // ─── 텍스트 파일 열기 ─────────────────────────────────────────────────

    private void menuFileOpenText_Click(object? sender, EventArgs e)
    {
        openTextDialog.InitialDirectory = _settings.LastTextDirectory;
        if (openTextDialog.ShowDialog() != DialogResult.OK) return;

        try
        {
            string text = File.ReadAllText(openTextDialog.FileName, System.Text.Encoding.UTF8);
            richTextBoxOutput.Clear();
            richTextBoxOutput.Text = text;
            _settings.LastTextDirectory = Path.GetDirectoryName(openTextDialog.FileName)
                ?? _settings.LastTextDirectory;

            var lines = text.Split('\n');
            statusOutputInfo.Text = $"출력: {lines.Length}행 × {lines.Max(l => l.Length)}열";
            statusFilePath.Text = Path.GetFileName(openTextDialog.FileName);
            lblOutput.Text = $"ASCII 아트 출력  [{Path.GetFileName(openTextDialog.FileName)}]";

            SetEditMode(true);
            CenterRichTextBox();
            SetStatus($"텍스트 파일 로드 완료: {Path.GetFileName(openTextDialog.FileName)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"파일을 열 수 없습니다:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ─── 변환 ─────────────────────────────────────────────────────────────

    private async void btnConvertMain_Click(object? sender, EventArgs e)
    {
        if (_sourceBitmap == null)
        {
            MessageBox.Show("먼저 이미지를 열어주세요.", "알림",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var options = BuildOptions();
        SetControlsEnabled(false);
        statusProgressBar.Visible = true;
        statusProgressBar.Value = 0;
        SetStatus("변환 중...");

        try
        {
            var progress = new Progress<int>(v =>
            {
                if (statusProgressBar.Value != v) statusProgressBar.Value = v;
            });

            var sourceCopy = new Bitmap(_sourceBitmap);
            var result = await Task.Run(() => AsciiArtConverter.Convert(sourceCopy, options, progress));
            sourceCopy.Dispose();

            _lastResult = result;

            // 현재 문자 집합 인덱스 업데이트
            _charSetCycleIndex = Array.IndexOf(CharSetCycle, options.CharSet);
            if (_charSetCycleIndex < 0) _charSetCycleIndex = 0;

            ApplyResultToOutput(result);
            statusOutputInfo.Text = $"출력: {result.Rows}행 × {result.Cols}열";
            SetStatus($"변환 완료. {result.Rows}행 × {result.Cols}열  |  문자 집합: {GetCharSetDisplayName(options.CharSet)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"변환 중 오류가 발생했습니다:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("변환 실패.");
        }
        finally
        {
            statusProgressBar.Visible = false;
            statusProgressBar.Value = 0;
            SetControlsEnabled(true);
        }
    }

    // ─── 다시 그리기 ──────────────────────────────────────────────────────

    private void btnRedraw_Click(object? sender, EventArgs e)
    {
        if (_sourceBitmap == null)
        {
            MessageBox.Show("먼저 이미지를 열어주세요.", "알림",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        // 다음 문자 집합으로 순환
        _charSetCycleIndex = (_charSetCycleIndex + 1) % CharSetCycle.Length;
        string nextCharSet = CharSetCycle[_charSetCycleIndex];
        ApplyCharSetToUI(nextCharSet);

        SetStatus($"다시 그리기: 문자 집합 → {GetCharSetDisplayName(nextCharSet)}");
        btnConvertMain_Click(sender, e);
    }

    private void menuConvertRedrawWith_Click(object? sender, EventArgs e)
    {
        if (_sourceBitmap == null)
        {
            MessageBox.Show("먼저 이미지를 열어주세요.", "알림",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        string charSet = "Standard";
        if (sender == menuConvertRedrawDetailed) charSet = "Detailed";
        else if (sender == menuConvertRedrawStandard) charSet = "Standard";
        else if (sender == menuConvertRedrawSimple) charSet = "Simple";
        else if (sender == menuConvertRedrawBlock) charSet = "Block";
        else if (sender == menuConvertRedrawCustom) charSet = "Custom";

        ApplyCharSetToUI(charSet);
        _charSetCycleIndex = Array.IndexOf(CharSetCycle, charSet);
        if (_charSetCycleIndex < 0) _charSetCycleIndex = 0;

        SetStatus($"선택한 문자 집합으로 다시 그리기: {GetCharSetDisplayName(charSet)}");
        btnConvertMain_Click(sender, e);
    }

    private void ApplyCharSetToUI(string charSet)
    {
        switch (charSet)
        {
            case "Detailed": rbCharDetailed.Checked = true; break;
            case "Block":    rbCharBlock.Checked = true; break;
            case "Simple":   rbCharSimple.Checked = true; break;
            case "Custom":   rbCharCustom.Checked = true; break;
            default:         rbCharStandard.Checked = true; break;
        }
    }

    private static string GetCharSetDisplayName(string key) => key switch
    {
        "Detailed" => "상세 (70단계)",
        "Standard" => "표준 (10단계)",
        "Simple"   => "단순 (5단계)",
        "Block"    => "블록 문자",
        "Custom"   => "사용자 정의",
        _          => key
    };

    private void ApplyResultToOutput(AsciiArtResult result)
    {
        richTextBoxOutput.SuspendLayout();
        richTextBoxOutput.Clear();

        if (result.ColorData != null && chkColorOutput.Checked)
        {
            var lines = result.Text.Split('\n');
            var colorDict = result.ColorData.ToDictionary(x => (x.Row, x.Col), x => x.Color);
            int row = 0;
            foreach (var line in lines)
            {
                for (int col = 0; col < line.Length; col++)
                {
                    Color fg = colorDict.TryGetValue((row, col), out var c) ? c : Color.White;
                    richTextBoxOutput.SelectionStart = richTextBoxOutput.TextLength;
                    richTextBoxOutput.SelectionLength = 0;
                    richTextBoxOutput.SelectionColor = fg;
                    richTextBoxOutput.AppendText(line[col].ToString());
                }
                if (row < lines.Length - 1)
                {
                    richTextBoxOutput.SelectionColor = Color.White;
                    richTextBoxOutput.AppendText("\n");
                }
                row++;
            }
        }
        else
        {
            richTextBoxOutput.ForeColor = Color.White;
            richTextBoxOutput.Text = result.Text;
        }

        richTextBoxOutput.ResumeLayout();
        richTextBoxOutput.SelectionStart = 0;
        richTextBoxOutput.ScrollToCaret();

        CenterRichTextBox();
    }

    // ─── 캔버스 중앙 정렬 ────────────────────────────────────────────────

    private void CenterRichTextBox()
    {
        if (richTextBoxOutput.TextLength == 0) return;

        // 텍스트 크기 측정
        var lines = richTextBoxOutput.Text.Split('\n');
        int maxCols = lines.Max(l => l.Length);
        int rows = lines.Length;

        using var g = richTextBoxOutput.CreateGraphics();
        var charSz = g.MeasureString("W", richTextBoxOutput.Font);
        int textW = (int)(charSz.Width * maxCols) + 4;
        int textH = (int)(charSz.Height * rows) + 4;

        richTextBoxOutput.Size = new Size(textW, textH);

        int canvasW = pnlOutputCanvas.ClientSize.Width;
        int canvasH = pnlOutputCanvas.ClientSize.Height;

        int x = textW < canvasW ? (canvasW - textW) / 2 : 0;
        int y = textH < canvasH ? (canvasH - textH) / 2 : 0;

        richTextBoxOutput.Location = new Point(x, y);

        // AutoScrollMinSize 설정으로 스크롤바 활성화
        pnlOutputCanvas.AutoScrollMinSize = new Size(
            textW < canvasW ? 0 : textW,
            textH < canvasH ? 0 : textH);
    }

    private ConversionOptions BuildOptions() => new()
    {
        Width = (int)numWidth.Value,
        Height = (int)numHeight.Value,
        AutoHeight = chkAutoHeight.Checked,
        CharSet = GetSelectedCharSet(),
        CustomChars = txtCustomChars.Text,
        Invert = chkInvert.Checked,
        EdgeDetect = chkEdgeDetect.Checked,
        Contrast = trkContrast.Value,
        Brightness = trkBrightness.Value,
        ColorOutput = chkColorOutput.Checked
    };

    // ─── 저장 ─────────────────────────────────────────────────────────────

    private void menuFileSaveText_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(richTextBoxOutput.Text))
        {
            MessageBox.Show("저장할 내용이 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        saveTextDialog.InitialDirectory = _settings.LastTextDirectory;
        if (saveTextDialog.ShowDialog() != DialogResult.OK) return;

        try
        {
            File.WriteAllText(saveTextDialog.FileName, richTextBoxOutput.Text, System.Text.Encoding.UTF8);
            _settings.LastTextDirectory = Path.GetDirectoryName(saveTextDialog.FileName)
                ?? _settings.LastTextDirectory;
            statusFilePath.Text = Path.GetFileName(saveTextDialog.FileName);
            SetStatus($"저장 완료: {saveTextDialog.FileName}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"저장 실패:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ─── 내보내기 ─────────────────────────────────────────────────────────

    private void menuFileExportHtml_Click(object? sender, EventArgs e)
    {
        ExportAs("HTML", "HTML 파일 (*.html)|*.html", ".html", path =>
            ExportManager.ExportHtml(richTextBoxOutput.Text, path, _currentFontName, _currentFontSize,
                chkColorOutput.Checked, _lastResult?.ColorData));
    }

    private void menuFileExportPdf_Click(object? sender, EventArgs e)
    {
        ExportAs("PDF", "PDF 파일 (*.pdf)|*.pdf", ".pdf", path =>
            ExportManager.ExportPdf(richTextBoxOutput.Text, path, _currentFontName, _currentFontSize));
    }

    private void menuFileExportWord_Click(object? sender, EventArgs e)
    {
        ExportAs("Word", "Word 파일 (*.docx)|*.docx", ".docx", path =>
            ExportManager.ExportWord(richTextBoxOutput.Text, path, _currentFontName, _currentFontSize));
    }

    private void menuFileExportImage_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(richTextBoxOutput.Text))
        {
            MessageBox.Show("내보낼 내용이 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        saveImageDialog.InitialDirectory = _settings.LastExportDirectory;
        if (saveImageDialog.ShowDialog() != DialogResult.OK) return;

        try
        {
            using var font = new Font(_currentFontName, _currentFontSize);
            using var bmp = AsciiArtConverter.RenderToImage(
                richTextBoxOutput.Text, font, Color.White, Color.Black);
            bmp.Save(saveImageDialog.FileName);
            _settings.LastExportDirectory = Path.GetDirectoryName(saveImageDialog.FileName)
                ?? _settings.LastExportDirectory;
            SetStatus($"이미지로 내보내기 완료: {saveImageDialog.FileName}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"이미지 내보내기 실패:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ExportAs(string typeName, string filter, string ext, Action<string> exportAction)
    {
        if (string.IsNullOrWhiteSpace(richTextBoxOutput.Text))
        {
            MessageBox.Show("내보낼 내용이 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new SaveFileDialog
        {
            Filter = filter,
            DefaultExt = ext.TrimStart('.'),
            Title = $"{typeName}로 내보내기",
            InitialDirectory = _settings.LastExportDirectory
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        try
        {
            SetStatus($"{typeName}로 내보내는 중...");
            exportAction(dlg.FileName);
            _settings.LastExportDirectory = Path.GetDirectoryName(dlg.FileName)
                ?? _settings.LastExportDirectory;
            SetStatus($"{typeName} 내보내기 완료: {dlg.FileName}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"{typeName} 내보내기 실패:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"{typeName} 내보내기 실패.");
        }
    }

    // ─── 편집 ─────────────────────────────────────────────────────────────

    private void menuEditCopy_Click(object? sender, EventArgs e)
    {
        if (richTextBoxOutput.SelectionLength > 0)
            richTextBoxOutput.Copy();
        else
        {
            Clipboard.SetText(richTextBoxOutput.Text);
            SetStatus("클립보드에 복사 완료.");
        }
    }

    private void menuEditSelectAll_Click(object? sender, EventArgs e)
        => richTextBoxOutput.SelectAll();

    private void menuEditToggleEdit_Click(object? sender, EventArgs e)
        => SetEditMode(!_editMode);

    private void SetEditMode(bool editMode)
    {
        _editMode = editMode;
        richTextBoxOutput.ReadOnly = !_editMode;
        richTextBoxOutput.BackColor = _editMode ? Color.FromArgb(18, 18, 28) : Color.Black;
        richTextBoxOutput.Cursor = _editMode ? Cursors.IBeam : Cursors.SizeAll;
        menuEditToggleEdit.Text = _editMode ? "편집 모드 끄기(&M)" : "편집 모드 켜기(&M)";
        btnToggleEdit.Text = _editMode ? "편집 중" : "편집 모드";
        statusEditMode.Text = _editMode ? "편집 가능" : "읽기 전용";
        statusEditMode.ForeColor = _editMode ? Color.LightGreen : Color.Gray;
    }

    // ─── 설정 리셋 ────────────────────────────────────────────────────────

    private void btnResetSettings_Click(object? sender, EventArgs e)
    {
        var result = MessageBox.Show(
            "모든 변환 설정을 기본값으로 복원하시겠습니까?",
            "설정 복원",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);

        if (result == DialogResult.Yes)
            ApplyDefaultSettings();
    }

    // ─── 보기 (Zoom) ──────────────────────────────────────────────────────

    private void btnZoomIn_Click(object? sender, EventArgs e)
    {
        if (_currentFontSize < 24f)
        {
            _currentFontSize = Math.Min(24f, _currentFontSize + 0.5f);
            UpdateOutputFont();
            CenterRichTextBox();
        }
    }

    private void btnZoomOut_Click(object? sender, EventArgs e)
    {
        if (_currentFontSize > 0.5f)
        {
            _currentFontSize = Math.Max(0.5f, _currentFontSize - 0.5f);
            UpdateOutputFont();
            CenterRichTextBox();
        }
    }

    private void btnZoomReset_Click(object? sender, EventArgs e)
    {
        _currentFontSize = (float)numFontSize.Value;
        UpdateOutputFont();
        CenterRichTextBox();
    }

    // ─── 드래그 앤 드롭 ───────────────────────────────────────────────────

    private void pictureBoxOriginal_DragEnter(object? sender, DragEventArgs e)
    {
        e.Effect = e.Data?.GetDataPresent(DataFormats.FileDrop) == true
            ? DragDropEffects.Copy : DragDropEffects.None;
    }

    private void pictureBoxOriginal_DragDrop(object? sender, DragEventArgs e)
    {
        if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            LoadImageFile(files[0]);
    }

    // ─── 이벤트 핸들러 ────────────────────────────────────────────────────

    private void rbCharCustom_CheckedChanged(object? sender, EventArgs e)
        => txtCustomChars.Enabled = rbCharCustom.Checked;

    private void chkAutoHeight_CheckedChanged(object? sender, EventArgs e)
        => numHeight.Enabled = !chkAutoHeight.Checked;

    private void numFontSize_ValueChanged(object? sender, EventArgs e)
    {
        _currentFontSize = (float)numFontSize.Value;
        if (cmbFontName.SelectedItem is string name)
            _currentFontName = name;
        UpdateOutputFont();
    }

    private void trkContrast_Scroll(object? sender, EventArgs e)
        => lblContrast.Text = $"대비:\n{trkContrast.Value:+#;-#;0}";

    private void trkBrightness_Scroll(object? sender, EventArgs e)
        => lblBrightness.Text = $"밝기:\n{trkBrightness.Value:+#;-#;0}";

    private void Image2TextForm_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F5)
        { btnConvertMain_Click(null, EventArgs.Empty); e.Handled = true; }
        else if (e.KeyCode == Keys.F6)
        { btnRedraw_Click(null, EventArgs.Empty); e.Handled = true; }
        else if (e.KeyCode == Keys.F2)
        { SetEditMode(!_editMode); e.Handled = true; }
        else if (e.Control && e.KeyCode == Keys.Oemplus)
        { btnZoomIn_Click(null, EventArgs.Empty); e.Handled = true; }
        else if (e.Control && e.KeyCode == Keys.OemMinus)
        { btnZoomOut_Click(null, EventArgs.Empty); e.Handled = true; }
        else if (e.Control && e.KeyCode == Keys.D0)
        { btnZoomReset_Click(null, EventArgs.Empty); e.Handled = true; }
    }

    private void menuFileExit_Click(object? sender, EventArgs e) => Close();

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        SaveCurrentSettings();
        AppIcons.DisposeAll();
        base.OnFormClosing(e);
    }

    // ─── 유틸리티 ─────────────────────────────────────────────────────────

    private void SetStatus(string message) => statusLabel.Text = message;

    private void SetControlsEnabled(bool enabled)
    {
        btnConvertMain.Enabled = enabled;
        btnConvertToolbar.Enabled = enabled;
        btnRedraw.Enabled = enabled;
        panelSettings.Enabled = enabled;
    }
}

// RichTextBox MouseDown에서 e.Handled 확장 메서드
internal static class MouseEventArgsExtensions
{
    internal static void Handled(this MouseEventArgs e, RichTextBox rtb)
    {
        // RichTextBox는 e.Handled가 없으므로 커서만 변경
    }
}

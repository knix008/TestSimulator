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
        SetupCharSetHandlers();
    }

    private void SetupCharSetHandlers()
    {
        rbCharDetailed.CheckedChanged += CharSet_CheckedChanged;
        rbCharStandard.CheckedChanged += CharSet_CheckedChanged;
        rbCharSimple.CheckedChanged += CharSet_CheckedChanged;
        rbCharBlock.CheckedChanged += CharSet_CheckedChanged;
        rbCharCustom.CheckedChanged += CharSet_CheckedChanged;
        chkColorOutput.CheckedChanged += ColorOutput_CheckedChanged;
    }

    private void ColorOutput_CheckedChanged(object? sender, EventArgs e)
    {
        RefreshAutoAspectRatio();
    }

    private void CharSet_CheckedChanged(object? sender, EventArgs e)
    {
        if (sender is not RadioButton rb || !rb.Checked) return;
        UpdateAspectRatioLimits();
        RefreshAutoAspectRatio();
        if (richTextBoxOutput.TextLength > 0)
            CenterRichTextBox();
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
            // 2순위: Assets/ 하위 또는 실행 폴더의 .ico 파일
            string[] candidates = {
                Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"),
                Path.Combine(AppContext.BaseDirectory, "AppIcon.ico")
            };
            foreach (var p in candidates)
            {
                if (File.Exists(p)) { Icon = new Icon(p); return; }
            }
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
        SelectFontComboBox();
    }

    // ─── 설정 적용/저장 ───────────────────────────────────────────────────

    private void ApplySettings()
    {
        numWidth.Value = Math.Clamp(_settings.OutputWidth, (int)numWidth.Minimum, (int)numWidth.Maximum);
        numHeight.Value = Math.Clamp(_settings.OutputHeight, (int)numHeight.Minimum, (int)numHeight.Maximum);
        chkAutoHeight.Checked = _settings.AutoHeight;
        numHeight.Enabled = !_settings.AutoHeight;
        chkKeepAspectRatio.Checked = _settings.KeepAspectRatio;
        numAspectRatio.Enabled = !_settings.KeepAspectRatio;

        ApplyCharSetFromSettings(_settings.CharSet);
        txtCustomChars.Text = _settings.CustomChars;
        txtCustomChars.Enabled = rbCharCustom.Checked;

        _currentFontSize = _settings.FontSize;
        numFontSize.Value = (decimal)Math.Clamp(_settings.FontSize,
            (double)numFontSize.Minimum, (double)numFontSize.Maximum);
        _currentFontName = _settings.FontName;
        SelectFontComboBox();

        UpdateOutputFont();
        UpdateAspectRatioLimits();
        if (!_settings.KeepAspectRatio)
            numAspectRatio.Value = (decimal)Math.Clamp((double)_settings.AspectRatio,
                (double)numAspectRatio.Minimum, (double)numAspectRatio.Maximum);

        chkAutoWidth.Checked = _settings.AutoWidth;
        numOutputScale.Value = Math.Clamp(_settings.OutputScale, (int)numOutputScale.Minimum, (int)numOutputScale.Maximum);
        numWidth.Enabled = !_settings.AutoWidth;

        chkColorOutput.Checked = _settings.ColorOutput;
        chkInvert.Checked = _settings.InvertBrightness;
        chkEdgeDetect.Checked = _settings.EdgeDetect;

        int contrast = Math.Clamp(_settings.Contrast, trkContrast.Minimum, trkContrast.Maximum);
        trkContrast.Value = contrast;
        numContrastValue.Value = contrast;

        int brightness = Math.Clamp(_settings.Brightness, trkBrightness.Minimum, trkBrightness.Maximum);
        trkBrightness.Value = brightness;
        numBrightnessValue.Value = brightness;

        _charSetCycleIndex = Array.IndexOf(CharSetCycle, GetSelectedCharSet());
        if (_charSetCycleIndex < 0) _charSetCycleIndex = 0;

        if (chkKeepAspectRatio.Checked)
            RefreshAutoAspectRatio();
    }

    private void ApplyCharSetFromSettings(string charSet)
    {
        switch (charSet)
        {
            case "Detailed": rbCharDetailed.Checked = true; break;
            case "Standard": rbCharStandard.Checked = true; break;
            case "Block":    rbCharBlock.Checked = true; break;
            case "Simple":   rbCharSimple.Checked = true; break;
            case "Custom":   rbCharCustom.Checked = true; break;
            default:         rbCharSimple.Checked = true; break;
        }
    }

    private void SelectFontComboBox()
    {
        if (cmbFontName.Items.Count == 0) return;

        int idx = cmbFontName.Items.IndexOf(_settings.FontName);
        if (idx >= 0)
        {
            cmbFontName.SelectedIndex = idx;
            _currentFontName = _settings.FontName;
        }
        else if (cmbFontName.SelectedItem is string sel)
        {
            _currentFontName = sel;
        }
    }

    private void ApplyDefaultSettings()
    {
        var def = new AppSettings();
        _settings.OutputWidth = def.OutputWidth;
        _settings.OutputHeight = def.OutputHeight;
        _settings.AutoHeight = def.AutoHeight;
        _settings.AspectRatio = def.AspectRatio;
        _settings.KeepAspectRatio = def.KeepAspectRatio;
        _settings.AutoWidth = def.AutoWidth;
        _settings.OutputScale = def.OutputScale;
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
        _settings.AspectRatio = (float)numAspectRatio.Value;
        _settings.KeepAspectRatio = chkKeepAspectRatio.Checked;
        _settings.AutoWidth = chkAutoWidth.Checked;
        _settings.OutputScale = (int)numOutputScale.Value;
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
        return "Simple";
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

    private static readonly Color BtnConvertNormal = Color.FromArgb(60, 180, 60);
    private static readonly Color BtnConvertBusy   = Color.FromArgb(200, 50, 50);

    private async void btnConvertMain_Click(object? sender, EventArgs e)
    {
        if (_sourceBitmap == null)
        {
            MessageBox.Show("먼저 이미지를 열어주세요.", "알림",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        UpdateAspectRatioLimits();
        if (chkKeepAspectRatio.Checked)
            RefreshAutoAspectRatio();

        var options = BuildOptions();
        SetControlsEnabled(false);
        btnConvertMain.BackColor = BtnConvertBusy;
        btnConvertMain.Text = "멈춤\r\n처리중";
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

            _charSetCycleIndex = Array.IndexOf(CharSetCycle, options.CharSet);
            if (_charSetCycleIndex < 0) _charSetCycleIndex = 0;

            ApplyResultToOutput(result);
            statusOutputInfo.Text = $"출력: {result.Rows}행 × {result.Cols}열";
            string doneMsg = $"변환 완료  |  {result.Rows}행 × {result.Cols}열  |  {GetCharSetDisplayName(options.CharSet)}";
            SetStatus(doneMsg);

            MessageBox.Show(
                $"변환이 완료되었습니다.\n\n{result.Rows}행 × {result.Cols}열\n문자 집합: {GetCharSetDisplayName(options.CharSet)}",
                "변환 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ShowError("변환 오류", $"변환 중 오류가 발생했습니다:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
            SetStatus("변환 실패.");
        }
        finally
        {
            statusProgressBar.Visible = false;
            statusProgressBar.Value = 0;
            btnConvertMain.BackColor = BtnConvertNormal;
            btnConvertMain.Text = "변환\r\n(F5)";
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

        string charSet = "Simple";
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
        ApplyCharSetFromSettings(charSet);
        RefreshAutoAspectRatio();
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
            // Split on \r\n or \n to avoid stray \r being appended as blank lines in RichTextBox
            var lines = result.Text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
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

        var lines = richTextBoxOutput.Text.Split('\n');
        for (int i = 0; i < lines.Length; i++)
            lines[i] = lines[i].TrimEnd('\r');

        var (textW, textH) = MeasureOutputBounds(lines);

        richTextBoxOutput.Size = new Size(textW, textH);

        int canvasW = pnlOutputCanvas.ClientSize.Width;
        int canvasH = pnlOutputCanvas.ClientSize.Height;

        bool fitsH = textW <= canvasW;
        bool fitsV = textH <= canvasH;

        int x = fitsH ? (canvasW - textW) / 2 : 0;
        int y = fitsV ? (canvasH - textH) / 2 : 0;

        richTextBoxOutput.Location = new Point(x, y);

        pnlOutputCanvas.AutoScrollMinSize = new Size(
            fitsH ? 0 : textW,
            fitsV ? 0 : textH);

        if (fitsH && fitsV)
        {
            // 화면보다 작으면 항상 정중앙 정렬
            pnlOutputCanvas.AutoScrollPosition = new Point(0, 0);
        }
        else
        {
            pnlOutputCanvas.PerformLayout();

            // 넘치는 축: 스크롤 바로 이동한 위치 유지(범위만 보정)
            // 맞는 축: Location으로 중앙 정렬되므로 스크롤은 0
            if (fitsH)
                pnlOutputCanvas.HorizontalScroll.Value = 0;
            else if (pnlOutputCanvas.HorizontalScroll.Maximum > 0)
                pnlOutputCanvas.HorizontalScroll.Value = Math.Min(
                    pnlOutputCanvas.HorizontalScroll.Value,
                    pnlOutputCanvas.HorizontalScroll.Maximum);

            if (fitsV)
                pnlOutputCanvas.VerticalScroll.Value = 0;
            else if (pnlOutputCanvas.VerticalScroll.Maximum > 0)
                pnlOutputCanvas.VerticalScroll.Value = Math.Min(
                    pnlOutputCanvas.VerticalScroll.Value,
                    pnlOutputCanvas.VerticalScroll.Maximum);

            pnlOutputCanvas.PerformLayout();
        }
    }

    private static readonly Size TextMeasureArea = new(int.MaxValue / 4, int.MaxValue / 4);
    private const TextFormatFlags TextMeasureFlags =
        TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
    private const int BlockMeasureCount = 10;

    private static double GetAspectRatioMax(string charSet) => charSet == "Block" ? 2.50 : 1.00;

    private void UpdateAspectRatioLimits()
    {
        decimal max = (decimal)GetAspectRatioMax(GetSelectedCharSet());
        numAspectRatio.Maximum = max;
        if (numAspectRatio.Value > max)
            numAspectRatio.Value = max;
    }

    private (float cellW, float cellH) MeasureCellSize()
    {
        var font = richTextBoxOutput.Font;
        var sz = TextRenderer.MeasureText("W", font, TextMeasureArea, TextMeasureFlags);
        float cellW = Math.Max(1f, sz.Width);
        float cellH = Math.Max(1f, sz.Height);
        return (cellW, cellH);
    }

    private float GetBlockCharAdvance()
    {
        var (cellW, _) = MeasureCellSize();
        string sample = new string('█', BlockMeasureCount);
        var sz = TextRenderer.MeasureText(sample, richTextBoxOutput.Font, TextMeasureArea, TextMeasureFlags);
        return Math.Max(cellW, sz.Width / (float)BlockMeasureCount);
    }

    private float GetCharAdvanceWidth()
    {
        return GetSelectedCharSet() == "Block" ? GetBlockCharAdvance() : MeasureCellSize().cellW;
    }

    private (float charW, float charH) MeasureCharSize()
    {
        return MeasureRichTextAspectMetrics(chkColorOutput.Checked);
    }

    private char GetAspectSampleChar() => GetSelectedCharSet() switch
    {
        "Block" => '█',
        _ => 'W'
    };

    private void PopulateAspectSampleText(char sampleChar, int charsPerLine, bool colorOutput)
    {
        richTextBoxOutput.Clear();
        if (colorOutput)
        {
            AppendAspectSampleLine(sampleChar, charsPerLine, 0);
            richTextBoxOutput.SelectionColor = Color.White;
            richTextBoxOutput.AppendText("\n");
            AppendAspectSampleLine(sampleChar, charsPerLine, charsPerLine);
        }
        else
        {
            string line = new string(sampleChar, charsPerLine);
            richTextBoxOutput.ForeColor = Color.White;
            richTextBoxOutput.Text = line + "\n" + line;
        }
    }

    private void AppendAspectSampleLine(char ch, int count, int colorSeed)
    {
        for (int i = 0; i < count; i++)
        {
            richTextBoxOutput.SelectionStart = richTextBoxOutput.TextLength;
            richTextBoxOutput.SelectionLength = 0;
            richTextBoxOutput.SelectionColor = ((colorSeed + i) % 2 == 0)
                ? Color.White
                : Color.FromArgb(180, 180, 180);
            richTextBoxOutput.AppendText(ch.ToString());
        }
    }

    private (float advanceW, float lineH) MeasureRichTextAspectMetrics(bool colorOutput)
    {
        var (cellW, cellH) = MeasureCellSize();
        char sampleChar = GetAspectSampleChar();
        const int charsPerLine = 10;

        string savedText = richTextBoxOutput.Text;
        var savedSize = richTextBoxOutput.Size;
        Color savedFg = richTextBoxOutput.ForeColor;

        try
        {
            richTextBoxOutput.Size = new Size(32767, 256);
            PopulateAspectSampleText(sampleChar, charsPerLine, colorOutput);

            float fallbackAdvance = sampleChar == '█' ? GetBlockCharAdvance() : cellW;
            float advance = MeasureAdvanceFromRichText(charsPerLine, fallbackAdvance);
            float lineH = MeasureLineHeightFromRichText(charsPerLine + 1, cellH);
            return (advance, lineH);
        }
        finally
        {
            richTextBoxOutput.Text = savedText;
            richTextBoxOutput.ForeColor = savedFg;
            richTextBoxOutput.Size = savedSize;
        }
    }

    private float MeasureAdvanceFromRichText(int charCount, float fallback)
    {
        Point p0 = richTextBoxOutput.GetPositionFromCharIndex(0);
        Point p1 = richTextBoxOutput.GetPositionFromCharIndex(1);
        if (p0.X >= 0 && p1.X > p0.X)
            return p1.X - p0.X;

        float sum = 0;
        int count = 0;
        for (int i = 0; i < charCount - 1; i++)
        {
            Point a = richTextBoxOutput.GetPositionFromCharIndex(i);
            Point b = richTextBoxOutput.GetPositionFromCharIndex(i + 1);
            if (a.X >= 0 && b.X > a.X)
            {
                sum += b.X - a.X;
                count++;
            }
        }

        return count > 0 ? sum / count : fallback;
    }

    private float MeasureLineHeightFromRichText(int secondLineStart, float fallback)
    {
        Point p0 = richTextBoxOutput.GetPositionFromCharIndex(0);
        Point p1 = richTextBoxOutput.GetPositionFromCharIndex(secondLineStart);
        if (p0.Y >= 0 && p1.Y > p0.Y)
            return p1.Y - p0.Y;
        return fallback;
    }

    private (int textW, int textH) MeasureOutputBounds(string[] lines)
    {
        var (cellW, cellH) = MeasureCellSize();
        int textH = (int)Math.Ceiling(cellH * Math.Max(1, lines.Length)) + 4;

        int layoutW = MeasureRichTextBoxLayoutWidth(lines, textH);
        int rendererW = MeasureLinesWidthWithTextRenderer(lines);

        int textW = Math.Max(layoutW, rendererW);

        if (GetSelectedCharSet() == "Block")
        {
            int maxCols = lines.Length > 0 ? lines.Max(l => l.Length) : 0;
            if (maxCols > 0)
            {
                int colsW = (int)Math.Ceiling(GetBlockCharAdvance() * maxCols);
                textW = Math.Max(textW, colsW);
            }
            textW += (int)Math.Ceiling(cellW) + 4;
        }
        else
        {
            textW += 8;
        }

        return (textW, textH);
    }

    private int MeasureLinesWidthWithTextRenderer(string[] lines)
    {
        var font = richTextBoxOutput.Font;
        int maxW = 0;
        foreach (var line in lines)
        {
            if (line.Length == 0) continue;
            var sz = TextRenderer.MeasureText(line, font, TextMeasureArea, TextMeasureFlags);
            maxW = Math.Max(maxW, sz.Width);
        }
        return maxW;
    }

    private int MeasureRichTextBoxLayoutWidth(string[] lines, int tempHeight)
    {
        if (richTextBoxOutput.TextLength == 0 || lines.Length == 0)
            return 0;

        richTextBoxOutput.Size = new Size(32767, Math.Max(tempHeight, richTextBoxOutput.Height));

        string text = richTextBoxOutput.Text;
        float advance = GetCharAdvanceWidth();
        int maxRight = 0;
        int textIndex = 0;

        for (int row = 0; row < lines.Length; row++)
        {
            string line = lines[row];
            if (line.Length > 0 && textIndex < text.Length)
            {
                int lastIdx = Math.Min(textIndex + line.Length - 1, text.Length - 1);
                Point lastPos = richTextBoxOutput.GetPositionFromCharIndex(lastIdx);
                if (lastPos.X >= 0)
                {
                    int right = lastPos.X + (int)Math.Ceiling(advance);
                    if (lastIdx + 1 < text.Length && text[lastIdx + 1] is not '\n' and not '\r')
                    {
                        Point nextPos = richTextBoxOutput.GetPositionFromCharIndex(lastIdx + 1);
                        if (nextPos.Y == lastPos.Y && nextPos.X > lastPos.X)
                            right = nextPos.X;
                    }
                    maxRight = Math.Max(maxRight, right);
                }
            }

            textIndex += line.Length;
            while (textIndex < text.Length && text[textIndex] == '\r')
                textIndex++;
            if (textIndex < text.Length && text[textIndex] == '\n')
                textIndex++;
        }

        return maxRight;
    }

    private double ComputeAspectRatio()
    {
        var (charW, charH) = MeasureCharSize();
        return Math.Clamp(charW / charH, 0.10, GetAspectRatioMax(GetSelectedCharSet()));
    }

    private int ComputeAutoWidth()
    {
        if (_sourceBitmap == null) return (int)numWidth.Value;
        // 변환 열 수는 모노스페이스 셀 기준(문자 1개 = 샘플 1열). 블록 글리프 폭으로 나누면 열이 줄어듦.
        var (cellW, _) = MeasureCellSize();
        int w = (int)(_sourceBitmap.Width * (float)numOutputScale.Value / 100.0f / cellW);
        return Math.Clamp(w, (int)numWidth.Minimum, (int)numWidth.Maximum);
    }

    private ConversionOptions BuildOptions()
    {
        double aspectRatio = chkKeepAspectRatio.Checked
            ? ComputeAspectRatio()
            : (double)numAspectRatio.Value;

        return new ConversionOptions
        {
            Width = chkAutoWidth.Checked ? ComputeAutoWidth() : (int)numWidth.Value,
            Height = (int)numHeight.Value,
            AutoHeight = chkAutoHeight.Checked,
            AspectRatio = aspectRatio,
            CharSet = GetSelectedCharSet(),
            CustomChars = txtCustomChars.Text,
            Invert = chkInvert.Checked,
            EdgeDetect = chkEdgeDetect.Checked,
            Contrast = (trkContrast.Value - 50) * 2,
            Brightness = (trkBrightness.Value - 50) * 2,
            ColorOutput = chkColorOutput.Checked
        };
    }

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
            MessageBox.Show(
                $"텍스트 파일이 저장되었습니다.\n\n저장 위치:\n{saveTextDialog.FileName}",
                "저장 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
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
            MessageBox.Show(
                $"이미지 파일이 저장되었습니다.\n\n저장 위치:\n{saveImageDialog.FileName}",
                "내보내기 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
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
            FileName = "Img2Txt_",
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
            MessageBox.Show(
                $"{typeName} 파일이 저장되었습니다.\n\n저장 위치:\n{dlg.FileName}",
                "내보내기 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"{typeName} 내보내기 실패:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"{typeName} 내보내기 실패.");
        }
    }

    // ─── 프리셋 저장/불러오기 ─────────────────────────────────────────────

    private void menuFileLoadPreset_Click(object? sender, EventArgs e)
    {
        openPresetDialog.InitialDirectory = _settings.LastTextDirectory;
        if (openPresetDialog.ShowDialog() != DialogResult.OK) return;

        try
        {
            _settings.LoadPreset(openPresetDialog.FileName);
            ApplySettings();
            PopulateMonospaceFonts();
            if (richTextBoxOutput.TextLength > 0)
                CenterRichTextBox();
            SetStatus($"프리셋 불러오기 완료: {Path.GetFileName(openPresetDialog.FileName)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"프리셋 파일을 불러올 수 없습니다:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void menuFileSavePreset_Click(object? sender, EventArgs e)
    {
        SaveCurrentSettings();
        savePresetDialog.InitialDirectory = _settings.LastTextDirectory;
        if (savePresetDialog.ShowDialog() != DialogResult.OK) return;

        try
        {
            _settings.SavePreset(savePresetDialog.FileName);
            string savedPath = savePresetDialog.FileName;
            SetStatus($"프리셋 저장 완료: {savedPath}");
            MessageBox.Show(
                $"설정이 저장되었습니다.\n\n저장 위치:\n{savedPath}",
                "프리셋 저장 완료",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"프리셋 저장 실패:\n{ex.Message}", "오류",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
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

    private void chkAutoWidth_CheckedChanged(object? sender, EventArgs e)
        => numWidth.Enabled = !chkAutoWidth.Checked;

    private void chkKeepAspectRatio_CheckedChanged(object? sender, EventArgs e)
    {
        numAspectRatio.Enabled = !chkKeepAspectRatio.Checked;
        UpdateAspectRatioLimits();
        if (chkKeepAspectRatio.Checked)
            RefreshAutoAspectRatio();
    }

    private void RefreshAutoAspectRatio()
    {
        if (!chkKeepAspectRatio.Checked) return;
        UpdateAspectRatioLimits();
        double ar = ComputeAspectRatio();
        numAspectRatio.Value = (decimal)Math.Round(ar, 2);
    }

    private void numFontSize_ValueChanged(object? sender, EventArgs e)
    {
        _currentFontSize = (float)numFontSize.Value;
        if (cmbFontName.SelectedItem is string name)
            _currentFontName = name;
        UpdateOutputFont();
        RefreshAutoAspectRatio();
    }

    private bool _syncingContrast = false;
    private bool _syncingBrightness = false;

    private void trkContrast_Scroll(object? sender, EventArgs e)
    {
        if (_syncingContrast) return;
        _syncingContrast = true;
        numContrastValue.Value = trkContrast.Value;
        _syncingContrast = false;
    }

    private void numContrastValue_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingContrast) return;
        _syncingContrast = true;
        trkContrast.Value = (int)numContrastValue.Value;
        _syncingContrast = false;
    }

    private void trkBrightness_Scroll(object? sender, EventArgs e)
    {
        if (_syncingBrightness) return;
        _syncingBrightness = true;
        numBrightnessValue.Value = trkBrightness.Value;
        _syncingBrightness = false;
    }

    private void numBrightnessValue_ValueChanged(object? sender, EventArgs e)
    {
        if (_syncingBrightness) return;
        _syncingBrightness = true;
        trkBrightness.Value = (int)numBrightnessValue.Value;
        _syncingBrightness = false;
    }

    private void pnlScale_Paint(object? sender, PaintEventArgs e)
    {
        if (sender is not Panel pnl) return;
        using var font = new Font("맑은 고딕", 6.5f);
        using var brush = new SolidBrush(Color.FromArgb(130, 130, 130));
        int w = pnl.Width;
        string[] labels = { "0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100" };
        for (int i = 0; i < labels.Length; i++)
        {
            float ratio = i / 10.0f;
            float x = ratio * (w - 1);
            var sz = e.Graphics.MeasureString(labels[i], font);
            float drawX = Math.Clamp(x - sz.Width / 2f, 0f, w - sz.Width);
            e.Graphics.DrawString(labels[i], font, brush, drawX, 0f);
        }
    }

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

    private static void ShowError(string title, string message)
    {
        using var form = new Form
        {
            Text = title,
            Size = new Size(540, 300),
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false, MinimizeBox = false
        };
        var txtError = new TextBox
        {
            Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
            Dock = DockStyle.Fill, Text = message, Font = new Font("Consolas", 9f),
            BackColor = SystemColors.Window
        };
        var pnlBtn = new Panel { Dock = DockStyle.Bottom, Height = 36 };
        var btnCopy = new Button { Text = "오류 내용 복사", Location = new Point(6, 6), Size = new Size(120, 24) };
        var btnOk   = new Button { Text = "확인", Location = new Point(132, 6), Size = new Size(80, 24), DialogResult = DialogResult.OK };
        btnCopy.Click += (_, _) => { Clipboard.SetText(message); btnCopy.Text = "복사됨!"; };
        pnlBtn.Controls.Add(btnCopy);
        pnlBtn.Controls.Add(btnOk);
        form.Controls.Add(txtError);
        form.Controls.Add(pnlBtn);
        form.AcceptButton = btnOk;
        form.ShowDialog();
    }

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

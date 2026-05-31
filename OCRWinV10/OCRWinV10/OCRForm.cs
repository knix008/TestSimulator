using System.Drawing.Drawing2D;
using System.Text;

namespace OCRWinV10;

public partial class OCRForm : Form
{
    private readonly WindowsOcrEngine _ocrEngine = new();
    private readonly ImagePreprocessor _preprocessor = new();
    private AppSettings _settings;

    private readonly List<Bitmap> _pages = [];
    private int _currentPage = 0;
    private CancellationTokenSource? _cts;
    private string? _currentFilePath;
    private PreprocessMode _preprocessMode = PreprocessMode.Auto;

    public OCRForm()
    {
        _settings = SettingsManager.Load();
        InitializeComponent();
        InitializeOcr();
        tscbMode.SelectedIndex = Math.Clamp(_settings.PreprocessMode, 0, 2);
    }

    private void InitializeOcr()
    {
        if (_ocrEngine.Initialize("ko") || _ocrEngine.Initialize("ko-KR"))
        {
            tslLang.Text = "언어: 한국어 (Windows OCR)";
        }
        else if (_ocrEngine.Initialize("en"))
        {
            tslLang.Text = "언어: 영어 (한국어 미설치)";
            SetStatus("한국어 OCR을 사용하려면 Windows 설정 > 언어에서 한국어를 추가하세요.");
        }
        else
        {
            tslLang.Text = "언어: 사용 불가";
            MessageBox.Show(
                "사용 가능한 OCR 언어가 없습니다.\n\n" +
                "Windows 설정 > 시간 및 언어 > 언어 및 지역에서\n" +
                "한국어를 추가한 후 프로그램을 다시 시작하세요.",
                "OCR 언어 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    // ── 파일 열기 ───────────────────────────────────────────────────────────

    private async void tsbOpen_Click(object sender, EventArgs e) => await OpenFileAsync();
    private async void tsmiOpen_Click(object sender, EventArgs e) => await OpenFileAsync();

    private async Task OpenFileAsync()
    {
        using var dlg = new OpenFileDialog
        {
            Title = "파일 열기",
            Filter = "지원 파일|*.jpg;*.jpeg;*.png;*.bmp;*.tiff;*.tif;*.gif;*.webp;*.pdf|" +
                     "이미지 파일|*.jpg;*.jpeg;*.png;*.bmp;*.tiff;*.tif;*.gif;*.webp|" +
                     "PDF 파일|*.pdf|" +
                     "모든 파일|*.*",
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
            else
            {
                _pages.Add(new Bitmap(filePath));
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
    }

    private void ClearPages()
    {
        foreach (var p in _pages) p.Dispose();
        _pages.Clear();
        SetOriginalImage(null);
        SetBoxesImage(null);
        richTextBoxResult.Clear();
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

    private async Task RunOcrAsync()
    {
        if (_pages.Count == 0) return;

        _cts = new CancellationTokenSource();
        SetOcrInProgress(true);
        richTextBoxResult.Clear();
        SetBoxesImage(null);

        try
        {
            var original = _pages[_currentPage];

            Bitmap ocrInput;
            if (_preprocessMode == PreprocessMode.None)
            {
                ocrInput = new Bitmap(original);
                SetStatus("OCR 인식 중...");
            }
            else
            {
                SetStatus("이미지 전처리 중...");
                ocrInput = await Task.Run(() => _preprocessor.Process(original, _preprocessMode), _cts.Token);
                SetStatus("OCR 인식 중...");
            }

            double sx = (double)original.Width / ocrInput.Width;
            double sy = (double)original.Height / ocrInput.Height;

            var result = await _ocrEngine.RecognizeAsync(ocrInput, _cts.Token);
            ocrInput.Dispose();

            richTextBoxResult.Text = result.Text;

            var boxImage = DrawBoundingBoxes(original, result, sx, sy);
            SetBoxesImage(boxImage);

            int wordCount = result.Lines.Sum(l => l.Words.Count);
            SetStatus($"OCR 완료  —  {result.Lines.Count}줄, {wordCount}단어, {result.Text.Length}자");
        }
        catch (OperationCanceledException)
        {
            SetStatus("OCR 취소됨");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"OCR 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("OCR 실패");
        }
        finally
        {
            SetOcrInProgress(false);
            _cts?.Dispose();
            _cts = null;
        }
    }

    private static Bitmap DrawBoundingBoxes(Bitmap original, OcrResult result, double sx, double sy)
    {
        var boxImage = new Bitmap(original);
        using var g = Graphics.FromImage(boxImage);
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using var fillBrush = new SolidBrush(Color.FromArgb(50, 255, 100, 0));
        using var wordPen = new Pen(Color.OrangeRed, 1.5f);
        using var linePen = new Pen(Color.Red, 2f);

        foreach (var line in result.Lines)
        {
            foreach (var word in line.Words)
            {
                var r = new RectangleF(
                    (float)(word.BoundingRect.X * sx),
                    (float)(word.BoundingRect.Y * sy),
                    (float)(word.BoundingRect.Width * sx),
                    (float)(word.BoundingRect.Height * sy));

                g.FillRectangle(fillBrush, r);
                g.DrawRectangle(wordPen, r.X, r.Y, r.Width, r.Height);
            }
        }

        return boxImage;
    }

    private void tsbCancel_Click(object sender, EventArgs e) => _cts?.Cancel();

    // ── 결과 조작 ───────────────────────────────────────────────────────────

    private void tsbCopy_Click(object sender, EventArgs e)
    {
        if (!string.IsNullOrEmpty(richTextBoxResult.Text))
        {
            Clipboard.SetText(richTextBoxResult.Text);
            SetStatus("클립보드에 복사됨");
        }
    }

    private async void tsbSave_Click(object sender, EventArgs e) => await SaveResultAsync();
    private async void tsmiSaveResult_Click(object sender, EventArgs e) => await SaveResultAsync();

    private async Task SaveResultAsync()
    {
        if (string.IsNullOrEmpty(richTextBoxResult.Text)) return;

        var defaultName = _currentFilePath != null
            ? Path.GetFileNameWithoutExtension(_currentFilePath) + "_ocr.txt"
            : "ocr_result.txt";

        using var dlg = new SaveFileDialog
        {
            Title = "OCR 결과 저장",
            Filter = "텍스트 파일 (UTF-8)|*.txt|모든 파일|*.*",
            FileName = defaultName,
            InitialDirectory = Directory.Exists(_settings.LastDirectory) ? _settings.LastDirectory : ""
        };

        if (dlg.ShowDialog() != DialogResult.OK) return;

        try
        {
            await File.WriteAllTextAsync(dlg.FileName, richTextBoxResult.Text, Encoding.UTF8);
            SetStatus($"저장 완료: {Path.GetFileName(dlg.FileName)}");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"저장 오류:\n{ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void tsbClear_Click(object sender, EventArgs e)
    {
        richTextBoxResult.Clear();
        SetBoxesImage(null);
        SetStatus("지워짐");
    }

    // ── 전처리 모드 ─────────────────────────────────────────────────────────

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
        SettingsManager.Save(_settings);
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
        var langs = WindowsOcrEngine.GetAvailableLanguageTags();
        var langList = string.Join(", ", langs);

        MessageBox.Show(
            "한국어 OCR v1.0\n\n" +
            "엔진: Windows 내장 AI OCR (오프라인)\n" +
            "전처리: OpenCV (노이즈 제거, 이진화, 기울기 보정)\n\n" +
            "전처리 모드:\n" +
            "  • 자동: 일반 인쇄물 최적화\n" +
            "  • 손글씨: 손글씨 인식 강화 (대비 향상, 획 보정)\n" +
            "  • 없음: 원본 그대로 OCR\n\n" +
            $"설치된 언어: {langList}",
            "정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    // ── 유틸리티 ────────────────────────────────────────────────────────────

    private void SetBusy(bool busy, string? status = null)
    {
        tsbOpen.Enabled = !busy;
        tspProgress.Visible = busy;
        if (status != null) SetStatus(status);
    }

    private void SetOcrInProgress(bool inProgress)
    {
        tsbOpen.Enabled = !inProgress;
        tsbOcr.Enabled = !inProgress && _pages.Count > 0;
        tsbCancel.Enabled = inProgress;
        tsbCancel.Visible = inProgress;
        tspProgress.Visible = inProgress;
    }

    private void SetStatus(string message) => tslStatus.Text = message;

    // ── 종료 처리 ───────────────────────────────────────────────────────────

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _settings.PreprocessMode = tscbMode.SelectedIndex;
        SettingsManager.Save(_settings);

        foreach (var page in _pages) page.Dispose();
        pictureOriginal.Image?.Dispose();
        pictureBoxes.Image?.Dispose();

        base.OnFormClosing(e);
    }
}

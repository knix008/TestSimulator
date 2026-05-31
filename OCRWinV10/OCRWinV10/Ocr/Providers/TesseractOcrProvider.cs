using OCRWinV10;
using Tesseract;
using Pix = Tesseract.Pix;

namespace OCRWinV10.Ocr.Providers;

public sealed class TesseractOcrProvider : IOcrProvider, IDisposable
{
    private const string TessdataKorUrl =
        "https://github.com/tesseract-ocr/tessdata_best/raw/main/kor.traineddata";
    private const string TessdataEngUrl =
        "https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata";
    private static string EngineDir => Path.Combine(EngineDownloadHelper.EnginesRoot, "tesseract");
    private static string TessdataDir => Path.Combine(EngineDir, "tessdata");

    private TesseractEngine? _engine;

    private static readonly PageSegMode[] RecognitionSegModes =
    [
        PageSegMode.Auto,
        PageSegMode.SingleBlock,
        PageSegMode.SparseText
    ];

    public string Id => OcrProviderIds.Tesseract;
    public string DisplayName => "Tesseract (한·영)";
    public string Description => "tessdata_best kor+eng · LSTM·300DPI·다중 레이아웃 인식 (자동 다운로드)";

    public bool IsInstalled =>
        File.Exists(Path.Combine(GetTessdataDir(), "kor.traineddata"));

    public async Task<bool> EnsureInstalledAsync(IProgress<InstallProgressReport>? progress, CancellationToken cancellationToken)
    {
        if (IsInstalled && TryCreateEngine())
        {
            progress?.Report(InstallProgressReport.Determinate("Tesseract 준비 완료", 100));
            return true;
        }

        progress?.Report(InstallProgressReport.Indeterminate("Tesseract 한국어·영어 데이터 다운로드 준비..."));
        await EnsureTessdataAsync(progress, cancellationToken);

        if (!File.Exists(Path.Combine(GetTessdataDir(), "kor.traineddata")))
        {
            progress?.Report(InstallProgressReport.Indeterminate("한국어 학습 데이터 설치 실패"));
            return false;
        }

        progress?.Report(InstallProgressReport.Determinate("Tesseract 준비 완료", 100));
        return TryCreateEngine();
    }

    public Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (_engine == null && !TryCreateEngine())
                throw new InvalidOperationException("Tesseract OCR이 준비되지 않았습니다.");

            using var ms = new MemoryStream();
            bitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            using var pix = Pix.LoadFromMemory(ms.ToArray());
            pix.XRes = 300;
            pix.YRes = 300;

            var candidates = new List<OcrResult>(RecognitionSegModes.Length);
            foreach (var segMode in RecognitionSegModes)
            {
                cancellationToken.ThrowIfCancellationRequested();
                using var page = _engine!.Process(pix, segMode);
                candidates.Add(MapTesseractPage(page));
            }

            return OcrResultScorer.PickBest(candidates);
        }, cancellationToken);
    }

    private static OcrResult MapTesseractPage(Page page)
    {
        using var iter = page.GetIterator();
        iter.Begin();

        var words = new List<(string Text, RectangleF Bounds, float CenterY)>();

        do
        {
            if (!iter.TryGetBoundingBox(PageIteratorLevel.Word, out var rect))
                continue;

            var text = iter.GetText(PageIteratorLevel.Word)?.Trim();
            if (string.IsNullOrEmpty(text))
                continue;

            var bounds = new RectangleF(rect.X1, rect.Y1, rect.X2 - rect.X1, rect.Y2 - rect.Y1);
            words.Add((text, bounds, bounds.Top + bounds.Height / 2f));
        } while (iter.Next(PageIteratorLevel.Word));

        if (words.Count == 0)
            return new OcrResult(page.GetText()?.Trim() ?? "", []);

        const float lineMergeThreshold = 12f;
        var lines = new List<OcrLine>();
        var current = new List<OcrWord>();
        float? lineY = null;

        foreach (var w in words.OrderBy(x => x.CenterY).ThenBy(x => x.Bounds.Left))
        {
            if (lineY == null || Math.Abs(w.CenterY - lineY.Value) > lineMergeThreshold)
            {
                if (current.Count > 0)
                    lines.Add(new OcrLine(string.Join(" ", current.Select(c => c.Text)), current));

                current = [new OcrWord(w.Text, w.Bounds)];
                lineY = w.CenterY;
            }
            else
            {
                current.Add(new OcrWord(w.Text, w.Bounds));
            }
        }

        if (current.Count > 0)
            lines.Add(new OcrLine(string.Join(" ", current.Select(c => c.Text)), current));

        var fullText = string.Join(Environment.NewLine, lines.Select(l => l.Text));
        return new OcrResult(fullText, lines);
    }

    private bool TryCreateEngine()
    {
        try
        {
            _engine?.Dispose();
            _engine = new TesseractEngine(
                GetTessdataDir(),
                OcrLanguageProfile.TesseractLanguages,
                EngineMode.LstmOnly)
            {
                DefaultPageSegMode = PageSegMode.Auto
            };
            _engine.SetVariable("user_defined_dpi", "300");
            _engine.SetVariable("preserve_interword_spaces", "1");
            _engine.SetVariable("language_model_penalty_non_freq_dict_word", "0.8");
            _engine.SetVariable("language_model_penalty_non_dict_word", "0.8");
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string GetTessdataDir()
    {
        if (Directory.Exists(TessdataDir) && File.Exists(Path.Combine(TessdataDir, "kor.traineddata")))
            return TessdataDir;

        var systemTess = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Tesseract-OCR", "tessdata");
        if (Directory.Exists(systemTess)
            && File.Exists(Path.Combine(systemTess, "kor.traineddata")))
            return systemTess;

        return TessdataDir;
    }

    private static async Task EnsureTessdataAsync(
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(TessdataDir);

        var files = new[]
        {
            ("kor.traineddata", TessdataKorUrl),
            ("eng.traineddata", TessdataEngUrl)
        };

        for (int i = 0; i < files.Length; i++)
        {
            var (file, url) = files[i];
            var path = Path.Combine(TessdataDir, file);
            if (File.Exists(path) && new FileInfo(path).Length > 1000)
            {
                var skipPct = (i + 1) * 100 / files.Length;
                progress?.Report(InstallProgressReport.Determinate($"{file} (이미 있음)", skipPct));
                continue;
            }

            var basePct = i * 100 / files.Length;
            var span = 100 / files.Length;
            var fileProgress = new Progress<InstallProgressReport>(r =>
            {
                if (r.Percent is int p)
                    progress?.Report(InstallProgressReport.Determinate(
                        r.Message, basePct + p * span / 100));
                else
                    progress?.Report(InstallProgressReport.Indeterminate(r.Message));
            });

            await EngineDownloadHelper.DownloadFileAsync(url, path, fileProgress, cancellationToken);
        }

        var systemTess = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Tesseract-OCR", "tessdata");
        if (Directory.Exists(systemTess))
        {
            foreach (var file in new[] { "kor.traineddata", "eng.traineddata" })
            {
                var src = Path.Combine(systemTess, file);
                var dst = Path.Combine(TessdataDir, file);
                if (File.Exists(src) && (!File.Exists(dst) || new FileInfo(dst).Length < new FileInfo(src).Length))
                    File.Copy(src, dst, overwrite: true);
            }
        }
    }

    public void Dispose()
    {
        _engine?.Dispose();
        _engine = null;
    }
}

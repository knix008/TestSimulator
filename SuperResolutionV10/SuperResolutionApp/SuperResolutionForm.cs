namespace SuperResolutionApp;

public partial class SuperResolutionForm : Form
{
    private readonly SuperResolutionService _service = new();
    private readonly PreviewWheelMessageFilter _previewWheelFilter;
    private readonly Dictionary<SrAlgorithm, string[]> _defaultModelCandidates;
    private Bitmap? _inputBitmap;
    private Bitmap? _outputBitmap;

    public SuperResolutionForm()
    {
        InitializeComponent();
        comboAlgorithm.DataSource = Enum.GetValues<SrAlgorithm>();
        comboAlgorithm.SelectedItem = SrAlgorithm.SwinIR;
        _defaultModelCandidates = BuildDefaultModelCandidates();
        comboAlgorithm.SelectedIndexChanged += (_, _) => UpdateModelPathUiAndAutoLoad();
        UpdateModelPathUiAndAutoLoad();

        _previewWheelFilter = new PreviewWheelMessageFilter(this);
        Application.AddMessageFilter(_previewWheelFilter);
    }

    private sealed class PreviewWheelMessageFilter : IMessageFilter
    {
        private const int WM_MOUSEWHEEL = 0x020A;
        private readonly SuperResolutionForm _form;

        public PreviewWheelMessageFilter(SuperResolutionForm form) => _form = form;

        public bool PreFilterMessage(ref Message m)
        {
            if (m.Msg != WM_MOUSEWHEEL)
            {
                return false;
            }

            long wp = m.WParam.ToInt64();
            int delta = unchecked((short)((wp >> 16) & 0xffff));
            return _form.TryApplyPreviewZoom(Control.MousePosition, delta);
        }
    }

    private bool TryApplyPreviewZoom(Point screenMouse, int delta)
    {
        if (IsScreenPointInside(zoomHostInput, screenMouse))
        {
            if (zoomHostInput.PreviewImage is null)
            {
                return false;
            }

            zoomHostInput.ApplyWheelDelta(delta);
            return true;
        }

        if (IsScreenPointInside(zoomHostOutput, screenMouse))
        {
            if (zoomHostOutput.PreviewImage is null)
            {
                return false;
            }

            zoomHostOutput.ApplyWheelDelta(delta);
            return true;
        }

        return false;
    }

    private static bool IsScreenPointInside(Control c, Point screenMouse)
    {
        return c.IsHandleCreated && c.RectangleToScreen(c.ClientRectangle).Contains(screenMouse);
    }

    private void buttonLoadImage_Click(object sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "Image Files|*.png;*.jpg;*.jpeg;*.bmp;*.webp|All Files|*.*"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
        {
            return;
        }

        _inputBitmap?.Dispose();
        _inputBitmap = new Bitmap(dialog.FileName);
        zoomHostInput.PreviewImage = _inputBitmap;
        SetStatus($"Loaded: {Path.GetFileName(dialog.FileName)} ({_inputBitmap.Width}x{_inputBitmap.Height})");
    }

    private void buttonSelectModel_Click(object sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "ONNX Model|*.onnx|All Files|*.*"
        };

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            textBoxModelPath.Text = dialog.FileName;
        }
    }

    private void UpdateModelPathUiAndAutoLoad()
    {
        var algorithm = (SrAlgorithm)comboAlgorithm.SelectedItem!;
        bool requiresModel = algorithm != SrAlgorithm.Bicubic;

        textBoxModelPath.Enabled = requiresModel;
        buttonSelectModel.Enabled = requiresModel;
        if (!requiresModel)
        {
            textBoxModelPath.Text = string.Empty;
            return;
        }

        if (TryFindDefaultModelPath(algorithm, out var modelPath))
        {
            textBoxModelPath.Text = modelPath;
            SetStatus($"Model loaded: {Path.GetFileName(modelPath)}");
        }
        else
        {
            textBoxModelPath.Text = string.Empty;
            SetStatus($"No default ONNX found for {algorithm}. Please select model file.");
        }
    }

    private Dictionary<SrAlgorithm, string[]> BuildDefaultModelCandidates()
    {
        var modelsRoot = FindModelsDirectory();
        return new Dictionary<SrAlgorithm, string[]>
        {
            [SrAlgorithm.ESRGAN] = new[]
            {
                Path.Combine(modelsRoot, "esrgan", "esrgan-onnx-float", "esrgan.onnx"),
                Path.Combine(modelsRoot, "esrgan.onnx")
            },
            [SrAlgorithm.SwinIR] = new[]
            {
                Path.Combine(modelsRoot, "swinir_x4_gan.onnx"),
                Path.Combine(modelsRoot, "swinir.onnx")
            },
            [SrAlgorithm.AuraSR] = new[]
            {
                Path.Combine(modelsRoot, "aurasr_v2.onnx"),
                Path.Combine(modelsRoot, "aurasr.onnx"),
                Path.Combine(modelsRoot, "AuraSR.onnx")
            }
        };
    }

    private static string FindModelsDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "models");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }

        return Path.Combine(AppContext.BaseDirectory, "models");
    }

    private bool TryFindDefaultModelPath(SrAlgorithm algorithm, out string modelPath)
    {
        modelPath = string.Empty;
        if (!_defaultModelCandidates.TryGetValue(algorithm, out var candidates))
        {
            return false;
        }

        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                modelPath = path;
                return true;
            }
        }

        return false;
    }

    private async void buttonRun_Click(object sender, EventArgs e)
    {
        if (_inputBitmap is null)
        {
            MessageBox.Show("먼저 입력 이미지를 선택해 주세요.", "Input Required", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        buttonRun.Enabled = false;
        buttonSaveResult.Enabled = false;
        UpdateProgress(0);
        SetStatus("Running super resolution...");

        try
        {
            var options = new SrOptions
            {
                Algorithm = (SrAlgorithm)comboAlgorithm.SelectedItem!,
                Scale = (int)numericScale.Value,
                ModelPath = string.IsNullOrWhiteSpace(textBoxModelPath.Text) ? null : textBoxModelPath.Text.Trim()
            };

            var progress = new Progress<int>(p => UpdateProgress(p));
            var result = await _service.RunAsync(_inputBitmap, options, progress);

            _outputBitmap?.Dispose();
            _outputBitmap = result;
            zoomHostOutput.PreviewImage = _outputBitmap;
            buttonSaveResult.Enabled = true;
            UpdateProgress(100);
            SetStatus($"Done: {_outputBitmap.Width}x{_outputBitmap.Height} ({options.Algorithm}, x{options.Scale})");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"처리 중 오류가 발생했습니다.\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("Failed.");
        }
        finally
        {
            buttonRun.Enabled = true;
        }
    }

    private void UpdateProgress(int percent)
    {
        percent = Math.Clamp(percent, 0, 100);
        progressBarProcessing.Value = percent;
        labelProgressPercent.Text = $"{percent} %";
    }

    private void buttonSaveResult_Click(object sender, EventArgs e)
    {
        if (_outputBitmap is null)
        {
            return;
        }

        using var dialog = new SaveFileDialog
        {
            Filter = "PNG|*.png|JPEG|*.jpg|Bitmap|*.bmp",
            FileName = "sr_result.png"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
        {
            return;
        }

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        var format = extension switch
        {
            ".jpg" or ".jpeg" => System.Drawing.Imaging.ImageFormat.Jpeg,
            ".bmp" => System.Drawing.Imaging.ImageFormat.Bmp,
            _ => System.Drawing.Imaging.ImageFormat.Png
        };

        _outputBitmap.Save(dialog.FileName, format);
        SetStatus($"Saved: {dialog.FileName}");
    }

    private void SetStatus(string message)
    {
        toolStripStatusLabel.Text = message;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        Application.RemoveMessageFilter(_previewWheelFilter);
        zoomHostInput.PreviewImage = null;
        zoomHostOutput.PreviewImage = null;
        _inputBitmap?.Dispose();
        _outputBitmap?.Dispose();
        base.OnFormClosed(e);
    }
}

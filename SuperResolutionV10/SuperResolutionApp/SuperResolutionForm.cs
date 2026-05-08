namespace SuperResolutionApp;

public partial class SuperResolutionForm : Form
{
    private readonly record struct AlgorithmDefaults(int Scale, SrRuntimeDevice Runtime, int TileSize, int TileOverlap);

    private enum SaveImageFormat
    {
        JPG,
        PNG
    }

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
        comboRuntime.DataSource = Enum.GetValues<SrRuntimeDevice>();
        comboRuntime.SelectedItem = SrRuntimeDevice.CPU;
        comboSaveFormat.DataSource = Enum.GetValues<SaveImageFormat>();
        comboSaveFormat.SelectedItem = SaveImageFormat.JPG;
        _defaultModelCandidates = BuildDefaultModelCandidates();
        comboAlgorithm.SelectedIndexChanged += (_, _) => UpdateModelPathUiAndAutoLoad();
        UpdateModelPathUiAndAutoLoad();
        SetAppState("Idle");

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

    private async void buttonPrepareModels_Click(object sender, EventArgs e)
    {
        var selectedAlgorithm = (SrAlgorithm)comboAlgorithm.SelectedItem!;
        if (selectedAlgorithm == SrAlgorithm.Bicubic)
        {
            MessageBox.Show(
                "Bicubic은 ONNX 모델이 필요하지 않습니다.\nSwinIR/ESRGAN/AuraSR를 선택한 뒤 실행해 주세요.",
                "No Model Required",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var expectedModelPath = GetExpectedModelPathForAlgorithm(selectedAlgorithm);
        if (File.Exists(expectedModelPath))
        {
            MessageBox.Show(
                $"현재 선택된 모델의 ONNX가 이미 존재합니다.\n{expectedModelPath}",
                "Model Already Exists",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            SetStatus($"Model already present: {Path.GetFileName(expectedModelPath)}");
            return;
        }

        var scriptsDir = FindScriptsDirectory();
        var scriptPath = Path.Combine(scriptsDir, "prepare_sr_models.py");
        if (!File.Exists(scriptPath))
        {
            MessageBox.Show(
                $"모델 준비 스크립트를 찾지 못했습니다.\n{scriptPath}",
                "Script Not Found",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        if (!TryResolvePythonExecutable(out var pythonExe))
        {
            var install = MessageBox.Show(
                "Python이 설치되어 있지 않아 모델 자동 준비를 실행할 수 없습니다.\n\n" +
                "예(Yes): Python 설치 페이지를 열고 winget 설치를 시도합니다.\n" +
                "아니오(No): 취소합니다.",
                "Python Not Found",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (install == DialogResult.Yes)
            {
                LaunchPythonInstallHelpers();
            }

            SetStatus("Model preparation cancelled (Python not found).");
            return;
        }

        var scriptArgs = BuildPrepareArgumentsForAlgorithm(selectedAlgorithm);

        buttonPrepareModels.Enabled = false;
        SetAppState("Preparing Models");
        SetStatus($"Preparing {selectedAlgorithm} model... download + ONNX conversion in progress.");

        try
        {
            var startInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = pythonExe,
                Arguments = $"\"{scriptPath}\" {scriptArgs}",
                WorkingDirectory = Path.GetDirectoryName(scriptPath)!,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using var process = new System.Diagnostics.Process { StartInfo = startInfo };
            process.Start();
            string stdout = await process.StandardOutput.ReadToEndAsync();
            string stderr = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                var detail = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                MessageBox.Show(
                    $"모델 준비 중 오류가 발생했습니다.\n{detail}",
                    "Prepare Models Failed",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                SetStatus("Model preparation failed.");
                SetAppState("Failed");
                return;
            }

            UpdateModelPathUiAndAutoLoad();
            SetStatus($"{selectedAlgorithm} model preparation completed.");
            SetAppState("Completed");
            MessageBox.Show(
                $"{selectedAlgorithm} 모델 다운로드 및 ONNX 변환이 완료되었습니다.",
                "Prepare Models",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"모델 준비 실행 중 오류가 발생했습니다.\n{ex.Message}",
                "Prepare Models Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            SetStatus("Model preparation failed.");
            SetAppState("Failed");
        }
        finally
        {
            buttonPrepareModels.Enabled = true;
            if (toolStripStateLabel.Text == "Preparing Models")
            {
                SetAppState("Idle");
            }
        }
    }

    private string GetExpectedModelPathForAlgorithm(SrAlgorithm algorithm)
    {
        if (TryFindDefaultModelPath(algorithm, out var existing))
        {
            return existing;
        }

        var modelsRoot = FindModelsDirectory();
        return algorithm switch
        {
            SrAlgorithm.SwinIR => Path.Combine(modelsRoot, "swinir_x4_gan.onnx"),
            SrAlgorithm.ESRGAN => Path.Combine(modelsRoot, "esrgan.onnx"),
            SrAlgorithm.AuraSR => Path.Combine(modelsRoot, "aurasr_v2.onnx"),
            _ => string.Empty
        };
    }

    private static string BuildPrepareArgumentsForAlgorithm(SrAlgorithm algorithm)
    {
        return algorithm switch
        {
            SrAlgorithm.SwinIR => "--skip-esrgan --skip-aurasr",
            SrAlgorithm.ESRGAN => "--skip-swinir --skip-aurasr --esrgan-mode single",
            SrAlgorithm.AuraSR => "--skip-swinir --skip-esrgan",
            _ => "--skip-swinir --skip-esrgan --skip-aurasr"
        };
    }

    private static bool TryResolvePythonExecutable(out string executable)
    {
        if (CanRunCommand("python", "--version"))
        {
            executable = "python";
            return true;
        }

        if (CanRunCommand("py", "-3 --version"))
        {
            executable = "py";
            return true;
        }

        executable = string.Empty;
        return false;
    }

    private static bool CanRunCommand(string fileName, string args)
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = fileName,
                Arguments = args,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using var p = System.Diagnostics.Process.Start(psi);
            if (p is null)
            {
                return false;
            }

            p.WaitForExit(5000);
            return p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static void LaunchPythonInstallHelpers()
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "https://www.python.org/downloads/windows/",
                UseShellExecute = true
            });
        }
        catch
        {
            // Ignore browser launch failures.
        }

        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "powershell",
                Arguments = "-NoExit -Command \"winget install -e --id Python.Python.3.12\"",
                UseShellExecute = true
            });
        }
        catch
        {
            // Ignore winget launch failures.
        }
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
            AutoApplySettingsFromSelectedModel(dialog.FileName);
        }
    }

    private void AutoApplySettingsFromSelectedModel(string modelPath)
    {
        var inferred = InferAlgorithmFromModelPath(modelPath);
        if (inferred is null)
        {
            SetStatus($"Model selected: {Path.GetFileName(modelPath)} (algorithm auto-detect failed)");
            return;
        }

        comboAlgorithm.SelectedItem = inferred.Value;
        var defaults = GetAlgorithmDefaults(inferred.Value);
        ApplyAlgorithmDefaults(defaults);
        SetStatus($"Model selected: {Path.GetFileName(modelPath)} | auto: {inferred.Value}, x{defaults.Scale}, {defaults.Runtime}, tile={defaults.TileSize}, overlap={defaults.TileOverlap}");
    }

    private static SrAlgorithm? InferAlgorithmFromModelPath(string modelPath)
    {
        var name = Path.GetFileNameWithoutExtension(modelPath).ToLowerInvariant();
        if (name.Contains("swin"))
        {
            return SrAlgorithm.SwinIR;
        }

        if (name.Contains("esrgan") || name.Contains("real-esrgan") || name.Contains("realesrgan"))
        {
            return SrAlgorithm.ESRGAN;
        }

        if (name.Contains("aura"))
        {
            return SrAlgorithm.AuraSR;
        }

        return null;
    }

    private void UpdateModelPathUiAndAutoLoad()
    {
        var algorithm = (SrAlgorithm)comboAlgorithm.SelectedItem!;
        bool requiresModel = algorithm != SrAlgorithm.Bicubic;
        var defaults = GetAlgorithmDefaults(algorithm);
        ApplyAlgorithmDefaults(defaults);

        textBoxModelPath.Enabled = requiresModel;
        buttonSelectModel.Enabled = requiresModel;
        if (!requiresModel)
        {
            textBoxModelPath.Text = string.Empty;
            SetStatus($"Defaults applied: {algorithm} / x{defaults.Scale}, {defaults.Runtime}, tile={defaults.TileSize}, overlap={defaults.TileOverlap}");
            return;
        }

        if (TryFindDefaultModelPath(algorithm, out var modelPath))
        {
            textBoxModelPath.Text = modelPath;
            SetStatus($"Model loaded: {Path.GetFileName(modelPath)} | x{defaults.Scale}, {defaults.Runtime}, tile={defaults.TileSize}, overlap={defaults.TileOverlap}");
        }
        else
        {
            textBoxModelPath.Text = string.Empty;
            SetStatus($"No default ONNX found for {algorithm}. Defaults: x{defaults.Scale}, {defaults.Runtime}, tile={defaults.TileSize}, overlap={defaults.TileOverlap}");
        }
    }

    private static AlgorithmDefaults GetAlgorithmDefaults(SrAlgorithm algorithm)
    {
        return algorithm switch
        {
            // Bicubic does not need model/GPU. Keep CPU default and no overlap.
            SrAlgorithm.Bicubic => new AlgorithmDefaults(Scale: 4, Runtime: SrRuntimeDevice.CPU, TileSize: 256, TileOverlap: 0),
            // SwinIR tends to consume more memory; smaller tile improves stability.
            SrAlgorithm.SwinIR => new AlgorithmDefaults(Scale: 4, Runtime: SrRuntimeDevice.CPU, TileSize: 192, TileOverlap: 24),
            // ESRGAN model in this project uses fixed 128x128 input.
            SrAlgorithm.ESRGAN => new AlgorithmDefaults(Scale: 4, Runtime: SrRuntimeDevice.CPU, TileSize: 128, TileOverlap: 8),
            // AuraSR export in this project uses fixed 64x64 input.
            SrAlgorithm.AuraSR => new AlgorithmDefaults(Scale: 4, Runtime: SrRuntimeDevice.CPU, TileSize: 64, TileOverlap: 8),
            _ => new AlgorithmDefaults(Scale: 4, Runtime: SrRuntimeDevice.CPU, TileSize: 192, TileOverlap: 16)
        };
    }

    private void ApplyAlgorithmDefaults(AlgorithmDefaults defaults)
    {
        numericScale.Value = Math.Clamp(defaults.Scale, (int)numericScale.Minimum, (int)numericScale.Maximum);
        comboRuntime.SelectedItem = defaults.Runtime;
        numericTileSize.Value = Math.Clamp(defaults.TileSize, (int)numericTileSize.Minimum, (int)numericTileSize.Maximum);
        numericTileOverlap.Value = Math.Clamp(defaults.TileOverlap, (int)numericTileOverlap.Minimum, (int)numericTileOverlap.Maximum);
    }

    private Dictionary<SrAlgorithm, string[]> BuildDefaultModelCandidates()
    {
        var modelsRoot = FindModelsDirectory();
        return new Dictionary<SrAlgorithm, string[]>
        {
            [SrAlgorithm.ESRGAN] = new[]
            {
                Path.Combine(modelsRoot, "esrgan.onnx"),
                Path.Combine(modelsRoot, "esrgan", "esrgan-onnx-float", "esrgan.onnx")
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

    private static string FindScriptsDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "scripts");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        return Path.Combine(AppContext.BaseDirectory, "scripts");
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

        var selectedAlgorithm = (SrAlgorithm)comboAlgorithm.SelectedItem!;
        var selectedModelPath = textBoxModelPath.Text.Trim();
        if (selectedAlgorithm != SrAlgorithm.Bicubic)
        {
            if (string.IsNullOrWhiteSpace(selectedModelPath))
            {
                MessageBox.Show(
                    $"{selectedAlgorithm} 모델 ONNX 파일을 찾지 못했습니다.\nmodels 폴더에 해당 ONNX를 추가하거나, [ ... ] 버튼으로 직접 선택해 주세요.",
                    "Model Required",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            if (!File.Exists(selectedModelPath))
            {
                MessageBox.Show(
                    $"선택된 ONNX 파일이 존재하지 않습니다.\n{selectedModelPath}",
                    "Model Not Found",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }
        }

        SetRunButtonBusy(isBusy: true);
        buttonSaveResult.Enabled = false;
        UpdateProgress(0);
        SetStatus("Running super resolution...");
        SetAppState("Running");

        try
        {
            var options = new SrOptions
            {
                Algorithm = selectedAlgorithm,
                Scale = (int)numericScale.Value,
                ModelPath = string.IsNullOrWhiteSpace(selectedModelPath) ? null : selectedModelPath,
                RuntimeDevice = (SrRuntimeDevice)comboRuntime.SelectedItem!,
                TileSize = (int)numericTileSize.Value,
                TileOverlap = (int)numericTileOverlap.Value
            };

            var progress = new Progress<int>(p => UpdateProgress(p));
            var result = await _service.RunAsync(_inputBitmap, options, progress);

            _outputBitmap?.Dispose();
            _outputBitmap = result;
            zoomHostOutput.PreviewImage = _outputBitmap;
            buttonSaveResult.Enabled = true;

            var autoSaved = SaveResultAuto(_outputBitmap, options.Algorithm);
            ShowSavedPopup(autoSaved);
            UpdateProgress(100);
            if (checkAutoSave.Checked)
            {
                SetStatus($"Done + Saved: {Path.GetFileName(autoSaved)} ({_service.LastRuntimeDevice})");
            }
            else
            {
                SetStatus($"Done (auto saved): {Path.GetFileName(autoSaved)} ({options.Algorithm}, x{options.Scale}, {_service.LastRuntimeDevice})");
            }
            SetAppState("Completed");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"처리 중 오류가 발생했습니다.\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus("Failed.");
            SetAppState("Failed");
        }
        finally
        {
            SetRunButtonBusy(isBusy: false);
            if (toolStripStateLabel.Text == "Running")
            {
                SetAppState("Idle");
            }
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

        var selectedFormat = (SaveImageFormat)comboSaveFormat.SelectedItem!;
        var defaultDir = GetDefaultOutputDirectory();
        using var dialog = new SaveFileDialog
        {
            Filter = "JPEG|*.jpg|PNG|*.png",
            InitialDirectory = defaultDir,
            FileName = BuildAutoSaveFileName((SrAlgorithm)comboAlgorithm.SelectedItem!, selectedFormat)
        };

        if (dialog.ShowDialog() != DialogResult.OK)
        {
            return;
        }

        var format = ResolveImageFormatByExtension(dialog.FileName);

        _outputBitmap.Save(dialog.FileName, format);
        SetStatus($"Saved: {dialog.FileName}");
        ShowSavedPopup(dialog.FileName);
    }

    private string SaveResultAuto(Bitmap bitmap, SrAlgorithm algorithm)
    {
        var selectedFormat = (SaveImageFormat)comboSaveFormat.SelectedItem!;
        var outputDir = GetDefaultOutputDirectory();
        Directory.CreateDirectory(outputDir);
        var fileName = BuildAutoSaveFileName(algorithm, selectedFormat);
        var fullPath = Path.Combine(outputDir, fileName);
        bitmap.Save(fullPath, ResolveImageFormat(selectedFormat));
        UpdateProgress(100);
        return fullPath;
    }

    private static string GetDefaultOutputDirectory()
    {
        var pictures = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
        if (!string.IsNullOrWhiteSpace(pictures))
        {
            return pictures;
        }

        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (!string.IsNullOrWhiteSpace(desktop))
        {
            return desktop;
        }

        return AppContext.BaseDirectory;
    }

    private static string BuildAutoSaveFileName(SrAlgorithm algorithm, SaveImageFormat format)
    {
        var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var extension = format == SaveImageFormat.JPG ? "jpg" : "png";
        return $"sr_{algorithm}_{timestamp}.{extension}";
    }

    private static System.Drawing.Imaging.ImageFormat ResolveImageFormat(SaveImageFormat format)
    {
        return format == SaveImageFormat.JPG
            ? System.Drawing.Imaging.ImageFormat.Jpeg
            : System.Drawing.Imaging.ImageFormat.Png;
    }

    private static System.Drawing.Imaging.ImageFormat ResolveImageFormatByExtension(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => System.Drawing.Imaging.ImageFormat.Jpeg,
            _ => System.Drawing.Imaging.ImageFormat.Png
        };
    }

    private void SetStatus(string message)
    {
        toolStripStatusLabel.Text = message;
    }

    private void SetAppState(string state)
    {
        toolStripStateLabel.Text = state;
    }

    private void SetRunButtonBusy(bool isBusy)
    {
        buttonRun.Enabled = !isBusy;
        buttonRun.BackColor = isBusy ? Color.Gray : Color.RoyalBlue;
        buttonRun.ForeColor = isBusy ? Color.Gainsboro : Color.White;
    }

    private static void ShowSavedPopup(string fullPath)
    {
        MessageBox.Show(
            $"SR 처리 완료(100%).\n저장된 파일 경로:\n{fullPath}",
            "Completed",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
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

using ImageRembgWinV10.Controls;
using ImageRembgWinV10.Localization;
using ImageRembgWinV10.Resources;
using ImageRembgWinV10.Services;
using OpenCvSharp;
using OpenCvSharp.Extensions;

namespace ImageRembgWinV10;

public partial class ImageRembgForm : Form
{
    private Bitmap? _workingSource;
    private Mat? _confirmedMask;
    private Bitmap? _resultBitmap;
    private string? _loadedFilePath;
    private bool _syncingUi;
    private SegmentationAlgorithm _selectedAlgorithm = SegmentationAlgorithm.Rembg;
    private bool _syncingAlgorithm;
    private bool _syncingResultSize;
    private CanvasContextMenuBuilder? _canvasContextMenu;

    public ImageRembgForm()
    {
        InitializeComponent();
        InitializeLanguageMenu();
        InitializeApplicationIcon();
        InitializeIcons();
        InitializeAboutUi();
        InitializeResultSizeOptions();
        InitializeToolbarLayout();
        panelCanvasHost.AttachCanvas(imageCanvas);
        InitializeContextMenu();
        InitializeAlgorithms();
        SetInteractionMode(InteractionMode.Pan);
        ApplyLocalization();
        L.Changed += OnLanguageChanged;
        UpdateUiState();
    }

    private void InitializeApplicationIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
        if (File.Exists(iconPath))
        {
            Icon = new Icon(iconPath);
            return;
        }

        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    }

    private void InitializeAlgorithms()
    {
        cboAlgorithm.Items.Clear();
        foreach (var option in SegmentationAlgorithmCatalog.Options)
        {
            cboAlgorithm.Items.Add(option);
        }

        cboAlgorithm.DisplayMember = nameof(SegmentationAlgorithmOption.DisplayName);
        cboAlgorithm.SelectedIndex = 0;
        SyncAlgorithmUi(_selectedAlgorithm, clearPreview: false);
    }

    private void InitializeIcons()
    {
        imageListIcons.Images.Add("file", AppIconFactory.CreateFileMenuIcon());
        imageListIcons.Images.Add("edit", AppIconFactory.CreateEditMenuIcon());
        imageListIcons.Images.Add("view", AppIconFactory.CreateViewMenuIcon());
        imageListIcons.Images.Add("tools", AppIconFactory.CreateToolsMenuIcon());
        imageListIcons.Images.Add("open", AppIconFactory.CreateOpenIcon());
        imageListIcons.Images.Add("save", AppIconFactory.CreateSaveIcon());
        imageListIcons.Images.Add("exit", AppIconFactory.CreateExitIcon());
        imageListIcons.Images.Add("preview", AppIconFactory.CreatePreviewIcon());
        imageListIcons.Images.Add("remove", AppIconFactory.CreateRemoveBackgroundIcon());
        imageListIcons.Images.Add("reset", AppIconFactory.CreateResetIcon());
        imageListIcons.Images.Add("zoom-in", AppIconFactory.CreateZoomInIcon());
        imageListIcons.Images.Add("zoom-out", AppIconFactory.CreateZoomOutIcon());
        imageListIcons.Images.Add("fit", AppIconFactory.CreateFitIcon());
        imageListIcons.Images.Add("select", AppIconFactory.CreateSelectRectIcon());
        imageListIcons.Images.Add("foreground", AppIconFactory.CreateForegroundIcon());
        imageListIcons.Images.Add("background", AppIconFactory.CreateBackgroundIcon());
        imageListIcons.Images.Add("pan", AppIconFactory.CreatePanIcon());
        imageListIcons.Images.Add("mask", AppIconFactory.CreateMaskIcon());
        imageListIcons.Images.Add("result", AppIconFactory.CreateResultIcon());
        imageListIcons.Images.Add("algorithm", AppIconFactory.CreateAlgorithmMenuIcon());
        imageListIcons.Images.Add("info", AppIconFactory.CreateInfoIcon());

        AppIconProvider.ConfigureMenuStrip(menuStrip);

        AppIconProvider.ApplyToolbarButton(btnOpen, imageListIcons, "open");
        AppIconProvider.ApplyToolbarButton(btnPreview, imageListIcons, "preview");
        AppIconProvider.ApplyToolbarButton(btnRemoveBackground, imageListIcons, "remove");
        AppIconProvider.ApplyToolbarButton(btnSave, imageListIcons, "save");
        AppIconProvider.ApplyToolbarButton(btnReset, imageListIcons, "reset");
        AppIconProvider.ApplyToolbarButton(btnZoomOut, imageListIcons, "zoom-out");
        AppIconProvider.ApplyToolbarButton(btnZoomIn, imageListIcons, "zoom-in");
        AppIconProvider.ApplyToolbarButton(btnFit, imageListIcons, "fit");
        AppIconProvider.ApplyToolbarButton(btnInfo, imageListIcons, "info");

        AppIconProvider.ApplyOptionButton(rbSelectFreehand, imageListIcons, "select");
        AppIconProvider.ApplyOptionButton(rbSelectRect, imageListIcons, "select");
        AppIconProvider.ApplyOptionButton(rbForeground, imageListIcons, "foreground");
        AppIconProvider.ApplyOptionButton(rbBackground, imageListIcons, "background");
        AppIconProvider.ApplyOptionButton(rbPan, imageListIcons, "pan");
        AppIconProvider.ApplyOptionButton(chkShowMask, imageListIcons, "mask");
        AppIconProvider.ApplyOptionButton(chkShowResult, imageListIcons, "result");

        AppIconProvider.ApplyMenuItem(mnuFile, imageListIcons, "file");
        AppIconProvider.ApplyMenuItem(mnuEdit, imageListIcons, "edit");
        AppIconProvider.ApplyMenuItem(mnuView, imageListIcons, "view");
        AppIconProvider.ApplyMenuItem(mnuTools, imageListIcons, "tools");
        AppIconProvider.ApplyMenuItem(mnuAlgorithm, imageListIcons, "algorithm");
        AppIconProvider.ApplyMenuItem(mnuOpen, imageListIcons, "open");
        AppIconProvider.ApplyMenuItem(mnuSave, imageListIcons, "save");
        AppIconProvider.ApplyMenuItem(mnuExit, imageListIcons, "exit");
        AppIconProvider.ApplyMenuItem(mnuPreview, imageListIcons, "preview");
        AppIconProvider.ApplyMenuItem(mnuRemoveBackground, imageListIcons, "remove");
        AppIconProvider.ApplyMenuItem(mnuReset, imageListIcons, "reset");
        AppIconProvider.ApplyMenuItem(mnuZoomIn, imageListIcons, "zoom-in");
        AppIconProvider.ApplyMenuItem(mnuZoomOut, imageListIcons, "zoom-out");
        AppIconProvider.ApplyMenuItem(mnuFit, imageListIcons, "fit");
        AppIconProvider.ApplyMenuItem(mnuShowMask, imageListIcons, "mask");
        AppIconProvider.ApplyMenuItem(mnuShowResult, imageListIcons, "result");
        AppIconProvider.ApplyMenuItem(mnuSelectFreehand, imageListIcons, "select");
        AppIconProvider.ApplyMenuItem(mnuSelectRect, imageListIcons, "select");
        AppIconProvider.ApplyMenuItem(mnuForeground, imageListIcons, "foreground");
        AppIconProvider.ApplyMenuItem(mnuBackground, imageListIcons, "background");
        AppIconProvider.ApplyMenuItem(mnuPan, imageListIcons, "pan");
        AppIconProvider.ApplyMenuItem(mnuAlgoRembg, imageListIcons, "remove");
        AppIconProvider.ApplyMenuItem(mnuAlgoGrabCut, imageListIcons, "preview");
        AppIconProvider.ApplyMenuItem(mnuAlgoColorKey, imageListIcons, "background");
        AppIconProvider.ApplyMenuItem(mnuAlgoEdgeFill, imageListIcons, "select");
        AppIconProvider.ApplyMenuItem(mnuAlgoThreshold, imageListIcons, "mask");
    }

    private static void LayoutToolbarControl(Control control, ref int x, int y, int width, int height, int gap)
    {
        control.AutoSize = false;
        control.Size = new System.Drawing.Size(width, height);
        control.Location = new System.Drawing.Point(x, y);

        switch (control)
        {
            case CheckBox checkBox:
                checkBox.TextAlign = ContentAlignment.MiddleCenter;
                break;
            case RadioButton radioButton:
                radioButton.TextAlign = ContentAlignment.MiddleCenter;
                break;
        }

        x += width + gap;
    }

    private static void LayoutToolbarLabel(Label label, ref int x, int y, int height, int gap)
    {
        label.AutoSize = false;
        label.TextAlign = ContentAlignment.MiddleLeft;
        var width = TextRenderer.MeasureText(label.Text, label.Font).Width + 8;
        label.Size = new System.Drawing.Size(width, height);
        label.Location = new System.Drawing.Point(x, y);
        x += width + gap;
    }

    private static void LayoutToolbarHint(Label label, int x, int y, int height)
    {
        label.AutoSize = false;
        label.TextAlign = ContentAlignment.MiddleLeft;
        label.Location = new System.Drawing.Point(x, y);
        label.Height = height;
    }

    private void InitializeResultSizeOptions()
    {
        _syncingResultSize = true;
        cboResultSize.Items.Clear();
        cboResultSize.Items.Add(new OutputSizeModeOption(OutputSizeMode.Original, L.Get("OutputSize.Original")));
        cboResultSize.Items.Add(new OutputSizeModeOption(OutputSizeMode.SelectionCrop, L.Get("OutputSize.Selection")));
        cboResultSize.DisplayMember = nameof(OutputSizeModeOption.DisplayName);
        SelectOutputSizeMode(UserSettingsService.OutputSizeMode);
        _syncingResultSize = false;
    }

    private void SelectOutputSizeMode(OutputSizeMode mode)
    {
        for (var i = 0; i < cboResultSize.Items.Count; i++)
        {
            if (cboResultSize.Items[i] is OutputSizeModeOption option && option.Mode == mode)
            {
                cboResultSize.SelectedIndex = i;
                return;
            }
        }

        cboResultSize.SelectedIndex = 1;
    }

    private OutputSizeMode GetOutputSizeMode()
    {
        return cboResultSize.SelectedItem is OutputSizeModeOption option
            ? option.Mode
            : OutputSizeMode.SelectionCrop;
    }

    private void cboResultSize_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_syncingResultSize || cboResultSize.SelectedItem is not OutputSizeModeOption option)
        {
            return;
        }

        UserSettingsService.OutputSizeMode = option.Mode;
    }

    private void InitializeContextMenu()
    {
        _canvasContextMenu = new CanvasContextMenuBuilder(
            components,
            imageListIcons,
            new CanvasContextMenuBindings
            {
                Open = btnOpen_Click,
                Save = btnSave_Click,
                Exit = mnuExit_Click,
                Preview = btnPreview_Click,
                RemoveBackground = btnRemoveBackground_Click,
                Reset = btnReset_Click,
                ZoomIn = btnZoomIn_Click,
                ZoomOut = btnZoomOut_Click,
                Fit = btnFit_Click,
                ShowMaskCheckedChanged = mnuShowMask_CheckedChanged,
                ShowResultCheckedChanged = mnuShowResult_CheckedChanged,
                SelectFreehand = mnuSelectFreehand_Click,
                SelectRect = mnuSelectRect_Click,
                Foreground = mnuForeground_Click,
                Background = mnuBackground_Click,
                Pan = mnuPan_Click,
                AlgoRembg = mnuAlgoRembg_Click,
                AlgoGrabCut = mnuAlgoGrabCut_Click,
                AlgoColorKey = mnuAlgoColorKey_Click,
                AlgoEdgeFill = mnuAlgoEdgeFill_Click,
                AlgoThreshold = mnuAlgoThreshold_Click
            });

        _canvasContextMenu.Menu.Opening += (_, _) => SyncContextMenuState();
        imageCanvas.ContextMenuStrip = _canvasContextMenu.Menu;
    }

    private void ImageRembgForm_Load(object? sender, EventArgs e)
    {
        UserSettingsService.Load();
        statusLabel.Text = L.Get("Status.Ready");
    }

    private void ImageRembgForm_DragEnter(object? sender, DragEventArgs e)
    {
        if (e.Data?.GetDataPresent(DataFormats.FileDrop) != true)
        {
            return;
        }

        if (e.Data.GetData(DataFormats.FileDrop) is string[] files &&
            files.Length > 0 &&
            ImageLoaderService.IsSupported(files[0]))
        {
            e.Effect = DragDropEffects.Copy;
        }
    }

    private void ImageRembgForm_DragDrop(object? sender, DragEventArgs e)
    {
        if (e.Data?.GetData(DataFormats.FileDrop) is not string[] files || files.Length == 0)
        {
            return;
        }

        TryLoadImage(files[0]);
    }

    private void btnOpen_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = L.OpenFileFilter,
            Title = L.Get("Dialog.OpenImage"),
            InitialDirectory = UserSettingsService.GetInitialDirectory() ?? string.Empty,
            RestoreDirectory = false
        };

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            TryLoadImage(dialog.FileName);
        }
    }

    private void btnPreview_Click(object? sender, EventArgs e)
    {
        if (!EnsureSourceReady(out var source))
        {
            return;
        }

        if (!imageCanvas.HasSelection)
        {
            MessageBox.Show(
                this,
                L.Get("Msg.SelectionRequiredBody"),
                L.Get("Msg.SelectionRequired"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            ToggleBusy(true, L.Get("Status.AnalyzingOutline"));
            imageCanvas.SetProcessing(true);

            var progress = new Progress<string>(message =>
            {
                statusLabel.Text = message;
            });

            using var sourceMat = OpenCvImageHelper.BitmapToBgr8(source);
            using var selectionMask = imageCanvas.GetSelectionMaskClone();
            using var foregroundHintMask = imageCanvas.GetForegroundHintMaskClone();
            using var backgroundHintMask = imageCanvas.GetBackgroundHintMaskClone();
            using var result = SegmentationService.Segment(
                _selectedAlgorithm,
                sourceMat,
                selectionMask,
                foregroundHintMask,
                backgroundHintMask,
                progress);

            _confirmedMask?.Dispose();
            _confirmedMask = result.Mask.Clone();

            imageCanvas.SetContours(result.Contours);
            imageCanvas.SetPreviewMask(_confirmedMask);
            imageCanvas.ShowResult = false;
            chkShowResult.Checked = false;

            statusLabel.Text = L.F(
                "Status.PreviewComplete",
                SegmentationAlgorithmCatalog.GetDisplayName(_selectedAlgorithm),
                result.ForegroundRatio);
            UpdateUiState();
        }
        catch (Exception ex)
        {
            ErrorDialogService.ShowError(
                this,
                L.Get("Error.PreviewFailed"),
                L.Get("Error.PreviewFailedBody"),
                ex,
                BuildSegmentationContext());
            statusLabel.Text = ErrorDialogService.FormatStatusMessage(L.Get("Error.PreviewFailed"), ex);
        }
        finally
        {
            imageCanvas.SetProcessing(false);
            ToggleBusy(false, statusLabel.Text);
        }
    }

    private void btnRemoveBackground_Click(object? sender, EventArgs e)
    {
        if (!EnsureSourceReady(out var source))
        {
            return;
        }

        if (_confirmedMask == null)
        {
            var answer = MessageBox.Show(
                this,
                L.Get("Msg.NoPreviewBody"),
                L.Get("Msg.NoPreview"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (answer != DialogResult.Yes)
            {
                return;
            }

            btnPreview_Click(sender, e);
            if (_confirmedMask == null)
            {
                return;
            }
        }

        try
        {
            ToggleBusy(true, L.Get("Status.RemovingBackground"));
            Application.DoEvents();

            if (!imageCanvas.HasSelection)
            {
                MessageBox.Show(
                    this,
                    L.Get("Msg.SelectionRequiredShort"),
                    L.Get("Msg.SelectionRequired"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            using var selectionMask = imageCanvas.GetSelectionMaskClone();
            var outputSizeMode = GetOutputSizeMode();
            Mat? cropMask = outputSizeMode == OutputSizeMode.SelectionCrop ? selectionMask : null;
            _resultBitmap?.Dispose();
            _resultBitmap = BackgroundRemovalService.RemoveBackground(source, _confirmedMask!, cropMask);

            imageCanvas.SetResultImage(_resultBitmap);
            imageCanvas.ShowResult = true;
            chkShowResult.Checked = true;

            statusLabel.Text = L.F(
                "Status.RemoveComplete",
                _resultBitmap.Width,
                _resultBitmap.Height,
                GetOutputSizeModeLabel(outputSizeMode));
            UpdateUiState();
        }
        catch (Exception ex)
        {
            ErrorDialogService.ShowError(
                this,
                L.Get("Error.RemoveFailed"),
                L.Get("Error.RemoveFailedBody"),
                ex,
                BuildSegmentationContext(includeMaskState: true));
            statusLabel.Text = ErrorDialogService.FormatStatusMessage(L.Get("Error.RemoveFailed"), ex);
        }
        finally
        {
            ToggleBusy(false, statusLabel.Text);
        }
    }

    private void btnSave_Click(object? sender, EventArgs e)
    {
        if (_resultBitmap == null)
        {
            MessageBox.Show(this, L.Get("Msg.NoResultToSaveBody"), L.Get("Msg.NoResultToSave"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new SaveFileDialog
        {
            Filter = L.SaveFileFilter,
            Title = L.Get("Dialog.SaveResult"),
            FileName = ImageSaveService.CreateDefaultFileName(_loadedFilePath),
            InitialDirectory = UserSettingsService.GetInitialDirectory() ?? string.Empty,
            RestoreDirectory = false
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            ImageSaveService.Save(_resultBitmap, dialog.FileName);
            UserSettingsService.RememberPath(dialog.FileName);
            var extension = Path.GetExtension(dialog.FileName);
            var mode = ImageSaveService.SupportsTransparency(extension)
                ? L.Get("SaveMode.Transparent")
                : L.Get("SaveMode.White");
            statusLabel.Text = L.F(
                "Status.SaveComplete",
                mode,
                _resultBitmap.Width,
                _resultBitmap.Height,
                dialog.FileName);
        }
        catch (Exception ex)
        {
            ErrorDialogService.ShowError(
                this,
                L.Get("Error.SaveFailed"),
                L.Get("Error.SaveFailedBody"),
                ex,
                new Dictionary<string, string?>
                {
                    [L.Get("Context.SavePath")] = dialog.FileName,
                    [L.Get("Context.Format")] = Path.GetExtension(dialog.FileName)
                });
            statusLabel.Text = ErrorDialogService.FormatStatusMessage(L.Get("Error.SaveFailed"), ex);
        }
    }

    private void btnReset_Click(object? sender, EventArgs e)
    {
        imageCanvas.ClearSelection();
        imageCanvas.ClearMarkers();
        imageCanvas.SetResultImage(null);
        imageCanvas.ShowResult = false;
        chkShowResult.Checked = false;

        _confirmedMask?.Dispose();
        _confirmedMask = null;
        _resultBitmap?.Dispose();
        _resultBitmap = null;

        statusLabel.Text = L.Get("Status.Reset");
        UpdateUiState();
    }

    private void btnZoomIn_Click(object? sender, EventArgs e) => imageCanvas.ZoomIn();

    private void btnZoomOut_Click(object? sender, EventArgs e) => imageCanvas.ZoomOut();

    private void btnFit_Click(object? sender, EventArgs e) => imageCanvas.FitToWindow();

    private void cboAlgorithm_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_syncingAlgorithm || cboAlgorithm.SelectedItem is not SegmentationAlgorithmOption option)
        {
            return;
        }

        SetSelectedAlgorithm(option.Algorithm, clearPreview: true);
    }

    private void mnuAlgoRembg_Click(object? sender, EventArgs e) => SetSelectedAlgorithm(SegmentationAlgorithm.Rembg, clearPreview: true);

    private void mnuAlgoGrabCut_Click(object? sender, EventArgs e) => SetSelectedAlgorithm(SegmentationAlgorithm.GrabCut, clearPreview: true);

    private void mnuAlgoColorKey_Click(object? sender, EventArgs e) => SetSelectedAlgorithm(SegmentationAlgorithm.ColorKey, clearPreview: true);

    private void mnuAlgoEdgeFill_Click(object? sender, EventArgs e) => SetSelectedAlgorithm(SegmentationAlgorithm.EdgeFill, clearPreview: true);

    private void mnuAlgoThreshold_Click(object? sender, EventArgs e) => SetSelectedAlgorithm(SegmentationAlgorithm.Threshold, clearPreview: true);

    private void SetSelectedAlgorithm(SegmentationAlgorithm algorithm, bool clearPreview)
    {
        _selectedAlgorithm = algorithm;
        SyncAlgorithmUi(algorithm, clearPreview);
    }

    private void SyncAlgorithmUi(SegmentationAlgorithm algorithm, bool clearPreview)
    {
        _syncingAlgorithm = true;

        for (var i = 0; i < cboAlgorithm.Items.Count; i++)
        {
            if (cboAlgorithm.Items[i] is SegmentationAlgorithmOption option &&
                option.Algorithm == algorithm)
            {
                cboAlgorithm.SelectedIndex = i;
                break;
            }
        }

        mnuAlgoRembg.Checked = algorithm == SegmentationAlgorithm.Rembg;
        mnuAlgoGrabCut.Checked = algorithm == SegmentationAlgorithm.GrabCut;
        mnuAlgoColorKey.Checked = algorithm == SegmentationAlgorithm.ColorKey;
        mnuAlgoEdgeFill.Checked = algorithm == SegmentationAlgorithm.EdgeFill;
        mnuAlgoThreshold.Checked = algorithm == SegmentationAlgorithm.Threshold;

        if (_canvasContextMenu != null)
        {
            _canvasContextMenu.AlgoRembg.Checked = mnuAlgoRembg.Checked;
            _canvasContextMenu.AlgoGrabCut.Checked = mnuAlgoGrabCut.Checked;
            _canvasContextMenu.AlgoColorKey.Checked = mnuAlgoColorKey.Checked;
            _canvasContextMenu.AlgoEdgeFill.Checked = mnuAlgoEdgeFill.Checked;
            _canvasContextMenu.AlgoThreshold.Checked = mnuAlgoThreshold.Checked;
        }

        _syncingAlgorithm = false;

        if (clearPreview)
        {
            ClearPreviewState();
        }

        statusLabel.Text = L.F(
            "Status.Algorithm",
            SegmentationAlgorithmCatalog.GetDisplayName(algorithm),
            SegmentationAlgorithmCatalog.GetDescription(algorithm));
    }

    private void ClearPreviewState()
    {
        _confirmedMask?.Dispose();
        _confirmedMask = null;
        imageCanvas.SetContours([]);
        imageCanvas.SetPreviewMask(null);
        UpdateUiState();
    }

    private void mnuExit_Click(object? sender, EventArgs e) => Close();

    private void mnuSelectFreehand_Click(object? sender, EventArgs e)
    {
        rbSelectFreehand.Checked = true;
    }

    private void mnuSelectRect_Click(object? sender, EventArgs e)
    {
        rbSelectRect.Checked = true;
    }

    private void mnuForeground_Click(object? sender, EventArgs e)
    {
        rbForeground.Checked = true;
    }

    private void mnuBackground_Click(object? sender, EventArgs e)
    {
        rbBackground.Checked = true;
    }

    private void mnuPan_Click(object? sender, EventArgs e)
    {
        rbPan.Checked = true;
    }

    private void mnuShowMask_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || sender is not ToolStripMenuItem item)
        {
            return;
        }

        ApplyShowMask(item.Checked);
    }

    private void mnuShowResult_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || sender is not ToolStripMenuItem item)
        {
            return;
        }

        ApplyShowResult(item.Checked);
    }

    private void ApplyShowMask(bool showMask)
    {
        _syncingUi = true;
        imageCanvas.ShowMaskPreview = showMask;
        chkShowMask.Checked = showMask;
        mnuShowMask.Checked = showMask;
        if (_canvasContextMenu != null)
        {
            _canvasContextMenu.ShowMask.Checked = showMask;
        }

        _syncingUi = false;
    }

    private void ApplyShowResult(bool showResult)
    {
        _syncingUi = true;
        imageCanvas.ShowResult = showResult;
        chkShowResult.Checked = showResult;
        mnuShowResult.Checked = showResult;
        if (_canvasContextMenu != null)
        {
            _canvasContextMenu.ShowResult.Checked = showResult;
        }

        _syncingUi = false;
        UpdateUiState();
    }

    private void rbSelectFreehand_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || !rbSelectFreehand.Checked)
        {
            return;
        }

        SetInteractionMode(InteractionMode.SelectFreehand);
    }

    private void rbSelectRect_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || !rbSelectRect.Checked)
        {
            return;
        }

        SetInteractionMode(InteractionMode.SelectRectangle);
    }

    private void rbForeground_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || !rbForeground.Checked)
        {
            return;
        }

        SetInteractionMode(InteractionMode.MarkForeground);
    }

    private void rbBackground_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || !rbBackground.Checked)
        {
            return;
        }

        SetInteractionMode(InteractionMode.MarkBackground);
    }

    private void rbPan_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi || !rbPan.Checked)
        {
            return;
        }

        SetInteractionMode(InteractionMode.Pan);
    }

    private void SetInteractionMode(InteractionMode mode)
    {
        _syncingUi = true;
        imageCanvas.InteractionMode = mode;
        rbPan.Checked = mode == InteractionMode.Pan;
        rbSelectFreehand.Checked = mode == InteractionMode.SelectFreehand;
        rbSelectRect.Checked = mode == InteractionMode.SelectRectangle;
        rbForeground.Checked = mode == InteractionMode.MarkForeground;
        rbBackground.Checked = mode == InteractionMode.MarkBackground;
        SyncToolMenuChecksForMode(mode);
        UpdateModeStatusLabel();
        _syncingUi = false;
    }

    private void UpdateModeStatusLabel()
    {
        modeStatusLabel.Text = GetModeLabel(imageCanvas.InteractionMode);
    }

    private void SyncToolMenuChecksForMode(InteractionMode mode)
    {
        if (_syncingUi)
        {
            return;
        }

        _syncingUi = true;
        SetToolChecked(mnuSelectFreehand, _canvasContextMenu?.SelectFreehand, mode == InteractionMode.SelectFreehand);
        SetToolChecked(mnuSelectRect, _canvasContextMenu?.SelectRect, mode == InteractionMode.SelectRectangle);
        SetToolChecked(mnuForeground, _canvasContextMenu?.Foreground, mode == InteractionMode.MarkForeground);
        SetToolChecked(mnuBackground, _canvasContextMenu?.Background, mode == InteractionMode.MarkBackground);
        SetToolChecked(mnuPan, _canvasContextMenu?.Pan, mode == InteractionMode.Pan);
        _syncingUi = false;
    }

    private static void SetToolChecked(ToolStripMenuItem mainItem, ToolStripMenuItem? contextItem, bool isChecked)
    {
        mainItem.Checked = isChecked;
        if (contextItem != null)
        {
            contextItem.Checked = isChecked;
        }
    }

    private void chkShowMask_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi)
        {
            return;
        }

        ApplyShowMask(chkShowMask.Checked);
    }

    private void chkShowResult_CheckedChanged(object? sender, EventArgs e)
    {
        if (_syncingUi)
        {
            return;
        }

        ApplyShowResult(chkShowResult.Checked);
    }

    private void imageCanvas_SelectionChanged(object? sender, EventArgs e)
    {
        _confirmedMask?.Dispose();
        _confirmedMask = null;
        imageCanvas.SetContours([]);
        imageCanvas.SetPreviewMask(null);

        if (imageCanvas.HasSelection &&
            imageCanvas.InteractionMode is InteractionMode.SelectFreehand or InteractionMode.SelectRectangle)
        {
            SetInteractionMode(InteractionMode.Pan);
        }

        UpdateUiState();
    }

    private void imageCanvas_MarkersChanged(object? sender, EventArgs e)
    {
        _confirmedMask?.Dispose();
        _confirmedMask = null;
        imageCanvas.SetContours([]);
        imageCanvas.SetPreviewMask(null);
        UpdateUiState();
    }

    private void imageCanvas_ImageChanged(object? sender, EventArgs e)
    {
        UpdateUiState();
    }

    private void imageCanvas_ViewChanged(object? sender, CanvasViewChangedEventArgs e)
    {
        zoomStatusLabel.Text = L.F("Status.Zoom", (int)Math.Round(e.Zoom * 100));
    }

    private void TryLoadImage(string filePath)
    {
        if (!File.Exists(filePath))
        {
            ErrorDialogService.ShowError(
                this,
                L.Get("Error.OpenFailed"),
                L.Get("Error.FileNotFound"),
                new Dictionary<string, string?>
                {
                    [L.Get("Context.FilePath")] = filePath
                });
            return;
        }

        if (!ImageLoaderService.IsSupported(filePath))
        {
            ErrorDialogService.ShowError(
                this,
                L.Get("Error.UnsupportedFormat"),
                L.Get("Error.UnsupportedFormatBody"),
                new Dictionary<string, string?>
                {
                    [L.Get("Context.FilePath")] = filePath,
                    [L.Get("Context.Extension")] = Path.GetExtension(filePath),
                    [L.Get("Context.SupportedFormats")] = "webp, avif, png, gif, jpeg, bmp, tiff, heic, heif"
                });
            return;
        }

        try
        {
            ToggleBusy(true, L.Get("Status.LoadingImage"));
            Application.DoEvents();

            using var loaded = ImageLoaderService.Load(filePath);
            _workingSource?.Dispose();
            _workingSource = new Bitmap(loaded);

            _confirmedMask?.Dispose();
            _confirmedMask = null;
            _resultBitmap?.Dispose();
            _resultBitmap = null;
            _loadedFilePath = filePath;
            UserSettingsService.RememberPath(filePath);

            imageCanvas.LoadSourceImage(_workingSource);
            imageCanvas.ShowResult = false;
            chkShowResult.Checked = false;
            mnuShowResult.Checked = false;
            SetInteractionMode(InteractionMode.Pan);

            Text = $"Image Rembg - {Path.GetFileName(filePath)}";
            statusLabel.Text = $"{Path.GetFileName(filePath)} ({_workingSource.Width} x {_workingSource.Height})";
            UpdateUiState();
        }
        catch (Exception ex)
        {
            ErrorDialogService.ShowError(
                this,
                L.Get("Error.OpenFailed"),
                L.Get("Error.OpenFailedBody"),
                ex,
                new Dictionary<string, string?>
                {
                    [L.Get("Context.FilePath")] = filePath,
                    [L.Get("Context.FileSize")] = File.Exists(filePath) ? $"{new FileInfo(filePath).Length:N0} bytes" : null,
                    [L.Get("Context.Extension")] = Path.GetExtension(filePath)
                });
            statusLabel.Text = ErrorDialogService.FormatStatusMessage(L.Get("Error.OpenFailed"), ex);
        }
        finally
        {
            ToggleBusy(false, statusLabel.Text);
        }
    }

    private bool EnsureSourceReady(out Bitmap source)
    {
        if (_workingSource == null)
        {
            MessageBox.Show(this, L.Get("Msg.NoImageBody"), L.Get("Msg.NoImage"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            source = null!;
            return false;
        }

        source = _workingSource;
        return true;
    }

    private static bool HasHintMask(Mat? mask)
    {
        using (mask)
        {
            return SegmentationMaskBuilder.HasMaskContent(mask);
        }
    }

    private Dictionary<string, string?> BuildSegmentationContext(bool includeMaskState = false)
    {
        var context = new Dictionary<string, string?>
        {
            [L.Get("Context.Algorithm")] = SegmentationAlgorithmCatalog.GetDisplayName(_selectedAlgorithm),
            [L.Get("Context.SelectionMode")] = rbSelectRect.Checked ? L.Get("Common.Rectangle") : L.Get("Common.Freehand"),
            [L.Get("Context.SelectionArea")] = imageCanvas.HasSelection ? imageCanvas.SelectionRectangle.ToString() : L.Get("Common.None"),
            [L.Get("Context.ResultSize")] = GetOutputSizeModeLabel(GetOutputSizeMode()),
            [L.Get("Context.ForegroundHint")] = HasHintMask(imageCanvas.GetForegroundHintMaskClone()) ? L.Get("Common.Present") : L.Get("Common.Absent"),
            [L.Get("Context.BackgroundHint")] = HasHintMask(imageCanvas.GetBackgroundHintMaskClone()) ? L.Get("Common.Present") : L.Get("Common.Absent")
        };

        if (_workingSource != null)
        {
            context[L.Get("Context.ImageSize")] = $"{_workingSource.Width} x {_workingSource.Height}";
        }

        if (!string.IsNullOrWhiteSpace(_loadedFilePath))
        {
            context[L.Get("Context.File")] = Path.GetFileName(_loadedFilePath);
        }

        if (includeMaskState)
        {
            context[L.Get("Context.PreviewMask")] = _confirmedMask == null ? L.Get("Common.None") : L.Get("Common.Present");
        }

        return context;
    }

    private void UpdateUiState()
    {
        var hasImage = _workingSource != null;
        var hasSelection = imageCanvas.HasSelection;
        var hasPreview = _confirmedMask != null;
        var hasResult = _resultBitmap != null;

        btnPreview.Enabled = hasImage && hasSelection;
        btnRemoveBackground.Enabled = hasImage && (hasPreview || hasSelection);
        btnSave.Enabled = hasResult;
        btnReset.Enabled = hasImage;
        btnZoomIn.Enabled = hasImage;
        btnZoomOut.Enabled = hasImage;
        btnFit.Enabled = hasImage;
        chkShowResult.Enabled = hasResult;
        chkShowMask.Enabled = hasImage && !chkShowResult.Checked;

        mnuOpen.Enabled = true;
        mnuSave.Enabled = hasResult;
        mnuPreview.Enabled = hasImage && hasSelection;
        mnuRemoveBackground.Enabled = hasImage && (hasPreview || hasSelection);
        mnuReset.Enabled = hasImage;
        mnuZoomIn.Enabled = hasImage;
        mnuZoomOut.Enabled = hasImage;
        mnuFit.Enabled = hasImage;
        mnuShowResult.Enabled = hasResult;
        mnuShowMask.Enabled = hasImage && !chkShowResult.Checked;
        mnuSelectFreehand.Enabled = hasImage;
        mnuSelectRect.Enabled = hasImage;
        mnuForeground.Enabled = hasImage;
        mnuBackground.Enabled = hasImage;
        mnuPan.Enabled = hasImage;

        rbSelectFreehand.Enabled = hasImage;
        rbSelectRect.Enabled = hasImage;
        rbForeground.Enabled = hasImage;
        rbBackground.Enabled = hasImage;
        rbPan.Enabled = hasImage;
        cboResultSize.Enabled = hasImage;
        lblResultSize.Enabled = hasImage;

        SyncContextMenuState();
    }

    private void SyncContextMenuState()
    {
        if (_canvasContextMenu == null)
        {
            return;
        }

        var menu = _canvasContextMenu;

        menu.Open.Enabled = mnuOpen.Enabled;
        menu.Save.Enabled = mnuSave.Enabled;
        menu.Preview.Enabled = mnuPreview.Enabled;
        menu.RemoveBackground.Enabled = mnuRemoveBackground.Enabled;
        menu.Reset.Enabled = mnuReset.Enabled;
        menu.ZoomIn.Enabled = mnuZoomIn.Enabled;
        menu.ZoomOut.Enabled = mnuZoomOut.Enabled;
        menu.Fit.Enabled = mnuFit.Enabled;
        menu.ShowMask.Enabled = mnuShowMask.Enabled;
        menu.ShowResult.Enabled = mnuShowResult.Enabled;
        menu.SelectFreehand.Enabled = mnuSelectFreehand.Enabled;
        menu.SelectRect.Enabled = mnuSelectRect.Enabled;
        menu.Foreground.Enabled = mnuForeground.Enabled;
        menu.Background.Enabled = mnuBackground.Enabled;
        menu.Pan.Enabled = mnuPan.Enabled;

        menu.ShowMask.Checked = mnuShowMask.Checked;
        menu.ShowResult.Checked = mnuShowResult.Checked;
        menu.AlgoRembg.Checked = mnuAlgoRembg.Checked;
        menu.AlgoGrabCut.Checked = mnuAlgoGrabCut.Checked;
        menu.AlgoColorKey.Checked = mnuAlgoColorKey.Checked;
        menu.AlgoEdgeFill.Checked = mnuAlgoEdgeFill.Checked;
        menu.AlgoThreshold.Checked = mnuAlgoThreshold.Checked;

        SyncToolMenuChecksForMode(imageCanvas.InteractionMode);
    }

    private void ToggleBusy(bool busy, string? statusText)
    {
        UseWaitCursor = busy;
        menuStrip.Enabled = !busy;
        panelToolbar.Enabled = !busy;
        imageCanvas.Enabled = !busy;
        if (!string.IsNullOrWhiteSpace(statusText))
        {
            statusLabel.Text = statusText;
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        L.Changed -= OnLanguageChanged;
        _workingSource?.Dispose();
        _confirmedMask?.Dispose();
        _resultBitmap?.Dispose();
        base.OnFormClosed(e);
    }
}

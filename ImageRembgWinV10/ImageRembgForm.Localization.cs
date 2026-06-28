using ImageRembgWinV10.Controls;
using ImageRembgWinV10.Localization;
using ImageRembgWinV10.Resources;
using ImageRembgWinV10.Services;

namespace ImageRembgWinV10;

public partial class ImageRembgForm
{
    private ToolStripMenuItem? mnuPreferences;
    private ToolStripSeparator? toolStripSeparatorPreferences;

    private void InitializePreferencesMenu()
    {
        mnuPreferences = new ToolStripMenuItem();
        mnuPreferences.Click += (_, _) => ShowPreferences();
        toolStripSeparatorPreferences = new ToolStripSeparator();

        var exitIndex = mnuFile.DropDownItems.IndexOf(mnuExit);
        mnuFile.DropDownItems.Insert(exitIndex, mnuPreferences);
        mnuFile.DropDownItems.Insert(exitIndex + 1, toolStripSeparatorPreferences);
    }

    private void ShowPreferences()
    {
        var selected = PreferencesForm.ShowPreferences(this, L.Current);
        if (selected != null)
        {
            SetLanguage(selected.Value);
        }
    }

    private void SetLanguage(AppLanguage language)
    {
        L.SetLanguage(language);
    }

    private void OnLanguageChanged(object? sender, EventArgs e)
    {
        ApplyLocalization();
    }

    private void ApplyLocalization()
    {
        Text = string.IsNullOrWhiteSpace(_loadedFilePath)
            ? L.Get("Form.Title")
            : $"Image Rembg - {Path.GetFileName(_loadedFilePath)}";

        mnuFile.Text = L.Get("Menu.File");
        mnuOpen.Text = L.Get("Menu.Open");
        mnuSave.Text = L.Get("Menu.Save");
        mnuExit.Text = L.Get("Menu.Exit");
        mnuEdit.Text = L.Get("Menu.Edit");
        mnuUndo.Text = L.Get("Menu.Undo");
        mnuRedo.Text = L.Get("Menu.Redo");
        mnuPreview.Text = L.Get("Menu.Preview");
        mnuRemoveBackground.Text = L.Get("Menu.RemoveBackground");
        mnuReset.Text = L.Get("Menu.Reset");
        mnuView.Text = L.Get("Menu.View");
        mnuZoomIn.Text = L.Get("Menu.ZoomIn");
        mnuZoomOut.Text = L.Get("Menu.ZoomOut");
        mnuFit.Text = L.Get("Menu.Fit");
        mnuShowMask.Text = L.Get("Menu.ShowMask");
        mnuShowResult.Text = L.Get("Menu.ShowResult");
        mnuTools.Text = L.Get("Menu.Tools");
        mnuSelectFreehand.Text = L.Get("Menu.SelectFreehand");
        mnuSelectRect.Text = L.Get("Menu.SelectRect");
        mnuForeground.Text = L.Get("Menu.Foreground");
        mnuBackground.Text = L.Get("Menu.Background");
        mnuPan.Text = L.Get("Menu.PanDrag");
        mnuAlgorithm.Text = L.Get("Menu.Algorithm");
        mnuAlgoRembg.Text = L.Get("Algo.Rembg.Name");
        mnuAlgoRembg2.Text = L.Get("Algo.Rembg2.Name");
        mnuAlgoGrabCut.Text = L.Get("Algo.GrabCut.Name");
        mnuAlgoColorKey.Text = L.Get("Algo.ColorKey.Name");
        mnuAlgoEdgeFill.Text = L.Get("Algo.EdgeFill.Name");
        mnuAlgoThreshold.Text = L.Get("Algo.Threshold.Name");
        if (mnuHelp != null)
        {
            mnuHelp.Text = L.Get("Menu.Help");
        }

        if (mnuAbout != null)
        {
            mnuAbout.Text = L.Get("Menu.About");
        }

        btnOpen.Text = L.Get("Menu.Open");
        btnUndo.Text = L.Get("Menu.Undo");
        btnRedo.Text = L.Get("Menu.Redo");
        btnPreview.Text = L.Get("Toolbar.PreviewShort");
        btnRemoveBackground.Text = L.Get("Toolbar.RemoveBackgroundShort");
        btnSave.Text = L.Get("Menu.Save");
        btnReset.Text = L.Get("Menu.Reset");
        btnZoomOut.Text = L.Get("Menu.ZoomOut");
        btnZoomIn.Text = L.Get("Menu.ZoomIn");
        btnFit.Text = L.Get("Menu.FitShort");
        btnInfo.Text = L.Get("Menu.Info");

        rbSelectFreehand.Text = L.Get("Toolbar.SelectFreehandShort");
        rbSelectRect.Text = L.Get("Menu.SelectRectShort");
        rbForeground.Text = L.Get("Toolbar.ForegroundShort");
        rbBackground.Text = L.Get("Toolbar.BackgroundShort");
        rbPan.Text = L.Get("Menu.Pan");
        chkShowMask.Text = L.Get("Toolbar.ShowMaskShort");
        chkShowResult.Text = L.Get("Toolbar.ShowResultShort");
        lblResultSize.Text = L.Get("Label.ResultSize");
        lblAlgorithm.Text = L.Get("Label.Algorithm");

        if (mnuPreferences != null)
        {
            mnuPreferences.Text = L.Get("Menu.Preferences");
        }

        RefreshAlgorithmCombo();
        RefreshResultSizeCombo();
        _canvasContextMenu?.ApplyLocalization();
        UpdateModeStatusLabel();
        zoomStatusLabel.Text = L.F("Status.Zoom", (int)Math.Round(imageCanvas.ZoomFactor * 100));

        if (_workingSource == null && !UseWaitCursor)
        {
            statusLabel.Text = L.Get("Status.Ready");
        }

        imageCanvas.Invalidate();
        ApplyTooltips();
        InitializeToolbarLayout();
        UpdateToolbarDynamicLayout();
    }

    private void RefreshAlgorithmCombo()
    {
        var selected = _selectedAlgorithm;
        _syncingAlgorithm = true;
        cboAlgorithm.Items.Clear();
        foreach (var option in SegmentationAlgorithmCatalog.GetOptions())
        {
            cboAlgorithm.Items.Add(option);
        }

        SyncAlgorithmUi(selected, clearPreview: false);
        _syncingAlgorithm = false;
    }

    private void RefreshResultSizeCombo()
    {
        var selected = GetOutputSizeMode();
        _syncingResultSize = true;
        cboResultSize.Items.Clear();
        cboResultSize.Items.Add(new OutputSizeModeOption(OutputSizeMode.Original, L.Get("OutputSize.Original")));
        cboResultSize.Items.Add(new OutputSizeModeOption(OutputSizeMode.SelectionCrop, L.Get("OutputSize.Selection")));
        SelectOutputSizeMode(selected);
        _syncingResultSize = false;
    }

    private static string GetOutputSizeModeLabel(OutputSizeMode mode)
    {
        return mode == OutputSizeMode.Original ? L.Get("OutputSize.Original") : L.Get("OutputSize.Selection");
    }

    private string GetModeLabel(InteractionMode mode)
    {
        var modeName = mode switch
        {
            InteractionMode.Pan => L.Get("Mode.Pan"),
            InteractionMode.SelectFreehand => L.Get("Mode.SelectFreehand"),
            InteractionMode.SelectRectangle => L.Get("Mode.SelectRect"),
            InteractionMode.MarkForeground => L.Get("Mode.Foreground"),
            InteractionMode.MarkBackground => L.Get("Mode.Background"),
            _ => L.Get("Mode.Unknown")
        };

        return L.F("Status.Mode", modeName);
    }
}

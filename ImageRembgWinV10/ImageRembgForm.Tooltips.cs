using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10;

public partial class ImageRembgForm
{
    private ToolTip? _toolTip;

    private void InitializeTooltips()
    {
        _toolTip = new ToolTip(components)
        {
            AutoPopDelay = 10000,
            InitialDelay = 400,
            ReshowDelay = 200,
            ShowAlways = true
        };

        menuStrip.ShowItemToolTips = true;
        ApplyTooltips();
    }

    private void ApplyTooltips()
    {
        if (_toolTip == null)
        {
            return;
        }

        SetMenuToolTip(mnuFile, "Tooltip.Menu.File");
        SetMenuToolTip(mnuOpen, "Tooltip.Open");
        SetMenuToolTip(mnuSave, "Tooltip.Save");
        SetMenuToolTip(mnuExit, "Tooltip.Exit");

        SetMenuToolTip(mnuEdit, "Tooltip.Menu.Edit");
        SetMenuToolTip(mnuUndo, "Tooltip.Undo");
        SetMenuToolTip(mnuRedo, "Tooltip.Redo");
        SetMenuToolTip(mnuPreview, "Tooltip.Preview");
        SetMenuToolTip(mnuRemoveBackground, "Tooltip.RemoveBackground");
        SetMenuToolTip(mnuReset, "Tooltip.Reset");

        SetMenuToolTip(mnuView, "Tooltip.Menu.View");
        SetMenuToolTip(mnuZoomIn, "Tooltip.ZoomIn");
        SetMenuToolTip(mnuZoomOut, "Tooltip.ZoomOut");
        SetMenuToolTip(mnuFit, "Tooltip.Fit");
        SetMenuToolTip(mnuShowMask, "Tooltip.ShowMask");
        SetMenuToolTip(mnuShowResult, "Tooltip.ShowResult");

        SetMenuToolTip(mnuTools, "Tooltip.Menu.Tools");
        SetMenuToolTip(mnuSelectFreehand, "Tooltip.SelectFreehand");
        SetMenuToolTip(mnuSelectRect, "Tooltip.SelectRect");
        SetMenuToolTip(mnuForeground, "Tooltip.Foreground");
        SetMenuToolTip(mnuBackground, "Tooltip.Background");
        SetMenuToolTip(mnuPan, "Tooltip.Pan");

        SetMenuToolTip(mnuAlgorithm, "Tooltip.Menu.Algorithm");
        SetMenuToolTip(mnuAlgoRembg, "Algo.Rembg.Desc");
        SetMenuToolTip(mnuAlgoRembg2, "Algo.Rembg2.Desc");
        SetMenuToolTip(mnuAlgoGrabCut, "Algo.GrabCut.Desc");
        SetMenuToolTip(mnuAlgoColorKey, "Algo.ColorKey.Desc");
        SetMenuToolTip(mnuAlgoEdgeFill, "Algo.EdgeFill.Desc");
        SetMenuToolTip(mnuAlgoThreshold, "Algo.Threshold.Desc");

        if (mnuPreferences != null)
        {
            SetMenuToolTip(mnuPreferences, "Tooltip.Preferences");
        }

        if (mnuHelp != null)
        {
            SetMenuToolTip(mnuHelp, "Tooltip.Menu.Help");
        }

        if (mnuAbout != null)
        {
            SetMenuToolTip(mnuAbout, "Tooltip.About");
        }

        SetControlToolTip(btnOpen, "Tooltip.Open");
        SetControlToolTip(btnUndo, "Tooltip.Undo");
        SetControlToolTip(btnRedo, "Tooltip.Redo");
        SetControlToolTip(btnPreview, "Tooltip.Preview");
        SetControlToolTip(btnRemoveBackground, "Tooltip.RemoveBackground");
        SetControlToolTip(btnSave, "Tooltip.Save");
        SetControlToolTip(btnReset, "Tooltip.Reset");
        SetControlToolTip(btnZoomOut, "Tooltip.ZoomOut");
        SetControlToolTip(btnZoomIn, "Tooltip.ZoomIn");
        SetControlToolTip(btnFit, "Tooltip.Fit");
        SetControlToolTip(btnInfo, "Tooltip.Info");

        SetControlToolTip(rbSelectFreehand, "Tooltip.SelectFreehand");
        SetControlToolTip(rbSelectRect, "Tooltip.SelectRect");
        SetControlToolTip(rbForeground, "Tooltip.Foreground");
        SetControlToolTip(rbBackground, "Tooltip.Background");
        SetControlToolTip(rbPan, "Tooltip.Pan");

        SetControlToolTip(chkShowMask, "Tooltip.ShowMask");
        SetControlToolTip(chkShowResult, "Tooltip.ShowResult");

        SetControlToolTip(lblResultSize, "Tooltip.ResultSize");
        SetControlToolTip(cboResultSize, "Tooltip.ResultSizeCombo");
        SetControlToolTip(lblAlgorithm, "Tooltip.Algorithm");
        SetControlToolTip(cboAlgorithm, "Tooltip.AlgorithmCombo");
    }

    private static void SetMenuToolTip(ToolStripItem item, string localizationKey)
    {
        item.ToolTipText = L.Get(localizationKey);
    }

    private void SetControlToolTip(Control control, string localizationKey)
    {
        _toolTip?.SetToolTip(control, L.Get(localizationKey));
    }
}

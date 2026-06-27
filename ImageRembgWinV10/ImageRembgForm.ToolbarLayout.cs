namespace ImageRembgWinV10;

public partial class ImageRembgForm
{
    private const int ToolbarButtonHeight = 28;
    private const int ToolbarGap = 6;
    private const int ToolbarRow1Y = 8;
    private const int ToolbarRow2Y = 44;
    private const int ToolbarRow3Y = 76;
    private const int ToolbarMinHintWidth = 80;
    private const int ToolbarInfoGap = 8;
    private const int ToolbarMinCanvasHeight = 400;

    private int _toolbarButtonWidth;
    private int _toolbarHintLeft;
    private int _toolbarMinimumWidth;

    private void InitializeToolbarLayout()
    {
        panelToolbar.AutoScroll = false;
        btnInfo.Anchor = AnchorStyles.None;

        _toolbarButtonWidth = MeasureUniformToolbarButtonWidth();
        LayoutToolbarRows();
        UpdateToolbarDynamicLayout();
        ApplyMinimumFormSize();

        panelToolbar.Resize -= panelToolbar_Resize;
        panelToolbar.Resize += panelToolbar_Resize;
    }

    private void LayoutToolbarRows()
    {
        var x = panelToolbar.Padding.Left;
        foreach (var button in new Button[]
                 {
                     btnOpen, btnPreview, btnRemoveBackground, btnSave, btnReset, btnZoomOut, btnZoomIn, btnFit
                 })
        {
            LayoutToolbarControl(button, ref x, ToolbarRow1Y, _toolbarButtonWidth, ToolbarButtonHeight, ToolbarGap);
        }

        x = panelToolbar.Padding.Left;
        foreach (var button in new ButtonBase[]
                 {
                     rbSelectFreehand, rbSelectRect, rbForeground, rbBackground, rbPan
                 })
        {
            LayoutToolbarControl(button, ref x, ToolbarRow2Y, _toolbarButtonWidth, ToolbarButtonHeight, ToolbarGap);
        }

        x = panelToolbar.Padding.Left;
        LayoutToolbarControl(chkShowMask, ref x, ToolbarRow3Y, _toolbarButtonWidth, ToolbarButtonHeight, ToolbarGap);
        LayoutToolbarControl(chkShowResult, ref x, ToolbarRow3Y, _toolbarButtonWidth, ToolbarButtonHeight, ToolbarGap);
        LayoutToolbarLabel(lblResultSize, ref x, ToolbarRow3Y, ToolbarButtonHeight, ToolbarGap);

        cboResultSize.AutoSize = false;
        cboResultSize.Location = new Point(x, ToolbarRow3Y);
        cboResultSize.Size = new Size(118, ToolbarButtonHeight);
        cboResultSize.DropDownStyle = ComboBoxStyle.DropDownList;
        x += cboResultSize.Width + ToolbarGap;

        LayoutToolbarLabel(lblAlgorithm, ref x, ToolbarRow3Y, ToolbarButtonHeight, ToolbarGap);
        LayoutToolbarControl(cboAlgorithm, ref x, ToolbarRow3Y, 210, ToolbarButtonHeight, ToolbarGap);

        _toolbarHintLeft = x;
        LayoutToolbarHint(lblHint, x, ToolbarRow3Y, ToolbarButtonHeight);
    }

    private void UpdateToolbarDynamicLayout()
    {
        LayoutInfoButton(ToolbarButtonHeight);

        var availableWidth = panelToolbar.ClientSize.Width - panelToolbar.Padding.Right;
        if (availableWidth < _toolbarMinimumWidth && _toolbarMinimumWidth > 0)
        {
            btnInfo.Left = _toolbarMinimumWidth - btnInfo.Width - panelToolbar.Padding.Right;
        }
        else
        {
            btnInfo.Left = Math.Max(_toolbarHintLeft + ToolbarMinHintWidth + ToolbarInfoGap,
                availableWidth - btnInfo.Width);
        }

        btnInfo.Top = ToolbarRow3Y;
        lblHint.Left = _toolbarHintLeft;
        lblHint.Top = ToolbarRow3Y;
        lblHint.Height = ToolbarButtonHeight;

        var hintRight = btnInfo.Left - ToolbarInfoGap;
        lblHint.Width = Math.Max(ToolbarMinHintWidth, hintRight - _toolbarHintLeft);

        _toolbarMinimumWidth = btnInfo.Right + panelToolbar.Padding.Right;
    }

    private void ApplyMinimumFormSize()
    {
        var row1Width = panelToolbar.Padding.Left
            + (8 * _toolbarButtonWidth) + (7 * ToolbarGap)
            + panelToolbar.Padding.Right;
        var row2Width = panelToolbar.Padding.Left
            + (5 * _toolbarButtonWidth) + (4 * ToolbarGap)
            + panelToolbar.Padding.Right;
        var contentWidth = Math.Max(row1Width, Math.Max(row2Width, _toolbarMinimumWidth));

        var chromeWidth = Size.Width - ClientSize.Width;
        var chromeHeight = Size.Height - ClientSize.Height;
        MinimumSize = new Size(
            contentWidth + chromeWidth,
            menuStrip.Height + panelToolbar.Height + statusStrip.Height + ToolbarMinCanvasHeight + chromeHeight);
    }

    private void panelToolbar_Resize(object? sender, EventArgs e)
    {
        UpdateToolbarDynamicLayout();
    }

    private int MeasureUniformToolbarButtonWidth()
    {
        const int iconPadding = 34;
        var maxTextWidth = 0;
        foreach (var control in new Control[]
                 {
                     btnOpen, btnPreview, btnRemoveBackground, btnSave, btnReset, btnZoomOut, btnZoomIn, btnFit,
                     rbSelectFreehand, rbSelectRect, rbForeground, rbBackground, rbPan, chkShowMask, chkShowResult,
                     btnInfo
                 })
        {
            var textWidth = TextRenderer.MeasureText(control.Text, control.Font).Width;
            maxTextWidth = Math.Max(maxTextWidth, textWidth);
        }

        return Math.Max(72, maxTextWidth + iconPadding);
    }

    private int MeasureInfoButtonWidth()
    {
        const int iconPadding = 34;
        var textWidth = TextRenderer.MeasureText(btnInfo.Text, btnInfo.Font).Width;
        return Math.Max(72, textWidth + iconPadding);
    }
}

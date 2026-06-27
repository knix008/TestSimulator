using ImageRembgWinV10.Controls;
using ImageRembgWinV10.Localization;
using ImageRembgWinV10.Resources;
using ImageRembgWinV10.Services;

namespace ImageRembgWinV10;

public partial class ImageRembgForm
{
    private const int ToolbarButtonHeight = 26;
    private const int ToolbarGap = 8;
    private const int ToolbarTopInset = 8;
    private const int ToolbarRow1Y = ToolbarTopInset;
    private const int ToolbarRow2Y = ToolbarRow1Y + ToolbarButtonHeight + ToolbarGap;
    private const int ToolbarRow3Y = ToolbarRow2Y + ToolbarButtonHeight + ToolbarGap;
    private const int ToolbarInfoGap = 12;
    private const int ToolbarMinCanvasHeight = 400;
    private const int ToolbarIconTextGap = CenteredIconTextPainter.IconTextGap;
    private const int ToolbarLabelPadding = 4;
    private const int ToolbarResultSizeComboWidth = 118;
    private const int ToolbarAlgorithmComboWidth = 210;

    private static readonly string[] ToolbarButtonLocalizationKeys =
    [
        "Menu.Open",
        "Menu.Save",
        "Toolbar.PreviewShort",
        "Toolbar.RemoveBackgroundShort",
        "Menu.Reset",
        "Menu.Info",
        "Menu.Pan",
        "Toolbar.SelectFreehandShort",
        "Menu.SelectRectShort",
        "Toolbar.ForegroundShort",
        "Toolbar.BackgroundShort",
        "Menu.ZoomOut",
        "Menu.ZoomIn",
        "Menu.FitShort",
        "Toolbar.ShowMaskShort",
        "Toolbar.ShowResultShort"
    ];

    private int _toolbarContentWidth;
    private int _toolbarUniformButtonWidth;
    private int _toolbarUniformLabelWidth;

    private void InitializeToolbarLayout()
    {
        panelToolbar.AutoScroll = true;
        btnInfo.Anchor = AnchorStyles.None;
        lblHint.Visible = false;
        cboResultSize.Anchor = AnchorStyles.None;
        cboAlgorithm.Anchor = AnchorStyles.None;

        ConfigureToolbarCombo(cboResultSize);
        ConfigureToolbarCombo(cboAlgorithm);

        panelToolbar.Padding = new Padding(10, 8, 10, 8);
        panelToolbar.Height = ToolbarRow3Y + ToolbarButtonHeight + panelToolbar.Padding.Bottom;

        ComputeUniformToolbarSizes();
        LayoutToolbarRows();
        UpdateToolbarDynamicLayout();
        ApplyMinimumFormSize();

        panelToolbar.Resize -= panelToolbar_Resize;
        panelToolbar.Resize += panelToolbar_Resize;
    }

    private static void ConfigureToolbarCombo(ComboBox comboBox)
    {
        comboBox.AutoSize = false;
        comboBox.DropDownStyle = ComboBoxStyle.DropDownList;
        comboBox.IntegralHeight = false;
    }

    private void ComputeUniformToolbarSizes()
    {
        _toolbarUniformButtonWidth = ToolbarButtonLocalizationKeys
            .Select(key => MeasureToolbarButtonContentWidth(key, btnOpen.Font))
            .DefaultIfEmpty(0)
            .Max();

        _toolbarUniformLabelWidth = Math.Max(
            MeasureBilingualTextWidth("Label.ResultSize", lblResultSize.Font),
            MeasureBilingualTextWidth("Label.Algorithm", lblAlgorithm.Font))
            + ToolbarLabelPadding;
    }

    private void LayoutToolbarRows()
    {
        var x = panelToolbar.Padding.Left;

        // Row 1 — 파일 · 편집 (+ Info는 우측 고정)
        LayoutToolbarButton(btnOpen, ref x, ToolbarRow1Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(btnSave, ref x, ToolbarRow1Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(btnPreview, ref x, ToolbarRow1Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(btnRemoveBackground, ref x, ToolbarRow1Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(btnReset, ref x, ToolbarRow1Y, _toolbarUniformButtonWidth);
        var row1Width = x;

        x = panelToolbar.Padding.Left;

        // Row 2 — 이동 · 선택 · 전경/배경 · 표시
        LayoutToolbarButton(rbPan, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(rbSelectFreehand, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(rbSelectRect, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(rbForeground, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(rbBackground, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(chkShowMask, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(chkShowResult, ref x, ToolbarRow2Y, _toolbarUniformButtonWidth);
        var row2Width = x;

        x = panelToolbar.Padding.Left;

        // Row 3 — 출력 설정 · 확대/축소/맞춤
        LayoutToolbarLabel(lblResultSize, ref x, ToolbarRow3Y);
        PlaceComboInToolbarRow(cboResultSize, ref x, ToolbarRow3Y, ToolbarResultSizeComboWidth);
        LayoutToolbarLabel(lblAlgorithm, ref x, ToolbarRow3Y);
        PlaceComboInToolbarRow(cboAlgorithm, ref x, ToolbarRow3Y, ToolbarAlgorithmComboWidth);
        LayoutToolbarButton(btnZoomOut, ref x, ToolbarRow3Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(btnZoomIn, ref x, ToolbarRow3Y, _toolbarUniformButtonWidth);
        LayoutToolbarButton(btnFit, ref x, ToolbarRow3Y, _toolbarUniformButtonWidth);

        var row3FixedWidth = x + panelToolbar.Padding.Right;

        var row1WithInfoWidth = row1Width
            + ToolbarInfoGap
            + _toolbarUniformButtonWidth
            + panelToolbar.Padding.Right;

        _toolbarContentWidth = Math.Max(
            row1WithInfoWidth,
            Math.Max(row2Width, row3FixedWidth));
    }

    private void UpdateToolbarDynamicLayout()
    {
        var infoWidth = _toolbarUniformButtonWidth;
        var paddedRight = Math.Max(
            panelToolbar.ClientSize.Width - panelToolbar.Padding.Right,
            _toolbarContentWidth);

        btnInfo.SetBounds(
            paddedRight - infoWidth,
            ToolbarRow1Y,
            infoWidth,
            ToolbarButtonHeight);

        _toolbarContentWidth = Math.Max(_toolbarContentWidth, btnInfo.Right + panelToolbar.Padding.Right);
        panelToolbar.AutoScrollMinSize = new Size(_toolbarContentWidth, 0);
    }

    private void LayoutToolbarButton(Control control, ref int x, int rowY, int width)
    {
        PlaceInToolbarRow(control, ref x, rowY, width);
    }

    private void LayoutToolbarLabel(Label label, ref int x, int rowY)
    {
        label.AutoSize = false;
        label.TextAlign = ContentAlignment.MiddleLeft;
        PlaceInToolbarRow(label, ref x, rowY, _toolbarUniformLabelWidth);
    }

    private static void PlaceInToolbarRow(Control control, ref int x, int rowY, int width)
    {
        control.AutoSize = false;
        control.SetBounds(x, rowY, width, ToolbarButtonHeight);
        x += width + ToolbarGap;
    }

    private static void PlaceComboInToolbarRow(ComboBox combo, ref int x, int rowY, int width)
    {
        combo.AutoSize = false;
        var height = combo.PreferredHeight;
        var y = rowY + (ToolbarButtonHeight - height) / 2;
        combo.SetBounds(x, y, width, height);
        x += width + ToolbarGap;
    }

    private void ApplyMinimumFormSize()
    {
        ComputeUniformToolbarSizes();

        var row1Width = MeasureToolbarRowWidth(5, _toolbarUniformButtonWidth);
        var row2Width = MeasureToolbarRowWidth(7, _toolbarUniformButtonWidth);
        var row3Width = panelToolbar.Padding.Left
            + _toolbarUniformLabelWidth + ToolbarGap
            + ToolbarResultSizeComboWidth + ToolbarGap
            + _toolbarUniformLabelWidth + ToolbarGap
            + ToolbarAlgorithmComboWidth + ToolbarGap
            + (_toolbarUniformButtonWidth + ToolbarGap) * 3
            + panelToolbar.Padding.Right;

        var row1WithInfoWidth = row1Width
            + ToolbarInfoGap
            + _toolbarUniformButtonWidth
            + panelToolbar.Padding.Right;

        var contentWidth = Math.Max(
            row1WithInfoWidth,
            Math.Max(row2Width, Math.Max(row3Width, _toolbarContentWidth)));

        var chromeWidth = Size.Width - ClientSize.Width;
        var chromeHeight = Size.Height - ClientSize.Height;
        MinimumSize = new Size(
            contentWidth + chromeWidth,
            menuStrip.Height + panelToolbar.Height + statusStrip.Height + ToolbarMinCanvasHeight + chromeHeight);
    }

    private void panelToolbar_Resize(object? sender, EventArgs e)
    {
        ComputeUniformToolbarSizes();
        LayoutToolbarRows();
        UpdateToolbarDynamicLayout();
    }

    private int MeasureToolbarRowWidth(int buttonCount, int buttonWidth)
    {
        var width = panelToolbar.Padding.Left + panelToolbar.Padding.Right;
        width += buttonCount * buttonWidth;
        width += Math.Max(0, buttonCount - 1) * ToolbarGap;
        return width;
    }

    private static int MeasureBilingualTextWidth(string localizationKey, Font font)
    {
        var koWidth = TextRenderer.MeasureText(
            L.Get(AppLanguage.Korean, localizationKey),
            font,
            new Size(int.MaxValue, int.MaxValue),
            TextFormatFlags.SingleLine | TextFormatFlags.NoPadding).Width;
        var enWidth = TextRenderer.MeasureText(
            L.Get(AppLanguage.English, localizationKey),
            font,
            new Size(int.MaxValue, int.MaxValue),
            TextFormatFlags.SingleLine | TextFormatFlags.NoPadding).Width;
        return Math.Max(koWidth, enWidth);
    }

    private static int MeasureToolbarButtonContentWidth(string localizationKey, Font font)
    {
        var textWidth = MeasureBilingualTextWidth(localizationKey, font);
        return CenteredIconTextPainter.HorizontalPadding * 2
            + AppIconFactory.Size
            + ToolbarIconTextGap
            + textWidth;
    }
}

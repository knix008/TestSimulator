using System.ComponentModel;
using SVGEditorWinV10.Controls;
using SVGEditorWinV10.Export;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;
using SVGEditorWinV10.Serialization;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10;

public partial class MainForm : Form
{
    private string? _currentFilePath;
    private bool _isDirty;
    private EditorTool _activeTool = EditorTool.Select;
    private (ToolStripButton Button, EditorTool Tool)[] _toolBindings = [];
    private (ToolStripMenuItem Menu, EditorTool Tool)[] _menuToolBindings = [];
    private bool _suppressPropertySync;

    public MainForm()
    {
        InitializeComponent();
        if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
            InitializeRuntime();
    }

    private void InitializeRuntime()
    {
        ApplyModernTheme();
        ApplyApplicationIcon();
        SetupToolIcons();
        SetupMenuToolTips();

        _canvas.DocumentChanged += (_, _) =>
        {
            _isDirty = true;
            UpdateTitle();
            SyncSvgSourceFromCanvas();
            UpdateStatus();
        };
        _canvas.SelectionChanged += (_, _) =>
        {
            SyncPropertyPanel();
            UpdateStatus();
            FocusTextEditorIfNeeded();
        };
        _canvas.TextEditRequested += (_, _) => FocusTextEditorIfNeeded(selectAll: true);
        _canvas.ZoomChanged += (_, _) => UpdateZoomDisplay();

        WireToolButtons();
        WireMenuTools();
        WirePropertyPanel();
        WireZoomButtons();
        SetActiveTool(EditorTool.Select);
        _canvas.NewDocument();
        InitializePropertyOptions();
        SyncPropertyPanel();
        SyncSvgSourceFromCanvas();
        UpdateTitle();
        UpdateStatus();
        UpdateZoomDisplay();
    }

    private void ApplyApplicationIcon()
    {
        var icon = AppIcons.LoadApplicationIcon();
        if (icon is null)
            return;

        Icon = icon;
    }

    private void SetupToolIcons()
    {
        _btnSelect.Image = EditorToolIcons.Select;
        _btnRectangle.Image = EditorToolIcons.Rectangle;
        _btnRoundedRect.Image = EditorToolIcons.RoundedRectangle;
        _btnEllipse.Image = EditorToolIcons.Ellipse;
        _btnTriangle.Image = EditorToolIcons.Triangle;
        _btnDiamond.Image = EditorToolIcons.Diamond;
        _btnHexagon.Image = EditorToolIcons.Hexagon;
        _btnParallelogram.Image = EditorToolIcons.Parallelogram;
        _btnStar.Image = EditorToolIcons.Star;
        _btnLine.Image = EditorToolIcons.Line;
        _btnText.Image = EditorToolIcons.Text;
        _btnImage.Image = EditorToolIcons.Image;

        _btnZoomIn.Image = EditorToolIcons.ZoomIn;
        _btnZoomOut.Image = EditorToolIcons.ZoomOut;
        _btnZoomReset.Image = EditorToolIcons.ZoomReset;

        SetupCommandIcons();
    }

    private void SetupCommandIcons()
    {
        _menuFile.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.File);
        _menuEdit.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Edit);
        _menuTools.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Tools);
        _menuView.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.View);

        _menuNew.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.NewDocument);
        _menuOpen.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Open);
        _menuSave.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Save);
        _menuSaveAs.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.SaveAs);
        _menuCanvasSize.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.CanvasSize);
        _menuExportImage.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.ExportImage);
        _menuExit.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Exit);

        _menuDelete.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Delete);
        _menuApplySource.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Apply);
        _menuCopySource.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Copy);

        _menuZoomIn.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.ZoomIn);
        _menuZoomOut.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.ZoomOut);
        _menuZoomReset.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.ZoomReset);

        _menuToolSelect.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Select);
        _menuToolRectangle.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Rectangle);
        _menuToolRoundedRect.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.RoundedRectangle);
        _menuToolEllipse.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Ellipse);
        _menuToolTriangle.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Triangle);
        _menuToolDiamond.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Diamond);
        _menuToolHexagon.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Hexagon);
        _menuToolParallelogram.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Parallelogram);
        _menuToolStar.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Star);
        _menuToolLine.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Line);
        _menuToolText.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Text);
        _menuToolImage.Image = EditorToolIcons.ToMenuSize(EditorToolIcons.Image);

        _tbNew.Image = EditorToolIcons.NewDocument;
        _tbOpen.Image = EditorToolIcons.Open;
        _tbSave.Image = EditorToolIcons.Save;
        _tbSaveAs.Image = EditorToolIcons.SaveAs;
        _tbCanvasSize.Image = EditorToolIcons.CanvasSize;
        _tbExportImage.Image = EditorToolIcons.ExportImage;
        _tbDelete.Image = EditorToolIcons.Delete;
        _tbZoomIn.Image = EditorToolIcons.ZoomIn;
        _tbZoomOut.Image = EditorToolIcons.ZoomOut;
        _tbZoomReset.Image = EditorToolIcons.ZoomReset;
        _tbApplySource.Image = EditorToolIcons.Apply;
        _tbCopySource.Image = EditorToolIcons.Copy;

        ConfigureSourceButton(_btnApplySource, EditorToolIcons.Apply);
        ConfigureSourceButton(_btnCopySource, EditorToolIcons.Copy);
    }

    private void SetupMenuToolTips()
    {
        _menuStrip.ShowItemToolTips = true;
        _toolStripMain.ShowItemToolTips = true;
        _toolStripTools.ShowItemToolTips = true;

        _menuFile.ToolTipText = "문서 만들기, 열기, 저장, 이미지보내기 및 종료";
        _menuNew.ToolTipText = "빈 SVG 문서를 새로 만듭니다. (Ctrl+N)";
        _menuOpen.ToolTipText = "SVG 파일을 엽니다. (Ctrl+O)";
        _menuSave.ToolTipText = "현재 문서를 저장합니다. 경로가 없으면 다른 이름으로 저장합니다. (Ctrl+S)";
        _menuSaveAs.ToolTipText = "현재 문서를 다른 파일 이름으로 저장합니다.";
        _menuCanvasSize.ToolTipText = "SVG 문서(캔버스)의 가로·세로 크기를 설정합니다. 기존 그림은 원래 위치에 유지됩니다.";
        _menuExportImage.ToolTipText = "캔버스를 PNG, JPEG, GIF, WebP, AVIF 이미지로보냅니다.";
        _menuExit.ToolTipText = "프로그램을 종료합니다. 저장하지 않은 변경 사항이 있으면 확인합니다.";

        _menuEdit.ToolTipText = "선택 항목 삭제 및 SVG 소스 편집";
        _menuDelete.ToolTipText = "선택한 도형·선·텍스트를 삭제합니다. (Delete)";
        _menuApplySource.ToolTipText = "오른쪽 SVG 소스 편집 내용을 캔버스에 적용합니다.";
        _menuCopySource.ToolTipText = "SVG 소스 전체를 클립보드에 복사합니다.";

        _menuTools.ToolTipText = "캔버스에 그릴 도형·선·텍스트 도구";
        _menuToolSelect.ToolTipText = "도형을 선택하고 이동합니다. (Esc)";
        _menuToolRectangle.ToolTipText = "사각형을 그립니다.";
        _menuToolRoundedRect.ToolTipText = "모서리가 둥근 사각형을 그립니다.";
        _menuToolEllipse.ToolTipText = "타원을 그립니다.";
        _menuToolTriangle.ToolTipText = "삼각형을 그립니다.";
        _menuToolDiamond.ToolTipText = "마름모를 그립니다.";
        _menuToolHexagon.ToolTipText = "육각형을 그립니다.";
        _menuToolParallelogram.ToolTipText = "평행사변형을 그립니다.";
        _menuToolStar.ToolTipText = "별 모양을 그립니다.";
        _menuToolLine.ToolTipText = "직선을 그립니다.";
        _menuToolText.ToolTipText = "텍스트를 배치합니다.";
        _menuToolImage.ToolTipText = "외부 이미지(PNG, GIF, JPEG, WebP, AVIF)를 불러와 배치합니다.";

        _menuView.ToolTipText = "캔버스 확대·축소 및 배율 초기화";
        _menuZoomIn.ToolTipText = "캔버스를 확대합니다. (Ctrl++)";
        _menuZoomOut.ToolTipText = "캔버스를 축소합니다. (Ctrl+-)";
        _menuZoomReset.ToolTipText = "확대/축소를 100%로 초기화합니다. (Ctrl+0)";

        _tbNew.ToolTipText = _menuNew.ToolTipText;
        _tbOpen.ToolTipText = _menuOpen.ToolTipText;
        _tbSave.ToolTipText = _menuSave.ToolTipText;
        _tbSaveAs.ToolTipText = _menuSaveAs.ToolTipText;
        _tbCanvasSize.ToolTipText = _menuCanvasSize.ToolTipText;
        _tbExportImage.ToolTipText = _menuExportImage.ToolTipText;
        _tbDelete.ToolTipText = _menuDelete.ToolTipText;
        _tbZoomIn.ToolTipText = _menuZoomIn.ToolTipText;
        _tbZoomOut.ToolTipText = _menuZoomOut.ToolTipText;
        _tbZoomReset.ToolTipText = _menuZoomReset.ToolTipText;
        _tbApplySource.ToolTipText = _menuApplySource.ToolTipText;
        _tbCopySource.ToolTipText = _menuCopySource.ToolTipText;

        _btnSelect.ToolTipText = _menuToolSelect.ToolTipText;
        _btnRectangle.ToolTipText = _menuToolRectangle.ToolTipText;
        _btnRoundedRect.ToolTipText = _menuToolRoundedRect.ToolTipText;
        _btnEllipse.ToolTipText = _menuToolEllipse.ToolTipText;
        _btnTriangle.ToolTipText = _menuToolTriangle.ToolTipText;
        _btnDiamond.ToolTipText = _menuToolDiamond.ToolTipText;
        _btnHexagon.ToolTipText = _menuToolHexagon.ToolTipText;
        _btnParallelogram.ToolTipText = _menuToolParallelogram.ToolTipText;
        _btnStar.ToolTipText = _menuToolStar.ToolTipText;
        _btnLine.ToolTipText = _menuToolLine.ToolTipText;
        _btnText.ToolTipText = _menuToolText.ToolTipText;
        _btnImage.ToolTipText = _menuToolImage.ToolTipText;
    }

    private static void ConfigureSourceButton(Button button, Bitmap icon)
    {
        button.Image = icon;
        button.ImageAlign = ContentAlignment.MiddleLeft;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.Padding = new Padding(6, 0, 6, 0);
    }

    private void WireZoomButtons()
    {
        _btnZoomIn.Click += (_, _) => _canvas.ZoomIn();
        _btnZoomOut.Click += (_, _) => _canvas.ZoomOut();
        _btnZoomReset.Click += (_, _) => _canvas.ZoomReset();
    }

    private void WireToolButtons()
    {
        _toolBindings =
        [
            (_btnSelect, EditorTool.Select),
            (_btnRectangle, EditorTool.Rectangle),
            (_btnRoundedRect, EditorTool.RoundedRectangle),
            (_btnEllipse, EditorTool.Ellipse),
            (_btnTriangle, EditorTool.Triangle),
            (_btnDiamond, EditorTool.Diamond),
            (_btnHexagon, EditorTool.Hexagon),
            (_btnParallelogram, EditorTool.Parallelogram),
            (_btnStar, EditorTool.Star),
            (_btnLine, EditorTool.Line),
            (_btnText, EditorTool.Text),
            (_btnImage, EditorTool.Image)
        ];

        foreach (var (button, tool) in _toolBindings)
            button.Click += (_, _) => SetActiveTool(tool);

        _btnFillColor.Click += BtnFillColor_Click;
        _btnStrokeColor.Click += BtnStrokeColor_Click;
    }

    private void WireMenuTools()
    {
        _menuToolBindings =
        [
            (_menuToolSelect, EditorTool.Select),
            (_menuToolRectangle, EditorTool.Rectangle),
            (_menuToolRoundedRect, EditorTool.RoundedRectangle),
            (_menuToolEllipse, EditorTool.Ellipse),
            (_menuToolTriangle, EditorTool.Triangle),
            (_menuToolDiamond, EditorTool.Diamond),
            (_menuToolHexagon, EditorTool.Hexagon),
            (_menuToolParallelogram, EditorTool.Parallelogram),
            (_menuToolStar, EditorTool.Star),
            (_menuToolLine, EditorTool.Line),
            (_menuToolText, EditorTool.Text),
            (_menuToolImage, EditorTool.Image)
        ];

        foreach (var (menu, tool) in _menuToolBindings)
            menu.Click += (_, _) => SetActiveTool(tool);
    }

    private void WirePropertyPanel()
    {
        _numStrokeWidth.ValueChanged += (_, _) => ApplyPropertyChanges();
        _numFillOpacity.ValueChanged += (_, _) => ApplyPropertyChanges();
        _numStrokeOpacity.ValueChanged += (_, _) => ApplyPropertyChanges();
        _txtTextContent.TextChanged += (_, _) => ApplyPropertyChanges();
        _cmbFontName.SelectedIndexChanged += (_, _) => ApplyPropertyChanges();
        _numFontSize.ValueChanged += (_, _) => ApplyPropertyChanges();
        _chkFontBold.CheckedChanged += (_, _) => ApplyPropertyChanges();
        _chkFontItalic.CheckedChanged += (_, _) => ApplyPropertyChanges();
        _cmbFillPattern.SelectedIndexChanged += (_, _) => ApplyPropertyChanges();
        _cmbLineStyle.SelectedIndexChanged += (_, _) => ApplyPropertyChanges();
        _cmbStartMarker.SelectedIndexChanged += (_, _) => ApplyPropertyChanges();
        _cmbEndMarker.SelectedIndexChanged += (_, _) => ApplyPropertyChanges();
    }

    private void InitializePropertyOptions()
    {
        _cmbFontName.Items.Clear();
        foreach (var family in FontFamily.Families.OrderBy(f => f.Name))
            _cmbFontName.Items.Add(family.Name);
        SelectFontName(_cmbFontName, SvgTextRenderer.DefaultFontName);

        _cmbFillPattern.Items.Clear();
        _cmbFillPattern.Items.AddRange(
        [
            new Option<FillPattern>("단색", FillPattern.Solid),
            new Option<FillPattern>("가로 줄", FillPattern.Horizontal),
            new Option<FillPattern>("세로 줄", FillPattern.Vertical),
            new Option<FillPattern>("대각선 ↘", FillPattern.ForwardDiagonal),
            new Option<FillPattern>("대각선 ↙", FillPattern.BackwardDiagonal),
            new Option<FillPattern>("격자", FillPattern.Cross),
            new Option<FillPattern>("X", FillPattern.DiagonalCross),
            new Option<FillPattern>("점", FillPattern.Dots)
        ]);

        _cmbLineStyle.Items.Clear();
        _cmbLineStyle.Items.AddRange(
        [
            new Option<StrokeLineStyle>("실선", StrokeLineStyle.Solid),
            new Option<StrokeLineStyle>("파선", StrokeLineStyle.Dash),
            new Option<StrokeLineStyle>("점선", StrokeLineStyle.Dot),
            new Option<StrokeLineStyle>("파선-점", StrokeLineStyle.DashDot),
            new Option<StrokeLineStyle>("긴 파선", StrokeLineStyle.LongDash),
            new Option<StrokeLineStyle>("짧은 파선", StrokeLineStyle.ShortDash)
        ]);

        var markerOptions = new Option<LineMarkerStyle>[]
        {
            new("없음", LineMarkerStyle.None),
            new("열린 화살표", LineMarkerStyle.ArrowOpen),
            new("채운 화살표", LineMarkerStyle.ArrowFilled),
            new("원", LineMarkerStyle.Circle),
            new("마름모", LineMarkerStyle.Diamond),
            new("사각형", LineMarkerStyle.Square),
            new("십자", LineMarkerStyle.Cross)
        };

        _cmbStartMarker.Items.Clear();
        _cmbEndMarker.Items.Clear();
        foreach (var option in markerOptions)
        {
            _cmbStartMarker.Items.Add(option);
            _cmbEndMarker.Items.Add(option);
        }
    }
    private void SyncPropertyPanel()
    {
        _suppressPropertySync = true;

        var selected = _canvas.SelectedElement;
        var hasSelection = selected is not null;
        var selectionCount = _canvas.SelectionCount;

        if (hasSelection)
        {
            _btnFillColor.BackColor = selected!.FillColor;
            _btnStrokeColor.BackColor = selected.StrokeColor;
            SelectOption(_cmbFillPattern, selected.FillPattern);
            _numFillOpacity.Value = ToOpacityPercent(selected.FillOpacity);
            _numStrokeOpacity.Value = ToOpacityPercent(selected.StrokeOpacity);
            _numStrokeWidth.Value = ClampDecimal(selected.StrokeWidth, _numStrokeWidth.Minimum, _numStrokeWidth.Maximum);
            SelectOption(_cmbLineStyle, selected.StrokeLineStyle);
            SelectOption(_cmbStartMarker, selected.StartMarker);
            SelectOption(_cmbEndMarker, selected.EndMarker);
            _txtTextContent.Text = selected.TextContent;
            SelectFontName(_cmbFontName, selected.FontName);
            _numFontSize.Value = ClampDecimal(selected.FontSize, _numFontSize.Minimum, _numFontSize.Maximum);
            _chkFontBold.Checked = selected.FontBold;
            _chkFontItalic.Checked = selected.FontItalic;
        }
        else
        {
            _btnFillColor.BackColor = _activeTool == EditorTool.Text
                ? _canvas.DefaultTextColor
                : _canvas.DefaultFill;
            _btnStrokeColor.BackColor = _canvas.DefaultStroke;
            SelectOption(_cmbFillPattern, _canvas.DefaultFillPattern);
            _numFillOpacity.Value = ToOpacityPercent(_canvas.DefaultFillOpacity);
            _numStrokeOpacity.Value = ToOpacityPercent(_canvas.DefaultStrokeOpacity);
            _numStrokeWidth.Value = ClampDecimal(_canvas.DefaultStrokeWidth, _numStrokeWidth.Minimum, _numStrokeWidth.Maximum);
            SelectOption(_cmbLineStyle, _canvas.DefaultStrokeLineStyle);
            SelectOption(_cmbStartMarker, _canvas.DefaultStartMarker);
            SelectOption(_cmbEndMarker, _canvas.DefaultEndMarker);
            _txtTextContent.Text = _canvas.DefaultText;
            SelectFontName(_cmbFontName, _canvas.DefaultFontName);
            _numFontSize.Value = ClampDecimal(_canvas.DefaultFontSize, _numFontSize.Minimum, _numFontSize.Maximum);
            _chkFontBold.Checked = _canvas.DefaultFontBold;
            _chkFontItalic.Checked = _canvas.DefaultFontItalic;
        }

        if (hasSelection)
        {
            _lblPropertyStatus.Text = selectionCount > 1
                ? $"{DescribeElement(selected!)} · {_canvas.SelectionCount}개 선택"
                : $"{DescribeElement(selected!)} 선택됨";
        }
        else if (_activeTool != EditorTool.Select)
        {
            _lblPropertyStatus.Text = $"{DescribeTool(_activeTool)} 기본값";
        }
        else
        {
            _lblPropertyStatus.Text = "요소를 선택하세요";
        }

        var canEdit = hasSelection || _activeTool != EditorTool.Select;
        var isTextContext = hasSelection
            ? selected!.Kind == SvgElementKind.Text
            : _activeTool == EditorTool.Text;
        var isImageContext = hasSelection
            ? selected!.Kind == SvgElementKind.Image
            : _activeTool == EditorTool.Image;
        var isLineContext = hasSelection
            ? selected!.Kind == SvgElementKind.Line
            : _activeTool == EditorTool.Line;
        var isShapeContext = hasSelection
            ? selected!.Kind is not (SvgElementKind.Line or SvgElementKind.Text or SvgElementKind.Image)
            : _activeTool is not (EditorTool.Select or EditorTool.Line or EditorTool.Text or EditorTool.Image);

        _lblFillColor.Text = isTextContext ? "글자 색" : "채우기 색";
        _lblFillOpacity.Text = isImageContext
            ? "이미지 불투명도 (%)"
            : isTextContext ? "글자 불투명도 (%)" : "채우기 불투명도 (%)";

        _lblFillColor.Enabled = canEdit && !isLineContext && !isImageContext;
        _btnFillColor.Enabled = canEdit && !isLineContext && !isImageContext;
        _lblFillPattern.Enabled = canEdit && isShapeContext;
        _cmbFillPattern.Enabled = canEdit && isShapeContext;
        _lblFillOpacity.Enabled = canEdit && !isLineContext;
        _numFillOpacity.Enabled = canEdit && !isLineContext;
        _lblStrokeColor.Enabled = canEdit && !isTextContext && !isImageContext;
        _btnStrokeColor.Enabled = canEdit && !isTextContext && !isImageContext;
        _lblStrokeOpacity.Enabled = canEdit && !isTextContext && !isImageContext;
        _numStrokeOpacity.Enabled = canEdit && !isTextContext && !isImageContext;
        _lblStrokeWidth.Enabled = canEdit && !isTextContext && !isImageContext;
        _numStrokeWidth.Enabled = canEdit && !isTextContext && !isImageContext;
        _lblLineStyle.Enabled = canEdit && isLineContext;
        _cmbLineStyle.Enabled = canEdit && isLineContext;
        _lblStartMarker.Enabled = canEdit && isLineContext;
        _cmbStartMarker.Enabled = canEdit && isLineContext;
        _lblEndMarker.Enabled = canEdit && isLineContext;
        _cmbEndMarker.Enabled = canEdit && isLineContext;

        _lblTextContent.Enabled = canEdit;
        _txtTextContent.Enabled = canEdit;
        _txtTextContent.ReadOnly = !canEdit || !isTextContext;
        _txtTextContent.TabStop = canEdit && isTextContext;
        _txtTextContent.BackColor = canEdit && isTextContext ? ModernTheme.PanelBackground : SystemColors.Control;
        _lblFontName.Enabled = canEdit && isTextContext;
        _cmbFontName.Enabled = canEdit && isTextContext;
        _lblFontSize.Enabled = canEdit && isTextContext;
        _numFontSize.Enabled = canEdit && isTextContext;
        _chkFontBold.Enabled = canEdit && isTextContext;
        _chkFontItalic.Enabled = canEdit && isTextContext;

        _suppressPropertySync = false;
    }

    private static string DescribeElement(SvgElement element) => element.Kind switch
    {
        SvgElementKind.Rectangle => "사각형",
        SvgElementKind.RoundedRectangle => "둥근 사각형",
        SvgElementKind.Ellipse => "타원",
        SvgElementKind.Triangle => "삼각형",
        SvgElementKind.Diamond => "마름모",
        SvgElementKind.Hexagon => "육각형",
        SvgElementKind.Parallelogram => "평행사변형",
        SvgElementKind.Star => "별",
        SvgElementKind.Line => "선",
        SvgElementKind.Text => "텍스트",
        SvgElementKind.Image => "이미지",
        _ => "요소"
    };

    private static string DescribeTool(EditorTool tool) => tool switch
    {
        EditorTool.Rectangle => "사각형",
        EditorTool.RoundedRectangle => "둥근 사각형",
        EditorTool.Ellipse => "타원",
        EditorTool.Triangle => "삼각형",
        EditorTool.Diamond => "마름모",
        EditorTool.Hexagon => "육각형",
        EditorTool.Parallelogram => "평행사변형",
        EditorTool.Star => "별",
        EditorTool.Line => "선",
        EditorTool.Text => "텍스트",
        EditorTool.Image => "이미지",
        _ => "도구"
    };

    private void ApplyPropertyChanges()
    {
        if (_suppressPropertySync)
            return;

        var lineStyle = GetSelectedValue(_cmbLineStyle, StrokeLineStyle.Solid);
        var fillPattern = GetSelectedValue(_cmbFillPattern, FillPattern.Solid);
        var fillOpacity = FromOpacityPercent(_numFillOpacity.Value);
        var strokeOpacity = FromOpacityPercent(_numStrokeOpacity.Value);
        var textContent = _txtTextContent.Text;
        var fontName = _cmbFontName.SelectedItem?.ToString() ?? SvgTextRenderer.DefaultFontName;
        var fontSize = (float)_numFontSize.Value;
        var fontBold = _chkFontBold.Checked;
        var fontItalic = _chkFontItalic.Checked;
        var startMarker = GetSelectedValue(_cmbStartMarker, LineMarkerStyle.None);
        var endMarker = GetSelectedValue(_cmbEndMarker, LineMarkerStyle.None);
        var strokeWidth = (float)_numStrokeWidth.Value;

        if (_canvas.SelectedElement is SvgElement selected)
        {
            if (selected.Kind == SvgElementKind.Image)
            {
                selected.FillOpacity = fillOpacity;
                _canvas.NotifyDocumentChanged();
                return;
            }

            if (selected.Kind == SvgElementKind.Text)
            {
                var normalizedText = string.IsNullOrEmpty(textContent) ? SvgTextRenderer.DefaultText : textContent;
                var textChanged = !string.Equals(selected.TextContent, normalizedText, StringComparison.Ordinal);
                var fontChanged = !string.Equals(selected.FontName, fontName, StringComparison.Ordinal)
                    || Math.Abs(selected.FontSize - fontSize) > 0.001f
                    || selected.FontBold != fontBold
                    || selected.FontItalic != fontItalic;

                selected.TextContent = normalizedText;
                selected.FontName = fontName;
                selected.FontSize = fontSize;
                selected.FontBold = fontBold;
                selected.FontItalic = fontItalic;
                selected.FillOpacity = fillOpacity;

                if (!selected.TextBoundsManuallySized && (textChanged || fontChanged))
                    SvgTextRenderer.UpdateTextBounds(selected);
            }
            else if (selected.Kind != SvgElementKind.Line)
            {
                selected.FillPattern = fillPattern;
                selected.FillOpacity = fillOpacity;
            }

            if (selected.Kind != SvgElementKind.Text)
            {
                selected.StrokeOpacity = strokeOpacity;
                selected.StrokeWidth = strokeWidth;
                selected.StrokeLineStyle = lineStyle;
                selected.StartMarker = startMarker;
                selected.EndMarker = endMarker;
            }

            _canvas.NotifyDocumentChanged();
            return;
        }

        _canvas.DefaultStrokeWidth = strokeWidth;
        _canvas.DefaultFillPattern = fillPattern;
        _canvas.DefaultFillOpacity = fillOpacity;
        _canvas.DefaultStrokeOpacity = strokeOpacity;
        _canvas.DefaultStrokeLineStyle = lineStyle;
        _canvas.DefaultStartMarker = startMarker;
        _canvas.DefaultEndMarker = endMarker;
        _canvas.DefaultText = string.IsNullOrEmpty(textContent) ? SvgTextRenderer.DefaultText : textContent;
        _canvas.DefaultFontName = fontName;
        _canvas.DefaultFontSize = fontSize;
        _canvas.DefaultFontBold = fontBold;
        _canvas.DefaultFontItalic = fontItalic;
        _canvas.Invalidate();
    }

    private static void SelectFontName(ComboBox comboBox, string fontName)
    {
        if (comboBox.Items.Contains(fontName))
        {
            comboBox.SelectedItem = fontName;
            return;
        }

        if (comboBox.Items.Contains(SvgTextRenderer.DefaultFontName))
            comboBox.SelectedItem = SvgTextRenderer.DefaultFontName;
        else if (comboBox.Items.Count > 0)
            comboBox.SelectedIndex = 0;
    }

    private static decimal ClampDecimal(float value, decimal min, decimal max) =>
        Math.Clamp((decimal)value, min, max);

    private static decimal ToOpacityPercent(float opacity) =>
        Math.Clamp((decimal)Math.Round(opacity * 100f), 0m, 100m);

    private static float FromOpacityPercent(decimal percent) =>
        (float)percent / 100f;

    private static void SelectOption<T>(ComboBox comboBox, T value) where T : struct, Enum
    {
        foreach (Option<T> item in comboBox.Items)
        {
            if (EqualityComparer<T>.Default.Equals(item.Value, value))
            {
                comboBox.SelectedItem = item;
                return;
            }
        }

        if (comboBox.Items.Count > 0)
            comboBox.SelectedIndex = 0;
    }

    private static T GetSelectedValue<T>(ComboBox comboBox, T fallback) where T : struct, Enum
    {
        if (comboBox.SelectedItem is Option<T> option)
            return option.Value;
        return fallback;
    }

    private sealed record Option<T>(string Label, T Value) where T : struct, Enum
    {
        public override string ToString() => Label;
    }

    private void ApplyModernTheme()
    {
        Font = ModernTheme.UiFont;
        BackColor = ModernTheme.AppBackground;
        ModernTheme.StyleMenuStrip(_menuStrip);
        ModernTheme.StyleToolStrip(_toolStripMain);
        ModernTheme.StyleToolStrip(_toolStripTools);
        ModernTheme.StyleStatusStrip(_statusStrip);

        _pnlToolbox.BackColor = ModernTheme.SidebarBackground;
        _pnlProperties.BackColor = ModernTheme.PanelBackground;
        _pnlPropertiesHeader.BackColor = ModernTheme.PanelBackground;
        _pnlToolOptions.BackColor = ModernTheme.SidebarBackground;
        ModernTheme.StyleSectionLabel(_lblToolboxTitle);
        ModernTheme.StyleSectionLabel(_lblPropertiesTitle);
        ModernTheme.StyleCaptionLabel(_lblPropertyStatus);
        ModernTheme.StyleCaptionLabel(_lblFillColor);
        ModernTheme.StyleCaptionLabel(_lblFillPattern);
        ModernTheme.StyleCaptionLabel(_lblFillOpacity);
        ModernTheme.StyleCaptionLabel(_lblStrokeColor);
        ModernTheme.StyleCaptionLabel(_lblTextContent);
        ModernTheme.StyleCaptionLabel(_lblFontName);
        ModernTheme.StyleCaptionLabel(_lblFontSize);
        ModernTheme.StyleCaptionLabel(_lblStrokeOpacity);
        ModernTheme.StyleCaptionLabel(_lblStrokeWidth);
        ModernTheme.StyleCaptionLabel(_lblLineStyle);
        ModernTheme.StyleCaptionLabel(_lblStartMarker);
        ModernTheme.StyleCaptionLabel(_lblEndMarker);
        ModernTheme.StyleColorSwatch(_btnFillColor);
        ModernTheme.StyleColorSwatch(_btnStrokeColor);
        ModernTheme.StyleInput(_numStrokeWidth);
        ModernTheme.StyleInput(_numFillOpacity);
        ModernTheme.StyleInput(_numStrokeOpacity);
        ModernTheme.StyleInput(_txtTextContent);
        ModernTheme.StyleInput(_cmbFontName);
        ModernTheme.StyleInput(_numFontSize);
        _chkFontBold.Font = ModernTheme.UiFontSmall;
        _chkFontBold.ForeColor = ModernTheme.TextPrimary;
        _chkFontBold.BackColor = ModernTheme.PanelBackground;
        _chkFontItalic.Font = ModernTheme.UiFontSmall;
        _chkFontItalic.ForeColor = ModernTheme.TextPrimary;
        _chkFontItalic.BackColor = ModernTheme.PanelBackground;
        ModernTheme.StyleInput(_cmbFillPattern);
        ModernTheme.StyleInput(_cmbLineStyle);
        ModernTheme.StyleInput(_cmbStartMarker);
        ModernTheme.StyleInput(_cmbEndMarker);

        _pnlCanvasHost.BackColor = ModernTheme.CanvasChrome;
        _pnlCanvasToolbar.BackColor = ModernTheme.PanelBackground;
        _lblZoom.Font = ModernTheme.UiFontSmall;
        _lblZoom.ForeColor = ModernTheme.TextSecondary;
        _lblZoom.BackColor = ModernTheme.PanelBackground;
        StyleIconButton(_btnZoomIn);
        StyleIconButton(_btnZoomOut);
        StyleIconButton(_btnZoomReset);
        _canvas.BackColor = Color.White;

        _pnlSource.BackColor = ModernTheme.PanelBackground;
        _pnlSourceHeader.BackColor = ModernTheme.PanelBackground;
        ModernTheme.StyleSectionLabel(_lblSourceTitle);
        ModernTheme.StylePrimaryButton(_btnApplySource);
        ModernTheme.StyleSecondaryButton(_btnCopySource);

        _pnlSourceEditor.BackColor = ModernTheme.Border;
        _txtSvgSource.Font = ModernTheme.ResolveMonoFont();
        _txtSvgSource.ForeColor = ModernTheme.TextPrimary;
        EditorGridBackground.Apply(_txtSvgSource);

        _btnFillColor.BackColor = _canvas.DefaultFill;
        _btnStrokeColor.BackColor = _canvas.DefaultStroke;
    }

    private static void StyleIconButton(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = ModernTheme.Border;
        button.FlatAppearance.BorderSize = 1;
        button.BackColor = ModernTheme.PanelBackground;
        button.Cursor = Cursors.Hand;
        button.FlatAppearance.MouseOverBackColor = ModernTheme.ToolHover;
        button.ImageAlign = ContentAlignment.MiddleCenter;
    }

    private void SetActiveTool(EditorTool tool)
    {
        if (tool == EditorTool.Image)
        {
            var imported = TryPickImportImage();
            if (imported is null)
                return;

            _canvas.SetPendingImage(imported.DataUri, imported.SourcePath, imported.PixelSize);
        }

        _activeTool = tool;
        _canvas.SetTool(tool);
        SyncToolButtonStates();
        SyncPropertyPanel();
        UpdateStatus();
    }

    private SvgImageAssetService.ImportedImage? TryPickImportImage()
    {
        using var dialog = new OpenFileDialog
        {
            Filter = SvgImageAssetService.ImportFileFilter,
            Title = "이미지 선택"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
            return null;

        try
        {
            return SvgImageAssetService.LoadFromFile(dialog.FileName);
        }
        catch (Exception ex)
        {
            EditorErrorDialog.Show(this, "이미지 불러오기 실패", ex, dialog.FileName);
            return null;
        }
    }

    private void SyncToolButtonStates()
    {
        foreach (var (button, tool) in _toolBindings)
            ModernTheme.StyleToolStripButton(button, _activeTool == tool);

        foreach (var (menu, tool) in _menuToolBindings)
            menu.Checked = _activeTool == tool;
    }

    private void SyncSvgSourceFromCanvas()
    {
        if (_txtSvgSource.Focused)
            return;

        _txtSvgSource.Text = SvgDocumentSerializer.ToSvgString(_canvas.Document);
        _txtSvgSource.SelectionStart = 0;
        _txtSvgSource.SelectionLength = 0;
    }

    private void UpdateTitle()
    {
        var name = string.IsNullOrWhiteSpace(_currentFilePath)
            ? "제목 없음"
            : Path.GetFileName(_currentFilePath);
        Text = _isDirty ? $"{name} * - SVG Editor" : $"{name} - SVG Editor";
    }

    private void UpdateStatus()
    {
        var count = _canvas.Document.Elements.Count;
        var selectionCount = _canvas.SelectionCount;
        var toolName = _activeTool switch
        {
            EditorTool.Select => "선택",
            EditorTool.Rectangle => "사각형",
            EditorTool.RoundedRectangle => "둥근 사각형",
            EditorTool.Ellipse => "타원",
            EditorTool.Triangle => "삼각형",
            EditorTool.Diamond => "마름모",
            EditorTool.Hexagon => "육각형",
            EditorTool.Parallelogram => "평행사변형",
            EditorTool.Star => "별",
            EditorTool.Line => "선",
            EditorTool.Text => "텍스트",
            EditorTool.Image => "이미지",
            _ => "도구"
        };
        _statusLabel.Text = selectionCount > 1
            ? $"도구: {toolName}  |  선택: {selectionCount}개  |  요소: {count}개  |  캔버스: {_canvas.Document.Width:0} x {_canvas.Document.Height:0}"
            : $"도구: {toolName}  |  요소: {count}개  |  캔버스: {_canvas.Document.Width:0} x {_canvas.Document.Height:0}";
    }

    private void FocusTextEditorIfNeeded(bool selectAll = false)
    {
        if (_canvas.SelectedElement?.Kind != SvgElementKind.Text)
            return;

        if (_txtTextContent.ReadOnly || !_txtTextContent.Enabled)
            return;

        _txtTextContent.Focus();
        if (selectAll)
            _txtTextContent.SelectAll();
    }

    private bool IsTextInputControlFocused() =>
        ActiveControl is TextBox or RichTextBox or ComboBox or NumericUpDown;

    private void UpdateZoomDisplay()
    {
        var percent = (int)Math.Round(_canvas.Zoom * 100);
        var text = $"{percent}%";
        _lblZoom.Text = text;
        _statusZoomLabel.Text = text;
    }

    private void MenuZoomIn_Click(object? sender, EventArgs e) => _canvas.ZoomIn();

    private void MenuZoomOut_Click(object? sender, EventArgs e) => _canvas.ZoomOut();

    private void MenuZoomReset_Click(object? sender, EventArgs e) => _canvas.ZoomReset();

    private bool ConfirmDiscardChanges()
    {
        if (!_isDirty)
            return true;

        return MessageBox.Show(
            "저장하지 않은 변경 사항이 있습니다. 계속하시겠습니까?",
            "SVG Editor",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question) == DialogResult.Yes;
    }

    private void MenuNew_Click(object? sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges())
            return;

        _currentFilePath = null;
        _isDirty = false;
        _canvas.NewDocument();
        UpdateTitle();
    }

    private void MenuOpen_Click(object? sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges())
            return;

        using var dialog = new OpenFileDialog
        {
            Filter = SvgDocumentSerializer.FileFilter,
            Title = "SVG 열기"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            var document = SvgDocumentSerializer.Load(dialog.FileName);
            _canvas.LoadDocument(document);
            _currentFilePath = dialog.FileName;
            _isDirty = false;
            SyncSvgSourceFromCanvas();
            UpdateTitle();
        }
        catch (Exception ex)
        {
            EditorErrorDialog.Show(this, "열기 실패", ex);
        }
    }

    private void MenuSave_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_currentFilePath))
        {
            MenuSaveAs_Click(sender, e);
            return;
        }

        SaveToPath(_currentFilePath);
    }

    private void MenuSaveAs_Click(object? sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog
        {
            Filter = SvgDocumentSerializer.FileFilter,
            Title = "SVG 저장",
            FileName = string.IsNullOrWhiteSpace(_currentFilePath) ? "drawing.svg" : Path.GetFileName(_currentFilePath)
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        SaveToPath(dialog.FileName);
    }

    private void MenuCanvasSize_Click(object? sender, EventArgs e)
    {
        var document = _canvas.Document;
        if (!DocumentSizeDialog.TryShow(this, document.Width, document.Height, out var result) || result is null)
            return;

        _canvas.SetDocumentSize(result.Width, result.Height);
    }

    private void MenuExportImage_Click(object? sender, EventArgs e)
    {
        var defaultName = string.IsNullOrWhiteSpace(_currentFilePath)
            ? "drawing.png"
            : Path.ChangeExtension(Path.GetFileName(_currentFilePath), ".png");

        using var dialog = new SaveFileDialog
        {
            Filter = SvgImageExporter.FileFilter,
            Title = "이미지로보내기",
            FileName = defaultName
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            var format = SvgImageExporter.GetFormatFromExtension(dialog.FileName);
            SvgImageExporter.Export(_canvas.Document, dialog.FileName, format);
        }
        catch (Exception ex)
        {
            EditorErrorDialog.Show(this, "보내기 실패", ex);
        }
    }

    private void SaveToPath(string path)
    {
        try
        {
            SvgDocumentSerializer.Save(_canvas.Document, path);
            _currentFilePath = path;
            _isDirty = false;
            UpdateTitle();
        }
        catch (Exception ex)
        {
            EditorErrorDialog.Show(this, "저장 실패", ex);
        }
    }

    private void MenuExit_Click(object? sender, EventArgs e)
    {
        Close();
    }

    private void MenuDelete_Click(object? sender, EventArgs e) => _canvas.DeleteSelected();

    private void BtnCopySource_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_txtSvgSource.Text))
            return;

        Clipboard.SetText(_txtSvgSource.Text);
        _statusLabel.Text = "SVG 소스가 클립보드에 복사되었습니다.";
    }

    private void BtnApplySource_Click(object? sender, EventArgs e)
    {
        try
        {
            var tempPath = Path.Combine(Path.GetTempPath(), $"svg-editor-{Guid.NewGuid():N}.svg");
            File.WriteAllText(tempPath, _txtSvgSource.Text);
            var document = SvgDocumentSerializer.Load(tempPath);
            File.Delete(tempPath);

            _canvas.LoadDocument(document);
            _isDirty = true;
            UpdateTitle();
            UpdateStatus();
        }
        catch (Exception ex)
        {
            EditorErrorDialog.Show(this, "SVG 적용 실패", ex, "SVG 소스를 문서에 적용하지 못했습니다.");
        }
    }

    private void BtnFillColor_Click(object? sender, EventArgs e)
    {
        var isTextDefault = _canvas.SelectedElement is null && _activeTool == EditorTool.Text;
        var current = _canvas.SelectedElement?.FillColor
            ?? (isTextDefault ? _canvas.DefaultTextColor : _canvas.DefaultFill);
        using var dialog = new ColorDialog
        {
            Color = current,
            FullOpen = true
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        if (_canvas.SelectedElement is SvgElement selected && selected.Kind != SvgElementKind.Line)
        {
            selected.FillColor = dialog.Color;
            _btnFillColor.BackColor = dialog.Color;
            _canvas.NotifyDocumentChanged();
            return;
        }

        if (isTextDefault)
            _canvas.DefaultTextColor = dialog.Color;
        else
            _canvas.DefaultFill = dialog.Color;
        _btnFillColor.BackColor = dialog.Color;
        _canvas.Invalidate();
    }

    private void BtnStrokeColor_Click(object? sender, EventArgs e)
    {
        var current = _canvas.SelectedElement?.StrokeColor ?? _canvas.DefaultStroke;
        using var dialog = new ColorDialog
        {
            Color = current,
            FullOpen = true
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        if (_canvas.SelectedElement is SvgElement selected)
        {
            selected.StrokeColor = dialog.Color;
            _btnStrokeColor.BackColor = dialog.Color;
            _canvas.NotifyDocumentChanged();
            return;
        }

        _canvas.DefaultStroke = dialog.Color;
        _btnStrokeColor.BackColor = dialog.Color;
        _canvas.Invalidate();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!ConfirmDiscardChanges())
            e.Cancel = true;

        base.OnFormClosing(e);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (IsTextInputControlFocused())
        {
            switch (keyData)
            {
                case Keys.Control | Keys.S:
                    MenuSave_Click(this, EventArgs.Empty);
                    return true;
                case Keys.Control | Keys.O:
                    MenuOpen_Click(this, EventArgs.Empty);
                    return true;
                case Keys.Control | Keys.N:
                    MenuNew_Click(this, EventArgs.Empty);
                    return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        if (keyData == (Keys.Control | Keys.A) && _activeTool == EditorTool.Select)
        {
            _canvas.SelectAll();
            return true;
        }

        if (keyData == Keys.Delete)
        {
            _canvas.DeleteSelected();
            return true;
        }

        if (keyData == (Keys.Control | Keys.S))
        {
            MenuSave_Click(this, EventArgs.Empty);
            return true;
        }

        if (keyData == (Keys.Control | Keys.O))
        {
            MenuOpen_Click(this, EventArgs.Empty);
            return true;
        }

        if (keyData == (Keys.Control | Keys.N))
        {
            MenuNew_Click(this, EventArgs.Empty);
            return true;
        }

        if (keyData == Keys.Escape)
        {
            SetActiveTool(EditorTool.Select);
            return true;
        }

        if (keyData == (Keys.Control | Keys.Add) || keyData == (Keys.Control | Keys.Oemplus))
        {
            _canvas.ZoomIn();
            return true;
        }

        if (keyData == (Keys.Control | Keys.Subtract) || keyData == (Keys.Control | Keys.OemMinus))
        {
            _canvas.ZoomOut();
            return true;
        }

        if (keyData == (Keys.Control | Keys.D0) || keyData == (Keys.Control | Keys.NumPad0))
        {
            _canvas.ZoomReset();
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }
}

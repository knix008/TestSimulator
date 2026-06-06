using System.Drawing.Imaging;
using MyDiagramWinV10.App;
using MyDiagramWinV10.Controls;
using MyDiagramWinV10.Export;
using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;
using MyDiagramWinV10.Serialization;
using MyDiagramWinV10.Templates;
using MyDiagramWinV10.Ui;

namespace MyDiagramWinV10;

public partial class MainForm : Form
{
    private string? _currentFilePath;
    private string? _pendingProjectPath;
    private bool _isDirty;
    private bool _suppressPropertySync;

    public MainForm(string? initialProjectPath = null)
    {
        _pendingProjectPath = initialProjectPath;
        InitializeComponent();
        if (System.ComponentModel.LicenseManager.UsageMode != System.ComponentModel.LicenseUsageMode.Designtime)
        {
            InitializeRuntime();
            Shown += MainForm_Shown;
        }
    }

    private void MainForm_Shown(object? sender, EventArgs e)
    {
        Shown -= MainForm_Shown;
        if (string.IsNullOrWhiteSpace(_pendingProjectPath))
            return;

        var path = _pendingProjectPath;
        _pendingProjectPath = null;
        TryOpenProjectFile(path, confirmDiscard: false);
    }

    protected override void WndProc(ref Message m)
    {
        if (SingleInstanceMessenger.TryGetForwardedProjectPath(ref m, out var projectPath))
        {
            BeginInvoke(() => TryOpenProjectFile(projectPath!));
            m.Result = (IntPtr)1;
            return;
        }

        base.WndProc(ref m);
    }

    private void InitializeRuntime()
    {
        foreach (var family in FontFamily.Families.OrderBy(f => f.Name))
            _cmbFont.Items.Add(family.Name);
        if (_cmbFont.Items.Count > 0)
            _cmbFont.SelectedItem = "맑은 고딕";

        _cmbBorderStyle.SelectedIndex = 0;
        _cmbLineStyle.DrawMode = DrawMode.OwnerDrawFixed;
        _cmbLineStyle.ItemHeight = 22;
        _cmbLineStyle.DrawItem += CmbLineStyle_DrawItem;
        _cmbLineStyle.SelectedIndex = 0;
        _cmbConnectorKind.Items.Clear();
        _cmbConnectorKind.Items.AddRange(["직선", "꺾은선", "곡선", "완만한꺾"]);
        _cmbConnectorKind.SelectedIndex = 0;

        ApplyModernTheme();
        _toolbox.SelectionChanged += Toolbox_SelectionChanged;

        _canvas.SelectionChanged += (_, _) => SyncPropertyPanel();
        _canvas.SelectToolRequested += (_, _) => SyncToolbarState();
        _canvas.ProjectChanged += (_, _) =>
        {
            _isDirty = true;
            UpdateTitle();
            SyncShapeDimensionsFromCanvas();
        };
        _canvas.ZoomChanged += (_, _) => UpdateZoomDisplay();
        _canvas.UndoStateChanged += (_, _) => UpdateUndoMenu();

        EnableProjectFileDrop(this);
        EnableProjectFileDrop(_splitMain);
        EnableProjectFileDrop(_splitEditor);
        EnableProjectFileDrop(_pnlCanvasHost);
        EnableProjectFileDrop(_canvas);

        SetSelectTool();
        UpdateTitle();
        UpdateZoomDisplay();
        UpdateUndoMenu();
    }

    private void EnableProjectFileDrop(Control control)
    {
        control.AllowDrop = true;
        control.DragEnter += OnProjectFileDragEnter;
        control.DragDrop += OnProjectFileDragDrop;
    }

    private void OnProjectFileDragEnter(object? sender, DragEventArgs e)
    {
        if (TryGetDroppedProjectPath(e, out _))
            e.Effect = DragDropEffects.Copy;
        else
            e.Effect = DragDropEffects.None;
    }

    private void OnProjectFileDragDrop(object? sender, DragEventArgs e)
    {
        if (!TryGetDroppedProjectPath(e, out var path))
            return;

        Activate();
        TryOpenProjectFile(path);
    }

    private static bool TryGetDroppedProjectPath(DragEventArgs e, out string path)
    {
        path = string.Empty;
        if (e.Data is null || !e.Data.GetDataPresent(DataFormats.FileDrop))
            return false;

        if (e.Data.GetData(DataFormats.FileDrop) is not string[] files)
            return false;

        foreach (var file in files)
        {
            if (!Program.IsProjectFile(file))
                continue;

            path = Path.GetFullPath(file);
            return true;
        }

        return false;
    }

    private void BtnSelect_Click(object? sender, EventArgs e) => SetSelectTool();
    private void BtnRectangle_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.Rectangle);
    private void BtnRoundedRect_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.RoundedRectangle);
    private void BtnEllipse_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.Ellipse);
    private void BtnDiamond_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.Diamond);
    private void BtnTriangle_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.Triangle);
    private void BtnParallelogram_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.Parallelogram);
    private void BtnHexagon_Click(object? sender, EventArgs e) => SetShapeTool(ShapeKind.Hexagon);
    private void BtnLineStraight_Click(object? sender, EventArgs e) => SetConnectorTool(ConnectorKind.Straight);
    private void BtnLineOrthogonal_Click(object? sender, EventArgs e) => SetConnectorTool(ConnectorKind.Orthogonal);
    private void BtnLineCurved_Click(object? sender, EventArgs e) => SetConnectorTool(ConnectorKind.Curved);

    private void SyncToolbarState()
    {
        var mode = _canvas.ToolMode;
        var shapeKind = _canvas.CurrentShapeKind;
        var connectorKind = _canvas.CurrentConnectorKind;

        _btnSelect.Checked = mode == ToolMode.Select;
        _btnRectangle.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.Rectangle;
        _btnRoundedRect.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.RoundedRectangle;
        _btnEllipse.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.Ellipse;
        _btnDiamond.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.Diamond;
        _btnTriangle.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.Triangle;
        _btnParallelogram.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.Parallelogram;
        _btnHexagon.Checked = mode == ToolMode.Shape && shapeKind == ShapeKind.Hexagon;
        _btnLineStraight.Checked = mode == ToolMode.Connector && connectorKind == ConnectorKind.Straight;
        _btnLineOrthogonal.Checked = mode == ToolMode.Connector && connectorKind == ConnectorKind.Orthogonal;
        _btnLineCurved.Checked = mode == ToolMode.Connector && connectorKind == ConnectorKind.Curved;
    }

    private void ApplyModernTheme()
    {
        Font = ModernTheme.UiFont;
        BackColor = ModernTheme.AppBackground;
        ModernTheme.StyleMenuStrip(_menuStrip);
        ModernTheme.StyleToolStrip(_toolStrip);
        ModernTheme.StyleStatusStrip(_statusStrip);

        _pnlToolbox.BackColor = ModernTheme.SidebarBackground;
        _lblToolboxTitle.Font = ModernTheme.TitleFont;
        _lblToolboxTitle.ForeColor = ModernTheme.TextPrimary;
        _lblToolboxTitle.BackColor = ModernTheme.SidebarBackground;

        _pnlProperties.BackColor = ModernTheme.PanelBackground;
        _lblPropertyTitle.Font = ModernTheme.TitleFont;
        _lblPropertyTitle.ForeColor = ModernTheme.TextPrimary;
        _lblPropertyTitle.BackColor = ModernTheme.PanelBackground;

        _pnlCanvasHost.BackColor = ModernTheme.CanvasChrome;
        _canvas.BackColor = Color.White;

        ModernTheme.StyleGroupBox(_grpShape);
        ModernTheme.StyleGroupBox(_grpConnector);

        foreach (var label in new[] { _lblShapeText, _lblShapeWidth, _lblShapeHeight, _lblFillColor, _lblBorderColor,
            _lblTextColor, _lblBorderWidth, _lblBorderStyle, _lblFont, _lblFontSize, _lblLineColor, _lblLineWidth,
            _lblLineStyle, _lblConnectorKind, _lblStartArrow, _lblEndArrow, _lblConnectorLabel })
        {
            label.Font = ModernTheme.UiFont;
            label.ForeColor = ModernTheme.TextSecondary;
        }

        foreach (var input in new Control[] { _txtShapeText, _txtConnectorLabel, _cmbFont, _cmbBorderStyle,
            _cmbLineStyle, _cmbConnectorKind, _cmbStartArrow, _cmbEndArrow, _numShapeWidth, _numShapeHeight,
            _numBorderWidth, _numFontSize, _numLineWidth, _chkFontBold })
            ModernTheme.StyleInput(input);

        ModernTheme.StylePrimaryButton(_btnSetImage);
        ModernTheme.StyleSecondaryButton(_btnClearImage);
        ModernTheme.StyleColorSwatch(_btnFillColor);
        ModernTheme.StyleColorSwatch(_btnBorderColor);
        ModernTheme.StyleColorSwatch(_btnTextColor);
        ModernTheme.StyleColorSwatch(_btnLineColor);
    }

    private void Toolbox_SelectionChanged(object? sender, ToolboxSelectionChangedEventArgs e)
    {
        switch (e.Tool)
        {
            case ToolboxTool.Select:
                SetSelectTool(syncToolbox: false);
                break;
            case ToolboxTool.Shape when e.ShapeKind is not null:
                SetShapeTool(e.ShapeKind.Value, syncToolbox: false);
                break;
            case ToolboxTool.Connector when e.ConnectorPreset is not null:
                SetConnectorTool(e.ConnectorPreset, syncToolbox: false);
                break;
        }
    }

    private void UpdateTitle()
    {
        var name = _canvas.Project.Title;
        var file = string.IsNullOrWhiteSpace(_currentFilePath) ? "제목 없음" : Path.GetFileName(_currentFilePath);
        var dirty = _isDirty ? " *" : string.Empty;
        Text = $"MyDiagramWinV10 - {name} ({file}){dirty}";
        _statusLabel.Text = $"도형 {_canvas.Project.Shapes.Count}개, 연결선 {_canvas.Project.Connectors.Count}개 | 확대 {_canvas.Zoom:P0} | Space+드래그: 이동 | Ctrl+Z/Y: 실행취소/다시실행";
    }

    private void UpdateUndoMenu()
    {
        _menuUndo.Enabled = _canvas.CanUndo;
        _menuRedo.Enabled = _canvas.CanRedo;
    }

    private void UpdateZoomDisplay()
    {
        _lblZoom.Text = $"{_canvas.Zoom:P0}";
        UpdateTitle();
    }

    private void MenuZoomIn_Click(object? sender, EventArgs e) => _canvas.ZoomIn();

    private void MenuZoomOut_Click(object? sender, EventArgs e) => _canvas.ZoomOut();

    private void MenuZoomReset_Click(object? sender, EventArgs e) => _canvas.ZoomReset();

    private void MenuView3D_Click(object? sender, EventArgs e)
    {
        using var form = new Diagram3DViewForm(_canvas.CreateProjectSnapshot());
        form.ShowDialog(this);
    }

    private void SyncPropertyPanel()
    {
        _suppressPropertySync = true;
        try
        {
            if (_canvas.SelectedShape is not null)
            {
                var shape = _canvas.SelectedShape;
                _grpShape.Enabled = true;
                _grpConnector.Enabled = false;
                _txtShapeText.Text = shape.Text;
                _numShapeWidth.Value = ClampToNumeric(shape.Width, _numShapeWidth);
                _numShapeHeight.Value = ClampToNumeric(shape.Height, _numShapeHeight);
                _btnFillColor.BackColor = Color.FromArgb(shape.FillColorArgb);
                _btnBorderColor.BackColor = Color.FromArgb(shape.BorderColorArgb);
                _btnTextColor.BackColor = Color.FromArgb(shape.TextColorArgb);
                _numBorderWidth.Value = (decimal)shape.BorderWidth;
                _cmbBorderStyle.SelectedIndex = (int)shape.BorderStyle;
                _cmbFont.SelectedItem = shape.FontName;
                _numFontSize.Value = (decimal)shape.FontSize;
                _chkFontBold.Checked = shape.FontBold;
                return;
            }

            if (_canvas.SelectedConnector is not null)
            {
                var connector = _canvas.SelectedConnector;
                _grpShape.Enabled = false;
                _grpConnector.Enabled = true;
                _btnLineColor.BackColor = Color.FromArgb(connector.LineColorArgb);
                _numLineWidth.Value = (decimal)connector.LineWidth;
                _cmbLineStyle.SelectedIndex = (int)connector.LineStyle;
                int kindIdx = Math.Clamp((int)connector.Kind, 0, _cmbConnectorKind.Items.Count - 1);
                _cmbConnectorKind.SelectedIndex = kindIdx;
                _cmbStartArrow.SelectedIndex = (int)connector.StartArrowStyle;
                _cmbEndArrow.SelectedIndex   = (int)connector.EndArrowStyle;
                _txtConnectorLabel.Text = connector.Label;
                return;
            }

            _grpShape.Enabled = false;
            _grpConnector.Enabled = false;
        }
        finally
        {
            _suppressPropertySync = false;
        }
    }

    private void ShapePropertyChanged(object? sender, EventArgs e)
    {
        if (_suppressPropertySync || _canvas.SelectedShape is null)
            return;

        var selected = _canvas.SelectedShape;
        var shape = new DiagramShape
        {
            Kind = selected.Kind,
            Width = (float)_numShapeWidth.Value,
            Height = (float)_numShapeHeight.Value,
            Text = _txtShapeText.Text,
            FillColorArgb = _btnFillColor.BackColor.ToArgb(),
            BorderColorArgb = _btnBorderColor.BackColor.ToArgb(),
            TextColorArgb = _btnTextColor.BackColor.ToArgb(),
            BorderWidth = (float)_numBorderWidth.Value,
            BorderStyle = (LineStyle)_cmbBorderStyle.SelectedIndex,
            FontName = _cmbFont.SelectedItem?.ToString() ?? "맑은 고딕",
            FontSize = (float)_numFontSize.Value,
            FontBold = _chkFontBold.Checked
        };

        _canvas.ApplyShapeProperties(shape);
    }

    private void ConnectorPropertyChanged(object? sender, EventArgs e)
    {
        if (_suppressPropertySync || _canvas.SelectedConnector is null)
            return;

        var connector = new DiagramConnector
        {
            LineColorArgb = _btnLineColor.BackColor.ToArgb(),
            LineWidth = (float)_numLineWidth.Value,
            LineStyle = (LineStyle)_cmbLineStyle.SelectedIndex,
            Kind = (ConnectorKind)Math.Clamp(_cmbConnectorKind.SelectedIndex, 0, (int)ConnectorKind.RightAngleCurved),
            StartArrowStyle = (ArrowHeadStyle)Math.Clamp(_cmbStartArrow.SelectedIndex, 0, (int)ArrowHeadStyle.Cross),
            EndArrowStyle   = (ArrowHeadStyle)Math.Clamp(_cmbEndArrow.SelectedIndex,   0, (int)ArrowHeadStyle.Cross),
            HasStartArrow = _cmbStartArrow.SelectedIndex > 0,
            HasEndArrow   = _cmbEndArrow.SelectedIndex   > 0,
            Label = _txtConnectorLabel.Text
        };

        _canvas.ApplyConnectorProperties(connector);
    }

    private void CmbLineStyle_DrawItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || sender is not ComboBox cmb) return;
        e.DrawBackground();

        var style = (LineStyle)e.Index;
        var b = e.Bounds;
        int lineY = b.Y + b.Height / 2;
        int x1 = b.X + 3, x2 = b.X + 46;   // 43-px preview fits even in narrow combobox

        if (style == LineStyle.Double)
        {
            using var p1 = new Pen(e.ForeColor, 1.5f);
            e.Graphics.DrawLine(p1, x1, lineY - 2, x2, lineY - 2);
            e.Graphics.DrawLine(p1, x1, lineY + 2, x2, lineY + 2);
        }
        else
        {
            using var pen = new Pen(e.ForeColor, 2f);
            switch (style)
            {
                case LineStyle.Dash:        pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash; break;
                case LineStyle.Dot:         pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dot; break;
                case LineStyle.DashDot:     pen.DashStyle = System.Drawing.Drawing2D.DashStyle.DashDot; break;
                case LineStyle.DashDotDot:  pen.DashStyle = System.Drawing.Drawing2D.DashStyle.DashDotDot; break;
                case LineStyle.LongDash:    pen.DashPattern = [8f, 3f]; break;
                case LineStyle.ShortDash:   pen.DashPattern = [3f, 3f]; break;
            }
            e.Graphics.DrawLine(pen, x1, lineY, x2, lineY);
        }

        var text = cmb.Items[e.Index]?.ToString() ?? string.Empty;
        var textRect = new Rectangle(x2 + 4, b.Y, b.Width - (x2 - b.X) - 4, b.Height);
        TextRenderer.DrawText(e.Graphics, text, e.Font, textRect,
            e.ForeColor, TextFormatFlags.VerticalCenter | TextFormatFlags.Left);

        e.DrawFocusRectangle();
    }

    private void CmbArrowStyle_DrawItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || sender is not ComboBox cmb) return;
        e.DrawBackground();

        var style = (ArrowHeadStyle)e.Index;
        var b = e.Bounds;
        int midY = b.Y + b.Height / 2;
        int x1 = b.X + 4, x2 = b.X + 38;

        using var pen = new Pen(e.ForeColor, 1.5f);
        if (style != ArrowHeadStyle.None)
        {
            e.Graphics.DrawLine(pen, x1, midY, x2, midY);
            DiagramRenderer.DrawArrowHead(e.Graphics, pen,
                new PointF(x2 - 10, midY), new PointF(x2, midY), style);
        }

        var text = cmb.Items[e.Index]?.ToString() ?? string.Empty;
        var textRect = new Rectangle(x2 + 4, b.Y, b.Width - (x2 - b.X) - 8, b.Height);
        TextRenderer.DrawText(e.Graphics, text, e.Font, textRect,
            e.ForeColor, TextFormatFlags.VerticalCenter | TextFormatFlags.Left);

        e.DrawFocusRectangle();
    }

    private void BtnFillColor_Click(object? sender, EventArgs e)
    {
        if (PickColor(_btnFillColor.BackColor, out var color))
        {
            _btnFillColor.BackColor = color;
            ShapePropertyChanged(sender, e);
        }
    }

    private void BtnBorderColor_Click(object? sender, EventArgs e)
    {
        if (PickColor(_btnBorderColor.BackColor, out var color))
        {
            _btnBorderColor.BackColor = color;
            ShapePropertyChanged(sender, e);
        }
    }

    private void BtnTextColor_Click(object? sender, EventArgs e)
    {
        if (PickColor(_btnTextColor.BackColor, out var color))
        {
            _btnTextColor.BackColor = color;
            ShapePropertyChanged(sender, e);
        }
    }

    private void BtnLineColor_Click(object? sender, EventArgs e)
    {
        if (PickColor(_btnLineColor.BackColor, out var color))
        {
            _btnLineColor.BackColor = color;
            ConnectorPropertyChanged(sender, e);
        }
    }

    private void BtnSetImage_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "이미지 파일|*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.webp|모든 파일|*.*",
            Title = "도형 이미지 선택"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        _canvas.SetShapeImage(dialog.FileName);
    }

    private void BtnClearImage_Click(object? sender, EventArgs e) => _canvas.ClearShapeImage();

    private static bool PickColor(Color current, out Color selected)
    {
        using var dialog = new ColorDialog { Color = current, FullOpen = true };
        if (dialog.ShowDialog() == DialogResult.OK)
        {
            selected = dialog.Color;
            return true;
        }

        selected = current;
        return false;
    }

    private void SyncShapeDimensionsFromCanvas()
    {
        if (_suppressPropertySync || _canvas.SelectedShape is not { } shape)
            return;

        _suppressPropertySync = true;
        try
        {
            _numShapeWidth.Value = ClampToNumeric(shape.Width, _numShapeWidth);
            _numShapeHeight.Value = ClampToNumeric(shape.Height, _numShapeHeight);
        }
        finally
        {
            _suppressPropertySync = false;
        }
    }

    private static decimal ClampToNumeric(float value, NumericUpDown control)
    {
        var clamped = Math.Max((float)control.Minimum, Math.Min((float)control.Maximum, value));
        return (decimal)clamped;
    }

    private void MenuNew_Click(object? sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges())
            return;

        _canvas.NewProject();
        _currentFilePath = null;
        _isDirty = false;
        UpdateTitle();
    }

    private void MenuTemplateOrgBasic_Click(object? sender, EventArgs e) => LoadTemplate("org-basic");
    private void MenuTemplateOrgDepartment_Click(object? sender, EventArgs e) => LoadTemplate("org-department");
    private void MenuTemplateOrgProject_Click(object? sender, EventArgs e) => LoadTemplate("org-project");
    private void MenuTemplateFlowchart_Click(object? sender, EventArgs e) => LoadTemplate("flowchart-basic");
    private void MenuTemplateProcess_Click(object? sender, EventArgs e) => LoadTemplate("process-linear");
    private void MenuTemplateNetwork_Click(object? sender, EventArgs e) => LoadTemplate("network-basic");

    private void LoadTemplate(string templateId)
    {
        if (!ConfirmDiscardChanges())
            return;

        try
        {
            var project = DiagramTemplateLibrary.Build(templateId);
            _canvas.LoadProject(project);
            _currentFilePath = null;
            _isDirty = false;
            UpdateTitle();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "템플릿 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void MenuOpen_Click(object? sender, EventArgs e)
    {
        if (!ConfirmDiscardChanges())
            return;

        using var dialog = new OpenFileDialog
        {
            Filter = DiagramProjectSerializer.FileFilter,
            Title = "다이어그램 프로젝트 열기"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        TryOpenProjectFile(dialog.FileName, confirmDiscard: false);
    }

    private bool TryOpenProjectFile(string path, bool confirmDiscard = true)
    {
        path = Path.GetFullPath(path);
        if (!Program.IsProjectFile(path))
        {
            MessageBox.Show(this, "MyDiagram 프로젝트 파일(.mdg)만 열 수 있습니다.", "열기 오류",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        if (confirmDiscard && !ConfirmDiscardChanges())
            return false;

        OpenProjectFile(path);
        return true;
    }

    private void OpenProjectFile(string path)
    {
        try
        {
            var project = DiagramProjectSerializer.Load(path);
            _canvas.LoadProject(project);
            _currentFilePath = path;
            _isDirty = false;
            UpdateTitle();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "열기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            Filter = DiagramProjectSerializer.FileFilter,
            Title = "다이어그램 프로젝트 저장",
            DefaultExt = DiagramProjectSerializer.FileExtension.TrimStart('.'),
            FileName = $"{_canvas.Project.Title}{DiagramProjectSerializer.FileExtension}"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        SaveToPath(dialog.FileName);
    }

    private void SaveToPath(string path)
    {
        try
        {
            var project = _canvas.CreateProjectSnapshot();
            project.Title = Path.GetFileNameWithoutExtension(path);
            DiagramProjectSerializer.Save(project, path);
            _currentFilePath = path;
            _isDirty = false;
            _canvas.Project.Title = project.Title;
            UpdateTitle();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "저장 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void MenuExportImage_Click(object? sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog
        {
            Filter = DiagramExporter.ImageFilter,
            Title = "다이어그램 이미지 보내기",
            FileName = $"{_canvas.Project.Title}.png"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            var format = Path.GetExtension(dialog.FileName).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => ImageFormat.Jpeg,
                ".bmp" => ImageFormat.Bmp,
                _ => ImageFormat.Png
            };

            DiagramExporter.ExportToImage(_canvas.CreateProjectSnapshot(), dialog.FileName, format);
            MessageBox.Show(this, "이미지를 보냈습니다.", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "보내기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void MenuExportSvg_Click(object? sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog
        {
            Filter = DiagramSvgExporter.FileFilter,
            Title = "다이어그램 SVG 보내기",
            FileName = $"{_canvas.Project.Title}.svg"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            DiagramSvgExporter.Export(_canvas.CreateProjectSnapshot(), dialog.FileName);
            MessageBox.Show(this, "SVG 파일을 보냈습니다.", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "보내기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void MenuExportPdf_Click(object? sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog
        {
            Filter = DiagramPdfExporter.FileFilter,
            Title = "다이어그램 PDF 보내기",
            FileName = $"{_canvas.Project.Title}.pdf"
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            DiagramPdfExporter.Export(_canvas.CreateProjectSnapshot(), dialog.FileName);
            MessageBox.Show(this, "PDF 파일을 보냈습니다.", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "보내기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void MenuUndo_Click(object? sender, EventArgs e) => _canvas.Undo();

    private void MenuRedo_Click(object? sender, EventArgs e) => _canvas.Redo();

    private void MenuDelete_Click(object? sender, EventArgs e) => _canvas.DeleteSelection();

    private void MenuExit_Click(object? sender, EventArgs e)
    {
        Close();
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!ConfirmDiscardChanges())
            e.Cancel = true;
    }

    private bool ConfirmDiscardChanges()
    {
        if (!_isDirty)
            return true;

        var result = MessageBox.Show(this, "변경 사항을 저장하지 않고 계속하시겠습니까?", "확인",
            MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);

        if (result == DialogResult.Cancel)
            return false;
        if (result == DialogResult.Yes)
            return true;

        MenuSave_Click(this, EventArgs.Empty);
        return !_isDirty;
    }

    private void SetSelectTool(bool syncToolbox = true)
    {
        _canvas.SetToolMode(ToolMode.Select);
        _lblStatus.Text = "도구: 선택 | 도형 클릭·드래그 | 핸들로 크기 조절 | Esc: 선택 취소";
        SyncToolbarState();
    }

    private void SetShapeTool(ShapeKind kind, bool syncToolbox = true)
    {
        _canvas.SetToolMode(ToolMode.Shape);
        _canvas.SetShapeKind(kind);
        if (syncToolbox)
            _toolbox?.SelectShapeTool(kind);

        var label = kind switch
        {
            ShapeKind.Rectangle => "사각형",
            ShapeKind.RoundedRectangle => "둥근 사각형",
            ShapeKind.Ellipse => "타원",
            ShapeKind.Diamond => "마름모",
            ShapeKind.Triangle => "삼각형",
            ShapeKind.Parallelogram => "평행사변형",
            ShapeKind.Hexagon => "육각형",
            ShapeKind.Pentagon => "오각형",
            ShapeKind.Star => "별",
            ShapeKind.Cross => "십자",
            ShapeKind.Cylinder => "원통",
            ShapeKind.Cloud => "구름",
            ShapeKind.Document => "문서",
            ShapeKind.Database          => "데이터베이스",
            ShapeKind.Arrow             => "화살표",
            ShapeKind.Trapezoid         => "사다리꼴",
            ShapeKind.Chevron           => "쉐브론",
            ShapeKind.CallOut           => "콜아웃",
            ShapeKind.Note              => "메모",
            ShapeKind.OffPageConnector  => "오프페이지 연결",
            ShapeKind.DoubleArrow       => "양방향 화살표",
            ShapeKind.ManualInput       => "수동 입력",
            ShapeKind.Delay             => "지연",
            ShapeKind.NetworkServer     => "서버",
            ShapeKind.NetworkRouter     => "라우터",
            ShapeKind.NetworkSwitch     => "스위치",
            ShapeKind.NetworkPC         => "PC",
            ShapeKind.NetworkFirewall   => "방화벽",
            ShapeKind.NetworkHub        => "허브",
            ShapeKind.NetworkPrinter    => "프린터",
            ShapeKind.NetworkWifi       => "무선AP",
            ShapeKind.NetworkInternet   => "인터넷",
            ShapeKind.NetworkStorage    => "스토리지",
            ShapeKind.NetworkLaptop     => "노트북",
            ShapeKind.NetworkMobile     => "모바일",
            ShapeKind.NetworkIPPhone    => "IP전화",
            ShapeKind.NetworkRack       => "랙",
            ShapeKind.NetworkTablet     => "태블릿",
            ShapeKind.NetworkGateway    => "게이트웨이",
            ShapeKind.Shape3DCube            => "정육면체",
            ShapeKind.Shape3DBox             => "직육면체",
            ShapeKind.Shape3DSphere          => "구",
            ShapeKind.Shape3DPyramid         => "피라미드",
            ShapeKind.Shape3DCone            => "원뿔",
            ShapeKind.Shape3DCylinder        => "3D 원기둥",
            ShapeKind.Shape3DTriangularPrism => "삼각기둥",
            ShapeKind.Shape3DCapsule         => "캡슐",
            ShapeKind.Shape3DGem             => "보석",
            ShapeKind.Shape3DTorus           => "토러스",
            _ => "도형"
        };
        _lblStatus.Text = $"도구: {label} | 마우스를 올려 미리보기, 드래그하여 생성";
        SyncToolbarState();
    }

    private void SetConnectorTool(ConnectorPreset preset, bool syncToolbox = true)
    {
        _canvas.SetConnectorPreset(preset);
        _canvas.SetToolMode(ToolMode.Connector);
        if (syncToolbox)
            _toolbox?.SelectConnectorTool(preset.Kind);

        var label = preset.Kind switch
        {
            ConnectorKind.Straight         => "직선 연결",
            ConnectorKind.Orthogonal       => "꺾은선 연결",
            ConnectorKind.RightAngleCurved => "완만한꺾 연결",
            ConnectorKind.Curved           => "곡선 연결",
            _                              => "연결선"
        };
        _lblStatus.Text = $"도구: {label} | 시작·끝 도형을 순서대로 클릭";
        SyncToolbarState();
    }

    private void SetConnectorTool(ConnectorKind kind, bool syncToolbox = true)
        => SetConnectorTool(new ConnectorPreset(kind, LineStyle.Solid, ArrowHeadStyle.None, ArrowHeadStyle.Open), syncToolbox);

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.Space && ActiveControl is not TextBoxBase)
        {
            _canvas.SetSpacePressed(true);
            return false;
        }

        if (keyData == (Keys.Control | Keys.Z))
        {
            if (_canvas.CanUndo)
                _canvas.Undo();
            return true;
        }

        if (keyData == (Keys.Control | Keys.Y) || keyData == (Keys.Control | Keys.Shift | Keys.Z))
        {
            if (_canvas.CanRedo)
                _canvas.Redo();
            return true;
        }

        if (keyData == Keys.Escape)
        {
            if (_canvas.ToolMode == ToolMode.Select &&
                (_canvas.SelectedShape is not null || _canvas.SelectedConnector is not null))
                _canvas.ClearSelection();
            else
                SetSelectTool();
            return true;
        }

        if (keyData == Keys.Delete)
        {
            _menuDelete.PerformClick();
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }

    protected override void OnKeyUp(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Space && ActiveControl is not TextBoxBase)
            _canvas.SetSpacePressed(false);

        base.OnKeyUp(e);
    }
}

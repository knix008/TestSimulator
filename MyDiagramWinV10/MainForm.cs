using System.Drawing.Imaging;
using MyDiagramWinV10.Controls;
using MyDiagramWinV10.Export;
using MyDiagramWinV10.Models;
using MyDiagramWinV10.Serialization;
using MyDiagramWinV10.Templates;
using MyDiagramWinV10.Ui;

namespace MyDiagramWinV10;

public partial class MainForm : Form
{
    private string? _currentFilePath;
    private bool _isDirty;
    private bool _suppressPropertySync;
    private DiagramToolbox? _toolbox;

    public MainForm()
    {
        InitializeComponent();
        InitializeRuntime();
    }

    private void InitializeRuntime()
    {
        foreach (var family in FontFamily.Families.OrderBy(f => f.Name))
            _cmbFont.Items.Add(family.Name);
        if (_cmbFont.Items.Count > 0)
            _cmbFont.SelectedItem = "맑은 고딕";

        _cmbBorderStyle.SelectedIndex = 0;
        _cmbLineStyle.SelectedIndex = 0;
        _cmbConnectorKind.SelectedIndex = 0;

        ApplyModernTheme();
        InitializeToolbox();

        _canvas.SelectionChanged += (_, _) => SyncPropertyPanel();
        _canvas.SelectToolRequested += (_, _) => _toolbox?.SelectSelectTool();
        _canvas.ProjectChanged += (_, _) =>
        {
            _isDirty = true;
            UpdateTitle();
            SyncShapeDimensionsFromCanvas();
        };
        _canvas.ZoomChanged += (_, _) => UpdateZoomDisplay();
        _canvas.UndoStateChanged += (_, _) => UpdateUndoMenu();

        SetSelectTool();
        UpdateTitle();
        UpdateZoomDisplay();
        UpdateUndoMenu();
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
            _lblLineStyle, _lblConnectorKind, _lblConnectorLabel })
        {
            label.Font = ModernTheme.UiFont;
            label.ForeColor = ModernTheme.TextSecondary;
        }

        foreach (var input in new Control[] { _txtShapeText, _txtConnectorLabel, _cmbFont, _cmbBorderStyle,
            _cmbLineStyle, _cmbConnectorKind, _numShapeWidth, _numShapeHeight, _numBorderWidth, _numFontSize,
            _numLineWidth, _chkFontBold, _chkStartArrow, _chkEndArrow })
            ModernTheme.StyleInput(input);

        ModernTheme.StylePrimaryButton(_btnSetImage);
        ModernTheme.StyleSecondaryButton(_btnClearImage);
        ModernTheme.StyleColorSwatch(_btnFillColor);
        ModernTheme.StyleColorSwatch(_btnBorderColor);
        ModernTheme.StyleColorSwatch(_btnTextColor);
        ModernTheme.StyleColorSwatch(_btnLineColor);
    }

    private void InitializeToolbox()
    {
        _toolbox = new DiagramToolbox
        {
            Dock = DockStyle.Fill
        };
        _pnlToolbox.Controls.Add(_toolbox);
        _toolbox.SelectionChanged += Toolbox_SelectionChanged;
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
            case ToolboxTool.Connector when e.ConnectorKind is not null:
                SetConnectorTool(e.ConnectorKind.Value, syncToolbox: false);
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
                _cmbConnectorKind.SelectedIndex = (int)connector.Kind;
                _chkStartArrow.Checked = connector.HasStartArrow;
                _chkEndArrow.Checked = connector.HasEndArrow;
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
            Kind = (ConnectorKind)_cmbConnectorKind.SelectedIndex,
            HasStartArrow = _chkStartArrow.Checked,
            HasEndArrow = _chkEndArrow.Checked,
            Label = _txtConnectorLabel.Text
        };

        _canvas.ApplyConnectorProperties(connector);
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

        try
        {
            var project = DiagramProjectSerializer.Load(dialog.FileName);
            _canvas.LoadProject(project);
            _currentFilePath = dialog.FileName;
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
        if (syncToolbox)
            _toolbox?.SelectSelectTool();
        _lblStatus.Text = "도구: 선택 | 도형 클릭·드래그 | 핸들로 크기 조절 | Esc: 선택";
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
            _ => "도형"
        };
        _lblStatus.Text = $"도구: {label} | 드래그하여 생성 후 자동 선택";
    }

    private void SetConnectorTool(ConnectorKind kind, bool syncToolbox = true)
    {
        _canvas.SetToolMode(ToolMode.Connector);
        _canvas.SetConnectorKind(kind);
        if (syncToolbox)
            _toolbox?.SelectConnectorTool(kind);

        var label = kind switch
        {
            ConnectorKind.Straight => "직선 연결",
            ConnectorKind.Orthogonal => "꺾은선 연결",
            ConnectorKind.Curved => "곡선 연결",
            _ => "연결선"
        };
        _lblStatus.Text = $"도구: {label} | 시작·끝 도형을 순서대로 클릭";
    }

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

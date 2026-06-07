using MyUML20WinV10.Controls;
using MyUML20WinV10.Export;
using MyUML20WinV10.Models;
using MyUML20WinV10.Serialization;

namespace MyUML20WinV10;

public partial class MainForm : Form
{
    private UmlProject _project = new();
    private string? _currentFilePath;
    private bool _isDirty;
    private bool _suppressPropertySync;
    private UmlToolMode _currentToolMode = UmlToolMode.Select;

    public MainForm(string? initialProjectPath = null)
    {
        InitializeComponent();
        if (System.ComponentModel.LicenseManager.UsageMode == System.ComponentModel.LicenseUsageMode.Designtime)
            return;

        InitializeRuntime();
        if (!string.IsNullOrWhiteSpace(initialProjectPath))
            LoadProjectFile(initialProjectPath, confirmDiscard: false);
        else
            NewProject(loadSample: false);
    }

    private void MainForm_Shown(object? sender, EventArgs e) => ApplyPanelLayout();

    private void ApplyPanelLayout()
    {
        var mainWidth = _splitMain.ClientSize.Width;
        if (mainWidth > _splitMain.Panel1MinSize + _splitMain.Panel2MinSize + _splitMain.SplitterWidth)
        {
            var rightWidth = Math.Max(_splitMain.Panel2MinSize, (int)(mainWidth * 0.27));
            _splitMain.SplitterDistance = mainWidth - rightWidth - _splitMain.SplitterWidth;
        }

        var rightHeight = _splitRight.ClientSize.Height;
        if (rightHeight > _splitRight.Panel1MinSize + _splitRight.Panel2MinSize + _splitRight.SplitterWidth)
        {
            // 탐색기(위)는 전체의 45%, 속성(아래)는 나머지
            var explorerHeight = Math.Max(_splitRight.Panel1MinSize, (int)(rightHeight * 0.45));
            explorerHeight = Math.Min(explorerHeight, rightHeight - _splitRight.Panel2MinSize - _splitRight.SplitterWidth);
            _splitRight.SplitterDistance = explorerHeight;
        }

        _pnlExplorer.Visible = true;
        _modelExplorer.Visible = true;
    }

    private void InitializeRuntime()
    {
        ApplyKoreanText();
        ApplyVisualStyles();
        _canvas.SelectionChanged += (_, _) => SyncSelection();
        _canvas.ProjectChanged += (_, _) =>
        {
            _isDirty = true;
            UpdateTitle();
            _modelExplorer.Rebuild();
        };
        _modelExplorer.ElementSelected += ModelExplorer_ElementSelected;
        _umlToolbox.SelectionChanged += (_, e) => SetTool(e.Mode, fromToolbox: true);
        _umlToolbox.NotationDoubleClicked += UmlToolbox_NotationDoubleClicked;
        _canvas.SelectToolRequested += (_, _) => SetTool(UmlToolMode.Select);
        _canvas.ZoomChanged += (_, _) => UpdateZoomDisplay();
        SetTool(UmlToolMode.Select, fromToolbox: true);
        UpdateZoomDisplay();
    }

    private void ApplyKoreanText()
    {
        _menuFile.Text = "파일(&F)";
        _menuNew.Text = "새로 만들기(&N)";
        _menuOpen.Text = "열기(&O)...";
        _menuSave.Text = "저장(&S)";
        _menuSaveAs.Text = "다른 이름으로 저장(&A)...";
        _menuSaveAs.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        _menuSample.Text = "샘플 불러오기";
        _menuExport.Text = "내보내기(&E)";
        _menuExportImage.Text = "다이어그램 이미지...";
        _menuExportSvg.Text = "다이어그램 SVG...";
        _menuExportPdf.Text = "다이어그램 PDF...";
        _menuExportHtml.Text = "HTML 문서...";
        _menuExportMarkdown.Text = "Markdown 문서...";
        _menuExit.Text = "끝내기(&X)";
        _menuEdit.Text = "편집(&E)";
        _menuDelete.Text = "선택 삭제(&D)";
        _tsNew.Text = "새 파일";
        _tsOpen.Text = "열기";
        _tsSave.Text = "저장";
        _tsDelete.Text = "삭제";
        _tsZoomReset.Text = "맞춤";
        _tsNew.ToolTipText = "새 프로젝트 만들기 (Ctrl+N)";
        _tsOpen.ToolTipText = "프로젝트 열기 (Ctrl+O)";
        _tsSave.ToolTipText = "현재 프로젝트 저장 (Ctrl+S)";
        _tsDelete.ToolTipText = "선택한 요소 삭제 (Delete)";
        _tsZoomOut.ToolTipText = "축소 (마우스 휠 아래)";
        _tsZoomIn.ToolTipText = "확대 (마우스 휠 위)";
        _tsZoomReset.ToolTipText = "확대/축소 초기화";
        _statusLabel.Text = "준비";
        _btnAddProperty.Text = "+ 속성";
        _btnAddOperation.Text = "+ 연산";
        _lblToolbox.Text = "   UML 도구";
        _lblExplorer.Text = "   문서 구조";
        _lblProperties.Text = "   속성";
    }

    private void ApplyVisualStyles()
    {
        var headerFont = new Font("Segoe UI", 9F, FontStyle.Bold);
        var headerBack = Color.FromArgb(30, 80, 180);

        _lblToolbox.Font = headerFont;
        _lblToolbox.BackColor = headerBack;
        _lblToolbox.ForeColor = Color.White;
        _lblToolbox.TextAlign = ContentAlignment.MiddleLeft;

        _lblExplorer.Font = headerFont;
        _lblExplorer.BackColor = headerBack;
        _lblExplorer.ForeColor = Color.White;
        _lblExplorer.TextAlign = ContentAlignment.MiddleLeft;

        _lblProperties.Font = headerFont;
        _lblProperties.BackColor = headerBack;
        _lblProperties.ForeColor = Color.White;
        _lblProperties.TextAlign = ContentAlignment.MiddleLeft;

        _pnlCanvasHost.BackColor = Color.FromArgb(90, 90, 100);
        _pnlCanvasHost.Padding = new Padding(1);

        _pnlFeatureButtons.BackColor = Color.FromArgb(235, 240, 255);
        _pnlFeatureButtons.Padding = new Padding(4, 3, 4, 3);

        _btnAddProperty.Font = new Font("Segoe UI", 8.5F);
        _btnAddOperation.Font = new Font("Segoe UI", 8.5F);

        _toolStrip.Padding = new Padding(4, 1, 4, 1);
        _tsNew.ToolTipText = "새 프로젝트 만들기 (Ctrl+N)";
        _tsOpen.ToolTipText = "프로젝트 열기 (Ctrl+O)";
        _tsSave.ToolTipText = "현재 프로젝트 저장 (Ctrl+S)";
        _tsDelete.ToolTipText = "선택한 요소 삭제 (Delete)";
        _tsZoomOut.ToolTipText = "축소 (마우스 휠 아래)";
        _tsZoomLabel.TextAlign = ContentAlignment.MiddleCenter;
        _tsZoomLabel.ToolTipText = "현재 확대/축소 배율";
        _tsZoomIn.ToolTipText = "확대 (마우스 휠 위)";
        _tsZoomReset.ToolTipText = "확대/축소 100% 초기화";

        _menuSaveAs.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;

        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        _statusZoomLabel.TextAlign = ContentAlignment.MiddleRight;
        _statusZoomLabel.BorderSides = ToolStripStatusLabelBorderSides.Left;
        _statusZoomLabel.BorderStyle = Border3DStyle.Etched;
        _statusZoomLabel.ToolTipText = "현재 확대/축소 배율";
    }

    private void NewProject(bool loadSample)
    {
        if (!ConfirmDiscard())
            return;

        _project = loadSample ? UmlProject.CreateSample() : new UmlProject();
        _currentFilePath = null;
        _isDirty = loadSample;
        BindProject();
    }

    private void BindProject()
    {
        _canvas.LoadProject(_project);
        _modelExplorer.Bind(_project);
        UpdateTitle();
        SyncSelection();
        _statusLabel.Text = "왼쪽 도구상자에서 도구를 선택하거나 더블클릭하여 요소를 추가하세요. 선택 모드에서 더블클릭하면 이름을 편집합니다.";
    }

    private void SetTool(UmlToolMode mode, bool fromToolbox = false)
    {
        _currentToolMode = mode;
        _canvas.SetToolMode(mode);
        if (!fromToolbox)
            _umlToolbox.SelectTool(mode);

        var hint = mode switch
        {
            UmlToolMode.Select => "선택: 클릭=선택 · 드래그=이동 · 더블클릭=이름 편집 · 휠=확대/축소 · Space+드래그=화면 이동 · Esc=취소",
            UmlToolMode.Pan => "이동 모드: 드래그하여 캔버스를 이동합니다. Esc로 선택 모드로 돌아갑니다.",
            UmlToolMode.CreateClass => "Class 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateInterface => "Interface 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateEnumeration => "Enumeration 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreatePackage => "Package 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateActor => "Actor 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateUseCase => "Use Case 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateNote => "Note 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateAssociation or UmlToolMode.CreateDirectedAssociation
                => "연관 관계: 시작 노드를 클릭한 뒤 대상 노드를 클릭합니다.",
            UmlToolMode.CreateAggregation => "집합(◇) 관계: 시작 노드 → 대상 노드를 클릭합니다.",
            UmlToolMode.CreateComposition => "합성(◆) 관계: 시작 노드 → 대상 노드를 클릭합니다.",
            UmlToolMode.CreateGeneralization => "일반화: 자식 클래스 → 부모 클래스 순으로 클릭합니다.",
            UmlToolMode.CreateRealization => "실체화: 구현 클래스 → Interface 순으로 클릭합니다.",
            UmlToolMode.CreateDependency => "의존: 의존 원본 → 대상 순으로 클릭합니다.",
            UmlToolMode.CreateInclude => "Include: 기본 Use Case → 포함 Use Case 순으로 클릭합니다.",
            UmlToolMode.CreateExtend => "Extend: 확장 Use Case → 기본 Use Case 순으로 클릭합니다.",
            _ => string.Empty,
        };

        _statusLabel.Text = hint;
        UpdateZoomLabels();
    }

    private void UpdateZoomDisplay() => SetTool(_currentToolMode, fromToolbox: true);

    private void UpdateZoomLabels()
    {
        var zoomText = $"{_canvas.Zoom * 100:0}%";
        _statusZoomLabel.Text = zoomText;
        _tsZoomLabel.Text = zoomText;
    }

    private void SyncSelection()
    {
        _suppressPropertySync = true;
        var selected = _canvas.SelectedObject;
        _propertyGrid.SelectedObject = selected;
        _umlToolbox.SetCanvasSelection(selected);

        var isClassifier = selected is UmlClassifier;
        _pnlFeatureButtons.Visible = isClassifier;
        _btnAddOperation.Visible = selected is not UmlEnumeration;

        if (selected is UmlElement element)
            _modelExplorer.SelectElement(element.Id);

        _suppressPropertySync = false;
    }

    private void UmlToolbox_NotationDoubleClicked(object? sender, UmlToolboxSelectionChangedEventArgs e)
    {
        SetTool(e.Mode, fromToolbox: true);

        if (UmlToolModeHelper.IsNodeCreateTool(e.Mode))
        {
            if (_canvas.TryPlaceNotation(e.Mode))
            {
                SetTool(UmlToolMode.Select, fromToolbox: true);
                SyncSelection();
            }
            return;
        }

        if (UmlToolModeHelper.IsRelationshipTool(e.Mode))
            _statusLabel.Text = "관계 도구: 시작 노드 클릭 → 대상 노드 클릭 순으로 연결합니다. Esc=취소";
    }

    private void ModelExplorer_ElementSelected(object? sender, UmlElementSelectedEventArgs e)
    {
        _suppressPropertySync = true;
        _propertyGrid.SelectedObject = e.SelectedObject;

        if (e.SelectedObject is UmlElement element)
            _canvas.SelectModelElement(element.Id);

        var isClassifier = e.SelectedObject is UmlClassifier;
        _pnlFeatureButtons.Visible = isClassifier;
        _btnAddOperation.Visible = e.SelectedObject is not UmlEnumeration;
        _suppressPropertySync = false;
    }

    private void PropertyGrid_PropertyValueChanged(object? s, PropertyValueChangedEventArgs e)
    {
        if (_suppressPropertySync)
            return;

        _isDirty = true;
        UpdateTitle();
        _modelExplorer.Rebuild();
        _canvas.Invalidate();
    }

    private void BtnAddProperty_Click(object? sender, EventArgs e)
    {
        if (_propertyGrid.SelectedObject is not UmlClassifier classifier)
            return;

        var property = new UmlProperty
        {
            Name = $"field{classifier.Properties.Count + 1}",
            TypeName = "string",
        };
        classifier.Properties.Add(property);
        MarkDirtyAndRefresh();
        _propertyGrid.SelectedObject = property;
    }

    private void BtnAddOperation_Click(object? sender, EventArgs e)
    {
        if (_propertyGrid.SelectedObject is not UmlClassifier classifier)
            return;

        if (classifier is UmlEnumeration)
            return;

        var operation = new UmlOperation
        {
            Name = $"Method{classifier.Operations.Count + 1}",
            ReturnTypeName = "void",
        };
        classifier.Operations.Add(operation);
        MarkDirtyAndRefresh();
        _propertyGrid.SelectedObject = operation;
    }

    private void MarkDirtyAndRefresh()
    {
        _isDirty = true;
        UpdateTitle();
        _modelExplorer.Rebuild();
        _canvas.Invalidate();
    }

    private void DeleteSelection() => _canvas.DeleteSelection();

    private void MenuExit_Click(object? sender, EventArgs e) => Close();
    private void MenuDelete_Click(object? sender, EventArgs e) => DeleteSelection();
    private void TsZoomOut_Click(object? sender, EventArgs e) => _canvas.ZoomOut();
    private void TsZoomIn_Click(object? sender, EventArgs e) => _canvas.ZoomIn();
    private void TsZoomReset_Click(object? sender, EventArgs e) => _canvas.ZoomReset();

    private void MenuNew_Click(object? sender, EventArgs e) => NewProject(loadSample: false);

    private void MenuSample_Click(object? sender, EventArgs e) => NewProject(loadSample: true);

    private void MenuOpen_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = UmlProjectSerializer.FileFilter,
            Title = "UML 프로젝트 열기",
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        LoadProjectFile(dialog.FileName);
    }

    private void MenuSave_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_currentFilePath))
        {
            SaveAs();
            return;
        }

        SaveTo(_currentFilePath);
    }

    private void MenuSaveAs_Click(object? sender, EventArgs e) => SaveAs();

    private void SaveAs()
    {
        using var dialog = new SaveFileDialog
        {
            Filter = UmlProjectSerializer.FileFilter,
            Title = "UML 프로젝트 저장",
            FileName = string.IsNullOrWhiteSpace(_project.Name) ? "Project" : _project.Name,
            DefaultExt = UmlProjectSerializer.FileExtension.TrimStart('.'),
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        SaveTo(dialog.FileName);
    }

    private void SaveTo(string path)
    {
        UmlProjectSerializer.Save(_project, path);
        _currentFilePath = path;
        _isDirty = false;
        UpdateTitle();
    }

    private void LoadProjectFile(string path, bool confirmDiscard = true)
    {
        if (confirmDiscard && !ConfirmDiscard())
            return;

        _project = UmlProjectSerializer.Load(path);
        _currentFilePath = path;
        _isDirty = false;
        BindProject();
    }

    private bool ConfirmDiscard()
    {
        if (!_isDirty)
            return true;

        var result = MessageBox.Show(this, "저장하지 않은 변경 사항이 있습니다. 계속하시겠습니까?", "확인",
            MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        return result == DialogResult.Yes;
    }

    private void UpdateTitle()
    {
        var name = string.IsNullOrWhiteSpace(_project.Name) ? "Untitled" : _project.Name;
        var file = string.IsNullOrWhiteSpace(_currentFilePath) ? string.Empty : $" - {Path.GetFileName(_currentFilePath)}";
        var dirty = _isDirty ? " *" : string.Empty;
        Text = $"MyUML20WinV10 - {name}{file}{dirty}";
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!ConfirmDiscard())
            e.Cancel = true;
        base.OnFormClosing(e);
    }

    private void MenuExportImage_Click(object? sender, EventArgs e) =>
        ExportDiagram(UmlDiagramExportKind.Image);

    private void MenuExportSvg_Click(object? sender, EventArgs e) =>
        ExportDiagram(UmlDiagramExportKind.Svg);

    private void MenuExportPdf_Click(object? sender, EventArgs e) =>
        ExportDiagram(UmlDiagramExportKind.Pdf);

    private void MenuExportHtml_Click(object? sender, EventArgs e) =>
        ExportDocument(UmlDiagramExportKind.Html);

    private void MenuExportMarkdown_Click(object? sender, EventArgs e) =>
        ExportDocument(UmlDiagramExportKind.Markdown);

    private void ExportDiagram(UmlDiagramExportKind kind)
    {
        using var optionsDialog = new UmlDiagramExportDialog(kind, _project.Diagrams.Count);
        if (optionsDialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            if (optionsDialog.Scope == UmlDiagramExportScope.AllDiagrams)
            {
                using var folderDialog = new FolderBrowserDialog
                {
                    Description = "다이어그램 이미지를 저장할 폴더를 선택하세요.",
                    UseDescriptionForTitle = true,
                };
                if (folderDialog.ShowDialog(this) != DialogResult.OK)
                    return;

                var count = kind switch
                {
                    UmlDiagramExportKind.Image => UmlExportService.ExportDiagramImages(
                        _project, folderDialog.SelectedPath, optionsDialog.ImageFormat, optionsDialog.ImageOptions),
                    UmlDiagramExportKind.Svg => UmlExportService.ExportDiagramSvgs(
                        _project, folderDialog.SelectedPath, optionsDialog.VectorOptions),
                    UmlDiagramExportKind.Pdf => ExportAllDiagramPdfs(folderDialog.SelectedPath, optionsDialog.ImageOptions),
                    _ => 0,
                };

                MessageBox.Show(this, $"{count}개의 다이어그램을 보냈습니다.", "보내기",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var activeDiagram = _canvas.ActiveDiagram;
            var defaultName = UmlDiagramLayout.SanitizeFileName(activeDiagram.Name);
            using var saveDialog = new SaveFileDialog
            {
                Title = kind switch
                {
                    UmlDiagramExportKind.Image => "다이어그램 이미지 보내기",
                    UmlDiagramExportKind.Svg => "다이어그램 SVG 보내기",
                    UmlDiagramExportKind.Pdf => "다이어그램 PDF 보내기",
                    _ => "보내기",
                },
                FileName = kind switch
                {
                    UmlDiagramExportKind.Svg => $"{defaultName}.svg",
                    UmlDiagramExportKind.Pdf => $"{defaultName}.pdf",
                    _ => $"{defaultName}{UmlDiagramImageExporter.GetExtension(optionsDialog.ImageFormat)}",
                },
                Filter = kind switch
                {
                    UmlDiagramExportKind.Svg => UmlDiagramSvgExporter.FileFilter,
                    UmlDiagramExportKind.Pdf => UmlDiagramPdfExporter.FileFilter,
                    _ => UmlDiagramImageExporter.FileFilter,
                },
            };

            if (saveDialog.ShowDialog(this) != DialogResult.OK)
                return;

            switch (kind)
            {
                case UmlDiagramExportKind.Image:
                    var format = UmlDiagramImageExporter.ParseImageFormat(Path.GetExtension(saveDialog.FileName));
                    UmlExportService.ExportDiagramImage(_project, activeDiagram, saveDialog.FileName, format, optionsDialog.ImageOptions);
                    break;
                case UmlDiagramExportKind.Svg:
                    UmlExportService.ExportDiagramSvg(_project, activeDiagram, saveDialog.FileName, optionsDialog.VectorOptions);
                    break;
                case UmlDiagramExportKind.Pdf:
                    UmlExportService.ExportDiagramPdf(_project, activeDiagram, saveDialog.FileName, optionsDialog.ImageOptions);
                    break;
            }

            MessageBox.Show(this, "다이어그램을 보냈습니다.", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "보내기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private int ExportAllDiagramPdfs(string directory, UmlImageExportOptions options)
    {
        var count = 0;
        foreach (var diagram in _project.Diagrams)
        {
            var path = Path.Combine(directory, $"{UmlDiagramLayout.SanitizeFileName(diagram.Name)}.pdf");
            UmlExportService.ExportDiagramPdf(_project, diagram, path, options);
            count++;
        }

        return count;
    }

    private void ExportDocument(UmlDiagramExportKind kind)
    {
        using var optionsDialog = new UmlDiagramExportDialog(kind, _project.Diagrams.Count);
        if (optionsDialog.ShowDialog(this) != DialogResult.OK)
            return;

        using var saveDialog = new SaveFileDialog
        {
            Title = kind == UmlDiagramExportKind.Html ? "HTML 문서 보내기" : "Markdown 문서 보내기",
            FileName = $"{UmlDiagramLayout.SanitizeFileName(_project.Name)}{(kind == UmlDiagramExportKind.Html ? ".html" : ".md")}",
            Filter = kind == UmlDiagramExportKind.Html
                ? UmlProjectHtmlExporter.FileFilter
                : UmlProjectMarkdownExporter.FileFilter,
        };

        if (saveDialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            if (kind == UmlDiagramExportKind.Html)
                UmlProjectHtmlExporter.Export(_project, saveDialog.FileName, optionsDialog.DocumentOptions);
            else
                UmlProjectMarkdownExporter.Export(_project, saveDialog.FileName, optionsDialog.DocumentOptions);

            MessageBox.Show(this, "문서를 보냈습니다.", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "보내기 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

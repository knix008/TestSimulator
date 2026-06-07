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

    private void InitializeRuntime()
    {
        _canvas.SelectionChanged += (_, _) => SyncSelection();
        _canvas.ProjectChanged += (_, _) =>
        {
            _isDirty = true;
            UpdateTitle();
            _modelExplorer.Rebuild();
        };
        _modelExplorer.ElementSelected += ModelExplorer_ElementSelected;
        _umlToolbox.SelectionChanged += (_, e) => SetTool(e.Mode, fromToolbox: true);
        _canvas.SelectToolRequested += (_, _) => SetTool(UmlToolMode.Select);
        _canvas.ZoomChanged += (_, _) => UpdateZoomDisplay();
        SetTool(UmlToolMode.Select, fromToolbox: true);
        UpdateZoomDisplay();
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
        _statusLabel.Text = "도구를 선택한 뒤 캔버스에서 드래그하여 UML 요소를 만드세요.";
    }

    private void SetTool(UmlToolMode mode, bool fromToolbox = false)
    {
        _currentToolMode = mode;
        _canvas.SetToolMode(mode);
        if (!fromToolbox)
            _umlToolbox.SelectTool(mode);

        var hint = mode switch
        {
            UmlToolMode.Select => "요소를 선택하고 드래그하여 이동합니다. 더블클릭으로 이름을 편집합니다. 휠=확대/축소, Space+드래그=화면 이동.",
            UmlToolMode.Pan => "드래그하여 캔버스 화면을 이동합니다.",
            UmlToolMode.CreateClass => "캔버스에서 드래그하여 Class를 만듭니다.",
            UmlToolMode.CreateInterface => "캔버스에서 드래그하여 Interface를 만듭니다.",
            UmlToolMode.CreateEnumeration => "캔버스에서 드래그하여 Enumeration을 만듭니다.",
            UmlToolMode.CreatePackage => "캔버스에서 드래그하여 Package를 만듭니다.",
            UmlToolMode.CreateActor => "캔버스에서 드래그하여 Actor를 만듭니다.",
            UmlToolMode.CreateUseCase => "캔버스에서 드래그하여 Use Case를 만듭니다.",
            UmlToolMode.CreateNote => "캔버스에서 드래그하여 Note를 만듭니다.",
            UmlToolMode.CreateAssociation or UmlToolMode.CreateDirectedAssociation => "연관의 시작 노드를 클릭한 뒤 대상 노드를 클릭합니다.",
            UmlToolMode.CreateAggregation => "집합(◇) 연관: 시작 노드 → 대상 노드를 클릭합니다.",
            UmlToolMode.CreateComposition => "합성(◆) 연관: 시작 노드 → 대상 노드를 클릭합니다.",
            UmlToolMode.CreateGeneralization => "자식 클래스를 클릭한 뒤 부모 클래스를 클릭합니다.",
            UmlToolMode.CreateRealization => "구현 클래스를 클릭한 뒤 Interface를 클릭합니다.",
            UmlToolMode.CreateDependency => "의존 소스를 클릭한 뒤 대상을 클릭합니다.",
            UmlToolMode.CreateInclude => "Include: 기본 Use Case → 포함 Use Case를 클릭합니다.",
            UmlToolMode.CreateExtend => "Extend: 확장 Use Case → 기본 Use Case를 클릭합니다.",
            _ => string.Empty,
        };
        _statusLabel.Text = $"{hint} | 확대/축소: {_canvas.Zoom * 100:0}%";
    }

    private void UpdateZoomDisplay() => SetTool(_currentToolMode, fromToolbox: true);

    private void SyncSelection()
    {
        _suppressPropertySync = true;
        var selected = _canvas.SelectedObject;
        _propertyGrid.SelectedObject = selected;

        var isClassifier = selected is UmlClassifier;
        _pnlFeatureButtons.Visible = isClassifier;
        _btnAddOperation.Visible = selected is not UmlEnumeration;

        if (selected is UmlElement element)
            _modelExplorer.SelectElement(element.Id);

        _suppressPropertySync = false;
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

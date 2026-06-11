using MyUML20WinV10.Controls;
using MyUML20WinV10.Export;
using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;
using MyUML20WinV10.Serialization;
using MyUML20WinV10.Templates;

namespace MyUML20WinV10;

public partial class MainForm : Form
{
    private UmlProject _project = new();
    private string? _currentFilePath;
    private bool _isDirty;
    private bool _suppressPropertySync;
    private UmlToolMode _currentToolMode = UmlToolMode.Select;
    private string _lastUsedDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    private ToolTip? _featureToolTip;


    public MainForm() : this(null)
    {
    }

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

    private void MainForm_Shown(object? sender, EventArgs e)
    {
        if (DesignMode)
            return;

        ApplyPanelLayout();
    }

    private void ApplyPanelLayout()
    {
        var sideWidth = UmlToolbox.PreferredWidth;

        var mainWidth = _splitMain.ClientSize.Width;
        if (mainWidth > _splitMain.Panel1MinSize + _splitMain.Panel2MinSize + _splitMain.SplitterWidth)
        {
            var maxRight = mainWidth - _splitMain.Panel1MinSize - _splitMain.SplitterWidth;
            var rightWidth = Math.Clamp(sideWidth, _splitMain.Panel2MinSize, maxRight);
            _splitMain.SplitterDistance = mainWidth - rightWidth - _splitMain.SplitterWidth;
        }

        var workWidth = _splitWork.ClientSize.Width;
        if (workWidth > _splitWork.Panel1MinSize + _splitWork.Panel2MinSize + _splitWork.SplitterWidth)
        {
            var maxToolboxWidth = workWidth - _splitWork.Panel2MinSize - _splitWork.SplitterWidth;
            _splitWork.SplitterDistance = Math.Clamp(sideWidth, _splitWork.Panel1MinSize, maxToolboxWidth);
        }

        var rightHeight = _splitRight.ClientSize.Height;
        if (rightHeight > _splitRight.Panel1MinSize + _splitRight.Panel2MinSize + _splitRight.SplitterWidth)
        {
            // 탐색기(위)와 속성(아래)을 50:50으로 분할
            var explorerHeight = Math.Max(_splitRight.Panel1MinSize, (int)(rightHeight * 0.5));
            explorerHeight = Math.Min(explorerHeight, rightHeight - _splitRight.Panel2MinSize - _splitRight.SplitterWidth);
            _splitRight.SplitterDistance = explorerHeight;
        }

        _pnlExplorer.Visible = true;
        _modelExplorer.Visible = true;
    }

    private void InitializeRuntime()
    {
        ApplyKoreanText();
        BuildTemplateMenu();
        ApplyMenuToolTips();
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
        _canvas.ToolModeRequested += (_, mode) => SetTool(mode, fromToolbox: false);
        _canvas.ZoomChanged += (_, _) => UpdateZoomDisplay();
        _diagramTabBar.DiagramSelected += DiagramTabBar_DiagramSelected;
        _diagramTabBar.NewDiagramRequested += (_, _) => AddNewDiagram();
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
        _menuTemplates.Text = "템플릿(&T)";
        _menuExport.Text = "내보내기(&E)";
        _menuExportImage.Text = "다이어그램 이미지...";
        _menuExportSvg.Text = "다이어그램 SVG...";
        _menuExportPdf.Text = "다이어그램 PDF...";
        _menuExportHtml.Text = "HTML 문서...";
        _menuExportMarkdown.Text = "Markdown 문서...";
        _menuExit.Text = "끝내기(&X)";
        _menuEdit.Text = "편집(&E)";
        _menuDelete.Text = "선택 삭제(&D)";
        _menuDuplicate.Text = "선택 복제(&U)";
        _menuCopyToClipboard.Text = "다이어그램 클립보드 복사(&B)";
        _tsNew.Text = "새 파일";
        _tsOpen.Text = "열기";
        _tsSave.Text = "저장";
        _tsDelete.Text = "삭제";
        _tsZoomReset.Text = "맞춤";
        _statusLabel.Text = "준비";
        _btnAddProperty.Text = "+ 속성";
        _btnAddOperation.Text = "+ 연산";
        _lblToolbox.Text = "   UML 도구";
        _lblExplorer.Text = "   문서 구조";
        _lblProperties.Text = "   속성";
    }

    private void ApplyMenuToolTips()
    {
        _menuStrip.ShowItemToolTips = true;
        _toolStrip.ShowItemToolTips = true;

        _menuNew.ToolTipText = "빈 UML 프로젝트를 새로 만듭니다. 저장되지 않은 변경 사항이 있으면 확인합니다. (Ctrl+N)";
        _menuOpen.ToolTipText = "저장된 .umlprj 프로젝트 파일 또는 .uml 파일을 엽니다. (Ctrl+O)";
        _menuSave.ToolTipText = "현재 프로젝트를 마지막으로 저장한 경로에 덮어씁니다. (Ctrl+S)";
        _menuSaveAs.ToolTipText = "프로젝트를 다른 파일 이름·경로로 저장합니다. (Ctrl+Shift+S)";
        _menuTemplates.ToolTipText = "Templates/Projects 폴더의 .uml 템플릿 파일을 불러와 새 작업을 시작합니다.";
        _menuExport.ToolTipText = "현재 프로젝트의 다이어그램을 이미지, SVG, PDF, HTML, Markdown 형식으로 내보냅니다.";
        _menuExportImage.ToolTipText = "활성 다이어그램을 PNG, JPEG, BMP 등 래스터 이미지 파일로 저장합니다.";
        _menuExportSvg.ToolTipText = "활성 다이어그램을 벡터 SVG 파일로 저장합니다. 확대해도 선명합니다.";
        _menuExportPdf.ToolTipText = "활성 다이어그램을 PDF 문서로 저장합니다.";
        _menuExportHtml.ToolTipText = "프로젝트 전체를 HTML 문서로 내보냅니다. 브라우저에서 열 수 있습니다.";
        _menuExportMarkdown.ToolTipText = "프로젝트 전체를 Markdown 문서로 내보냅니다.";
        _menuExit.ToolTipText = "애플리케이션을 종료합니다. 저장하지 않은 변경 사항이 있으면 확인합니다.";
        _menuDelete.ToolTipText = "캔버스에서 선택한 노드·관계·다이어그램 요소를 삭제합니다. (Delete)";
        _menuDuplicate.ToolTipText = "선택한 노드를 복제해 약간 옆에 배치합니다. (Ctrl+D)";
        _menuCopyToClipboard.ToolTipText = "활성 다이어그램을 비트맵 이미지로 클립보드에 복사합니다. (Ctrl+Shift+C)";

        _tsNew.ToolTipText = _menuNew.ToolTipText;
        _tsOpen.ToolTipText = _menuOpen.ToolTipText;
        _tsSave.ToolTipText = _menuSave.ToolTipText;
        _tsDelete.ToolTipText = _menuDelete.ToolTipText;
        _tsDuplicate.ToolTipText = _menuDuplicate.ToolTipText;
        _tsCopyToClipboard.ToolTipText = _menuCopyToClipboard.ToolTipText;
        _tsZoomOut.ToolTipText = "캔버스를 축소합니다. 마우스 휠을 아래로 굴려도 축소됩니다.";
        _tsZoomIn.ToolTipText = "캔버스를 확대합니다. 마우스 휠을 위로 굴려도 확대됩니다.";
        _tsZoomReset.ToolTipText = "확대/축소를 100%로 초기화하고 다이어그램 전체가 보이도록 맞춥니다.";
        _tsZoomLabel.ToolTipText = "현재 캔버스 확대/축소 배율(%)입니다.";
        _tsAutoLayout.ToolTipText = "현재 다이어그램의 노드를 자동으로 정렬합니다. (Ctrl+Shift+L)";
        _menuAutoLayout.ToolTipText = _tsAutoLayout.ToolTipText;

        _featureToolTip?.Dispose();
        _featureToolTip = new ToolTip { ShowAlways = true };
        _featureToolTip.SetToolTip(_btnAddProperty, "선택한 Class/Interface에 속성(필드)을 추가합니다. 이름과 타입은 속성 패널에서 편집합니다.");
        _featureToolTip.SetToolTip(_btnAddOperation, "선택한 Class/Interface에 연산(메서드)을 추가합니다. 반환 타입과 매개변수는 속성 패널에서 편집합니다.");
    }

    private void ApplyVisualStyles()
    {
        var headerFont = new Font("Segoe UI", 9F, FontStyle.Bold);
        var headerBack = Color.FromArgb(40, 44, 74);

        _lblToolbox.Font = headerFont;
        _lblToolbox.BackColor = headerBack;
        _lblToolbox.ForeColor = Color.FromArgb(210, 215, 240);
        _lblToolbox.TextAlign = ContentAlignment.MiddleLeft;

        _lblExplorer.Font = headerFont;
        _lblExplorer.BackColor = headerBack;
        _lblExplorer.ForeColor = Color.FromArgb(210, 215, 240);
        _lblExplorer.TextAlign = ContentAlignment.MiddleLeft;

        _lblProperties.Font = headerFont;
        _lblProperties.BackColor = headerBack;
        _lblProperties.ForeColor = Color.FromArgb(210, 215, 240);
        _lblProperties.TextAlign = ContentAlignment.MiddleLeft;

        _pnlCanvasHost.BackColor = Color.FromArgb(60, 62, 88);
        _pnlCanvasHost.Padding = new Padding(1);

        _pnlFeatureButtons.BackColor = Color.FromArgb(235, 240, 255);
        _pnlFeatureButtons.Padding = new Padding(4, 3, 4, 3);

        _btnAddProperty.Font = new Font("Segoe UI", 8.5F);
        _btnAddOperation.Font = new Font("Segoe UI", 8.5F);
        _btnAddProperty.FlatAppearance.BorderColor = Color.FromArgb(79, 70, 229);
        _btnAddOperation.FlatAppearance.BorderColor = Color.FromArgb(79, 70, 229);

        _toolStrip.BackColor = Color.FromArgb(245, 246, 252);
        _toolStrip.Padding = new Padding(4, 1, 4, 1);

        _tsNew.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsNew.Image = UmlIcons.New();

        _tsOpen.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsOpen.Image = UmlIcons.Open();

        _tsSave.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsSave.Image = UmlIcons.Save();

        _tsDelete.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsDelete.Image = UmlIcons.Delete();

        _tsZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsZoomOut.Image = UmlIcons.ZoomOut();

        _tsZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsZoomIn.Image = UmlIcons.ZoomIn();

        _tsZoomReset.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        _tsZoomReset.Image = UmlIcons.ZoomReset();

        _tsZoomLabel.TextAlign = ContentAlignment.MiddleCenter;

        _tsDuplicate.Image = UmlIcons.Duplicate();
        _tsDuplicate.Click += (_, _) => _canvas.DuplicateSelection();

        _tsCopyToClipboard.Image = UmlIcons.CopyClipboard();
        _tsCopyToClipboard.Click += (_, _) => CopyDiagramToClipboard();

        _tsAutoLayout.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsAutoLayout.Image = UmlIcons.AutoLayout();

        _menuAutoLayout.Image = UmlIcons.AutoLayout();

        _menuDuplicate.Image = UmlIcons.Duplicate();
        _menuDuplicate.Click += (_, _) => _canvas.DuplicateSelection();

        _menuCopyToClipboard.Image = UmlIcons.CopyClipboard();
        _menuCopyToClipboard.Click += (_, _) => CopyDiagramToClipboard();

        _menuNew.Image = UmlIcons.New();
        _menuOpen.Image = UmlIcons.Open();
        _menuSave.Image = UmlIcons.Save();
        _menuSaveAs.Image = UmlIcons.SaveAs();
        _menuTemplates.Image = UmlIcons.Sample();
        _menuExport.Image = UmlIcons.Export();
        _menuExportImage.Image = UmlIcons.ExportImage();
        _menuExportSvg.Image = UmlIcons.ExportVector();
        _menuExportPdf.Image = UmlIcons.ExportPdf();
        _menuExportHtml.Image = UmlIcons.ExportHtml();
        _menuExportMarkdown.Image = UmlIcons.ExportMarkdown();
        _menuExit.Image = UmlIcons.Exit();
        _menuDelete.Image = UmlIcons.Delete();

        Icon = UmlIcons.CreateAppIcon();

        _menuSaveAs.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;

        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        _statusZoomLabel.TextAlign = ContentAlignment.MiddleRight;
        _statusZoomLabel.BorderSides = ToolStripStatusLabelBorderSides.Left;
        _statusZoomLabel.BorderStyle = Border3DStyle.Etched;
        _statusZoomLabel.ToolTipText = "현재 확대/축소 배율";

        _statusStrip.BackColor = Color.FromArgb(235, 238, 248);
        _statusStrip.SizingGrip = false;

        _tsTheme.Text = "테마";
        _tsTheme.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        _tsTheme.Image = UmlIcons.Theme();
        _tsTheme.ToolTipText = "다이어그램 및 도구상자의 색상 테마를 선택합니다.";
        foreach (UmlThemeKind theme in Enum.GetValues<UmlThemeKind>())
        {
            var captured = theme;
            var item = new ToolStripMenuItem(UmlDiagramStyle.GetThemeDisplayName(captured));
            item.Click += (_, _) =>
            {
                UmlDiagramStyle.CurrentTheme = captured;
                _canvas.ApplyTheme();
                _umlToolbox.Invalidate(true);
                UpdateThemeMenuChecks();
            };
            _tsTheme.DropDownItems.Add(item);
        }
        UpdateThemeMenuChecks();
    }

    private void UpdateThemeMenuChecks()
    {
        for (int i = 0; i < _tsTheme.DropDownItems.Count; i++)
        {
            if (_tsTheme.DropDownItems[i] is ToolStripMenuItem mi)
                mi.Checked = (UmlThemeKind)i == UmlDiagramStyle.CurrentTheme;
        }
        _tsTheme.Text = $"테마: {UmlDiagramStyle.GetThemeDisplayName(UmlDiagramStyle.CurrentTheme)}";
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
        _diagramTabBar.Bind(_project);
        _umlToolbox.SetDiagramKind(_project.ActiveDiagram.Kind);
        SetTool(UmlToolMode.Select, fromToolbox: true);
        UpdateTitle();
        SyncSelection();
        _statusLabel.Text = "왼쪽 도구상자에서 도구를 선택하거나 더블클릭하여 요소를 추가하세요. 선택 모드에서 더블클릭하면 이름을 편집합니다.";
    }

    private void DiagramTabBar_DiagramSelected(object? sender, Models.UmlDiagram diagram)
    {
        _project.ActiveDiagram = diagram;
        _canvas.SetActiveDiagram(diagram);
        _umlToolbox.SetDiagramKind(diagram.Kind);
        _currentToolMode = UmlToolMode.Select;
        _canvas.SetToolMode(UmlToolMode.Select);
        _modelExplorer.SelectDiagram(diagram.Id);
        SyncSelection();
        _statusLabel.Text = $"다이어그램 전환: {diagram.Name} ({GetDiagramKindName(diagram.Kind)})";
    }

    private void AddNewDiagram()
    {
        using var form = new Form
        {
            Text = "새 다이어그램 추가",
            ClientSize = new Size(360, 190),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false,
        };

        var lblKind = new Label { Text = "다이어그램 종류:", Left = 16, Top = 16, Width = 330, AutoSize = false };
        var cmbKind = new ComboBox
        {
            Left = 16, Top = 38, Width = 328,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        foreach (var diagramKind in Enum.GetValues<Models.UmlDiagramKind>())
            cmbKind.Items.Add(UmlDiagramCatalog.GetDiagramKindDisplayName(diagramKind));
        cmbKind.SelectedIndex = 0;

        var lblName = new Label { Text = "이름:", Left = 16, Top = 84, Width = 330, AutoSize = false };
        var txtName = new TextBox { Left = 16, Top = 106, Width = 328, Text = UmlDiagramCatalog.GetDiagramKindDisplayName(Models.UmlDiagramKind.ClassDiagram) };
        cmbKind.SelectedIndexChanged += (_, _) =>
            txtName.Text = cmbKind.SelectedItem?.ToString()
                ?? UmlDiagramCatalog.GetDiagramKindDisplayName(Models.UmlDiagramKind.ClassDiagram);

        var btnOk = new Button { Text = "추가", DialogResult = DialogResult.OK, Left = 164, Top = 148, Width = 88, Height = 30 };
        var btnCancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Left = 260, Top = 148, Width = 88, Height = 30 };
        form.Controls.AddRange([lblKind, cmbKind, lblName, txtName, btnOk, btnCancel]);
        form.AcceptButton = btnOk;
        form.CancelButton = btnCancel;

        if (form.ShowDialog(this) != DialogResult.OK) return;

        var kind = (Models.UmlDiagramKind)cmbKind.SelectedIndex;
        var name = txtName.Text.Trim();
        if (string.IsNullOrEmpty(name))
            name = GetDiagramKindName(kind);

        var diagram = new Models.UmlDiagram { Kind = kind, Name = name };
        _project.Diagrams.Add(diagram);
        _project.ActiveDiagram = diagram;
        _canvas.SetActiveDiagram(diagram);
        _umlToolbox.SetDiagramKind(kind);
        _currentToolMode = UmlToolMode.Select;
        _canvas.SetToolMode(UmlToolMode.Select);
        _diagramTabBar.Bind(_project);
        _isDirty = true;
        UpdateTitle();
        SyncSelection();
        _statusLabel.Text = $"새 다이어그램 추가됨: {diagram.Name}";
    }

    private static string GetDiagramKindName(Models.UmlDiagramKind kind) =>
        UmlDiagramCatalog.GetDiagramKindDisplayName(kind);

    private void SetTool(UmlToolMode mode, bool fromToolbox = false)
    {
        _currentToolMode = mode;
        _canvas.SetToolMode(mode);
        if (!fromToolbox)
            _umlToolbox.SelectTool(mode);

        var hint = UmlToolModeHelper.GetToolTip(mode);
        _statusLabel.Text = string.IsNullOrEmpty(hint) ? "준비" : hint;
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
        if (_suppressPropertySync)
            return;

        _suppressPropertySync = true;
        var selected = _canvas.SelectedObject;
        ApplyPropertyGridSelection(selected);

        if (selected is UmlElement element)
            _modelExplorer.SelectElement(element.Id, _project.ActiveDiagram.Id);

        _suppressPropertySync = false;

        _statusLabel.Text = GetStatusText(selected);
    }

    private void ApplyPropertyGridSelection(object? selected)
    {
        _propertyGrid.SelectedObject = selected;
        _umlToolbox.SetCanvasSelection(selected);

        var isClassifier = selected is UmlClassifier;
        _pnlFeatureButtons.Visible = isClassifier;
        _btnAddOperation.Visible = selected is not UmlEnumeration;
    }

    private string GetStatusText(object? selected) => selected switch
    {
        UmlClass cls => $"클래스 선택됨: {cls.Name}{(cls.IsAbstract ? " (추상)" : "")}  |  속성 {cls.Properties.Count}개, 연산 {cls.Operations.Count}개  |  Delete=삭제  F2=이름편집",
        UmlInterface ifc => $"인터페이스 선택됨: {ifc.Name}  |  연산 {ifc.Operations.Count}개  |  Delete=삭제",
        UmlEnumeration en => $"열거형 선택됨: {en.Name}  |  리터럴 {en.Literals.Count}개  |  Delete=삭제",
        UmlPackage pkg => $"패키지 선택됨: {pkg.Name}  |  Delete=삭제",
        UmlActor act => $"액터 선택됨: {act.Name}  |  Delete=삭제",
        UmlUseCase uc => $"유스케이스 선택됨: {uc.Name}  |  Delete=삭제",
        UmlSystemBoundary boundary => $"시스템 경계 선택됨: {boundary.Name}  |  Delete=삭제",
        UmlNote note => $"노트 선택됨  |  Delete=삭제",
        UmlComponent component => $"컴포넌트 선택됨: {component.Name}  |  Delete=삭제  F2=이름편집",
        UmlComponentInterface iface => $"{(iface.InterfaceKind == UmlComponentInterfaceKind.Provided ? "제공" : "요구")} 인터페이스 선택됨: {iface.Name}  |  Delete=삭제  F2=이름편집",
        UmlBehaviorNode behaviorNode => $"{GetBehaviorNodeStatusText(behaviorNode)}  |  Delete=삭제",
        UmlBehaviorConnector connector => $"{GetBehaviorConnectorStatusText(connector)}  |  Delete=삭제",
        UmlRelationship rel => GetRelationshipStatusText(rel),
        UmlDiagramEdge edge => $"연결 선택됨 ({GetEdgeRoutingLabel(edge.RoutingKind)})  |  꺾인선은 꺾임 꼭짓점 핸들을 드래그해 위치 조정  |  Delete=삭제",
        UmlDiagram diagram => $"다이어그램 선택됨: {diagram.Name} ({GetDiagramKindName(diagram.Kind)})  |  노드 {diagram.NodeCount}개, 연결 {diagram.EdgeCount}개  |  속성 패널에서 이름·종류 편집",
        UmlProject project => $"프로젝트 선택됨: {project.Name}  |  다이어그램 {project.Diagrams.Count}개  |  속성 패널에서 이름 편집",
        null => $"준비  |  다이어그램: {_project.ActiveDiagram.Name}  |  요소 {_project.ActiveDiagram.Nodes.Count}개, 관계 {_project.ActiveDiagram.Edges.Count}개",
        _ => "요소 선택됨",
    };

    private static string GetBehaviorNodeStatusText(UmlBehaviorNode behaviorNode) => behaviorNode.Kind switch
    {
        UmlBehaviorNodeKind.State => $"상태 선택됨: {behaviorNode.Name}",
        UmlBehaviorNodeKind.InitialState => "초기 상태 선택됨",
        UmlBehaviorNodeKind.FinalState => "최종 상태 선택됨",
        UmlBehaviorNodeKind.Action => $"액션 선택됨: {behaviorNode.Name}",
        UmlBehaviorNodeKind.InitialNode => "초기 노드 선택됨",
        UmlBehaviorNodeKind.ActivityFinalNode => "액티비티 종료 노드 선택됨",
        UmlBehaviorNodeKind.Decision => "Decision 노드 선택됨",
        UmlBehaviorNodeKind.Merge => "Merge 노드 선택됨",
        UmlBehaviorNodeKind.Fork => "Fork 노드 선택됨",
        UmlBehaviorNodeKind.Join => "Join 노드 선택됨",
        UmlBehaviorNodeKind.Lifeline => $"Lifeline 선택됨: {behaviorNode.Name}",
        UmlBehaviorNodeKind.CombinedFragment =>
            $"Loop 프래그먼트 선택됨: {UmlCombinedFragmentRenderer.GetFragmentLabel(behaviorNode)}",
        UmlBehaviorNodeKind.Activation => "Activation 선택됨",
        _ => "행동 표기 선택됨",
    };

    private static string GetBehaviorConnectorStatusText(UmlBehaviorConnector connector) => connector.Kind switch
    {
        UmlBehaviorConnectorKind.Message => connector.MessageKind switch
        {
            UmlMessageKind.Asynchronous => $"Async Message 선택됨: {connector.Name}",
            UmlMessageKind.Return => $"Return Message 선택됨: {connector.Name}",
            UmlMessageKind.SelfCall => $"Self Message 선택됨: {connector.Name}",
            _ => $"Sync Message 선택됨: {connector.Name}",
        },
        UmlBehaviorConnectorKind.Transition => "Transition 선택됨",
        UmlBehaviorConnectorKind.ControlFlow => "Control Flow 선택됨",
        UmlBehaviorConnectorKind.ObjectFlow => "Object Flow 선택됨",
        _ => "행동 연결 선택됨",
    };

    private static string GetEdgeRoutingLabel(UmlEdgeRoutingKind kind) => kind switch
    {
        UmlEdgeRoutingKind.Bent => "꺾인선",
        _ => "직선",
    };

    private static string GetRelationshipStatusText(UmlRelationship rel) => rel switch
    {
        UmlGeneralization => $"일반화 선택됨  |  Delete=삭제",
        UmlRealization => $"실체화 선택됨  |  Delete=삭제",
        UmlDependency dep => $"의존 선택됨{(string.IsNullOrEmpty(dep.Stereotype) ? "" : $" «{dep.Stereotype}»")}  |  Delete=삭제",
        UmlAssociation { Aggregation: UmlAggregationKind.Composite } => "합성 연관 선택됨  |  Delete=삭제",
        UmlAssociation { Aggregation: UmlAggregationKind.Shared } => "집합 연관 선택됨  |  Delete=삭제",
        UmlAssociation assoc => $"연관 선택됨{(string.IsNullOrEmpty(assoc.Name) ? "" : $": {assoc.Name}")}  |  Delete=삭제",
        UmlInclude => "«include» 선택됨  |  Delete=삭제",
        UmlExtend => "«extend» 선택됨  |  Delete=삭제",
        UmlNoteLink => "노트 연결 선택됨  |  Delete=삭제",
        _ => "관계 선택됨  |  Delete=삭제",
    };

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

        if (e.SelectedObject is UmlDiagram selectedDiagram)
        {
            ActivateDiagram(selectedDiagram);
        }
        else if (e.Diagram is not null)
        {
            ActivateDiagram(e.Diagram);
            if (e.SelectedObject is UmlElement element
                && (e.Diagram.FindNodeByModelId(element.Id) is not null
                    || e.Diagram.Edges.Any(edge => edge.ModelElementId == element.Id)))
            {
                _canvas.SelectModelElement(element.Id);
            }
        }

        ApplyPropertyGridSelection(e.SelectedObject);
        _statusLabel.Text = GetStatusText(e.SelectedObject);
        _suppressPropertySync = false;
    }

    private void ActivateDiagram(UmlDiagram diagram)
    {
        _project.ActiveDiagram = diagram;
        _canvas.SetActiveDiagram(diagram);
        _umlToolbox.SetDiagramKind(diagram.Kind);
        _currentToolMode = UmlToolMode.Select;
        _canvas.SetToolMode(UmlToolMode.Select);
        _diagramTabBar.Bind(_project);
    }

    private void PropertyGrid_PropertyValueChanged(object? s, PropertyValueChangedEventArgs e)
    {
        if (_suppressPropertySync)
            return;

        _isDirty = true;
        UpdateTitle();
        _modelExplorer.Rebuild();

        if (_propertyGrid.SelectedObject is UmlDiagram diagram)
        {
            if (ReferenceEquals(_project.ActiveDiagram, diagram))
                _umlToolbox.SetDiagramKind(diagram.Kind);

            _diagramTabBar.Bind(_project);
        }

        if (_propertyGrid.SelectedObject is UmlProject)
            UpdateTitle();

        _canvas.Invalidate();

        if (_propertyGrid.SelectedObject is not null)
            _statusLabel.Text = GetStatusText(_propertyGrid.SelectedObject);
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

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.Delete && _canvas.SelectedObject is not null)
        {
            DeleteSelection();
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }

    private void MenuAutoLayout_Click(object? sender, EventArgs e)
    {
        var diagram = _canvas.ActiveDiagram;
        if (diagram is null) return;
        UmlAutoLayout.Apply(_project, diagram);
        _canvas.RefreshLayout();
        _isDirty = true;
        _statusLabel.Text = "다이어그램이 자동 정렬되었습니다.";
    }

    private void MenuExit_Click(object? sender, EventArgs e) => Close();
    private void MenuDelete_Click(object? sender, EventArgs e) => DeleteSelection();
    private void TsZoomOut_Click(object? sender, EventArgs e) => _canvas.ZoomOut();
    private void TsZoomIn_Click(object? sender, EventArgs e) => _canvas.ZoomIn();
    private void TsZoomReset_Click(object? sender, EventArgs e) => _canvas.ZoomReset();

    private void MenuNew_Click(object? sender, EventArgs e) => NewProject(loadSample: false);

    private void BuildTemplateMenu()
    {
        _menuTemplates.DropDownItems.Clear();

        foreach (var template in UmlDiagramTemplateLibrary.DiagramTemplates)
        {
            var item = new ToolStripMenuItem(template.Name)
            {
                Tag = template.Id,
                ToolTipText = template.Description,
            };
            item.Click += (_, _) => LoadTemplate((string)item.Tag!);
            _menuTemplates.DropDownItems.Add(item);
        }

        _menuTemplates.DropDownItems.Add(new ToolStripSeparator());
        var fullSample = new ToolStripMenuItem(UmlDiagramTemplateLibrary.FullSampleInfo.Name)
        {
            Tag = UmlDiagramTemplateLibrary.FullSampleId,
            ToolTipText = UmlDiagramTemplateLibrary.FullSampleInfo.Description,
        };
        fullSample.Click += (_, _) => LoadTemplate((string)fullSample.Tag!);
        _menuTemplates.DropDownItems.Add(fullSample);
    }

    private void LoadTemplate(string templateId)
    {
        try
        {
            var templateProject = UmlDiagramTemplateLibrary.LoadTemplateProject(templateId);
            MergeTemplateIntoProject(templateProject);
            _isDirty = true;

            // Activate the first diagram from the template.
            if (templateProject.Diagrams.Count > 0)
                _project.ActiveDiagram = templateProject.Diagrams[0];

            BindProject();
            var template = UmlDiagramTemplateLibrary.FindTemplate(templateId);
            _statusLabel.Text = template is null
                ? "템플릿 다이어그램을 현재 프로젝트에 추가했습니다."
                : $"템플릿 '{template.Name}'을(를) 현재 프로젝트에 추가했습니다.";
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(this, "템플릿 오류", ex);
        }
    }

    private void MergeTemplateIntoProject(UmlProject source)
    {
        var src = source.RootPackage;
        var dst = _project.RootPackage;
        dst.Classifiers.AddRange(src.Classifiers);
        dst.Actors.AddRange(src.Actors);
        dst.UseCases.AddRange(src.UseCases);
        dst.SystemBoundaries.AddRange(src.SystemBoundaries);
        dst.Notes.AddRange(src.Notes);
        dst.BehaviorNodes.AddRange(src.BehaviorNodes);
        dst.Relationships.AddRange(src.Relationships);
        dst.NestedPackages.AddRange(src.NestedPackages);
        _project.Diagrams.AddRange(source.Diagrams);
    }

    private void MenuOpen_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = UmlProjectSerializer.OpenFileFilter,
            Title = "UML 프로젝트 열기",
            InitialDirectory = _lastUsedDirectory,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        _lastUsedDirectory = Path.GetDirectoryName(dialog.FileName) ?? _lastUsedDirectory;
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
            Filter = UmlProjectSerializer.SaveFileFilter,
            Title = "UML 프로젝트 저장",
            FileName = string.IsNullOrWhiteSpace(_project.Name) ? "Project" : _project.Name,
            DefaultExt = UmlProjectSerializer.ProjectFileExtension.TrimStart('.'),
            InitialDirectory = _lastUsedDirectory,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        _lastUsedDirectory = Path.GetDirectoryName(dialog.FileName) ?? _lastUsedDirectory;
        SaveTo(dialog.FileName);
    }

    private void SaveTo(string path)
    {
        try
        {
            UmlProjectSerializer.Save(_project, path);
            _currentFilePath = path;
            _isDirty = false;
            UpdateTitle();
            _statusLabel.Text = $"저장됨: {path}";
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(this, "저장 오류", ex);
        }
    }

    private void LoadProjectFile(string path, bool confirmDiscard = true)
    {
        if (confirmDiscard && !ConfirmDiscard())
            return;

        try
        {
            _project = UmlProjectSerializer.Load(path);
            _currentFilePath = path;
            _isDirty = false;
            BindProject();
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(this, "파일 열기 오류", ex);
        }
    }

    private void CopyDiagramToClipboard()
    {
        try
        {
            var options = new UmlImageExportOptions { TransparentBackground = false, BackgroundColor = Color.White, Padding = 20f };
            using var bitmap = UmlDiagramImageExporter.RenderBitmap(_project, _canvas.ActiveDiagram, options, useTransparency: false);
            Clipboard.SetImage(bitmap);
            _statusLabel.Text = "다이어그램 이미지를 클립보드에 복사했습니다.";
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(this, "클립보드 복사 오류", ex);
        }
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
                    InitialDirectory = _lastUsedDirectory,
                };
                if (folderDialog.ShowDialog(this) != DialogResult.OK)
                    return;

                _lastUsedDirectory = folderDialog.SelectedPath;
                var count = kind switch
                {
                    UmlDiagramExportKind.Image => UmlExportService.ExportDiagramImages(
                        _project, folderDialog.SelectedPath, optionsDialog.ImageFormat, optionsDialog.ImageOptions),
                    UmlDiagramExportKind.Svg => UmlExportService.ExportDiagramSvgs(
                        _project, folderDialog.SelectedPath, optionsDialog.VectorOptions),
                    UmlDiagramExportKind.Pdf => ExportAllDiagramPdfs(folderDialog.SelectedPath, optionsDialog.ImageOptions),
                    _ => 0,
                };

                _statusLabel.Text = $"{count}개 다이어그램 → {folderDialog.SelectedPath}";
                MessageBox.Show(this, $"{count}개의 다이어그램을 보냈습니다.\n{folderDialog.SelectedPath}", "보내기",
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
                InitialDirectory = _lastUsedDirectory,
            };

            if (saveDialog.ShowDialog(this) != DialogResult.OK)
                return;

            _lastUsedDirectory = Path.GetDirectoryName(saveDialog.FileName) ?? _lastUsedDirectory;

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

            _statusLabel.Text = $"보내기 완료: {saveDialog.FileName}";
            MessageBox.Show(this, $"다이어그램을 보냈습니다.\n{saveDialog.FileName}", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(this, "보내기 오류", ex);
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
            InitialDirectory = _lastUsedDirectory,
        };

        if (saveDialog.ShowDialog(this) != DialogResult.OK)
            return;

        _lastUsedDirectory = Path.GetDirectoryName(saveDialog.FileName) ?? _lastUsedDirectory;

        try
        {
            if (kind == UmlDiagramExportKind.Html)
                UmlProjectHtmlExporter.Export(_project, saveDialog.FileName, optionsDialog.DocumentOptions);
            else
                UmlProjectMarkdownExporter.Export(_project, saveDialog.FileName, optionsDialog.DocumentOptions);

            _statusLabel.Text = $"문서 보내기 완료: {saveDialog.FileName}";
            MessageBox.Show(this, $"문서를 보냈습니다.\n{saveDialog.FileName}", "보내기", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(this, "문서 보내기 오류", ex);
        }
    }
}

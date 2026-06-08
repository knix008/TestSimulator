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
        _tsNew.ToolTipText = "새 프로젝트 만들기 (Ctrl+N)";

        _tsOpen.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsOpen.Image = UmlIcons.Open();
        _tsOpen.ToolTipText = "프로젝트 열기 (Ctrl+O)";

        _tsSave.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsSave.Image = UmlIcons.Save();
        _tsSave.ToolTipText = "프로젝트 저장 (Ctrl+S)";

        _tsDelete.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsDelete.Image = UmlIcons.Delete();
        _tsDelete.ToolTipText = "선택 삭제 (Delete)";

        _tsZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsZoomOut.Image = UmlIcons.ZoomOut();
        _tsZoomOut.ToolTipText = "축소 (마우스 휠 아래)";

        _tsZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Image;
        _tsZoomIn.Image = UmlIcons.ZoomIn();
        _tsZoomIn.ToolTipText = "확대 (마우스 휠 위)";

        _tsZoomReset.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        _tsZoomReset.Image = UmlIcons.ZoomReset();
        _tsZoomReset.ToolTipText = "확대/축소 100% 초기화";

        _tsZoomLabel.TextAlign = ContentAlignment.MiddleCenter;
        _tsZoomLabel.ToolTipText = "현재 확대/축소 배율";

        _menuNew.Image = UmlIcons.New();
        _menuOpen.Image = UmlIcons.Open();
        _menuSave.Image = UmlIcons.Save();
        _menuSaveAs.Image = UmlIcons.Save();
        _menuSample.Image = UmlIcons.Sample();
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
        _canvas.SetActiveDiagram(diagram);
        _umlToolbox.SetDiagramKind(diagram.Kind);
        _currentToolMode = UmlToolMode.Select;
        _canvas.SetToolMode(UmlToolMode.Select);
        SyncSelection();
        _statusLabel.Text = $"다이어그램 전환: {diagram.Name} ({GetDiagramKindName(diagram.Kind)})";
    }

    private void AddNewDiagram()
    {
        using var form = new Form
        {
            Text = "새 다이어그램 추가",
            Width = 340,
            Height = 200,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false,
        };

        var lblKind = new Label { Text = "다이어그램 종류:", Left = 16, Top = 16, Width = 140 };
        var cmbKind = new ComboBox
        {
            Left = 16, Top = 36, Width = 288,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        cmbKind.Items.AddRange(["Class Diagram", "Use Case Diagram", "Sequence Diagram", "State Machine Diagram", "Activity Diagram"]);
        cmbKind.SelectedIndex = 0;

        var lblName = new Label { Text = "이름:", Left = 16, Top = 76, Width = 140 };
        var txtName = new TextBox { Left = 16, Top = 96, Width = 288, Text = "New Diagram" };

        var btnOk = new Button { Text = "추가", DialogResult = DialogResult.OK, Left = 128, Top = 130, Width = 80 };
        var btnCancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Left = 220, Top = 130, Width = 80 };
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

    private static string GetDiagramKindName(Models.UmlDiagramKind kind) => kind switch
    {
        Models.UmlDiagramKind.ClassDiagram => "Class Diagram",
        Models.UmlDiagramKind.UseCaseDiagram => "Use Case Diagram",
        Models.UmlDiagramKind.SequenceDiagram => "Sequence Diagram",
        Models.UmlDiagramKind.StateMachineDiagram => "State Machine Diagram",
        Models.UmlDiagramKind.ActivityDiagram => "Activity Diagram",
        _ => "Diagram",
    };

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
            UmlToolMode.CreateState or UmlToolMode.CreateInitialState or UmlToolMode.CreateFinalState
                => "상태 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateAction or UmlToolMode.CreateInitialNode or UmlToolMode.CreateActivityFinalNode
                or UmlToolMode.CreateDecision or UmlToolMode.CreateMerge or UmlToolMode.CreateFork or UmlToolMode.CreateJoin
                => "활동 노드 추가: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateLifeline
                => "라이프라인: 캔버스에 클릭·드래그하거나 도구를 더블클릭하세요.",
            UmlToolMode.CreateMessage
                => "동기 호출: 시작 라이프라인 → 대상 라이프라인 순으로 클릭합니다. 활성화 기둥은 자동 생성됩니다.",
            UmlToolMode.CreateAsyncMessage
                => "비동기 메시지: 시작 라이프라인 → 대상 라이프라인 순으로 클릭합니다.",
            UmlToolMode.CreateReturnMessage
                => "반환 메시지: 호출을 처리한 라이프라인 → 호출자 라이프라인 순으로 클릭합니다.",
            UmlToolMode.CreateSelfMessage
                => "자기 호출: 라이프라인을 한 번 클릭하면 루프 메시지가 추가됩니다.",
            UmlToolMode.CreateTransition => "전이: 시작 상태 → 대상 상태 순으로 클릭합니다.",
            UmlToolMode.CreateControlFlow => "제어 흐름: 시작 노드 → 대상 노드 순으로 클릭합니다.",
            UmlToolMode.CreateObjectFlow => "객체 흐름: 시작 노드 → 대상 노드 순으로 클릭합니다.",
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

        _statusLabel.Text = selected switch
        {
            UmlClass cls => $"클래스 선택됨: {cls.Name}{(cls.IsAbstract ? " (추상)" : "")}  |  속성 {cls.Properties.Count}개, 연산 {cls.Operations.Count}개  |  Delete=삭제  F2=이름편집",
            UmlInterface ifc => $"인터페이스 선택됨: {ifc.Name}  |  연산 {ifc.Operations.Count}개  |  Delete=삭제",
            UmlEnumeration en => $"열거형 선택됨: {en.Name}  |  리터럴 {en.Literals.Count}개  |  Delete=삭제",
            UmlPackage pkg => $"패키지 선택됨: {pkg.Name}  |  Delete=삭제",
            UmlActor act => $"액터 선택됨: {act.Name}  |  Delete=삭제",
            UmlUseCase uc => $"유스케이스 선택됨: {uc.Name}  |  Delete=삭제",
            UmlNote note => $"노트 선택됨  |  Delete=삭제",
            UmlBehaviorNode behaviorNode => $"{GetBehaviorNodeStatusText(behaviorNode)}  |  Delete=삭제",
            UmlBehaviorConnector connector => $"{GetBehaviorConnectorStatusText(connector)}  |  Delete=삭제",
            UmlRelationship rel => GetRelationshipStatusText(rel),
            null => $"준비  |  다이어그램: {_project.ActiveDiagram.Name}  |  요소 {_project.ActiveDiagram.Nodes.Count}개, 관계 {_project.ActiveDiagram.Edges.Count}개",
            _ => "요소 선택됨",
        };
    }

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
            UmlErrorDialog.Show(this, "문서 보내기 오류", ex);
        }
    }
}

using MyUML20WinV10.Models;

using MyUML20WinV10.Rendering;



namespace MyUML20WinV10.Controls;



public sealed class UmlToolboxSelectionChangedEventArgs(UmlToolMode mode) : EventArgs

{

    public UmlToolMode Mode { get; } = mode;

}



public sealed class UmlToolbox : UserControl

{

    private static readonly Color SidebarBg = Color.FromArgb(250, 251, 253);

    private static readonly Color BorderColor = Color.FromArgb(209, 213, 219);

    private static readonly Color Accent = Color.FromArgb(79, 70, 229);

    private static readonly Color AccentMuted = Color.FromArgb(237, 233, 254);

    private static readonly Color MatchAccent = Color.FromArgb(16, 185, 129);

    private static readonly Color MatchBg = Color.FromArgb(236, 253, 245);

    private static readonly Color Idle = Color.White;

    private static readonly Color Hover = Color.FromArgb(243, 244, 246);

    private static readonly Color Selected = Color.FromArgb(237, 233, 254);

    private static readonly Color TextColor = Color.FromArgb(17, 24, 39);



    private const int TileW = 86;
    private const int TileH = 76;
    private const int TileGap = 6;
    private const int TilesPerRow = 3;
    private const int HeaderH = 24;
    private const int GroupGap = 8;

    /// <summary>한 줄에 4개 도구가 들어가는 권장 폭(패딩 포함).</summary>
    public static int PreferredWidth =>
        12 + TilesPerRow * (TileW + TileGap) - TileGap;

    private readonly List<(SectionHeader Header, List<ToolboxTile> Tiles)> _groups = [];

    private readonly List<ToolboxTile> _allTiles = [];

    private readonly ToolTip _toolTip = new()
    {
        AutoPopDelay = 10000,
        InitialDelay = 400,
        ReshowDelay = 200,
        ShowAlways = true,
    };

    private bool _initialized;

    private UmlDiagramKind _currentKind = UmlDiagramKind.ClassDiagram;



    public event EventHandler<UmlToolboxSelectionChangedEventArgs>? SelectionChanged;

    public event EventHandler<UmlToolboxSelectionChangedEventArgs>? NotationDoubleClicked;



    public UmlToolbox()

    {

        DoubleBuffered = true;

        AutoScroll = true;

        BackColor = SidebarBg;

        Padding = new Padding(6, 4, 6, 10);

        MinimumSize = new Size(PreferredWidth, 0);

        Resize += (_, _) => LayoutAll();

    }



    protected override void OnHandleCreated(EventArgs e)

    {

        base.OnHandleCreated(e);

        EnsureInitialized();

    }



    public void SelectTool(UmlToolMode mode)

    {

        var tile = _allTiles.FirstOrDefault(t => t.Mode == mode);

        if (tile is not null)

            SelectTile(tile, raiseEvent: false);

    }



    public void SetCanvasSelection(object? selected)

    {

        var mode = UmlToolModeHelper.FromSelectedObject(selected);

        foreach (var tile in _allTiles)

            tile.MatchesCanvasSelection = mode.HasValue && tile.Mode == mode.Value;

        Invalidate();

    }



    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        if (DesignMode)
        {
            e.Graphics.Clear(SidebarBg);
            using var pen = new Pen(BorderColor);
            e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            using var brush = new SolidBrush(TextColor);
            using var font = new Font("Segoe UI", 8f);
            e.Graphics.DrawString("UML Toolbox", font, brush, 8, 8);
            return;
        }

        using var borderPen = new Pen(BorderColor);
        e.Graphics.DrawLine(borderPen, Width - 1, 0, Width - 1, Height);
    }



    public void SetDiagramKind(UmlDiagramKind kind)

    {

        _currentKind = kind;

        if (!_initialized) return;

        BuildGroupsForKind(kind);

        LayoutAll();

        if (_allTiles.Count > 0)
            SelectTile(_allTiles[0], raiseEvent: false);

    }



    private void EnsureInitialized()

    {

        if (DesignMode || _initialized)

            return;



        _initialized = true;

        BuildGroupsForKind(_currentKind);

        LayoutAll();

        SelectTile(_allTiles[0], raiseEvent: false);

    }



    private void BuildGroupsForKind(UmlDiagramKind kind)

    {

        SuspendLayout();

        foreach (var (header, _) in _groups)

            Controls.Remove(header);

        foreach (var tile in _allTiles)

            Controls.Remove(tile);



        _groups.Clear();

        _allTiles.Clear();






        switch (kind)

        {

            case UmlDiagramKind.ClassDiagram:

                AddGroup("분류자", [

                    (UmlToolMode.CreateClass, "Class", UmlNotationPreview.DrawClass),

                    (UmlToolMode.CreateInterface, "Interface", UmlNotationPreview.DrawInterface),

                    (UmlToolMode.CreateEnumeration, "Enum", UmlNotationPreview.DrawEnumeration),

                    (UmlToolMode.CreatePackage, "Package", UmlNotationPreview.DrawPackage),

                ]);

                AddGroup("관계", [

                    (UmlToolMode.CreateAssociation, "Association", UmlNotationPreview.DrawAssociation),

                    (UmlToolMode.CreateDirectedAssociation, "Directed", UmlNotationPreview.DrawDirectedAssociation),

                    (UmlToolMode.CreateAggregation, "Aggregation", UmlNotationPreview.DrawAggregation),

                    (UmlToolMode.CreateComposition, "Composition", UmlNotationPreview.DrawComposition),

                    (UmlToolMode.CreateGeneralization, "Generalization", UmlNotationPreview.DrawGeneralization),

                    (UmlToolMode.CreateRealization, "Realization", UmlNotationPreview.DrawRealization),

                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),

                    (UmlToolMode.CreateAssociationClass, "Assoc.Class", UmlNotationPreview.DrawAssociationClass),

                    (UmlToolMode.CreateNaryAssociationHub, "N-ary Hub", UmlNotationPreview.DrawNaryAssociationHub),

                    (UmlToolMode.CreateClassNesting, "Nesting", UmlNotationPreview.DrawClassNesting),

                    (UmlToolMode.CreateTable, "Table", UmlNotationPreview.DrawTable),

                    (UmlToolMode.CreateTrace, "Trace", UmlNotationPreview.DrawTrace),

                ]);

                break;

            case UmlDiagramKind.PackageDiagram:
                AddGroup("패키지", [
                    (UmlToolMode.CreatePackage, "Package", UmlNotationPreview.DrawPackage),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreatePackageMerge, "Merge", UmlNotationPreview.DrawPackageMerge),
                    (UmlToolMode.CreatePackageImport, "Import", UmlNotationPreview.DrawPackageImport),
                    (UmlToolMode.CreatePackageNesting, "Nesting", UmlNotationPreview.DrawPackageNesting),
                ]);
                break;

            case UmlDiagramKind.UseCaseDiagram:

                AddGroup("요소", [

                    (UmlToolMode.CreateActor, "Actor", UmlNotationPreview.DrawActor),

                    (UmlToolMode.CreateUseCase, "Use Case", UmlNotationPreview.DrawUseCase),

                    (UmlToolMode.CreateSystemBoundary, "Boundary", UmlNotationPreview.DrawSystemBoundary),

                    (UmlToolMode.CreatePackage, "Package", UmlNotationPreview.DrawPackage),

                ]);

                AddGroup("관계", [

                    (UmlToolMode.CreateAssociation, "Association", UmlNotationPreview.DrawAssociation),

                    (UmlToolMode.CreateGeneralization, "Generalization", UmlNotationPreview.DrawGeneralization),

                    (UmlToolMode.CreateInclude, "Include", UmlNotationPreview.DrawInclude),

                    (UmlToolMode.CreateExtend, "Extend", UmlNotationPreview.DrawExtend),

                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),

                ]);

                break;



            case UmlDiagramKind.SequenceDiagram:
                AddGroup("시퀀스", [

                    (UmlToolMode.CreateLifeline, "Lifeline", UmlNotationPreview.DrawLifeline),

                    (UmlToolMode.CreateDecomposedLifeline, "Part Line", UmlNotationPreview.DrawDecomposedLifeline),

                    (UmlToolMode.CreateActivation, "Activation", UmlNotationPreview.DrawActivation),

                    (UmlToolMode.CreateSequenceEndpoint, "Endpoint", UmlNotationPreview.DrawSequenceEndpoint),

                    (UmlToolMode.CreateGate, "Gate", UmlNotationPreview.DrawGate),

                ]);

                AddGroup("프래그먼트", [

                    (UmlToolMode.CreateLoopFragment, "Loop", UmlNotationPreview.DrawLoopFragment),

                    (UmlToolMode.CreateAltFragment, "Alt", UmlNotationPreview.DrawAltFragment),

                    (UmlToolMode.CreateOptFragment, "Opt", UmlNotationPreview.DrawOptFragment),

                    (UmlToolMode.CreateParFragment, "Par", UmlNotationPreview.DrawParFragment),

                    (UmlToolMode.CreateBreakFragment, "Break", UmlNotationPreview.DrawBreakFragment),

                    (UmlToolMode.CreateRefFragment, "Ref", UmlNotationPreview.DrawRefFragment),

                    (UmlToolMode.CreateInteractionOccurrence, "sd", UmlNotationPreview.DrawInteractionOccurrence),

                    (UmlToolMode.CreateSeqFragment, "Seq", UmlNotationPreview.DrawSeqFragment),

                    (UmlToolMode.CreateStrictFragment, "Strict", UmlNotationPreview.DrawStrictFragment),

                    (UmlToolMode.CreateNegFragment, "Neg", UmlNotationPreview.DrawNegFragment),

                    (UmlToolMode.CreateCriticalFragment, "Critical", UmlNotationPreview.DrawCriticalFragment),

                    (UmlToolMode.CreateIgnoreFragment, "Ignore", UmlNotationPreview.DrawIgnoreFragment),

                    (UmlToolMode.CreateConsiderFragment, "Consider", UmlNotationPreview.DrawConsiderFragment),

                    (UmlToolMode.CreateAssertFragment, "Assert", UmlNotationPreview.DrawAssertFragment),

                    (UmlToolMode.CreateStateInvariant, "Invariant", UmlNotationPreview.DrawStateInvariant),

                    (UmlToolMode.CreateContinuation, "Continue", UmlNotationPreview.DrawContinuation),

                ]);

                AddGroup("메시지", [

                    (UmlToolMode.CreateMessage, "Sync", UmlNotationPreview.DrawSyncMessage),

                    (UmlToolMode.CreateAsyncMessage, "Async", UmlNotationPreview.DrawAsyncMessage),

                    (UmlToolMode.CreateReturnMessage, "Return", UmlNotationPreview.DrawReturnMessage),

                    (UmlToolMode.CreateSelfMessage, "Self", UmlNotationPreview.DrawSelfMessage),

                    (UmlToolMode.CreateCreateMessage, "Create", UmlNotationPreview.DrawCreateMessage),

                    (UmlToolMode.CreateDestroyMessage, "Destroy", UmlNotationPreview.DrawDestroyMessage),

                ]);

                break;

            case UmlDiagramKind.StateMachineDiagram:

                AddGroup("상태", [

                    (UmlToolMode.CreateState, "State", UmlNotationPreview.DrawState),

                    (UmlToolMode.CreateInitialState, "Initial", UmlNotationPreview.DrawInitialState),

                    (UmlToolMode.CreateFinalState, "Final", UmlNotationPreview.DrawFinalState),

                    (UmlToolMode.CreateCompositeState, "Composite", UmlNotationPreview.DrawCompositeState),

                    (UmlToolMode.CreateOrthogonalRegion, "Orthogonal", UmlNotationPreview.DrawOrthogonalRegion),

                    (UmlToolMode.CreateSubmachineState, "Submachine", UmlNotationPreview.DrawSubmachineState),

                    (UmlToolMode.CreateTerminateState, "Terminate", UmlNotationPreview.DrawTerminateState),

                ]);

                AddGroup("의사상태", [

                    (UmlToolMode.CreateChoice, "Choice", UmlNotationPreview.DrawChoice),

                    (UmlToolMode.CreateJunction, "Junction", UmlNotationPreview.DrawJunction),

                    (UmlToolMode.CreateShallowHistory, "Shallow H", UmlNotationPreview.DrawShallowHistory),

                    (UmlToolMode.CreateDeepHistory, "Deep H", UmlNotationPreview.DrawDeepHistory),

                    (UmlToolMode.CreateEntryPoint, "Entry", UmlNotationPreview.DrawEntryPoint),

                    (UmlToolMode.CreateExitPoint, "Exit", UmlNotationPreview.DrawExitPoint),

                ]);

                AddGroup("관계", [

                    (UmlToolMode.CreateTransition, "Transition", UmlNotationPreview.DrawTransition),

                ]);

                break;

            case UmlDiagramKind.ActivityDiagram:

                AddGroup("활동", [

                    (UmlToolMode.CreateAction, "Action", UmlNotationPreview.DrawAction),

                    (UmlToolMode.CreateSwimlane, "Swimlane", UmlNotationPreview.DrawSwimlane),

                    (UmlToolMode.CreateObjectNode, "Object", UmlNotationPreview.DrawObjectNode),

                    (UmlToolMode.CreateInitialNode, "Initial", UmlNotationPreview.DrawInitialNode),

                    (UmlToolMode.CreateActivityFinalNode, "Act.Final", UmlNotationPreview.DrawActivityFinalNode),

                    (UmlToolMode.CreateFlowFinalNode, "FlowFinal", UmlNotationPreview.DrawFlowFinalNode),

                    (UmlToolMode.CreateDecision, "Decision", UmlNotationPreview.DrawDecision),

                    (UmlToolMode.CreateMerge, "Merge", UmlNotationPreview.DrawMerge),

                    (UmlToolMode.CreateFork, "Fork", UmlNotationPreview.DrawFork),

                    (UmlToolMode.CreateJoin, "Join", UmlNotationPreview.DrawJoin),

                    (UmlToolMode.CreateExpansionRegion, "Expansion", UmlNotationPreview.DrawExpansionRegion),

                    (UmlToolMode.CreateInterruptibleRegion, "Interrupt", UmlNotationPreview.DrawInterruptibleRegion),

                    (UmlToolMode.CreateActivityContainer, "Container", UmlNotationPreview.DrawActivityContainer),

                    (UmlToolMode.CreateDataStore, "Data Store", UmlNotationPreview.DrawDataStore),

                    (UmlToolMode.CreateInputPin, "Input Pin", UmlNotationPreview.DrawInputPin),

                    (UmlToolMode.CreateOutputPin, "Output Pin", UmlNotationPreview.DrawOutputPin),

                    (UmlToolMode.CreateExceptionHandler, "Exception", UmlNotationPreview.DrawExceptionHandler),

                ]);

                AddGroup("관계", [

                    (UmlToolMode.CreateControlFlow, "Control Flow", UmlNotationPreview.DrawControlFlow),

                    (UmlToolMode.CreateObjectFlow, "Object Flow", UmlNotationPreview.DrawObjectFlow),

                ]);

                break;

            case UmlDiagramKind.ObjectDiagram:
                AddGroup("객체", [
                    (UmlToolMode.CreateObjectInstance, "Object", UmlNotationPreview.DrawObjectInstance),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateAssociation, "Association", UmlNotationPreview.DrawAssociation),
                    (UmlToolMode.CreateDirectedAssociation, "Directed", UmlNotationPreview.DrawDirectedAssociation),
                    (UmlToolMode.CreateAggregation, "Aggregation", UmlNotationPreview.DrawAggregation),
                    (UmlToolMode.CreateComposition, "Composition", UmlNotationPreview.DrawComposition),
                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),
                ]);
                break;

            case UmlDiagramKind.CommunicationDiagram:
                AddGroup("객체", [
                    (UmlToolMode.CreateObjectInstance, "Object", UmlNotationPreview.DrawObjectInstance),
                ]);
                AddGroup("메시지", [
                    (UmlToolMode.CreateMessage, "Sync", UmlNotationPreview.DrawSyncMessage),
                    (UmlToolMode.CreateAsyncMessage, "Async", UmlNotationPreview.DrawAsyncMessage),
                    (UmlToolMode.CreateReturnMessage, "Return", UmlNotationPreview.DrawReturnMessage),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateAssociation, "Association", UmlNotationPreview.DrawAssociation),
                    (UmlToolMode.CreateDirectedAssociation, "Directed", UmlNotationPreview.DrawDirectedAssociation),
                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),
                ]);
                break;

            case UmlDiagramKind.DeploymentDiagram:
                AddGroup("배치", [
                    (UmlToolMode.CreateDeploymentHost, "Node", UmlNotationPreview.DrawDeploymentHost),
                    (UmlToolMode.CreateArtifact, "Artifact", UmlNotationPreview.DrawArtifact),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateDeployment, "Deploy", UmlNotationPreview.DrawDeployment),
                    (UmlToolMode.CreateDeploymentPath, "Path", UmlNotationPreview.DrawDeploymentPath),
                ]);
                break;

            case UmlDiagramKind.ProfileDiagram:
                AddGroup("프로파일", [
                    (UmlToolMode.CreateProfilePackage, "Profile", UmlNotationPreview.DrawProfilePackage),
                    (UmlToolMode.CreateMetaclass, "Metaclass", UmlNotationPreview.DrawMetaclass),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateApplyDependency, "Apply", UmlNotationPreview.DrawApplyDependency),
                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),
                ]);
                break;

            case UmlDiagramKind.TimingDiagram:
                AddGroup("타이밍", [
                    (UmlToolMode.CreateTimingLifeline, "Lifeline", UmlNotationPreview.DrawTimingLifeline),
                    (UmlToolMode.CreateTimingState, "State", UmlNotationPreview.DrawTimingState),
                ]);
                break;

            case UmlDiagramKind.CompositeStructureDiagram:
                AddGroup("구조", [
                    (UmlToolMode.CreateClass, "Frame", UmlNotationPreview.DrawClass),
                    (UmlToolMode.CreatePort, "Port", UmlNotationPreview.DrawPort),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateAssociation, "Connector", UmlNotationPreview.DrawAssociation),
                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),
                ]);
                break;

            case UmlDiagramKind.InteractionOverviewDiagram:
                AddGroup("흐름", [
                    (UmlToolMode.CreateInteractionUse, "Interaction", UmlNotationPreview.DrawInteractionUse),
                    (UmlToolMode.CreateDecision, "Decision", UmlNotationPreview.DrawDecision),
                    (UmlToolMode.CreateMerge, "Merge", UmlNotationPreview.DrawMerge),
                    (UmlToolMode.CreateInitialNode, "Initial", UmlNotationPreview.DrawInitialNode),
                    (UmlToolMode.CreateActivityFinalNode, "Final", UmlNotationPreview.DrawActivityFinalNode),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateControlFlow, "Control Flow", UmlNotationPreview.DrawControlFlow),
                ]);
                break;

            case UmlDiagramKind.ComponentDiagram:
                AddGroup("컴포넌트", [
                    (UmlToolMode.CreateComponent, "Component", UmlNotationPreview.DrawComponent),
                    (UmlToolMode.CreatePort, "Port", UmlNotationPreview.DrawPort),
                    (UmlToolMode.CreateProvidedInterface, "Provided", UmlNotationPreview.DrawProvidedInterface),
                    (UmlToolMode.CreateRequiredInterface, "Required", UmlNotationPreview.DrawRequiredInterface),
                    (UmlToolMode.CreatePackage, "Package", UmlNotationPreview.DrawPackage),
                ]);
                AddGroup("관계", [
                    (UmlToolMode.CreateAssembly, "Assembly", UmlNotationPreview.DrawAssembly),
                    (UmlToolMode.CreateDependency, "Dependency", UmlNotationPreview.DrawDependency),
                ]);
                break;

            default:
                // Fallback — shows basic class diagram tools so the toolbox is never empty.
                goto case UmlDiagramKind.ClassDiagram;

        }



        AddGroup("기타", [

            (UmlToolMode.CreateNote, "Note", UmlNotationPreview.DrawNote),

            (UmlToolMode.CreateNoteLink, "NoteLink", UmlNotationPreview.DrawNoteLink),

        ]);



        ResumeLayout(false);
    }



    private void AddGroup(string name, IEnumerable<(UmlToolMode Mode, string Caption, Action<Graphics, RectangleF, Color, Color> Draw)> items)

    {

        var header = new SectionHeader(name);

        Controls.Add(header);



        var tiles = new List<ToolboxTile>();

        foreach (var (mode, caption, draw) in items)

        {

            var tile = new ToolboxTile(mode, caption, draw);

            tile.Click += (_, _) => SelectTile(tile);

            tile.DoubleClick += (_, _) =>

            {

                SelectTile(tile);

                NotationDoubleClicked?.Invoke(this, new UmlToolboxSelectionChangedEventArgs(tile.Mode));

            };

            tile.MouseEnter += (_, _) => tile.Hovered = true;

            tile.MouseLeave += (_, _) => tile.Hovered = false;

            _toolTip.SetToolTip(tile, UmlToolModeHelper.GetToolTip(mode));

            tiles.Add(tile);

            _allTiles.Add(tile);

            Controls.Add(tile);

        }



        _groups.Add((header, tiles));

    }



    private void LayoutAll()

    {

        if (!_initialized)

            return;



        AutoScrollPosition = Point.Empty;

        SuspendLayout();



        var usableW = Math.Max(TileW + TileGap, ClientSize.Width - Padding.Horizontal);

        var cols = Math.Min(TilesPerRow, Math.Max(1, (usableW + TileGap) / (TileW + TileGap)));

        var left = Padding.Left;

        var top = Padding.Top;



        foreach (var (header, tiles) in _groups)

        {

            header.SetBounds(left, top, usableW, HeaderH);

            top += HeaderH + TileGap;



            var col = 0;

            var rowTop = top;

            foreach (var tile in tiles)

            {

                tile.SetBounds(left + col * (TileW + TileGap), rowTop, TileW, TileH);

                tile.Visible = true;

                if (++col >= cols)

                {

                    col = 0;

                    rowTop += TileH + TileGap;

                }

            }



            top = rowTop + (col > 0 ? TileH : 0) + GroupGap;

        }



        AutoScrollMinSize = new Size(0, top + Padding.Bottom);

        ResumeLayout(true);

        Invalidate();

    }



    private void SelectTile(ToolboxTile tile, bool raiseEvent = true)

    {

        foreach (var t in _allTiles)

            t.Selected = ReferenceEquals(t, tile);



        if (raiseEvent)

            SelectionChanged?.Invoke(this, new UmlToolboxSelectionChangedEventArgs(tile.Mode));

    }



    private sealed class SectionHeader : Control

    {

        private static readonly Font HeaderFont = new("Segoe UI Semibold", 9f, FontStyle.Bold);



        public SectionHeader(string name)

        {

            Text = name;

            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);

        }



        protected override void OnPaint(PaintEventArgs e)

        {

            using var bg = new SolidBrush(Color.FromArgb(229, 234, 242));

            e.Graphics.FillRectangle(bg, ClientRectangle);

            using var brush = new SolidBrush(Color.FromArgb(31, 41, 55));

            using var fmt = new StringFormat { LineAlignment = StringAlignment.Center };

            e.Graphics.DrawString(Text, HeaderFont, brush, new RectangleF(8, 0, Width - 8, Height), fmt);

            using var pen = new Pen(Color.FromArgb(156, 163, 175));

            e.Graphics.DrawLine(pen, 0, Height - 1, Width, Height - 1);

        }

    }



    private sealed class ToolboxTile : Control

    {

        private static readonly Font CaptionFont = new("Segoe UI", 9f);

        private static readonly Font CaptionFontBold = new("Segoe UI", 9f, FontStyle.Bold);

        private const int CaptionH = 20;



        public UmlToolMode Mode { get; }

        public string Caption { get; }

        private readonly Action<Graphics, RectangleF, Color, Color> _draw;



        private bool _selected;
        private bool _hovered;
        private bool _matchesCanvasSelection;

        public bool Selected
        {
            get => _selected;
            set { if (_selected != value) { _selected = value; Invalidate(); } }
        }

        public bool Hovered
        {
            get => _hovered;
            set { if (_hovered != value) { _hovered = value; Invalidate(); } }
        }

        public bool MatchesCanvasSelection
        {
            get => _matchesCanvasSelection;
            set { if (_matchesCanvasSelection != value) { _matchesCanvasSelection = value; Invalidate(); } }
        }



        public ToolboxTile(UmlToolMode mode, string caption, Action<Graphics, RectangleF, Color, Color> draw)

        {

            Mode = mode;

            Caption = caption;

            _draw = draw;

            Cursor = Cursors.Hand;

            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);

        }



        protected override void OnPaint(PaintEventArgs e)

        {

            var g = e.Graphics;

            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;



            var bg = Selected ? UmlToolbox.Selected : MatchesCanvasSelection ? UmlToolbox.MatchBg : Hovered ? UmlToolbox.Hover : UmlToolbox.Idle;

            using var bgBrush = new SolidBrush(bg);

            // Inset 1px so the border draws fully inside client bounds (prevents edge clipping).
            var inset = Rectangle.Inflate(ClientRectangle, -1, -1);
            using var path = RoundedRect(inset, 6);

            g.FillPath(bgBrush, path);



            Color borderColor;

            float borderWidth;

            if (Selected)

            {

                borderColor = UmlToolbox.Accent;

                borderWidth = 1.5f;

            }

            else if (MatchesCanvasSelection)

            {

                borderColor = UmlToolbox.MatchAccent;

                borderWidth = 1.5f;

            }

            else

            {

                borderColor = UmlToolbox.BorderColor;

                borderWidth = 1f;

            }



            using var borderPen = new Pen(borderColor, borderWidth);

            g.DrawPath(borderPen, path);



            var previewRect = new RectangleF(7, 5, Width - 14, Height - CaptionH - 8);

            UmlDiagramStyle.SilhouetteMode = true;
            try
            {
                _draw(g, previewRect, UmlDiagramStyle.PreviewFillColor, Selected ? UmlDiagramStyle.PreviewStrokeColor : MatchesCanvasSelection ? UmlToolbox.MatchAccent : UmlDiagramStyle.PreviewStrokeColor);
            }
            finally
            {
                UmlDiagramStyle.SilhouetteMode = false;
            }



            using var textBrush = new SolidBrush(Selected ? UmlToolbox.Accent : MatchesCanvasSelection ? UmlToolbox.MatchAccent : UmlToolbox.TextColor);

            using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

            g.DrawString(Caption, Selected || MatchesCanvasSelection ? CaptionFontBold : CaptionFont, textBrush,

                new RectangleF(0, Height - CaptionH, Width, CaptionH), fmt);

            if (Selected)
            {

                using var selBar = new SolidBrush(UmlToolbox.Accent);

                g.FillRectangle(selBar, 2, Height - 3, Width - 4, 3);

            }

        }



        private static System.Drawing.Drawing2D.GraphicsPath RoundedRect(Rectangle rect, int radius)

        {

            var path = new System.Drawing.Drawing2D.GraphicsPath();

            var r = Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2);

            if (r < 2)

            {

                path.AddRectangle(rect);

                return path;

            }



            var d = r * 2;

            path.AddArc(rect.X, rect.Y, d, d, 180, 90);

            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);

            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);

            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);

            path.CloseFigure();

            return path;

        }

    }

}



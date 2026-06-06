using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.Templates;

public sealed record DiagramTemplateInfo(string Id, string Name, string Description);

public static class DiagramTemplateLibrary
{
    public static IReadOnlyList<DiagramTemplateInfo> All { get; } =
    [
        new("org-basic", "조직도 (기본 3단)", "대표-팀장-실무자 3단계 조직도"),
        new("org-department", "조직도 (부서형)", "본부-팀-담당 구조의 부서형 조직도"),
        new("org-project", "조직도 (프로젝트팀)", "PM 중심 프로젝트 조직도"),
        new("flowchart-basic", "플로우차트 (기본)", "시작-입력-처리-판단-종료 흐름도"),
        new("process-linear", "순차 프로세스", "단계별 순차 진행 프로세스"),
        new("network-basic", "네트워크 (기본)", "인터넷-방화벽-서버-DB 3계층 구성도")
    ];

    public static DiagramProject Build(string templateId)
    {
        return templateId switch
        {
            "org-basic" => BuildOrgBasic(),
            "org-department" => BuildOrgDepartment(),
            "org-project" => BuildOrgProject(),
            "flowchart-basic" => BuildFlowchartBasic(),
            "process-linear" => BuildProcessLinear(),
            "network-basic" => BuildNetworkBasic(),
            _ => throw new ArgumentException($"알 수 없는 템플릿: {templateId}", nameof(templateId))
        };
    }

    // ── Color palette ─────────────────────────────────────────────────────
    private static class Palette
    {
        public const uint White      = 0xFFFFFFFF;
        public const uint Exec       = 0xFFDBEAFE; // blue-100
        public const uint Manager    = 0xFFFEF3C7; // amber-100
        public const uint Staff      = 0xFFD1FAE5; // emerald-100
        public const uint Hq         = 0xFFEDE9FE; // violet-100
        public const uint Sales      = 0xFFE0F2FE; // sky-100
        public const uint Dev        = 0xFFE0E7FF; // indigo-100
        public const uint Hr         = 0xFFFCE7F3; // pink-100
        public const uint Start      = 0xFFDCFCE7; // green-100
        public const uint Process    = 0xFFF1F5F9; // slate-100
        public const uint Decision   = 0xFFFEF9C3; // yellow-100
        public const uint End        = 0xFFFEE2E2; // red-100
        public const uint Network    = 0xFFCCFBF1; // teal-100
        public const uint Server     = 0xFFE2E8F0; // slate-200
        public const uint Border     = 0xFF475569;
        public const uint Text       = 0xFF1E293B;
        public const uint Connector  = 0xFF64748B;
    }

    // ── Organization charts ───────────────────────────────────────────────
    private static DiagramProject BuildOrgBasic()
    {
        var project = CreateProject("조직도 (기본 3단)");

        var ceo = AddShape(project, "대표이사", 380, 40, 170, 72,
            ShapeKind.RoundedRectangle, Palette.Exec, bold: true, fontSize: 11f);

        var salesMgr = AddShape(project, "영업팀장", 60, 190, 150, 64,
            ShapeKind.RoundedRectangle, Palette.Manager);
        var devMgr = AddShape(project, "개발팀장", 390, 190, 150, 64,
            ShapeKind.RoundedRectangle, Palette.Manager);
        var hrMgr = AddShape(project, "인사팀장", 720, 190, 150, 64,
            ShapeKind.RoundedRectangle, Palette.Manager);

        var s1 = AddShape(project, "영업 담당 A", 30, 340, 130, 52, ShapeKind.Rectangle, Palette.Staff);
        var s2 = AddShape(project, "영업 담당 B", 170, 340, 130, 52, ShapeKind.Rectangle, Palette.Staff);
        var d1 = AddShape(project, "프론트엔드", 330, 340, 130, 52, ShapeKind.Rectangle, Palette.Staff);
        var d2 = AddShape(project, "백엔드", 470, 340, 130, 52, ShapeKind.Rectangle, Palette.Staff);
        var h1 = AddShape(project, "채용 담당", 700, 340, 130, 52, ShapeKind.Rectangle, Palette.Staff);
        var h2 = AddShape(project, "교육 담당", 820, 340, 130, 52, ShapeKind.Rectangle, Palette.Staff);

        LinkOrg(project, ceo, salesMgr);
        LinkOrg(project, ceo, devMgr);
        LinkOrg(project, ceo, hrMgr);
        LinkOrg(project, salesMgr, s1);
        LinkOrg(project, salesMgr, s2);
        LinkOrg(project, devMgr, d1);
        LinkOrg(project, devMgr, d2);
        LinkOrg(project, hrMgr, h1);
        LinkOrg(project, hrMgr, h2);

        return project;
    }

    private static DiagramProject BuildOrgDepartment()
    {
        var project = CreateProject("조직도 (부서형)");

        var hq = AddShape(project, "경영본부", 380, 30, 200, 76,
            ShapeKind.RoundedRectangle, Palette.Hq, bold: true, fontSize: 11f);

        var sales = AddShape(project, "영업본부", 40, 170, 210, 88,
            ShapeKind.RoundedRectangle, Palette.Sales, bold: true);
        var dev = AddShape(project, "개발본부", 360, 170, 210, 88,
            ShapeKind.RoundedRectangle, Palette.Dev, bold: true);
        var hr = AddShape(project, "인사본부", 680, 170, 210, 88,
            ShapeKind.RoundedRectangle, Palette.Hr, bold: true);

        var s1 = AddShape(project, "국내영업팀", 20, 320, 120, 54);
        var s2 = AddShape(project, "해외영업팀", 160, 320, 120, 54);
        var d1 = AddShape(project, "프론트팀", 300, 320, 120, 54);
        var d2 = AddShape(project, "백엔드팀", 440, 320, 120, 54);
        var d3 = AddShape(project, "인프라팀", 580, 320, 120, 54);
        var h1 = AddShape(project, "채용팀", 680, 320, 100, 54);
        var h2 = AddShape(project, "교육팀", 800, 320, 100, 54);

        LinkOrg(project, hq, sales);
        LinkOrg(project, hq, dev);
        LinkOrg(project, hq, hr);
        LinkOrg(project, sales, s1);
        LinkOrg(project, sales, s2);
        LinkOrg(project, dev, d1);
        LinkOrg(project, dev, d2);
        LinkOrg(project, dev, d3);
        LinkOrg(project, hr, h1);
        LinkOrg(project, hr, h2);

        return project;
    }

    private static DiagramProject BuildOrgProject()
    {
        var project = CreateProject("조직도 (프로젝트팀)");

        var sponsor = AddShape(project, "프로젝트 스폰서", 390, 30, 160, 68,
            ShapeKind.Diamond, Palette.Decision, bold: true);
        var pm = AddShape(project, "프로젝트 매니저", 365, 150, 210, 76,
            ShapeKind.RoundedRectangle, Palette.Exec, bold: true, fontSize: 11f);

        var plan = AddShape(project, "기획", 60, 300, 120, 58, ShapeKind.Parallelogram, Palette.Manager);
        var design = AddShape(project, "UX/UI 설계", 210, 300, 120, 58, ShapeKind.Parallelogram, Palette.Manager);
        var dev = AddShape(project, "개발", 360, 300, 120, 58, ShapeKind.Parallelogram, Palette.Manager);
        var qa = AddShape(project, "품질(QA)", 510, 300, 120, 58, ShapeKind.Parallelogram, Palette.Manager);
        var ops = AddShape(project, "운영/배포", 660, 300, 120, 58, ShapeKind.Parallelogram, Palette.Manager);
        var data = AddShape(project, "데이터", 810, 300, 120, 58, ShapeKind.Parallelogram, Palette.Manager);

        LinkOrg(project, sponsor, pm);
        LinkOrg(project, pm, plan);
        LinkOrg(project, pm, design);
        LinkOrg(project, pm, dev);
        LinkOrg(project, pm, qa);
        LinkOrg(project, pm, ops);
        LinkOrg(project, pm, data);

        return project;
    }

    // ── Flowchart ─────────────────────────────────────────────────────────
    private static DiagramProject BuildFlowchartBasic()
    {
        var project = CreateProject("플로우차트 (기본)");

        var start = AddShape(project, "시작", 390, 30, 120, 52,
            ShapeKind.Ellipse, Palette.Start);
        var input = AddShape(project, "데이터 입력", 370, 120, 160, 56,
            ShapeKind.Parallelogram, Palette.Process);
        var process = AddShape(project, "데이터 처리", 370, 210, 160, 60,
            ShapeKind.Rectangle, Palette.Process);
        var decision = AddShape(project, "유효한가?", 370, 310, 160, 96,
            ShapeKind.Diamond, Palette.Decision);
        var retry = AddShape(project, "오류 수정", 120, 340, 140, 56,
            ShapeKind.Rectangle, Palette.End);
        var output = AddShape(project, "결과 저장", 620, 340, 140, 56,
            ShapeKind.Document, Palette.Exec);
        var end = AddShape(project, "종료", 390, 470, 120, 52,
            ShapeKind.Ellipse, Palette.End);

        LinkFlow(project, start, input);
        LinkFlow(project, input, process);
        LinkFlow(project, process, decision);
        LinkFlow(project, decision, retry, "아니오");
        LinkFlow(project, decision, output, "예");
        LinkFlow(project, retry, input);
        LinkFlow(project, output, end);

        return project;
    }

    // ── Sequential process ────────────────────────────────────────────────
    private static DiagramProject BuildProcessLinear()
    {
        var project = CreateProject("순차 프로세스");

        var steps = new (string Text, uint Color)[]
        {
            ("요청 접수", Palette.Start),
            ("내용 검토", Palette.Process),
            ("승인", Palette.Decision),
            ("작업 실행", Palette.Exec),
            ("검수", Palette.Manager),
            ("완료", Palette.End),
        };

        const float startX = 60f;
        const float y = 200f;
        const float stepW = 130f;
        const float gap = 36f;

        DiagramShape? previous = null;
        for (int i = 0; i < steps.Length; i++)
        {
            var (text, color) = steps[i];
            var kind = i == 0 || i == steps.Length - 1
                ? ShapeKind.RoundedRectangle
                : ShapeKind.Chevron;

            var shape = AddShape(project, text,
                startX + i * (stepW + gap), y, stepW, 64,
                kind, color, bold: i == 0 || i == steps.Length - 1);

            if (previous is not null)
                LinkProcess(project, previous, shape);

            previous = shape;
        }

        return project;
    }

    // ── Network diagram ───────────────────────────────────────────────────
    private static DiagramProject BuildNetworkBasic()
    {
        var project = CreateProject("네트워크 (기본)");

        var internet = AddShape(project, "인터넷", 400, 30, 120, 80,
            ShapeKind.NetworkInternet, Palette.Network, bold: true);
        var firewall = AddShape(project, "방화벽", 390, 150, 140, 72,
            ShapeKind.NetworkFirewall, Palette.End);
        var switchBox = AddShape(project, "코어 스위치", 385, 270, 150, 72,
            ShapeKind.NetworkSwitch, Palette.Server, bold: true);

        var web = AddShape(project, "웹 서버", 120, 400, 130, 80,
            ShapeKind.NetworkServer, Palette.Server);
        var app = AddShape(project, "앱 서버", 310, 400, 130, 80,
            ShapeKind.NetworkServer, Palette.Server);
        var storage = AddShape(project, "스토리지", 500, 400, 130, 80,
            ShapeKind.NetworkStorage, Palette.Manager);
        var db = AddShape(project, "DB 서버", 690, 400, 130, 80,
            ShapeKind.Database, Palette.Decision);

        var pc1 = AddShape(project, "사용자 PC", 60, 540, 110, 72,
            ShapeKind.NetworkPC, Palette.Exec);
        var pc2 = AddShape(project, "관리자 PC", 200, 540, 110, 72,
            ShapeKind.NetworkPC, Palette.Exec);
        var wifi = AddShape(project, "무선 AP", 690, 540, 110, 72,
            ShapeKind.NetworkWifi, Palette.Network);

        LinkNetwork(project, internet, firewall);
        LinkNetwork(project, firewall, switchBox);
        LinkNetwork(project, switchBox, web);
        LinkNetwork(project, switchBox, app);
        LinkNetwork(project, switchBox, storage);
        LinkNetwork(project, switchBox, db);
        LinkNetwork(project, web, storage);
        LinkNetwork(project, app, db);
        LinkNetwork(project, pc1, switchBox);
        LinkNetwork(project, pc2, switchBox);
        LinkNetwork(project, wifi, switchBox);

        return project;
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    private static DiagramProject CreateProject(string title)
        => new() { Title = title };

    private static DiagramShape AddShape(
        DiagramProject project,
        string text,
        float x,
        float y,
        float width,
        float height,
        ShapeKind kind = ShapeKind.Rectangle,
        uint fillArgb = Palette.White,
        bool bold = false,
        float fontSize = 10f)
    {
        var shape = new DiagramShape
        {
            Text = text,
            X = x,
            Y = y,
            Width = width,
            Height = height,
            Kind = kind,
            FillColorArgb = unchecked((int)fillArgb),
            BorderColorArgb = unchecked((int)Palette.Border),
            TextColorArgb = unchecked((int)Palette.Text),
            FontBold = bold,
            FontSize = bold ? Math.Max(fontSize, 11f) : fontSize,
            BorderWidth = 1.8f
        };
        project.Shapes.Add(shape);
        return shape;
    }

    private static void LinkOrg(DiagramProject project, DiagramShape source, DiagramShape target)
        => Link(project, source, target, kind: ConnectorKind.RightAngleCurved);

    private static void LinkFlow(DiagramProject project, DiagramShape source, DiagramShape target, string? label = null)
        => Link(project, source, target, label, ConnectorKind.Orthogonal);

    private static void LinkProcess(DiagramProject project, DiagramShape source, DiagramShape target)
        => Link(project, source, target, kind: ConnectorKind.Straight);

    private static void LinkNetwork(DiagramProject project, DiagramShape source, DiagramShape target)
        => Link(project, source, target, kind: ConnectorKind.Orthogonal);

    private static void Link(
        DiagramProject project,
        DiagramShape source,
        DiagramShape target,
        string? label = null,
        ConnectorKind kind = ConnectorKind.Orthogonal)
    {
        project.Connectors.Add(new DiagramConnector
        {
            SourceShapeId = source.Id,
            TargetShapeId = target.Id,
            Kind = kind,
            HasEndArrow = true,
            EndArrowStyle = ArrowHeadStyle.Open,
            Label = label ?? string.Empty,
            LineColorArgb = unchecked((int)Palette.Connector),
            LineWidth = 2f
        });
    }
}

using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.Templates;

public sealed record DiagramTemplateInfo(string Id, string Name, string Description);

public static class DiagramTemplateLibrary
{
    public static IReadOnlyList<DiagramTemplateInfo> All { get; } =
    [
        new("org-basic", "조직도 (기본 3단)", "대표-관리자-실무자 3단계 조직도"),
        new("org-department", "조직도 (부서형)", "본부-팀-담당 구조의 부서형 조직도"),
        new("org-project", "조직도 (프로젝트팀)", "PM 중심 프로젝트 조직도"),
        new("flowchart-basic", "플로우차트 (기본)", "시작-처리-판단-종료 흐름도"),
        new("process-linear", "순차 프로세스", "단계별 순차 진행 프로세스"),
        new("network-basic", "네트워크 (기본)", "서버-클라이언트-DB 기본 구성도")
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

    private static DiagramProject BuildOrgBasic()
    {
        var project = CreateProject("조직도 (기본 3단)");
        var ceo = AddShape(project, "대표이사", 340, 40, 160, 70, ShapeKind.RoundedRectangle, 0xFFE3F2FD, bold: true);
        var m1 = AddShape(project, "영업팀장", 80, 180, 140, 60, ShapeKind.RoundedRectangle, 0xFFFFF3E0);
        var m2 = AddShape(project, "개발팀장", 340, 180, 140, 60, ShapeKind.RoundedRectangle, 0xFFFFF3E0);
        var m3 = AddShape(project, "인사팀장", 600, 180, 140, 60, ShapeKind.RoundedRectangle, 0xFFFFF3E0);
        var e1 = AddShape(project, "영업 담당", 80, 320, 120, 50, ShapeKind.Rectangle, 0xFFF1F8E9);
        var e2 = AddShape(project, "개발 담당", 340, 320, 120, 50, ShapeKind.Rectangle, 0xFFF1F8E9);
        var e3 = AddShape(project, "인사 담당", 600, 320, 120, 50, ShapeKind.Rectangle, 0xFFF1F8E9);

        Link(project, ceo, m1);
        Link(project, ceo, m2);
        Link(project, ceo, m3);
        Link(project, m1, e1);
        Link(project, m2, e2);
        Link(project, m3, e3);
        return project;
    }

    private static DiagramProject BuildOrgDepartment()
    {
        var project = CreateProject("조직도 (부서형)");
        var hq = AddShape(project, "경영본부", 320, 30, 180, 70, ShapeKind.RoundedRectangle, 0xFFE8EAF6, bold: true);
        var sales = AddShape(project, "영업본부", 60, 150, 200, 90, ShapeKind.RoundedRectangle, 0xFFE3F2FD);
        var dev = AddShape(project, "개발본부", 310, 150, 200, 90, ShapeKind.RoundedRectangle, 0xFFE3F2FD);
        var hr = AddShape(project, "인사본부", 560, 150, 200, 90, ShapeKind.RoundedRectangle, 0xFFE3F2FD);
        var s1 = AddShape(project, "국내영업팀", 40, 300, 110, 50);
        var s2 = AddShape(project, "해외영업팀", 170, 300, 110, 50);
        var d1 = AddShape(project, "프론트팀", 290, 300, 110, 50);
        var d2 = AddShape(project, "백엔드팀", 420, 300, 110, 50);
        var h1 = AddShape(project, "채용팀", 560, 300, 90, 50);
        var h2 = AddShape(project, "교육팀", 670, 300, 90, 50);

        Link(project, hq, sales);
        Link(project, hq, dev);
        Link(project, hq, hr);
        Link(project, sales, s1);
        Link(project, sales, s2);
        Link(project, dev, d1);
        Link(project, dev, d2);
        Link(project, hr, h1);
        Link(project, hr, h2);
        return project;
    }

    private static DiagramProject BuildOrgProject()
    {
        var project = CreateProject("조직도 (프로젝트팀)");
        var sponsor = AddShape(project, "스폰서", 340, 30, 150, 60, ShapeKind.Diamond, 0xFFFFF8E1, bold: true);
        var pm = AddShape(project, "프로젝트 매니저", 325, 140, 180, 70, ShapeKind.RoundedRectangle, 0xFFE3F2FD, bold: true);
        var plan = AddShape(project, "기획", 80, 280, 120, 55, ShapeKind.Parallelogram);
        var design = AddShape(project, "설계", 240, 280, 120, 55, ShapeKind.Parallelogram);
        var dev = AddShape(project, "개발", 400, 280, 120, 55, ShapeKind.Parallelogram);
        var qa = AddShape(project, "품질", 560, 280, 120, 55, ShapeKind.Parallelogram);
        var ops = AddShape(project, "운영", 720, 280, 120, 55, ShapeKind.Parallelogram);

        Link(project, sponsor, pm);
        Link(project, pm, plan);
        Link(project, pm, design);
        Link(project, pm, dev);
        Link(project, pm, qa);
        Link(project, pm, ops);
        return project;
    }

    private static DiagramProject BuildFlowchartBasic()
    {
        var project = CreateProject("플로우차트 (기본)");
        var start = AddShape(project, "시작", 360, 40, 120, 50, ShapeKind.Ellipse, 0xFFE8F5E9);
        var input = AddShape(project, "입력", 350, 130, 140, 55, ShapeKind.Parallelogram);
        var process = AddShape(project, "처리", 350, 230, 140, 60, ShapeKind.Rectangle);
        var decision = AddShape(project, "조건?", 350, 330, 140, 90, ShapeKind.Diamond, 0xFFFFF3E0);
        var ok = AddShape(project, "완료", 560, 350, 120, 50, ShapeKind.Rectangle, 0xFFE3F2FD);
        var end = AddShape(project, "종료", 360, 470, 120, 50, ShapeKind.Ellipse, 0xFFFFEBEE);

        Link(project, start, input);
        Link(project, input, process);
        Link(project, process, decision);
        Link(project, decision, ok, "예");
        Link(project, decision, end, "아니오");
        Link(project, ok, end);
        return project;
    }

    private static DiagramProject BuildProcessLinear()
    {
        var project = CreateProject("순차 프로세스");
        var steps = new[] { "요청 접수", "검토", "승인", "실행", "완료" };
        DiagramShape? previous = null;
        for (int i = 0; i < steps.Length; i++)
        {
            var shape = AddShape(project, steps[i], 80 + i * 150, 180, 130, 60, ShapeKind.RoundedRectangle);
            if (previous is not null)
                Link(project, previous, shape);
            previous = shape;
        }

        return project;
    }

    private static DiagramProject BuildNetworkBasic()
    {
        var project = CreateProject("네트워크 (기본)");
        var client = AddShape(project, "클라이언트", 80, 200, 140, 70, ShapeKind.RoundedRectangle, 0xFFE3F2FD);
        var web = AddShape(project, "웹 서버", 300, 120, 140, 70, ShapeKind.Rectangle);
        var app = AddShape(project, "앱 서버", 300, 280, 140, 70, ShapeKind.Rectangle);
        var db = AddShape(project, "데이터베이스", 560, 200, 150, 80, ShapeKind.Hexagon, 0xFFFFF3E0);

        Link(project, client, web);
        Link(project, client, app);
        Link(project, web, db);
        Link(project, app, db);
        return project;
    }

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
        uint fillArgb = 0xFFFFFFFFu,
        bool bold = false)
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
            BorderColorArgb = unchecked((int)0xFF37474F),
            TextColorArgb = unchecked((int)0xFF212121),
            FontBold = bold,
            FontSize = bold ? 11f : 10f
        };
        project.Shapes.Add(shape);
        return shape;
    }

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
            Label = label ?? string.Empty,
            LineColorArgb = unchecked((int)0xFF455A64),
            LineWidth = 2f
        });
    }
}

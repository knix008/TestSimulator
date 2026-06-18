using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Services;

/// <summary>샘플 .mab 프로젝트를 생성합니다. 모든 카드는 접힘·크기 그립이 동일하게 적용됩니다.</summary>
public static class SampleProjectFactory
{
    public static KanbanProject Create()
    {
        var baseDate = new DateTime(2026, 6, 15, 9, 0, 0);

        var project = new KanbanProject
        {
            Name = "MyAgileBoard 샘플 보드",
            CreatedAt = baseDate,
            BurndownChartColors = new BurndownChartColorSettings
            {
                DailyBarHex = "#228B47",
                IdealLineHex = "#A0A0A0",
                RemainingLineHex = "#DC3C3C"
            },
            WindowX = 80,
            WindowY = 40,
            WindowWidth = 1600,
            WindowHeight = 900,
            WindowMaximized = false
        };

        var todo = CreateColumn("col-v2-todo", "To Do", "#4472C4", "#FFF0F5", 420);
        todo.Cards.AddRange([
            CreateCard("card-v2-001", "사용자 인증 시스템 설계",
                "OAuth2 기반 인증 아키텍처를 설계합니다.", "박지원", Priority.High,
                "2026-07-10", "인증, 설계", "#B4EBFF", 5, CardSizePreset.Large,
                12, 12, 1, baseDate),
            CreateCard("card-v2-002", "API 문서 작성 (Swagger)",
                "REST API Swagger 문서를 작성합니다.", "김철수", Priority.Medium,
                "2026-07-05", "문서화, API", "#FFE68C", 2, CardSizePreset.Medium,
                12, 148, 2, baseDate.AddDays(-1)),
            CreateCard("card-v2-003", "DB 스키마 최적화",
                "인덱스 전략을 재검토합니다.", "", Priority.Medium,
                null, "DB, 성능", "#F0F0F0", 3, CardSizePreset.Custom,
                170, 12, 3, baseDate, customWidth: 180, customHeight: 130),
            CreateCard("card-v2-004", "모바일 UI 프로토타입",
                "스마트폰 레이아웃 시안을 작성합니다.", "이수민", Priority.Low,
                "2026-07-28", "UI, 모바일", "#DCB9FF", 2, CardSizePreset.Small,
                170, 158, 4, baseDate.AddHours(2))
        ]);

        var inProgress = CreateColumn("col-v2-progress", "In Progress", "#ED7D31", "#FFFAEB", 420,
            titleItalic: true, titleFontSize: 10f);
        inProgress.Cards.AddRange([
            CreateCard("card-v2-005", "결제 모듈 통합",
                "PG사 API 연동으로 카드 결제 기능을 구현합니다.", "정민준", Priority.Critical,
                "2026-06-25", "결제, 긴급", "#FFB8B8", 8, CardSizePreset.Custom,
                12, 12, 1, baseDate.AddDays(-5), customWidth: 210, customHeight: 170),
            CreateCard("card-v2-006", "단위 테스트 커버리지 80%",
                "핵심 로직 단위 테스트를 추가합니다.", "최영희", Priority.High,
                "2026-07-15", "테스트", "#B4EBB4", 5, CardSizePreset.Medium,
                12, 200, 2, baseDate.AddDays(-1))
        ]);

        var review = CreateColumn("col-v2-review", "Review", "#9E49D3", "#F0FFF0", 420);
        review.Cards.AddRange([
            CreateCard("card-v2-007", "로그인 페이지 리디자인",
                "UX 피드백을 반영해 로그인 화면을 개선합니다.", "이수민", Priority.Medium,
                "2026-06-20", "UI, UX", "#DCB9FF", 3, CardSizePreset.Large,
                12, 12, 1, baseDate.AddDays(-7)),
            CreateCard("card-v2-008", "검색 성능 개선",
                "Elasticsearch로 전문 검색 성능을 향상시킵니다.", "박지원", Priority.High,
                "2026-07-01", "검색", "#FFC89B", 5, CardSizePreset.Medium,
                12, 148, 2, baseDate.AddDays(-3))
        ]);

        var done = CreateColumn("col-v2-done", "Done", "#70AD47", "#FFE4E1", 420,
            isCompletion: true);
        done.Cards.AddRange([
            CreateCard("card-v2-009", "CI/CD 파이프라인 구축",
                "GitHub Actions 빌드·배포 환경을 구성했습니다.", "김철수", Priority.High,
                "2026-06-10", "DevOps", "#A3E5A3", 5, CardSizePreset.Medium,
                12, 12, 1, baseDate.AddDays(-14),
                completedAt: new DateTime(2026, 6, 9, 17, 30, 0),
                titleStrikeout: true),
            CreateCard("card-v2-010", "프로젝트 초기 설정",
                "프레임워크·디렉터리 구조·개발 환경 세팅 완료.", "정민준", Priority.Medium,
                "2026-06-05", "초기설정", "#C8C8C8", 1, CardSizePreset.Custom,
                12, 118, 2, baseDate.AddDays(-16),
                customWidth: 190, customHeight: 120,
                completedAt: new DateTime(2026, 6, 5, 16, 0, 0),
                titleStrikeout: true)
        ]);

        project.Columns.AddRange([todo, inProgress, review, done]);

        project.ArchivedCards.Add(new ArchivedCard
        {
            Card = CreateCard("card-v2-archived", "코드 리뷰 가이드라인 정리",
                "코드 리뷰 체크리스트와 PR 템플릿을 문서화했습니다.", "최영희", Priority.Low,
                "2026-06-08", "문서", "#E0E0E0", 1, CardSizePreset.Small,
                8, 8, 1, baseDate.AddDays(-14),
                completedAt: new DateTime(2026, 6, 7, 14, 0, 0)),
            SourceColumnName = "Done",
            ArchivedAt = new DateTime(2026, 6, 12, 10, 30, 0)
        });

        EnsureAllCardsShowFold(project);
        return project;
    }

    /// <summary>저장·로드 후에도 모든 카드에 접힘이 켜져 있도록 보장합니다.</summary>
    public static void EnsureAllCardsShowFold(KanbanProject project)
    {
        foreach (var card in project.Columns.SelectMany(c => c.Cards))
            card.ShowTopRightFold = true;

        foreach (var archived in project.ArchivedCards)
            archived.Card.ShowTopRightFold = true;
    }

    private static KanbanColumn CreateColumn(
        string id, string name, string headerHex, string canvasHex, int width,
        bool isCompletion = false, bool titleItalic = false, float titleFontSize = 9.5f)
    {
        return new KanbanColumn
        {
            Id = id,
            Name = name,
            HeaderColorHex = headerHex,
            CanvasColorHex = canvasHex,
            IsCompletionColumn = isCompletion,
            ColumnWidth = width,
            TitleFontFamily = "Segoe UI",
            TitleFontSize = titleFontSize,
            TitleFontBold = true,
            TitleFontItalic = titleItalic,
            TitleColorHex = "#FFFFFF"
        };
    }

    private static KanbanCard CreateCard(
        string id, string title, string description, string assignee, Priority priority,
        string? dueDate, string tags, string colorHex, int points, CardSizePreset sizePreset,
        int canvasX, int canvasY, int zIndex, DateTime createdAt,
        int customWidth = 0, int customHeight = 0,
        DateTime? completedAt = null, bool titleStrikeout = false)
    {
        return new KanbanCard
        {
            Id = id,
            Title = title,
            Description = description,
            Assignee = assignee,
            Priority = priority,
            DueDate = string.IsNullOrEmpty(dueDate) ? null : DateTime.Parse(dueDate),
            Tags = tags,
            CardColorHex = colorHex,
            Points = points,
            TitleStyle = new CardTextStyle
            {
                FontFamily = "Segoe UI",
                FontSize = 9f,
                ColorHex = "#1A1A1A",
                Bold = true,
                Strikeout = titleStrikeout
            },
            SizePreset = sizePreset,
            CustomWidth = customWidth,
            CustomHeight = customHeight,
            CanvasX = canvasX,
            CanvasY = canvasY,
            Rotation = 0f,
            ZIndex = zIndex,
            ShowTopRightFold = true,
            CreatedAt = createdAt,
            CompletedAt = completedAt
        };
    }
}

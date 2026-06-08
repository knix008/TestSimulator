namespace CodeAnalyzer.Services;

/// <summary>대형 솔루션에서 OOM·스택 오버플로우·UI 프리징 방지 상한.</summary>
public static class AnalysisScaleLimits
{
    public const int MaxRootMethodComboItems = 2_000;
    public const int MaxComboDropDownMeasureItems = 300;

    public const int MaxCallGraphVisualNodes = 8_000;
    public const int MaxCallGraphVisualDepth = 64;

    /// <summary>다이어그램 뷰 기본 표시 시 서브그래프·흐름 탐색 깊이 (전체 펼치기).</summary>
    public const int DefaultViewTraversalDepth = int.MaxValue;

    public const int MaxSequenceDiagramMessages = 180;

    /// <summary>시퀀스 다이어그램 가로 배치 참가자(객체) 최대 수. 초과 시 GDI 비트맵·메모리 한계로 그리기가 실패할 수 있습니다.</summary>
    public const int MaxSequenceDiagramParticipants = 36;

    /// <summary>줌 캐시 비트맵 한 변 최대 픽셀(초과 시 캐시 없이 뷰포트만 그림).</summary>
    public const int MaxSequenceDiagramCacheDimension = 12_000;

    public const int MaxNodesForCircularCallDetection = 25_000;

    public const int MaxCodeMetricsUiFunctions = 5_000;
    public const int MaxCodeMetricsUiFiles = 3_000;
    public const int MaxArchitectureUiInsights = 5_000;
    public const int MaxArchitectureUiItemsPerCategory = 500;

    public const int MaxDuplicateCodeGroups = 2_000;
    public const int MaxDuplicateWindowMapEntries = 200_000;
    public const int MaxSourceFilesForDuplicateDetection = 2_500;

    /// <summary>이 수 이상이면 Fan-in/out 복제 없이 경량 메트릭 집계.</summary>
    public const int MaxFunctionsForFullEnrichment = 80_000;
}

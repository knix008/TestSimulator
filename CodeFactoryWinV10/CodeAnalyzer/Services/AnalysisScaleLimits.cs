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

    public const int MaxSequenceDiagramMessages = 120;

    /// <summary>시퀀스 다이어그램 DFS 최대 깊이(재귀·스택 오버플로 방지).</summary>
    public const int MaxSequenceDiagramDepth = 32;

    /// <summary>한 함수에서 시퀀스로 펼칠 최대 callees 수.</summary>
    public const int MaxSequenceDiagramBranchFanOut = 40;

    /// <summary>시퀀스 다이어그램 가로 배치 참가자(객체) 최대 수. 초과 시 GDI 비트맵·메모리 한계로 그리기가 실패할 수 있습니다.</summary>
    public const int MaxSequenceDiagramParticipants = 24;

    /// <summary>줌 캐시 비트맵 한 변 최대 픽셀(초과 시 캐시 없이 뷰포트만 그림).</summary>
    public const int MaxSequenceDiagramCacheDimension = 8_192;

    /// <summary>콜 그래프·시퀀스 진입점 탭을 한 페이지에 표시할 최대 개수(초과 시 페이지 선택).</summary>
    public const int MaxEntryPointTabsPerPage = 10;

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

    /// <summary>정규식·SQL 리터럴 스캔 대상 최대 파일 크기(바이트). 초과 시 해당 파일은 건너뜁니다.</summary>
    public const long MaxSourceFileBytesForHeavyRegexScan = 512 * 1024;

    /// <summary>Tree-sitter 파싱 대상 최대 파일 크기(바이트). 초과 시 건너뜁니다.</summary>
    public const long MaxSourceFileBytesForTreeSitter = 2 * 1024 * 1024;

    /// <summary>ESLint/pylint 등 외부 Lint에 넘길 최대 파일 수.</summary>
    public const int MaxFilesForExternalLint = 120;

    /// <summary>외부 Lint 전체 최대 실행 시간(밀리초).</summary>
    public const int MaxExternalLintWallClockMs = 120_000;

    /// <summary>무거운 정규식 단일 매칭 최대 시간(밀리초).</summary>
    public const int RegexMatchTimeoutMs = 2_000;

    /// <summary>함수 본문 DB 접근 스캔 최대 문자 수. 초과분은 잘라냅니다.</summary>
    public const int MaxDbAccessFunctionBodyChars = 64 * 1024;

    /// <summary>DB 컬럼(SQL 리터럴) 분석 대상 최대 파일 수.</summary>
    public const int MaxFilesForDbColumnAccessScan = 400;
}

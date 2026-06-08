using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Reports;

/// <summary>보고서용 지표 의미·권장 조치 문구.</summary>
internal static class AnalysisReportRemediationTexts
{
    public static string FormatStatus(WarningLevel level) => level switch
    {
        WarningLevel.Critical => "심각",
        WarningLevel.Warning => "경고",
        _ => "정상"
    };

    public static double? RiskScoreFromWarning(WarningLevel level) => level switch
    {
        WarningLevel.Critical => 92,
        WarningLevel.Warning => 62,
        _ => null
    };

    public static (string Meaning, string Action) ForQualityMetric(
        string metricKey,
        CodeQualitySummary summary,
        UserAnalysisSettings thresholds)
    {
        return metricKey switch
        {
            "duplicate" => (
                "동일한 코드 블록이 여러 위치에 반복되어 수정·검증 비용이 증가합니다.",
                summary.DuplicateLineCount > 0
                    ? "중복 그룹 상위 항목부터 공통 함수·모듈로 추출하고, 도메인 규칙은 단일 소스로 통합하세요."
                    : "현재 중복 비율이 낮습니다. 신규 코드 추가 시 DRY 원칙을 유지하세요."),
            "circular" => (
                "함수 호출이 순환하면 스택 오버플로·초기화 순서·테스트 어려움이 생길 수 있습니다.",
                summary.CircularCallChainCount > 0
                    ? "순환 체인을 끊기 위해 인터페이스·이벤트·의존성 역전을 적용하고, 상호 호출을 단방향으로 재설계하세요."
                    : "순환 호출이 없습니다. 모듈 추가 시 의존 방향을 한쪽으로 유지하세요."),
            "cc" => (
                "순환 복잡도(CC)는 분기·루프가 많을수록 테스트·이해 비용이 커집니다.",
                summary.HighCyclomaticCount > 0
                    ? $"CC≥{thresholds.WarnCyclomaticComplexity} 함수 {summary.HighCyclomaticCount}개: 함수 분리·조건 단순화·단위 테스트를 우선 추가하세요."
                    : "CC 기준을 만족합니다."),
            "cognitive" => (
                "인지 복잡도는 중첩된 조건·루프의 읽기 난이도를 반영합니다.",
                summary.HighCognitiveCount > 0
                    ? $"인지≥{thresholds.WarnCognitiveComplexity} 함수 {summary.HighCognitiveCount}개: early return·가드 절·중첩 축소로 가독성을 높이세요."
                    : "인지 복잡도 기준을 만족합니다."),
            "nesting" => (
                "깊은 중첩은 수정 시 부작용·버그 위험을 키웁니다.",
                summary.DeepNestingCount > 0
                    ? $"중첩≥{thresholds.WarnMaxNestingDepth} 함수 {summary.DeepNestingCount}개: 블록을 메서드로 추출하고 조건을 평탄화하세요."
                    : "중첩 깊이 기준을 만족합니다."),
            "fanout" => (
                "Fan-out이 높은 함수는 많은 모듈에 직접 의존하는 허브 역할을 합니다.",
                summary.HighFanOutCount > 0
                    ? $"Fan-out≥{thresholds.WarnFanOut} 함수 {summary.HighFanOutCount}개: 파사드·중간 계층을 두고 직접 호출을 줄이세요."
                    : "Fan-out 기준을 만족합니다."),
            "mi" => (
                "유지보수 지수(MI)가 낮으면 길이·복잡도·결합이 높아 수정이 어렵습니다.",
                summary.LowMaintenanceIndexCount > 0
                    ? $"MI<{thresholds.WarnMaintenanceIndex:F0} 함수 {summary.LowMaintenanceIndexCount}개: 크기·복잡도·의존을 함께 낮추는 리팩터링을 계획하세요."
                    : "MI 기준을 만족합니다."),
            "todo" => (
                "TODO·FIXME는 미완료 작업·기술 부채의 신호입니다.",
                summary.TotalTodoMarkers > 0 || summary.HighTodoDensityFileCount > 0
                    ? "TODO를 이슈 트래커에 등록하고, 해결·삭제하여 코드와 백로그를 동기화하세요."
                    : "TODO 밀도가 낮습니다."),
            "godfile" => (
                "God file은 한 파일에 너무 많은 책임이 몰린 상태입니다.",
                summary.GodFileCount > 0
                    ? $"God file {summary.GodFileCount}개: 논리 단위·레이어별로 파일·네임스페이스를 분리하세요."
                    : "대형 파일 기준을 만족합니다."),
            "comment" => (
                "주석이 부족하면 온보딩·API 이해가 어려워집니다.",
                summary.LowCommentFileCount > 0
                    ? $"주석<{thresholds.WarnMinCommentPercent:F0}% 파일 {summary.LowCommentFileCount}개: 공개 API·복잡 로직에 설명을 보강하세요."
                    : "주석 비율 기준을 만족합니다."),
            "security" => (
                "하드코딩 비밀·동기 대기·SQL 연결 등 의심 패턴이 탐지되었습니다.",
                summary.SecuritySmellFileCount > 0
                    ? $"보안 smell {summary.SecuritySmellFileCount}파일: 비밀은 환경 변수·비밀 저장소로, async는 await, SQL은 파라미터화하세요."
                    : "보안 smell이 없습니다."),
            "git" => (
                "최근 자주 변경된 파일은 결함·회귀 위험이 높은 핫스팟입니다.",
                summary.GitHotspotFileCount > 0
                    ? $"Git 핫스팟 {summary.GitHotspotFileCount}파일: 복잡도와 함께 리팩터링·회귀 테스트를 우선 적용하세요."
                    : "Git 핫스팟 기준을 만족합니다."),
            "unused" => (
                "호출·참조가 없는 코드는 dead code 후보입니다.",
                summary.PossiblyUnusedCount > 0
                    ? $"미사용 가능 {summary.PossiblyUnusedCount}건: 진입점·리플렉션 여부 확인 후 제거하거나 테스트를 연결하세요."
                    : "미사용 가능 코드가 없습니다."),
            "catch" => (
                "빈 catch·광범위 catch는 예외를 숨겨 장애 분석을 어렵게 합니다.",
                summary.EmptyCatchFunctionCount + summary.BroadCatchFunctionCount > 0
                    ? "구체 예외 타입으로 좁히고, 로깅·재throw·복구 전략을 명시하세요."
                    : "catch 품질 기준을 만족합니다."),
            "asyncvoid" => (
                "async void는 예외가 호출자에게 전파되지 않아 테스트·안정성이 떨어집니다.",
                summary.AsyncVoidCount > 0
                    ? $"async void {summary.AsyncVoidCount}건: Task·Task<T> 반환으로 변경하세요(UI 이벤트 핸들러 제외)."
                    : "async void가 없습니다."),
            "test" => (
                "테스트 코드 비율이 낮으면 회귀·리팩터링 안전망이 부족합니다.",
                summary.TestCodeLinePercent < thresholds.WarnMinTestCodePercent
                    ? $"테스트 LOC {summary.TestCodeLinePercent:F1}% (<{thresholds.WarnMinTestCodePercent:F0}%): 핵심 경로·핫스팟부터 단위·통합 테스트를 보강하세요."
                    : "테스트 비율 기준을 만족합니다."),
            "instability" => (
                "패키지 불안정성(I)이 높으면 변경이 외부로 쉽게 파급됩니다.",
                summary.HighInstabilityPackageCount > 0
                    ? $"불안정 패키지 {summary.HighInstabilityPackageCount}개: 인터페이스·의존성 역전으로 Ce를 줄이세요."
                    : "패키지 불안정성 기준을 만족합니다."),
            "layer" => (
                "계층 위반은 상위 레이어가 하위 인프라에 직접 의존하는 설계 문제입니다.",
                summary.LayerViolationCount > 0
                    ? $"계층 위반 {summary.LayerViolationCount}건: domain/core가 infra/ui를 참조하지 않도록 의존 방향을 정리하세요."
                    : "계층 위반이 없습니다."),
            "lcom" => (
                "LCOM이 높으면 타입 내 메서드·필드가 느슨하게 묶여 SRP를 위반합니다.",
                summary.LowCohesionTypeCount > 0
                    ? $"응집도 부족 타입 {summary.LowCohesionTypeCount}개: 책임별로 클래스를 분리하세요."
                    : "타입 응집도 기준을 만족합니다."),
            "dit" => (
                "상속 깊이(DIT)가 깊으면 이해·변경 비용이 커집니다.",
                summary.DeepInheritanceTypeCount > 0
                    ? $"깊은 상속 타입 {summary.DeepInheritanceTypeCount}개: 합성·인터페이스로 대체를 검토하세요."
                    : "상속 깊이 기준을 만족합니다."),
            _ => ("분석 지표", "해당 항목을 검토하세요.")
        };
    }

    public static string ForInsight(ArchitectureInsight insight)
    {
        return insight.Kind switch
        {
            ArchitectureInsightKind.CircularCall =>
                "순환을 끊기 위해 공통 인터페이스 추출, 이벤트 기반 통신, 의존성 주입으로 단방향 의존을 만드세요.",
            ArchitectureInsightKind.FileCoupling when insight.Category == "파일 허브" =>
                "다수 파일을 호출하는 허브 파일은 변경 영향이 큽니다. 공통 로직을 별도 모듈로 분리하고, 호출자는 좁은 API만 사용하게 하세요.",
            ArchitectureInsightKind.FileCoupling =>
                "고결합 파일 쌍은 공통 모듈 추출·인터페이스 분리·순환 import 제거로 결합을 낮추세요.",
            ArchitectureInsightKind.DirectoryCoupling =>
                "폴더 간 양방향 의존을 제거하고, 상위 모듈이 하위 구현에 직접 의존하지 않게 레이어를 정리하세요.",
            ArchitectureInsightKind.FanOutHub =>
                "허브 함수의 책임을 역할별 하위 서비스로 분리하고, 호출자는 파사드만 사용하게 하세요.",
            ArchitectureInsightKind.FanInHub =>
                "핵심 API이므로 변경 시 회귀 테스트를 강화하고, 인터페이스 안정성을 유지하세요.",
            ArchitectureInsightKind.IsolatedFunction =>
                "진입점·콜백·동적 호출 여부를 확인하고, 미사용이면 제거·테스트 연결을 검토하세요.",
            ArchitectureInsightKind.DuplicateCode or ArchitectureInsightKind.FileDuplicate =>
                "중복 블록을 공통 라이브러리·헬퍼로 추출하고, 한 곳만 수정하면 전체에 반영되게 하세요.",
            ArchitectureInsightKind.GodFile =>
                "파일을 기능·레이어·도메인 단위로 분할하고, public API 표면을 줄이세요.",
            ArchitectureInsightKind.LowComment =>
                "모듈 README·XML/주석으로 의도·사용법·제약을 문서화하세요.",
            ArchitectureInsightKind.PossiblyUnusedCode =>
                "리플렉션·DI·테스트에서의 사용을 확인한 뒤 dead code를 제거하세요.",
            ArchitectureInsightKind.CatchQuality =>
                "빈 catch 제거, 구체 예외 처리, 구조화 로깅을 적용하세요.",
            ArchitectureInsightKind.AsyncVoid =>
                "Task 반환 비동기 메서드로 변경하고, 호출부에서 await 하세요.",
            ArchitectureInsightKind.TestCoverage =>
                "핵심 비즈니스·핫스팟 파일부터 단위·통합 테스트를 추가하세요.",
            ArchitectureInsightKind.PackageInstability =>
                "불안정 패키지는 추상 인터페이스를 도입해 구현 세부에 대한 의존(Ce)을 줄이세요.",
            ArchitectureInsightKind.LayerViolation =>
                "의존 방향을 domain → application → infrastructure 순으로 재배치하고, 역참조는 인터페이스로 뒤집으세요.",
            ArchitectureInsightKind.TypeCohesion =>
                "필드를 공유하지 않는 메서드는 별도 타입으로 분리하세요.",
            ArchitectureInsightKind.InheritanceMetrics =>
                "깊은 상속은 합성으로, 자식이 많은 기반 클래스는 인터페이스·조합으로 대체하세요.",
            ArchitectureInsightKind.GitHotspot =>
                "변경이 잦은 파일은 리팩터링·테스트·코드 리뷰를 집중하세요.",
            ArchitectureInsightKind.SecuritySmell =>
                "비밀 하드코딩 제거, async 동기 대기 제거, SQL 파라미터화·ORM 사용을 검토하세요.",
            ArchitectureInsightKind.GlobalVariable =>
                "전역 상태를 줄이고, DI·스코프 제한 객체로 대체하세요.",
            ArchitectureInsightKind.DatabaseSchema =>
                "스키마 변경 시 마이그레이션·ERD 문서를 최신 상태로 유지하세요.",
            ArchitectureInsightKind.TypeStructure =>
                "타입·상속·의존 관계를 다이어그램으로 공유하고 과도한 결합을 줄이세요.",
            ArchitectureInsightKind.Summary =>
                "상단 요약 수치를 기준으로 우선 조치 로드맵을 수립하세요.",
            _ => "설명을 참고하여 해당 영역의 구조·품질을 개선하세요."
        };
    }

    public static (string Meaning, string Action) ForPackage(PackageMetric package, UserAnalysisSettings thresholds)
    {
        if (package.Instability >= thresholds.WarnInstability)
        {
            return (
                $"불안정성 I={package.Instability:F2} (Ce={package.EfferentCoupling}, Ca={package.AfferentCoupling}). 변경이 외부로 파급되기 쉽습니다.",
                "다른 패키지에 대한 직접 의존(Ce)을 줄이고, 인터페이스·어댑터로 결합을 완화하세요.");
        }

        if (package.DistanceFromMainSequence > 0.5)
        {
            return (
                $"Main Sequence 거리 D={package.DistanceFromMainSequence:F2}, 추상도 A={package.Abstractness:F2}. 균형에서 벗어났습니다.",
                "너무 구체적이면서 불안정하면 추상화를, 너무 추상만 많으면 구현을 보강하세요.");
        }

        return (
            $"Ca={package.AfferentCoupling}, Ce={package.EfferentCoupling}, I={package.Instability:F2}.",
            "현재 패키지 균형이 양호합니다. 신규 의존 추가 시 Ca/Ce 균형을 유지하세요.");
    }
}

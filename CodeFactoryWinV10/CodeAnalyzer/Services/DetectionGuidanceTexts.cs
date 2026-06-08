using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>검출 항목별 설명(의미)과 대처 방안.</summary>
public readonly record struct DetectionGuidance(string Meaning, string Action);

public static class DetectionGuidanceTexts
{
    public static DetectionGuidance ForMetricInspection(MetricInspectionKind kind) => kind switch
    {
        MetricInspectionKind.CyclomaticComplexity => new(
            "순환 복잡도(CC)는 분기·루프·논리 연산 경로가 많을수록 테스트·이해·변경 비용이 커집니다.",
            "함수를 역할별로 분리하고, 조건을 단순화하며, 경계값·분기별 단위 테스트를 추가하세요."),
        MetricInspectionKind.CognitiveComplexity => new(
            "인지 복잡도는 중첩된 조건·루프로 인한 코드 읽기 난이도를 반영합니다.",
            "early return·가드 절·중첩 축소로 가독성을 높이고 복잡 블록을 메서드로 추출하세요."),
        MetricInspectionKind.NestingDepth => new(
            "깊은 중첩은 수정 시 부작용·버그 위험을 키우고 흐름 파악을 어렵게 합니다.",
            "블록을 별도 메서드로 추출하고 조건을 평탄화(flatten)하세요."),
        MetricInspectionKind.ParameterCount => new(
            "매개변수가 많으면 호출부 이해·테스트 조합 비용이 증가합니다.",
            "관련 인자를 옵션 객체·컨텍스트 DTO로 묶거나 함수 책임을 나누세요."),
        MetricInspectionKind.ReturnCount => new(
            "return 지점이 많으면 제어 흐름 추적과 단일 책임 유지가 어렵습니다.",
            "조기 return을 정리하고 분기 통합·헬퍼 추출로 출구를 줄이세요."),
        MetricInspectionKind.MagicNumbers => new(
            "매직 넘버는 의도를 숨겨 유지보수·버그 위험을 높입니다.",
            "named constant·enum·설정 값으로 치환해 의미를 드러내세요."),
        MetricInspectionKind.FanOut => new(
            "Fan-out이 높은 함수는 많은 모듈에 직접 의존하는 허브 역할을 합니다.",
            "파사드·중간 계층을 두고 직접 호출을 줄이며 역할별 하위 서비스로 분리하세요."),
        MetricInspectionKind.MaintenanceIndex => new(
            "유지보수 지수(MI)가 낮으면 길이·복잡도·결합이 높아 수정이 어렵습니다.",
            "함수 크기·복잡도·의존을 함께 낮추는 리팩터링 계획을 수립하세요."),
        MetricInspectionKind.StatementCount => new(
            "한 함수에 문장이 많으면 단일 책임 원칙(SRP) 위반 가능성이 큽니다.",
            "논리 단위별로 private 메서드·클래스로 분리하세요."),
        MetricInspectionKind.SwitchCaseCount => new(
            "switch/case 분기가 많으면 변경 시 누락·중복 수정 위험이 커집니다.",
            "전략 패턴·다형성·룩업 테이블로 분기를 데이터·타입으로 대체하세요."),
        MetricInspectionKind.CatchQuality => new(
            "빈 catch·광범위 catch는 예외를 숨겨 장애 분석·복구를 어렵게 합니다.",
            "구체 예외 타입으로 좁히고, 로깅·재throw·복구 전략을 명시하세요."),
        MetricInspectionKind.AsyncVoid => new(
            "async void는 예외가 호출자에게 전파되지 않아 테스트·안정성이 떨어집니다.",
            "Task·Task<T> 반환 비동기 메서드로 변경하고 호출부에서 await 하세요."),
        MetricInspectionKind.PossiblyUnusedCode => new(
            "호출·참조가 없는 코드는 dead code 후보이며 유지 비용만 발생시킵니다.",
            "리플렉션·DI·테스트 진입점 사용 여부를 확인한 뒤 제거하거나 연결하세요."),
        MetricInspectionKind.TodoDensity => new(
            "TODO·FIXME는 미완료 작업·기술 부채의 신호입니다.",
            "이슈 트래커에 등록하고 해결·삭제하여 코드와 백로그를 동기화하세요."),
        MetricInspectionKind.GodFile => new(
            "God file은 한 파일에 너무 많은 책임이 몰린 상태입니다.",
            "논리 단위·레이어·도메인별로 파일·네임스페이스를 분리하세요."),
        MetricInspectionKind.LowCommentRatio => new(
            "주석이 부족하면 온보딩·API 이해·변경 영향 파악이 어렵습니다.",
            "공개 API·복잡 로직·비즈니스 규칙에 의도와 제약을 문서화하세요."),
        MetricInspectionKind.FileDuplicateLines => new(
            "동일 코드가 여러 위치에 반복되면 수정·검증 비용이 증가합니다.",
            "공통 함수·모듈로 추출해 단일 소스(Single Source of Truth)를 만드세요."),
        MetricInspectionKind.GodType => new(
            "God type은 멤버·연산이 과다해 SRP를 위반한 대형 타입입니다.",
            "책임별로 타입을 분리하고 조합·상속 대신 위임을 검토하세요."),
        MetricInspectionKind.PublicApiDensity => new(
            "public API가 많으면 표면적이 넓어져 변경·호환성 부담이 커집니다.",
            "internal·private로 노출 범위를 줄이고 의도적 공개 API만 유지하세요."),
        MetricInspectionKind.SecuritySmells => new(
            "하드코딩 비밀·동기 대기·SQL 연결·eval 등 보안 위험 의심 패턴이 탐지되었습니다.",
            "비밀은 환경 변수·비밀 저장소로, async는 await, SQL은 파라미터화·ORM을 사용하세요."),
        MetricInspectionKind.GitHotspot => new(
            "최근 자주 변경된 파일은 결함·회귀 위험이 높은 핫스팟입니다.",
            "복잡도와 함께 리팩터링·회귀 테스트·코드 리뷰를 집중하세요."),
        MetricInspectionKind.CircularCalls => new(
            "함수 호출이 순환하면 스택·초기화 순서·테스트 어려움이 생길 수 있습니다.",
            "인터페이스·이벤트·의존성 역전으로 단방향 의존을 만드세요."),
        MetricInspectionKind.FileCoupling => new(
            "파일 간 결합이 높으면 한쪽 변경이 다른 파일에 연쇄 영향을 줍니다.",
            "공통 모듈 추출·인터페이스 분리·순환 import 제거로 결합을 낮추세요."),
        MetricInspectionKind.DirectoryCoupling => new(
            "디렉터리(모듈) 간 양방향 의존은 레이어 구조를 무너뜨립니다.",
            "의존 방향을 한쪽으로 정리하고 상위가 하위 구현에 직접 의존하지 않게 하세요."),
        MetricInspectionKind.FanOutHub => new(
            "Fan-out 허브 함수는 변경 시 파급 범위가 넓습니다.",
            "책임을 역할별 하위 서비스로 분리하고 호출자는 파사드만 사용하게 하세요."),
        MetricInspectionKind.FanInHub => new(
            "Fan-in 허브는 많은 코드가 의존하는 핵심 API입니다.",
            "인터페이스 안정성을 유지하고 변경 시 회귀 테스트를 강화하세요."),
        MetricInspectionKind.IsolatedFunctions => new(
            "호출 그래프에서 고립된 함수는 진입점 누락·dead code·동적 호출 가능성이 있습니다.",
            "진입점·콜백·리플렉션 사용을 확인하고 미사용이면 제거·테스트를 연결하세요."),
        MetricInspectionKind.DuplicateCodeGroups => new(
            "중복 코드 그룹은 동일 로직이 여러 곳에 존재함을 의미합니다.",
            "공통 라이브러리·헬퍼로 추출해 한 곳만 수정하면 전체에 반영되게 하세요."),
        MetricInspectionKind.PackageInstability => new(
            "패키지 불안정성(I)이 높으면 변경이 외부로 쉽게 파급됩니다.",
            "인터페이스·어댑터로 Ce(바깥 의존)를 줄이세요."),
        MetricInspectionKind.LayerViolation => new(
            "계층 위반은 상위 레이어가 하위 인프라에 직접 의존하는 설계 문제입니다.",
            "domain → application → infrastructure 순으로 의존 방향을 재배치하세요."),
        MetricInspectionKind.TypeCohesion => new(
            "LCOM이 높으면 타입 내 메서드·필드가 느슨하게 묶여 SRP를 위반합니다.",
            "필드를 공유하지 않는 메서드는 별도 타입으로 분리하세요."),
        MetricInspectionKind.InheritanceDepth => new(
            "상속 깊이(DIT)·자식 수(NOC)가 크면 이해·변경 비용이 커집니다.",
            "깊은 상속은 합성으로, 자식이 많은 기반 클래스는 인터페이스·조합으로 대체하세요."),
        MetricInspectionKind.TestCodeRatio => new(
            "테스트 코드 비율이 낮으면 회귀·리팩터링 안전망이 부족합니다.",
            "핵심 경로·핫스팟부터 단위·통합 테스트를 보강하세요."),
        MetricInspectionKind.GlobalVariables => new(
            "전역·모듈 범위 상태는 부작용·테스트 어려움·동시성 위험을 키웁니다.",
            "DI·스코프 제한 객체·불변 값으로 전역 상태를 줄이세요."),
        MetricInspectionKind.DatabaseSchema => new(
            "DB 스키마·접근 분석은 데이터 무결성·보안·운영 영향과 직결됩니다.",
            "스키마 변경 시 마이그레이션·ERD 문서를 최신 상태로 유지하세요."),
        MetricInspectionKind.TypeStructure => new(
            "타입·상속·의존 구조가 복잡하면 온보딩·변경 비용이 증가합니다.",
            "다이어그램으로 구조를 공유하고 과도한 결합을 줄이세요."),
        MetricInspectionKind.HalsteadMetrics => new(
            "Halstead·WMC·RFC는 코드 어휘·복잡도·응답 범위를 정량화합니다.",
            "지표가 높은 타입·함수부터 분리·단순화 리팩터링을 검토하세요."),
        _ => new(
            "분석 지표가 품질·유지보수·위험과 관련된 신호를 나타냅니다.",
            "해당 항목의 수치·맥락을 검토하고 개선 계획을 수립하세요.")
    };

    public static DetectionGuidance ForSecurityRule(string ruleId) =>
        ruleId.ToLowerInvariant() switch
        {
            "hardcoded-secret" => new(
                "소스 코드에 비밀번호·API 키·토큰 등이 하드코딩되면 유출 시 전체 시스템이 위험해집니다.",
                "환경 변수·비밀 저장소(Azure Key Vault, AWS Secrets Manager 등)·구성 관리를 사용하세요."),
            "sql-concat" or "jdbc-concat" or "go-sql-fmt" => new(
                "SQL 문자열 연결은 SQL 인젝션 취약점의 대표적인 원인입니다.",
                "파라미터화 쿼리·PreparedStatement·ORM·Query Builder를 사용하세요."),
            "sync-over-async" => new(
                "async 코드에서 .Result/.Wait() 동기 대기는 데드락·스레드 고갈을 유발할 수 있습니다.",
                "async 메서드는 await를 사용하고 동기 블로킹을 제거하세요."),
            "weak-crypto" => new(
                "MD5·SHA1·DES 등 취약 알고리즘은 충돌·해독에 취약합니다.",
                "SHA-256 이상·AES-GCM 등 현대 알고리즘과 안전한 키 관리를 사용하세요."),
            "cert-validation-off" or "insecure-hostname" => new(
                "TLS 인증서·호스트명 검증 비활성화는 중간자 공격(MITM)에 노출됩니다.",
                "검증을 활성화하고 신뢰할 수 있는 인증서 체인을 구성하세요."),
            "runtime-exec" or "php-shell" or "os-system" or "subprocess-shell" or "go-exec"
                or "cpp-system" or "ruby-eval" => new(
                "외부 명령 실행은 명령 인젝션·권한 상승 위험이 있습니다.",
                "실행을 최소화하고 입력 검증·이스케이프·화이트리스트 방식을 적용하세요."),
            "eval-exec" or "js-eval" or "php-eval" => new(
                "eval/exec는 임의 코드 실행으로 이어져 치명적 보안 취약점이 됩니다.",
                "eval/exec를 제거하고 안전한 파서·API로 대체하세요."),
            "pickle-loads" or "yaml-unsafe-load" => new(
                "신뢰할 수 없는 데이터의 역직렬화는 원격 코드 실행으로 이어질 수 있습니다.",
                "safe_load·제한된 형식(JSON 등)·서명 검증을 사용하세요."),
            "inner-html" or "dangerous-html" or "document-write" => new(
                "사용자 입력을 DOM에 직접 삽입하면 XSS(크로스 사이트 스크립팅)가 발생할 수 있습니다.",
                "textContent·DOMPurify 등으로 살균하고 innerHTML 할당을 피하세요."),
            "rust-unwrap" or "rust-unsafe" => new(
                "unwrap/expect 남용과 unsafe 블록은 패닉·메모리 안전 위반 위험을 키웁니다.",
                "오류를 명시적으로 처리하고 unsafe 범위를 최소화·문서화하세요."),
            "cpp-unsafe-func" => new(
                "strcpy·gets 등 취약 C 함수는 버퍼 오버플로우를 유발합니다.",
                "strncpy·snprintf 등 길이 제한 함수와 안전한 래퍼를 사용하세요."),
            "swift-http" => new(
                "평문 HTTP는 전송 중 데이터가 노출·변조될 수 있습니다.",
                "프로덕션 통신은 HTTPS(TLS)만 허용하세요."),
            "php-mysql" => new(
                "폐기된 mysql_* API는 SQL 인젝션·유지보수 위험이 큽니다.",
                "PDO/MySQLi와 파라미터 바인딩을 사용하세요."),
            _ => new(
                "언어별 보안 규칙에 의해 잠재적 위험 패턴이 탐지되었습니다.",
                "패턴이 정보 유출·인젝션·권한 상승으로 이어질 수 있는지 검토하고 안전한 API로 대체하세요.")
        };

    public static DetectionGuidance ForBugRiskCategory(BugRiskCategory category) => category switch
    {
        BugRiskCategory.ExceptionSwallowing => new(
            "예외를 잡고 처리·로깅·전파하지 않으면 장애가 조용히 숨겨집니다.",
            "구체 예외를 처리하고, 로깅 후 필요 시 rethrow·복구 전략을 적용하세요."),
        BugRiskCategory.UnusedVariable => new(
            "선언 후 사용되지 않는 변수는 dead code·오타·미완성 로직 신호일 수 있습니다.",
            "변수를 사용하거나 제거하고, 의도적 무시 시 `_` 또는 주석으로 명시하세요."),
        BugRiskCategory.DeadCode => new(
            "return/throw 이후 도달 불가 코드는 유지보수 혼란과 잘못된 수정을 유발합니다.",
            "도달 불가 코드를 제거하거나 의도적 분기 구조를 리팩터링하세요."),
        BugRiskCategory.ConstantCondition or BugRiskCategory.AlwaysTrue or BugRiskCategory.AlwaysFalse => new(
            "항상 참/거짓인 조건은 dead code·잘못된 로직·테스트 누락을 나타냅니다.",
            "조건을 수정하거나 불필요 분기를 제거하고 의도를 주석·테스트로 남기세요."),
        BugRiskCategory.CompareToSelf => new(
            "자기 자신과의 비교는 항상 참이거나 의미 없는 로직 오류입니다.",
            "비교 대상을 수정하거나 잘못된 조건을 제거하세요."),
        BugRiskCategory.NullDereference => new(
            "null 검사 없는 역참조는 NullReferenceException·런타임 장애를 유발합니다.",
            "null 검사·null 조건 연산자·가드 절·Nullable 참조 타입을 적용하세요."),
        BugRiskCategory.ResourceLeak => new(
            "IDisposable 리소스를 해제하지 않으면 핸들·메모리 누수가 발생합니다.",
            "using 문·try-finally·Dispose 패턴으로 리소스를 확실히 해제하세요."),
        BugRiskCategory.HighComplexityNesting => new(
            "높은 복잡도와 깊은 중첩이 결합되면 결함 밀도가 급증합니다.",
            "함수 분리·조건 평탄화·단위 테스트를 우선 적용하세요."),
        BugRiskCategory.DeadWrite => new(
            "할당 후 읽히지 않는 변수 쓰기는 로직 오류·미완성 코드 신호입니다.",
            "할당을 제거하거나 올바른 변수에 쓰도록 수정하세요."),
        BugRiskCategory.EmptyBlock => new(
            "빈 else/try 블록은 의도 불명·예외 무시·미구현 로직을 나타냅니다.",
            "구현을 추가하거나 블록을 제거하고 의도를 주석으로 남기세요."),
        BugRiskCategory.DuplicateCondition => new(
            "중복 조건은 논리 오류·복사-붙여넣기 실수 가능성이 있습니다.",
            "조건을 통합·정리하고 테스트로 분기를 검증하세요."),
        BugRiskCategory.AsyncVoidMethod => new(
            "async void는 예외가 호출 스택 밖으로 전파되어 처리·테스트가 어렵습니다.",
            "Task 반환 비동기 메서드로 변경하세요(UI 이벤트 핸들러 제외)."),
        BugRiskCategory.MagicNumberAbuse => new(
            "과도한 매직 넘버는 의도 불명·버그·중복 수정을 유발합니다.",
            "상수·enum·설정으로 의미를 드러내세요."),
        BugRiskCategory.PossiblyUnusedPrivate => new(
            "호출 그래프에 없는 private 함수는 dead code 후보입니다.",
            "리플렉션·동적 호출 여부를 확인 후 제거하거나 테스트·진입점을 연결하세요."),
        BugRiskCategory.LintViolation => new(
            "외부 Lint 도구가 스타일·버그·보안 관련 규칙 위반을 보고했습니다.",
            "Lint 메시지를 확인하고 규칙에 맞게 수정하거나 팀 표준을 정비하세요."),
        _ => new(
            "정적 분석·Lint·메트릭이 잠재적 결함 패턴을 탐지했습니다.",
            "보고된 위치의 코드를 검토하고 수정·테스트를 추가하세요.")
    };

    public static DetectionGuidance ForArchitectureInsight(ArchitectureInsight insight)
    {
        var baseGuidance = insight.Kind switch
        {
            ArchitectureInsightKind.CircularCall => ForMetricInspection(MetricInspectionKind.CircularCalls),
            ArchitectureInsightKind.FileCoupling when insight.Category == "파일 허브" => new(
                "다수 파일을 호출하는 허브 파일은 변경 영향 범위가 매우 넓습니다.",
                "공통 로직을 별도 모듈로 분리하고 호출자는 좁은 API만 사용하게 하세요."),
            ArchitectureInsightKind.FileCoupling => ForMetricInspection(MetricInspectionKind.FileCoupling),
            ArchitectureInsightKind.DirectoryCoupling => ForMetricInspection(MetricInspectionKind.DirectoryCoupling),
            ArchitectureInsightKind.FanOutHub => ForMetricInspection(MetricInspectionKind.FanOutHub),
            ArchitectureInsightKind.FanInHub => ForMetricInspection(MetricInspectionKind.FanInHub),
            ArchitectureInsightKind.IsolatedFunction => ForMetricInspection(MetricInspectionKind.IsolatedFunctions),
            ArchitectureInsightKind.DuplicateCode or ArchitectureInsightKind.FileDuplicate =>
                ForMetricInspection(MetricInspectionKind.DuplicateCodeGroups),
            ArchitectureInsightKind.GodFile => ForMetricInspection(MetricInspectionKind.GodFile),
            ArchitectureInsightKind.LowComment => ForMetricInspection(MetricInspectionKind.LowCommentRatio),
            ArchitectureInsightKind.PossiblyUnusedCode => ForMetricInspection(MetricInspectionKind.PossiblyUnusedCode),
            ArchitectureInsightKind.CatchQuality => ForMetricInspection(MetricInspectionKind.CatchQuality),
            ArchitectureInsightKind.AsyncVoid => ForMetricInspection(MetricInspectionKind.AsyncVoid),
            ArchitectureInsightKind.TestCoverage => ForMetricInspection(MetricInspectionKind.TestCodeRatio),
            ArchitectureInsightKind.PackageInstability => ForMetricInspection(MetricInspectionKind.PackageInstability),
            ArchitectureInsightKind.LayerViolation => ForMetricInspection(MetricInspectionKind.LayerViolation),
            ArchitectureInsightKind.TypeCohesion => ForMetricInspection(MetricInspectionKind.TypeCohesion),
            ArchitectureInsightKind.InheritanceMetrics => ForMetricInspection(MetricInspectionKind.InheritanceDepth),
            ArchitectureInsightKind.GitHotspot => ForMetricInspection(MetricInspectionKind.GitHotspot),
            ArchitectureInsightKind.SecuritySmell => ForMetricInspection(MetricInspectionKind.SecuritySmells),
            ArchitectureInsightKind.GlobalVariable => ForMetricInspection(MetricInspectionKind.GlobalVariables),
            ArchitectureInsightKind.DatabaseSchema => ForMetricInspection(MetricInspectionKind.DatabaseSchema),
            ArchitectureInsightKind.TypeStructure => ForMetricInspection(MetricInspectionKind.TypeStructure),
            ArchitectureInsightKind.Summary => new(
                "프로젝트 전반 품질·구조·위험 요약 지표입니다.",
                "상단 요약 수치를 기준으로 우선 조치 로드맵을 수립하세요."),
            _ => new(
                "아키텍처·품질 분석에서 구조적 이슈가 탐지되었습니다.",
                "내용 열의 측정·위치 정보를 바탕으로 개선하세요.")
        };

        return baseGuidance;
    }

    public static string JoinGuidanceParts(IEnumerable<string> parts, string emptyFallback) =>
        parts.Any() ? string.Join(" ", parts) : emptyFallback;
}

namespace CodeAnalyzer.Services;

/// <summary>좌측 「품질 경고 기준」 패널 툴팁 문구.</summary>
public static class QualityThresholdToolTipTexts
{
    public const string Group =
        "코드 메트릭(함수·파일·타입)과 분석 보고서에 적용되는 경고 임계값입니다. " +
        "값을 바꾼 뒤 분석을 다시 실행하면 결과에 반영됩니다.";

    public const string Cyclomatic =
        "순환 복잡도(Cyclomatic Complexity, CC). if·switch·루프·catch 등 제어 흐름 분기마다 증가합니다. " +
        "이 값 이상인 함수·파일은 복잡도 경고로 표시되며, 테스트·리팩터링 우선 후보가 됩니다.";

    public const string Cognitive =
        "인지 복잡도(Cognitive Complexity). 중첩된 조건·루프를 읽기 어렵게 만드는 구조에 더 큰 가중치를 둡니다. " +
        "CC보다 「실제로 이해하기 어려운 정도」에 가깝습니다. 이 값 이상이면 경고합니다.";

    public const string Nesting =
        "함수 본문 안의 최대 중첩 깊이(if/for/while 안쪽 단계). " +
        "깊을수록 가독성·수정 위험이 커집니다. 이 값 이상이면 경고합니다.";

    public const string FanOut =
        "Fan-Out: 한 함수가 직접 호출하는 다른 함수(대상)의 수입니다. " +
        "과하면 허브·파사드 부재·책임 과다 신호입니다. 이 값 이상이면 경고합니다.";

    public const string MaintenanceIndex =
        "유지보수 지수(Maintenance Index, MI). 함수 길이·CC 등으로 계산하며 0~171, 높을수록 유지보수가 쉽습니다. " +
        "이 값 미만이면 경고합니다(낮을수록 나쁨).";

    public const string TodoDensity =
        "100코드줄당 TODO·FIXME·HACK 등 미완료 표식 개수입니다. " +
        "이 값 이상이면 기술 부채·미완료 작업이 많다고 경고합니다.";

    public const string ParameterCount =
        "함수·메서드의 매개변수 개수입니다. " +
        "과하면 호출이 어렵고 책임이 넓을 수 있습니다. 이 값 이상이면 경고합니다.";

    public const string ReturnCount =
        "함수 본문의 return 문 개수입니다. " +
        "출구가 많으면 제어 흐름 추적이 어렵습니다. 이 값 이상이면 경고합니다.";

    public const string MagicNumbers =
        "매직 넘버: 이름 없는 숫자 리터럴(0·1·-1 등 일부 제외) 개수입니다. " +
        "의미 있는 상수로 바꾸라는 신호입니다. 이 값 이상이면 경고합니다.";

    public const string GodFile =
        "God file: 한 파일의 코드 줄 수(주석·공백 제외)가 이 값 이상이면 파일이 과대하다고 경고합니다. " +
        "역할별로 파일·모듈을 나누는 것을 검토하세요.";

    public const string CommentPercent =
        "100코드줄당 주석 줄 비율(%). 코드가 일정 크기 이상인 파일에서 " +
        "이 값 미만이면 문서화·설명이 부족하다고 경고합니다(낮을수록 나쁨).";

    public const string GodType =
        "God type: 타입의 멤버(필드·속성) 수 + 연산(메서드) 수 합이 이 값 이상이면 " +
        "단일 타입에 책임이 몰렸다고 경고합니다.";

    public const string MinDuplicateLines =
        "중복 코드 검출 시 블록으로 인정할 최소 줄 수입니다(이상, 기본 10줄). " +
        "이 줄 수 이상이 두 곳 이상에서 같으면 중복 그룹·아키텍처 탭에 표시됩니다. 품질 경고와는 별도 설정입니다.";
}

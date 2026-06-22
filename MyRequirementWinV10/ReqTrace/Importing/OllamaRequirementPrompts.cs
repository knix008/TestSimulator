using ReqTrace.Localization;

namespace ReqTrace.Importing;

internal static class OllamaRequirementPrompts
{
    internal static string BuildSystemPrompt()
    {
        if (LocalizationService.IsEnglish)
            return EnglishRoleIntro + BuildRequirementSchemaBlock() + EnglishConversionRules;

        return KoreanRoleIntro + BuildRequirementSchemaBlock() + KoreanConversionRules;
    }

    internal static string BuildRequirementSchemaBlock() =>
        LocalizationService.IsEnglish ? EnglishRequirementSchemaBlock : KoreanRequirementSchemaBlock;

    internal static string BuildAnalysisTaskBlock() =>
        LocalizationService.IsEnglish ? EnglishAnalysisTaskBlock : KoreanAnalysisTaskBlock;

    internal static string BuildCsvFormatNote() =>
        LocalizationService.IsEnglish ? EnglishCsvFormatNote : KoreanCsvFormatNote;

    internal static string BuildRetryPrompt() =>
        LocalizationService.IsEnglish ? EnglishRetryPrompt : KoreanRetryPrompt;

    internal static string BuildSingleRowUserPrompt(
        string fileName,
        string sheetName,
        int rowIndex,
        int rowCount,
        string categoryContext,
        string mappingHint,
        string csvBlock)
    {
        var schemaBlock = BuildRequirementSchemaBlock();
        var categoryBlock = string.IsNullOrWhiteSpace(categoryContext)
            ? string.Empty
            : LocalizationService.IsEnglish
                ? $"\nCategory context: {categoryContext}\n"
                : $"\n카테고리 맥락: {categoryContext}\n";

        var mappingBlock = string.IsNullOrWhiteSpace(mappingHint)
            ? string.Empty
            : mappingHint + Environment.NewLine;

        if (LocalizationService.IsEnglish)
        {
            return $"""
                Source file: {fileName}
                Sheet: {sheetName}
                Row {rowIndex + 1} of {rowCount}

                {schemaBlock}
                {categoryBlock}{mappingBlock}
                Task: Convert only the CSV row below into exactly one requirement object.
                requirements[] must contain exactly one object. Do not split the row into multiple requirements.
                If the description column is empty or only repeats the title, write a detailed description using the other columns and category context.
                The description must state what the user/system should do or what must be true. Do not return title text alone in description.
                Return JSON only.

                {csvBlock}
                """;
        }

        return $"""
            원본 파일: {fileName}
            시트: {sheetName}
            행 {rowIndex + 1} / {rowCount}

            {schemaBlock}
            {categoryBlock}{mappingBlock}
            작업: 아래 CSV 한 행에서 요구사항 1건만 생성하세요.
            requirements[]에는 객체를 정확히 1개만 넣으세요. 행을 여러 요구사항으로 나누지 마세요.
            description 열이 비어 있거나 title과 같으면, 다른 열과 카테고리 맥락을 바탕으로 상세 설명을 작성하세요.
            description에는 사용자/시스템이 수행할 동작이나 충족해야 할 조건을 쓰고, title만 반복하지 마세요.
            JSON만 출력하세요.

            {csvBlock}
            """;
    }

    internal static string BuildUserPrompt(
        string fileName,
        string sheetName,
        int chunkIndex,
        int chunkCount,
        string preamble,
        string chunkText,
        string? carryForwardContext)
    {
        var contextBlock = string.IsNullOrWhiteSpace(carryForwardContext)
            ? string.Empty
            : LocalizationService.IsEnglish
                ? $"\nContext from previous chunk (for hierarchy only, do not duplicate these requirements):\n{carryForwardContext}\n"
                : $"\n이전 청크 맥락(계층/카테고리 참고용, 아래 항목을 중복 추출하지 마세요):\n{carryForwardContext}\n";

        if (LocalizationService.IsEnglish)
        {
            return $"""
                Source file: {fileName}
                Sheet: {sheetName}
                Chunk {chunkIndex + 1} of {chunkCount}
                {contextBlock}
                {BuildRequirementSchemaBlock()}
                {preamble}

                CSV data:
                {chunkText}
                """;
        }

        return $"""
            원본 파일: {fileName}
            시트: {sheetName}
            청크 {chunkIndex + 1} / {chunkCount}
            {contextBlock}
            {BuildRequirementSchemaBlock()}
            {preamble}

            CSV 데이터:
            {chunkText}
            """;
    }

    private const string KoreanRoleIntro = """
        당신은 Excel 데이터를 ReqTrace 요구사항 정리 양식으로 변환하는 전문가입니다.

        """;

    private const string EnglishRoleIntro = """
        You convert Excel data into the ReqTrace requirement schema.

        """;

    private const string KoreanRequirementSchemaBlock = """
        [요구사항 정리 양식]
        반드시 아래 JSON 구조만 출력하세요. 마크다운·코드블록·설명 문장은 금지합니다.

        {"requirements":[{"code":"","title":"","description":"","category":"","priority":"","status":"","parentCode":""}]}

        필드:
        - code: 요구사항 식별 코드. 원문에 없으면 "" (임의 생성 금지)
        - title: 요구사항명 (필수, 짧고 명확하게)
        - description: 상세 설명·조건·수용 기준 (필수에 가깝음, title과 다른 내용)
        - category: 분류/모듈/기능군. 대분류·중분류·소분류 등 계층 경로를 ' / '로 연결 (예: 얼굴인식 / 등록 / 2D 등록). category 열·카테고리 맥락·계층 열을 모두 반영
        - priority: low | medium | high | critical (또는 낮음/보통/높음/긴급)
        - status: draft | approved | inProgress | implemented | deprecated (또는 초안/승인됨/진행 중/구현됨/폐기됨)
        - parentCode: 상위 요구사항 코드 (없으면 "")

        예시 출력:
        {"requirements":[{"code":"","title":"로그인","description":"사용자는 ID와 비밀번호로 로그인할 수 있어야 한다","category":"인증 / 로그인","priority":"medium","status":"draft","parentCode":""}]}

        """;

    private const string EnglishRequirementSchemaBlock = """
        [Requirement schema]
        Return ONLY JSON in this exact shape. No markdown, code fences, or commentary.

        {"requirements":[{"code":"","title":"","description":"","category":"","priority":"","status":"","parentCode":""}]}

        Fields:
        - code: requirement identifier; use "" if the source has none (do not invent)
        - title: requirement name (required, concise)
        - description: details, conditions, acceptance criteria (required in practice; must differ from title)
        - category: module/group path using ' / ' between hierarchy levels (e.g. Authentication / Login / MFA). Use category column, category context, and hierarchy columns together.
        - priority: low | medium | high | critical
        - status: draft | approved | inProgress | implemented | deprecated
        - parentCode: parent requirement code, or ""

        Example:
        {"requirements":[{"code":"","title":"Login","description":"Users must log in with ID and password","category":"Authentication / Login","priority":"medium","status":"draft","parentCode":""}]}

        """;

    private const string KoreanConversionRules = """
        변환 규칙:
        1. CSV 헤더 열 이름에 맞게 필드를 매핑하세요.
        2. Excel 데이터 행 1개당 요구사항 1건만 생성하세요. 번호 목록·bullet·줄바꿈이 있어도 분할하지 말고 description에 통합하세요.
        3. description이 비어 있거나 title과 같으면, 같은 행의 다른 열·카테고리 맥락을 근거로 구체적인 설명을 작성하세요.
        4. category 필드는 단일 단어보다 계층 경로(대분류 / 중분류 / 소분류)를 우선 사용하세요.
        5. 사용자 열 매핑이 제공되면 해당 지정을 우선 적용하세요.
        6. 원문에 없는 요구사항을 만들지 마세요.
        7. 추출할 요구사항이 없으면 {"requirements":[]} 를 반환하세요.

        """;

    private const string EnglishConversionRules = """
        Conversion rules:
        1. Map fields using CSV header column names.
        2. Create exactly one requirement per Excel data row. Do not split lists or line breaks; combine details into description.
        3. When description is empty or identical to title, write a concrete description from the other columns and category context in the same row.
        4. Prefer hierarchical category paths (group / subgroup / item) over a single generic label.
        5. When user column mapping is provided, treat it as authoritative.
        6. Do not invent requirements not supported by the source.
        7. If nothing can be extracted, return {"requirements":[]}.

        """;

    private const string KoreanCsvFormatNote = """
        입력 형식: CSV(쉼표 구분). 첫 줄은 헤더입니다.
        category·대분류·중분류·소분류 등 계층 열은 병합/빈 셀을 아래 행으로 채운 값입니다.
        category 값은 여러 계층을 ' / '로 연결한 경로로 작성하세요.
        #SECTION으로 시작하는 행은 섹션/분류 제목이며 category 맥락으로 사용하세요.
        """;

    private const string EnglishCsvFormatNote = """
        Input format: CSV (comma-separated). The first line is the header row.
        Hierarchy columns (category, 대분류, 중분류, 소분류, etc.) are forward-filled from merged or blank grouped cells.
        Write category as a hierarchical path joined with ' / '.
        Lines starting with #SECTION are section/category headings; use them as category context.
        """;

    private const string KoreanAnalysisTaskBlock = """
        작업: 아래 스프레드시트 데이터를 위 요구사항 정리 양식(JSON)으로 변환하세요.
        데이터 행 1개당 요구사항 1건을 생성하고, 원문의 상세 내용은 description에 보존하세요.
        """;

    private const string EnglishAnalysisTaskBlock = """
        Task: Convert the spreadsheet data below into the requirement schema above.
        Create exactly one requirement per data row and preserve source details in description.
        """;

    private const string KoreanRetryPrompt = """
        이전 응답을 파싱할 수 없었습니다. 설명 없이 JSON만 다시 출력하세요.
        요구사항 정리 양식: {"requirements":[{"code":"","title":"","description":"","category":"","priority":"","status":"","parentCode":""}]}
        """;

    private const string EnglishRetryPrompt = """
        The previous response could not be parsed. Return JSON only, no explanation.
        Requirement schema: {"requirements":[{"code":"","title":"","description":"","category":"","priority":"","status":"","parentCode":""}]}
        """;
}

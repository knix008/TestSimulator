using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal static class DiagramViewDisplayNames
{
    public static string Get(DiagramViewKind kind) => kind switch
    {
        DiagramViewKind.CallGraph => "호출 그래프",
        DiagramViewKind.ClassDiagram => "클래스 다이어그램",
        DiagramViewKind.SequenceDiagram => "시퀀스 다이어그램",
        DiagramViewKind.DataFlow => "데이터 흐름",
        DiagramViewKind.Inheritance => "상속 다이어그램",
        DiagramViewKind.FileRelations => "파일 관계",
        DiagramViewKind.DirectoryRelations => "디렉터리 관계",
        DiagramViewKind.CodeMetrics => "코드 메트릭",
        DiagramViewKind.DuplicateCode => "중복 코드",
        DiagramViewKind.GlobalVariables => "전역 변수",
        DiagramViewKind.DatabaseErd => "DB ERD",
        _ => kind.ToString()
    };
}

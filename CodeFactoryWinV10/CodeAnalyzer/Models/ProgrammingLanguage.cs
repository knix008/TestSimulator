namespace CodeAnalyzer.Models;

/// <summary>
/// 코드 분석 대상 프로그래밍 언어 (UI 현지화/다국어와 무관).
/// </summary>
public sealed class ProgrammingLanguage
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required IReadOnlyList<string> Extensions { get; init; }

    public override string ToString() => DisplayName;
}

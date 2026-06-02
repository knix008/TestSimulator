namespace CodeAnalyzer.Models;

public enum SearchResultKind
{
    Function,
    Type,
    File,
    Directory
}

public sealed class SearchResultItem
{
    public SearchResultKind Kind { get; init; }
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Detail { get; init; }

    public string KindLabel => Kind switch
    {
        SearchResultKind.Type => "타입",
        SearchResultKind.File => "파일",
        SearchResultKind.Directory => "디렉터리",
        _ => "함수"
    };
}

namespace MyGitWinV10.App.Services;

public static class CommitMessageFormatter
{
    public static readonly IReadOnlyList<string> DefaultCategories =
    [
        "기능추가",
        "기능변경",
        "기능삭제",
        "버그수정",
        "문서",
        "리팩토링",
        "성능개선",
        "테스트",
        "기타"
    ];

    public static string Format(string category, string subject, string? body = null)
    {
        if (string.IsNullOrWhiteSpace(category))
        {
            throw new ArgumentException("Commit category is required.", nameof(category));
        }

        if (string.IsNullOrWhiteSpace(subject))
        {
            throw new ArgumentException("Commit message is required.", nameof(subject));
        }

        string subjectLine = $"[{category.Trim()}] {subject.Trim()}";
        if (string.IsNullOrWhiteSpace(body))
        {
            return subjectLine;
        }

        return subjectLine + Environment.NewLine + Environment.NewLine + body.Trim();
    }
}

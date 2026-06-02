using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class LanguageRegistry
{
    public static IReadOnlyList<ProgrammingLanguage> All { get; } =
    [
        new ProgrammingLanguage { Id = "csharp", DisplayName = "C#", Extensions = [".cs"] },
        new ProgrammingLanguage { Id = "vbnet", DisplayName = "VB.NET", Extensions = [".vb"] },
        new ProgrammingLanguage { Id = "python", DisplayName = "Python", Extensions = [".py"] },
        new ProgrammingLanguage { Id = "java", DisplayName = "Java", Extensions = [".java"] },
        new ProgrammingLanguage { Id = "cpp", DisplayName = "C / C++", Extensions = [".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"] },
        new ProgrammingLanguage { Id = "go", DisplayName = "Go", Extensions = [".go"] },
        new ProgrammingLanguage { Id = "rust", DisplayName = "Rust", Extensions = [".rs"] },
        new ProgrammingLanguage { Id = "swift", DisplayName = "Swift", Extensions = [".swift"] },
        new ProgrammingLanguage { Id = "javascript", DisplayName = "JavaScript / TypeScript", Extensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"] },
        new ProgrammingLanguage { Id = "ruby", DisplayName = "Ruby", Extensions = [".rb"] },
        new ProgrammingLanguage { Id = "php", DisplayName = "PHP", Extensions = [".php"] }
    ];

    public static HashSet<string> GetExtensions(IEnumerable<string> languageIds)
    {
        var ids = new HashSet<string>(languageIds, StringComparer.OrdinalIgnoreCase);
        var extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var language in All)
        {
            if (!ids.Contains(language.Id))
            {
                continue;
            }

            foreach (var extension in language.Extensions)
            {
                extensions.Add(extension);
            }
        }

        return extensions;
    }

    public static ProgrammingLanguage? FindByExtension(string extension)
    {
        return All.FirstOrDefault(language =>
            language.Extensions.Contains(extension, StringComparer.OrdinalIgnoreCase));
    }
}

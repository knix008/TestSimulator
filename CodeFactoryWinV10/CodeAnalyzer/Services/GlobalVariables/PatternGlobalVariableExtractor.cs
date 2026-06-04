using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.GlobalVariables;

public sealed class PatternGlobalVariableExtractor
{
    private static readonly Regex CommentRegex = new(
        "//.*$|/\\*.*?\\*/|#.*$",
        RegexOptions.Compiled | RegexOptions.Multiline);

    public IReadOnlyList<GlobalVariableItem> Extract(
        string languageId,
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var items = new List<GlobalVariableItem>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            string content;
            try
            {
                content = File.ReadAllText(file);
            }
            catch (Exception)
            {
                continue;
            }

            content = CommentRegex.Replace(content, match => new string(' ', match.Length));
            ExtractFile(languageId, file, content, items, cancellationToken);
        }

        return items;
    }

    private static void ExtractFile(
        string languageId,
        string filePath,
        string content,
        List<GlobalVariableItem> items,
        CancellationToken cancellationToken)
    {
        var lines = content.Split('\n');
        var depth = 0;
        var currentType = string.Empty;

        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            if (lineIndex % 64 == 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
            }

            var rawLine = lines[lineIndex];
            var line = rawLine.TrimEnd('\r');
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith("#", StringComparison.Ordinal))
            {
                depth += CountChar(trimmed, '{') - CountChar(trimmed, '}');
                continue;
            }

            if (TryCaptureTypeName(languageId, trimmed, out var typeName))
            {
                currentType = typeName;
            }

            if (TryExtract(languageId, trimmed, depth, currentType, out var extracted))
            {
                var lineNumber = lineIndex + 1;
                items.Add(new GlobalVariableItem
                {
                    Id = $"{languageId}:{filePath}:{lineNumber}:{extracted.Name}",
                    Name = extracted.Name,
                    LanguageId = languageId,
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    Scope = extracted.Scope,
                    TypeName = extracted.TypeName,
                    ContainingScope = extracted.ContainingScope,
                    AccessModifier = extracted.AccessModifier,
                    IsConst = extracted.IsConst,
                    IsReadOnly = extracted.IsReadOnly,
                    Declaration = trimmed
                });
            }

            depth += CountChar(trimmed, '{') - CountChar(trimmed, '}');
            if (depth <= 0)
            {
                depth = 0;
                if (!IsTypeDeclarationLine(languageId, trimmed))
                {
                    currentType = string.Empty;
                }
            }
        }
    }

    private static bool TryExtract(
        string languageId,
        string line,
        int depth,
        string currentType,
        out ExtractedVariable extracted)
    {
        extracted = default;

        return languageId switch
        {
            "cpp" => TryExtractCpp(line, depth, out extracted),
            "python" => TryExtractPython(line, depth, out extracted),
            "javascript" => TryExtractJavaScript(line, depth, out extracted),
            "java" => TryExtractJava(line, depth, currentType, out extracted),
            "kotlin" => TryExtractKotlin(line, depth, out extracted),
            "go" => TryExtractGo(line, depth, out extracted),
            "rust" => TryExtractRust(line, depth, out extracted),
            "php" => TryExtractPhp(line, depth, out extracted),
            "ruby" => TryExtractRuby(line, depth, out extracted),
            "swift" => TryExtractSwift(line, depth, currentType, out extracted),
            _ => false
        };
    }

    private static bool TryExtractCpp(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0 || line.Contains('(') || line.Contains("typedef", StringComparison.Ordinal))
        {
            return false;
        }

        if (line.StartsWith("class ", StringComparison.Ordinal)
            || line.StartsWith("struct ", StringComparison.Ordinal)
            || line.StartsWith("enum ", StringComparison.Ordinal)
            || line.StartsWith("namespace ", StringComparison.Ordinal)
            || line.StartsWith("using ", StringComparison.Ordinal)
            || line.StartsWith("#", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(
            line,
            @"^(?:extern\s+)?(?:static\s+)?(?:const\s+|volatile\s+|unsigned\s+|signed\s+)?(?:[\w:<>,\*\s]+?\s+)(\w+)\s*(?:\[\s*\])?\s*(?:=\s*[^;]+)?\s*;\s*$");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.File,
            TypeName = ExtractTypeHint(line),
            IsConst = line.Contains("const", StringComparison.Ordinal),
            IsReadOnly = line.Contains("const", StringComparison.Ordinal)
        };
        return true;
    }

    private static bool TryExtractPython(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0)
        {
            return false;
        }

        if (line.StartsWith("def ", StringComparison.Ordinal)
            || line.StartsWith("class ", StringComparison.Ordinal)
            || line.StartsWith("import ", StringComparison.Ordinal)
            || line.StartsWith("from ", StringComparison.Ordinal)
            || line.StartsWith("@", StringComparison.Ordinal)
            || line.StartsWith("if ", StringComparison.Ordinal)
            || line.StartsWith("elif ", StringComparison.Ordinal)
            || line.StartsWith("else", StringComparison.Ordinal)
            || line.StartsWith("for ", StringComparison.Ordinal)
            || line.StartsWith("while ", StringComparison.Ordinal)
            || line.StartsWith("with ", StringComparison.Ordinal)
            || line.StartsWith("try", StringComparison.Ordinal)
            || line.StartsWith("except", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(line, @"^([A-Za-z_]\w*)\s*(?::([^=]+))?\s*=");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.Module,
            TypeName = match.Groups[2].Success ? match.Groups[2].Value.Trim() : string.Empty
        };
        return true;
    }

    private static bool TryExtractJavaScript(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0)
        {
            return false;
        }

        var match = Regex.Match(line, @"^(?:export\s+)?(?:const|let|var)\s+(\w+)");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.Module,
            IsConst = line.Contains("const ", StringComparison.Ordinal),
            IsReadOnly = line.Contains("const ", StringComparison.Ordinal)
        };
        return true;
    }

    private static bool TryExtractJava(string line, int depth, string currentType, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 1 || !line.Contains("static", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(
            line,
            @"^\s*(?:(public|protected|private)\s+)?static\s+(?:final\s+)?([\w<>,\[\]\s]+)\s+(\w+)\s*(?:=|;)");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[3].Value,
            Scope = GlobalVariableScope.ClassStatic,
            TypeName = match.Groups[2].Value.Trim(),
            ContainingScope = currentType,
            AccessModifier = match.Groups[1].Success ? match.Groups[1].Value : "package",
            IsReadOnly = line.Contains("final", StringComparison.Ordinal),
            IsConst = line.Contains("final", StringComparison.Ordinal)
        };
        return true;
    }

    private static bool TryExtractKotlin(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0)
        {
            return false;
        }

        var match = Regex.Match(
            line,
            @"^(?:(?:public|private|internal)\s+)?(?:const\s+)?(?:val|var)\s+(\w+)");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.Module,
            IsReadOnly = line.Contains("val ", StringComparison.Ordinal) || line.Contains("const ", StringComparison.Ordinal),
            IsConst = line.Contains("const ", StringComparison.Ordinal)
        };
        return true;
    }

    private static bool TryExtractGo(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0 || line.StartsWith("func ", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(line, @"^var\s+(\w+)\s+([\w\*\[\]]+)?");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.Module,
            TypeName = match.Groups[2].Success ? match.Groups[2].Value.Trim() : string.Empty
        };
        return true;
    }

    private static bool TryExtractRust(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0)
        {
            return false;
        }

        var match = Regex.Match(line, @"^(?:pub\s+)?(?:static|const)\s+(?:mut\s+)?(\w+)");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.Module,
            AccessModifier = line.Contains("pub ", StringComparison.Ordinal) ? "pub" : "private",
            IsConst = line.Contains("const ", StringComparison.Ordinal),
            IsReadOnly = line.Contains("const ", StringComparison.Ordinal) || !line.Contains("mut ", StringComparison.Ordinal)
        };
        return true;
    }

    private static bool TryExtractPhp(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0 || line.StartsWith("function", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(line, @"^\$(\w+)\s*=");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = "$" + match.Groups[1].Value,
            Scope = GlobalVariableScope.Module
        };
        return true;
    }

    private static bool TryExtractRuby(string line, int depth, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth != 0 || line.StartsWith("def ", StringComparison.Ordinal) || line.StartsWith("class ", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(line, @"^\$([A-Za-z_]\w*)\s*=");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = "$" + match.Groups[1].Value,
            Scope = GlobalVariableScope.Module
        };
        return true;
    }

    private static bool TryExtractSwift(string line, int depth, string currentType, out ExtractedVariable extracted)
    {
        extracted = default;
        if (depth == 0)
        {
            var topLevel = Regex.Match(line, @"^(?:(?:public|private|internal|fileprivate)\s+)?(?:let|var)\s+(\w+)");
            if (topLevel.Success)
            {
                extracted = new ExtractedVariable
                {
                    Name = topLevel.Groups[1].Value,
                    Scope = GlobalVariableScope.Module,
                    IsReadOnly = line.Contains("let ", StringComparison.Ordinal)
                };
                return true;
            }
        }

        if (depth != 1 || !line.Contains("static", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(line, @"^\s*(?:(?:public|private|internal|fileprivate)\s+)?static\s+(?:let|var)\s+(\w+)");
        if (!match.Success)
        {
            return false;
        }

        extracted = new ExtractedVariable
        {
            Name = match.Groups[1].Value,
            Scope = GlobalVariableScope.ClassStatic,
            ContainingScope = currentType,
            IsReadOnly = line.Contains("let ", StringComparison.Ordinal)
        };
        return true;
    }

    private static bool TryCaptureTypeName(string languageId, string line, out string typeName)
    {
        typeName = string.Empty;
        Match match = languageId switch
        {
            "java" => Regex.Match(line, @"^\s*(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)"),
            "swift" => Regex.Match(line, @"^\s*(?:public\s+|private\s+|internal\s+|fileprivate\s+)?(?:final\s+)?class\s+(\w+)"),
            _ => Match.Empty
        };

        if (!match.Success)
        {
            return false;
        }

        typeName = match.Groups[1].Value;
        return true;
    }

    private static bool IsTypeDeclarationLine(string languageId, string line) =>
        languageId is "java" or "swift"
        && (line.Contains(" class ", StringComparison.Ordinal) || line.StartsWith("class ", StringComparison.Ordinal));

    private static string ExtractTypeHint(string line)
    {
        var cleaned = Regex.Replace(line, @"^(?:extern\s+|static\s+|const\s+|volatile\s+|unsigned\s+|signed\s+)+", string.Empty);
        var match = Regex.Match(cleaned, @"^([\w:<>,\*\s]+?)\s+\w+\s*(?:\[\s*\])?\s*(?:=|;)");
        return match.Success ? match.Groups[1].Value.Trim() : string.Empty;
    }

    private static int CountChar(string text, char value)
    {
        var count = 0;
        foreach (var ch in text)
        {
            if (ch == value)
            {
                count++;
            }
        }

        return count;
    }

    private struct ExtractedVariable
    {
        public string Name;
        public GlobalVariableScope Scope;
        public string TypeName;
        public string ContainingScope;
        public string AccessModifier;
        public bool IsConst;
        public bool IsReadOnly;
    }
}

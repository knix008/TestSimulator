using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services;

internal static class PatternStructureMemberExtractor
{
    private const int MaxMembersPerSection = 24;

    private static readonly Regex JavaFieldRegex = new(
        @"^\s*(?<vis>public|private|protected|internal|\s)*\s*(?:static|final|volatile|transient|\s)*[\w<>\[\],\.\?\s]+\s+(?<name>[A-Za-z_]\w*)\s*(?:=\s*[^;]+)?\s*;",
        RegexOptions.Compiled);

    private static readonly Regex JavaMethodRegex = new(
        @"^\s*(?<vis>public|private|protected|internal|\s)*\s*(?:static|final|synchronized|default|\s)*[\w<>\[\],\.\?\s]+\s+(?<name>[A-Za-z_]\w*)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex KotlinFieldRegex = new(
        @"^\s*(?<vis>public|private|protected|internal|\s)*\s*(?:val|var)\s+(?<name>[A-Za-z_]\w*)",
        RegexOptions.Compiled);

    private static readonly Regex KotlinMethodRegex = new(
        @"^\s*(?:override\s+)?(?:fun\s+)(?<name>[A-Za-z_]\w*)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex CppFieldRegex = new(
        @"^\s*(?<vis>public|private|protected|\s)*\s*(?:static|const|mutable|volatile|\s)*[\w<>\[\]:*&\s]+\s+(?<name>[A-Za-z_]\w*)\s*(?:=\s*[^;]+)?\s*;",
        RegexOptions.Compiled);

    private static readonly Regex CppMethodRegex = new(
        @"^\s*(?<vis>public|private|protected|\s)*\s*(?:static|virtual|inline|explicit|constexpr|\s)*[\w<>\[\]:*&\s]+\s+(?<name>[A-Za-z_]\w*)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex JavaScriptMethodRegex = new(
        @"^\s*(?:(?<vis>public|private|protected)\s+)?(?:(?:async|static|get|set|\*)\s+)*(?<name>[A-Za-z_$]\w*)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex JavaScriptFieldRegex = new(
        @"^\s*(?:(?<vis>public|private|protected|static|readonly)\s+)*(?<name>[A-Za-z_$]\w*)\s*(?:=|;)",
        RegexOptions.Compiled);

    private static readonly Regex PythonDefRegex = new(
        @"^\s+(?:async\s+)?def\s+(?<name>[A-Za-z_]\w*)\s*\(",
        RegexOptions.Compiled);

    private static readonly Regex PythonClassAttrRegex = new(
        @"^\s+(?<name>[A-Za-z_]\w*)\s*(?::\s*[^=]+)?\s*=",
        RegexOptions.Compiled);

    public static (IReadOnlyList<string> Attributes, IReadOnlyList<string> Operations) Extract(
        string languageId,
        IReadOnlyList<string> lines,
        int classLineIndex,
        string typeName)
    {
        return languageId switch
        {
            "java" => ExtractFromBraceBody(lines, classLineIndex, line => ExtractJavaLine(line, typeName)),
            "kotlin" => ExtractFromBraceBody(lines, classLineIndex, line => ExtractKotlinLine(line, typeName)),
            "cpp" => ExtractFromBraceBody(lines, classLineIndex, line => ExtractCppLine(line, typeName)),
            "javascript" => ExtractFromBraceBody(lines, classLineIndex, line => ExtractJavaScriptLine(line, typeName)),
            "python" => ExtractPythonBody(lines, classLineIndex, typeName),
            _ => ([], [])
        };
    }

    private static (IReadOnlyList<string> Attributes, IReadOnlyList<string> Operations) ExtractFromBraceBody(
        IReadOnlyList<string> lines,
        int classLineIndex,
        Func<string, (string? Attribute, string? Operation)> extractLine)
    {
        var bodyLines = GetBraceDelimitedBody(lines, classLineIndex);
        if (bodyLines.Count == 0)
        {
            return ([], []);
        }

        var attributes = new List<string>();
        var operations = new List<string>();

        foreach (var line in bodyLines)
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith("//", StringComparison.Ordinal) || trimmed.StartsWith("/*", StringComparison.Ordinal))
            {
                continue;
            }

            var (attribute, operation) = extractLine(line);
            if (attribute is not null && attributes.Count < MaxMembersPerSection)
            {
                attributes.Add(attribute);
            }

            if (operation is not null && operations.Count < MaxMembersPerSection)
            {
                operations.Add(operation);
            }
        }

        return (attributes, operations);
    }

    private static (IReadOnlyList<string> Attributes, IReadOnlyList<string> Operations) ExtractPythonBody(
        IReadOnlyList<string> lines,
        int classLineIndex,
        string typeName)
    {
        var attributes = new List<string>();
        var operations = new List<string>();
        var classLine = lines[classLineIndex];
        var classIndent = GetLeadingWhitespaceLength(classLine);

        for (var i = classLineIndex + 1; i < lines.Count; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var indent = GetLeadingWhitespaceLength(line);
            if (indent <= classIndent)
            {
                break;
            }

            if (line.TrimStart().StartsWith("def ", StringComparison.Ordinal)
                || line.TrimStart().StartsWith("async def ", StringComparison.Ordinal))
            {
                var match = PythonDefRegex.Match(line);
                if (match.Success)
                {
                    var name = match.Groups["name"].Value;
                    if (!string.Equals(name, typeName, StringComparison.Ordinal) && operations.Count < MaxMembersPerSection)
                    {
                        var prefix = line.Contains("async def", StringComparison.Ordinal) ? "{async} " : string.Empty;
                        operations.Add($"{prefix}{name}()");
                    }
                }

                continue;
            }

            var attrMatch = PythonClassAttrRegex.Match(line);
            if (attrMatch.Success && attributes.Count < MaxMembersPerSection)
            {
                attributes.Add($"+ {attrMatch.Groups["name"].Value}");
            }
        }

        return (attributes, operations);
    }

    private static (string? Attribute, string? Operation) ExtractJavaLine(string line, string typeName)
    {
        var methodMatch = JavaMethodRegex.Match(line);
        if (methodMatch.Success)
        {
            var name = methodMatch.Groups["name"].Value;
            if (!IsConstructor(name, typeName))
            {
                return (null, $"{VisibilityFromGroup(methodMatch.Groups["vis"].Value)} {name}()");
            }
        }

        var fieldMatch = JavaFieldRegex.Match(line);
        if (fieldMatch.Success)
        {
            return ($"{VisibilityFromGroup(fieldMatch.Groups["vis"].Value)} {fieldMatch.Groups["name"].Value}", null);
        }

        return (null, null);
    }

    private static (string? Attribute, string? Operation) ExtractKotlinLine(string line, string typeName)
    {
        var methodMatch = KotlinMethodRegex.Match(line);
        if (methodMatch.Success)
        {
            var name = methodMatch.Groups["name"].Value;
            if (!IsConstructor(name, typeName))
            {
                return (null, $"+ {name}()");
            }
        }

        var fieldMatch = KotlinFieldRegex.Match(line);
        if (fieldMatch.Success)
        {
            return ($"{VisibilityFromGroup(fieldMatch.Groups["vis"].Value, defaultInternal: true)} {fieldMatch.Groups["name"].Value}", null);
        }

        return (null, null);
    }

    private static (string? Attribute, string? Operation) ExtractCppLine(string line, string typeName)
    {
        var methodMatch = CppMethodRegex.Match(line);
        if (methodMatch.Success)
        {
            var name = methodMatch.Groups["name"].Value;
            if (!IsConstructor(name, typeName) && name is not ("if" or "for" or "while" or "switch" or "catch"))
            {
                return (null, $"{VisibilityFromGroup(methodMatch.Groups["vis"].Value)} {name}()");
            }
        }

        var fieldMatch = CppFieldRegex.Match(line);
        if (fieldMatch.Success)
        {
            var name = fieldMatch.Groups["name"].Value;
            if (name is not ("if" or "for" or "while" or "switch" or "return"))
            {
                return ($"{VisibilityFromGroup(fieldMatch.Groups["vis"].Value)} {name}", null);
            }
        }

        return (null, null);
    }

    private static (string? Attribute, string? Operation) ExtractJavaScriptLine(string line, string typeName)
    {
        var methodMatch = JavaScriptMethodRegex.Match(line);
        if (methodMatch.Success)
        {
            var name = methodMatch.Groups["name"].Value;
            if (!IsConstructor(name, typeName) && name is not ("if" or "for" or "while" or "switch" or "catch"))
            {
                var vis = VisibilityFromGroup(methodMatch.Groups["vis"].Value);
                var prefix = line.Contains("async ", StringComparison.Ordinal) ? "{async} " : string.Empty;
                return (null, $"{vis}{prefix}{name}()");
            }
        }

        var fieldMatch = JavaScriptFieldRegex.Match(line);
        if (fieldMatch.Success)
        {
            return ($"{VisibilityFromGroup(fieldMatch.Groups["vis"].Value)} {fieldMatch.Groups["name"].Value}", null);
        }

        return (null, null);
    }

    private static List<string> GetBraceDelimitedBody(IReadOnlyList<string> lines, int startLineIndex)
    {
        var body = new List<string>();
        var braceDepth = 0;
        var started = false;

        for (var i = startLineIndex; i < lines.Count; i++)
        {
            var line = lines[i];
            foreach (var ch in line)
            {
                if (ch == '{')
                {
                    braceDepth++;
                    started = true;
                }
                else if (ch == '}')
                {
                    braceDepth--;
                    if (started && braceDepth == 0)
                    {
                        return body;
                    }
                }
            }

            if (started && braceDepth > 0 && i > startLineIndex)
            {
                body.Add(line);
            }
        }

        return body;
    }

    private static int GetLeadingWhitespaceLength(string line)
    {
        var count = 0;
        foreach (var ch in line)
        {
            if (ch is ' ' or '\t')
            {
                count++;
            }
            else
            {
                break;
            }
        }

        return count;
    }

    private static bool IsConstructor(string memberName, string typeName) =>
        string.Equals(memberName, typeName, StringComparison.Ordinal);

    private static string VisibilityFromGroup(string raw, bool defaultInternal = false)
    {
        if (raw.Contains("public", StringComparison.Ordinal))
        {
            return "+";
        }

        if (raw.Contains("private", StringComparison.Ordinal))
        {
            return "-";
        }

        if (raw.Contains("protected", StringComparison.Ordinal))
        {
            return "#";
        }

        return defaultInternal ? "~" : "+";
    }
}

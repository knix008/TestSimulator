using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Duplicates;

public static class DuplicateCodeAnalyzer
{
    private const int MaxSampleLines = 6;

    public static DuplicateCodeResult Analyze(
        IReadOnlyList<string> sourceFiles,
        int minDuplicateLines,
        CancellationToken cancellationToken = default)
    {
        minDuplicateLines = Math.Clamp(minDuplicateLines, 2, 200);

        if (sourceFiles.Count == 0)
        {
            return new DuplicateCodeResult { MinDuplicateLines = minDuplicateLines };
        }

        var fileLines = LoadNormalizedFiles(sourceFiles, cancellationToken);
        if (fileLines.Count == 0)
        {
            return new DuplicateCodeResult { MinDuplicateLines = minDuplicateLines };
        }

        var fileMap = fileLines.ToDictionary(file => file.FilePath, StringComparer.OrdinalIgnoreCase);
        var windowMap = new Dictionary<string, List<WindowOccurrence>>(StringComparer.Ordinal);

        foreach (var file in fileLines)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (file.Lines.Length < minDuplicateLines)
            {
                continue;
            }

            for (var start = 0; start <= file.Lines.Length - minDuplicateLines; start++)
            {
                if (!WindowHasSignificantLine(file.Lines, start, minDuplicateLines))
                {
                    continue;
                }

                var key = BuildWindowKey(file.Lines, start, minDuplicateLines);
                if (string.IsNullOrEmpty(key))
                {
                    continue;
                }

                if (!windowMap.TryGetValue(key, out var list))
                {
                    if (windowMap.Count >= AnalysisScaleLimits.MaxDuplicateWindowMapEntries)
                    {
                        break;
                    }

                    list = [];
                    windowMap[key] = list;
                }

                list.Add(new WindowOccurrence(file.FilePath, file.LanguageId, start + 1));
            }

            if (windowMap.Count >= AnalysisScaleLimits.MaxDuplicateWindowMapEntries)
            {
                break;
            }
        }

        var groups = new List<DuplicateCodeGroup>();
        var groupIndex = 0;
        var reported = new HashSet<string>(StringComparer.Ordinal);

        foreach (var (_, occurrences) in windowMap.OrderByDescending(entry => entry.Value.Count))
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (occurrences.Count < 2)
            {
                continue;
            }

            var extendedLength = ExtendMaximalDuplicateBlock(
                fileMap,
                occurrences[0],
                minDuplicateLines);
            var duplicateLines = GetMatchLines(fileMap, occurrences[0], extendedLength);
            if (duplicateLines.Count < minDuplicateLines)
            {
                continue;
            }

            var extendedKey = string.Join('\n', duplicateLines);

            if (!reported.Add(extendedKey))
            {
                continue;
            }

            var fragments = FindAllMatchingFragments(fileMap, duplicateLines, minDuplicateLines);
            if (fragments.Count < 2)
            {
                continue;
            }

            groups.Add(new DuplicateCodeGroup
            {
                Id = $"dup-{++groupIndex}",
                LineCount = duplicateLines.Count,
                DuplicateLines = duplicateLines,
                SampleLines = duplicateLines.Take(MaxSampleLines).ToList(),
                Fragments = fragments
            });

            if (groups.Count >= AnalysisScaleLimits.MaxDuplicateCodeGroups)
            {
                break;
            }
        }

        return new DuplicateCodeResult
        {
            MinDuplicateLines = minDuplicateLines,
            Groups = groups
                .Where(group => group.LineCount >= minDuplicateLines)
                .OrderByDescending(group => group.LineCount)
                .ThenByDescending(group => group.Fragments.Count)
                .Take(AnalysisScaleLimits.MaxDuplicateCodeGroups)
                .ToList()
        };
    }

    private static List<FileLineData> LoadNormalizedFiles(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken)
    {
        var result = new List<FileLineData>(sourceFiles.Count);

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var language = LanguageRegistry.FindByExtension(Path.GetExtension(file));
            if (language is null)
            {
                continue;
            }

            try
            {
                var text = File.ReadAllText(file);
                var rawLines = text.Split('\n');
                var normalized = new string[rawLines.Length];
                for (var i = 0; i < rawLines.Length; i++)
                {
                    normalized[i] = LineNormalizer.Normalize(rawLines[i]);
                }

                result.Add(new FileLineData(file, language.Id, normalized));
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip unreadable file
            }
        }

        return result;
    }

    private static bool WindowHasSignificantLine(string[] lines, int start, int length)
    {
        for (var i = start; i < start + length; i++)
        {
            if (LineNormalizer.IsSignificantLine(lines[i]))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildWindowKey(string[] lines, int start, int length)
        => string.Join('\n', lines.AsSpan(start, length).ToArray());

    /// <summary>
    /// 기준 줄 수(min) 이상으로, 프로젝트 내 2곳 이상에서 동일하게 나타나는 최대 연속 블록 길이를 구합니다.
    /// </summary>
    private static int ExtendMaximalDuplicateBlock(
        Dictionary<string, FileLineData> fileMap,
        WindowOccurrence reference,
        int minDuplicateLines)
    {
        if (!fileMap.TryGetValue(reference.FilePath, out var refFile))
        {
            return minDuplicateLines;
        }

        var refStart = reference.StartLine - 1;
        var maxLength = refFile.Lines.Length - refStart;
        var length = minDuplicateLines;

        while (length < maxLength)
        {
            var candidateLines = refFile.Lines.AsSpan(refStart, length + 1).ToArray();
            if (CountMatchingFragments(fileMap, candidateLines, minDuplicateLines) < 2)
            {
                break;
            }

            length++;
        }

        return length;
    }

    private static int CountMatchingFragments(
        Dictionary<string, FileLineData> fileMap,
        IReadOnlyList<string> duplicateLines,
        int minDuplicateLines)
    {
        var length = duplicateLines.Count;
        if (length < minDuplicateLines)
        {
            return 0;
        }

        var count = 0;

        foreach (var file in fileMap.Values)
        {
            if (file.Lines.Length < length)
            {
                continue;
            }

            for (var start = 0; start <= file.Lines.Length - length; start++)
            {
                if (!WindowHasSignificantLine(file.Lines, start, minDuplicateLines))
                {
                    continue;
                }

                if (!LinesMatchAt(file.Lines, start, duplicateLines))
                {
                    continue;
                }

                count++;
                if (count >= 2)
                {
                    return count;
                }
            }
        }

        return count;
    }

    private static List<DuplicateCodeFragment> FindAllMatchingFragments(
        Dictionary<string, FileLineData> fileMap,
        IReadOnlyList<string> duplicateLines,
        int minDuplicateLines)
    {
        var length = duplicateLines.Count;
        if (length < minDuplicateLines)
        {
            return [];
        }

        var fragments = new List<DuplicateCodeFragment>();

        foreach (var file in fileMap.Values)
        {
            if (file.Lines.Length < length)
            {
                continue;
            }

            for (var start = 0; start <= file.Lines.Length - length; start++)
            {
                if (!WindowHasSignificantLine(file.Lines, start, minDuplicateLines))
                {
                    continue;
                }

                if (!LinesMatchAt(file.Lines, start, duplicateLines))
                {
                    continue;
                }

                fragments.Add(new DuplicateCodeFragment
                {
                    FilePath = file.FilePath,
                    LanguageId = file.LanguageId,
                    StartLine = start + 1,
                    EndLine = start + length
                });
            }
        }

        return fragments
            .OrderBy(fragment => fragment.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(fragment => fragment.StartLine)
            .ToList();
    }

    private static bool LinesMatchAt(string[] lines, int start, IReadOnlyList<string> duplicateLines)
    {
        for (var i = 0; i < duplicateLines.Count; i++)
        {
            if (!string.Equals(lines[start + i], duplicateLines[i], StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    private static List<string> GetMatchLines(
        Dictionary<string, FileLineData> fileMap,
        WindowOccurrence occurrence,
        int length)
    {
        if (!fileMap.TryGetValue(occurrence.FilePath, out var file))
        {
            return [];
        }

        var start = occurrence.StartLine - 1;
        var count = Math.Min(length, file.Lines.Length - start);
        return file.Lines.AsSpan(start, count).ToArray().ToList();
    }

    private sealed record FileLineData(string FilePath, string LanguageId, string[] Lines);
    private sealed record WindowOccurrence(string FilePath, string LanguageId, int StartLine);
}

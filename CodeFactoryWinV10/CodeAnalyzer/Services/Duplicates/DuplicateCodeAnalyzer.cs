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

        foreach (var (_, occurrences) in windowMap)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (occurrences.Count < 2)
            {
                continue;
            }

            var extendedLength = ExtendMatchLength(fileMap, occurrences, minDuplicateLines);
            var sampleLines = GetSampleLines(fileMap, occurrences[0], extendedLength);
            var extendedKey = string.Join('\n', sampleLines);

            if (!reported.Add(extendedKey))
            {
                continue;
            }

            var fragments = occurrences
                .Select(occurrence => new DuplicateCodeFragment
                {
                    FilePath = occurrence.FilePath,
                    LanguageId = occurrence.LanguageId,
                    StartLine = occurrence.StartLine,
                    EndLine = occurrence.StartLine + extendedLength - 1
                })
                .OrderBy(fragment => fragment.FilePath, StringComparer.OrdinalIgnoreCase)
                .ThenBy(fragment => fragment.StartLine)
                .ToList();

            groups.Add(new DuplicateCodeGroup
            {
                Id = $"dup-{++groupIndex}",
                LineCount = extendedLength,
                SampleLines = sampleLines,
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

    private static int ExtendMatchLength(
        Dictionary<string, FileLineData> fileMap,
        List<WindowOccurrence> occurrences,
        int minLength)
    {
        var maxLength = minLength;

        foreach (var occurrence in occurrences)
        {
            if (!fileMap.TryGetValue(occurrence.FilePath, out var file))
            {
                return minLength;
            }

            var available = file.Lines.Length - (occurrence.StartLine - 1);
            maxLength = Math.Min(maxLength, available);
        }

        var length = minLength;

        while (length < maxLength)
        {
            string? referenceLine = null;

            foreach (var occurrence in occurrences)
            {
                var file = fileMap[occurrence.FilePath];
                var lineIndex = occurrence.StartLine - 1 + length;
                var line = file.Lines[lineIndex];
                referenceLine ??= line;

                if (!string.Equals(referenceLine, line, StringComparison.Ordinal))
                {
                    return length;
                }
            }

            length++;
        }

        return length;
    }

    private static List<string> GetSampleLines(
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
        return file.Lines.AsSpan(start, count).ToArray().Take(MaxSampleLines).ToList();
    }

    private sealed record FileLineData(string FilePath, string LanguageId, string[] Lines);
    private sealed record WindowOccurrence(string FilePath, string LanguageId, int StartLine);
}

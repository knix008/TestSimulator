using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Duplicates;

public static class DuplicateCodeAnalyzer
{
    private const int MaxSampleLines = 6;

    public static DuplicateCodeResult Analyze(
        IReadOnlyList<string> sourceFiles,
        int minDuplicateLines,
        CancellationToken cancellationToken = default,
        Action<string>? onProgress = null)
    {
        minDuplicateLines = UserAnalysisSettings.NormalizeMinDuplicateLines(minDuplicateLines);

        if (sourceFiles.Count == 0)
        {
            return new DuplicateCodeResult { MinDuplicateLines = minDuplicateLines };
        }

        onProgress?.Invoke("중복 코드: 소스 파일을 읽는 중...");
        var fileLines = LoadNormalizedFiles(sourceFiles, cancellationToken, onProgress);
        if (fileLines.Count == 0)
        {
            return new DuplicateCodeResult { MinDuplicateLines = minDuplicateLines };
        }

        onProgress?.Invoke("중복 코드: 윈도우 인덱싱 중...");
        var fileMap = fileLines.ToDictionary(file => file.FilePath, StringComparer.OrdinalIgnoreCase);
        var windowMap = BuildWindowMap(fileLines, minDuplicateLines, cancellationToken);

        onProgress?.Invoke("중복 코드: 그룹을 구성하는 중...");
        var groups = BuildGroups(fileMap, windowMap, minDuplicateLines, cancellationToken, onProgress);

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

    private static Dictionary<string, List<WindowOccurrence>> BuildWindowMap(
        List<FileLineData> fileLines,
        int minDuplicateLines,
        CancellationToken cancellationToken)
    {
        var windowMap = new Dictionary<string, List<WindowOccurrence>>(StringComparer.Ordinal);
        var operationIndex = 0;

        for (var fileIndex = 0; fileIndex < fileLines.Count; fileIndex++)
        {
            var file = fileLines[fileIndex];
            ThrowIfDue(ref operationIndex, cancellationToken);

            if (file.Lines.Length < minDuplicateLines)
            {
                continue;
            }

            var windowsIndexed = 0;
            for (var start = 0; start <= file.Lines.Length - minDuplicateLines; start++)
            {
                ThrowIfDue(ref operationIndex, cancellationToken);

                if (!LineNormalizer.IsSignificantLine(file.Lines[start]))
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
                        return windowMap;
                    }

                    list = [];
                    windowMap[key] = list;
                }

                list.Add(new WindowOccurrence(file.FilePath, file.LanguageId, start + 1));
                windowsIndexed++;
                if (windowsIndexed >= AnalysisScaleLimits.MaxDuplicateWindowsPerFile)
                {
                    break;
                }
            }

            if (windowMap.Count >= AnalysisScaleLimits.MaxDuplicateWindowMapEntries)
            {
                break;
            }
        }

        return windowMap;
    }

    private static List<DuplicateCodeGroup> BuildGroups(
        Dictionary<string, FileLineData> fileMap,
        Dictionary<string, List<WindowOccurrence>> windowMap,
        int minDuplicateLines,
        CancellationToken cancellationToken,
        Action<string>? onProgress)
    {
        var groups = new List<DuplicateCodeGroup>();
        var reported = new HashSet<string>(StringComparer.Ordinal);
        var candidates = SelectTopCandidateOccurrences(windowMap, AnalysisScaleLimits.MaxDuplicatePhase2Candidates);
        var groupIndex = 0;
        var operationIndex = 0;

        for (var candidateIndex = 0; candidateIndex < candidates.Count; candidateIndex++)
        {
            ThrowIfDue(ref operationIndex, cancellationToken);

            if ((candidateIndex & 63) == 0)
            {
                onProgress?.Invoke(
                    $"중복 코드: 그룹 구성 중 ({candidateIndex + 1}/{candidates.Count})...");
            }

            var occurrences = candidates[candidateIndex];
            if (occurrences.Count < 2)
            {
                continue;
            }

            var extendedLength = ExtendMaximalDuplicateBlock(
                fileMap,
                occurrences[0],
                minDuplicateLines,
                cancellationToken,
                ref operationIndex);
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

            var fragments = FindAllMatchingFragments(
                fileMap,
                duplicateLines,
                minDuplicateLines,
                cancellationToken,
                ref operationIndex);
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

        return groups;
    }

    private static List<List<WindowOccurrence>> SelectTopCandidateOccurrences(
        Dictionary<string, List<WindowOccurrence>> windowMap,
        int maxCandidates)
    {
        var heap = new PriorityQueue<List<WindowOccurrence>, int>();

        foreach (var occurrences in windowMap.Values)
        {
            if (occurrences.Count < 2)
            {
                continue;
            }

            if (heap.Count < maxCandidates)
            {
                heap.Enqueue(occurrences, occurrences.Count);
                continue;
            }

            if (occurrences.Count <= heap.Peek().Count)
            {
                continue;
            }

            heap.Dequeue();
            heap.Enqueue(occurrences, occurrences.Count);
        }

        var result = new List<List<WindowOccurrence>>(heap.Count);
        while (heap.Count > 0)
        {
            result.Add(heap.Dequeue());
        }

        result.Sort((left, right) => right.Count.CompareTo(left.Count));
        return result;
    }

    private static List<FileLineData> LoadNormalizedFiles(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken,
        Action<string>? onProgress)
    {
        var result = new List<FileLineData>(sourceFiles.Count);

        for (var fileIndex = 0; fileIndex < sourceFiles.Count; fileIndex++)
        {
            if ((fileIndex & 31) == 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
                onProgress?.Invoke($"중복 코드: 파일 읽는 중 ({fileIndex + 1}/{sourceFiles.Count})...");
            }

            var file = sourceFiles[fileIndex];
            var language = LanguageRegistry.FindByExtension(Path.GetExtension(file));
            if (language is null)
            {
                continue;
            }

            try
            {
                var fileInfo = new FileInfo(file);
                if (!fileInfo.Exists
                    || fileInfo.Length > AnalysisScaleLimits.MaxSourceFileBytesForDuplicateScan)
                {
                    continue;
                }

                var text = File.ReadAllText(file);
                var rawLines = text.Split('\n');
                if (rawLines.Length > AnalysisScaleLimits.MaxLinesPerFileForDuplicateDetection)
                {
                    continue;
                }

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

    private static string BuildWindowKey(string[] lines, int start, int length)
        => string.Join('\n', lines, start, length);

    /// <summary>
    /// 기준 줄 수(min) 이상으로, 프로젝트 내 2곳 이상에서 동일하게 나타나는 최대 연속 블록 길이를 구합니다.
    /// </summary>
    private static int ExtendMaximalDuplicateBlock(
        Dictionary<string, FileLineData> fileMap,
        WindowOccurrence reference,
        int minDuplicateLines,
        CancellationToken cancellationToken,
        ref int operationIndex)
    {
        if (!fileMap.TryGetValue(reference.FilePath, out var refFile))
        {
            return minDuplicateLines;
        }

        var refStart = reference.StartLine - 1;
        var maxLength = Math.Min(
            refFile.Lines.Length - refStart,
            AnalysisScaleLimits.MaxDuplicateBlockLines);
        if (maxLength < minDuplicateLines)
        {
            return minDuplicateLines;
        }

        var low = minDuplicateLines;
        var high = maxLength;
        while (low < high)
        {
            ThrowIfDue(ref operationIndex, cancellationToken);

            var mid = (low + high + 1) / 2;
            var candidateLines = refFile.Lines.AsSpan(refStart, mid).ToArray();
            if (CountMatchingFragments(fileMap, candidateLines, minDuplicateLines, cancellationToken, ref operationIndex) >= 2)
            {
                low = mid;
            }
            else
            {
                high = mid - 1;
            }
        }

        return low;
    }

    private static int CountMatchingFragments(
        Dictionary<string, FileLineData> fileMap,
        IReadOnlyList<string> duplicateLines,
        int minDuplicateLines,
        CancellationToken cancellationToken,
        ref int operationIndex)
    {
        var length = duplicateLines.Count;
        if (length < minDuplicateLines)
        {
            return 0;
        }

        var count = 0;

        foreach (var file in fileMap.Values)
        {
            ThrowIfDue(ref operationIndex, cancellationToken);

            if (file.Lines.Length < length)
            {
                continue;
            }

            for (var start = 0; start <= file.Lines.Length - length; start++)
            {
                ThrowIfDue(ref operationIndex, cancellationToken);

                if (!LineNormalizer.IsSignificantLine(file.Lines[start]))
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
        int minDuplicateLines,
        CancellationToken cancellationToken,
        ref int operationIndex)
    {
        var length = duplicateLines.Count;
        if (length < minDuplicateLines)
        {
            return [];
        }

        var fragments = new List<DuplicateCodeFragment>(
            Math.Min(AnalysisScaleLimits.MaxDuplicateFragmentsPerGroup, 8));

        foreach (var file in fileMap.Values)
        {
            ThrowIfDue(ref operationIndex, cancellationToken);

            if (file.Lines.Length < length)
            {
                continue;
            }

            for (var start = 0; start <= file.Lines.Length - length; start++)
            {
                ThrowIfDue(ref operationIndex, cancellationToken);

                if (!LineNormalizer.IsSignificantLine(file.Lines[start]))
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

                if (fragments.Count >= AnalysisScaleLimits.MaxDuplicateFragmentsPerGroup)
                {
                    return SortFragments(fragments);
                }
            }
        }

        return SortFragments(fragments);
    }

    private static List<DuplicateCodeFragment> SortFragments(List<DuplicateCodeFragment> fragments) =>
        fragments
            .OrderBy(fragment => fragment.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(fragment => fragment.StartLine)
            .ToList();

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

    private static void ThrowIfDue(ref int operationIndex, CancellationToken cancellationToken)
    {
        operationIndex++;
        if ((operationIndex & (AnalysisScaleLimits.DuplicateCancellationCheckInterval - 1)) == 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
        }
    }

    private sealed record FileLineData(string FilePath, string LanguageId, string[] Lines);
    private sealed record WindowOccurrence(string FilePath, string LanguageId, int StartLine);
}

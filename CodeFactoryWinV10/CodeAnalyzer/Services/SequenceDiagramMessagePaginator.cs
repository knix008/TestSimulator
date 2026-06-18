using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>긴 시퀀스 다이어그램을 메시지 단위 페이지로 분할합니다.</summary>
public static class SequenceDiagramMessagePaginator
{
    public static int GetPageCount(int messageCount)
    {
        if (messageCount <= 0)
        {
            return 0;
        }

        return (int)Math.Ceiling(messageCount / (double)AnalysisScaleLimits.MaxSequenceDiagramMessagesPerPage);
    }

    public static bool RequiresPaging(int messageCount) =>
        messageCount > AnalysisScaleLimits.MaxSequenceDiagramMessagesPerPage;

    public static SequenceDiagramResult GetLayoutSource(SequenceDiagramResult source) =>
        RequiresPaging(source.Messages.Count) ? CreatePage(source, 0) : source;

    public static SequenceDiagramResult CreatePage(SequenceDiagramResult source, int pageIndex)
    {
        var ordered = source.Messages.OrderBy(message => message.Order).ToList();
        var pageSize = AnalysisScaleLimits.MaxSequenceDiagramMessagesPerPage;
        var start = pageIndex * pageSize;
        if (start >= ordered.Count)
        {
            return new SequenceDiagramResult
            {
                ParticipantIds = source.ParticipantIds,
                Messages = [],
                ParticipantMap = source.ParticipantMap,
                IsTruncated = source.IsTruncated,
                TruncationNote = source.TruncationNote
            };
        }

        var slice = ordered.Skip(start).Take(pageSize).ToList();
        var remapped = new List<SequenceMessage>(slice.Count);
        for (var index = 0; index < slice.Count; index++)
        {
            var message = slice[index];
            remapped.Add(new SequenceMessage
            {
                FromId = message.FromId,
                ToId = message.ToId,
                Label = message.Label,
                Order = index
            });
        }

        var usedParticipantIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var message in remapped)
        {
            usedParticipantIds.Add(message.FromId);
            usedParticipantIds.Add(message.ToId);
        }

        var participantIds = source.ParticipantIds
            .Where(usedParticipantIds.Contains)
            .ToList();
        foreach (var participantId in usedParticipantIds)
        {
            if (!participantIds.Contains(participantId))
            {
                participantIds.Add(participantId);
            }
        }

        var pageCount = GetPageCount(ordered.Count);
        var end = start + remapped.Count;

        return new SequenceDiagramResult
        {
            ParticipantIds = participantIds,
            Messages = remapped,
            ParticipantMap = source.ParticipantMap,
            IsTruncated = source.IsTruncated,
            TruncationNote = pageIndex == 0 ? source.TruncationNote : null,
            MessageIndexOffset = start,
            PageNote = pageCount > 1
                ? $"메시지 {start + 1}–{end} / {ordered.Count:N0} (페이지 {pageIndex + 1}/{pageCount})"
                : null
        };
    }
}

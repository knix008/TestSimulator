using System.Text.Json;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Services;

namespace MyAgileBoardWinV10.Utils;

internal static class CardEditSnapshot
{
    public static string Capture(KanbanCard card)
        => JsonSerializer.Serialize(card, ProjectService.Options);

    public static void Restore(KanbanCard target, string snapshotJson)
    {
        var restored = JsonSerializer.Deserialize<KanbanCard>(snapshotJson, ProjectService.Options);
        if (restored == null) return;
        CopyEditableProperties(restored, target);
    }

    public static void CopyEditableProperties(KanbanCard from, KanbanCard to)
    {
        to.Title = from.Title;
        to.Description = from.Description;
        to.DescriptionRtf = from.DescriptionRtf;
        to.Assignee = from.Assignee;
        to.Priority = from.Priority;
        to.DueDate = from.DueDate;
        to.Tags = from.Tags;
        to.CardColorHex = from.CardColorHex;
        to.Points = from.Points;
        to.TitleStyle = from.TitleStyle?.Clone() ?? new CardTextStyle();
        to.SizePreset = from.SizePreset;
        to.CustomWidth = from.CustomWidth;
        to.CustomHeight = from.CustomHeight;
        to.ShowTopRightFold = from.ShowTopRightFold;
    }
}

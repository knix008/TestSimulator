using System.Drawing;

namespace MyAgileBoardWinV10.Models;

public enum Priority { Low, Medium, High, Critical }

public class KanbanCard
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Assignee { get; set; } = string.Empty;
    public Priority Priority { get; set; } = Priority.Medium;
    public DateTime? DueDate { get; set; }
    public string Tags { get; set; } = string.Empty;
    public string CardColorHex { get; set; } = "#F5F5F5";
    public int Points { get; set; } = 1;
    public CardTextStyle TitleStyle { get; set; } = new();
    public string? DescriptionRtf { get; set; }
    public CardSizePreset SizePreset { get; set; } = CardSizePreset.Medium;
    public int CustomWidth { get; set; }
    public int CustomHeight { get; set; }
    public int OffsetX { get; set; }
    public int CanvasX { get; set; } = -1;
    public int CanvasY { get; set; } = -1;
    public float Rotation { get; set; }
    public int ZIndex { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime? CompletedAt { get; set; }

    [System.Text.Json.Serialization.JsonIgnore]
    public Color CardColor
    {
        get => ColorTranslator.FromHtml(CardColorHex);
        set => CardColorHex = $"#{value.R:X2}{value.G:X2}{value.B:X2}";
    }

    public (int Width, int Height) ResolveDisplaySize(int columnMaxWidth)
    {
        int width;
        int height;

        if (SizePreset == CardSizePreset.Custom)
        {
            width = CustomWidth;
            height = CustomHeight;
        }
        else if (SizePreset == CardSizePreset.Auto)
        {
            width = 0;
            height = 0;
        }
        else
        {
            (width, height) = CardSizeDefaults.GetPresetSize(SizePreset);
        }

        if (width <= 0)
            width = Math.Min(columnMaxWidth, CardSizeDefaults.GetPresetSize(CardSizePreset.Medium).Width);
        else
            width = Math.Min(width, columnMaxWidth);

        width = Math.Max(width, CardSizeDefaults.MinWidth);
        if (height <= 0)
            height = CardSizeDefaults.GetPresetSize(SizePreset == CardSizePreset.Auto ? CardSizePreset.Medium : SizePreset).Height;
        if (height > 0)
            height = Math.Max(height, CardSizeDefaults.MinHeight);

        return (width, height);
    }

    public bool HasCanvasPosition() => Utils.CardCanvasHelper.HasCanvasPosition(CanvasX, CanvasY);
}

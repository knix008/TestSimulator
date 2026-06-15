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
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime? CompletedAt { get; set; }

    [System.Text.Json.Serialization.JsonIgnore]
    public Color CardColor
    {
        get => ColorTranslator.FromHtml(CardColorHex);
        set => CardColorHex = $"#{value.R:X2}{value.G:X2}{value.B:X2}";
    }
}

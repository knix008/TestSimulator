namespace MyAgileBoardWinV10.Models;

public class KanbanProject
{
    public string Name { get; set; } = "New Project";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public List<KanbanColumn> Columns { get; set; } = new();
    public List<ArchivedCard> ArchivedCards { get; set; } = new();

    [System.Text.Json.Serialization.JsonIgnore]
    public string FilePath { get; set; } = string.Empty;

    public static KanbanProject CreateDefault()
    {
        return new KanbanProject
        {
            Name = "My Project",
            Columns = new List<KanbanColumn>
            {
                new() { Name = "Backlog",      HeaderColorHex = "#808080" },
                new() { Name = "To Do",        HeaderColorHex = "#4472C4" },
                new() { Name = "In Progress",  HeaderColorHex = "#ED7D31" },
                new() { Name = "Review",       HeaderColorHex = "#9E49D3" },
                new() { Name = "Done",         HeaderColorHex = "#70AD47", IsCompletionColumn = true }
            }
        };
    }
}

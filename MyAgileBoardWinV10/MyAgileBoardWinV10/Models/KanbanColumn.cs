namespace MyAgileBoardWinV10.Models;

public class KanbanColumn
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string HeaderColorHex { get; set; } = "#4472C4";
    public bool IsCompletionColumn { get; set; } = false;
    public List<KanbanCard> Cards { get; set; } = new();
}

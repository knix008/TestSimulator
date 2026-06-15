namespace MyAgileBoardWinV10.Models;

public class ArchivedCard
{
    public KanbanCard Card { get; set; } = new();
    public string SourceColumnName { get; set; } = string.Empty;
    public DateTime ArchivedAt { get; set; } = DateTime.Now;
}

using System.Text.Json.Serialization;

namespace MyDiagramWinV10.Models;

public abstract class DiagramElement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [JsonIgnore]
    public bool IsSelected { get; set; }
}

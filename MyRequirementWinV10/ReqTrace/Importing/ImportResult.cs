using ReqTrace.Models;

namespace ReqTrace.Importing;

public class ImportResult
{
    public List<Requirement> Requirements { get; } = new();
    public List<string> Warnings { get; } = new();
    public int RowsProcessed { get; set; }
    public int RowsSkipped { get; set; }
}

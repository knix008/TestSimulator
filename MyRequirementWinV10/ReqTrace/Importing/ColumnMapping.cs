namespace ReqTrace.Importing;

public class ColumnMapping
{
    public int? CodeColumn { get; set; }
    public int? TitleColumn { get; set; }
    public int? DescriptionColumn { get; set; }
    public int? CategoryColumn { get; set; }
    public int? PriorityColumn { get; set; }
    public int? StatusColumn { get; set; }
    public int? SourceColumn { get; set; }
    public int? ParentCodeColumn { get; set; }
    public bool GenerateCodeIfMissing { get; set; } = true;
    public bool GenerateTestCases { get; set; } = true;
}

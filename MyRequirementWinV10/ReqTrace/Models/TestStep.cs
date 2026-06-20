namespace ReqTrace.Models;

public class TestStep
{
    public int Order { get; set; }
    public string Action { get; set; } = string.Empty;
    public string ExpectedOutcome { get; set; } = string.Empty;
}

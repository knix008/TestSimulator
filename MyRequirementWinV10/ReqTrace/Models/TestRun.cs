namespace ReqTrace.Models;

public class TestRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public TestRunStatus Status { get; set; } = TestRunStatus.NotRun;
    public DateTime ExecutedUtc { get; set; } = DateTime.UtcNow;
    public string ExecutedBy { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string BuildOrVersion { get; set; } = string.Empty;
}

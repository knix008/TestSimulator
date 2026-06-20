using System.Text.Json.Serialization;

namespace ReqTrace.Models;

public class TestCase
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequirementId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Preconditions { get; set; } = string.Empty;
    public string ExpectedResult { get; set; } = string.Empty;
    public List<TestStep> Steps { get; set; } = new();
    public List<TestRun> Runs { get; set; } = new();

    [JsonIgnore]
    public TestRun? LatestRun => Runs.OrderByDescending(r => r.ExecutedUtc).FirstOrDefault();

    [JsonIgnore]
    public TestRunStatus LatestStatus => LatestRun?.Status ?? TestRunStatus.NotRun;
}

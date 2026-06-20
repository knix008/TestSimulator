using System.Text.Json.Serialization;

namespace ReqTrace.Models;

public class Requirement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public Priority Priority { get; set; } = Priority.Medium;
    public RequirementStatus Status { get; set; } = RequirementStatus.Draft;
    public string Source { get; set; } = string.Empty;
    public Guid? ParentId { get; set; }
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime ModifiedUtc { get; set; } = DateTime.UtcNow;
    public List<TestCase> TestCases { get; set; } = new();

    [JsonIgnore]
    public TestRunStatus AggregateStatus
    {
        get
        {
            if (TestCases.Count == 0)
                return TestRunStatus.NotRun;

            var statuses = TestCases.Select(tc => tc.LatestStatus).ToList();
            if (statuses.Any(s => s == TestRunStatus.Fail))
                return TestRunStatus.Fail;
            if (statuses.Any(s => s == TestRunStatus.Blocked))
                return TestRunStatus.Blocked;
            if (statuses.All(s => s == TestRunStatus.Pass))
                return TestRunStatus.Pass;
            return TestRunStatus.NotRun;
        }
    }
}

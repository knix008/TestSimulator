using ReqTrace.Models;

namespace ReqTrace.Services;

public class TestRunService
{
    private readonly RequirementService _requirementService;

    public TestRunService(RequirementService requirementService)
    {
        _requirementService = requirementService;
    }

    public TestRun RecordRun(Requirement requirement, TestCase testCase, TestRun run)
    {
        testCase.Runs.Add(run);
        _requirementService.Update(requirement);
        return run;
    }
}

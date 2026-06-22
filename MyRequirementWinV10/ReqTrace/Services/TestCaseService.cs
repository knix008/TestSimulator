using ReqTrace.Models;

namespace ReqTrace.Services;

public class TestCaseService
{
    private readonly RequirementService _requirementService;

    public TestCaseService(RequirementService requirementService)
    {
        _requirementService = requirementService;
    }

    public TestCase Add(Requirement requirement, TestCase testCase)
    {
        testCase.RequirementId = requirement.Id;
        requirement.TestCases.Add(testCase);
        _requirementService.Update(requirement);
        return testCase;
    }

    public void Update(Requirement requirement)
    {
        _requirementService.Update(requirement);
    }

    public void Delete(Requirement requirement, TestCase testCase)
    {
        requirement.TestCases.Remove(testCase);
        ProjectCodeRenumberer.RenumberStandardTestCaseCodes(_requirementService.AllRequirements);
        _requirementService.Update(requirement);
    }
}

using ReqTrace.Localization;
using ReqTrace.Models;

namespace ReqTrace.Importing;

/// <summary>
/// Derives a default set of test cases from a requirement's title/description so that
/// every imported requirement ends up with at least one test case, even when the source
/// Excel has no test-case data at all.
/// </summary>
public static class TestCaseGenerator
{
    public static List<TestCase> Generate(
        Requirement requirement,
        ISet<string> usedCodes,
        ref int nextSequence)
    {
        var cases = new List<TestCase>
        {
            BuildPositiveCase(requirement, usedCodes, ref nextSequence),
            BuildNegativeCase(requirement, usedCodes, ref nextSequence)
        };

        if (requirement.Priority is Priority.High or Priority.Critical)
            cases.Add(BuildBoundaryCase(requirement, usedCodes, ref nextSequence));

        return cases;
    }

    private static TestCase BuildPositiveCase(Requirement requirement, ISet<string> usedCodes, ref int nextSequence)
    {
        var steps = BuildStepsFromDescription(requirement);
        return new TestCase
        {
            Code = TestCaseCodeAllocator.AllocateNext(usedCodes, ref nextSequence),
            Title = Loc.T("TcGen_PositiveTitle", requirement.Title),
            Preconditions = Loc.T("TcGen_Preconditions"),
            ExpectedResult = string.IsNullOrWhiteSpace(requirement.Description)
                ? Loc.T("TcGen_DefaultExpected", requirement.Title)
                : requirement.Description,
            Steps = steps
        };
    }

    private static TestCase BuildNegativeCase(Requirement requirement, ISet<string> usedCodes, ref int nextSequence)
    {
        return new TestCase
        {
            Code = TestCaseCodeAllocator.AllocateNext(usedCodes, ref nextSequence),
            Title = Loc.T("TcGen_NegativeTitle", requirement.Title),
            Preconditions = Loc.T("TcGen_Preconditions"),
            ExpectedResult = Loc.T("TcGen_NegativeExpected"),
            Steps = new List<TestStep>
            {
                new()
                {
                    Order = 1,
                    Action = Loc.T("TcGen_NegativeStepAction", requirement.Title),
                    ExpectedOutcome = Loc.T("TcGen_NegativeStepOutcome")
                }
            }
        };
    }

    private static TestCase BuildBoundaryCase(Requirement requirement, ISet<string> usedCodes, ref int nextSequence)
    {
        return new TestCase
        {
            Code = TestCaseCodeAllocator.AllocateNext(usedCodes, ref nextSequence),
            Title = Loc.T("TcGen_BoundaryTitle", requirement.Title),
            Preconditions = Loc.T("TcGen_Preconditions"),
            ExpectedResult = Loc.T("TcGen_BoundaryExpected"),
            Steps = new List<TestStep>
            {
                new()
                {
                    Order = 1,
                    Action = Loc.T("TcGen_BoundaryStepAction", requirement.Title),
                    ExpectedOutcome = Loc.T("TcGen_BoundaryStepOutcome")
                }
            }
        };
    }

    private static List<TestStep> BuildStepsFromDescription(Requirement requirement)
    {
        var steps = new List<TestStep>();

        if (!string.IsNullOrWhiteSpace(requirement.Description))
        {
            var sentences = requirement.Description
                .Split(new[] { '.', '\n', ';', '。' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(s => s.Length > 0)
                .Take(4)
                .ToList();

            var order = 1;
            foreach (var sentence in sentences)
                steps.Add(new TestStep { Order = order++, Action = sentence, ExpectedOutcome = Loc.T("TcGen_StepExpected") });
        }

        if (steps.Count == 0)
        {
            steps.Add(new TestStep
            {
                Order = 1,
                Action = Loc.T("TcGen_FallbackStepAction", requirement.Title),
                ExpectedOutcome = Loc.T("TcGen_FallbackStepOutcome")
            });
        }

        return steps;
    }
}

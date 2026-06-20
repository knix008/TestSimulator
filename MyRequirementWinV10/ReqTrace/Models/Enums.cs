namespace ReqTrace.Models;

public enum Priority
{
    Low,
    Medium,
    High,
    Critical
}

public enum RequirementStatus
{
    Draft,
    Approved,
    InProgress,
    Implemented,
    Deprecated
}

public enum TestRunStatus
{
    NotRun,
    Pass,
    Fail,
    Blocked
}

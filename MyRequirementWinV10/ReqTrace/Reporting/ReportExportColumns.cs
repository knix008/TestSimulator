using ReqTrace.Localization;

namespace ReqTrace.Reporting;

internal static class ReportExportColumns
{
    public static readonly string[] RequirementHeaderKeys =
    [
        "Col_Code",
        "Col_Category",
        "Col_Title",
        "Col_Description",
        "Col_Priority",
        "Col_RequirementStatus",
        "Col_TestStatus",
        "Col_Source",
        "Col_Parent"
    ];

    public static readonly string[] TestCaseHeaderKeys =
    [
        "Col_RequirementCode",
        "Col_TestCaseCode",
        "Col_TestCaseTitle",
        "Col_Preconditions",
        "Col_Steps",
        "Col_StepsDetail",
        "Col_ExpectedResult",
        "Col_LatestStatus",
        "Col_LastRun",
        "Col_LastRunBy"
    ];

    public static readonly string[] TraceabilityHeaderKeys =
    [
        "Col_Code",
        "Col_Category",
        "Col_Title",
        "Col_Description",
        "Col_Priority",
        "Col_RequirementStatus",
        "Col_TestStatus",
        "Col_Source",
        "Col_Parent",
        "Col_TestCaseCode",
        "Col_TestCaseTitle",
        "Col_Preconditions",
        "Col_Steps",
        "Col_StepsDetail",
        "Col_ExpectedResult",
        "Col_LatestStatus",
        "Col_LastRun",
        "Col_LastRunBy"
    ];

    public static readonly string[] TestCaseStepHeaderKeys =
    [
        "Col_RequirementCode",
        "Col_TestCaseCode",
        "Col_StepOrder",
        "Col_Action",
        "Col_ExpectedOutcome"
    ];

    public static string[] RequirementHeaders() => RequirementHeaderKeys.Select(Loc.T).ToArray();

    public static string[] TestCaseHeaders() => TestCaseHeaderKeys.Select(Loc.T).ToArray();

    public static string[] TraceabilityHeaders() => TraceabilityHeaderKeys.Select(Loc.T).ToArray();

    public static string[] TestCaseStepHeaders() => TestCaseStepHeaderKeys.Select(Loc.T).ToArray();

    public static string[] RequirementValues(RequirementListRow row) =>
    [
        row.Code,
        row.Category,
        row.Title,
        row.Description,
        row.Priority,
        row.RequirementStatus,
        row.TestStatus,
        row.Source,
        row.ParentCode
    ];

    public static string[] TestCaseValues(TestCaseReportRow row) =>
    [
        row.RequirementCode,
        row.Code,
        row.Title,
        row.Preconditions,
        row.Steps,
        row.StepsDetail,
        row.ExpectedResult,
        row.LatestStatus,
        row.LastRun,
        row.LastRunBy
    ];

    public static string[] TraceabilityValues(TraceabilityMatrixRow row) =>
    [
        row.RequirementCode,
        row.Category,
        row.RequirementTitle,
        row.Description,
        row.Priority,
        row.RequirementStatus,
        row.RequirementTestStatus,
        row.Source,
        row.ParentCode,
        row.TestCaseCode,
        row.TestCaseTitle,
        row.Preconditions,
        row.Steps,
        row.StepsDetail,
        row.ExpectedResult,
        row.LatestStatus,
        row.LastRun,
        row.LastRunBy
    ];

    public static string[] TestCaseStepValues(TestCaseStepRow row) =>
    [
        row.RequirementCode,
        row.TestCaseCode,
        row.StepOrder.ToString(),
        row.Action,
        row.ExpectedOutcome
    ];
}

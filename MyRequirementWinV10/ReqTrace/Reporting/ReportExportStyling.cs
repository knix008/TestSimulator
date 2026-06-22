using ClosedXML.Excel;
using QuestPDF.Helpers;
using ReqTrace.Models;

namespace ReqTrace.Reporting;

internal static class ReportExportStyling
{
    public static XLColor ToExcelColor(TestRunStatus status) => status switch
    {
        TestRunStatus.Pass => XLColor.LightGreen,
        TestRunStatus.Fail => XLColor.LightPink,
        TestRunStatus.Blocked => XLColor.LightYellow,
        _ => XLColor.White
    };

    public static string ToPdfColor(TestRunStatus status) => status switch
    {
        TestRunStatus.Pass => Colors.Green.Lighten4,
        TestRunStatus.Fail => Colors.Red.Lighten4,
        TestRunStatus.Blocked => Colors.Orange.Lighten4,
        _ => Colors.White
    };
}

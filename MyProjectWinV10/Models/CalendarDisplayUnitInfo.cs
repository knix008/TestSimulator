namespace MyProject.Models
{
    public static class CalendarDisplayUnitInfo
    {
        public static string GetDisplayName(CalendarDisplayUnit unit) => unit switch
        {
            CalendarDisplayUnit.Week => "Weekly",
            CalendarDisplayUnit.Month => "Monthly",
            CalendarDisplayUnit.Year => "Yearly",
            _ => unit.ToString()
        };
    }
}

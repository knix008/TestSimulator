namespace MyProject.Models
{
    public static class CalendarDisplayUnitInfo
    {
        public static string GetDisplayName(CalendarDisplayUnit unit) => unit switch
        {
            CalendarDisplayUnit.Week => "Week",
            CalendarDisplayUnit.Month => "Month",
            CalendarDisplayUnit.Year => "Year",
            _ => unit.ToString()
        };
    }
}

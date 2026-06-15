namespace MyProject.Models
{
    public static class WorkingDayCalendar
    {
        public static int CountWorkingDaysBefore(DateTime origin, DateTime date, WorkingWeekSchedule schedule)
        {
            int count = 0;
            for (var d = origin.Date; d < date.Date; d = d.AddDays(1))
            {
                if (schedule.IsWorkingDay(d))
                    count++;
            }

            return count;
        }

        public static int CountWorkingDaysInclusive(DateTime from, DateTime to, WorkingWeekSchedule schedule)
        {
            if (to < from)
                (from, to) = (to, from);

            int count = 0;
            for (var d = from.Date; d <= to.Date; d = d.AddDays(1))
            {
                if (schedule.IsWorkingDay(d))
                    count++;
            }

            return count;
        }

        public static DateTime DateAtWorkingColumn(DateTime origin, int column, WorkingWeekSchedule schedule)
        {
            if (column < 0)
                return AddWorkingDays(origin, column, schedule);

            var d = origin.Date;
            int col = 0;
            while (true)
            {
                if (schedule.IsWorkingDay(d))
                {
                    if (col == column)
                        return d;
                    col++;
                }

                d = d.AddDays(1);
            }
        }

        public static DateTime AddWorkingDays(DateTime start, int workingDays, WorkingWeekSchedule schedule)
        {
            if (workingDays == 0)
                return start.Date;

            int remaining = Math.Abs(workingDays);
            int step = workingDays > 0 ? 1 : -1;
            var d = start.Date;

            while (remaining > 0)
            {
                d = d.AddDays(step);
                if (schedule.IsWorkingDay(d))
                    remaining--;
            }

            return d;
        }

        public static DateTime GetTaskEndDate(DateTime startDate, int durationDays, WorkingWeekSchedule schedule)
        {
            if (durationDays <= 0)
                return startDate.Date;

            return AddWorkingDays(startDate, durationDays - 1, schedule);
        }

        public static DateTime CalendarEndForWorkingColumns(
            DateTime origin,
            int columnCount,
            WorkingWeekSchedule schedule)
        {
            if (columnCount <= 0)
                return origin.Date;

            return DateAtWorkingColumn(origin, columnCount - 1, schedule);
        }

        public static DateTime SnapToNextWorkingDay(DateTime date, WorkingWeekSchedule schedule)
        {
            var d = date.Date;
            while (!schedule.IsWorkingDay(d))
                d = d.AddDays(1);
            return d;
        }

        public static DateTime SnapToPreviousWorkingDay(DateTime date, WorkingWeekSchedule schedule)
        {
            var d = date.Date;
            while (!schedule.IsWorkingDay(d))
                d = d.AddDays(-1);
            return d;
        }
    }
}

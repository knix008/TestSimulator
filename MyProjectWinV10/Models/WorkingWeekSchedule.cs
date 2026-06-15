namespace MyProject.Models
{
    /// <summary>Which weekdays count as working days (true = working).</summary>
    public sealed class WorkingWeekSchedule : IEquatable<WorkingWeekSchedule>
    {
        private readonly bool[] _days = new bool[7];

        public WorkingWeekSchedule()
        {
            for (int i = 0; i < 7; i++)
                _days[i] = i is >= (int)DayOfWeek.Monday and <= (int)DayOfWeek.Friday;
        }

        public bool IsWorkingDay(DayOfWeek dayOfWeek) => _days[(int)dayOfWeek];

        public bool IsWorkingDay(DateTime date) => IsWorkingDay(date.DayOfWeek);

        public void SetWorkingDay(DayOfWeek dayOfWeek, bool isWorking) =>
            _days[(int)dayOfWeek] = isWorking;

        public bool UsesCompressedTimeline
        {
            get
            {
                for (int i = 0; i < 7; i++)
                {
                    if (!_days[i])
                        return true;
                }

                return false;
            }
        }

        public bool[] ToDayFlags()
        {
            var copy = new bool[7];
            Array.Copy(_days, copy, 7);
            return copy;
        }

        public static WorkingWeekSchedule FromDayFlags(IReadOnlyList<bool>? flags)
        {
            var schedule = new WorkingWeekSchedule();
            if (flags == null || flags.Count < 7)
                return schedule;

            for (int i = 0; i < 7; i++)
                schedule._days[i] = flags[i];

            return schedule;
        }

        public bool Equals(WorkingWeekSchedule? other)
        {
            if (other is null)
                return false;

            for (int i = 0; i < 7; i++)
            {
                if (_days[i] != other._days[i])
                    return false;
            }

            return true;
        }

        public override bool Equals(object? obj) => Equals(obj as WorkingWeekSchedule);

        public override int GetHashCode()
        {
            int hash = 17;
            for (int i = 0; i < 7; i++)
                hash = hash * 31 + (_days[i] ? 1 : 0);
            return hash;
        }
    }
}

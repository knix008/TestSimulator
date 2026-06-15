namespace MyProject.Models
{
    public static class TaskTypeInfo
    {
        public static string GetDisplayName(TaskType type) => type switch
        {
            TaskType.Normal => "Normal",
            TaskType.Summary => "Summary",
            TaskType.Milestone => "Milestone",
            _ => type.ToString()
        };

        public static string GetDescription(TaskType type) => type switch
        {
            TaskType.Normal => "Standard task with a duration and progress bar",
            TaskType.Milestone => "Zero-duration marker displayed on a single date",
            TaskType.Summary => "Rolls up start, end, and progress from child tasks",
            _ => ""
        };

        public static string GetTooltipText(TaskType type)
        {
            string description = GetDescription(type);
            return string.IsNullOrEmpty(description)
                ? GetDisplayName(type)
                : $"{GetDisplayName(type)}\n{description}";
        }
    }
}

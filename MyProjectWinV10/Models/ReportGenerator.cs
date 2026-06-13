using System.Text;

namespace MyProject.Models
{
    public static class ReportGenerator
    {
        public static string GenerateMarkdown(ProjectModel model)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"# {model.ProjectName}");
            sb.AppendLine();
            sb.AppendLine($"**Generated:** {DateTime.Now:yyyy-MM-dd HH:mm}  ");
            sb.AppendLine($"**Total Tasks:** {model.Tasks.Count}  ");
            sb.AppendLine($"**Project Start:** {model.ProjectStart:yyyy-MM-dd}  ");
            sb.AppendLine($"**Project End:** {model.GetProjectEnd():yyyy-MM-dd}");
            sb.AppendLine();

            // Overall progress
            double overallProgress = model.Tasks.Any()
                ? model.Tasks.Average(t => t.Progress)
                : 0;
            sb.AppendLine($"**Overall Progress:** {overallProgress:0.0}%");
            sb.AppendLine();

            // Task table
            sb.AppendLine("## Task Schedule");
            sb.AppendLine();
            sb.AppendLine("| # | Task | Start | End | Days | Progress | Assignee | Deliverable |");
            sb.AppendLine("|---|------|-------|-----|------|----------|----------|-------------|");

            foreach (var task in model.Tasks)
            {
                string indent = new string(' ', task.IndentLevel * 2);
                string type = task.TaskType == TaskType.Milestone ? "🔷"
                            : task.TaskType == TaskType.Summary ? "📁"
                            : "▶";
                string progress = $"{task.Progress:0}%";
                string bar = MakeProgressBar(task.Progress, 10);
                string assignees = string.Join(", ", model.GetAssignments(task.Id).Select(a => $"{a.ResourceName} ({a.AllocationPercent:0}%)"));
                if (string.IsNullOrEmpty(assignees)) assignees = task.AssignedTo;

                sb.AppendLine(
                    $"| {task.Id} " +
                    $"| {indent}{type} {EscapeMd(task.Name)} " +
                    $"| {task.StartDate:MM/dd/yy} " +
                    $"| {task.EndDate:MM/dd/yy} " +
                    $"| {task.DurationDays} " +
                    $"| {bar} {progress} " +
                    $"| {EscapeMd(assignees)} " +
                    $"| {EscapeMd(task.Deliverable)} |");
            }

            sb.AppendLine();

            // Dependencies
            if (model.Dependencies.Any())
            {
                sb.AppendLine("## Dependencies");
                sb.AppendLine();
                sb.AppendLine("| Predecessor | Successor | Type | Lag |");
                sb.AppendLine("|-------------|-----------|------|-----|");
                foreach (var dep in model.Dependencies)
                {
                    var pred = model.GetTask(dep.PredecessorId);
                    var succ = model.GetTask(dep.SuccessorId);
                    if (pred == null || succ == null) continue;
                    sb.AppendLine($"| {pred.Name} | {succ.Name} | {dep.Type} | {dep.LagDays}d |");
                }
                sb.AppendLine();
            }

            // Critical tasks
            var criticalTasks = model.Tasks.Where(t => t.IsCritical).ToList();
            if (criticalTasks.Any())
            {
                sb.AppendLine("## Critical Path Tasks");
                sb.AppendLine();
                foreach (var t in criticalTasks)
                    sb.AppendLine($"- **{t.Name}** ({t.StartDate:MM/dd/yy} → {t.EndDate:MM/dd/yy})");
                sb.AppendLine();
            }

            // In-progress tasks
            var inProgress = model.Tasks.Where(t => t.Progress > 0 && t.Progress < 100).OrderByDescending(t => t.Progress).ToList();
            if (inProgress.Any())
            {
                sb.AppendLine("## In-Progress Tasks");
                sb.AppendLine();
                foreach (var t in inProgress)
                    sb.AppendLine($"- {t.Name}: {t.Progress:0}% complete");
                sb.AppendLine();
            }

            // Completed tasks
            var completed = model.Tasks.Where(t => t.Progress >= 100).ToList();
            sb.AppendLine($"## Summary");
            sb.AppendLine();
            sb.AppendLine($"- ✅ Completed: {completed.Count}");
            sb.AppendLine($"- 🔄 In Progress: {inProgress.Count}");
            sb.AppendLine($"- ⏳ Not Started: {model.Tasks.Count(t => t.Progress == 0)}");

            return sb.ToString();
        }

        private static string MakeProgressBar(double progress, int width)
        {
            int filled = (int)(progress / 100.0 * width);
            return "`" + new string('█', filled) + new string('░', width - filled) + "`";
        }

        private static string EscapeMd(string? s) =>
            (s ?? "").Replace("|", "\\|").Replace("\n", " ").Replace("\r", "");
    }
}

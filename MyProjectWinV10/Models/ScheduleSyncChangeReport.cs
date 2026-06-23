using System.Text;
using static MyProject.Models.ProjectFile;

namespace MyProject.Models
{
    public sealed class ScheduleSyncChangeReport
    {
        private readonly List<string> _lines = new();

        public IReadOnlyList<string> Lines => _lines;
        public bool HasChanges => _lines.Count > 0;

        public void Add(string line)
        {
            if (!string.IsNullOrWhiteSpace(line))
                _lines.Add(line);
        }

        public string FormatDetails(int maxLines = 30)
        {
            if (_lines.Count == 0)
                return "No individual field-level changes were detected.";

            var sb = new StringBuilder();
            int shown = Math.Min(_lines.Count, maxLines);
            for (int i = 0; i < shown; i++)
                sb.AppendLine(_lines[i]);

            if (_lines.Count > maxLines)
                sb.AppendLine($"... and {_lines.Count - maxLines} more change(s).");

            return sb.ToString().TrimEnd();
        }
    }

    internal static class ScheduleSyncChangeAnalyzer
    {
        internal static ScheduleSyncChangeReport Analyze(ProjectFileData before, ProjectFileData after)
        {
            var report = new ScheduleSyncChangeReport();
            AnalyzeTasks(before.Tasks, after.Tasks, report);
            AnalyzeDependencies(before.Dependencies, after.Dependencies, report);
            AnalyzeAssignments(before.Assignments, after.Assignments, report);
            AnalyzeNotes(before.Notes, after.Notes, report);
            return report;
        }

        private static void AnalyzeTasks(
            List<TaskData> before,
            List<TaskData> after,
            ScheduleSyncChangeReport report)
        {
            var beforeById = before.ToDictionary(t => t.Id);
            var afterById = after.ToDictionary(t => t.Id);

            foreach (var task in after)
            {
                if (!beforeById.ContainsKey(task.Id))
                    report.Add($"Task added: [{task.Id}] \"{task.Name}\"");
            }

            foreach (var task in before)
            {
                if (!afterById.ContainsKey(task.Id))
                    report.Add($"Task removed: [{task.Id}] \"{task.Name}\"");
            }

            foreach (var task in after)
            {
                if (!beforeById.TryGetValue(task.Id, out var old))
                    continue;

                CompareTask(old, task, report);
            }
        }

        private static void CompareTask(TaskData old, TaskData task, ScheduleSyncChangeReport report)
        {
            string label = $"[{task.Id}] \"{task.Name}\"";

            if (!string.Equals(old.Name, task.Name, StringComparison.Ordinal))
                report.Add($"Task {label}: name \"{old.Name}\" -> \"{task.Name}\"");

            if (old.StartDate.Date != task.StartDate.Date)
                report.Add($"Task {label}: start {old.StartDate:yyyy-MM-dd} -> {task.StartDate:yyyy-MM-dd}");

            if (old.DurationDays != task.DurationDays)
                report.Add($"Task {label}: duration {old.DurationDays}d -> {task.DurationDays}d");

            if (Math.Abs(old.Progress - task.Progress) > 0.01)
                report.Add($"Task {label}: progress {old.Progress:0}% -> {task.Progress:0}%");

            if (!string.Equals(old.TaskType, task.TaskType, StringComparison.Ordinal))
                report.Add($"Task {label}: type {old.TaskType} -> {task.TaskType}");

            if (old.ParentId != task.ParentId)
                report.Add($"Task {label}: parent {FormatParent(old.ParentId)} -> {FormatParent(task.ParentId)}");

            if (old.IndentLevel != task.IndentLevel)
                report.Add($"Task {label}: indent {old.IndentLevel} -> {task.IndentLevel}");

            if (!string.Equals(old.Deliverable ?? "", task.Deliverable ?? "", StringComparison.Ordinal))
                report.Add($"Task {label}: deliverable updated");

            if (!string.Equals(old.AssignedTo ?? "", task.AssignedTo ?? "", StringComparison.Ordinal))
                report.Add($"Task {label}: assigned resources updated");

            if (!string.Equals(old.Notes ?? "", task.Notes ?? "", StringComparison.Ordinal))
                report.Add($"Task {label}: notes updated");
        }

        private static string FormatParent(int parentId) =>
            parentId < 0 ? "(none)" : $"#{parentId}";

        private static void AnalyzeDependencies(
            List<DependencyData> before,
            List<DependencyData> after,
            ScheduleSyncChangeReport report)
        {
            var beforeKeys = ToDependencyKeys(before);
            var afterKeys = ToDependencyKeys(after);

            foreach (var dep in after)
            {
                if (!beforeKeys.Contains(DependencyKey(dep)))
                    report.Add($"Dependency added: {dep.PredecessorId} -> {dep.SuccessorId} ({dep.Type})");
            }

            foreach (var dep in before)
            {
                if (!afterKeys.Contains(DependencyKey(dep)))
                    report.Add($"Dependency removed: {dep.PredecessorId} -> {dep.SuccessorId} ({dep.Type})");
            }

            foreach (var dep in after)
            {
                var old = before.FirstOrDefault(d =>
                    d.PredecessorId == dep.PredecessorId && d.SuccessorId == dep.SuccessorId);
                if (old == null)
                    continue;

                if (old.LagDays != dep.LagDays
                    || !string.Equals(old.Type, dep.Type, StringComparison.Ordinal))
                {
                    report.Add(
                        $"Dependency changed: {dep.PredecessorId} -> {dep.SuccessorId} " +
                        $"({old.Type}, lag {old.LagDays}d) -> ({dep.Type}, lag {dep.LagDays}d)");
                }
            }
        }

        private static HashSet<string> ToDependencyKeys(IEnumerable<DependencyData> deps) =>
            deps.Select(DependencyKey).ToHashSet(StringComparer.Ordinal);

        private static string DependencyKey(DependencyData dep) =>
            $"{dep.PredecessorId}:{dep.SuccessorId}";

        private static void AnalyzeAssignments(
            List<AssignmentData> before,
            List<AssignmentData> after,
            ScheduleSyncChangeReport report)
        {
            var beforeKeys = ToAssignmentKeys(before);
            var afterKeys = ToAssignmentKeys(after);

            foreach (var assignment in after)
            {
                if (!beforeKeys.Contains(AssignmentKey(assignment)))
                {
                    report.Add(
                        $"Resource added: task {assignment.TaskId}, " +
                        $"\"{assignment.ResourceName}\" ({assignment.AllocationPercent:0}%)");
                }
            }

            foreach (var assignment in before)
            {
                if (!afterKeys.Contains(AssignmentKey(assignment)))
                {
                    report.Add(
                        $"Resource removed: task {assignment.TaskId}, " +
                        $"\"{assignment.ResourceName}\" ({assignment.AllocationPercent:0}%)");
                }
            }

            foreach (var assignment in after)
            {
                var old = before.FirstOrDefault(a =>
                    a.TaskId == assignment.TaskId
                    && string.Equals(a.ResourceName, assignment.ResourceName, StringComparison.Ordinal));
                if (old == null)
                    continue;

                if (Math.Abs(old.AllocationPercent - assignment.AllocationPercent) > 0.01)
                {
                    report.Add(
                        $"Resource allocation changed: task {assignment.TaskId}, " +
                        $"\"{assignment.ResourceName}\" {old.AllocationPercent:0}% -> {assignment.AllocationPercent:0}%");
                }
            }
        }

        private static HashSet<string> ToAssignmentKeys(IEnumerable<AssignmentData> assignments) =>
            assignments.Select(AssignmentKey).ToHashSet(StringComparer.Ordinal);

        private static string AssignmentKey(AssignmentData assignment) =>
            $"{assignment.TaskId}:{assignment.ResourceName}";

        private static void AnalyzeNotes(
            List<NoteData> before,
            List<NoteData> after,
            ScheduleSyncChangeReport report)
        {
            var beforeById = before.ToDictionary(n => n.Id);
            var afterById = after.ToDictionary(n => n.Id);

            foreach (var note in after)
            {
                if (!beforeById.ContainsKey(note.Id))
                    report.Add($"Note added: [{note.Id}] \"{note.Title}\"");
            }

            foreach (var note in before)
            {
                if (!afterById.ContainsKey(note.Id))
                    report.Add($"Note removed: [{note.Id}] \"{note.Title}\"");
            }

            foreach (var note in after)
            {
                if (!beforeById.TryGetValue(note.Id, out var old))
                    continue;

                string label = $"[{note.Id}] \"{note.Title}\"";
                bool changed = false;

                if (!string.Equals(old.Title, note.Title, StringComparison.Ordinal))
                {
                    report.Add($"Note {label}: title \"{old.Title}\" -> \"{note.Title}\"");
                    changed = true;
                }

                if (old.TaskId != note.TaskId)
                {
                    report.Add($"Note {label}: linked task {FormatParent(old.TaskId)} -> {FormatParent(note.TaskId)}");
                    changed = true;
                }

                if (old.AnchorDate.Date != note.AnchorDate.Date
                    || old.ContentX != note.ContentX
                    || old.ContentY != note.ContentY)
                {
                    report.Add($"Note {label}: position updated");
                    changed = true;
                }

                if (!string.Equals(old.Body ?? "", note.Body ?? "", StringComparison.Ordinal)
                    || !string.Equals(old.BodyRtf ?? "", note.BodyRtf ?? "", StringComparison.Ordinal))
                {
                    if (!changed)
                        report.Add($"Note {label}: content updated");
                }
            }
        }
    }
}

using System.Text;

namespace MyProject.Models
{
    /// <summary>Shared project report facts and row builders for HTML, PDF, Word, and Markdown exports.</summary>
    internal static class ProjectReportContent
    {
        public static double OverallProgress(ProjectModel model) =>
            model.Tasks.Count > 0 ? model.Tasks.Average(t => t.Progress) : 0;

        public static string TaskIndent(ProjectTask task) =>
            new string(' ', task.IndentLevel * 2);

        public static string TaskTypeLabel(ProjectTask task) =>
            task.TaskType == TaskType.Milestone ? "Milestone"
            : task.TaskType == TaskType.Summary ? "Summary"
            : "Task";

        public static string EscapeHtml(string? text)
        {
            if (string.IsNullOrEmpty(text))
                return "";

            var sb = new StringBuilder(text.Length);
            foreach (char c in text)
            {
                switch (c)
                {
                    case '&': sb.Append("&amp;"); break;
                    case '<': sb.Append("&lt;"); break;
                    case '>': sb.Append("&gt;"); break;
                    case '"': sb.Append("&quot;"); break;
                    case '\'': sb.Append("&#39;"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.ToString();
        }

        public static string EscapeMd(string? s) =>
            (s ?? "").Replace("|", "\\|").Replace("\n", " ").Replace("\r", "");

        public static string NoteTitle(ProjectNote note)
        {
            if (!string.IsNullOrWhiteSpace(note.Title))
                return note.Title.Trim();

            string body = note.Body.Replace('\r', ' ').Replace('\n', ' ').Trim();
            if (string.IsNullOrWhiteSpace(body))
                return "Note";

            return body.Length > 60 ? body[..60] + "…" : body;
        }

        public static string LinkedTaskName(ProjectModel model, ProjectNote note)
        {
            if (note.TaskId < 0)
                return "";

            var task = model.GetTask(note.TaskId);
            return task?.Name ?? "";
        }

        public static string ProgressBarText(double progress, int width = 10)
        {
            int filled = (int)(progress / 100.0 * width);
            return new string('█', filled) + new string('░', width - filled);
        }
    }
}

using MyProject.Rendering;
using System.Text;

namespace MyProject.Models
{
    public static class HtmlReportGenerator
    {
        private const string NoteBackground = "#fffcdc";
        private const string NoteBorder = "#727272";
        private const string HeaderBackground = "#dce8fc";
        private const string CriticalColor = "#c00000";

        public static void Export(ProjectModel model, string path)
        {
            var html = Generate(model);
            File.WriteAllText(path, html, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        }

        public static string Generate(ProjectModel model)
        {
            var sb = new StringBuilder();
            double overallProgress = ProjectReportContent.OverallProgress(model);

            sb.AppendLine("<!DOCTYPE html>");
            sb.AppendLine("<html lang=\"en\">");
            sb.AppendLine("<head>");
            sb.AppendLine("<meta charset=\"utf-8\"/>");
            sb.AppendLine($"<title>{ProjectReportContent.EscapeHtml(model.ProjectName)} — Project Report</title>");
            sb.AppendLine("<style>");
            sb.AppendLine(Css);
            sb.AppendLine("</style>");
            sb.AppendLine("</head>");
            sb.AppendLine("<body>");

            sb.AppendLine($"<h1>{ProjectReportContent.EscapeHtml(model.ProjectName)}</h1>");
            sb.AppendLine($"<p class=\"meta\">Generated: {DateTime.Now:yyyy-MM-dd HH:mm}</p>");

            WriteSummary(sb, model, overallProgress);
            WriteTaskSchedule(sb, model);
            WriteNotes(sb, model);
            WriteDependencies(sb, model);
            WriteResources(sb, model);

            sb.AppendLine("</body>");
            sb.AppendLine("</html>");
            return sb.ToString();
        }

        private static void WriteSummary(StringBuilder sb, ProjectModel model, double overallProgress)
        {
            sb.AppendLine("<h2>Summary</h2>");
            sb.AppendLine("<table class=\"summary\">");
            AppendSummaryRow(sb, "Project Start", model.ProjectStart.ToString("yyyy-MM-dd"));
            AppendSummaryRow(sb, "Project End", model.GetProjectEnd().ToString("yyyy-MM-dd"));
            AppendSummaryRow(sb, "Total Tasks", model.Tasks.Count.ToString());
            AppendSummaryRow(sb, "Overall Progress", $"{overallProgress:0.0}%");
            AppendSummaryRow(sb, "Completed Tasks", model.Tasks.Count(t => t.Progress >= 100).ToString());
            AppendSummaryRow(sb, "In-Progress Tasks", model.Tasks.Count(t => t.Progress > 0 && t.Progress < 100).ToString());
            AppendSummaryRow(sb, "Not Started Tasks", model.Tasks.Count(t => t.Progress == 0).ToString());
            AppendSummaryRow(sb, "Critical Tasks", model.Tasks.Count(t => t.IsCritical).ToString());
            AppendSummaryRow(sb, "Dependencies", model.Dependencies.Count.ToString());
            AppendSummaryRow(sb, "Resource Assignments", model.Assignments.Count().ToString());
            AppendSummaryRow(sb, "Notes", model.Notes.Count.ToString());
            sb.AppendLine("</table>");
        }

        private static void AppendSummaryRow(StringBuilder sb, string label, string value)
        {
            sb.AppendLine("<tr><th>");
            sb.Append(ProjectReportContent.EscapeHtml(label));
            sb.AppendLine("</th><td>");
            sb.Append(ProjectReportContent.EscapeHtml(value));
            sb.AppendLine("</td></tr>");
        }

        private static void WriteTaskSchedule(StringBuilder sb, ProjectModel model)
        {
            sb.AppendLine("<h2>Task Schedule</h2>");
            sb.AppendLine("<table>");
            sb.AppendLine("<thead><tr>");
            foreach (var header in new[] { "ID", "Task", "Type", "Start", "End", "Days", "Progress", "Assigned To", "Deliverable", "Task Notes" })
                sb.AppendLine($"<th>{header}</th>");
            sb.AppendLine("</tr></thead><tbody>");

            foreach (var task in model.Tasks)
            {
                string rowClass = task.TaskType == TaskType.Summary ? "summary-row" : "";
                if (task.IsCritical)
                    rowClass = string.IsNullOrEmpty(rowClass) ? "critical-row" : rowClass + " critical-row";

                sb.AppendLine($"<tr class=\"{rowClass}\">");
                sb.AppendLine($"<td>{task.Id}</td>");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(ProjectReportContent.TaskIndent(task) + task.Name)}</td>");
                sb.AppendLine($"<td>{ProjectReportContent.TaskTypeLabel(task)}</td>");
                sb.AppendLine($"<td>{task.StartDate:yyyy-MM-dd}</td>");
                sb.AppendLine($"<td>{task.EndDate:yyyy-MM-dd}</td>");
                sb.AppendLine($"<td>{task.DurationDays}</td>");
                sb.AppendLine($"<td><div class=\"progress\" title=\"{task.Progress:0}%\"><div class=\"progress-bar\" style=\"width:{task.Progress:0}%\"></div></div> {task.Progress:0}%</td>");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(model.GetTaskAssigneeDisplay(task.Id))}</td>");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(task.Deliverable)}</td>");
                sb.AppendLine($"<td class=\"notes-cell\">{ProjectReportContent.EscapeHtml(task.Notes)}</td>");
                sb.AppendLine("</tr>");
            }

            sb.AppendLine("</tbody></table>");
        }

        private static void WriteNotes(StringBuilder sb, ProjectModel model)
        {
            sb.AppendLine("<h2>Notes</h2>");
            if (model.Notes.Count == 0)
            {
                sb.AppendLine("<p class=\"empty\">No notes in this project.</p>");
                return;
            }

            foreach (var note in model.Notes.OrderBy(n => n.Id))
            {
                string linked = ProjectReportContent.LinkedTaskName(model, note);
                sb.AppendLine("<div class=\"note-card\">");
                sb.AppendLine($"<div class=\"note-title\">{ProjectReportContent.EscapeHtml(ProjectReportContent.NoteTitle(note))}</div>");
                if (!string.IsNullOrEmpty(linked))
                    sb.AppendLine($"<div class=\"note-meta\">Linked task: {ProjectReportContent.EscapeHtml(linked)} (ID {note.TaskId})</div>");
                sb.AppendLine($"<div class=\"note-meta\">Anchor date: {note.AnchorDate:yyyy-MM-dd}</div>");
                sb.AppendLine($"<div class=\"note-body\">{NoteRtfHelper.ToSimpleHtml(note.BodyRtf, note.Body)}</div>");
                sb.AppendLine("</div>");
            }
        }

        private static void WriteDependencies(StringBuilder sb, ProjectModel model)
        {
            sb.AppendLine("<h2>Dependencies</h2>");
            if (model.Dependencies.Count == 0)
            {
                sb.AppendLine("<p class=\"empty\">No dependencies defined.</p>");
                return;
            }

            sb.AppendLine("<table>");
            sb.AppendLine("<thead><tr><th>Predecessor</th><th>Successor</th><th>Type</th><th>Lag (Days)</th><th>Critical Path</th></tr></thead><tbody>");
            foreach (var dep in model.Dependencies)
            {
                var pred = model.GetTask(dep.PredecessorId);
                var succ = model.GetTask(dep.SuccessorId);
                if (pred == null || succ == null)
                    continue;

                bool critical = model.IsDependencyOnCriticalPath(dep);
                string rowClass = critical ? "critical-row" : "";
                sb.AppendLine($"<tr class=\"{rowClass}\">");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(pred.Name)}</td>");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(succ.Name)}</td>");
                sb.AppendLine($"<td>{dep.Type}</td>");
                sb.AppendLine($"<td>{dep.LagDays}</td>");
                sb.AppendLine($"<td>{(critical ? "Yes" : "No")}</td>");
                sb.AppendLine("</tr>");
            }
            sb.AppendLine("</tbody></table>");
        }

        private static void WriteResources(StringBuilder sb, ProjectModel model)
        {
            sb.AppendLine("<h2>Resource Allocation</h2>");
            var rows = model.Assignments
                .OrderBy(a => a.TaskId)
                .ThenBy(a => a.ResourceName)
                .ToList();

            if (rows.Count == 0)
            {
                var fallback = model.Tasks.Where(t => !string.IsNullOrWhiteSpace(t.AssignedTo)).ToList();
                if (fallback.Count == 0)
                {
                    sb.AppendLine("<p class=\"empty\">No resource assignments.</p>");
                    return;
                }

                sb.AppendLine("<table>");
                sb.AppendLine("<thead><tr><th>Task</th><th>Resource</th><th>Allocation</th></tr></thead><tbody>");
                foreach (var task in fallback)
                {
                    sb.AppendLine("<tr>");
                    sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(task.Name)}</td>");
                    sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(task.AssignedTo)}</td>");
                    sb.AppendLine("<td>100%</td>");
                    sb.AppendLine("</tr>");
                }
                sb.AppendLine("</tbody></table>");
                return;
            }

            sb.AppendLine("<table>");
            sb.AppendLine("<thead><tr><th>Task</th><th>Resource</th><th>Allocation</th></tr></thead><tbody>");
            foreach (var assignment in rows)
            {
                var task = model.GetTask(assignment.TaskId);
                sb.AppendLine("<tr>");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(task?.Name ?? "")}</td>");
                sb.AppendLine($"<td>{ProjectReportContent.EscapeHtml(assignment.ResourceName)}</td>");
                sb.AppendLine($"<td>{assignment.AllocationPercent:0}%</td>");
                sb.AppendLine("</tr>");
            }
            sb.AppendLine("</tbody></table>");
        }

        private static string Css => $@"
body {{ font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #222; line-height: 1.4; }}
h1 {{ margin-bottom: 4px; }}
h2 {{ margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }}
.meta {{ color: #555; margin-bottom: 16px; }}
table {{ border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }}
th, td {{ border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }}
thead th {{ background: {HeaderBackground}; font-weight: 600; }}
.summary th {{ background: #f5f5f5; width: 220px; }}
.summary td {{ background: #fff; }}
.summary-row td {{ font-weight: 600; }}
.critical-row td {{ color: {CriticalColor}; font-weight: 600; }}
.notes-cell {{ max-width: 280px; white-space: pre-wrap; }}
.progress {{ display: inline-block; width: 80px; height: 10px; background: #e8e8e8; border: 1px solid #bbb; vertical-align: middle; }}
.progress-bar {{ height: 100%; background: #4a7fd4; }}
.note-card {{
  background: linear-gradient(180deg, rgb({NoteRenderer.GradientTop.R},{NoteRenderer.GradientTop.G},{NoteRenderer.GradientTop.B}) 0%, rgb({NoteRenderer.GradientBottom.R},{NoteRenderer.GradientBottom.G},{NoteRenderer.GradientBottom.B}) 100%);
  border: 1.5px solid {NoteBorder};
  border-left: 4px solid {NoteBorder};
  padding: 12px 14px;
  margin: 12px 0;
  max-width: 720px;
}}
.note-title {{ font-weight: 700; margin-bottom: 4px; }}
.note-meta {{ font-size: 12px; color: #555; margin-bottom: 2px; }}
.note-body {{ white-space: pre-wrap; margin-top: 8px; }}
.empty {{ color: #666; font-style: italic; }}
";
    }
}

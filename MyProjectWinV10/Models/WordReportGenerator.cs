using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace MyProject.Models
{
    public static class WordReportGenerator
    {
        private const string NoteFill = "FFFCDC";
        private const string HeaderFill = "DCE8FC";
        private const string CriticalColor = "C00000";

        public static void Export(ProjectModel model, string path)
        {
            using var doc = WordprocessingDocument.Create(path, WordprocessingDocumentType.Document);
            var mainPart = doc.AddMainDocumentPart();
            mainPart.Document = new Document(new Body());
            var body = mainPart.Document.Body!;

            body.AppendChild(MakeParagraph(model.ProjectName, bold: true, size: 28));
            body.AppendChild(MakeParagraph($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}", color: "555555"));
            body.AppendChild(MakeParagraph(""));

            WriteSummary(body, model);
            WriteTaskSchedule(body, model);
            WriteNotes(body, model);
            WriteDependencies(body, model);
            WriteResources(body, model);

            mainPart.Document.Save();
        }

        private static void WriteSummary(Body body, ProjectModel model)
        {
            body.AppendChild(MakeHeading("Summary"));
            double overall = ProjectReportContent.OverallProgress(model);
            var rows = new List<string[]>
            {
                new[] { "Project Start", model.ProjectStart.ToString("yyyy-MM-dd") },
                new[] { "Project End", model.GetProjectEnd().ToString("yyyy-MM-dd") },
                new[] { "Total Tasks", model.Tasks.Count.ToString() },
                new[] { "Overall Progress", $"{overall:0.0}%" },
                new[] { "Completed Tasks", model.Tasks.Count(t => t.Progress >= 100).ToString() },
                new[] { "In-Progress Tasks", model.Tasks.Count(t => t.Progress > 0 && t.Progress < 100).ToString() },
                new[] { "Not Started Tasks", model.Tasks.Count(t => t.Progress == 0).ToString() },
                new[] { "Critical Tasks", model.Tasks.Count(t => t.IsCritical).ToString() },
                new[] { "Dependencies", model.Dependencies.Count.ToString() },
                new[] { "Resource Assignments", model.Assignments.Count().ToString() },
                new[] { "Notes", model.Notes.Count.ToString() }
            };
            body.AppendChild(MakeKeyValueTable(rows));
            body.AppendChild(MakeParagraph(""));
        }

        private static void WriteTaskSchedule(Body body, ProjectModel model)
        {
            body.AppendChild(MakeHeading("Task Schedule"));
            string[] headers = { "ID", "Task", "Type", "Start", "End", "Days", "Progress", "Assigned To", "Deliverable", "Task Notes" };
            var rows = new List<string[]>();
            var criticalFlags = new List<bool>();
            foreach (var task in model.Tasks)
            {
                criticalFlags.Add(task.IsCritical);
                rows.Add(new[]
                {
                    task.Id.ToString(),
                    ProjectReportContent.TaskIndent(task) + task.Name,
                    ProjectReportContent.TaskTypeLabel(task),
                    task.StartDate.ToString("yyyy-MM-dd"),
                    task.EndDate.ToString("yyyy-MM-dd"),
                    task.DurationDays.ToString(),
                    $"{task.Progress:0}%",
                    model.GetTaskAssigneeDisplay(task.Id),
                    task.Deliverable ?? "",
                    task.Notes ?? ""
                });
            }
            body.AppendChild(MakeDataTable(headers, rows, i => criticalFlags[i]));
            body.AppendChild(MakeParagraph(""));
        }

        private static void WriteNotes(Body body, ProjectModel model)
        {
            body.AppendChild(MakeHeading("Notes"));
            if (model.Notes.Count == 0)
            {
                body.AppendChild(MakeParagraph("No notes in this project.", italic: true));
                body.AppendChild(MakeParagraph(""));
                return;
            }

            foreach (var note in model.Notes.OrderBy(n => n.Id))
            {
                body.AppendChild(BuildNoteTable(note, model));
                body.AppendChild(MakeParagraph(""));
            }
        }

        private static void WriteDependencies(Body body, ProjectModel model)
        {
            body.AppendChild(MakeHeading("Dependencies"));
            if (model.Dependencies.Count == 0)
            {
                body.AppendChild(MakeParagraph("No dependencies defined.", italic: true));
                body.AppendChild(MakeParagraph(""));
                return;
            }

            string[] headers = { "Predecessor", "Successor", "Type", "Lag (Days)", "Critical Path" };
            var rows = new List<string[]>();
            var criticalFlags = new List<bool>();
            foreach (var dep in model.Dependencies)
            {
                var pred = model.GetTask(dep.PredecessorId);
                var succ = model.GetTask(dep.SuccessorId);
                if (pred == null || succ == null)
                    continue;

                bool critical = model.IsDependencyOnCriticalPath(dep);
                rows.Add(new[]
                {
                    pred.Name,
                    succ.Name,
                    dep.Type.ToString(),
                    dep.LagDays.ToString(),
                    critical ? "Yes" : "No"
                });
                criticalFlags.Add(critical);
            }

            body.AppendChild(MakeDataTable(headers, rows, i => criticalFlags[i]));
            body.AppendChild(MakeParagraph(""));
        }

        private static void WriteResources(Body body, ProjectModel model)
        {
            body.AppendChild(MakeHeading("Resource Allocation"));
            string[] headers = { "Task", "Resource", "Allocation" };
            var rows = new List<string[]>();

            foreach (var assignment in model.Assignments.OrderBy(a => a.TaskId).ThenBy(a => a.ResourceName))
            {
                var task = model.GetTask(assignment.TaskId);
                rows.Add(new[]
                {
                    task?.Name ?? "",
                    assignment.ResourceName,
                    $"{assignment.AllocationPercent:0}%"
                });
            }

            if (rows.Count == 0)
            {
                foreach (var task in model.Tasks.Where(t => !string.IsNullOrWhiteSpace(t.AssignedTo)))
                    rows.Add(new[] { task.Name, task.AssignedTo, "100%" });
            }

            if (rows.Count == 0)
            {
                body.AppendChild(MakeParagraph("No resource assignments.", italic: true));
            }
            else
            {
                body.AppendChild(MakeDataTable(headers, rows));
            }

            body.AppendChild(MakeParagraph(""));
        }

        private static Table BuildNoteTable(ProjectNote note, ProjectModel model)
        {
            var linked = ProjectReportContent.LinkedTaskName(model, note);
            var table = new Table();
            table.AppendChild(new TableProperties(
                new TableBorders(
                    new TopBorder { Val = BorderValues.Single, Size = 6, Color = "727272" },
                    new BottomBorder { Val = BorderValues.Single, Size = 6, Color = "727272" },
                    new LeftBorder { Val = BorderValues.Single, Size = 12, Color = "727272" },
                    new RightBorder { Val = BorderValues.Single, Size = 6, Color = "727272" }),
                new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct },
                new Shading { Val = ShadingPatternValues.Clear, Fill = NoteFill }));

            var row = new TableRow();
            var cell = new TableCell(new TableCellProperties(
                new Shading { Val = ShadingPatternValues.Clear, Fill = NoteFill }));
            cell.Append(MakeParagraph(ProjectReportContent.NoteTitle(note), bold: true));
            if (!string.IsNullOrEmpty(linked))
                cell.Append(MakeParagraph($"Linked task: {linked} (ID {note.TaskId})", size: 18, color: "555555"));
            cell.Append(MakeParagraph($"Anchor date: {note.AnchorDate:yyyy-MM-dd}", size: 18, color: "555555"));
            cell.Append(MakeParagraph(note.Body ?? "", preserveBreaks: true));
            row.Append(cell);
            table.Append(row);
            return table;
        }

        private static Table MakeKeyValueTable(IReadOnlyList<string[]> rows)
        {
            var table = new Table();
            table.AppendChild(DefaultTableProperties());
            foreach (var row in rows)
            {
                var tr = new TableRow();
                tr.Append(MakeTableCell(row[0], bold: true, fill: "F5F5F5"));
                tr.Append(MakeTableCell(row[1]));
                table.Append(tr);
            }
            return table;
        }

        private static Table MakeDataTable(string[] headers, IReadOnlyList<string[]> rows, Func<int, bool>? criticalRow = null)
        {
            var table = new Table();
            table.AppendChild(DefaultTableProperties());

            var headerRow = new TableRow();
            foreach (var header in headers)
                headerRow.Append(MakeTableCell(header, bold: true, fill: HeaderFill));
            table.Append(headerRow);

            for (int i = 0; i < rows.Count; i++)
            {
                bool critical = criticalRow?.Invoke(i) == true;
                var tr = new TableRow();
                foreach (var value in rows[i])
                    tr.Append(MakeTableCell(value, critical: critical));
                table.Append(tr);
            }

            return table;
        }

        private static TableProperties DefaultTableProperties() =>
            new(
                new TableBorders(
                    new TopBorder { Val = BorderValues.Single, Size = 4 },
                    new BottomBorder { Val = BorderValues.Single, Size = 4 },
                    new LeftBorder { Val = BorderValues.Single, Size = 4 },
                    new RightBorder { Val = BorderValues.Single, Size = 4 },
                    new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 },
                    new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 }),
                new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct });

        private static TableCell MakeTableCell(string text, bool bold = false, string? fill = null, bool critical = false)
        {
            var props = new TableCellProperties();
            if (!string.IsNullOrEmpty(fill))
                props.Append(new Shading { Val = ShadingPatternValues.Clear, Fill = fill });
            var cell = new TableCell(props);
            cell.Append(MakeParagraph(text, bold: bold || critical, color: critical ? CriticalColor : null));
            return cell;
        }

        private static Paragraph MakeHeading(string text) =>
            MakeParagraph(text, bold: true, size: 24);

        private static Paragraph MakeParagraph(
            string text,
            bool bold = false,
            bool italic = false,
            int size = 20,
            string? color = null,
            bool preserveBreaks = false)
        {
            var runProps = new RunProperties();
            runProps.Append(new FontSize { Val = size.ToString() });
            if (bold)
                runProps.Append(new Bold());
            if (italic)
                runProps.Append(new Italic());
            if (!string.IsNullOrEmpty(color))
                runProps.Append(new DocumentFormat.OpenXml.Wordprocessing.Color { Val = color });

            var run = new Run(runProps);
            if (preserveBreaks && text.Contains('\n'))
            {
                var parts = text.Replace("\r\n", "\n").Split('\n');
                for (int i = 0; i < parts.Length; i++)
                {
                    run.Append(new Text(parts[i]) { Space = SpaceProcessingModeValues.Preserve });
                    if (i < parts.Length - 1)
                        run.Append(new Break());
                }
            }
            else
            {
                run.Append(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
            }

            return new Paragraph(run);
        }
    }
}

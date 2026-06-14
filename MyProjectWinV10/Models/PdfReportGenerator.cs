using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyProject.Models
{
    public static class PdfReportGenerator
    {
        private static readonly string NoteBackground = "#fffcdc";
        private static readonly string HeaderBackground = "#dce8fc";
        private static readonly string CriticalColor = "#c00000";

        public static void Export(ProjectModel model, string path)
        {
            QuestPDF.Settings.License = LicenseType.Community;

            Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(28);
                    page.DefaultTextStyle(x => x.FontSize(9));

                    page.Header().Column(col =>
                    {
                        col.Item().Text(model.ProjectName).Bold().FontSize(16);
                        col.Item().Text($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}").FontSize(9).Italic();
                    });

                    page.Content().PaddingTop(8).Column(col =>
                    {
                        col.Item().Element(c => WriteSummary(c, model));
                        col.Item().PaddingTop(12).Element(c => WriteTaskSchedule(c, model));
                        col.Item().PaddingTop(12).Element(c => WriteNotes(c, model));
                        col.Item().PaddingTop(12).Element(c => WriteDependencies(c, model));
                        col.Item().PaddingTop(12).Element(c => WriteResources(c, model));
                    });

                    page.Footer().AlignCenter().Text(text =>
                    {
                        text.Span("Page ");
                        text.CurrentPageNumber();
                        text.Span(" / ");
                        text.TotalPages();
                    });
                });
            }).GeneratePdf(path);
        }

        private static void WriteSummary(IContainer container, ProjectModel model)
        {
            double overall = ProjectReportContent.OverallProgress(model);
            container.Column(col =>
            {
                col.Item().Text("Summary").Bold().FontSize(12);
                col.Item().PaddingTop(4).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.ConstantColumn(140);
                        columns.RelativeColumn();
                    });

                    AddSummaryRow(table, "Project Start", model.ProjectStart.ToString("yyyy-MM-dd"));
                    AddSummaryRow(table, "Project End", model.GetProjectEnd().ToString("yyyy-MM-dd"));
                    AddSummaryRow(table, "Total Tasks", model.Tasks.Count.ToString());
                    AddSummaryRow(table, "Overall Progress", $"{overall:0.0}%");
                    AddSummaryRow(table, "Completed Tasks", model.Tasks.Count(t => t.Progress >= 100).ToString());
                    AddSummaryRow(table, "In-Progress Tasks", model.Tasks.Count(t => t.Progress > 0 && t.Progress < 100).ToString());
                    AddSummaryRow(table, "Not Started Tasks", model.Tasks.Count(t => t.Progress == 0).ToString());
                    AddSummaryRow(table, "Critical Tasks", model.Tasks.Count(t => t.IsCritical).ToString());
                    AddSummaryRow(table, "Dependencies", model.Dependencies.Count.ToString());
                    AddSummaryRow(table, "Resource Assignments", model.Assignments.Count().ToString());
                    AddSummaryRow(table, "Notes", model.Notes.Count.ToString());
                });
            });
        }

        private static void AddSummaryRow(TableDescriptor table, string label, string value)
        {
            table.Cell().Border(0.5f).Background(Colors.Grey.Lighten4).Padding(4).Text(label);
            table.Cell().Border(0.5f).Padding(4).Text(value);
        }

        private static void WriteTaskSchedule(IContainer container, ProjectModel model)
        {
            container.Column(col =>
            {
                col.Item().Text("Task Schedule").Bold().FontSize(12);
                col.Item().PaddingTop(4).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.ConstantColumn(28);
                        columns.RelativeColumn(2);
                        columns.ConstantColumn(52);
                        columns.ConstantColumn(58);
                        columns.ConstantColumn(58);
                        columns.ConstantColumn(36);
                        columns.ConstantColumn(48);
                        columns.RelativeColumn(1);
                        columns.RelativeColumn(1);
                        columns.RelativeColumn(1.5f);
                    });

                    foreach (var header in new[] { "ID", "Task", "Type", "Start", "End", "Days", "Progress", "Assigned", "Deliverable", "Notes" })
                        table.Cell().Background(HeaderBackground).Border(0.5f).Padding(3).Text(header).Bold();

                    foreach (var task in model.Tasks)
                    {
                        string textColor = task.IsCritical ? CriticalColor : Colors.Black;
                        void Cell(string text) =>
                            table.Cell().Border(0.5f).Padding(3).Text(text).FontColor(textColor);

                        Cell(task.Id.ToString());
                        Cell(ProjectReportContent.TaskIndent(task) + task.Name);
                        Cell(ProjectReportContent.TaskTypeLabel(task));
                        Cell(task.StartDate.ToString("yyyy-MM-dd"));
                        Cell(task.EndDate.ToString("yyyy-MM-dd"));
                        Cell(task.DurationDays.ToString());
                        Cell($"{task.Progress:0}%");
                        Cell(model.GetTaskAssigneeDisplay(task.Id));
                        Cell(task.Deliverable ?? "");
                        Cell(task.Notes ?? "");
                    }
                });
            });
        }

        private static void WriteNotes(IContainer container, ProjectModel model)
        {
            container.Column(col =>
            {
                col.Item().Text("Notes").Bold().FontSize(12);
                if (model.Notes.Count == 0)
                {
                    col.Item().PaddingTop(4).Text("No notes in this project.").Italic();
                    return;
                }

                foreach (var note in model.Notes.OrderBy(n => n.Id))
                {
                    string linked = ProjectReportContent.LinkedTaskName(model, note);
                    col.Item().PaddingTop(6).Border(1).BorderColor("#727272").Background(NoteBackground).Padding(8).Column(noteCol =>
                    {
                        noteCol.Item().Text(ProjectReportContent.NoteTitle(note)).Bold();
                        if (!string.IsNullOrEmpty(linked))
                            noteCol.Item().Text($"Linked task: {linked} (ID {note.TaskId})").FontSize(8).Italic();
                        noteCol.Item().Text($"Anchor date: {note.AnchorDate:yyyy-MM-dd}").FontSize(8).Italic();
                        noteCol.Item().PaddingTop(4).Text(note.Body ?? "");
                    });
                }
            });
        }

        private static void WriteDependencies(IContainer container, ProjectModel model)
        {
            container.Column(col =>
            {
                col.Item().Text("Dependencies").Bold().FontSize(12);
                if (model.Dependencies.Count == 0)
                {
                    col.Item().PaddingTop(4).Text("No dependencies defined.").Italic();
                    return;
                }

                col.Item().PaddingTop(4).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn();
                        columns.RelativeColumn();
                        columns.ConstantColumn(48);
                        columns.ConstantColumn(48);
                        columns.ConstantColumn(56);
                    });

                    foreach (var header in new[] { "Predecessor", "Successor", "Type", "Lag", "Critical" })
                        table.Cell().Background(HeaderBackground).Border(0.5f).Padding(3).Text(header).Bold();

                    foreach (var dep in model.Dependencies)
                    {
                        var pred = model.GetTask(dep.PredecessorId);
                        var succ = model.GetTask(dep.SuccessorId);
                        if (pred == null || succ == null)
                            continue;

                        bool critical = model.IsDependencyOnCriticalPath(dep);
                        string color = critical ? CriticalColor : Colors.Black;

                        table.Cell().Border(0.5f).Padding(3).Text(pred.Name).FontColor(color);
                        table.Cell().Border(0.5f).Padding(3).Text(succ.Name).FontColor(color);
                        table.Cell().Border(0.5f).Padding(3).Text(dep.Type.ToString()).FontColor(color);
                        table.Cell().Border(0.5f).Padding(3).Text(dep.LagDays.ToString()).FontColor(color);
                        table.Cell().Border(0.5f).Padding(3).Text(critical ? "Yes" : "No").FontColor(color);
                    }
                });
            });
        }

        private static void WriteResources(IContainer container, ProjectModel model)
        {
            container.Column(col =>
            {
                col.Item().Text("Resource Allocation").Bold().FontSize(12);
                var rows = model.Assignments
                    .OrderBy(a => a.TaskId)
                    .ThenBy(a => a.ResourceName)
                    .ToList();

                if (rows.Count == 0)
                {
                    var fallback = model.Tasks.Where(t => !string.IsNullOrWhiteSpace(t.AssignedTo)).ToList();
                    if (fallback.Count == 0)
                    {
                        col.Item().PaddingTop(4).Text("No resource assignments.").Italic();
                        return;
                    }

                    col.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2);
                            columns.RelativeColumn();
                            columns.ConstantColumn(64);
                        });
                        foreach (var header in new[] { "Task", "Resource", "Allocation" })
                            table.Cell().Background(HeaderBackground).Border(0.5f).Padding(3).Text(header).Bold();
                        foreach (var task in fallback)
                        {
                            table.Cell().Border(0.5f).Padding(3).Text(task.Name);
                            table.Cell().Border(0.5f).Padding(3).Text(task.AssignedTo);
                            table.Cell().Border(0.5f).Padding(3).Text("100%");
                        }
                    });
                    return;
                }

                col.Item().PaddingTop(4).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(2);
                        columns.RelativeColumn();
                        columns.ConstantColumn(64);
                    });
                    foreach (var header in new[] { "Task", "Resource", "Allocation" })
                        table.Cell().Background(HeaderBackground).Border(0.5f).Padding(3).Text(header).Bold();

                    foreach (var assignment in rows)
                    {
                        var task = model.GetTask(assignment.TaskId);
                        table.Cell().Border(0.5f).Padding(3).Text(task?.Name ?? "");
                        table.Cell().Border(0.5f).Padding(3).Text(assignment.ResourceName);
                        table.Cell().Border(0.5f).Padding(3).Text($"{assignment.AllocationPercent:0}%");
                    }
                });
            });
        }
    }
}

using ClosedXML.Excel;
using MyProject.Rendering;
using MyProject.Theme;
using System.Drawing;

namespace MyProject.Models
{
    public static class ExcelReportGenerator
    {
        private const int MaxDailyColumns = 160;
        private const double GanttColumnWidth = 2.6;
        private const int GanttFirstColumn = 12;
        private const int NoteMarkerColumns = 3;

        public static void Export(ProjectModel model, string path)
        {
            using var workbook = new XLWorkbook();
            BuildSummarySheet(workbook, model);
            BuildTaskScheduleSheet(workbook, model);
            BuildResourceAllocationSheet(workbook, model);
            BuildDependenciesSheet(workbook, model);
            BuildNotesSheet(workbook, model);
            workbook.SaveAs(path);
        }

        private static void BuildSummarySheet(XLWorkbook workbook, ProjectModel model)
        {
            var sheet = workbook.Worksheets.Add("Summary");
            double overallProgress = model.Tasks.Count > 0
                ? model.Tasks.Average(t => t.Progress)
                : 0;

            sheet.Cell(1, 1).Value = "Project Name";
            sheet.Cell(1, 2).Value = model.ProjectName;
            sheet.Cell(2, 1).Value = "Generated";
            sheet.Cell(2, 2).Value = DateTime.Now;
            sheet.Cell(2, 2).Style.DateFormat.Format = "yyyy-mm-dd hh:mm";
            sheet.Cell(3, 1).Value = "Project Start";
            sheet.Cell(3, 2).Value = model.ProjectStart;
            sheet.Cell(3, 2).Style.DateFormat.Format = "yyyy-mm-dd";
            sheet.Cell(4, 1).Value = "Project End";
            sheet.Cell(4, 2).Value = model.GetProjectEnd();
            sheet.Cell(4, 2).Style.DateFormat.Format = "yyyy-mm-dd";
            sheet.Cell(5, 1).Value = "Total Tasks";
            sheet.Cell(5, 2).Value = model.Tasks.Count;
            sheet.Cell(6, 1).Value = "Overall Progress (%)";
            sheet.Cell(6, 2).Value = overallProgress / 100.0;
            sheet.Cell(6, 2).Style.NumberFormat.Format = "0.0%";
            sheet.Cell(7, 1).Value = "Completed Tasks";
            sheet.Cell(7, 2).Value = model.Tasks.Count(t => t.Progress >= 100);
            sheet.Cell(8, 1).Value = "In-Progress Tasks";
            sheet.Cell(8, 2).Value = model.Tasks.Count(t => t.Progress > 0 && t.Progress < 100);
            sheet.Cell(9, 1).Value = "Not Started Tasks";
            sheet.Cell(9, 2).Value = model.Tasks.Count(t => t.Progress == 0);
            sheet.Cell(10, 1).Value = "Critical Tasks";
            sheet.Cell(10, 2).Value = model.Tasks.Count(t => t.IsCritical);
            sheet.Cell(11, 1).Value = "Dependencies";
            sheet.Cell(11, 2).Value = model.Dependencies.Count;
            sheet.Cell(12, 1).Value = "Resource Assignments";
            sheet.Cell(12, 2).Value = model.Assignments.Count();
            sheet.Cell(13, 1).Value = "Notes";
            sheet.Cell(13, 2).Value = model.Notes.Count;

            sheet.Column(1).Style.Font.Bold = true;
            sheet.Columns().AdjustToContents();
        }

        private static void BuildTaskScheduleSheet(XLWorkbook workbook, ProjectModel model)
        {
            var sheet = workbook.Worksheets.Add("Task Schedule");
            var (chartStart, chartEnd, useWeekly) = GetChartRange(model);
            int timelineUnits = useWeekly
                ? CountWeeks(chartStart, chartEnd)
                : (chartEnd - chartStart).Days + 1;

            string[] headers =
            {
                "ID", "Task Name", "Type", "Start Date", "End Date", "Duration (Days)",
                "Progress (%)", "Assigned To", "Deliverable", "Task Notes", "Gantt"
            };

            WriteHeaderRow(sheet, headers, GanttFirstColumn - 1);

            int timelineStartCol = GanttFirstColumn;
            WriteTimelineHeader(sheet, chartStart, chartEnd, useWeekly, timelineStartCol);

            int row = 2;
            var taskRows = new Dictionary<int, int>();
            foreach (var task in model.Tasks)
            {
                taskRows[task.Id] = row;
                sheet.Cell(row, 1).Value = task.Id;
                sheet.Cell(row, 2).Value = new string(' ', task.IndentLevel * 2) + task.Name;
                sheet.Cell(row, 3).Value = task.TaskType.ToString();
                sheet.Cell(row, 4).Value = task.StartDate;
                sheet.Cell(row, 5).Value = task.EndDate;
                sheet.Cell(row, 6).Value = task.DurationDays;
                sheet.Cell(row, 7).Value = task.Progress / 100.0;
                sheet.Cell(row, 8).Value = model.GetTaskAssigneeDisplay(task.Id);
                sheet.Cell(row, 9).Value = task.Deliverable;
                sheet.Cell(row, 10).Value = task.Notes;

                sheet.Cell(row, 4).Style.DateFormat.Format = "yyyy-mm-dd";
                sheet.Cell(row, 5).Style.DateFormat.Format = "yyyy-mm-dd";
                sheet.Cell(row, 7).Style.NumberFormat.Format = "0.0%";
                sheet.Cell(row, 10).Style.Alignment.WrapText = true;

                if (task.TaskType == TaskType.Summary)
                    sheet.Row(row).Style.Font.Bold = true;

                DrawTaskGanttBar(sheet, row, task, chartStart, chartEnd, useWeekly, timelineStartCol);
                sheet.Row(row).Height = 16;
                row++;
            }

            DrawCriticalDependencyMarkers(sheet, model, chartStart, chartEnd, useWeekly, timelineStartCol, taskRows);
            DrawNoteMarkers(sheet, model, chartStart, chartEnd, useWeekly, timelineStartCol, taskRows, row - 1);

            sheet.Column(11).Width = 1.5;
            for (int c = timelineStartCol; c < timelineStartCol + timelineUnits; c++)
                sheet.Column(c).Width = GanttColumnWidth;

            sheet.SheetView.FreezeColumns(GanttFirstColumn - 1);
            sheet.SheetView.FreezeRows(1);
            sheet.Columns(1, GanttFirstColumn - 1).AdjustToContents();
            sheet.Column(10).Width = Math.Max(sheet.Column(10).Width, 24);
        }

        private static void BuildNotesSheet(XLWorkbook workbook, ProjectModel model)
        {
            var sheet = workbook.Worksheets.Add("Notes");
            string[] headers =
            {
                "Note ID", "Title", "Content", "Linked Task ID", "Linked Task",
                "Anchor Date", "Timeline Row"
            };
            WriteHeaderRow(sheet, headers);

            var noteFill = XlColor(NoteRenderer.GradientTop);
            var noteBorder = XlColor(NoteRenderer.BorderColor);

            int row = 2;
            foreach (var note in model.Notes.OrderBy(n => n.Id))
            {
                var linkedTask = note.TaskId >= 0 ? model.GetTask(note.TaskId) : null;

                sheet.Cell(row, 1).Value = note.Id;
                sheet.Cell(row, 2).Value = note.Title;
                sheet.Cell(row, 3).Value = note.Body;
                sheet.Cell(row, 4).Value = note.TaskId >= 0 ? note.TaskId : "";
                sheet.Cell(row, 5).Value = linkedTask?.Name ?? "";
                sheet.Cell(row, 6).Value = note.AnchorDate;
                sheet.Cell(row, 6).Style.DateFormat.Format = "yyyy-mm-dd";
                sheet.Cell(row, 7).Value = GetNoteTimelineRowLabel(note, model);

                sheet.Cell(row, 3).Style.Alignment.WrapText = true;
                sheet.Row(row).Style.Fill.BackgroundColor = noteFill;
                sheet.Row(row).Style.Font.FontColor = XLColor.FromArgb(32, 32, 32);

                for (int c = 1; c <= headers.Length; c++)
                    sheet.Cell(row, c).Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                sheet.Cell(row, 1).Style.Border.OutsideBorderColor = noteBorder;

                row++;
            }

            sheet.SheetView.FreezeRows(1);
            sheet.Columns().AdjustToContents();
            sheet.Column(3).Width = Math.Max(sheet.Column(3).Width, 48);
        }

        private static string GetNoteTimelineRowLabel(ProjectNote note, ProjectModel model)
        {
            if (note.TaskId >= 0)
            {
                var task = model.GetTask(note.TaskId);
                if (task != null)
                    return task.Name;
            }

            int rowIndex = (note.ContentY - AppTheme.TimescaleHeaderHeight) / AppTheme.RowHeight;
            return rowIndex >= 0 ? $"Row {rowIndex + 1}" : "";
        }

        private static void DrawNoteMarkers(
            IXLWorksheet sheet,
            ProjectModel model,
            DateTime chartStart,
            DateTime chartEnd,
            bool useWeekly,
            int timelineStartCol,
            Dictionary<int, int> taskRows,
            int lastTaskRow)
        {
            if (model.Notes.Count == 0)
                return;

            var noteFill = XlColor(NoteRenderer.GradientTop);
            var noteBorder = XlColor(NoteRenderer.BorderColor);
            var noteText = XLColor.FromArgb(32, 32, 32);

            foreach (var note in model.Notes.OrderBy(n => n.Id))
            {
                int noteRow = GetNoteExportRow(note, taskRows, lastTaskRow);
                if (noteRow < 2)
                    continue;

                int startCol = useWeekly
                    ? GetWeekColumn(chartStart, note.AnchorDate.Date, timelineStartCol)
                    : timelineStartCol + (note.AnchorDate.Date - chartStart.Date).Days;

                if (startCol < timelineStartCol)
                    continue;

                string label = GetNoteExportLabel(note);
                int span = useWeekly ? 1 : NoteMarkerColumns;

                for (int w = 0; w < span; w++)
                {
                    var cell = sheet.Cell(noteRow, startCol + w);
                    cell.Style.Fill.BackgroundColor = noteFill;
                    cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                    cell.Style.Border.TopBorderColor = noteBorder;
                    cell.Style.Border.BottomBorderColor = noteBorder;

                    if (w == 0)
                    {
                        cell.Style.Border.LeftBorder = XLBorderStyleValues.Medium;
                        cell.Style.Border.LeftBorderColor = noteBorder;
                        cell.Value = label;
                        cell.Style.Font.FontSize = 8;
                        cell.Style.Font.FontColor = noteText;
                        cell.Style.Alignment.WrapText = true;
                        cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    }

                    if (w == span - 1)
                    {
                        cell.Style.Border.RightBorder = XLBorderStyleValues.Medium;
                        cell.Style.Border.RightBorderColor = noteBorder;
                    }
                }

                if (note.TaskId >= 0 && taskRows.TryGetValue(note.TaskId, out int taskRow))
                    DrawNoteLinkMarker(sheet, taskRow, noteRow, startCol, noteBorder);
            }
        }

        private static void DrawNoteLinkMarker(
            IXLWorksheet sheet,
            int taskRow,
            int noteRow,
            int noteStartCol,
            XLColor borderColor)
        {
            if (taskRow == noteRow || noteStartCol <= GanttFirstColumn)
                return;

            var linkCell = sheet.Cell(taskRow, noteStartCol - 1);
            linkCell.Style.Border.RightBorder = XLBorderStyleValues.Dotted;
            linkCell.Style.Border.RightBorderColor = borderColor;
        }

        private static int GetNoteExportRow(ProjectNote note, Dictionary<int, int> taskRows, int lastTaskRow)
        {
            if (note.TaskId >= 0 && taskRows.TryGetValue(note.TaskId, out int taskRow))
                return taskRow;

            int rowIndex = (note.ContentY - AppTheme.TimescaleHeaderHeight) / AppTheme.RowHeight;
            int row = 2 + rowIndex;
            return Math.Clamp(row, 2, lastTaskRow);
        }

        private static string GetNoteExportLabel(ProjectNote note)
        {
            if (!string.IsNullOrWhiteSpace(note.Title))
                return note.Title.Trim();

            string body = note.Body.Replace('\r', ' ').Replace('\n', ' ').Trim();
            if (string.IsNullOrWhiteSpace(body))
                return "Note";

            return body.Length > 40 ? body[..40] + "…" : body;
        }

        private static (DateTime chartStart, DateTime chartEnd, bool useWeekly) GetChartRange(ProjectModel model)
        {
            DateTime chartStart = model.ProjectStart.Date.AddDays(-3);
            DateTime chartEnd = model.GetProjectEnd().Date.AddDays(7);
            if (chartEnd < chartStart)
                chartEnd = chartStart.AddDays(30);

            int totalDays = (chartEnd - chartStart).Days + 1;
            bool useWeekly = totalDays > MaxDailyColumns;
            return (chartStart, chartEnd, useWeekly);
        }

        private static int CountWeeks(DateTime chartStart, DateTime chartEnd)
        {
            int count = 0;
            var weekStart = GetWeekStart(chartStart);
            while (weekStart <= chartEnd)
            {
                count++;
                weekStart = weekStart.AddDays(7);
            }
            return count;
        }

        private static DateTime GetWeekStart(DateTime date)
        {
            int diff = (int)date.DayOfWeek;
            return date.Date.AddDays(-diff);
        }

        private static void WriteTimelineHeader(
            IXLWorksheet sheet,
            DateTime chartStart,
            DateTime chartEnd,
            bool useWeekly,
            int timelineStartCol)
        {
            if (useWeekly)
            {
                var weekStart = GetWeekStart(chartStart);
                int col = timelineStartCol;
                while (weekStart <= chartEnd)
                {
                    var headerCell = sheet.Cell(1, col);
                    headerCell.Value = weekStart;
                    headerCell.Style.DateFormat.Format = "yyyy-mm-dd";
                    headerCell.Style.Font.FontSize = 8;
                    headerCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    headerCell.Style.Fill.BackgroundColor = XlColor(AppTheme.TimescaleBackground);
                    col++;
                    weekStart = weekStart.AddDays(7);
                }
                return;
            }

            int totalDays = (chartEnd - chartStart).Days + 1;
            for (int i = 0; i < totalDays; i++)
            {
                var date = chartStart.AddDays(i);
                var headerCell = sheet.Cell(1, timelineStartCol + i);
                headerCell.Value = date;
                headerCell.Style.DateFormat.Format = "d";
                headerCell.Style.Font.FontSize = 8;
                headerCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

                bool isWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                bool isToday = date.Date == DateTime.Today;
                headerCell.Style.Fill.BackgroundColor = isToday
                    ? XlColor(AppTheme.TimescaleToday)
                    : isWeekend
                        ? XlColor(AppTheme.TimescaleWeekend)
                        : XlColor(AppTheme.TimescaleBackground);

                if (isToday)
                    headerCell.Style.Font.Bold = true;
            }
        }

        private static void DrawTaskGanttBar(
            IXLWorksheet sheet,
            int row,
            ProjectTask task,
            DateTime chartStart,
            DateTime chartEnd,
            bool useWeekly,
            int timelineStartCol)
        {
            var barColor = GetTaskBarColor(task);
            var progressColor = GetTaskProgressColor(task);
            DateTime taskStart = task.StartDate.Date;
            DateTime taskEnd = task.TaskType == TaskType.Milestone
                ? taskStart
                : task.EndDate.Date;

            if (useWeekly)
            {
                var weekStart = GetWeekStart(chartStart);
                int col = timelineStartCol;
                while (weekStart <= chartEnd)
                {
                    var weekEnd = weekStart.AddDays(6);
                    if (TaskOverlapsRange(task, taskStart, taskEnd, weekStart, weekEnd))
                        PaintGanttCell(sheet.Cell(row, col), task, weekStart, weekEnd, barColor, progressColor);

                    weekStart = weekStart.AddDays(7);
                    col++;
                }
                return;
            }

            int totalDays = (chartEnd - chartStart).Days + 1;
            for (int i = 0; i < totalDays; i++)
            {
                var date = chartStart.AddDays(i);
                if (date < taskStart || date > taskEnd)
                    continue;

                PaintGanttCell(sheet.Cell(row, timelineStartCol + i), task, date, date, barColor, progressColor);
            }
        }

        private static bool TaskOverlapsRange(
            ProjectTask task,
            DateTime taskStart,
            DateTime taskEnd,
            DateTime rangeStart,
            DateTime rangeEnd)
        {
            if (task.TaskType == TaskType.Milestone)
                return taskStart >= rangeStart && taskStart <= rangeEnd;

            return taskStart <= rangeEnd && taskEnd >= rangeStart;
        }

        private static void PaintGanttCell(
            IXLCell cell,
            ProjectTask task,
            DateTime segmentStart,
            DateTime segmentEnd,
            Color barColor,
            Color progressColor)
        {
            if (task.TaskType == TaskType.Milestone)
            {
                cell.Style.Fill.BackgroundColor = XlColor(AppTheme.TaskBarMilestone);
                cell.Style.Border.OutsideBorder = XLBorderStyleValues.Medium;
                cell.Style.Border.OutsideBorderColor = XlColor(Darken(AppTheme.TaskBarMilestone, 40));
                return;
            }

            bool inProgress = IsInProgressSegment(task, segmentStart, segmentEnd);
            cell.Style.Fill.BackgroundColor = inProgress ? XlColor(progressColor) : XlColor(barColor);
            cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.TopBorderColor = XlColor(Darken(inProgress ? progressColor : barColor, 30));
            cell.Style.Border.BottomBorderColor = XlColor(Darken(inProgress ? progressColor : barColor, 30));

            if (segmentStart == task.StartDate.Date)
                cell.Style.Border.LeftBorder = XLBorderStyleValues.Medium;
            if (segmentEnd >= task.EndDate.Date)
                cell.Style.Border.RightBorder = XLBorderStyleValues.Medium;
        }

        private static bool IsInProgressSegment(ProjectTask task, DateTime segmentStart, DateTime segmentEnd)
        {
            if (task.Progress <= 0 || task.DurationDays <= 0)
                return false;

            int progressDays = (int)Math.Round(task.DurationDays * task.Progress / 100.0, MidpointRounding.AwayFromZero);
            if (progressDays <= 0)
                return false;

            DateTime progressStart = task.StartDate.Date;
            DateTime progressEnd = progressStart.AddDays(progressDays - 1);
            return segmentStart <= progressEnd && segmentEnd >= progressStart;
        }

        private static void DrawCriticalDependencyMarkers(
            IXLWorksheet sheet,
            ProjectModel model,
            DateTime chartStart,
            DateTime chartEnd,
            bool useWeekly,
            int timelineStartCol,
            Dictionary<int, int> taskRows)
        {
            var criticalColor = XlColor(AppTheme.DependencyLineCritical);

            foreach (var dep in model.Dependencies)
            {
                if (!model.IsDependencyOnCriticalPath(dep))
                    continue;

                var pred = model.GetTask(dep.PredecessorId);
                var succ = model.GetTask(dep.SuccessorId);
                if (pred == null || succ == null)
                    continue;

                if (!taskRows.TryGetValue(pred.Id, out int predRow)
                    || !taskRows.TryGetValue(succ.Id, out int succRow))
                    continue;

                DateTime fromDate = dep.Type is DependencyType.SS or DependencyType.SF
                    ? pred.StartDate.Date
                    : pred.EndDate.Date;
                DateTime toDate = dep.Type is DependencyType.FF or DependencyType.SF
                    ? succ.EndDate.Date
                    : succ.StartDate.Date;

                if (useWeekly)
                {
                    MarkCriticalConnectorCell(sheet.Cell(predRow, GetWeekColumn(chartStart, fromDate, timelineStartCol)), true, criticalColor);
                    MarkCriticalConnectorCell(sheet.Cell(succRow, GetWeekColumn(chartStart, toDate, timelineStartCol)), false, criticalColor);
                }
                else
                {
                    int fromCol = timelineStartCol + (fromDate - chartStart.Date).Days;
                    int toCol = timelineStartCol + (toDate - chartStart.Date).Days;
                    MarkCriticalConnectorCell(sheet.Cell(predRow, fromCol), true, criticalColor);
                    MarkCriticalConnectorCell(sheet.Cell(succRow, toCol), false, criticalColor);
                }
            }
        }

        private static int GetWeekColumn(DateTime chartStart, DateTime date, int timelineStartCol)
        {
            var weekStart = GetWeekStart(chartStart);
            int col = timelineStartCol;
            while (weekStart <= date.Date)
            {
                var weekEnd = weekStart.AddDays(6);
                if (date.Date >= weekStart && date.Date <= weekEnd)
                    return col;
                weekStart = weekStart.AddDays(7);
                col++;
            }
            return col;
        }

        private static void MarkCriticalConnectorCell(IXLCell cell, bool isFrom, XLColor color)
        {
            if (isFrom)
            {
                cell.Style.Border.RightBorder = XLBorderStyleValues.Medium;
                cell.Style.Border.RightBorderColor = color;
            }
            else
            {
                cell.Style.Border.LeftBorder = XLBorderStyleValues.Medium;
                cell.Style.Border.LeftBorderColor = color;
            }

            cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            cell.Style.Border.TopBorderColor = color;
            cell.Style.Border.BottomBorderColor = color;
        }

        private static Color GetTaskBarColor(ProjectTask task)
        {
            if (task.BarColor != Color.Empty)
                return TaskBarColorResolver.ToPastel(task.BarColor);
            if (task.TaskType == TaskType.Summary)
                return AppTheme.TaskBarSummary;
            if (task.IsCritical)
                return AppTheme.TaskBarCritical;
            return AppTheme.TaskBarNormal;
        }

        private static Color GetTaskProgressColor(ProjectTask task)
        {
            if (task.ProgressColor != Color.Empty)
                return TaskBarColorResolver.ToPastel(task.ProgressColor);
            if (task.IsCritical)
                return AppTheme.TaskBarCriticalProgress;
            return AppTheme.TaskBarProgress;
        }

        private static Color Darken(Color color, int amount) =>
            Color.FromArgb(color.A,
                Math.Clamp(color.R - amount, 0, 255),
                Math.Clamp(color.G - amount, 0, 255),
                Math.Clamp(color.B - amount, 0, 255));

        private static XLColor XlColor(Color color) =>
            XLColor.FromArgb(color.A, color.R, color.G, color.B);

        private static void BuildResourceAllocationSheet(XLWorkbook workbook, ProjectModel model)
        {
            var sheet = workbook.Worksheets.Add("Resource Allocation");
            string[] headers = { "Task ID", "Task Name", "Resource", "Allocation (%)" };
            WriteHeaderRow(sheet, headers);

            int row = 2;
            foreach (var assignment in model.Assignments.OrderBy(a => a.TaskId).ThenBy(a => a.ResourceName))
            {
                var task = model.GetTask(assignment.TaskId);
                sheet.Cell(row, 1).Value = assignment.TaskId;
                sheet.Cell(row, 2).Value = task?.Name ?? "";
                sheet.Cell(row, 3).Value = assignment.ResourceName;
                sheet.Cell(row, 4).Value = assignment.AllocationPercent / 100.0;
                sheet.Cell(row, 4).Style.NumberFormat.Format = "0.0%";
                row++;
            }

            if (row == 2)
            {
                foreach (var task in model.Tasks.Where(t => !string.IsNullOrWhiteSpace(t.AssignedTo)))
                {
                    sheet.Cell(row, 1).Value = task.Id;
                    sheet.Cell(row, 2).Value = task.Name;
                    sheet.Cell(row, 3).Value = task.AssignedTo;
                    sheet.Cell(row, 4).Value = 1.0;
                    sheet.Cell(row, 4).Style.NumberFormat.Format = "0.0%";
                    row++;
                }
            }

            sheet.SheetView.FreezeRows(1);
            sheet.Columns().AdjustToContents();
        }

        private static void BuildDependenciesSheet(XLWorkbook workbook, ProjectModel model)
        {
            var sheet = workbook.Worksheets.Add("Dependencies");
            string[] headers = { "Predecessor ID", "Predecessor", "Successor ID", "Successor", "Type", "Lag (Days)", "Critical Path" };
            WriteHeaderRow(sheet, headers);

            int row = 2;
            foreach (var dep in model.Dependencies)
            {
                var pred = model.GetTask(dep.PredecessorId);
                var succ = model.GetTask(dep.SuccessorId);
                if (pred == null || succ == null) continue;

                bool onCriticalPath = model.IsDependencyOnCriticalPath(dep);

                sheet.Cell(row, 1).Value = dep.PredecessorId;
                sheet.Cell(row, 2).Value = pred.Name;
                sheet.Cell(row, 3).Value = dep.SuccessorId;
                sheet.Cell(row, 4).Value = succ.Name;
                sheet.Cell(row, 5).Value = dep.Type.ToString();
                sheet.Cell(row, 6).Value = dep.LagDays;
                sheet.Cell(row, 7).Value = onCriticalPath ? "Yes" : "No";

                if (onCriticalPath)
                {
                    var criticalColor = XlColor(AppTheme.DependencyLineCritical);
                    sheet.Row(row).Style.Font.FontColor = criticalColor;
                    sheet.Row(row).Style.Font.Bold = true;
                }

                row++;
            }

            sheet.SheetView.FreezeRows(1);
            sheet.Columns().AdjustToContents();
        }

        private static void WriteHeaderRow(IXLWorksheet sheet, IReadOnlyList<string> headers, int? throughColumn = null)
        {
            int count = throughColumn ?? headers.Count;
            for (int i = 0; i < headers.Count && i < count; i++)
            {
                var cell = sheet.Cell(1, i + 1);
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.BackgroundColor = XLColor.FromArgb(220, 228, 252);
            }

            sheet.Row(1).Height = 18;
        }
    }
}

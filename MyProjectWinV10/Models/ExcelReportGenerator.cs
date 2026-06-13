using ClosedXML.Excel;

namespace MyProject.Models
{
    public static class ExcelReportGenerator
    {
        public static void Export(ProjectModel model, string path)
        {
            using var workbook = new XLWorkbook();
            BuildSummarySheet(workbook, model);
            BuildTaskScheduleSheet(workbook, model);
            BuildResourceAllocationSheet(workbook, model);
            BuildDependenciesSheet(workbook, model);
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

            sheet.Column(1).Style.Font.Bold = true;
            sheet.Columns().AdjustToContents();
        }

        private static void BuildTaskScheduleSheet(XLWorkbook workbook, ProjectModel model)
        {
            var sheet = workbook.Worksheets.Add("Task Schedule");
            string[] headers =
            {
                "ID", "Task Name", "Type", "Start Date", "End Date", "Duration (Days)",
                "Progress (%)", "Indent Level", "Critical", "Auto Schedule",
                "Deliverable", "Assigned To", "Notes"
            };

            WriteHeaderRow(sheet, headers);

            int row = 2;
            foreach (var task in model.Tasks)
            {
                string assignees = string.Join(", ",
                    model.GetAssignments(task.Id).Select(a => $"{a.ResourceName} ({a.AllocationPercent:0}%)"));
                if (string.IsNullOrWhiteSpace(assignees))
                    assignees = task.AssignedTo;

                sheet.Cell(row, 1).Value = task.Id;
                sheet.Cell(row, 2).Value = new string(' ', task.IndentLevel * 2) + task.Name;
                sheet.Cell(row, 3).Value = task.TaskType.ToString();
                sheet.Cell(row, 4).Value = task.StartDate;
                sheet.Cell(row, 5).Value = task.EndDate;
                sheet.Cell(row, 6).Value = task.DurationDays;
                sheet.Cell(row, 7).Value = task.Progress / 100.0;
                sheet.Cell(row, 8).Value = task.IndentLevel;
                sheet.Cell(row, 9).Value = task.IsCritical ? "Yes" : "No";
                sheet.Cell(row, 10).Value = task.AutoSchedule ? "Yes" : "No";
                sheet.Cell(row, 11).Value = task.Deliverable;
                sheet.Cell(row, 12).Value = assignees;
                sheet.Cell(row, 13).Value = task.Notes;

                sheet.Cell(row, 4).Style.DateFormat.Format = "yyyy-mm-dd";
                sheet.Cell(row, 5).Style.DateFormat.Format = "yyyy-mm-dd";
                sheet.Cell(row, 7).Style.NumberFormat.Format = "0.0%";
                row++;
            }

            sheet.SheetView.FreezeRows(1);
            sheet.Columns().AdjustToContents();
        }

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
            string[] headers = { "Predecessor ID", "Predecessor", "Successor ID", "Successor", "Type", "Lag (Days)" };
            WriteHeaderRow(sheet, headers);

            int row = 2;
            foreach (var dep in model.Dependencies)
            {
                var pred = model.GetTask(dep.PredecessorId);
                var succ = model.GetTask(dep.SuccessorId);
                if (pred == null || succ == null) continue;

                sheet.Cell(row, 1).Value = dep.PredecessorId;
                sheet.Cell(row, 2).Value = pred.Name;
                sheet.Cell(row, 3).Value = dep.SuccessorId;
                sheet.Cell(row, 4).Value = succ.Name;
                sheet.Cell(row, 5).Value = dep.Type.ToString();
                sheet.Cell(row, 6).Value = dep.LagDays;
                row++;
            }

            sheet.SheetView.FreezeRows(1);
            sheet.Columns().AdjustToContents();
        }

        private static void WriteHeaderRow(IXLWorksheet sheet, IReadOnlyList<string> headers)
        {
            for (int i = 0; i < headers.Count; i++)
            {
                var cell = sheet.Cell(1, i + 1);
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.BackgroundColor = XLColor.FromArgb(220, 228, 252);
            }
        }
    }
}

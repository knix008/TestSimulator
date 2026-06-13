using System.Diagnostics;
using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public partial class MainForm : Form
    {
        private ProjectModel _model = new();
        private ProjectModel? _titleBarModel;
        private int _lastSelectedId = -1;
        private int _linkSourceId = -1;  // for dependency link tool
        private ProjectContextMenuBuilder? _contextMenuBuilder;

        public MainForm()
        {
            try
            {
                InitializeComponent();
                PostInitializeComponent();
                ApplyRenderers();
                SetupEventHandlers();
                LoadNewProject();
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(null, "Initialization Error", "Could not initialize the main window.", ex);
            }
        }

        private void SafeRun(string title, string summary, Action action) =>
            ExceptionHandler.Run(this, title, summary, action);

        private void PostInitializeComponent()
        {
            mainMenuStrip.ImageScalingSize = new Size(16, 16);

            // Toolbar icons
            btnNew.Image        = AppIcons.New;
            btnOpen.Image       = AppIcons.Open;
            btnSave.Image       = AppIcons.Save;
            btnAddTask.Image    = AppIcons.AddTask;
            btnDeleteTask.Image = AppIcons.Delete;
            btnIndent.Image     = AppIcons.Indent;
            btnOutdent.Image    = AppIcons.Outdent;
            btnLink.Image       = AppIcons.Link;
            btnZoomIn.Image     = AppIcons.ZoomIn;
            btnZoomOut.Image    = AppIcons.ZoomOut;
            btnToday.Image      = AppIcons.Today;
            btnReport.Image     = AppIcons.Excel;
            btnPrint.Image      = AppIcons.Print;

            // Top-level menu icons
            menuFile.Image   = AppIcons.File;
            menuEdit.Image   = AppIcons.Edit;
            menuView.Image   = AppIcons.View;
            menuReport.Image = AppIcons.Report;

            // File menu
            menuNew.Image    = AppIcons.New;
            menuOpen.Image   = AppIcons.Open;
            menuSave.Image   = AppIcons.Save;
            menuSaveAs.Image = AppIcons.SaveAs;
            menuExit.Image   = AppIcons.Exit;

            // Edit menu
            menuAddTask.Image    = AppIcons.AddTask;
            menuDeleteTask.Image = AppIcons.Delete;
            menuIndent.Image     = AppIcons.Indent;
            menuOutdent.Image    = AppIcons.Outdent;
            menuTaskProps.Image  = AppIcons.Properties;

            // View menu
            menuZoomIn.Image  = AppIcons.ZoomIn;
            menuZoomOut.Image = AppIcons.ZoomOut;
            menuToday.Image   = AppIcons.Today;

            // Report menu
            menuExportExcel.Image = AppIcons.Excel;
            menuExportMd.Image  = AppIcons.Markdown;
            menuExportPdf.Image = AppIcons.Pdf;
            menuPrint.Image     = AppIcons.Print;

            // Tooltips
            var tt = new ToolTip { ShowAlways = true, AutomaticDelay = 400 };
            tt.SetToolTip(this, "MyProject - Project Manager");

            btnNew.ToolTipText        = "New Project (Ctrl+N)";
            btnOpen.ToolTipText       = "Open Project (Ctrl+O)";
            btnSave.ToolTipText       = "Save Project (Ctrl+S)";
            btnAddTask.ToolTipText    = "Add Task (Insert)";
            btnDeleteTask.ToolTipText = "Delete Selected Task (Delete)";
            btnIndent.ToolTipText     = "Indent Task (Alt+Right)";
            btnOutdent.ToolTipText    = "Outdent Task (Alt+Left)";
            btnLink.ToolTipText       = "Link Tasks — click source, then click Link again on successor";
            dependencyTypeHost.ToolTipText = "Select dependency line type (shown with preview)";
            btnZoomIn.ToolTipText     = "Zoom In (Ctrl++)";
            btnZoomOut.ToolTipText    = "Zoom Out (Ctrl+-)";
            btnToday.ToolTipText      = "Scroll to Today (Ctrl+T)";
            btnReport.ToolTipText     = "Export schedule and progress to Excel";
            btnPrint.ToolTipText      = "Print Schedule (Ctrl+P)";

            menuNew.ToolTipText       = "Create a new empty project";
            menuOpen.ToolTipText      = "Open an existing project file";
            menuSave.ToolTipText      = "Save the current project";
            menuZoomIn.ToolTipText    = "Increase day column width";
            menuZoomOut.ToolTipText   = "Decrease day column width";
            menuToday.ToolTipText     = "Scroll the chart to today";
            menuExportExcel.ToolTipText = "Export schedule, resources, and progress to Excel";
            menuExportMd.ToolTipText  = "Save a Markdown progress report";
            menuExportPdf.ToolTipText = "Export schedule as PDF";
            menuPrint.ToolTipText     = "Print the Gantt chart";

            // Update status bar date
            lblDateToday.Text = "Today: " + DateTime.Today.ToString("yyyy-MM-dd");
        }

        // ── Renderers ────────────────────────────────────────────────────────

        private void ApplyRenderers()
        {
            mainMenuStrip.Renderer = new DarkMenuRenderer();
            mainToolStrip.Renderer = new DarkToolStripRenderer();
        }

        // ── Event wiring ─────────────────────────────────────────────────────

        private void SetupEventHandlers()
        {
            _contextMenuBuilder = CreateContextMenuBuilder();

            // File menu
            menuNew.Click        += (s, e) => SafeRun("New Project Error", "Could not create a new project.", OnNew);
            menuOpen.Click       += (s, e) => SafeRun("Open Error", "Could not open the project.", OnOpen);
            menuSave.Click       += (s, e) => SafeRun("Save Error", "Could not save the project.", OnSave);
            menuSaveAs.Click     += (s, e) => SafeRun("Save Error", "Could not save the project.", OnSaveAs);
            menuExit.Click       += (s, e) => Close();

            // Edit menu
            menuAddTask.Click    += (s, e) => SafeRun("Add Task Error", "Could not add a task.", OnAddTask);
            menuDeleteTask.Click += (s, e) => SafeRun("Delete Task Error", "Could not delete the task.", OnDeleteTask);
            menuIndent.Click     += (s, e) => SafeRun("Indent Error", "Could not indent the task.", OnIndent);
            menuOutdent.Click    += (s, e) => SafeRun("Outdent Error", "Could not outdent the task.", OnOutdent);
            menuTaskProps.Click  += (s, e) => SafeRun("Task Properties Error", "Could not open task properties.", () => OpenTaskProperties(_lastSelectedId));

            // View menu
            menuZoomIn.Click  += (s, e) => SafeRun("View Error", "Could not zoom in.", () => ganttChartControl.ZoomIn());
            menuZoomOut.Click += (s, e) => SafeRun("View Error", "Could not zoom out.", () => ganttChartControl.ZoomOut());
            menuToday.Click   += (s, e) => SafeRun("View Error", "Could not go to today.", () => ganttChartControl.GoToToday());

            // Report menu
            menuExportExcel.Click += (s, e) => SafeRun("Export Error", "Could not export the Excel report.", OnExportExcel);
            menuExportMd.Click  += (s, e) => SafeRun("Export Error", "Could not export the Markdown report.", OnExportMarkdown);
            menuExportPdf.Click += (s, e) => OnExportPdf();
            menuPrint.Click     += (s, e) => SafeRun("Print Error", "Could not print the schedule.", OnPrint);

            // Toolbar buttons
            btnNew.Click        += (s, e) => SafeRun("New Project Error", "Could not create a new project.", OnNew);
            btnOpen.Click       += (s, e) => SafeRun("Open Error", "Could not open the project.", OnOpen);
            btnSave.Click       += (s, e) => SafeRun("Save Error", "Could not save the project.", OnSave);
            btnAddTask.Click    += (s, e) => SafeRun("Add Task Error", "Could not add a task.", OnAddTask);
            btnDeleteTask.Click += (s, e) => SafeRun("Delete Task Error", "Could not delete the task.", OnDeleteTask);
            btnIndent.Click     += (s, e) => SafeRun("Indent Error", "Could not indent the task.", OnIndent);
            btnOutdent.Click    += (s, e) => SafeRun("Outdent Error", "Could not outdent the task.", OnOutdent);
            btnLink.Click       += (s, e) => SafeRun("Link Error", "Could not link tasks.", OnLinkTasks);
            dependencyTypeSelector.SelectedType = AppSettings.DefaultDependencyType;
            dependencyTypeSelector.SelectedTypeChanged += (_, _) =>
                SafeRun("Settings Error", "Could not save dependency line type.", () =>
                    AppSettings.RememberDependencyType(dependencyTypeSelector.SelectedType));
            btnZoomIn.Click     += (s, e) => SafeRun("View Error", "Could not zoom in.", () => ganttChartControl.ZoomIn());
            btnZoomOut.Click    += (s, e) => SafeRun("View Error", "Could not zoom out.", () => ganttChartControl.ZoomOut());
            btnToday.Click      += (s, e) => SafeRun("View Error", "Could not go to today.", () => ganttChartControl.GoToToday());
            btnReport.Click     += (s, e) => SafeRun("Export Error", "Could not export the Excel report.", OnExportExcel);
            btnPrint.Click      += (s, e) => SafeRun("Print Error", "Could not print the schedule.", OnPrint);

            // Inter-control sync
            taskGridControl.TaskSelected     += (s, id) => SafeRun("Selection Error", "Could not update task selection.", () => OnTaskSelected(s, id));
            taskGridControl.TaskDoubleClicked += (s, id) => SafeRun("Task Properties Error", "Could not open task properties.", () => OpenTaskProperties(id));
            taskGridControl.ScrollChanged    += (s, e) =>
                SafeRun("View Error", "Could not synchronize scrolling.", () =>
                    ganttChartControl.SyncScrollY(taskGridControl.ScrollOffsetY));

            ganttChartControl.TaskSelected      += (s, id) => SafeRun("Selection Error", "Could not update task selection.", () => OnTaskSelected(s, id));
            ganttChartControl.TaskDoubleClicked += (s, id) => SafeRun("Task Properties Error", "Could not open task properties.", () => OpenTaskProperties(id));
            ganttChartControl.ScrollYChanged    += (s, scrollY) =>
                SafeRun("View Error", "Could not synchronize scrolling.", () =>
                    taskGridControl.SyncScroll(scrollY));

            taskGridControl.ContextMenuRequested += OnContextMenuRequested;
            ganttChartControl.ContextMenuRequested += OnContextMenuRequested;

            FormClosing += OnFormClosing;
            FormClosed += OnFormClosed;
        }

        private void OnFormClosing(object? sender, FormClosingEventArgs e)
        {
            SaveAppSettingsQuietly();

            if (!ShouldAllowImmediateClose(e) && _model.IsModified && !ConfirmProceedWithoutSaving())
            {
                e.Cancel = true;
                return;
            }

            ExceptionHandler.NotifyShutdown();
        }

        private void OnFormClosed(object? sender, FormClosedEventArgs e)
        {
            DetachFromModel();

            if (_titleBarModel != null)
                _titleBarModel.ModelChanged -= OnModelChangedForTitleBar;
        }

        private void DetachFromModel()
        {
            taskGridControl.DetachModel();
            ganttChartControl.DetachModel();
        }

        private static bool ShouldAllowImmediateClose(FormClosingEventArgs e)
        {
            if (Debugger.IsAttached)
                return true;

            return e.CloseReason is CloseReason.WindowsShutDown
                or CloseReason.TaskManagerClosing
                or CloseReason.ApplicationExitCall
                or CloseReason.MdiFormClosing
                or CloseReason.FormOwnerClosing;
        }

        private static void SaveAppSettingsQuietly()
        {
            try
            {
                AppSettings.Save();
            }
            catch
            {
                // Ignore settings errors during shutdown.
            }
        }

        private ProjectContextMenuBuilder CreateContextMenuBuilder() =>
            new()
            {
                AddTask = () => SafeRun("Add Task Error", "Could not add a task.", OnAddTask),
                AddSubtask = id => SafeRun("Add Subtask Error", "Could not add a subtask.", () => OnAddSubtask(id)),
                OpenTaskProperties = id => SafeRun("Task Properties Error", "Could not open task properties.", () => OpenTaskProperties(id)),
                DeleteTask = id => SafeRun("Delete Task Error", "Could not delete the task.", () => DeleteTaskById(id)),
                IndentTask = id => SafeRun("Indent Error", "Could not indent the task.", () => IndentTaskById(id)),
                OutdentTask = id => SafeRun("Outdent Error", "Could not outdent the task.", () => OutdentTaskById(id)),
                LinkFromTask = id => SafeRun("Link Error", "Could not start linking tasks.", () => LinkFromTask(id)),
                ToggleExpandTask = id => SafeRun("Expand Error", "Could not expand or collapse subtasks.", () => ToggleExpandTask(id)),
                ZoomIn = () => SafeRun("View Error", "Could not zoom in.", () => ganttChartControl.ZoomIn()),
                ZoomOut = () => SafeRun("View Error", "Could not zoom out.", () => ganttChartControl.ZoomOut()),
                GoToToday = () => SafeRun("View Error", "Could not go to today.", () => ganttChartControl.GoToToday())
            };

        private void OnContextMenuRequested(object? sender, ContextMenuRequestEventArgs e)
        {
            if (sender is not Control control) return;

            try
            {
                var menu = _contextMenuBuilder!.Build(e.Target, e.TaskId, _model);
                menu.Tag = control;
                menu.Show(control, e.Location);
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Menu Error", "Could not show the context menu.", ex);
            }
        }

        private void DeleteTaskById(int taskId)
        {
            SelectTask(taskId);
            OnDeleteTask();
        }

        private void IndentTaskById(int taskId)
        {
            SelectTask(taskId);
            OnIndent();
        }

        private void OutdentTaskById(int taskId)
        {
            SelectTask(taskId);
            OnOutdent();
        }

        private void LinkFromTask(int taskId)
        {
            if (taskId < 0) return;
            SelectTask(taskId);
            _linkSourceId = taskId;
            btnLink.Checked = true;
            var src = _model.GetTask(taskId);
            statusLabel.Text = $"Link source: [{src?.Name}] — select successor and click Link again ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
        }

        private void ToggleExpandTask(int taskId)
        {
            _model.ToggleExpanded(taskId);
            taskGridControl.Invalidate();
            ganttChartControl.Invalidate();
        }

        private void SelectTask(int taskId)
        {
            _lastSelectedId = taskId;
            taskGridControl.SetSelectedTask(taskId);
            ganttChartControl.SetSelectedTask(taskId);
            UpdateStatus(taskId);
        }

        // ── Model loading ────────────────────────────────────────────────────

        private void LoadNewProject()
        {
            _model = new ProjectModel { ProjectName = "New Project" };
            ApplyModel();
        }

        private void ApplyModel()
        {
            if (_titleBarModel != null)
                _titleBarModel.ModelChanged -= OnModelChangedForTitleBar;

            _titleBarModel = _model;
            _model.ModelChanged += OnModelChangedForTitleBar;
            _model.UpdateHierarchy();

            taskGridControl.SetModel(_model);
            ganttChartControl.SetModel(_model);

            _lastSelectedId = -1;
            CancelLink();
            taskGridControl.SetSelectedTask(-1);
            ganttChartControl.SetSelectedTask(-1);

            UpdateTitleBar();
            UpdateStatus(-1);
        }

        private void OnModelChangedForTitleBar(object? sender, EventArgs e) => UpdateTitleBar();

        // ── Selection ────────────────────────────────────────────────────────

        private void OnTaskSelected(object? sender, int taskId)
        {
            _lastSelectedId = taskId;
            if (sender != taskGridControl)  taskGridControl.SetSelectedTask(taskId);
            if (sender != ganttChartControl) ganttChartControl.SetSelectedTask(taskId);
            UpdateStatus(taskId);
        }

        // ── UI updates ───────────────────────────────────────────────────────

        private void UpdateTitleBar()
        {
            Text = $"MyProject - {_model.ProjectName}{(_model.IsModified ? " *" : "")}";
        }

        private void UpdateStatus(int taskId)
        {
            if (taskId < 0)
            {
                statusLabel.Text = $"{_model.Tasks.Count} task(s) | {_model.ProjectName}";
                return;
            }
            var task = _model.GetTask(taskId);
            if (task != null)
                statusLabel.Text = $"[{task.Id}] {task.Name}  |  Start: {task.StartDate:yyyy-MM-dd}  |  Duration: {task.DurationDays}d  |  Progress: {task.Progress:0}%";
        }

        // ── File commands ────────────────────────────────────────────────────

        private void OnNew()
        {
            if (!ConfirmProceedWithoutSaving()) return;
            _model = new ProjectModel { ProjectName = "New Project" };
            ApplyModel();
        }

        private void OnOpen()
        {
            if (!ConfirmProceedWithoutSaving()) return;
            using var dlg = new OpenFileDialog
            {
                Filter = ProjectFile.FileFilter,
                Title = "Open MyProject Project"
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                AppSettings.RememberFromPath(dlg.FileName);
                LoadProjectFromFile(dlg.FileName);
            }
        }

        private void LoadProjectFromFile(string path)
        {
            try
            {
                _model = ProjectFile.Load(path);
                ApplyModel();
                statusLabel.Text = $"Opened: {path}";
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Open Error", "Could not open project.", ex);
            }
        }

        private void OnSave()
        {
            if (!_model.IsModified)
            {
                if (!string.IsNullOrEmpty(_model.FilePath))
                    statusLabel.Text = $"Already saved: {_model.FilePath}";
                return;
            }

            if (string.IsNullOrEmpty(_model.FilePath))
            {
                OnSaveAs();
                return;
            }

            SaveProject(_model.FilePath);
        }

        private void OnSaveAs()
        {
            using var dlg = new SaveFileDialog
            {
                Filter = ProjectFile.FileFilter,
                DefaultExt = ProjectFile.Extension,
                FileName = _model.ProjectName,
                Title = "Save MyProject Project"
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) == DialogResult.OK)
                SaveProject(dlg.FileName);
        }

        private void SaveProject(string path, bool showCompletionPopup = true)
        {
            if (!_model.IsModified && !string.IsNullOrEmpty(_model.FilePath)
                && string.Equals(_model.FilePath, path, StringComparison.OrdinalIgnoreCase))
            {
                statusLabel.Text = $"Already saved: {path}";
                return;
            }

            try
            {
                ProjectFile.Save(_model, path);
                _model.FilePath = path;
                _model.IsModified = false;
                AppSettings.RememberFromPath(path);
                UpdateTitleBar();
                statusLabel.Text = $"Saved: {path}";

                if (showCompletionPopup)
                {
                    CompletionDialog.Show(this,
                        "Save Complete",
                        "The project was saved successfully.",
                        path);
                }
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Save Error", "Could not save project.", ex);
            }
        }

        private bool TrySave()
        {
            if (!_model.IsModified)
                return true;

            if (string.IsNullOrEmpty(_model.FilePath))
            {
                using var dlg = new SaveFileDialog
                {
                    Filter = ProjectFile.FileFilter,
                    DefaultExt = ProjectFile.Extension,
                    FileName = _model.ProjectName,
                    Title = "Save MyProject Project"
                };
                AppSettings.ApplyTo(dlg);
                if (dlg.ShowDialog(this) != DialogResult.OK)
                    return false;

                SaveProject(dlg.FileName, showCompletionPopup: false);
            }
            else
            {
                SaveProject(_model.FilePath, showCompletionPopup: false);
            }

            return !_model.IsModified;
        }

        private bool ConfirmProceedWithoutSaving()
        {
            if (!_model.IsModified)
                return true;

            var result = MessageBox.Show(
                "Save changes to the current project?",
                "Unsaved Changes",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Question);

            return result switch
            {
                DialogResult.Yes => TrySave(),
                DialogResult.No => true,
                _ => false
            };
        }

        // ── Task commands ────────────────────────────────────────────────────

        private void OnAddTask()
        {
            var task = _model.AddTask("New Task", _lastSelectedId);
            ganttChartControl.SetSelectedTask(task.Id);
            taskGridControl.SetSelectedTask(task.Id);
            _lastSelectedId = task.Id;
            UpdateStatus(task.Id);
        }

        private void OnAddSubtask(int parentId)
        {
            if (parentId < 0) return;
            var task = _model.AddSubtask(parentId, "New Task");
            SelectTask(task.Id);
        }

        private void OnDeleteTask()
        {
            if (_lastSelectedId < 0) return;
            var task = _model.GetTask(_lastSelectedId);
            if (task == null) return;

            int subtreeCount = _model.GetSubtreeTaskCount(_lastSelectedId);
            string message = subtreeCount > 1
                ? $"Delete \"{task.Name}\" and {subtreeCount - 1} subtask(s)?"
                : $"Delete task \"{task.Name}\"?";

            if (MessageBox.Show(message, "Confirm Delete",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            {
                _model.RemoveTask(_lastSelectedId);
                _lastSelectedId = -1;
                ganttChartControl.SetSelectedTask(-1);
                taskGridControl.SetSelectedTask(-1);
                UpdateStatus(-1);
            }
        }

        private void OnIndent()
        {
            if (_lastSelectedId >= 0) _model.IndentTask(_lastSelectedId);
        }

        private void OnOutdent()
        {
            if (_lastSelectedId >= 0) _model.OutdentTask(_lastSelectedId);
        }

        private void OnLinkTasks()
        {
            if (_lastSelectedId < 0)
            {
                statusLabel.Text = "Select predecessor task first, then click Link.";
                return;
            }
            if (_linkSourceId < 0)
            {
                _linkSourceId = _lastSelectedId;
                var src = _model.GetTask(_linkSourceId);
                statusLabel.Text = $"Link source: [{src?.Name}] — select successor and click Link again ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                btnLink.Checked = true;
                return;
            }

            int succId = _lastSelectedId;
            if (succId == _linkSourceId)
            {
                CancelLink();
                return;
            }
            bool ok = _model.AddDependency(_linkSourceId, succId, dependencyTypeSelector.SelectedType);
            CancelLink();
            if (ok)
            {
                statusLabel.Text = $"Dependency created ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                return;
            }

            var pred = _model.GetTask(_linkSourceId);
            var succ = _model.GetTask(succId);
            string predName = pred?.Name ?? _linkSourceId.ToString();
            string succName = succ?.Name ?? succId.ToString();
            string lineType = DependencyTypeInfo.GetDisplayName(dependencyTypeSelector.SelectedType);

            ExceptionHandler.ShowInfo(this, "Link Error", "Could not create the dependency.",
                $"Predecessor: {predName} (ID {_linkSourceId})\n" +
                $"Successor: {succName} (ID {succId})\n" +
                $"Line type: {lineType}\n\n" +
                "Possible reasons:\n" +
                "- The same dependency already exists.\n" +
                "- Linking these tasks would create a circular dependency.\n" +
                "- One of the selected tasks is no longer available.");

            statusLabel.Text = "Dependency was not created.";
        }

        private void CancelLink()
        {
            _linkSourceId = -1;
            btnLink.Checked = false;
        }

        private void OpenTaskProperties(int taskId)
        {
            if (taskId < 0) return;
            var task = _model.GetTask(taskId);
            if (task == null) return;
            using var dlg = new TaskPropertiesDialog(task, _model);
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                _model.IsModified = true;
                ganttChartControl.Invalidate();
                taskGridControl.Invalidate();
                UpdateTitleBar();
                UpdateStatus(taskId);
            }
        }

        // ── Report / Print ───────────────────────────────────────────────────

        private void OnExportExcel()
        {
            using var dlg = new SaveFileDialog
            {
                Filter = "Excel Workbook (*.xlsx)|*.xlsx",
                DefaultExt = "xlsx",
                FileName = $"{_model.ProjectName}_Report"
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            try
            {
                ExcelReportGenerator.Export(_model, dlg.FileName);
                AppSettings.RememberFromPath(dlg.FileName);
                statusLabel.Text = $"Excel report saved: {dlg.FileName}";

                var exportPath = dlg.FileName;
                CompletionDialog.Show(
                    this,
                    "Export Complete",
                    "The Excel report was exported successfully.",
                    exportPath,
                    "Open File",
                    () =>
                    {
                        try
                        {
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exportPath)
                            {
                                UseShellExecute = true
                            });
                        }
                        catch (Exception ex)
                        {
                            ExceptionHandler.Show(this, "Open File Error", "Could not open the exported file.", ex);
                        }
                    });
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Export Error", "Could not export the Excel report.", ex);
            }
        }

        private void OnExportMarkdown()
        {
            using var dlg = new SaveFileDialog
            {
                Filter = "Markdown (*.md)|*.md",
                DefaultExt = "md",
                FileName = $"{_model.ProjectName}_Report"
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            try
            {
                var md = ReportGenerator.GenerateMarkdown(_model);
                File.WriteAllText(dlg.FileName, md, System.Text.Encoding.UTF8);
                AppSettings.RememberFromPath(dlg.FileName);
                statusLabel.Text = $"Report saved: {dlg.FileName}";

                var exportPath = dlg.FileName;
                CompletionDialog.Show(
                    this,
                    "Export Complete",
                    "The Markdown report was exported successfully.",
                    exportPath,
                    "Open File",
                    () =>
                    {
                        try
                        {
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exportPath)
                            {
                                UseShellExecute = true
                            });
                        }
                        catch (Exception ex)
                        {
                            ExceptionHandler.Show(this, "Open File Error", "Could not open the exported file.", ex);
                        }
                    });
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Export Error", "Could not export the Markdown report.", ex);
            }
        }

        private void OnExportPdf()
        {
            MessageBox.Show(
                "PDF export requires a PDF library.\n" +
                "Use Export as Markdown and convert with Pandoc, or copy the Markdown into Word.",
                "PDF Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnPrint()
        {
            try
            {
                using var pd = new PrintDialog();
                using var doc = new System.Drawing.Printing.PrintDocument();
                doc.PrintPage += GanttPrintPage;
                pd.Document = doc;
                if (pd.ShowDialog(this) == DialogResult.OK)
                {
                    doc.Print();
                    CompletionDialog.Show(
                        this,
                        "Print Complete",
                        "The schedule was sent to the printer.",
                        $"Printer: {doc.PrinterSettings.PrinterName}");
                }
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Print Error", "Could not print the schedule.", ex);
            }
        }

        private void GanttPrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {
            try
            {
                RenderPrintPage(e);
            }
            catch (Exception ex)
            {
                ExceptionHandler.Show(this, "Print Error", "Could not render the print page.", ex);
                e.Cancel = true;
            }
        }

        private void RenderPrintPage(System.Drawing.Printing.PrintPageEventArgs e)
        {
            var g = e.Graphics!;
            var pageRect = e.PageBounds;

            g.FillRectangle(Brushes.White, pageRect);

            // Title
            using var titleFont = new Font("Segoe UI", 14f, FontStyle.Bold);
            g.DrawString(_model.ProjectName, titleFont, Brushes.Black, 20, 20);

            using var subFont = new Font("Segoe UI", 9f);
            g.DrawString($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}  |  Tasks: {_model.Tasks.Count}",
                subFont, Brushes.Gray, 20, 44);

            // Simple task table
            int tableY = 70;
            int rowH = 20;
            var tasks = _model.Tasks;
            using var headerFont = new Font("Segoe UI", 9f, FontStyle.Bold);
            string[] headers = { "ID", "Task Name", "Start", "End", "Days", "Progress", "Assigned To" };
            int[] colW = { 30, 200, 80, 80, 40, 70, 120 };

            int x = 20;
            foreach (var (h, w) in headers.Zip(colW))
            {
                g.FillRectangle(new SolidBrush(Color.FromArgb(220, 228, 252)), x, tableY, w, rowH);
                g.DrawString(h, headerFont, Brushes.Black, x + 2, tableY + 3);
                x += w;
            }
            tableY += rowH;

            foreach (var task in tasks)
            {
                if (tableY + rowH > pageRect.Bottom - 40) break;

                x = 20;
                string[] cols = {
                    task.Id.ToString(),
                    new string(' ', task.IndentLevel * 2) + task.Name,
                    task.StartDate.ToString("MM/dd/yy"),
                    task.EndDate.ToString("MM/dd/yy"),
                    task.DurationDays.ToString(),
                    $"{task.Progress:0}%",
                    _model.GetTaskAssigneeDisplay(task.Id)
                };
                var bgColor = tableY / rowH % 2 == 0 ? Color.White : Color.FromArgb(248, 249, 251);
                foreach (var (col, w) in cols.Zip(colW))
                {
                    g.FillRectangle(new SolidBrush(bgColor), x, tableY, w, rowH);
                    g.DrawString(col, subFont, Brushes.Black, x + 2, tableY + 3);
                    x += w;
                }
                tableY += rowH;
            }

            // Border around table
            int tableW = colW.Sum();
            g.DrawRectangle(Pens.Gray, 20, 70, tableW, tableY - 70);

            e.HasMorePages = false;
        }
    }
}

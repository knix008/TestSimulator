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
        private bool _awaitingLinkPredecessor;
        private int _linkHoverTargetId = -1;
        private ProjectContextMenuBuilder? _contextMenuBuilder;
        private bool _isApplyingViewSettings;
        private int _propertiesPanelExpandedWidth = 300;
        private bool _isPropertiesPanelExpanded = true;

        private const int CollapsedPropertiesPanelWidth = 32;
        private const int ExpandedPropertiesPanelMinWidth = 220;

        public MainForm()
        {
            InitializeComponent();
            PostInitializeComponent();
            ApplyRenderers();
            SetupEventHandlers();
            LoadNewProject();
        }

        private void PostInitializeComponent()
        {
            mainMenuStrip.ImageScalingSize = new Size(16, 16);

            // Toolbar icons
            btnNew.Image        = AppIcons.New;
            btnOpen.Image       = AppIcons.Open;
            btnSave.Image       = AppIcons.Save;
            btnSaveAs.Image     = AppIcons.SaveAs;
            btnAddTask.Image    = AppIcons.AddTask;
            btnAddSubtask.Image = AppIcons.AddSubtask;
            btnDeleteTask.Image = AppIcons.Delete;
            btnTaskProps.Image  = AppIcons.Properties;
            btnNotes.Image      = AppIcons.Notes;
            btnIndent.Image     = AppIcons.Indent;
            btnOutdent.Image    = AppIcons.Outdent;
            btnExpandCollapse.Image = AppIcons.ExpandCollapse;
            btnCriticalPath.Image = AppIcons.CriticalPath;
            btnCriticalPath.CheckOnClick = true;
            btnLink.Image       = AppIcons.Link;
            btnLink.CheckOnClick = true;
            menuLink.CheckOnClick = true;
            btnNotes.CheckOnClick = true;
            btnZoomIn.Image     = AppIcons.ZoomIn;
            btnZoomOut.Image    = AppIcons.ZoomOut;
            btnToday.Image      = AppIcons.Today;
            btnPropertiesPanel.Image = AppIcons.PropertiesPanel;
            btnReport.Image     = AppIcons.Excel;
            btnExportMd.Image   = AppIcons.Markdown;
            btnExportPdf.Image  = AppIcons.Pdf;
            btnExportGanttImage.Image = AppIcons.Image;
            btnPrint.Image      = AppIcons.Print;

            // Top-level menu icons
            menuFile.Image   = AppIcons.File;
            menuTask.Image   = AppIcons.Edit;
            menuView.Image   = AppIcons.View;
            menuReport.Image = AppIcons.Report;

            // File menu
            menuNew.Image    = AppIcons.New;
            menuOpen.Image   = AppIcons.Open;
            menuSave.Image   = AppIcons.Save;
            menuSaveAs.Image = AppIcons.SaveAs;
            menuExit.Image   = AppIcons.Exit;

            // Task menu
            menuAddTask.Image       = AppIcons.AddTask;
            menuAddSubtask.Image    = AppIcons.Indent;
            menuDeleteTask.Image    = AppIcons.Delete;
            menuIndent.Image        = AppIcons.Indent;
            menuOutdent.Image       = AppIcons.Outdent;
            menuLink.Image          = AppIcons.Link;
            menuDepType.Image       = AppIcons.Link;
            menuTaskProps.Image     = AppIcons.Properties;
            menuExpandCollapse.Image = AppIcons.View;

            // View menu
            menuZoomIn.Image  = AppIcons.ZoomIn;
            menuZoomOut.Image = AppIcons.ZoomOut;
            menuToday.Image   = AppIcons.Today;
            menuPropertiesPanel.Image = AppIcons.PropertiesPanel;
            menuShowCriticalPath.Image = AppIcons.CriticalPath;

            // Report menu
            menuExportExcel.Image = AppIcons.Excel;
            menuExportHtml.Image  = AppIcons.Html;
            menuExportWord.Image  = AppIcons.Word;
            menuExportMd.Image  = AppIcons.Markdown;
            menuExportPdf.Image = AppIcons.Pdf;
            menuExportGanttImage.Image = AppIcons.Image;
            menuPrint.Image     = AppIcons.Print;

            // Tooltips
            var tt = new ToolTip { ShowAlways = true, AutomaticDelay = 400 };
            tt.SetToolTip(this, "MyProject - Project Manager");

            btnNew.ToolTipText        = "New Project (Ctrl+N)";
            btnOpen.ToolTipText       = "Open Project (Ctrl+O)";
            btnSave.ToolTipText       = "Save Project (Ctrl+S)";
            btnSaveAs.ToolTipText     = "Save Project As...";
            btnAddTask.ToolTipText    = "Add Task (Insert)";
            btnAddSubtask.ToolTipText = "Add Subtask (Ctrl+Shift+Insert)";
            btnDeleteTask.ToolTipText = "Delete Selected Task (Delete)";
            btnTaskProps.ToolTipText  = "Task Properties (F2)";
            btnNotes.ToolTipText      = "Add note on Gantt chart (selected task or click task bar)";
            btnIndent.ToolTipText     = "Indent Task (Alt+Right)";
            btnOutdent.ToolTipText    = "Outdent Task (Alt+Left)";
            btnExpandCollapse.ToolTipText = "Expand or collapse subtasks";
            btnCriticalPath.ToolTipText = "Show or hide critical path highlighting";
            btnLink.ToolTipText       = "Link Tasks — click task bars on Gantt chart (preview line shown)";
            dependencyTypeHost.ToolTipText = "Select dependency line type (shown with preview)";
            btnZoomIn.ToolTipText     = "Zoom In (Ctrl++)";
            btnZoomOut.ToolTipText    = "Zoom Out (Ctrl+-)";
            btnToday.ToolTipText      = "Scroll to Today (Ctrl+T)";
            btnPropertiesPanel.ToolTipText = "Show or hide the properties panel";
            btnReport.ToolTipText     = "Export schedule and progress to Excel";
            btnExportMd.ToolTipText   = "Export progress report as Markdown";
            btnExportPdf.ToolTipText  = "Export schedule report as PDF";
            btnExportGanttImage.ToolTipText = "Export Gantt chart as PNG, JPEG, GIF, or WebP";
            btnPrint.ToolTipText      = "Print Schedule (Ctrl+P)";

            menuNew.ToolTipText       = "Create a new empty project";
            menuOpen.ToolTipText      = "Open an existing project file";
            menuSave.ToolTipText      = "Save the current project";
            menuZoomIn.ToolTipText    = "Increase day column width";
            menuZoomOut.ToolTipText   = "Decrease day column width";
            menuToday.ToolTipText     = "Scroll the chart to today";
            menuPropertiesPanel.ToolTipText = "Show or hide the properties panel";
            menuShowCriticalPath.ToolTipText = "Highlight tasks and dependencies on the critical path";
            menuExportExcel.ToolTipText = "Export schedule, resources, notes, and progress to Excel";
            menuExportHtml.ToolTipText  = "Export schedule, resources, and notes to HTML";
            menuExportWord.ToolTipText  = "Export schedule, resources, and notes to Word";
            menuExportMd.ToolTipText  = "Save a Markdown progress report";
            menuExportPdf.ToolTipText = "Export schedule report as PDF";
            menuExportGanttImage.ToolTipText = "Export Gantt chart as PNG, JPEG, GIF, or WebP (transparent PNG/WebP)";
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

            menuNew.Click        += (_, _) => OnNew();
            menuOpen.Click       += (_, _) => OnOpen();
            menuSave.Click       += (_, _) => OnSave();
            menuSaveAs.Click     += (_, _) => OnSaveAs();
            menuExit.Click       += (_, _) => Close();

            menuAddTask.Click    += (_, _) => OnAddTask();
            menuAddSubtask.Click += (_, _) => OnAddSubtask(_lastSelectedId);
            menuDeleteTask.Click += (_, _) => OnDeleteTask();
            menuIndent.Click     += (_, _) => OnIndent();
            menuOutdent.Click    += (_, _) => OnOutdent();
            menuLink.Click       += (_, _) => OnLinkTasks();
            menuDepFS.Click      += (_, _) => SelectDependencyType(DependencyType.FS);
            menuDepFF.Click      += (_, _) => SelectDependencyType(DependencyType.FF);
            menuDepSS.Click      += (_, _) => SelectDependencyType(DependencyType.SS);
            menuDepSF.Click      += (_, _) => SelectDependencyType(DependencyType.SF);
            menuTaskProps.Click  += (_, _) => OpenTaskProperties(_lastSelectedId);
            menuExpandCollapse.Click += (_, _) => OnToggleExpandSelectedTask();
            menuTask.DropDownOpening += (_, _) => UpdateTaskToolState();

            menuZoomIn.Click  += (_, _) => OnZoomIn();
            menuZoomOut.Click += (_, _) => OnZoomOut();
            menuToday.Click   += (_, _) => ganttChartControl.GoToToday();
            menuPropertiesPanel.Click += (_, _) => OnPropertiesPanelMenuClick();
            menuShowCriticalPath.Click += (_, _) => OnShowCriticalPathMenuClick();

            menuExportExcel.Click += (_, _) => OnExportExcel();
            menuExportHtml.Click  += (_, _) => OnExportHtml();
            menuExportWord.Click  += (_, _) => OnExportWord();
            menuExportMd.Click  += (_, _) => OnExportMarkdown();
            menuExportPdf.Click += (_, _) => OnExportPdf();
            menuExportGanttImage.Click += (_, _) => OnExportGanttImage();
            menuPrint.Click     += (_, _) => OnPrint();

            btnNew.Click        += (_, _) => OnNew();
            btnOpen.Click       += (_, _) => OnOpen();
            btnSave.Click       += (_, _) => OnSave();
            btnSaveAs.Click     += (_, _) => OnSaveAs();
            btnAddTask.Click    += (_, _) => OnAddTask();
            btnAddSubtask.Click += (_, _) => OnAddSubtask(_lastSelectedId);
            btnDeleteTask.Click += (_, _) => OnDeleteTask();
            btnTaskProps.Click  += (_, _) => OpenTaskProperties(_lastSelectedId);
            btnNotes.Click      += (_, _) => OnNotesToolbarClick();
            btnIndent.Click     += (_, _) => OnIndent();
            btnOutdent.Click    += (_, _) => OnOutdent();
            btnExpandCollapse.Click += (_, _) => OnToggleExpandSelectedTask();
            btnCriticalPath.Click += (_, _) => OnShowCriticalPathToolbarClick();
            btnLink.Click       += (_, _) => OnLinkTasks();
            dependencyTypeSelector.SelectedType = AppSettings.DefaultDependencyType;
            dependencyTypeSelector.SelectedTypeChanged += (_, _) => OnDependencyTypeChanged();
            btnZoomIn.Click     += (_, _) => OnZoomIn();
            btnZoomOut.Click    += (_, _) => OnZoomOut();
            btnToday.Click      += (_, _) => ganttChartControl.GoToToday();
            btnPropertiesPanel.Click += (_, _) => OnPropertiesPanelToolbarClick();
            btnReport.Click     += (_, _) => OnExportExcel();
            btnExportMd.Click   += (_, _) => OnExportMarkdown();
            btnExportPdf.Click  += (_, _) => OnExportPdf();
            btnExportGanttImage.Click += (_, _) => OnExportGanttImage();
            btnPrint.Click      += (_, _) => OnPrint();

            taskGridControl.TaskSelected     += OnTaskSelected;
            taskGridControl.TaskHovered      += OnTaskHovered;
            taskGridControl.TaskDoubleClicked += (_, id) => OpenTaskProperties(id);
            taskGridControl.ScrollChanged    += (_, _) =>
                ganttChartControl.SyncScrollY(taskGridControl.ScrollOffsetY);

            ganttChartControl.TaskSelected      += OnTaskSelected;
            ganttChartControl.TaskHovered       += OnTaskHovered;
            ganttChartControl.LinkShapeClicked  += OnGanttLinkShapeClicked;
            ganttChartControl.TaskDoubleClicked += (_, id) => OpenTaskProperties(id);
            ganttChartControl.ScrollYChanged    += (_, scrollY) =>
                taskGridControl.SyncScroll(scrollY);

            taskGridControl.ContextMenuRequested += OnContextMenuRequested;
            ganttChartControl.ContextMenuRequested += OnContextMenuRequested;

            ganttChartControl.ViewZoomChanged += (_, _) => MarkViewSettingsModified();
            taskGridControl.ColumnWidthsChanged += (_, _) => MarkViewSettingsModified();
            splitContainer.SplitterMoved += (_, _) =>
            {
                if (_isApplyingViewSettings) return;
                MarkViewSettingsModified();
            };
            ganttSplitContainer.SplitterMoved += (_, _) =>
            {
                if (_isApplyingViewSettings) return;
                MarkViewSettingsModified();
            };

            selectionPropertiesControl.CollapseRequested += (_, _) => OnPropertiesPanelCollapseFromPanel();
            selectionPropertiesControl.ExpandRequested += (_, _) => OnPropertiesPanelExpandFromPanel();

            ganttChartControl.NoteSelected += OnNoteSelected;

            FormClosing += OnFormClosing;
            FormClosed += OnFormClosed;

            KeyPreview = true;
            KeyDown += (_, e) =>
            {
                if (e.KeyCode == Keys.Delete)
                {
                    if (ganttChartControl.SelectedNoteId >= 0)
                    {
                        DeleteNoteById(ganttChartControl.SelectedNoteId);
                        e.Handled = true;
                        return;
                    }

                    if (_lastSelectedId >= 0)
                    {
                        OnDeleteTask();
                        e.Handled = true;
                        return;
                    }
                }

                if (e.KeyCode != Keys.Escape || !IsLinkModeActive)
                    return;

                CancelLink();
                statusLabel.Text = "Link cancelled.";
                e.Handled = true;
            };
        }

        private bool IsLinkModeActive => _awaitingLinkPredecessor || _linkSourceId >= 0;

        private void OnFormClosing(object? sender, FormClosingEventArgs e)
        {
            taskGridControl.CancelInteraction();

            if (!ShouldCloseWithoutSavePrompt() && _model.IsModified && !ConfirmProceedWithoutSaving())
            {
                e.Cancel = true;
                return;
            }

            AppShutdown.BeginShutdown();

            try { AppSettings.Save(); }
            catch { /* ignore settings write errors during shutdown */ }
        }

        private static bool ShouldCloseWithoutSavePrompt() =>
            AppShutdown.LaunchedUnderDebugger;

        private void OnFormClosed(object? sender, FormClosedEventArgs e)
        {
            DetachFromModel();

            if (_titleBarModel != null)
                _titleBarModel.ModelChanged -= OnModelChangedForTitleBar;

            AppShutdown.ExitProcessIfDebugSession();
        }

        private void DetachFromModel()
        {
            taskGridControl.DetachModel();
            ganttChartControl.DetachModel();
        }

        private ProjectContextMenuBuilder CreateContextMenuBuilder() =>
            new()
            {
                AddTask = OnAddTask,
                AddSubtask = id => OnAddSubtask(id),
                OpenTaskProperties = id => OpenTaskProperties(id),
                DeleteTask = id => DeleteTaskById(id),
                IndentTask = id => IndentTaskById(id),
                OutdentTask = id => OutdentTaskById(id),
                LinkFromTask = id => LinkFromTask(id),
                ToggleExpandTask = id => ToggleExpandTask(id),
                AddNoteToTask = id => ganttChartControl.AddNoteForTask(id),
                EditNote = id => ganttChartControl.BeginInlineNoteEdit(id),
                DeleteNote = id => DeleteNoteById(id),
                ZoomIn = OnZoomIn,
                ZoomOut = OnZoomOut,
                GoToToday = () => ganttChartControl.GoToToday(),
                RenameProject = () => taskGridControl.StartProjectNameEdit()
            };

        private void OnContextMenuRequested(object? sender, ContextMenuRequestEventArgs e)
        {
            if (sender is not Control control) return;

            var menu = _contextMenuBuilder!.Build(e.Target, e.TaskId, e.NoteId, _model);
            menu.Tag = control;
            menu.Show(control, e.Location);
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

            _awaitingLinkPredecessor = false;
            _linkSourceId = taskId;
            btnLink.Checked = true;
            menuLink.Checked = true;
            SelectTask(taskId);
            UpdateLinkPreview();
            ganttChartControl.Focus();

            var src = _model.GetTask(taskId);
            statusLabel.Text = $"Link source: [{src?.Name}] — click another task bar on the Gantt chart ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
        }

        private void ToggleExpandTask(int taskId)
        {
            _model.ToggleExpanded(taskId);
            taskGridControl.Invalidate();
            ganttChartControl.Invalidate();
            UpdateTaskToolState();
        }

        private void SelectTask(int taskId)
        {
            _lastSelectedId = taskId;
            taskGridControl.SetSelectedTask(taskId);
            ganttChartControl.SetSelectedTask(taskId);
            UpdateStatus(taskId);
            UpdateTaskToolState();
        }

        // ── Model loading ────────────────────────────────────────────────────

        private void LoadNewProject()
        {
            _model = new ProjectModel
            {
                ProjectName = "New Project",
                ViewSettings = ProjectViewSettings.CreateDefault()
            };
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
            selectionPropertiesControl.SetModel(_model);
            ApplyViewSettingsFromModel();

            _lastSelectedId = -1;
            CancelLink();
            taskGridControl.SetSelectedTask(-1);
            ganttChartControl.SetSelectedTask(-1);
            selectionPropertiesControl.SetSelection(-1, -1);

            UpdateTitleBar();
            UpdateStatus(-1);
            UpdateTaskToolState();
        }

        private void CaptureViewSettingsToModel()
        {
            _model.ViewSettings = BuildViewSettingsFromUi();
        }

        private ProjectViewSettings BuildViewSettingsFromUi()
        {
            var prev = _model.ViewSettings;
            bool panelVisible = _isPropertiesPanelExpanded;
            int panelWidth = panelVisible
                ? Math.Clamp(ganttSplitContainer.Panel2.Width, ExpandedPropertiesPanelMinWidth, 600)
                : prev.PropertiesPanelWidth;

            return new ProjectViewSettings
            {
                TaskGridColumnWidths = taskGridControl.GetColumnWidths(),
                DefaultDependencyType = dependencyTypeSelector.SelectedType,
                DayWidth = ganttChartControl.Viewport.DayWidth,
                SplitterDistance = splitContainer.SplitterDistance,
                PropertiesPanelWidth = panelWidth,
                PropertiesPanelVisible = panelVisible,
                ShowCriticalPath = btnCriticalPath.Checked,
                NotesPanelHeight = prev.NotesPanelHeight,
                NotesPanelVisible = prev.NotesPanelVisible
            };
        }

        private void ApplyPropertiesPanelWidth(int propsWidth)
        {
            propsWidth = Math.Clamp(propsWidth, ExpandedPropertiesPanelMinWidth, 600);
            _propertiesPanelExpandedWidth = propsWidth;

            int ganttMax = Math.Max(
                ganttSplitContainer.Panel1MinSize,
                ganttSplitContainer.Width - propsWidth - ganttSplitContainer.SplitterWidth);
            if (ganttMax >= ganttSplitContainer.Panel1MinSize)
                ganttSplitContainer.SplitterDistance = Math.Clamp(
                    ganttSplitContainer.Width - propsWidth - ganttSplitContainer.SplitterWidth,
                    ganttSplitContainer.Panel1MinSize,
                    ganttMax);
        }

        private void CollapsePropertiesPanel()
        {
            int width = ganttSplitContainer.Panel2.Width;
            if (width >= ExpandedPropertiesPanelMinWidth)
            {
                _propertiesPanelExpandedWidth = width;
                _model.ViewSettings.PropertiesPanelWidth = width;
            }

            ganttSplitContainer.Panel2MinSize = CollapsedPropertiesPanelWidth;
            int splitDistance = ganttSplitContainer.Width - CollapsedPropertiesPanelWidth - ganttSplitContainer.SplitterWidth;
            if (splitDistance >= ganttSplitContainer.Panel1MinSize)
                ganttSplitContainer.SplitterDistance = splitDistance;

            selectionPropertiesControl.SetCollapsed(true);
            _isPropertiesPanelExpanded = false;
        }

        private void ExpandPropertiesPanel()
        {
            ganttSplitContainer.Panel2MinSize = ExpandedPropertiesPanelMinWidth;
            ApplyPropertiesPanelWidth(_propertiesPanelExpandedWidth);
            selectionPropertiesControl.SetCollapsed(false);
            _isPropertiesPanelExpanded = true;
        }

        private void SetPropertiesPanelVisible(bool visible)
        {
            if (visible == _isPropertiesPanelExpanded)
            {
                SyncPropertiesPanelUi(visible);
                return;
            }

            if (visible)
                ExpandPropertiesPanel();
            else
                CollapsePropertiesPanel();

            _model.ViewSettings.PropertiesPanelVisible = visible;
            SyncPropertiesPanelUi(visible);
        }

        private void OnPropertiesPanelCollapseFromPanel()
        {
            if (_isApplyingViewSettings || !_isPropertiesPanelExpanded)
                return;

            _isApplyingViewSettings = true;
            try
            {
                SetPropertiesPanelVisible(false);
            }
            finally
            {
                _isApplyingViewSettings = false;
            }
            MarkViewSettingsModified();
        }

        private void OnPropertiesPanelExpandFromPanel()
        {
            if (_isApplyingViewSettings || _isPropertiesPanelExpanded)
                return;

            _isApplyingViewSettings = true;
            try
            {
                SetPropertiesPanelVisible(true);
            }
            finally
            {
                _isApplyingViewSettings = false;
            }
            MarkViewSettingsModified();
        }

        private void SyncPropertiesPanelUi(bool visible)
        {
            btnPropertiesPanel.Checked = visible;
            menuPropertiesPanel.Checked = visible;
        }

        private void OnPropertiesPanelToolbarClick()
        {
            if (_isApplyingViewSettings) return;
            _isApplyingViewSettings = true;
            try
            {
                SetPropertiesPanelVisible(btnPropertiesPanel.Checked);
            }
            finally
            {
                _isApplyingViewSettings = false;
            }
            MarkViewSettingsModified();
        }

        private void OnPropertiesPanelMenuClick()
        {
            if (_isApplyingViewSettings) return;
            _isApplyingViewSettings = true;
            try
            {
                SetPropertiesPanelVisible(menuPropertiesPanel.Checked);
            }
            finally
            {
                _isApplyingViewSettings = false;
            }
            MarkViewSettingsModified();
        }

        private void ApplyViewSettingsFromModel()
        {
            _isApplyingViewSettings = true;
            try
            {
                var settings = _model.ViewSettings;
                taskGridControl.ApplyColumnWidths(settings.TaskGridColumnWidths);
                dependencyTypeSelector.SelectedType = settings.DefaultDependencyType;
                ganttChartControl.ApplyDayWidth(settings.DayWidth);

                int maxDistance = Math.Max(
                    splitContainer.Panel1MinSize,
                    splitContainer.Width - splitContainer.Panel2MinSize - splitContainer.SplitterWidth);
                if (maxDistance >= splitContainer.Panel1MinSize)
                {
                    splitContainer.SplitterDistance = Math.Clamp(
                        settings.SplitterDistance,
                        splitContainer.Panel1MinSize,
                        maxDistance);
                }

                int propsWidth = Math.Clamp(settings.PropertiesPanelWidth, ExpandedPropertiesPanelMinWidth, 600);
                _propertiesPanelExpandedWidth = propsWidth;

                if (settings.PropertiesPanelVisible)
                    ExpandPropertiesPanel();
                else
                    CollapsePropertiesPanel();

                SyncPropertiesPanelUi(settings.PropertiesPanelVisible);
                ApplyShowCriticalPath(settings.ShowCriticalPath);
            }
            finally
            {
                _isApplyingViewSettings = false;
            }

            _model.ViewSettings = BuildViewSettingsFromUi();
        }

        private void ApplyShowCriticalPath(bool show)
        {
            btnCriticalPath.Checked = show;
            menuShowCriticalPath.Checked = show;
            ganttChartControl.ShowCriticalPath = show;
            taskGridControl.ShowCriticalPath = show;
        }

        private void OnShowCriticalPathToolbarClick()
        {
            if (_isApplyingViewSettings) return;
            ApplyShowCriticalPath(btnCriticalPath.Checked);
            MarkViewSettingsModified();
        }

        private void OnShowCriticalPathMenuClick()
        {
            if (_isApplyingViewSettings) return;
            ApplyShowCriticalPath(menuShowCriticalPath.Checked);
            MarkViewSettingsModified();
        }

        private void MarkViewSettingsModified()
        {
            if (_isApplyingViewSettings)
                return;

            var captured = BuildViewSettingsFromUi();
            if (ProjectViewSettings.Equals(_model.ViewSettings, captured))
                return;

            _model.ViewSettings = captured;
            _model.IsModified = true;
            UpdateTitleBar();
        }

        private void DeleteNoteById(int noteId)
        {
            _model.RemoveNote(noteId);
            ganttChartControl.ClearNoteSelection();
            ganttChartControl.EndInlineNoteEdit(false);
            selectionPropertiesControl.SetSelection(ganttChartControl.SelectedTaskId, -1);
            ganttChartControl.Invalidate();
        }

        private void OnNotesToolbarClick()
        {
            if (btnNotes.Checked)
            {
                CancelLink();

                if (_lastSelectedId >= 0)
                {
                    ganttChartControl.AddNoteForTask(_lastSelectedId);
                    btnNotes.Checked = false;
                    ganttChartControl.SetNoteModeActive(false);
                    statusLabel.Text = "Note added to selected task.";
                    return;
                }

                ganttChartControl.SetNoteModeActive(true);
                statusLabel.Text = "Note mode: click a task bar on the Gantt chart to add a yellow note.";
                return;
            }

            ganttChartControl.SetNoteModeActive(false);
            statusLabel.Text = "Ready";
        }

        private void OnZoomIn()
        {
            ganttChartControl.ZoomIn();
        }

        private void OnZoomOut()
        {
            ganttChartControl.ZoomOut();
        }

        private void OnModelChangedForTitleBar(object? sender, EventArgs e) => UpdateTitleBar();

        // ── Selection ────────────────────────────────────────────────────────

        private void OnTaskSelected(object? sender, int taskId)
        {
            _lastSelectedId = taskId;
            if (sender != taskGridControl) taskGridControl.SetSelectedTask(taskId);
            if (sender != ganttChartControl) ganttChartControl.SetSelectedTask(taskId);

            int noteId = sender == ganttChartControl ? ganttChartControl.SelectedNoteId : -1;
            if (sender == taskGridControl)
                ganttChartControl.ClearNoteSelection();

            selectionPropertiesControl.SetSelection(taskId, noteId);
            UpdateStatus(taskId);
            UpdateTaskToolState();

            if (sender == ganttChartControl && IsLinkModeActive)
                return;

            if (_awaitingLinkPredecessor && taskId >= 0)
            {
                _awaitingLinkPredecessor = false;
                _linkSourceId = taskId;
                var src = _model.GetTask(taskId);
                statusLabel.Text = $"Link source: [{src?.Name}] — select successor task ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                btnLink.Checked = true;
                menuLink.Checked = true;
                _linkHoverTargetId = -1;
                UpdateLinkPreview();
                return;
            }

            if (_linkSourceId >= 0 && taskId >= 0 && taskId != _linkSourceId)
                TryCreateDependency(_linkSourceId, taskId);
        }

        private void OnNoteSelected(object? sender, int noteId)
        {
            selectionPropertiesControl.SetSelection(ganttChartControl.SelectedTaskId, noteId);
        }

        private void OnGanttLinkShapeClicked(object? sender, int taskId)
        {
            if (!IsLinkModeActive || taskId < 0)
                return;

            if (_awaitingLinkPredecessor)
            {
                _awaitingLinkPredecessor = false;
                _linkSourceId = taskId;
                var src = _model.GetTask(taskId);
                statusLabel.Text = $"Link source: [{src?.Name}] — click another task bar on the Gantt chart ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                btnLink.Checked = true;
                menuLink.Checked = true;
                _linkHoverTargetId = -1;
                UpdateLinkPreview();
                return;
            }

            if (_linkSourceId < 0)
            {
                _linkSourceId = taskId;
                btnLink.Checked = true;
                menuLink.Checked = true;
                _linkHoverTargetId = -1;
                UpdateLinkPreview();
                var src = _model.GetTask(_linkSourceId);
                statusLabel.Text = $"Link source: [{src?.Name}] — click another task bar on the Gantt chart ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                return;
            }

            if (taskId == _linkSourceId)
                return;

            TryCreateDependency(_linkSourceId, taskId);
        }

        private void OnTaskHovered(object? sender, int taskId)
        {
            if (_linkSourceId < 0)
                return;

            if (taskId == _linkSourceId)
                taskId = -1;

            if (_linkHoverTargetId == taskId)
                return;

            _linkHoverTargetId = taskId;
            UpdateLinkPreview();
        }

        private void UpdateLinkPreview()
        {
            if (_linkSourceId >= 0)
            {
                ganttChartControl.SetLinkPreview(
                    true,
                    _linkSourceId,
                    _linkHoverTargetId,
                    dependencyTypeSelector.SelectedType);
                return;
            }

            if (_awaitingLinkPredecessor)
            {
                ganttChartControl.SetLinkPreview(true, -1, -1, dependencyTypeSelector.SelectedType);
                return;
            }

            _linkHoverTargetId = -1;
            ganttChartControl.ClearLinkPreview();
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
            _model = new ProjectModel
            {
                ProjectName = "New Project",
                ViewSettings = ProjectViewSettings.CreateDefault()
            };
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
                ErrorDialog.Show(this, "Open Error", "Could not open the project file.", ex);
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
                CaptureViewSettingsToModel();
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
                ErrorDialog.Show(this, "Save Error", "Could not save the project file.", ex);
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
                this,
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
                UpdateTaskToolState();
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

        private void OnToggleExpandSelectedTask()
        {
            if (_lastSelectedId >= 0)
                ToggleExpandTask(_lastSelectedId);
        }

        private void SelectDependencyType(DependencyType type)
        {
            dependencyTypeSelector.SelectedType = type;
        }

        private void UpdateTaskToolState()
        {
            bool hasSelection = _lastSelectedId >= 0;
            var task = hasSelection ? _model.GetTask(_lastSelectedId) : null;
            bool hasChildren = hasSelection && _model.HasChildren(_lastSelectedId);

            menuAddSubtask.Enabled = hasSelection;
            menuDeleteTask.Enabled = hasSelection;
            menuIndent.Enabled = hasSelection;
            menuOutdent.Enabled = hasSelection;
            menuTaskProps.Enabled = hasSelection;
            menuLink.Enabled = true;
            menuLink.Checked = IsLinkModeActive;
            menuExpandCollapse.Enabled = hasChildren;

            btnAddSubtask.Enabled = hasSelection;
            btnDeleteTask.Enabled = hasSelection;
            btnTaskProps.Enabled = hasSelection;
            btnIndent.Enabled = hasSelection;
            btnOutdent.Enabled = hasSelection;
            btnExpandCollapse.Enabled = hasChildren;
            btnLink.Checked = IsLinkModeActive;

            string expandText = hasChildren && task != null && task.IsExpanded
                ? "Collapse Subtasks"
                : "Expand Subtasks";

            menuExpandCollapse.Text = expandText;
            btnExpandCollapse.Text = expandText;
            btnExpandCollapse.ToolTipText = hasChildren
                ? expandText
                : "Expand or collapse subtasks (select a summary task)";

            UpdateDependencyTypeMenuChecks();
        }

        private void UpdateDependencyTypeMenuChecks()
        {
            var selected = dependencyTypeSelector.SelectedType;
            menuDepFS.Checked = selected == DependencyType.FS;
            menuDepFF.Checked = selected == DependencyType.FF;
            menuDepSS.Checked = selected == DependencyType.SS;
            menuDepSF.Checked = selected == DependencyType.SF;
        }

        private void OnLinkTasks()
        {
            if (_awaitingLinkPredecessor || _linkSourceId >= 0)
            {
                CancelLink();
                statusLabel.Text = "Link cancelled.";
                return;
            }

            ganttChartControl.Focus();

            if (_lastSelectedId < 0)
            {
                _awaitingLinkPredecessor = true;
                btnLink.Checked = true;
                menuLink.Checked = true;
                UpdateLinkPreview();
                statusLabel.Text = $"Click a task bar on the Gantt chart, then click another to link ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                return;
            }

            _linkSourceId = _lastSelectedId;
            btnLink.Checked = true;
            menuLink.Checked = true;
            _linkHoverTargetId = -1;
            UpdateLinkPreview();
            var src = _model.GetTask(_linkSourceId);
            statusLabel.Text = $"Link source: [{src?.Name}] — click another task bar on the Gantt chart ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
        }

        private bool TryCreateDependency(int predId, int succId)
        {
            if (predId == succId)
                return false;

            if (_model.AddDependency(predId, succId, dependencyTypeSelector.SelectedType))
            {
                CancelLink();
                statusLabel.Text = $"Dependency created ({DependencyTypeInfo.GetShortName(dependencyTypeSelector.SelectedType)}).";
                ganttChartControl.Invalidate();
                taskGridControl.Invalidate();
                return true;
            }

            ShowLinkError(predId, succId);
            return false;
        }

        private void ShowLinkError(int predId, int succId)
        {
            var pred = _model.GetTask(predId);
            var succ = _model.GetTask(succId);
            string predName = pred?.Name ?? predId.ToString();
            string succName = succ?.Name ?? succId.ToString();
            string lineType = DependencyTypeInfo.GetDisplayName(dependencyTypeSelector.SelectedType);

            string details =
                $"Predecessor: {predName} (ID {predId})\n" +
                $"Successor: {succName} (ID {succId})\n" +
                $"Line type: {lineType}\n\n" +
                "Possible reasons:\n" +
                "- The same dependency already exists.\n" +
                "- Linking these tasks would create a circular dependency.\n" +
                "- One of the selected tasks is no longer available.";

            ErrorDialog.Show(this, "Link Error", "Could not create the dependency.", details);

            statusLabel.Text = "Dependency was not created. Select another successor or cancel Link.";
        }

        private void CancelLink()
        {
            _linkSourceId = -1;
            _awaitingLinkPredecessor = false;
            _linkHoverTargetId = -1;
            btnLink.Checked = false;
            menuLink.Checked = false;
            ganttChartControl.ClearLinkPreview();
        }

        private void OnDependencyTypeChanged()
        {
            if (_isApplyingViewSettings)
                return;

            var type = dependencyTypeSelector.SelectedType;
            AppSettings.RememberDependencyType(type);
            bool prefChanged = _model.ViewSettings.DefaultDependencyType != type;
            if (prefChanged)
                _model.ViewSettings.DefaultDependencyType = type;

            if (ApplyDependencyTypeToSelectedTask())
                statusLabel.Text = $"Dependency line type set to {DependencyTypeInfo.GetShortName(type)}.";
            else if (prefChanged)
            {
                _model.IsModified = true;
                UpdateTitleBar();
                if (_linkSourceId >= 0)
                {
                    var src = _model.GetTask(_linkSourceId);
                    statusLabel.Text = $"Link source: [{src?.Name}] — select successor task ({DependencyTypeInfo.GetShortName(type)}).";
                }
            }

            UpdateLinkPreview();
            UpdateDependencyTypeMenuChecks();
            ganttChartControl.Invalidate();
            taskGridControl.Invalidate();
        }

        private bool ApplyDependencyTypeToSelectedTask()
        {
            if (_lastSelectedId < 0) return false;

            var type = dependencyTypeSelector.SelectedType;

            if (_linkSourceId >= 0 && _linkSourceId != _lastSelectedId)
            {
                if (_model.SetDependencyType(_linkSourceId, _lastSelectedId, type))
                    return true;
            }

            var incoming = _model.Dependencies.Where(d => d.SuccessorId == _lastSelectedId).ToList();
            if (incoming.Count == 1)
                return _model.SetDependencyType(incoming[0].PredecessorId, _lastSelectedId, type);

            var outgoing = _model.Dependencies.Where(d => d.PredecessorId == _lastSelectedId).ToList();
            if (outgoing.Count == 1)
                return _model.SetDependencyType(_lastSelectedId, outgoing[0].SuccessorId, type);

            return false;
        }

        private void OpenTaskProperties(int taskId)
        {
            if (taskId < 0) return;
            var task = _model.GetTask(taskId);
            if (task == null) return;
            using var dlg = new TaskPropertiesDialog(task, _model);
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                _model.NotifyViewsChanged();
                ganttChartControl.Invalidate();
                taskGridControl.Invalidate();
                UpdateTitleBar();
                UpdateStatus(taskId);
            }
        }

        // ── Report / Print ───────────────────────────────────────────────────

        private void OnExportExcel() =>
            ExportReport(
                "Excel Workbook (*.xlsx)|*.xlsx",
                "xlsx",
                path => ExcelReportGenerator.Export(_model, path),
                "Excel report",
                "The Excel report was exported successfully.");

        private void OnExportHtml() =>
            ExportReport(
                "HTML Document (*.html)|*.html",
                "html",
                path => HtmlReportGenerator.Export(_model, path),
                "HTML report",
                "The HTML report was exported successfully.");

        private void OnExportWord() =>
            ExportReport(
                "Word Document (*.docx)|*.docx",
                "docx",
                path => WordReportGenerator.Export(_model, path),
                "Word report",
                "The Word report was exported successfully.");

        private void OnExportPdf() =>
            ExportReport(
                "PDF Document (*.pdf)|*.pdf",
                "pdf",
                path => PdfReportGenerator.Export(_model, path),
                "PDF report",
                "The PDF report was exported successfully.");

        private void ExportReport(
            string filter,
            string defaultExt,
            Action<string> export,
            string reportLabel,
            string completionMessage)
        {
            using var dlg = new SaveFileDialog
            {
                Filter = filter,
                DefaultExt = defaultExt,
                FileName = $"{_model.ProjectName}_Report"
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            try
            {
                export(dlg.FileName);
                AppSettings.RememberFromPath(dlg.FileName);
                statusLabel.Text = $"{reportLabel} saved: {dlg.FileName}";

                var exportPath = dlg.FileName;
                CompletionDialog.Show(
                    this,
                    "Export Complete",
                    completionMessage,
                    exportPath,
                    "Open File",
                    () => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exportPath)
                    {
                        UseShellExecute = true
                    }));
            }
            catch (Exception ex)
            {
                ErrorDialog.Show(this, "Export Error", $"Could not export the {reportLabel}.", ex);
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
                    () => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exportPath)
                    {
                        UseShellExecute = true
                    }));
            }
            catch (Exception ex)
            {
                ErrorDialog.Show(this, "Export Error", "Could not export the Markdown report.", ex);
            }
        }

        private void OnExportGanttImage()
        {
            using var dlg = new SaveFileDialog
            {
                Filter =
                    "PNG Image (*.png)|*.png|JPEG Image (*.jpg)|*.jpg;*.jpeg|GIF Image (*.gif)|*.gif|WebP Image (*.webp)|*.webp",
                DefaultExt = "png",
                FileName = $"{_model.ProjectName}_Gantt"
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            try
            {
                var format = GanttImageExporter.FormatFromExtension(dlg.FileName);
                bool transparent = GanttImageExporter.SupportsTransparentBackground(format);

                using var bitmap = ganttChartControl.ExportToBitmap(transparent);
                GanttImageExporter.Save(bitmap, dlg.FileName, format, transparent);

                AppSettings.RememberFromPath(dlg.FileName);
                statusLabel.Text = $"Gantt image saved: {dlg.FileName}";

                var exportPath = dlg.FileName;
                CompletionDialog.Show(
                    this,
                    "Export Complete",
                    "The Gantt chart image was exported successfully.",
                    exportPath,
                    "Open File",
                    () => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exportPath)
                    {
                        UseShellExecute = true
                    }));
            }
            catch (Exception ex)
            {
                ErrorDialog.Show(this, "Export Error", "Could not export the Gantt chart image.", ex);
            }
        }

        private void OnPrint()
        {
            using var pd = new PrintDialog();
            using var doc = new System.Drawing.Printing.PrintDocument();
            doc.PrintPage += GanttPrintPage;
            pd.Document = doc;
            if (pd.ShowDialog(this) == DialogResult.OK)
            {
                try
                {
                    doc.Print();
                    CompletionDialog.Show(
                        this,
                        "Print Complete",
                        "The schedule was sent to the printer.",
                        $"Printer: {doc.PrinterSettings.PrinterName}");
                }
                catch (Exception ex)
                {
                    ErrorDialog.Show(this, "Print Error", "Could not print the schedule.", ex);
                }
            }
        }

        private void GanttPrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e) =>
            RenderPrintPage(e);

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

using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Controls
{
  public sealed class SelectionPropertiesControl : UserControl
  {
    private ProjectModel? _model;
    private int _taskId = -1;
    private int _noteId = -1;
    private bool _suppressChanges;
    private bool _applyingToModel;

    private readonly Label _headerLabel;
    private readonly Button _btnCollapse;
    private readonly Panel _mainContent;
    private readonly Panel _collapsedStrip;
    private readonly Button _btnExpand;
    private readonly Label _emptyLabel;
    private readonly Panel _contentPanel;
    private readonly GroupBox _noteGroup;
    private TextBox _noteTitle = null!;
    private RichNoteEditorControl _noteEditor = null!;
    private ComboBox _noteLinkedTask = null!;
    private DateTimePicker _noteAnchorDate = null!;
    private GroupBox _taskGroup = null!;
    private TextBox _taskName = null!;
    private ComboBox _taskType = null!;
    private DateTimePicker _taskStart = null!;
    private NumericUpDown _taskDuration = null!;
    private Label _taskEndLabel = null!;
    private NumericUpDown _taskProgress = null!;
    private CheckBox _taskAutoSchedule = null!;
    private CheckBox _taskCritical = null!;
    private TextBox _taskDeliverable = null!;
    private TextBox _taskNotes = null!;
    private Panel _taskBarColorPreview = null!;
    private Panel _taskProgressColorPreview = null!;
    private DataGridView _resourceGrid = null!;
    private Label _resourceTotalLabel = null!;
    private DataGridView _dependencyGrid = null!;

    public event EventHandler? CollapseRequested;
    public event EventHandler? ExpandRequested;

    public bool IsCollapsed => _collapsedStrip.Visible;

    public SelectionPropertiesControl()
    {
      BackColor = AppTheme.SidebarColor;
      Font = AppTheme.FontNormal;
      Dock = DockStyle.Fill;
      Padding = new Padding(0);

      _headerLabel = new Label
      {
        Dock = DockStyle.Fill,
        Font = AppTheme.FontBold,
        ForeColor = AppTheme.TextPrimary,
        Text = "Properties",
        TextAlign = ContentAlignment.MiddleLeft,
        Padding = new Padding(8, 0, 0, 0)
      };

      _btnCollapse = new Button
      {
        Dock = DockStyle.Right,
        Width = 28,
        FlatStyle = FlatStyle.Flat,
        Text = "»",
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = AppTheme.TextSecondary,
        BackColor = AppTheme.SidebarColor,
        Cursor = Cursors.Hand,
        TabStop = false
      };
      _btnCollapse.FlatAppearance.BorderSize = 0;
      _btnCollapse.Click += (_, _) => CollapseRequested?.Invoke(this, EventArgs.Empty);

      var headerBar = new Panel
      {
        Dock = DockStyle.Top,
        Height = 28,
        Padding = new Padding(0, 0, 4, 0)
      };
      headerBar.Controls.Add(_headerLabel);
      headerBar.Controls.Add(_btnCollapse);

      _emptyLabel = new Label
      {
        Dock = DockStyle.Top,
        Height = 48,
        ForeColor = AppTheme.TextSecondary,
        Text = "Select a task or note to edit its properties.",
        Padding = new Padding(0, 8, 0, 0)
      };

      var scroll = new Panel
      {
        Dock = DockStyle.Fill,
        AutoScroll = true,
        Padding = new Padding(0, 4, 0, 8)
      };

      _contentPanel = new Panel
      {
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        Width = 260
      };

      _noteGroup = BuildNoteGroup();
      _taskGroup = BuildTaskGroup();

      _contentPanel.Controls.Add(_taskGroup);
      _contentPanel.Controls.Add(_noteGroup);
      scroll.Controls.Add(_contentPanel);

      _mainContent = new Panel
      {
        Dock = DockStyle.Fill,
        Padding = new Padding(8, 0, 8, 8)
      };
      _mainContent.Controls.Add(scroll);
      _mainContent.Controls.Add(_emptyLabel);
      _mainContent.Controls.Add(headerBar);

      _btnExpand = new Button
      {
        Size = new Size(24, 48),
        FlatStyle = FlatStyle.Flat,
        Text = "«",
        Font = new Font("Segoe UI", 10f, FontStyle.Bold),
        ForeColor = AppTheme.TextSecondary,
        BackColor = AppTheme.SidebarColor,
        Cursor = Cursors.Hand,
        TabStop = false,
        Anchor = AnchorStyles.Top
      };
      _btnExpand.FlatAppearance.BorderSize = 0;
      _btnExpand.Click += (_, _) => ExpandRequested?.Invoke(this, EventArgs.Empty);

      _collapsedStrip = new Panel
      {
        Dock = DockStyle.Fill,
        Visible = false,
        Padding = new Padding(2, 8, 2, 0)
      };
      _collapsedStrip.Controls.Add(_btnExpand);
      _collapsedStrip.Resize += (_, _) =>
      {
        _btnExpand.Location = new Point(
          (_collapsedStrip.ClientSize.Width - _btnExpand.Width) / 2,
          8);
      };

      var toolTip = new ToolTip { ShowAlways = true, AutomaticDelay = 400 };
      toolTip.SetToolTip(_btnCollapse, "Collapse properties panel");
      toolTip.SetToolTip(_btnExpand, "Expand properties panel");

      Controls.Add(_collapsedStrip);
      Controls.Add(_mainContent);

      ShowEmptyState();
    }

    public void SetCollapsed(bool collapsed)
    {
      _mainContent.Visible = !collapsed;
      _collapsedStrip.Visible = collapsed;
      if (collapsed)
        _btnExpand.Location = new Point(
          (_collapsedStrip.ClientSize.Width - _btnExpand.Width) / 2,
          8);
    }

    public void SetModel(ProjectModel? model)
    {
      if (_model != null)
        _model.ModelChanged -= OnModelChanged;

      _model = model;
      if (_model != null)
        _model.ModelChanged += OnModelChanged;

      ReloadLinkedTaskChoices();
      RefreshFromSelection();
    }

    public void SetSelection(int taskId, int noteId)
    {
      _taskId = taskId;
      _noteId = noteId;
      RefreshFromSelection();
    }

    private GroupBox BuildNoteGroup()
    {
      var group = new GroupBox
      {
        Text = "Note",
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        Padding = new Padding(8, 20, 8, 8),
        Margin = new Padding(0, 0, 0, 8),
        Width = 252
      };

      var layout = new TableLayoutPanel
      {
        Dock = DockStyle.Top,
        AutoSize = true,
        ColumnCount = 2,
        RowCount = 3,
        Width = 232
      };
      layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
      layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
      for (int i = 0; i < 3; i++)
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));

      _noteTitle = new TextBox { Dock = DockStyle.Fill };
      _noteTitle.Leave += (_, _) => ApplyNoteTitle();

      _noteEditor = new RichNoteEditorControl
      {
        Dock = DockStyle.Top,
        Height = 150,
        Margin = new Padding(0, 6, 0, 0)
      };
      _noteEditor.ContentChanged += (_, _) => ApplyNoteContent();

      _noteLinkedTask = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
      _noteLinkedTask.SelectedIndexChanged += (_, _) => ApplyNoteLink();

      _noteAnchorDate = new DateTimePicker { Dock = DockStyle.Fill, Format = DateTimePickerFormat.Short };
      _noteAnchorDate.ValueChanged += (_, _) => ApplyNoteAnchorDate();

      layout.Controls.Add(MakeFieldLabel("Title:"), 0, 0);
      layout.Controls.Add(_noteTitle, 1, 0);
      layout.Controls.Add(MakeFieldLabel("Linked:"), 0, 1);
      layout.Controls.Add(_noteLinkedTask, 1, 1);
      layout.Controls.Add(MakeFieldLabel("Anchor:"), 0, 2);
      layout.Controls.Add(_noteAnchorDate, 1, 2);

      group.Controls.Add(_noteEditor);
      group.Controls.Add(layout);
      return group;
    }

    private GroupBox BuildTaskGroup()
    {
      var group = new GroupBox
      {
        Text = "Task",
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        Padding = new Padding(8, 20, 8, 8),
        Width = 252
      };

      var layout = new TableLayoutPanel
      {
        Dock = DockStyle.Top,
        AutoSize = true,
        ColumnCount = 2,
        Width = 232
      };
      layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
      layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

      _taskName = new TextBox { Dock = DockStyle.Fill };
      _taskName.Leave += (_, _) => ApplyTaskName();

      _taskType = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
      _taskType.Items.AddRange(new object[] { "Normal", "Summary", "Milestone" });
      _taskType.SelectedIndexChanged += (_, _) => ApplyTaskType();

      _taskStart = new DateTimePicker { Dock = DockStyle.Fill, Format = DateTimePickerFormat.Short };
      _taskStart.ValueChanged += (_, _) => ApplyTaskStart();

      _taskDuration = new NumericUpDown { Dock = DockStyle.Fill, Minimum = 1, Maximum = 3650 };
      _taskDuration.ValueChanged += (_, _) => ApplyTaskDuration();

      _taskEndLabel = new Label
      {
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = AppTheme.TextSecondary
      };

      _taskProgress = new NumericUpDown { Dock = DockStyle.Fill, Minimum = 0, Maximum = 100 };
      _taskProgress.ValueChanged += (_, _) => ApplyTaskProgress();

      _taskAutoSchedule = new CheckBox
      {
        Text = "Auto-schedule dependents",
        Dock = DockStyle.Fill,
        AutoSize = true
      };
      _taskAutoSchedule.CheckedChanged += (_, _) => ApplyTaskAutoSchedule();

      _taskCritical = new CheckBox
      {
        Text = "On critical path (computed)",
        Dock = DockStyle.Fill,
        AutoSize = true,
        Enabled = false
      };

      _taskDeliverable = new TextBox
      {
        Dock = DockStyle.Fill,
        Multiline = true,
        ScrollBars = ScrollBars.Vertical,
        Height = 52
      };
      _taskDeliverable.Leave += (_, _) => ApplyTaskDeliverable();

      _taskNotes = new TextBox
      {
        Dock = DockStyle.Fill,
        Multiline = true,
        ScrollBars = ScrollBars.Vertical,
        Height = 52
      };
      _taskNotes.Leave += (_, _) => ApplyTaskNotes();

      _taskBarColorPreview = new Panel { Width = 28, Height = 22, BorderStyle = BorderStyle.FixedSingle };
      var btnBarColor = new Button { Text = "Bar", Width = 56, Height = 24 };
      btnBarColor.Click += (_, _) => PickTaskColor(true);

      _taskProgressColorPreview = new Panel { Width = 28, Height = 22, BorderStyle = BorderStyle.FixedSingle };
      var btnProgressColor = new Button { Text = "Progress", Width = 56, Height = 24 };
      btnProgressColor.Click += (_, _) => PickTaskColor(false);

      var barColorPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
      barColorPanel.Controls.Add(_taskBarColorPreview);
      barColorPanel.Controls.Add(btnBarColor);
      barColorPanel.Controls.Add(_taskProgressColorPreview);
      barColorPanel.Controls.Add(btnProgressColor);

      AddRow(layout, "Name:", _taskName);
      AddRow(layout, "Type:", _taskType);
      AddRow(layout, "Start:", _taskStart);
      AddRow(layout, "Days:", _taskDuration);
      AddRow(layout, "End:", _taskEndLabel);
      AddRow(layout, "Progress:", _taskProgress);
      AddRow(layout, "", _taskAutoSchedule);
      AddRow(layout, "", _taskCritical);
      AddRow(layout, "Deliver:", _taskDeliverable, 56);
      AddRow(layout, "Notes:", _taskNotes, 56);
      AddRow(layout, "Colors:", barColorPanel);

      _resourceGrid = new DataGridView
      {
        Height = 88,
        Dock = DockStyle.Top,
        AllowUserToAddRows = true,
        AllowUserToDeleteRows = true,
        RowHeadersVisible = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor = Color.White,
        BorderStyle = BorderStyle.FixedSingle,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect
      };
      _resourceGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "ResourceName", HeaderText = "Resource", FillWeight = 60 });
      _resourceGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "AllocationPercent", HeaderText = "%", FillWeight = 40 });
      _resourceGrid.CellEndEdit += (_, _) => ApplyResourceGrid();
      _resourceGrid.UserDeletedRow += (_, _) => ApplyResourceGrid();

      _resourceTotalLabel = new Label
      {
        Dock = DockStyle.Top,
        Height = 20,
        TextAlign = ContentAlignment.MiddleRight,
        ForeColor = AppTheme.TextSecondary,
        Font = AppTheme.FontSmall,
        Text = "Total: 0%"
      };

      var resourceGroup = new GroupBox
      {
        Text = "Resources",
        Dock = DockStyle.Top,
        AutoSize = true,
        Padding = new Padding(8, 20, 8, 4),
        Width = 232
      };
      resourceGroup.Controls.Add(_resourceGrid);
      resourceGroup.Controls.Add(_resourceTotalLabel);

      _dependencyGrid = new DataGridView
      {
        Height = 100,
        Dock = DockStyle.Top,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = true,
        RowHeadersVisible = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor = Color.White,
        BorderStyle = BorderStyle.FixedSingle,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect
      };
      _dependencyGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Role", HeaderText = "Role", FillWeight = 30, ReadOnly = true });
      _dependencyGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "TaskName", HeaderText = "Task", FillWeight = 50, ReadOnly = true });
      var typeCol = new DataGridViewComboBoxColumn
      {
        Name = "Type",
        HeaderText = "Type",
        FillWeight = 28,
        DataSource = new[] { "FS", "FF", "SS", "SF" }
      };
      _dependencyGrid.Columns.Add(typeCol);
      _dependencyGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "LagDays", HeaderText = "Lag", FillWeight = 22 });
      _dependencyGrid.CellEndEdit += (_, _) => ApplyDependencyGrid();
      _dependencyGrid.UserDeletedRow += (_, _) => ApplyDependencyGrid();
      _dependencyGrid.UserDeletingRow += OnDependencyRowDeleting;

      var depGroup = new GroupBox
      {
        Text = "Dependencies",
        Dock = DockStyle.Top,
        AutoSize = true,
        Padding = new Padding(8, 20, 8, 4),
        Width = 232
      };
      depGroup.Controls.Add(_dependencyGrid);

      group.Controls.Add(depGroup);
      group.Controls.Add(resourceGroup);
      group.Controls.Add(layout);
      return group;
    }

    private static void AddRow(TableLayoutPanel layout, string label, Control control, int height = 30)
    {
      int row = layout.RowCount;
      layout.RowCount++;
      layout.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
      layout.Controls.Add(MakeFieldLabel(label), 0, row);
      layout.Controls.Add(control, 1, row);
    }

    private static Label MakeFieldLabel(string text) =>
      new()
      {
        Text = text,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleRight,
        ForeColor = AppTheme.TextSecondary,
        Font = AppTheme.FontSmall
      };

    private void ShowEmptyState()
    {
      _emptyLabel.Visible = true;
      _contentPanel.Visible = false;
      _headerLabel.Text = "Properties";
    }

    private void RefreshFromSelection()
    {
      if (_model == null)
      {
        ShowEmptyState();
        return;
      }

      bool hasNote = _noteId >= 0 && _model.GetNote(_noteId) != null;
      bool hasTask = _taskId >= 0 && _model.GetTask(_taskId) != null;

      if (!hasNote && !hasTask)
      {
        ShowEmptyState();
        return;
      }

      _emptyLabel.Visible = false;
      _contentPanel.Visible = true;

      _suppressChanges = true;
      try
      {
        if (hasNote)
        {
          var note = _model.GetNote(_noteId)!;
          _headerLabel.Text = "Note Properties";
          _noteGroup.Visible = true;
          _noteTitle.Text = note.Title;
          _noteEditor.LoadContent(note.BodyRtf, note.Body);
          _noteAnchorDate.Value = note.AnchorDate;
          ReloadLinkedTaskChoices();
          SelectLinkedTask(note.TaskId);
        }
        else
        {
          _noteGroup.Visible = false;
        }

        if (hasTask)
        {
          var task = _model.GetTask(_taskId)!;
          if (!hasNote)
            _headerLabel.Text = "Task Properties";

          _taskGroup.Visible = true;
          _taskName.Text = task.Name;
          _taskType.SelectedIndex = (int)task.TaskType;
          _taskStart.Value = task.StartDate;
          _taskDuration.Value = task.DurationDays;
          _taskEndLabel.Text = task.EndDate.ToString("yyyy-MM-dd");
          _taskProgress.Value = (decimal)task.Progress;
          _taskAutoSchedule.Checked = task.AutoSchedule;
          _taskCritical.Checked = task.IsCritical;
          _taskDeliverable.Text = task.Deliverable;
          _taskNotes.Text = task.Notes;
          _taskBarColorPreview.BackColor = task.BarColor == Color.Empty ? Color.LightGray : task.BarColor;
          _taskProgressColorPreview.BackColor = task.ProgressColor == Color.Empty ? Color.LightGray : task.ProgressColor;
          LoadResourceGrid(task.Id);
          LoadDependencyGrid(task.Id);
        }
        else
        {
          _taskGroup.Visible = false;
        }
      }
      finally
      {
        _suppressChanges = false;
      }
    }

    private void ReloadLinkedTaskChoices()
    {
      if (_model == null)
        return;

      _noteLinkedTask.Items.Clear();
      _noteLinkedTask.Items.Add(new LinkedTaskItem(-1, "(None)"));
      foreach (var task in _model.Tasks)
        _noteLinkedTask.Items.Add(new LinkedTaskItem(task.Id, task.Name));

      _noteLinkedTask.DisplayMember = nameof(LinkedTaskItem.Name);
      _noteLinkedTask.ValueMember = nameof(LinkedTaskItem.Id);
    }

    private void SelectLinkedTask(int taskId)
    {
      for (int i = 0; i < _noteLinkedTask.Items.Count; i++)
      {
        if (((LinkedTaskItem)_noteLinkedTask.Items[i]!).Id == taskId)
        {
          _noteLinkedTask.SelectedIndex = i;
          return;
        }
      }

      _noteLinkedTask.SelectedIndex = 0;
    }

    private void LoadResourceGrid(int taskId)
    {
      _resourceGrid.Rows.Clear();
      foreach (var a in _model!.GetAssignments(taskId))
        _resourceGrid.Rows.Add(a.ResourceName, a.AllocationPercent.ToString("0"));

      UpdateResourceTotal();
    }

    private void LoadDependencyGrid(int taskId)
    {
      _dependencyGrid.Rows.Clear();
      foreach (var dep in _model!.Dependencies)
      {
        if (dep.SuccessorId == taskId)
        {
          var pred = _model.GetTask(dep.PredecessorId);
          _dependencyGrid.Rows.Add("Pre", pred?.Name ?? dep.PredecessorId.ToString(), dep.Type.ToString(), dep.LagDays);
        }
        else if (dep.PredecessorId == taskId)
        {
          var succ = _model.GetTask(dep.SuccessorId);
          _dependencyGrid.Rows.Add("Succ", succ?.Name ?? dep.SuccessorId.ToString(), dep.Type.ToString(), dep.LagDays);
        }
      }
    }

    private void UpdateResourceTotal()
    {
      double total = 0;
      foreach (DataGridViewRow row in _resourceGrid.Rows)
      {
        if (row.IsNewRow) continue;
        if (double.TryParse(row.Cells["AllocationPercent"].Value?.ToString(), out double v))
          total += v;
      }

      _resourceTotalLabel.Text = $"Total: {total:0}%";
      _resourceTotalLabel.ForeColor = total > 100 ? Color.Red : AppTheme.TextSecondary;
    }

    private void OnModelChanged(object? sender, EventArgs e)
    {
      if (_applyingToModel || _suppressChanges)
        return;

      RefreshFromSelection();
    }

    private ProjectTask? CurrentTask() =>
      _model != null && _taskId >= 0 ? _model.GetTask(_taskId) : null;

    private ProjectNote? CurrentNote() =>
      _model != null && _noteId >= 0 ? _model.GetNote(_noteId) : null;

    private void ApplyNoteTitle()
    {
      if (_suppressChanges || _model == null) return;
      var note = CurrentNote();
      if (note == null) return;

      string title = _noteTitle.Text.Trim();
      if (note.Title == title) return;

      _applyingToModel = true;
      try { _model.UpdateNoteTitle(_noteId, title); }
      finally { _applyingToModel = false; }
    }

    private void ApplyNoteContent()
    {
      if (_suppressChanges || _model == null) return;
      var note = CurrentNote();
      if (note == null) return;

      string rtf = _noteEditor.Rtf;
      if (note.BodyRtf == rtf && note.Body == _noteEditor.PlainText)
        return;

      _applyingToModel = true;
      try { _model.UpdateNoteRtf(_noteId, rtf); }
      finally { _applyingToModel = false; }
    }

    private void ApplyNoteLink()
    {
      if (_suppressChanges || _model == null || _noteLinkedTask.SelectedItem is not LinkedTaskItem item)
        return;

      var note = CurrentNote();
      if (note == null || note.TaskId == item.Id) return;

      _applyingToModel = true;
      try { _model.LinkNoteToTask(_noteId, item.Id); }
      finally { _applyingToModel = false; }
    }

    private void ApplyNoteAnchorDate()
    {
      if (_suppressChanges || _model == null) return;
      var note = CurrentNote();
      if (note == null) return;
      if (note.AnchorDate.Date == _noteAnchorDate.Value.Date) return;

      _applyingToModel = true;
      try { _model.SetNotePosition(_noteId, _noteAnchorDate.Value.Date, note.ContentY); }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskName()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null || task.Name == _taskName.Text.Trim()) return;

      _applyingToModel = true;
      try { task.Name = _taskName.Text.Trim(); }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskType()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null) return;
      var type = (TaskType)_taskType.SelectedIndex;
      if (task.TaskType == type) return;

      _applyingToModel = true;
      try { task.TaskType = type; }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskStart()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null) return;
      var newStart = _taskStart.Value.Date;
      if (task.StartDate == newStart) return;

      _applyingToModel = true;
      try
      {
        task.StartDate = newStart;
        _taskEndLabel.Text = task.EndDate.ToString("yyyy-MM-dd");
        if (task.AutoSchedule)
          _model!.CascadeDependencies(task.Id);
      }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskDuration()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null) return;
      int days = (int)_taskDuration.Value;
      if (task.DurationDays == days) return;

      _applyingToModel = true;
      try
      {
        task.DurationDays = days;
        _taskEndLabel.Text = task.EndDate.ToString("yyyy-MM-dd");
      }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskProgress()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null) return;
      double progress = (double)_taskProgress.Value;
      if (task.Progress == progress) return;

      _applyingToModel = true;
      try { task.Progress = progress; }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskAutoSchedule()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null) return;
      if (task.AutoSchedule == _taskAutoSchedule.Checked) return;

      _applyingToModel = true;
      try { task.AutoSchedule = _taskAutoSchedule.Checked; }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskDeliverable()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null || task.Deliverable == _taskDeliverable.Text) return;

      _applyingToModel = true;
      try { task.Deliverable = _taskDeliverable.Text; }
      finally { _applyingToModel = false; }
    }

    private void ApplyTaskNotes()
    {
      if (_suppressChanges) return;
      var task = CurrentTask();
      if (task == null || task.Notes == _taskNotes.Text) return;

      _applyingToModel = true;
      try { task.Notes = _taskNotes.Text; }
      finally { _applyingToModel = false; }
    }

    private void PickTaskColor(bool barColor)
    {
      var task = CurrentTask();
      if (task == null) return;

      Color current = barColor ? task.BarColor : task.ProgressColor;
      using var dlg = new ColorDialog { Color = current == Color.Empty ? AppTheme.TaskBarNormal : current };
      if (dlg.ShowDialog(FindForm()) != DialogResult.OK)
        return;

      _applyingToModel = true;
      try
      {
        if (barColor)
        {
          task.BarColor = dlg.Color;
          _taskBarColorPreview.BackColor = dlg.Color;
        }
        else
        {
          task.ProgressColor = dlg.Color;
          _taskProgressColorPreview.BackColor = dlg.Color;
        }
      }
      finally { _applyingToModel = false; }
    }

    private void ApplyResourceGrid()
    {
      if (_suppressChanges || _model == null || _taskId < 0) return;

      foreach (var a in _model.GetAssignments(_taskId).ToList())
        _model.RemoveAssignment(_taskId, a.ResourceName);

      double total = 0;
      foreach (DataGridViewRow row in _resourceGrid.Rows)
      {
        if (row.IsNewRow) continue;
        string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
        if (string.IsNullOrEmpty(name)) continue;
        if (!double.TryParse(row.Cells["AllocationPercent"].Value?.ToString(), out double pct)) pct = 100;
        total += pct;
        if (total > 100) break;
        _model.AddAssignment(_taskId, name, pct);
      }

      var task = _model.GetTask(_taskId);
      if (task != null)
        task.AssignedTo = _model.GetTaskAssigneeDisplay(_taskId);

      UpdateResourceTotal();
      _applyingToModel = true;
      try { _model.NotifyViewsChanged(); }
      finally { _applyingToModel = false; }
    }

    private void OnDependencyRowDeleting(object? sender, DataGridViewRowCancelEventArgs e)
    {
      if (_suppressChanges || _model == null || _taskId < 0 || e.Row == null)
        return;

      var row = _dependencyGrid.Rows[e.Row.Index];
      if (!TryGetDependencyIds(row, out int predId, out int succId))
        return;

      _applyingToModel = true;
      try { _model.RemoveDependency(predId, succId); }
      finally { _applyingToModel = false; }
    }

    private bool TryGetDependencyIds(DataGridViewRow row, out int predId, out int succId)
    {
      predId = -1;
      succId = -1;
      if (_model == null)
        return false;

      string role = row.Cells["Role"].Value?.ToString() ?? "";
      string taskName = row.Cells["TaskName"].Value?.ToString() ?? "";

      if (role == "Pre")
      {
        foreach (var dep in _model.Dependencies.Where(d => d.SuccessorId == _taskId))
        {
          var pred = _model.GetTask(dep.PredecessorId);
          if (pred?.Name == taskName)
          {
            predId = dep.PredecessorId;
            succId = dep.SuccessorId;
            return true;
          }
        }
      }
      else if (role == "Succ")
      {
        foreach (var dep in _model.Dependencies.Where(d => d.PredecessorId == _taskId))
        {
          var succ = _model.GetTask(dep.SuccessorId);
          if (succ?.Name == taskName)
          {
            predId = dep.PredecessorId;
            succId = dep.SuccessorId;
            return true;
          }
        }
      }

      return false;
    }

    private void ApplyDependencyGrid()
    {
      if (_suppressChanges || _model == null || _taskId < 0) return;

      _applyingToModel = true;
      try
      {
        foreach (DataGridViewRow row in _dependencyGrid.Rows)
        {
          if (row.IsNewRow) continue;
          if (!TryGetDependencyIds(row, out int predId, out int succId))
            continue;

          string typeStr = row.Cells["Type"].Value?.ToString() ?? "FS";
          if (!Enum.TryParse<DependencyType>(typeStr, out var depType))
            depType = DependencyType.FS;
          if (!int.TryParse(row.Cells["LagDays"].Value?.ToString(), out int lag))
            lag = 0;

          _model.SetDependencyType(predId, succId, depType);
          _model.SetDependencyLag(predId, succId, lag);
        }
      }
      finally { _applyingToModel = false; }
    }

    private sealed class LinkedTaskItem
    {
      public int Id { get; }
      public string Name { get; }

      public LinkedTaskItem(int id, string name)
      {
        Id = id;
        Name = name;
      }
    }
  }
}

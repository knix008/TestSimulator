using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Controls
{
  public sealed class SelectionPropertiesControl : UserControl
  {
    private ProjectModel? _model;
    private int _noteContentSnapshotNoteId = -1;

    public Action? RequestUndoSnapshot { get; set; }
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
    private readonly Panel _scrollPanel;
    private readonly Panel _contentPanel;
    private GroupBox _projectGroup = null!;
    private TextBox _projectName = null!;
    private DateTimePicker _projectStart = null!;
    private GroupBox _noteGroup = null!;
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
    private Panel _taskBarColorPreview = null!;
    private Panel _taskProgressColorPreview = null!;
    private Panel _taskBandColorPreview = null!;
    private Button _btnBandColorDefault = null!;
    private DataGridView _resourceGrid = null!;
    private Label _resourceTotalLabel = null!;
    private DataGridView _dependencyGrid = null!;
    private DependencyLineEndSelector _dependencyStartLineEnd = null!;
    private DependencyLineEndSelector _dependencyEndLineEnd = null!;
    private Button _btnRemoveDependency = null!;
    private int _lineEndPredId = -1;
    private int _lineEndSuccId = -1;
    private int _selectedDepPredId = -1;
    private int _selectedDepSuccId = -1;

    private TableLayoutPanel _projectFieldsLayout = null!;
    private TableLayoutPanel _noteFieldsLayout = null!;
    private TableLayoutPanel _taskMainLayout = null!;

    private static int MinContentWidth => AppTheme.PropertiesPanelContentMinWidth;
    private const int FieldLabelColumnWidth = 108;
    private const int GroupContentInset = 20;
    private const int GroupBoxCaptionAllowance = 18;
    private const int RowSpacing = 2;
    private const int LabelRowHeight = 18;
    private const int StandardRowHeight = 30;
    private const int CheckRowHeight = 28;
    private const int MultilineRowHeight = 56;
    private const int SectionGapHeight = 8;
    private const int BottomPaddingHeight = 12;
        private const int LineEndSelectorRowHeight = 40;
    private const int LineEndRowTopSpacing = 8;
    private const int ResourceGridRowHeight = 96;
    private const int DependencyGridRowHeight = 140;

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
        Height = 32,
        Padding = new Padding(0, 0, 4, 0)
      };
      headerBar.Controls.Add(_headerLabel);
      headerBar.Controls.Add(_btnCollapse);

      _emptyLabel = new Label
      {
        Dock = DockStyle.Top,
        Height = 48,
        ForeColor = AppTheme.TextSecondary,
        Text = "Select a task or note to edit its properties, or clear the selection to edit project settings.",
        Padding = new Padding(0, 8, 0, 0)
      };

      _scrollPanel = new Panel
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
        MinimumSize = new Size(MinContentWidth, 0)
      };

      _projectGroup = BuildProjectGroup();
      _noteGroup = BuildNoteGroup();
      _taskGroup = BuildTaskGroup();

      _contentPanel.Controls.Add(_taskGroup);
      _contentPanel.Controls.Add(_noteGroup);
      _contentPanel.Controls.Add(_projectGroup);
      _scrollPanel.Controls.Add(_contentPanel);
      _scrollPanel.Resize += (_, _) => SyncContentSize();
      Resize += (_, _) => SyncContentSize();

      _mainContent = new Panel
      {
        Dock = DockStyle.Fill,
        Padding = new Padding(8, 0, 8, 8)
      };
      _mainContent.Controls.Add(_scrollPanel);
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
      SyncContentSize();
    }

    private static void FitGroupToLayout(GroupBox group, TableLayoutPanel layout)
    {
      layout.PerformLayout();

      int layoutHeight = 0;
      foreach (RowStyle style in layout.RowStyles)
      {
        if (style.SizeType == SizeType.Absolute)
          layoutHeight += (int)Math.Ceiling(style.Height);
      }

      if (layoutHeight <= 0)
        layoutHeight = layout.GetPreferredSize(new Size(layout.Width, 0)).Height;

      int totalHeight = group.Padding.Vertical + GroupBoxCaptionAllowance + layoutHeight + 10;
      group.AutoSize = false;
      group.MinimumSize = new Size(0, totalHeight);
      group.Height = totalHeight;
    }

    private void SyncContentSize()
    {
      if (_scrollPanel.ClientSize.Width <= 0)
        return;

      int scrollBar = _scrollPanel.VerticalScroll.Visible ? SystemInformation.VerticalScrollBarWidth : 0;
      int panelWidth = Math.Max(MinContentWidth, _scrollPanel.ClientSize.Width - scrollBar);
      int layoutWidth = Math.Max(220, panelWidth - GroupContentInset);
      int valueColumnWidth = Math.Max(120, layoutWidth - FieldLabelColumnWidth);

      _contentPanel.SuspendLayout();
      try
      {
        _contentPanel.Width = panelWidth;
        _projectGroup.Width = panelWidth;
        _taskGroup.Width = panelWidth;
        _noteGroup.Width = panelWidth;

        ApplyFieldLayoutWidth(_projectFieldsLayout, layoutWidth);
        ApplyFieldLayoutWidth(_noteFieldsLayout, layoutWidth);
        ApplyFieldLayoutWidth(_taskMainLayout, layoutWidth);

        _dependencyStartLineEnd?.UpdateDropDownWidth(valueColumnWidth);
        _dependencyEndLineEnd?.UpdateDropDownWidth(valueColumnWidth);

        if (_projectGroup.Visible)
          FitGroupToLayout(_projectGroup, _projectFieldsLayout);
        if (_noteGroup.Visible)
          FitGroupToLayout(_noteGroup, _noteFieldsLayout);
        if (_taskGroup.Visible)
          FitGroupToLayout(_taskGroup, _taskMainLayout);

        _contentPanel.PerformLayout();

        int height = 0;
        foreach (Control child in _contentPanel.Controls)
        {
          if (!child.Visible)
            continue;

          height = Math.Max(height, child.Bottom + child.Margin.Bottom);
        }

        _contentPanel.Height = height + BottomPaddingHeight;
      }
      finally
      {
        _contentPanel.ResumeLayout(true);
      }
    }

    private static TableLayoutPanel CreateFieldsLayout()
    {
      var layout = new TableLayoutPanel
      {
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        ColumnCount = 2,
        Margin = Padding.Empty,
        Padding = Padding.Empty,
        GrowStyle = TableLayoutPanelGrowStyle.FixedSize
      };
      layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, FieldLabelColumnWidth));
      layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
      return layout;
    }

    private static void ApplyFieldLayoutWidth(TableLayoutPanel? layout, int width)
    {
      if (layout == null)
        return;

      layout.Width = width;
      layout.MinimumSize = new Size(width, 0);
      layout.MaximumSize = new Size(width, int.MaxValue);
      layout.ColumnStyles[0] = new ColumnStyle(SizeType.Absolute, FieldLabelColumnWidth);
      layout.ColumnStyles[1] = new ColumnStyle(SizeType.Percent, 100f);
    }

    private static Label CreateLeftLabel(string text) =>
      new()
      {
        Text = text,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = AppTheme.TextSecondary,
        Font = AppTheme.FontSmall,
        Margin = Padding.Empty,
        Padding = Padding.Empty
      };

    private static void AddLabelRow(TableLayoutPanel layout, string label)
    {
      int row = AddLayoutRow(layout, LabelRowHeight);
      var lbl = CreateLeftLabel(label);
      layout.SetColumnSpan(lbl, 2);
      layout.Controls.Add(lbl, 0, row);
    }

    private static void AddControlRow(TableLayoutPanel layout, Control control, int height)
    {
      int row = AddLayoutRow(layout, height + RowSpacing);
      control.Dock = DockStyle.Fill;
      control.Margin = Padding.Empty;
      layout.SetColumnSpan(control, 2);
      layout.Controls.Add(control, 0, row);
    }

    private static void AddLabeledField(TableLayoutPanel layout, string label, Control control, int controlHeight)
    {
      int row = AddLayoutRow(layout, controlHeight + RowSpacing);

      if (control is CheckBox checkBox)
      {
        checkBox.Dock = DockStyle.Fill;
        checkBox.Margin = Padding.Empty;
        checkBox.TextAlign = ContentAlignment.MiddleLeft;
        layout.SetColumnSpan(checkBox, 2);
        layout.Controls.Add(checkBox, 0, row);
        return;
      }

      if (!string.IsNullOrWhiteSpace(label))
      {
        var lbl = CreateLeftLabel(label);
        lbl.TextAlign = ContentAlignment.MiddleLeft;
        layout.Controls.Add(lbl, 0, row);
      }

      control.Dock = DockStyle.Fill;
      control.Margin = Padding.Empty;
      control.MinimumSize = new Size(0, controlHeight);
      layout.Controls.Add(control, 1, row);
    }

    private const int ColorSwatchWidth = 64;
    private const int ColorRowItemHeight = 28;
    private const int ColorRowButtonWidth = 64;
    private const int ColorRowGap = 8;

    private static Panel CreateColorSwatch()
    {
      return new Panel
      {
        BorderStyle = BorderStyle.FixedSingle,
        Size = new Size(ColorSwatchWidth, ColorRowItemHeight),
        Cursor = Cursors.Hand,
        Margin = Padding.Empty
      };
    }

    private static void ConfigureColorActionButton(Button button)
    {
      button.AutoSize = false;
      button.Size = new Size(ColorRowButtonWidth, ColorRowItemHeight);
      button.MinimumSize = button.Size;
      button.MaximumSize = button.Size;
      button.Margin = Padding.Empty;
      button.Padding = Padding.Empty;
      button.FlatStyle = FlatStyle.Flat;
      button.TextAlign = ContentAlignment.MiddleCenter;
      button.UseVisualStyleBackColor = true;
    }

    private static Panel CreateColorActionsPanel(Panel preview, params Button[] extraButtons)
    {
      int width = ColorSwatchWidth;
      if (extraButtons.Length > 0)
        width += ColorRowGap + (ColorRowButtonWidth * extraButtons.Length) + (ColorRowGap * (extraButtons.Length - 1));

      var host = new Panel
      {
        Size = new Size(width, ColorRowItemHeight),
        MinimumSize = new Size(width, ColorRowItemHeight),
        MaximumSize = new Size(width, ColorRowItemHeight),
        Margin = Padding.Empty,
        Padding = Padding.Empty
      };

      preview.Location = new Point(0, 0);
      preview.Size = new Size(ColorSwatchWidth, ColorRowItemHeight);
      preview.Anchor = AnchorStyles.None;
      host.Controls.Add(preview);

      int x = ColorSwatchWidth + ColorRowGap;
      foreach (var button in extraButtons)
      {
        ConfigureColorActionButton(button);
        button.Location = new Point(x, 0);
        button.Anchor = AnchorStyles.None;
        host.Controls.Add(button);
        x += ColorRowButtonWidth + ColorRowGap;
      }

      return host;
    }

    private static void AddInlineColorRow(TableLayoutPanel layout, string label, Panel preview, params Button[] extraButtons)
    {
      var actions = CreateColorActionsPanel(preview, extraButtons);
      var host = new Panel
      {
        Dock = DockStyle.Fill,
        Margin = Padding.Empty,
        MinimumSize = new Size(0, ColorRowItemHeight)
      };
      actions.Anchor = AnchorStyles.Left | AnchorStyles.Top;
      host.Controls.Add(actions);

      void AlignActions()
      {
        actions.Top = Math.Max(0, (host.ClientSize.Height - ColorRowItemHeight) / 2);
        actions.Left = 0;
      }

      host.HandleCreated += (_, _) => AlignActions();
      host.Resize += (_, _) => AlignActions();
      AddLabeledField(layout, label, host, StandardRowHeight);
    }

    private static int AddLayoutRow(TableLayoutPanel layout, int height)
    {
      int row = layout.RowCount;
      layout.RowCount++;
      layout.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
      return row;
    }

    private static void AddSpacerRow(TableLayoutPanel layout, int height)
    {
      int row = AddLayoutRow(layout, height);
      var spacer = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty };
      layout.SetColumnSpan(spacer, 2);
      layout.Controls.Add(spacer, 0, row);
    }

    private static void AddSectionHeaderRow(TableLayoutPanel layout, string title)
    {
      int row = AddLayoutRow(layout, 22);
      var label = new Label
      {
        Text = title,
        Dock = DockStyle.Fill,
        Font = AppTheme.FontBold,
        ForeColor = AppTheme.TextPrimary,
        TextAlign = ContentAlignment.MiddleLeft,
        Margin = new Padding(0, 2, 0, 0)
      };
      layout.SetColumnSpan(label, 2);
      layout.Controls.Add(label, 0, row);
    }

    private static void AddFullWidthRow(TableLayoutPanel layout, Control control, int height)
    {
      int row = AddLayoutRow(layout, height);
      control.Dock = DockStyle.Fill;
      control.Margin = Padding.Empty;
      control.MinimumSize = new Size(0, height);
      layout.SetColumnSpan(control, 2);
      layout.Controls.Add(control, 0, row);
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

    public void PrepareForModelRestore()
    {
      _suppressChanges = true;
      try
      {
        if (_resourceGrid.IsCurrentCellInEditMode)
          _resourceGrid.CancelEdit();

        _taskId = -1;
        _noteId = -1;
        RefreshFromSelection();
      }
      finally
      {
        _suppressChanges = false;
      }
    }

    public void SetSelection(int taskId, int noteId, bool commitPending = true)
    {
      if (commitPending)
      {
        CommitPendingTaskEdits();
        CommitPendingNoteEdits();
        CommitPendingProjectEdits();
      }

      _noteId = noteId;
      _taskId = noteId >= 0 ? -1 : taskId;
      if (noteId < 0)
        _noteContentSnapshotNoteId = -1;
      RefreshFromSelection();
    }

    public void CommitPendingEdits() => CommitPendingTaskEdits();

    public bool IsNoteEditorFocused =>
      _noteId >= 0
      && (_noteTitle.Focused
          || _noteEditor.ContainsFocus
          || _noteLinkedTask.Focused
          || _noteAnchorDate.Focused);

    private void CommitPendingTaskEdits()
    {
      if (_suppressChanges)
        return;

      if (_taskDeliverable.Focused)
        ApplyTaskDeliverable();
      if (_taskName.Focused)
        ApplyTaskName();
      if (_taskStart.Focused)
        ApplyTaskStart();
      if (_taskDuration.Focused)
        ApplyTaskDuration();

      if (_resourceGrid.IsCurrentCellInEditMode)
        _resourceGrid.EndEdit();

      if (_resourceGrid.ContainsFocus || _resourceGrid.IsCurrentCellInEditMode)
        ApplyResourceGrid();
    }

    private void CommitPendingNoteEdits()
    {
      if (_suppressChanges || _noteId < 0)
        return;

      ApplyNoteTitle();
      ApplyNoteContent();
    }

    private void CommitPendingProjectEdits()
    {
      if (_suppressChanges || _model == null || _projectGroup.Visible == false)
        return;

      if (_projectName.Focused)
        ApplyProjectName();
    }

    private bool IsEditingNoteProperties()
    {
      if (!_contentPanel.Visible || _noteId < 0)
        return false;

      return _noteTitle.Focused
             || _noteEditor.ContainsFocus
             || _noteLinkedTask.Focused
             || _noteAnchorDate.Focused;
    }

    private bool IsEditingTaskProperties()
    {
      if (!_contentPanel.Visible || _taskId < 0)
        return false;

      if (_taskDeliverable.Focused || _taskName.Focused)
        return true;

      if (_resourceGrid.Focused
          || _resourceGrid.IsCurrentCellInEditMode
          || _resourceGrid.EditingControl != null)
        return true;

      return _taskDeliverable.ContainsFocus
             || _taskName.ContainsFocus
             || _taskStart.ContainsFocus
             || _taskDuration.ContainsFocus
             || _dependencyGrid.ContainsFocus
             || _dependencyStartLineEnd.ContainsFocus
             || _dependencyEndLineEnd.ContainsFocus;
    }

    private bool IsEditingProjectProperties() =>
      _contentPanel.Visible
      && _projectGroup.Visible
      && (_projectName.Focused || _projectStart.Focused);

    private GroupBox BuildProjectGroup()
    {
      var group = new GroupBox
      {
        Text = "Project",
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        Padding = new Padding(8, 20, 8, 12),
        Margin = new Padding(0, 0, 0, 8)
      };

      var layout = _projectFieldsLayout = CreateFieldsLayout();

      _projectName = new TextBox();
      _projectName.Leave += (_, _) => ApplyProjectName();

      _projectStart = new DateTimePicker { Format = DateTimePickerFormat.Short };
      _projectStart.ValueChanged += (_, _) => ApplyProjectStart();

      AddLabeledField(layout, "Name:", _projectName, StandardRowHeight);
      AddLabeledField(layout, "Start:", _projectStart, StandardRowHeight);
      AddSpacerRow(layout, BottomPaddingHeight);

      group.Controls.Add(layout);
      return group;
    }

    private GroupBox BuildNoteGroup()
    {
      var group = new GroupBox
      {
        Text = "Note",
        Dock = DockStyle.Top,
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        Padding = new Padding(8, 20, 8, 12),
        Margin = new Padding(0, 0, 0, 8)
      };

      var layout = _noteFieldsLayout = CreateFieldsLayout();

      _noteTitle = new TextBox();
      _noteTitle.Leave += (_, _) => ApplyNoteTitle();

      _noteLinkedTask = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
      _noteLinkedTask.SelectedIndexChanged += (_, _) => ApplyNoteLink();

      _noteAnchorDate = new DateTimePicker { Format = DateTimePickerFormat.Short };
      _noteAnchorDate.ValueChanged += (_, _) => ApplyNoteAnchorDate();

      _noteEditor = new RichNoteEditorControl
      {
        Height = 150,
        MinimumSize = new Size(0, 150),
        Margin = Padding.Empty
      };
      _noteEditor.ContentChanged += (_, _) => ApplyNoteContent();
      _noteEditor.EditorEnter += (_, _) => CaptureNoteContentUndoIfNeeded();

      AddLabeledField(layout, "Title:", _noteTitle, StandardRowHeight);
      AddLabeledField(layout, "Linked:", _noteLinkedTask, StandardRowHeight);
      AddLabeledField(layout, "Anchor:", _noteAnchorDate, StandardRowHeight);
      AddSpacerRow(layout, SectionGapHeight);
      AddSectionHeaderRow(layout, "Content");
      AddFullWidthRow(layout, _noteEditor, 150);

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
        Padding = new Padding(8, 20, 8, 12),
        Margin = new Padding(0, 0, 0, 8)
      };

      var layout = _taskMainLayout = CreateFieldsLayout();

      _taskName = new TextBox();
      _taskName.Leave += (_, _) => ApplyTaskName();

      _taskType = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
      _taskType.Items.AddRange(new object[] { "Normal", "Summary", "Milestone" });
      _taskType.SelectedIndexChanged += (_, _) => ApplyTaskType();
      TaskTypeComboTooltips.Attach(_taskType);

      _taskStart = new DateTimePicker { Format = DateTimePickerFormat.Short };
      _taskStart.ValueChanged += (_, _) => ApplyTaskStart();

      _taskDuration = new NumericUpDown { Minimum = 1, Maximum = 3650 };
      _taskDuration.ValueChanged += (_, _) => ApplyTaskDuration();

      _taskEndLabel = new Label
      {
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = AppTheme.TextSecondary,
        Dock = DockStyle.Fill,
        AutoSize = false
      };

      _taskProgress = new NumericUpDown { Minimum = 0, Maximum = 100 };
      _taskProgress.ValueChanged += (_, _) => ApplyTaskProgress();

      _taskAutoSchedule = new CheckBox
      {
        Text = "Auto-schedule dependents",
        AutoSize = true
      };
      _taskAutoSchedule.CheckedChanged += (_, _) => ApplyTaskAutoSchedule();

      _taskCritical = new CheckBox
      {
        Text = "On critical path (computed)",
        AutoSize = true,
        Enabled = false
      };

      _taskDeliverable = new TextBox
      {
        Multiline = true,
        ScrollBars = ScrollBars.Vertical,
        BackColor = Color.White,
        ForeColor = AppTheme.TextPrimary,
        BorderStyle = BorderStyle.FixedSingle
      };
      _taskDeliverable.Leave += (_, _) => ApplyTaskDeliverable();

      _taskBarColorPreview = CreateColorSwatch();
      _taskBarColorPreview.Click += (_, _) => PickTaskColor(true);

      _taskProgressColorPreview = CreateColorSwatch();
      _taskProgressColorPreview.Click += (_, _) => PickTaskColor(false);

      _taskBandColorPreview = CreateColorSwatch();
      _taskBandColorPreview.Click += (_, _) => PickBandColor();
      _btnBandColorDefault = new Button { Text = "Default" };
      _btnBandColorDefault.Click += (_, _) => ResetBandColor();

      AddLabeledField(layout, "Name:", _taskName, StandardRowHeight);
      AddLabeledField(layout, "Type:", _taskType, StandardRowHeight);
      AddLabeledField(layout, "Start:", _taskStart, StandardRowHeight);
      AddLabeledField(layout, "Days (working):", _taskDuration, StandardRowHeight);
      AddLabeledField(layout, "End:", _taskEndLabel, StandardRowHeight);
      AddLabeledField(layout, "Progress:", _taskProgress, StandardRowHeight);
      AddControlRow(layout, _taskAutoSchedule, CheckRowHeight);
      AddControlRow(layout, _taskCritical, CheckRowHeight);
      AddLabeledField(layout, "Deliver:", _taskDeliverable, MultilineRowHeight);
      AddInlineColorRow(layout, "Bar color:", _taskBarColorPreview);
      AddInlineColorRow(layout, "Prog color:", _taskProgressColorPreview);
      AddInlineColorRow(layout, "Row color:", _taskBandColorPreview, _btnBandColorDefault);

      AddSpacerRow(layout, SectionGapHeight);
      AddSectionHeaderRow(layout, "Resources");

      _resourceGrid = new DataGridView
      {
        AllowUserToAddRows = true,
        AllowUserToDeleteRows = true,
        RowHeadersVisible = false,
        ColumnHeadersHeight = 26,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor = Color.White,
        BorderStyle = BorderStyle.FixedSingle,
        SelectionMode = DataGridViewSelectionMode.CellSelect,
        EditMode = DataGridViewEditMode.EditOnEnter,
        StandardTab = true,
        Font = AppTheme.FontSmall,
        MinimumSize = new Size(0, ResourceGridRowHeight)
      };
      _resourceGrid.RowTemplate.Height = 24;
      _resourceGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "ResourceName", HeaderText = "Resource", FillWeight = 55 });
      var pctCol = new DataGridViewTextBoxColumn
      {
        Name = "AllocationPercent",
        HeaderText = "Alloc %",
        FillWeight = 25,
        MinimumWidth = 52
      };
      pctCol.DefaultCellStyle.NullValue = "";
      pctCol.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
      _resourceGrid.Columns.Add(pctCol);
      _resourceGrid.CellEndEdit += OnResourceGridCellEndEdit;
      _resourceGrid.CellValidating += OnResourceGridCellValidating;
      _resourceGrid.UserDeletedRow += (_, _) => ApplyResourceGrid();
      _resourceGrid.Leave += (_, _) => ApplyResourceGrid();
      AddFullWidthRow(layout, _resourceGrid, ResourceGridRowHeight);

      _resourceTotalLabel = new Label
      {
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = AppTheme.TextSecondary,
        Font = AppTheme.FontSmall,
        Text = "Total: 0%",
        Dock = DockStyle.Fill,
        AutoSize = false
      };
      AddFullWidthRow(layout, _resourceTotalLabel, 20);

      AddSpacerRow(layout, SectionGapHeight);
      AddSectionHeaderRow(layout, "Dependencies");

      _dependencyGrid = new DataGridView
      {
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = true,
        RowHeadersVisible = false,
        ColumnHeadersHeight = 26,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor = Color.White,
        BorderStyle = BorderStyle.FixedSingle,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        ShowCellToolTips = true,
        Font = AppTheme.FontSmall,
        MinimumSize = new Size(0, DependencyGridRowHeight)
      };
      _dependencyGrid.RowTemplate.Height = 24;
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
      _dependencyGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "PredecessorId", Visible = false });
      _dependencyGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "SuccessorId", Visible = false });
      _dependencyGrid.CellEndEdit += (_, _) => ApplyDependencyGrid();
      _dependencyGrid.UserDeletedRow += (_, _) => ApplyDependencyGrid();
      _dependencyGrid.UserDeletingRow += OnDependencyRowDeleting;
      _dependencyGrid.SelectionChanged += (_, _) =>
      {
        UpdateSelectedDependencyFromGrid();
        LoadSelectedDependencyLineEnds();
      };
      _dependencyGrid.CellToolTipTextNeeded += OnDependencyGridCellToolTipTextNeeded;
      AddFullWidthRow(layout, _dependencyGrid, DependencyGridRowHeight);

      _btnRemoveDependency = new Button
      {
        Text = "Remove Link",
        AutoSize = true,
        Margin = new Padding(0, 4, 0, 0)
      };
      _btnRemoveDependency.Click += (_, _) => RemoveSelectedDependencyLink();
      AddFullWidthRow(layout, _btnRemoveDependency, 30);

      _dependencyStartLineEnd = new DependencyLineEndSelector { PreviewAtLineStart = true };
      _dependencyEndLineEnd = new DependencyLineEndSelector { PreviewAtLineStart = false };
      _dependencyStartLineEnd.SelectedLineEndChanged += (_, _) => ApplySelectedDependencyLineEnds();
      _dependencyEndLineEnd.SelectedLineEndChanged += (_, _) => ApplySelectedDependencyLineEnds();

      AddSpacerRow(layout, LineEndRowTopSpacing);
      AddLabeledField(layout, "Line start:", _dependencyStartLineEnd, LineEndSelectorRowHeight);
      AddSpacerRow(layout, LineEndRowTopSpacing);
      AddLabeledField(layout, "Line end:", _dependencyEndLineEnd, LineEndSelectorRowHeight);
      AddSpacerRow(layout, BottomPaddingHeight);

      group.Controls.Add(layout);
      return group;
    }

    private void ShowEmptyState()
    {
      _emptyLabel.Visible = true;
      _contentPanel.Visible = false;
      _projectGroup.Visible = false;
      _noteGroup.Visible = false;
      _taskGroup.Visible = false;
      _headerLabel.Text = "Properties";
    }

    private void ShowProjectSettings()
    {
      _emptyLabel.Visible = false;
      _contentPanel.Visible = true;
      _projectGroup.Visible = true;
      _noteGroup.Visible = false;
      _taskGroup.Visible = false;
      _headerLabel.Text = "Project Properties";
      SyncContentSize();

      _suppressChanges = true;
      try
      {
        _projectName.Text = _model!.ProjectName;
        _projectStart.Value = _model.ProjectStart;
      }
      finally
      {
        _suppressChanges = false;
      }
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
        ShowProjectSettings();
        return;
      }

      _emptyLabel.Visible = false;
      _contentPanel.Visible = true;
      _projectGroup.Visible = false;
      SyncContentSize();

      _suppressChanges = true;
      try
      {
        if (hasNote)
        {
          var note = _model.GetNote(_noteId)!;
          _headerLabel.Text = "Note Properties";
          _noteGroup.Visible = true;
          _taskGroup.Visible = false;
          _noteTitle.Text = note.Title;
          _noteEditor.LoadContent(note.BodyRtf, note.Body);
          _noteContentSnapshotNoteId = -1;
          _noteAnchorDate.Value = note.AnchorDate;
          ReloadLinkedTaskChoices();
          SelectLinkedTask(note.TaskId);
        }
        else if (hasTask)
        {
          var task = _model.GetTask(_taskId)!;
          _headerLabel.Text = "Task Properties";
          _noteGroup.Visible = false;
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
          _taskBarColorPreview.BackColor = task.BarColor == Color.Empty ? Color.LightGray : task.BarColor;
          _taskProgressColorPreview.BackColor = task.ProgressColor == Color.Empty ? Color.LightGray : task.ProgressColor;
          bool isRootTask = task.ParentId == -1;
          _taskBandColorPreview.Enabled = isRootTask;
          _taskBandColorPreview.Cursor = isRootTask ? Cursors.Hand : Cursors.Default;
          _btnBandColorDefault.Enabled = isRootTask;
          var bandColor = _model!.GetTaskBandColor(task.Id);
          _taskBandColorPreview.BackColor = bandColor.IsEmpty ? Color.LightGray : bandColor;
          LoadResourceGrid(task.Id);
          LoadDependencyGrid(task.Id);
          ConfigureScheduleFieldsForTask(task);
          BeginInvoke(SyncContentSize);
        }
      }
      finally
      {
        _suppressChanges = false;
      }
    }

    private void ApplyProjectName()
    {
      if (_suppressChanges || _model == null)
        return;

      string name = _projectName.Text.Trim();
      if (string.IsNullOrEmpty(name))
        return;

      if (_model.ProjectName == name)
        return;

      RequestUndoSnapshot?.Invoke();
      _model.SetProjectName(name);
    }

    private void ApplyProjectStart()
    {
      if (_suppressChanges || _model == null)
        return;

      DateTime start = _projectStart.Value.Date;
      if (_model.ProjectStart.Date == start)
        return;

      RequestUndoSnapshot?.Invoke();
      _model.SetProjectStart(start);
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
      foreach (var (name, allocEdit) in _model!.GetTaskResourceGridRows(taskId))
      {
        _resourceGrid.Rows.Add(name, _model.FormatTaskResourceAllocForPropertiesGrid(allocEdit));
      }

      UpdateResourceTotal();
    }

    private void ConfigureScheduleFieldsForTask(ProjectTask task)
    {
      bool readOnly = _model!.IsSummaryTask(task.Id);
      _taskStart.Enabled = !readOnly;
      _taskDuration.Enabled = !readOnly;
      _taskProgress.Enabled = !readOnly;
      _taskAutoSchedule.Enabled = !readOnly;
      _taskType.Enabled = !readOnly;
      UpdateSelectedDependencyFromGrid();
    }

    private void UpdateSelectedDependencyFromGrid()
    {
      _selectedDepPredId = -1;
      _selectedDepSuccId = -1;

      var row = GetActiveDependencyRow();
      if (row != null && TryGetDependencyIds(row, out int predId, out int succId))
      {
        _selectedDepPredId = predId;
        _selectedDepSuccId = succId;
      }

      _btnRemoveDependency.Enabled = _selectedDepPredId >= 0 && _selectedDepSuccId >= 0;
    }

    private void RemoveSelectedDependencyLink()
    {
      if (_suppressChanges || _model == null || _taskId < 0)
        return;

      int predId = _selectedDepPredId;
      int succId = _selectedDepSuccId;
      if (predId < 0 || succId < 0)
      {
        var row = GetActiveDependencyRow();
        if (row == null || !TryGetDependencyIds(row, out predId, out succId))
          return;
      }

      RequestUndoSnapshot?.Invoke();
      _applyingToModel = true;
      try
      {
        if (_model.TryRemoveDependency(predId, succId))
          LoadDependencyGrid(_taskId);
      }
      finally
      {
        _applyingToModel = false;
      }
    }

    private void LoadDependencyGrid(int taskId)
    {
      _lineEndPredId = -1;
      _lineEndSuccId = -1;
      _selectedDepPredId = -1;
      _selectedDepSuccId = -1;
      _dependencyGrid.Rows.Clear();
      foreach (var dep in _model!.Dependencies)
      {
        if (dep.SuccessorId == taskId)
        {
          var pred = _model.GetTask(dep.PredecessorId);
          _dependencyGrid.Rows.Add(
            "Pre",
            pred?.Name ?? dep.PredecessorId.ToString(),
            dep.Type.ToString(),
            dep.LagDays,
            dep.PredecessorId,
            dep.SuccessorId);
        }
        else if (dep.PredecessorId == taskId)
        {
          var succ = _model.GetTask(dep.SuccessorId);
          _dependencyGrid.Rows.Add(
            "Succ",
            succ?.Name ?? dep.SuccessorId.ToString(),
            dep.Type.ToString(),
            dep.LagDays,
            dep.PredecessorId,
            dep.SuccessorId);
        }
      }

      if (_dependencyGrid.Rows.Count > 0)
      {
        DataGridViewRow? outgoingRow = null;
        foreach (DataGridViewRow row in _dependencyGrid.Rows)
        {
          if (IsOutgoingDependencyRow(row))
          {
            outgoingRow = row;
            break;
          }
        }

        (outgoingRow ?? _dependencyGrid.Rows[0]).Selected = true;
      }

      LoadSelectedDependencyLineEnds();
      UpdateSelectedDependencyFromGrid();
      if (_model != null)
      {
        var task = _model.GetTask(taskId);
        if (task != null)
          ConfigureScheduleFieldsForTask(task);
      }
    }

    private bool IsOutgoingDependencyRow(DataGridViewRow row)
    {
      if (_taskId < 0)
        return false;

      string role = row.Cells["Role"].Value?.ToString() ?? "";
      if (role == "Succ")
        return true;
      if (role == "Pre")
        return false;

      return TryGetDependencyIds(row, out int predId, out _)
        && predId == _taskId;
    }

    private DataGridViewRow? GetActiveDependencyRow()
    {
      if (_dependencyGrid.SelectedRows.Count > 0 && !_dependencyGrid.SelectedRows[0].IsNewRow)
        return _dependencyGrid.SelectedRows[0];

      if (_dependencyGrid.CurrentRow != null && !_dependencyGrid.CurrentRow.IsNewRow)
        return _dependencyGrid.CurrentRow;

      return null;
    }

    private bool TryGetActiveDependencyIds(out int predId, out int succId)
    {
      predId = _lineEndPredId;
      succId = _lineEndSuccId;
      if (predId >= 0 && succId >= 0 && predId == _taskId)
        return true;

      var row = GetActiveDependencyRow();
      if (row != null
        && IsOutgoingDependencyRow(row)
        && TryGetDependencyIds(row, out predId, out succId))
        return true;

      predId = -1;
      succId = -1;
      return false;
    }

    private void LoadSelectedDependencyLineEnds()
    {
      if (_model == null)
        return;

      int predId = -1;
      int succId = -1;
      var row = GetActiveDependencyRow();
      bool hasSelection = row != null && TryGetDependencyIds(row, out predId, out succId);
      bool isOutgoing = hasSelection && IsOutgoingDependencyRow(row!);

      _lineEndPredId = isOutgoing ? predId : -1;
      _lineEndSuccId = isOutgoing ? succId : -1;

      _dependencyStartLineEnd.Enabled = isOutgoing;
      _dependencyEndLineEnd.Enabled = isOutgoing;

      if (!hasSelection || !isOutgoing)
        return;

      var dep = _model.Dependencies.FirstOrDefault(d =>
        d.PredecessorId == predId && d.SuccessorId == succId);
      if (dep == null)
        return;

      _suppressChanges = true;
      try
      {
        _dependencyStartLineEnd.SelectedLineEnd = dep.StartLineEnd;
        _dependencyEndLineEnd.SelectedLineEnd = dep.EndLineEnd;
      }
      finally { _suppressChanges = false; }
    }

    private void ApplySelectedDependencyLineEnds()
    {
      if (_suppressChanges || _model == null || _taskId < 0)
        return;

      var row = GetActiveDependencyRow();
      if (row == null || !IsOutgoingDependencyRow(row))
        return;

      if (!TryGetActiveDependencyIds(out int predId, out int succId))
        return;

      _applyingToModel = true;
      try
      {
        _model.SetDependencyLineEnds(
          predId,
          succId,
          _dependencyStartLineEnd.SelectedLineEnd,
          _dependencyEndLineEnd.SelectedLineEnd);
      }
      finally { _applyingToModel = false; }
    }

    private void UpdateResourceTotal()
    {
      double total = 0;
      foreach (DataGridViewRow row in _resourceGrid.Rows)
      {
        if (row.IsNewRow)
          continue;

        string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
        if (string.IsNullOrEmpty(name))
          continue;

        string? allocText = row.Cells["AllocationPercent"].Value?.ToString();
        if (string.IsNullOrWhiteSpace(allocText))
          total += 100;
        else if (ProjectModel.TryParseAllocationNumber(allocText, out double pct))
          total += pct;
      }

      _resourceTotalLabel.Text = $"Total: {total:0}%";
      _resourceTotalLabel.ForeColor = total > 100 ? Color.Red : AppTheme.TextSecondary;
    }

    private void OnModelChanged(object? sender, EventArgs e)
    {
      if (_applyingToModel || _suppressChanges)
        return;

      if (_taskId >= 0 && _taskGroup.Visible)
        RefreshTaskPropertiesFromModel();

      if (IsEditingNoteProperties() || IsEditingProjectProperties())
        return;

      if (IsEditingTaskProperties())
        return;

      RefreshFromSelection();
    }

    private bool IsResourceGridEditing() =>
      _resourceGrid.Focused
      || _resourceGrid.IsCurrentCellInEditMode
      || _resourceGrid.EditingControl != null;

    private void RefreshTaskPropertiesFromModel()
    {
      if (_model == null || _taskId < 0 || !_taskGroup.Visible)
        return;

      var task = _model.GetTask(_taskId);
      if (task == null)
        return;

      _suppressChanges = true;
      try
      {
        if (!IsResourceGridEditing())
          LoadResourceGrid(_taskId);

        if (!_taskDeliverable.Focused && !_taskDeliverable.ContainsFocus)
          _taskDeliverable.Text = task.Deliverable;

        _taskEndLabel.Text = task.EndDate.ToString("yyyy-MM-dd");
        _taskCritical.Checked = task.IsCritical;
      }
      finally
      {
        _suppressChanges = false;
      }
    }

    private ProjectTask? CurrentTask() =>
      _model != null && _taskId >= 0 ? _model.GetTask(_taskId) : null;

    private ProjectNote? CurrentNote() =>
      _model != null && _noteId >= 0 ? _model.GetNote(_noteId) : null;

    private void CaptureNoteContentUndoIfNeeded()
    {
      if (_suppressChanges || _noteId < 0 || _noteContentSnapshotNoteId == _noteId)
        return;

      RequestUndoSnapshot?.Invoke();
      _noteContentSnapshotNoteId = _noteId;
    }

    private void ApplyNoteTitle()
    {
      if (_suppressChanges || _model == null) return;
      var note = CurrentNote();
      if (note == null) return;

      string title = _noteTitle.Text.Trim();
      if (note.Title == title) return;

      RequestUndoSnapshot?.Invoke();
      _applyingToModel = true;
      try { _model.UpdateNoteTitle(_noteId, title); }
      finally { _applyingToModel = false; }
    }

        private void ApplyNoteContent()
    {
      if (_suppressChanges || _model == null) return;
      var note = CurrentNote();
      if (note == null) return;

      if (!_noteEditor.IsContentDirty && note.Body == _noteEditor.PlainText)
        return;

      string rtf = _noteEditor.Rtf;
      if (note.BodyRtf == rtf && note.Body == _noteEditor.PlainText)
      {
        _noteEditor.MarkContentClean();
        return;
      }

      _applyingToModel = true;
      try { _model.UpdateNoteRtf(_noteId, rtf); }
      finally { _applyingToModel = false; }

      _noteEditor.MarkContentClean();
    }

    private void ApplyNoteLink()
    {
      if (_suppressChanges || _model == null || _noteLinkedTask.SelectedItem is not LinkedTaskItem item)
        return;

      var note = CurrentNote();
      if (note == null || note.TaskId == item.Id) return;

      RequestUndoSnapshot?.Invoke();
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

      RequestUndoSnapshot?.Invoke();
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
      if (task == null || _model!.IsSummaryTask(task.Id)) return;
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
      if (task == null || _model!.IsSummaryTask(task.Id)) return;
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
      if (task == null || _model!.IsSummaryTask(task.Id)) return;
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
      if (task == null || _model!.IsSummaryTask(task.Id)) return;
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

    private void PickBandColor()
    {
      var task = CurrentTask();
      if (task == null || task.ParentId != -1 || _model == null) return;

      Color current = _model.GetTaskBandColor(task.Id);
      using var dlg = new ColorDialog { Color = current.IsEmpty ? Color.White : current };
      if (dlg.ShowDialog(FindForm()) != DialogResult.OK) return;

      _applyingToModel = true;
      try
      {
        task.BandColor = dlg.Color;
        _taskBandColorPreview.BackColor = dlg.Color;
        _model.NotifyViewsChanged();
      }
      finally { _applyingToModel = false; }
    }

    private void ResetBandColor()
    {
      var task = CurrentTask();
      if (task == null || task.ParentId != -1 || _model == null) return;

      _applyingToModel = true;
      try
      {
        task.BandColor = Color.Empty;
        var autoColor = _model.GetTaskBandColor(task.Id);
        _taskBandColorPreview.BackColor = autoColor.IsEmpty ? Color.LightGray : autoColor;
        _model.NotifyViewsChanged();
      }
      finally { _applyingToModel = false; }
    }

    private void OnResourceGridCellEndEdit(object? sender, DataGridViewCellEventArgs e)
    {
      if (e.RowIndex < 0 || e.ColumnIndex < 0)
        return;

      var row = _resourceGrid.Rows[e.RowIndex];
      if (row.IsNewRow)
        return;

      if (_resourceGrid.Columns[e.ColumnIndex].Name == "AllocationPercent")
      {
        string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
        if (string.IsNullOrEmpty(name))
        {
          UpdateResourceTotal();
          return;
        }
      }

      ApplyResourceGrid();
    }

    private void OnResourceGridCellValidating(object? sender, DataGridViewCellValidatingEventArgs e)
    {
      if (_resourceGrid.Columns[e.ColumnIndex].Name != "AllocationPercent")
        return;

      string? val = e.FormattedValue?.ToString();
      if (string.IsNullOrWhiteSpace(val))
        return;

      if (!double.TryParse(val, out double pct) || pct < 0)
      {
        e.Cancel = true;
        MessageBox.Show(
          FindForm(),
          "Allocation must be a number of 0 or greater.",
          "Invalid Allocation",
          MessageBoxButtons.OK,
          MessageBoxIcon.Warning);
      }
    }

    private void ApplyResourceGrid()
    {
      if (_suppressChanges || _model == null || _taskId < 0) return;

      var lines = new List<string>();
      foreach (DataGridViewRow row in _resourceGrid.Rows)
      {
        if (row.IsNewRow) continue;
        string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
        if (string.IsNullOrEmpty(name)) continue;
        if (!ProjectModel.TryParseAllocationNumber(row.Cells["AllocationPercent"].Value?.ToString() ?? "", out double pct))
          pct = 100;
        if (pct <= 0) continue;

        lines.Add(ProjectModel.FormatResourceEditLine(name, pct));
      }

      string text = string.Join(Environment.NewLine, lines);
      if (text == _model.GetTaskResourceEditText(_taskId))
      {
        UpdateResourceTotal();
        return;
      }

      _applyingToModel = true;
      try
      {
        if (!_model.TrySetTaskResourcesFromText(_taskId, text, out string? error))
        {
          MessageBox.Show(
            FindForm(),
            error,
            "Invalid Allocation",
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
          LoadResourceGrid(_taskId);
          return;
        }
      }
      finally
      {
        _applyingToModel = false;
      }

      UpdateResourceTotal();
    }

    private void OnDependencyGridCellToolTipTextNeeded(object? sender, DataGridViewCellToolTipTextNeededEventArgs e)
    {
      if (e.RowIndex < 0 || e.ColumnIndex < 0)
        return;

      if (_dependencyGrid.Columns[e.ColumnIndex].Name != "Type")
        return;

      string typeStr = _dependencyGrid.Rows[e.RowIndex].Cells["Type"].FormattedValue?.ToString()
        ?? _dependencyGrid.Rows[e.RowIndex].Cells["Type"].Value?.ToString()
        ?? "FS";
      if (Enum.TryParse<DependencyType>(typeStr, out var depType))
        e.ToolTipText = DependencyTypeInfo.GetTooltipText(depType);
    }

    private void OnDependencyRowDeleting(object? sender, DataGridViewRowCancelEventArgs e)
    {
      if (_suppressChanges || _model == null || _taskId < 0 || e.Row == null)
        return;

      var row = _dependencyGrid.Rows[e.Row.Index];
      if (!TryGetDependencyIds(row, out int predId, out int succId))
        return;

      _applyingToModel = true;
      try
      {
        if (_model.TryRemoveDependency(predId, succId))
          LoadDependencyGrid(_taskId);
      }
      finally { _applyingToModel = false; }
    }

    private bool TryGetDependencyIds(DataGridViewRow row, out int predId, out int succId)
    {
      predId = -1;
      succId = -1;
      if (_model == null)
        return false;

      if (int.TryParse(row.Cells["PredecessorId"].Value?.ToString(), out predId)
        && int.TryParse(row.Cells["SuccessorId"].Value?.ToString(), out succId)
        && predId >= 0 && succId >= 0)
        return true;

      predId = -1;
      succId = -1;
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

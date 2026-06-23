using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Persistence;
using ReqTrace.Persistence.Database;
using ReqTrace.Resources;
using ReqTrace.Services;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class MainForm : Form
{
    private RequirementService _requirementService;
    private TestCaseService _testCaseService;
    private TestRunService _testRunService;
    private AppSettings _settings;
    private string? _currentFilePath;
    private bool _groupByHierarchy;
    private int _reqSortColumn;
    private SortOrder _reqSortOrder = SortOrder.Ascending;
    private bool _loadingDetail;
    private bool _startupProjectOpened;
    private readonly string? _startupProjectPath;
    private Guid? _loadedDetailRequirementId;
    private ToolStripMenuItem languageSettingsMenuItem = null!;
    private ToolStripMenuItem languageKoreanMenuItem = null!;
    private ToolStripMenuItem languageEnglishMenuItem = null!;
    private ToolStripMenuItem databaseMenuItem = null!;
    private ToolStripMenuItem connectDatabaseMenuItem = null!;
    private ToolStripMenuItem saveToDatabaseMenuItem = null!;
    private ToolStripMenuItem loadFromDatabaseMenuItem = null!;
    private DbConnectionSettings? _dbSettings;
    private ToolStripButton connectDatabaseToolButton = null!;
    private ToolStripButton saveToDatabaseToolButton = null!;
    private ToolStripButton loadFromDatabaseToolButton = null!;
    private ToolStripButton aboutToolButton = null!;
    private ContextMenuStrip reqContextMenu = null!;
    private ContextMenuStrip testCaseContextMenu = null!;
    private ToolStripMenuItem reqCtxAdd = null!;
    private ToolStripMenuItem reqCtxEdit = null!;
    private ToolStripMenuItem reqCtxDelete = null!;
    private ToolStripMenuItem reqCtxUndo = null!;
    private ToolStripMenuItem reqCtxRedo = null!;
    private ToolStripMenuItem tcCtxAdd = null!;
    private ToolStripMenuItem tcCtxEdit = null!;
    private ToolStripMenuItem tcCtxDelete = null!;
    private ToolStripMenuItem tcCtxRecord = null!;
    private ToolStripMenuItem tcCtxUndo = null!;
    private ToolStripMenuItem tcCtxRedo = null!;
    private ToolStripMenuItem undoMenuItem = null!;
    private ToolStripMenuItem redoMenuItem = null!;
    private ToolStripButton undoToolButton = null!;
    private ToolStripButton redoToolButton = null!;
    private readonly UndoRedoService _undoRedo = new();
    private bool _isApplyingUndoRedo;
    private bool _refreshingUi;
    public MainForm(string? startupProjectPath = null)
    {
        _startupProjectPath = startupProjectPath;
        InitializeComponent();

        _settings = AppSettingsService.Load();
        LocalizationService.Initialize(_settings.Language);
        _dbSettings = AppSettingsService.LoadDbConnectionSettings(_settings);

        ModernTheme.Apply(this);
        StylePanelHeaders();
        StylePanelBorders();

        _requirementService = new RequirementService(ProjectRepository.CreateNew(Loc.T("DefaultProjectName")));
        _testCaseService = new TestCaseService(_requirementService);
        _testRunService = new TestRunService(_requirementService);
        _requirementService.Changed += (_, _) => RefreshAll();

        InitializeRequirementsGrid();
        InitializeTestCaseGrid();
        InitializeDetailEditors();
        InitializeLanguageMenu();
        InitializeDatabaseMenu();
        InitializeDatabaseToolButtons();
        InitializeAboutToolButton();
        InitializeContextMenus();
        InitializeUndoRedoCommands();
        AssignIcons();
        WireEvents();
        ApplyLocalization();
        RebuildRecentFilesMenu();
        RefreshAll();

        LocalizationService.LanguageChanged += (_, _) => ApplyLocalization();
        Shown += (_, _) => TryOpenStartupProject();
    }

    private const int RequirementListColumnCount = 9;

    private void InitializeRequirementsGrid()
    {
        reqGrid.AutoGenerateColumns = false;
        reqGrid.Columns.Clear();
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Code", FillWeight = 100 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Category", FillWeight = 120 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Title", FillWeight = 160 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Description", FillWeight = 280 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Priority", FillWeight = 80 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "RequirementStatus", FillWeight = 110 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "TestStatus", FillWeight = 100 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Source", FillWeight = 120 });
        reqGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Parent", FillWeight = 100 });

        foreach (DataGridViewColumn column in reqGrid.Columns)
            column.SortMode = DataGridViewColumnSortMode.Programmatic;

        ModernTheme.StyleGrid(reqGrid);
        reqGrid.CellBorderStyle = DataGridViewCellBorderStyle.Single;
        reqGrid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
        UpdateRequirementColumnHeaders();
    }

    private void InitializeTestCaseGrid()
    {
        ModernTheme.StyleGrid(testCaseGrid);
        testCaseGrid.CellBorderStyle = DataGridViewCellBorderStyle.Single;
        testCaseGrid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
    }

    private void UpdateImportMenuLabels()
    {
        importExcelMenuItem.Text = Loc.T("Menu_ImportExcel");
        importExcelToolButton.Text = Loc.T("Tool_ImportAuto");
        importExcelToolButton.ToolTipText = Loc.T("Tooltip_ImportExcel");
    }

    private void UpdateRequirementColumnHeaders()
    {
        var names = new[]
        {
            Loc.T("Col_Code"),
            Loc.T("Col_Category"),
            Loc.T("Col_Title"),
            Loc.T("Col_Description"),
            Loc.T("Col_Priority"),
            Loc.T("Col_RequirementStatus"),
            Loc.T("Col_TestStatus"),
            Loc.T("Col_Source"),
            Loc.T("Col_Parent")
        };
        for (var i = 0; i < reqGrid.Columns.Count && i < names.Length; i++)
        {
            var column = reqGrid.Columns[i];
            column.HeaderText = names[i];
            ModernTheme.ApplyColumnHeaderMinWidth(column, reqGrid, names[i]);
            column.HeaderCell.SortGlyphDirection = i == _reqSortColumn
                ? _reqSortOrder
                : SortOrder.None;
        }
    }

    private void InitializeLanguageMenu()
    {
        languageKoreanMenuItem = new ToolStripMenuItem(Loc.T("Menu_LanguageKorean"));
        languageEnglishMenuItem = new ToolStripMenuItem(Loc.T("Menu_LanguageEnglish"));
        languageSettingsMenuItem = new ToolStripMenuItem(Loc.T("Menu_LanguageSettings"));
        languageSettingsMenuItem.DropDownItems.AddRange(new ToolStripItem[] { languageKoreanMenuItem, languageEnglishMenuItem });

        var exitIndex = fileMenu.DropDownItems.IndexOf(exitMenuItem);
        fileMenu.DropDownItems.Insert(exitIndex, new ToolStripSeparator());
        fileMenu.DropDownItems.Insert(exitIndex + 1, languageSettingsMenuItem);

        UpdateLanguageMenuChecks();
    }

    private void UpdateLanguageMenuChecks()
    {
        var isKorean = !LocalizationService.IsEnglish;
        languageKoreanMenuItem.Checked = isKorean;
        languageEnglishMenuItem.Checked = !isKorean;
    }

    private void InitializeDatabaseMenu()
    {
        connectDatabaseMenuItem = new ToolStripMenuItem(Loc.T("Menu_ConnectDatabase"));
        saveToDatabaseMenuItem = new ToolStripMenuItem(Loc.T("Menu_SaveToDatabase"));
        loadFromDatabaseMenuItem = new ToolStripMenuItem(Loc.T("Menu_LoadFromDatabase"));
        databaseMenuItem = new ToolStripMenuItem(Loc.T("Menu_Database"));
        databaseMenuItem.DropDownItems.AddRange(new ToolStripItem[]
        {
            connectDatabaseMenuItem, saveToDatabaseMenuItem, loadFromDatabaseMenuItem
        });

        var toolsMenuIndex = menuStrip1.Items.IndexOf(toolsMenu);
        menuStrip1.Items.Insert(toolsMenuIndex, databaseMenuItem);

        connectDatabaseMenuItem.Click += (_, _) => ConnectToDatabase();
        saveToDatabaseMenuItem.Click += async (_, _) => await SaveToDatabaseAsync();
        loadFromDatabaseMenuItem.Click += async (_, _) => await LoadFromDatabaseAsync();
    }

    private void InitializeDatabaseToolButtons()
    {
        connectDatabaseToolButton = new ToolStripButton
        {
            Image = IconFactory.ConnectDatabase(),
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            Text = Loc.T("Tool_DbConnect"),
            ToolTipText = Loc.T("Menu_ConnectDatabase")
        };
        saveToDatabaseToolButton = new ToolStripButton
        {
            Image = IconFactory.SaveToDatabase(),
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            Text = Loc.T("Tool_DbSend"),
            ToolTipText = Loc.T("Menu_SaveToDatabase")
        };
        loadFromDatabaseToolButton = new ToolStripButton
        {
            Image = IconFactory.LoadFromDatabase(),
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            Text = Loc.T("Tool_DbReceive"),
            ToolTipText = Loc.T("Menu_LoadFromDatabase")
        };

        var exportIndex = toolStrip1.Items.IndexOf(exportReportToolButton);
        toolStrip1.Items.Insert(exportIndex + 1, new ToolStripSeparator());
        toolStrip1.Items.Insert(exportIndex + 2, connectDatabaseToolButton);
        toolStrip1.Items.Insert(exportIndex + 3, saveToDatabaseToolButton);
        toolStrip1.Items.Insert(exportIndex + 4, loadFromDatabaseToolButton);

        connectDatabaseToolButton.Click += (_, _) => ConnectToDatabase();
        saveToDatabaseToolButton.Click += async (_, _) => await SaveToDatabaseAsync();
        loadFromDatabaseToolButton.Click += async (_, _) => await LoadFromDatabaseAsync();
    }

    private void InitializeUndoRedoCommands()
    {
        undoMenuItem = new ToolStripMenuItem(Loc.T("Menu_Undo"), IconFactory.Undo(), (_, _) => PerformUndo())
        {
            ShortcutKeys = Keys.Control | Keys.Z,
            ShowShortcutKeys = true
        };
        redoMenuItem = new ToolStripMenuItem(Loc.T("Menu_Redo"), IconFactory.Redo(), (_, _) => PerformRedo())
        {
            ShortcutKeys = Keys.Control | Keys.Y,
            ShowShortcutKeys = true
        };

        editMenu.DropDownItems.Insert(0, redoMenuItem);
        editMenu.DropDownItems.Insert(0, undoMenuItem);
        editMenu.DropDownItems.Insert(2, new ToolStripSeparator());
        editMenu.DropDownOpening += (_, _) => UpdateUndoRedoUiState();

        undoToolButton = new ToolStripButton
        {
            Image = IconFactory.Undo(),
            DisplayStyle = ToolStripItemDisplayStyle.Image,
            ToolTipText = Loc.T("Tool_Undo")
        };
        redoToolButton = new ToolStripButton
        {
            Image = IconFactory.Redo(),
            DisplayStyle = ToolStripItemDisplayStyle.Image,
            ToolTipText = Loc.T("Tool_Redo")
        };
        undoToolButton.Click += (_, _) => PerformUndo();
        redoToolButton.Click += (_, _) => PerformRedo();

        var saveIndex = toolStrip1.Items.IndexOf(saveToolButton);
        toolStrip1.Items.Insert(saveIndex + 1, new ToolStripSeparator());
        toolStrip1.Items.Insert(saveIndex + 2, undoToolButton);
        toolStrip1.Items.Insert(saveIndex + 3, redoToolButton);

        reqCtxUndo = new ToolStripMenuItem(Loc.T("Menu_Undo"), IconFactory.Undo(), (_, _) => PerformUndo())
        {
            ShortcutKeys = Keys.Control | Keys.Z,
            ShowShortcutKeys = true
        };
        reqCtxRedo = new ToolStripMenuItem(Loc.T("Menu_Redo"), IconFactory.Redo(), (_, _) => PerformRedo())
        {
            ShortcutKeys = Keys.Control | Keys.Y,
            ShowShortcutKeys = true
        };
        reqContextMenu.Items.Insert(0, reqCtxRedo);
        reqContextMenu.Items.Insert(0, reqCtxUndo);
        reqContextMenu.Items.Insert(2, new ToolStripSeparator());

        tcCtxUndo = new ToolStripMenuItem(Loc.T("Menu_Undo"), IconFactory.Undo(), (_, _) => PerformUndo())
        {
            ShortcutKeys = Keys.Control | Keys.Z,
            ShowShortcutKeys = true
        };
        tcCtxRedo = new ToolStripMenuItem(Loc.T("Menu_Redo"), IconFactory.Redo(), (_, _) => PerformRedo())
        {
            ShortcutKeys = Keys.Control | Keys.Y,
            ShowShortcutKeys = true
        };
        testCaseContextMenu.Items.Insert(0, tcCtxRedo);
        testCaseContextMenu.Items.Insert(0, tcCtxUndo);
        testCaseContextMenu.Items.Insert(2, new ToolStripSeparator());

        _undoRedo.StateChanged += (_, _) => UpdateUndoRedoUiState();
        UpdateUndoRedoUiState();
    }

    private void RecordUndoSnapshot()
    {
        if (_isApplyingUndoRedo)
            return;

        _undoRedo.Record(_requirementService.Project);
    }

    private void ClearUndoHistory()
    {
        _undoRedo.Clear();
    }

    private void PerformUndo()
    {
        var selectedId = SelectedRequirement?.Id;
        var snapshot = _undoRedo.Undo(_requirementService.Project);
        if (snapshot is null)
            return;

        ApplyProjectSnapshot(snapshot, selectedId);
    }

    private void PerformRedo()
    {
        var selectedId = SelectedRequirement?.Id;
        var snapshot = _undoRedo.Redo(_requirementService.Project);
        if (snapshot is null)
            return;

        ApplyProjectSnapshot(snapshot, selectedId);
    }

    private void ApplyProjectSnapshot(ProjectData snapshot, Guid? selectedRequirementId)
    {
        _isApplyingUndoRedo = true;
        try
        {
            _loadedDetailRequirementId = null;
            _requirementService.RestoreProject(snapshot);
            RefreshAll();

            var targetId = selectedRequirementId;
            if (targetId is not null)
            {
                var requirement = _requirementService.AllRequirements.FirstOrDefault(r => r.Id == targetId);
                if (requirement is not null)
                {
                    SelectRequirementByCode(requirement.Code);
                    return;
                }
            }

            if (_requirementService.Project.Requirements.Count > 0)
                SelectRequirementByCode(_requirementService.Project.Requirements[0].Code);
            else
                RefreshDetailAndGrid();
        }
        finally
        {
            _isApplyingUndoRedo = false;
            UpdateUndoRedoUiState();
        }
    }

    private void UpdateUndoRedoUiState()
    {
        var canUndo = _undoRedo.CanUndo;
        var canRedo = _undoRedo.CanRedo;

        undoMenuItem.Enabled = canUndo;
        redoMenuItem.Enabled = canRedo;
        undoToolButton.Enabled = canUndo;
        redoToolButton.Enabled = canRedo;
        reqCtxUndo.Enabled = canUndo;
        reqCtxRedo.Enabled = canRedo;
        tcCtxUndo.Enabled = canUndo;
        tcCtxRedo.Enabled = canRedo;
    }

    private void InitializeAboutToolButton()
    {
        aboutToolButton = new ToolStripButton
        {
            Image = IconFactory.About(),
            DisplayStyle = ToolStripItemDisplayStyle.Image,
            Alignment = ToolStripItemAlignment.Right,
            ToolTipText = Loc.T("Menu_About")
        };
        toolStrip1.Items.Add(aboutToolButton);
        aboutToolButton.Click += (_, _) => new AboutForm().ShowDialog(this);
    }

    private void InitializeContextMenus()
    {
        reqCtxAdd = new ToolStripMenuItem();
        reqCtxEdit = new ToolStripMenuItem();
        reqCtxDelete = new ToolStripMenuItem();
        reqContextMenu = new ContextMenuStrip();
        reqContextMenu.Items.AddRange(new ToolStripItem[] { reqCtxAdd, reqCtxEdit, reqCtxDelete });
        reqContextMenu.Opening += (_, _) => UpdateRequirementContextMenuState();

        tcCtxAdd = new ToolStripMenuItem();
        tcCtxEdit = new ToolStripMenuItem();
        tcCtxDelete = new ToolStripMenuItem();
        tcCtxRecord = new ToolStripMenuItem();
        testCaseContextMenu = new ContextMenuStrip();
        testCaseContextMenu.Items.AddRange(new ToolStripItem[]
        {
            tcCtxAdd, tcCtxEdit, tcCtxDelete, new ToolStripSeparator(), tcCtxRecord
        });
        testCaseContextMenu.Opening += (_, _) => UpdateTestCaseContextMenuState();

        reqCtxAdd.Click += (_, _) => AddRequirement();
        reqCtxEdit.Click += (_, _) => EditSelectedRequirement();
        reqCtxDelete.Click += (_, _) => DeleteSelectedRequirement();

        tcCtxAdd.Click += (_, _) => AddTestCase();
        tcCtxEdit.Click += (_, _) => EditSelectedTestCase();
        tcCtxDelete.Click += (_, _) => DeleteSelectedTestCase();
        tcCtxRecord.Click += (_, _) => RecordTestRun();

        reqGrid.ContextMenuStrip = reqContextMenu;
        testCaseGrid.ContextMenuStrip = testCaseContextMenu;
    }

    private void UpdateRequirementContextMenuState()
    {
        var hasSelection = SelectedRequirement is not null;
        reqCtxEdit.Enabled = hasSelection;
        reqCtxDelete.Enabled = hasSelection;
    }

    private void UpdateTestCaseContextMenuState()
    {
        var hasRequirement = SelectedRequirement is not null;
        var hasTestCase = SelectedTestCase is not null;
        tcCtxAdd.Enabled = hasRequirement;
        tcCtxEdit.Enabled = hasTestCase;
        tcCtxDelete.Enabled = hasTestCase;
        tcCtxRecord.Enabled = hasTestCase;
    }

    private void ConnectToDatabase()
    {
        _dbSettings ??= AppSettingsService.LoadDbConnectionSettings(_settings) ?? new DbConnectionSettings();

        using var dlg = new DatabaseConnectionForm(_dbSettings);
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _dbSettings = dlg.Settings;
        AppSettingsService.SaveDbConnectionSettings(_settings, _dbSettings);
        AppSettingsService.Save(_settings);
    }

    private bool EnsureDatabaseConnected()
    {
        if (_dbSettings is not null)
            return true;

        ConnectToDatabase();
        if (_dbSettings is not null)
            return true;

        MessageBox.Show(
            this,
            Loc.T("Msg_DbNotConnected"),
            Loc.T("Title_DatabaseConnection"),
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
        return false;
    }

    private static string GetDatabaseDisplayName(DbConnectionSettings settings) =>
        settings.Provider == DbProvider.Sqlite
            ? (string.IsNullOrWhiteSpace(settings.SqliteFilePath) ? Loc.T("Db_FilePath") : settings.SqliteFilePath)
            : (string.IsNullOrWhiteSpace(settings.Database) ? Loc.T("Db_Database") : settings.Database);

    private async Task SaveToDatabaseAsync()
    {
        if (!EnsureDatabaseConnected())
            return;

        Cursor = Cursors.WaitCursor;
        try
        {
            var requirementCount = _requirementService.Project.Requirements.Count;
            await DatabaseProjectRepository.SaveAsync(_requirementService.Project, _dbSettings!);
            _requirementService.MarkSaved();
            MessageBox.Show(
                this,
                Loc.T("Msg_DbSaveSuccess", GetDatabaseDisplayName(_dbSettings!), requirementCount),
                Loc.T("Msg_DbSaveSuccessTitle"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Loc.T("Msg_DbSaveFailed"), ex);
        }
        finally
        {
            Cursor = Cursors.Default;
        }
    }

    private async Task LoadFromDatabaseAsync()
    {
        if (!EnsureDatabaseConnected())
            return;

        if (!TryProceedWithUnsavedChanges())
            return;

        Cursor = Cursors.WaitCursor;
        try
        {
            var data = await DatabaseProjectRepository.LoadAsync(_dbSettings!);
            _currentFilePath = null;
            _requirementService.ReplaceProject(data);
            ClearUndoHistory();
            MessageBox.Show(
                this,
                Loc.T("Msg_DbLoadSuccess", GetDatabaseDisplayName(_dbSettings!), data.Requirements.Count),
                Loc.T("Msg_DbLoadSuccessTitle"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDialog.Show(this, Loc.T("Msg_DbLoadFailed"), ex);
        }
        finally
        {
            Cursor = Cursors.Default;
        }
    }

    private void ApplyLocalization()
    {
        Text = "ReqTrace";

        fileMenu.Text = Loc.T("Menu_File");
        newProjectMenuItem.Text = Loc.T("Menu_NewProject");
        openProjectMenuItem.Text = Loc.T("Menu_OpenProject");
        saveMenuItem.Text = Loc.T("Menu_Save");
        saveAsMenuItem.Text = Loc.T("Menu_SaveAs");
        UpdateImportMenuLabels();
        exportReportMenuItem.Text = Loc.T("Menu_ExportReport");
        recentFilesMenuItem.Text = Loc.T("Menu_RecentProjects");
        languageSettingsMenuItem.Text = Loc.T("Menu_LanguageSettings");
        languageKoreanMenuItem.Text = Loc.T("Menu_LanguageKorean");
        languageEnglishMenuItem.Text = Loc.T("Menu_LanguageEnglish");
        exitMenuItem.Text = Loc.T("Menu_Exit");
        UpdateLanguageMenuChecks();

        editMenu.Text = Loc.T("Menu_Edit");
        undoMenuItem.Text = Loc.T("Menu_Undo");
        redoMenuItem.Text = Loc.T("Menu_Redo");
        addRequirementMenuItem.Text = Loc.T("Menu_AddRequirement");
        editRequirementMenuItem.Text = Loc.T("Menu_EditRequirement");
        deleteRequirementMenuItem.Text = Loc.T("Menu_DeleteRequirement");
        addTestCaseMenuItem.Text = Loc.T("Menu_AddTestCase");
        editTestCaseMenuItem.Text = Loc.T("Menu_EditTestCase");
        deleteTestCaseMenuItem.Text = Loc.T("Menu_DeleteTestCase");
        recordTestRunMenuItem.Text = Loc.T("Menu_RecordTestRun");

        reqCtxAdd.Text = Loc.T("Menu_AddRequirement");
        reqCtxEdit.Text = Loc.T("Menu_EditRequirement");
        reqCtxDelete.Text = Loc.T("Menu_DeleteRequirement");
        reqCtxUndo.Text = Loc.T("Menu_Undo");
        reqCtxRedo.Text = Loc.T("Menu_Redo");
        tcCtxAdd.Text = Loc.T("Menu_AddTestCase");
        tcCtxEdit.Text = Loc.T("Menu_EditTestCase");
        tcCtxDelete.Text = Loc.T("Menu_DeleteTestCase");
        tcCtxRecord.Text = Loc.T("Menu_RecordTestRun");
        tcCtxUndo.Text = Loc.T("Menu_Undo");
        tcCtxRedo.Text = Loc.T("Menu_Redo");

        viewMenu.Text = Loc.T("Menu_View");
        groupByCategoryMenuItem.Text = Loc.T("Menu_GroupByCategory");
        groupByHierarchyMenuItem.Text = Loc.T("Menu_GroupByHierarchy");
        refreshMenuItem.Text = Loc.T("Menu_Refresh");
        searchToggleMenuItem.Text = Loc.T("Menu_SearchFilter");

        databaseMenuItem.Text = Loc.T("Menu_Database");
        connectDatabaseMenuItem.Text = Loc.T("Menu_ConnectDatabase");
        saveToDatabaseMenuItem.Text = Loc.T("Menu_SaveToDatabase");
        loadFromDatabaseMenuItem.Text = Loc.T("Menu_LoadFromDatabase");

        toolsMenu.Text = Loc.T("Menu_Tools");
        traceabilitySummaryMenuItem.Text = Loc.T("Menu_TraceabilitySummary");
        llmSettingsMenuItem.Text = Loc.T("Menu_LlmSettings");
        optionsMenuItem.Text = Loc.T("Menu_Options");

        helpMenu.Text = Loc.T("Menu_Help");
        aboutMenuItem.Text = Loc.T("Menu_About");
        aboutToolButton.ToolTipText = Loc.T("Menu_About");

        newToolButton.Text = Loc.T("Tool_New");
        openToolButton.Text = Loc.T("Tool_Open");
        saveToolButton.Text = Loc.T("Tool_Save");
        undoToolButton.Text = Loc.T("Tool_Undo");
        undoToolButton.ToolTipText = Loc.T("Menu_Undo");
        redoToolButton.Text = Loc.T("Tool_Redo");
        redoToolButton.ToolTipText = Loc.T("Menu_Redo");
        UpdateImportMenuLabels();
        exportReportToolButton.Text = Loc.T("Tool_Export");
        connectDatabaseToolButton.Text = Loc.T("Tool_DbConnect");
        connectDatabaseToolButton.ToolTipText = Loc.T("Menu_ConnectDatabase");
        saveToDatabaseToolButton.Text = Loc.T("Tool_DbSend");
        saveToDatabaseToolButton.ToolTipText = Loc.T("Menu_SaveToDatabase");
        loadFromDatabaseToolButton.Text = Loc.T("Tool_DbReceive");
        loadFromDatabaseToolButton.ToolTipText = Loc.T("Menu_LoadFromDatabase");
        addRequirementToolButton.Text = Loc.T("Tool_AddReq");
        editRequirementToolButton.Text = Loc.T("Tool_EditReq");
        deleteRequirementToolButton.Text = Loc.T("Tool_DeleteReq");
        addTestCaseToolButton.Text = Loc.T("Tool_AddTC");
        recordTestRunToolButton.Text = Loc.T("Tool_RecordRun");

        lblTreeHeader.Text = Loc.T("Panel_Requirements");
        lblDetailHeader.Text = Loc.T("Panel_RequirementDetails");
        lblTestCasesHeader.Text = Loc.T("Panel_TestCases");

        lblCode.Text = Loc.T("Detail_Code");
        lblTitle.Text = Loc.T("Detail_Title");
        lblCategory.Text = Loc.T("Detail_Category");
        lblPriority.Text = Loc.T("Detail_Priority");
        lblStatusField.Text = Loc.T("Detail_Status");
        lblDescription.Text = Loc.T("Detail_Description");
        btnEditRequirement.Text = Loc.T("Btn_EditRequirement");

        UpdateRequirementColumnHeaders();
        EnsureTestCaseGridColumns();
        UpdateTestCaseGridHeaders();
        PopulateDetailEnumCombos();
        ApplyListHeaderStyles();
        RefreshRequirementsList();
        RefreshDetailAndGrid();
        RefreshStatusBar();
    }

    private void UpdateTestCaseGridHeaders()
    {
        if (testCaseGrid.Columns.Count == 0)
            return;

        foreach (DataGridViewColumn column in testCaseGrid.Columns)
        {
            column.HeaderText = column.Name switch
            {
                "Code" => Loc.T("Col_Code"),
                "Title" => Loc.T("Col_Title"),
                "Steps" => Loc.T("Col_Steps"),
                "ExpectedResult" => Loc.T("Col_ExpectedResult"),
                "Status" => Loc.T("Col_LatestStatus"),
                "LastRun" => Loc.T("Col_LastRun"),
                "LastRunBy" => Loc.T("Col_LastRunBy"),
                _ => column.HeaderText
            };
            ModernTheme.ApplyColumnHeaderMinWidth(column, testCaseGrid);
        }
    }

    private void EnsureRequirementsListColumns()
    {
        if (reqGrid.Columns.Count == RequirementListColumnCount)
            return;
        InitializeRequirementsGrid();
    }

    private void StylePanelHeaders()
    {
        StylePanelHeader(lblTreeHeader, ModernTheme.PastelBlue);
        StylePanelHeader(lblDetailHeader, ModernTheme.PastelGreen);
        StylePanelHeader(lblTestCasesHeader, ModernTheme.PastelRose);
    }

    private static void StylePanelHeader(Label header, Color backColor)
    {
        header.Font = ModernTheme.BoldFont;
        header.BackColor = backColor;
        header.ForeColor = ModernTheme.PanelHeaderText;
    }

    private void StylePanelBorders()
    {
        ModernTheme.ApplyPanelBorder(splitContainerMain.Panel1);
        splitContainerMain.Panel1.Padding = new Padding(10, 10, 0, 10);
        lblTreeHeader.Padding = new Padding(0);

        ModernTheme.ApplyPanelBorder(splitContainerDetail.Panel1);
        splitContainerDetail.Panel1.Padding = new Padding(10, 10, 10, 10);
        lblDetailHeader.Padding = new Padding(0);

        ModernTheme.ApplyPanelBorder(splitContainerDetail.Panel2);
        splitContainerDetail.Panel2.Padding = new Padding(10, 10, 10, 10);
        lblTestCasesHeader.Padding = new Padding(0);

        splitContainerMain.Panel1.Invalidate(true);
        splitContainerDetail.Panel1.Invalidate(true);
        splitContainerDetail.Panel2.Invalidate(true);
    }

    private void ApplyListHeaderStyles()
    {
        ApplyGridHeaderStyle(reqGrid);
        ApplyGridHeaderStyle(testCaseGrid);
    }

    private static void ApplyGridHeaderStyle(DataGridView grid)
    {
        grid.ColumnHeadersVisible = true;
        grid.EnableHeadersVisualStyles = false;
        ModernTheme.ApplySingleLineColumnHeaders(grid);
        grid.ColumnHeadersDefaultCellStyle.BackColor = ModernTheme.ListHeaderBack;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = ModernTheme.ListHeaderFore;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = ModernTheme.ListHeaderBack;
        grid.ColumnHeadersDefaultCellStyle.SelectionForeColor = ModernTheme.ListHeaderFore;

        foreach (DataGridViewColumn column in grid.Columns)
        {
            column.HeaderCell.Style.BackColor = ModernTheme.ListHeaderBack;
            column.HeaderCell.Style.ForeColor = ModernTheme.ListHeaderFore;
            column.HeaderCell.Style.SelectionBackColor = ModernTheme.ListHeaderBack;
            column.HeaderCell.Style.SelectionForeColor = ModernTheme.ListHeaderFore;
            column.HeaderCell.Style.WrapMode = DataGridViewTriState.False;
        }
    }

    private void AssignIcons()
    {
        menuStrip1.ImageScalingSize = new Size(16, 16);
        toolStrip1.ImageScalingSize = new Size(16, 16);
        statusStrip1.ImageScalingSize = new Size(16, 16);

        fileMenu.Image = IconFactory.Open();
        editMenu.Image = IconFactory.EditRequirement();
        viewMenu.Image = IconFactory.Search();
        databaseMenuItem.Image = IconFactory.ConnectDatabase();
        toolsMenu.Image = IconFactory.Options();
        helpMenu.Image = IconFactory.About();

        newToolButton.Image = newProjectMenuItem.Image = IconFactory.New();
        openToolButton.Image = openProjectMenuItem.Image = IconFactory.Open();
        saveToolButton.Image = saveMenuItem.Image = IconFactory.Save();
        undoMenuItem.Image = undoToolButton.Image = reqCtxUndo.Image = tcCtxUndo.Image = IconFactory.Undo();
        redoMenuItem.Image = redoToolButton.Image = reqCtxRedo.Image = tcCtxRedo.Image = IconFactory.Redo();
        saveAsMenuItem.Image = IconFactory.SaveAs();
        importExcelToolButton.Image = importExcelMenuItem.Image = IconFactory.ImportExcel();
        exportReportToolButton.Image = exportReportMenuItem.Image = IconFactory.ExportReport();
        recentFilesMenuItem.Image = IconFactory.RecentFiles();
        languageSettingsMenuItem.Image = IconFactory.Language();
        languageKoreanMenuItem.Image = IconFactory.LanguageKorean();
        languageEnglishMenuItem.Image = IconFactory.LanguageEnglish();
        exitMenuItem.Image = IconFactory.Exit();

        connectDatabaseMenuItem.Image = IconFactory.ConnectDatabase();
        saveToDatabaseMenuItem.Image = IconFactory.SaveToDatabase();
        loadFromDatabaseMenuItem.Image = IconFactory.LoadFromDatabase();
        connectDatabaseToolButton.Image = IconFactory.ConnectDatabase();
        saveToDatabaseToolButton.Image = IconFactory.SaveToDatabase();
        loadFromDatabaseToolButton.Image = IconFactory.LoadFromDatabase();

        addRequirementToolButton.Image = addRequirementMenuItem.Image = IconFactory.AddRequirement();
        editRequirementToolButton.Image = editRequirementMenuItem.Image = IconFactory.EditRequirement();
        deleteRequirementToolButton.Image = deleteRequirementMenuItem.Image = IconFactory.DeleteRequirement();
        addTestCaseToolButton.Image = addTestCaseMenuItem.Image = IconFactory.AddTestCase();
        editTestCaseMenuItem.Image = IconFactory.EditTestCase();
        deleteTestCaseMenuItem.Image = IconFactory.DeleteTestCase();
        recordTestRunToolButton.Image = recordTestRunMenuItem.Image = IconFactory.RecordRun();

        reqCtxAdd.Image = IconFactory.AddRequirement();
        reqCtxEdit.Image = IconFactory.EditRequirement();
        reqCtxDelete.Image = IconFactory.DeleteRequirement();
        tcCtxAdd.Image = IconFactory.AddTestCase();
        tcCtxEdit.Image = IconFactory.EditTestCase();
        tcCtxDelete.Image = IconFactory.DeleteTestCase();
        tcCtxRecord.Image = IconFactory.RecordRun();

        groupByCategoryMenuItem.Image = IconFactory.GroupByCategory();
        groupByHierarchyMenuItem.Image = IconFactory.GroupByHierarchy();
        refreshMenuItem.Image = IconFactory.Refresh();
        searchToggleMenuItem.Image = IconFactory.Search();

        traceabilitySummaryMenuItem.Image = IconFactory.Summary();
        optionsMenuItem.Image = IconFactory.Options();
        aboutMenuItem.Image = IconFactory.About();
        aboutToolButton.Image = IconFactory.About();

        statusFileLabel.Image = IconFactory.Open();
        Icon = AppAssets.AppIcon;

        foreach (ToolStripItem item in toolStrip1.Items)
        {
            if (item is ToolStripButton button)
                button.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        }
    }

    private void WireEvents()
    {
        newProjectMenuItem.Click += (_, _) => NewProject();
        newToolButton.Click += (_, _) => NewProject();
        openProjectMenuItem.Click += (_, _) => OpenProject();
        openToolButton.Click += (_, _) => OpenProject();
        saveMenuItem.Click += (_, _) => SaveProject(false);
        saveToolButton.Click += (_, _) => SaveProject(false);
        saveAsMenuItem.Click += (_, _) => SaveProject(true);
        importExcelMenuItem.Click += (_, _) => ImportFromExcel();
        importExcelToolButton.Click += (_, _) => ImportFromExcel();
        exportReportMenuItem.Click += (_, _) => ExportReport();
        exportReportToolButton.Click += (_, _) => ExportReport();
        exitMenuItem.Click += (_, _) => Close();
        languageKoreanMenuItem.Click += (_, _) => ChangeLanguage(LocalizationService.DefaultLanguage);
        languageEnglishMenuItem.Click += (_, _) => ChangeLanguage(LocalizationService.EnglishLanguage);

        addRequirementMenuItem.Click += (_, _) => AddRequirement();
        addRequirementToolButton.Click += (_, _) => AddRequirement();
        editRequirementMenuItem.Click += (_, _) => EditSelectedRequirement();
        editRequirementToolButton.Click += (_, _) => EditSelectedRequirement();
        btnEditRequirement.Click += (_, _) => EditSelectedRequirement();
        deleteRequirementMenuItem.Click += (_, _) => DeleteSelectedRequirement();
        deleteRequirementToolButton.Click += (_, _) => DeleteSelectedRequirement();

        addTestCaseMenuItem.Click += (_, _) => AddTestCase();
        addTestCaseToolButton.Click += (_, _) => AddTestCase();
        editTestCaseMenuItem.Click += (_, _) => EditSelectedTestCase();
        deleteTestCaseMenuItem.Click += (_, _) => DeleteSelectedTestCase();
        recordTestRunMenuItem.Click += (_, _) => RecordTestRun();
        recordTestRunToolButton.Click += (_, _) => RecordTestRun();

        groupByCategoryMenuItem.Click += (_, _) => SetGrouping(false);
        groupByHierarchyMenuItem.Click += (_, _) => SetGrouping(true);
        refreshMenuItem.Click += (_, _) => RefreshAll();
        traceabilitySummaryMenuItem.Click += (_, _) => ShowTraceabilitySummary();
        llmSettingsMenuItem.Click += (_, _) => ShowLlmSettings();
        optionsMenuItem.Click += (_, _) => ShowOptions();
        aboutMenuItem.Click += (_, _) => new AboutForm().ShowDialog(this);

        reqGrid.SelectionChanged += (_, _) =>
        {
            if (_refreshingUi)
                return;

            CommitDetailPanel();
            RefreshDetailAndGrid();
        };
        reqGrid.ColumnHeaderMouseClick += ReqGrid_ColumnHeaderMouseClick;
        reqGrid.CellDoubleClick += (_, e) =>
        {
            if (e.RowIndex >= 0)
                EditSelectedRequirement();
        };
        reqGrid.CellMouseDown += ReqGrid_CellMouseDown;
        reqGrid.CellFormatting += ReqGrid_CellFormatting;
        testCaseGrid.CellDoubleClick += (_, _) => EditSelectedTestCase();
        testCaseGrid.CellMouseDown += TestCaseGrid_CellMouseDown;

        FormClosing += MainForm_FormClosing;
    }

    private void ReqGrid_CellMouseDown(object? sender, DataGridViewCellMouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right || e.RowIndex < 0)
            return;

        if (!reqGrid.Rows[e.RowIndex].Selected)
        {
            reqGrid.ClearSelection();
            reqGrid.Rows[e.RowIndex].Selected = true;
        }

        if (e.ColumnIndex >= 0)
            reqGrid.CurrentCell = reqGrid.Rows[e.RowIndex].Cells[e.ColumnIndex];
    }

    private void ReqGrid_CellFormatting(object? sender, DataGridViewCellFormattingEventArgs e)
    {
        if (e.RowIndex < 0 || e.CellStyle is null)
            return;

        var row = reqGrid.Rows[e.RowIndex];
        if (row.Tag is Requirement req)
            e.CellStyle.ForeColor = StatusForeColor(req.AggregateStatus);
        else
            e.CellStyle.ForeColor = Color.Gray;
    }

    private void TestCaseGrid_CellMouseDown(object? sender, DataGridViewCellMouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right || e.RowIndex < 0)
            return;

        if (!testCaseGrid.Rows[e.RowIndex].Selected)
        {
            testCaseGrid.ClearSelection();
            testCaseGrid.Rows[e.RowIndex].Selected = true;
        }

        if (e.ColumnIndex >= 0)
            testCaseGrid.CurrentCell = testCaseGrid.Rows[e.RowIndex].Cells[e.ColumnIndex];
    }

    private void ChangeLanguage(string languageCode)
    {
        LocalizationService.SetLanguage(languageCode, _settings);
    }

    private void InitializeDetailEditors()
    {
        PopulateDetailEnumCombos();
        StyleDetailInputControls();

        txtDetailDescription.Multiline = true;
        txtDetailDescription.AcceptsReturn = true;
        txtDetailDescription.WordWrap = true;
        txtDetailDescription.ScrollBars = ScrollBars.Vertical;

        foreach (var box in new[] { txtDetailCode, txtDetailTitle, txtDetailCategory, txtDetailDescription })
            box.Validated += (_, _) => CommitDetailPanel();

        cboDetailPriority.SelectedIndexChanged += (_, _) => CommitDetailPanel();
        cboDetailStatus.SelectedIndexChanged += (_, _) => CommitDetailPanel();
    }

    private void StyleDetailInputControls()
    {
        var emphasisFont = new Font(Font, FontStyle.Bold);
        foreach (var label in new[] { lblCategory, lblDescription })
            label.Font = emphasisFont;

        foreach (var label in new[] { lblCode, lblTitle, lblCategory, lblPriority, lblStatusField, lblDescription })
        {
            label.AutoSize = false;
            label.Dock = DockStyle.Fill;
            label.Margin = new Padding(3, 0, 3, 0);
            label.TextAlign = ContentAlignment.MiddleLeft;
        }

        foreach (var input in new Control[] { txtDetailCode, txtDetailTitle, txtDetailCategory, txtDetailDescription, cboDetailPriority, cboDetailStatus })
        {
            input.Dock = DockStyle.Fill;
            input.Margin = Padding.Empty;
        }

        txtDetailCategory.Font = new Font(Font.FontFamily, Font.Size, FontStyle.Regular);

        foreach (var comboBox in new[] { cboDetailPriority, cboDetailStatus })
        {
            comboBox.FlatStyle = FlatStyle.Standard;
            comboBox.IntegralHeight = false;
        }
    }

    private void PopulateDetailEnumCombos()
    {
        _loadingDetail = true;
        try
        {
            var priorityIndex = Math.Max(0, cboDetailPriority.SelectedIndex);
            var statusIndex = Math.Max(0, cboDetailStatus.SelectedIndex);

            cboDetailPriority.Items.Clear();
            foreach (Priority value in Enum.GetValues<Priority>())
                cboDetailPriority.Items.Add(Loc.Enum(value));

            cboDetailStatus.Items.Clear();
            foreach (RequirementStatus value in Enum.GetValues<RequirementStatus>())
                cboDetailStatus.Items.Add(Loc.Enum(value));

            if (cboDetailPriority.Items.Count > 0)
                cboDetailPriority.SelectedIndex = Math.Min(priorityIndex, cboDetailPriority.Items.Count - 1);
            if (cboDetailStatus.Items.Count > 0)
                cboDetailStatus.SelectedIndex = Math.Min(statusIndex, cboDetailStatus.Items.Count - 1);
        }
        finally
        {
            _loadingDetail = false;
        }
    }

    private void CommitDetailPanel()
    {
        if (_loadingDetail || _refreshingUi || _isApplyingUndoRedo || _loadedDetailRequirementId is not { } id)
            return;

        var req = _requirementService.AllRequirements.FirstOrDefault(r => r.Id == id);
        if (req is null)
            return;

        if (!TryApplyDetailPanelToRequirement(req, out var listNeedsRefresh))
        {
            LoadDetailPanel(req);
            SelectRequirementByCode(req.Code);
            return;
        }

        if (listNeedsRefresh)
        {
            var selectedCode = SelectedRequirement?.Code ?? req.Code;
            RefreshRequirementsList();
            SelectRequirementByCode(selectedCode);
        }
    }

    private bool TryApplyDetailPanelToRequirement(Requirement req, out bool listNeedsRefresh)
    {
        listNeedsRefresh = false;

        if (string.IsNullOrWhiteSpace(txtDetailTitle.Text))
        {
            MessageBox.Show(this, Loc.T("Msg_TitleRequired"), Loc.T("Common_Validation"),
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        var newCode = txtDetailCode.Text.Trim();
        if (string.IsNullOrWhiteSpace(newCode))
        {
            MessageBox.Show(this, Loc.T("Msg_ValueRequired"), Loc.T("Common_Validation"),
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        var duplicate = _requirementService.FindByCode(newCode);
        if (duplicate is not null && duplicate.Id != req.Id)
        {
            MessageBox.Show(this, Loc.T("Msg_DuplicateCode", newCode), Loc.T("Common_Validation"),
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        var newTitle = txtDetailTitle.Text.Trim();
        var newCategory = txtDetailCategory.Text.Trim();
        var newDescription = txtDetailDescription.Text.Trim();
        var newPriority = cboDetailPriority.SelectedIndex >= 0
            ? (Priority)cboDetailPriority.SelectedIndex
            : req.Priority;
        var newStatus = cboDetailStatus.SelectedIndex >= 0
            ? (RequirementStatus)cboDetailStatus.SelectedIndex
            : req.Status;

        if (DetailFieldsEqual(req, newCode, newTitle, newCategory, newDescription, newPriority, newStatus))
        {
            return true;
        }

        listNeedsRefresh = !string.Equals(DetailText(req.Code), newCode, StringComparison.Ordinal)
            || !string.Equals(DetailText(req.Title), newTitle, StringComparison.Ordinal);

        RecordUndoSnapshot();

        req.Code = newCode;
        req.Title = newTitle;
        req.Category = newCategory;
        req.Description = newDescription;
        req.Priority = newPriority;
        req.Status = newStatus;

        _requirementService.Update(req);
        return true;
    }

    private static string DetailText(string? value) => value ?? string.Empty;

    private static bool DetailFieldsEqual(
        Requirement req,
        string code,
        string title,
        string category,
        string description,
        Priority priority,
        RequirementStatus status) =>
        string.Equals(DetailText(req.Code), code, StringComparison.Ordinal)
        && string.Equals(DetailText(req.Title), title, StringComparison.Ordinal)
        && string.Equals(DetailText(req.Category), category, StringComparison.Ordinal)
        && string.Equals(DetailText(req.Description), description, StringComparison.Ordinal)
        && req.Priority == priority
        && req.Status == status;

    private void LoadDetailPanel(Requirement? req)
    {
        _loadingDetail = true;
        try
        {
            var enabled = req is not null;
            txtDetailCode.Enabled = enabled;
            txtDetailTitle.Enabled = enabled;
            txtDetailCategory.Enabled = enabled;
            cboDetailPriority.Enabled = enabled;
            cboDetailStatus.Enabled = enabled;
            txtDetailDescription.Enabled = enabled;
            btnEditRequirement.Enabled = enabled;

            if (req is null)
            {
                _loadedDetailRequirementId = null;
                txtDetailCode.Text = txtDetailTitle.Text = txtDetailCategory.Text = txtDetailDescription.Text = string.Empty;
                cboDetailPriority.SelectedIndex = -1;
                cboDetailStatus.SelectedIndex = -1;
                return;
            }

            _loadedDetailRequirementId = req.Id;
            txtDetailCode.Text = DetailText(req.Code);
            txtDetailTitle.Text = DetailText(req.Title);
            txtDetailCategory.Text = DetailText(req.Category);
            txtDetailDescription.Text = DetailText(req.Description);
            cboDetailPriority.SelectedIndex = Math.Max(0, Array.IndexOf(Enum.GetValues<Priority>(), req.Priority));
            cboDetailStatus.SelectedIndex = Math.Max(0, Array.IndexOf(Enum.GetValues<RequirementStatus>(), req.Status));
        }
        finally
        {
            _loadingDetail = false;
        }
    }

    private void SetGrouping(bool byHierarchy)
    {
        _groupByHierarchy = byHierarchy;
        groupByCategoryMenuItem.Checked = !byHierarchy;
        groupByHierarchyMenuItem.Checked = byHierarchy;
        RefreshRequirementsList();
    }

    private void ReqGrid_ColumnHeaderMouseClick(object? sender, DataGridViewCellMouseEventArgs e)
    {
        if (e.ColumnIndex < 0)
            return;

        if (e.ColumnIndex == _reqSortColumn)
            _reqSortOrder = _reqSortOrder == SortOrder.Ascending ? SortOrder.Descending : SortOrder.Ascending;
        else
        {
            _reqSortColumn = e.ColumnIndex;
            _reqSortOrder = SortOrder.Ascending;
        }

        UpdateRequirementColumnHeaders();
        RefreshRequirementsList();
    }

    private IEnumerable<Requirement> OrderRequirements(IEnumerable<Requirement> source)
    {
        var list = source.ToList();
        var allById = _requirementService.AllRequirements.ToDictionary(r => r.Id);

        string ParentCode(Requirement r) =>
            r.ParentId is { } pid && allById.TryGetValue(pid, out var parent) ? parent.Code : string.Empty;

        return (_reqSortColumn, _reqSortOrder) switch
        {
            (1, SortOrder.Ascending) => list.OrderBy(r => r.Category, StringComparer.OrdinalIgnoreCase),
            (1, SortOrder.Descending) => list.OrderByDescending(r => r.Category, StringComparer.OrdinalIgnoreCase),
            (2, SortOrder.Ascending) => list.OrderBy(r => r.Title, StringComparer.OrdinalIgnoreCase),
            (2, SortOrder.Descending) => list.OrderByDescending(r => r.Title, StringComparer.OrdinalIgnoreCase),
            (3, SortOrder.Ascending) => list.OrderBy(r => r.Description, StringComparer.OrdinalIgnoreCase),
            (3, SortOrder.Descending) => list.OrderByDescending(r => r.Description, StringComparer.OrdinalIgnoreCase),
            (4, SortOrder.Ascending) => list.OrderBy(r => r.Priority).ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
            (4, SortOrder.Descending) => list.OrderByDescending(r => r.Priority).ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
            (5, SortOrder.Ascending) => list.OrderBy(r => r.Status).ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
            (5, SortOrder.Descending) => list.OrderByDescending(r => r.Status).ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
            (6, SortOrder.Ascending) => list.OrderBy(r => r.AggregateStatus).ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
            (6, SortOrder.Descending) => list.OrderByDescending(r => r.AggregateStatus).ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
            (7, SortOrder.Ascending) => list.OrderBy(r => r.Source, StringComparer.OrdinalIgnoreCase),
            (7, SortOrder.Descending) => list.OrderByDescending(r => r.Source, StringComparer.OrdinalIgnoreCase),
            (8, SortOrder.Ascending) => list.OrderBy(ParentCode, StringComparer.OrdinalIgnoreCase),
            (8, SortOrder.Descending) => list.OrderByDescending(ParentCode, StringComparer.OrdinalIgnoreCase),
            (_, SortOrder.Descending) => list.OrderByDescending(r => r.Code, StringComparer.OrdinalIgnoreCase),
            _ => list.OrderBy(r => r.Code, StringComparer.OrdinalIgnoreCase),
        };
    }

    // ---------- File operations ----------

    private bool TryProceedWithUnsavedChanges()
    {
        CommitDetailPanel();

        if (!_requirementService.IsDirty)
            return true;

        var result = MessageBox.Show(this, Loc.T("Msg_UnsavedChanges"), Loc.T("Msg_UnsavedChangesTitle"),
            MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);

        return result switch
        {
            DialogResult.Yes => SaveProject(_currentFilePath is null),
            DialogResult.No => true,
            _ => false
        };
    }

    private void NewProject()
    {
        if (!TryProceedWithUnsavedChanges())
            return;

        using var dlg = new TextInputForm(Loc.T("Msg_NewProjectTitle"), Loc.T("Msg_ProjectNamePrompt"), Loc.T("DefaultProjectName"));
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _currentFilePath = null;
        AppSettingsService.SetLastProjectPath(_settings, null);
        AppSettingsService.Save(_settings);
        _requirementService.ReplaceProject(ProjectRepository.CreateNew(dlg.Value));
        ClearUndoHistory();
    }

    private void OpenProject()
    {
        if (!TryProceedWithUnsavedChanges())
            return;

        using var ofd = new OpenFileDialog
        {
            Filter = Loc.T("Filter_Project"),
            InitialDirectory = Directory.Exists(_settings.LastProjectFolder) ? _settings.LastProjectFolder : string.Empty
        };
        if (ofd.ShowDialog(this) != DialogResult.OK)
            return;

        OpenProjectFile(ofd.FileName);
    }

    private void OpenProjectFile(string filePath)
    {
        try
        {
            var data = ProjectRepository.Load(filePath);
            _currentFilePath = filePath;
            _requirementService.ReplaceProject(data);
            ClearUndoHistory();
            _settings.LastProjectFolder = Path.GetDirectoryName(filePath) ?? _settings.LastProjectFolder;
            AppSettingsService.AddRecentFile(_settings, filePath);
            AppSettingsService.SetLastProjectPath(_settings, filePath);
            AppSettingsService.Save(_settings);
            RebuildRecentFilesMenu();
        }
        catch (Exception ex) when (ex is ProjectLoadException or IOException or UnauthorizedAccessException)
        {
            ErrorDialog.Show(this, Loc.T("Msg_OpenProjectFailed"), ex);
        }
    }

    private bool SaveProject(bool forceSaveAs)
    {
        var path = _currentFilePath;
        if (forceSaveAs || path is null)
        {
            using var sfd = new SaveFileDialog
            {
                Filter = Loc.T("Filter_Project"),
                FileName = _requirementService.Project.ProjectName + ".reqtproj",
                InitialDirectory = Directory.Exists(_settings.LastProjectFolder) ? _settings.LastProjectFolder : string.Empty
            };
            if (sfd.ShowDialog(this) != DialogResult.OK)
                return false;
            path = sfd.FileName;
        }

        try
        {
            ProjectRepository.Save(_requirementService.Project, path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            ErrorDialog.Show(this, Loc.T("Msg_SaveProjectFailed"), ex);
            return false;
        }

        _currentFilePath = path;
        _requirementService.MarkSaved();
        _settings.LastProjectFolder = Path.GetDirectoryName(path) ?? _settings.LastProjectFolder;
        AppSettingsService.AddRecentFile(_settings, path);
        AppSettingsService.SetLastProjectPath(_settings, path);
        AppSettingsService.Save(_settings);
        RebuildRecentFilesMenu();
        RefreshStatusBar();
        return true;
    }

    private void RebuildRecentFilesMenu()
    {
        recentFilesMenuItem.DropDownItems.Clear();
        foreach (var file in _settings.RecentFiles)
        {
            var item = new ToolStripMenuItem(file)
            {
                Image = IconFactory.Open()
            };
            item.Click += (_, _) =>
            {
                if (TryProceedWithUnsavedChanges())
                    OpenProjectFile(file);
            };
            recentFilesMenuItem.DropDownItems.Add(item);
        }
        recentFilesMenuItem.Enabled = recentFilesMenuItem.DropDownItems.Count > 0;
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!TryProceedWithUnsavedChanges())
        {
            e.Cancel = true;
            return;
        }

        if (_currentFilePath is not null)
            AppSettingsService.SetLastProjectPath(_settings, _currentFilePath);

        AppSettingsService.Save(_settings);
    }

    private void TryOpenStartupProject()
    {
        if (_startupProjectOpened)
            return;

        _startupProjectOpened = true;

        if (!string.IsNullOrWhiteSpace(_startupProjectPath))
        {
            var path = Path.GetFullPath(_startupProjectPath);
            if (File.Exists(path))
            {
                OpenProjectFile(path);
                return;
            }
        }

        var lastPath = ResolveLastProjectPath();
        if (lastPath is not null)
            OpenProjectFile(lastPath);
    }

    private string? ResolveLastProjectPath()
    {
        if (!string.IsNullOrWhiteSpace(_settings.LastProjectPath) && File.Exists(_settings.LastProjectPath))
            return _settings.LastProjectPath;

        return _settings.RecentFiles.FirstOrDefault(File.Exists);
    }

    // ---------- Requirement CRUD ----------

    private Requirement? SelectedRequirement =>
        reqGrid.CurrentRow?.Tag as Requirement;

    private void AddRequirement()
    {
        using var dlg = new RequirementEditForm(null, _requirementService.AllRequirements);
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;
        RecordUndoSnapshot();
        _requirementService.Add(dlg.Result);
        SelectRequirementByCode(dlg.Result.Code);
    }

    private void EditSelectedRequirement()
    {
        CommitDetailPanel();

        var req = SelectedRequirement;
        if (req is null)
            return;

        RecordUndoSnapshot();
        using var dlg = new RequirementEditForm(req, _requirementService.AllRequirements.Where(r => r.Id != req.Id));
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _requirementService.Update(req);
        SelectRequirementByCode(req.Code);
    }

    private void DeleteSelectedRequirement()
    {
        var selected = reqGrid.SelectedRows
            .Cast<DataGridViewRow>()
            .Select(row => row.Tag as Requirement)
            .Where(r => r is not null)
            .Cast<Requirement>()
            .ToList();

        if (selected.Count == 0)
            return;

        var message = selected.Count == 1
            ? Loc.T("Msg_DeleteRequirement", selected[0].Code, selected[0].Title)
            : Loc.T("Msg_DeleteRequirements", selected.Count);

        var result = MessageBox.Show(this, message,
            Loc.T("Common_ConfirmDelete"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (result != DialogResult.Yes)
            return;

        CommitDetailPanel();
        RecordUndoSnapshot();
        if (selected.Count == 1)
            _requirementService.Delete(selected[0]);
        else
            _requirementService.DeleteMany(selected);

        RefreshAll();
    }

    private void SelectRequirementByCode(string code)
    {
        foreach (DataGridViewRow row in reqGrid.Rows)
        {
            if (row.Tag is Requirement r && r.Code == code)
            {
                row.Selected = true;
                reqGrid.CurrentCell = row.Cells[0];
                reqGrid.FirstDisplayedScrollingRowIndex = Math.Max(0, row.Index);
                RefreshDetailAndGrid();
                break;
            }
        }
    }

    // ---------- Test case CRUD ----------

    private TestCase? SelectedTestCase
    {
        get
        {
            if (testCaseGrid.CurrentRow?.Tag is TestCase tc)
                return tc;
            return null;
        }
    }

    private void AddTestCase()
    {
        var req = SelectedRequirement;
        if (req is null)
        {
            MessageBox.Show(this, Loc.T("Msg_NoRequirementSelected"), Loc.T("Msg_NoRequirementSelectedTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new TestCaseEditForm(null, GetExistingTestCaseCodes());
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;
        RecordUndoSnapshot();
        _testCaseService.Add(req, dlg.Result);
        RefreshDetailAndGrid();
    }

    private void EditSelectedTestCase()
    {
        var req = SelectedRequirement;
        var tc = SelectedTestCase;
        if (req is null || tc is null)
            return;

        RecordUndoSnapshot();
        using var dlg = new TestCaseEditForm(tc, GetExistingTestCaseCodes());
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;

        _testCaseService.Update(req);
        RefreshDetailAndGrid();
    }

    private void DeleteSelectedTestCase()
    {
        var req = SelectedRequirement;
        var tc = SelectedTestCase;
        if (req is null || tc is null)
            return;

        var result = MessageBox.Show(this, Loc.T("Msg_DeleteTestCase", tc.Code, tc.Title),
            Loc.T("Common_ConfirmDelete"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (result != DialogResult.Yes)
            return;

        CommitDetailPanel();
        RecordUndoSnapshot();
        _testCaseService.Delete(req, tc);
        RefreshDetailAndGrid();
    }

    private void RecordTestRun()
    {
        var req = SelectedRequirement;
        var tc = SelectedTestCase;
        if (req is null || tc is null)
        {
            MessageBox.Show(this, Loc.T("Msg_NoTestCaseSelected"), Loc.T("Msg_NoTestCaseSelectedTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new TestRunEntryForm(tc);
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;
        RecordUndoSnapshot();
        _testRunService.RecordRun(req, tc, dlg.Result);
        RefreshDetailAndGrid();
    }

    // ---------- Reporting ----------

    private void ImportFromExcel()
    {
        using var ofd = new OpenFileDialog { Filter = Loc.T("Filter_Excel"), InitialDirectory = _settings.LastImportFolder };
        if (ofd.ShowDialog(this) != DialogResult.OK)
            return;

        _settings.LastImportFolder = Path.GetDirectoryName(ofd.FileName) ?? _settings.LastImportFolder;
        AppSettingsService.Save(_settings);

        ImportFromExcelWithDialog(ofd.FileName);
    }

    private void ImportFromExcelWithDialog(string filePath)
    {
        AiImportForm dlg;
        try
        {
            dlg = new AiImportForm(filePath, _settings);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            ErrorDialog.Show(this, Loc.T("Msg_ImportFailed"),
                new IOException(Loc.T("Msg_ImportOpenFailed", filePath), ex));
            return;
        }

        dlg.GetReservedRequirementCodes = GetExistingRequirementCodes;
        dlg.GetReservedTestCaseCodes = GetExistingTestCaseCodes;

        using (dlg)
        {
            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;

            FinishImportedRequirements(
                dlg.ImportedRequirements,
                dlg.Warnings,
                dlg.RowsProcessed,
                dlg.RowsSkipped,
                dlg.GeneratedTestCases,
                Loc.T("Msg_ImportNoneImported"));
        }
    }

    private IEnumerable<string> GetExistingRequirementCodes() =>
        _requirementService.AllRequirements.Select(r => r.Code);

    private IEnumerable<string> GetExistingTestCaseCodes() =>
        _requirementService.AllRequirements.SelectMany(r => r.TestCases).Select(tc => tc.Code);

    private static void EnableDoubleBuffering(Control control)
    {
        typeof(Control).InvokeMember(
            "DoubleBuffered",
            System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.SetProperty,
            null,
            control,
            [true]);
    }

    private void FinishImportedRequirements(
        List<Requirement> imported,
        List<string> warnings,
        int rowsProcessed,
        int rowsSkipped,
        bool generatedTestCases,
        string noneImportedMessage)
    {
        var duplicateCount = imported.Count(r => _requirementService.FindByCode(r.Code) is not null);
        var overwriteDuplicates = false;
        if (duplicateCount > 0)
        {
            overwriteDuplicates = MessageBox.Show(this,
                Loc.T("Msg_DuplicateRequirementsBatch", duplicateCount),
                Loc.T("Msg_DuplicateRequirementTitle"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) == DialogResult.Yes;
        }

        var toImport = new List<Requirement>();
        var toDelete = new List<Requirement>();
        foreach (var requirement in imported)
        {
            var existing = _requirementService.FindByCode(requirement.Code);
            if (existing is not null)
            {
                if (overwriteDuplicates)
                {
                    toDelete.Add(existing);
                    toImport.Add(requirement);
                }
            }
            else
            {
                toImport.Add(requirement);
            }
        }

        if (toImport.Count == 0)
        {
            MessageBox.Show(this,
                imported.Count == 0
                    ? noneImportedMessage
                    : Loc.T("Msg_ImportNoneAdded"),
                Loc.T("Msg_ImportTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ProgressDialogRunner.RunUi(
            this,
            Loc.T("Dlg_ProgressApplyImportTitle"),
            Loc.T("Dlg_ProgressApplyImportMessage", toImport.Count),
            progress =>
            {
                progress.Report(10);
                RecordUndoSnapshot();
                if (toDelete.Count > 0)
                    _requirementService.DeleteMany(toDelete);

                progress.Report(40);
                _requirementService.ImportMany(toImport);
                progress.Report(80);
                RefreshAll();
                SelectRequirementByCode(toImport[0].Code);
                progress.Report(100);
            });

        var testCaseCount = toImport.Sum(r => r.TestCases.Count);
        var summarySuffix = generatedTestCases
            ? Loc.T("Msg_ImportSummaryWithTests", testCaseCount)
            : Loc.T("Msg_ImportSummaryEnd");
        MessageBox.Show(this,
            Loc.T("Msg_ImportSummary", rowsProcessed, rowsSkipped, toImport.Count, summarySuffix),
            Loc.T("Msg_ImportSummaryTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);

        if (warnings.Count > 0)
        {
            MessageBox.Show(this, Loc.T("Msg_ImportWarnings", warnings.Count, string.Join("\n", warnings.Take(20))),
                Loc.T("Msg_ImportWarningsTitle"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void ExportReport()
    {
        using var dlg = new ExportOptionsForm(_requirementService.Project, _settings);
        dlg.ShowDialog(this);
        AppSettingsService.Save(_settings);
    }

    private void ShowOptions()
    {
        using var dlg = new OptionsForm(_settings);
        dlg.ShowDialog(this);
    }

    private void ShowLlmSettings()
    {
        using var dlg = new LlmSettingsForm(_settings);
        dlg.ShowDialog(this);
        UpdateImportMenuLabels();
    }

    private void ShowTraceabilitySummary()
    {
        var project = _requirementService.Project;
        var msg = Loc.T("Msg_TraceabilitySummary",
            project.Requirements.Count,
            TraceabilityCalculator.RequirementsWithTests(project),
            TraceabilityCalculator.TotalTestCases(project),
            TraceabilityCalculator.CoveragePercent(project),
            TraceabilityCalculator.PassRatePercent(project));
        MessageBox.Show(this, msg, Loc.T("Msg_TraceabilitySummaryTitle"), MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    // ---------- UI refresh ----------

    private void RefreshAll()
    {
        RefreshRequirementsList();
        RefreshDetailAndGrid();
        RefreshStatusBar();
    }

    private void RefreshRequirementsList()
    {
        _refreshingUi = true;
        try
        {
            RefreshRequirementsListCore();
        }
        finally
        {
            _refreshingUi = false;
        }
    }

    private void RefreshRequirementsListCore()
    {
        EnsureRequirementsListColumns();

        var previousCode = SelectedRequirement?.Code;
        reqGrid.SuspendLayout();
        try
        {
            reqGrid.Rows.Clear();

            var requirements = _requirementService.AllRequirements.ToList();
            var byId = requirements.ToDictionary(r => r.Id);

            if (requirements.Count == 0)
            {
                reqGrid.Rows.Add(
                    Loc.T("Placeholder_NoRequirements"),
                    Loc.T("Placeholder_NoRequirementsHint"),
                    string.Empty,
                    string.Empty,
                    string.Empty,
                    string.Empty,
                    string.Empty,
                    string.Empty,
                    string.Empty);
                return;
            }

            if (_groupByHierarchy)
            {
                var displayed = new HashSet<Guid>();
                var byParent = requirements.ToLookup(r => r.ParentId);

                void AddChildren(Guid? parentId, int depth)
                {
                    foreach (var req in OrderRequirements(byParent[parentId]))
                    {
                        AddRequirementGridRow(req, depth, byId);
                        displayed.Add(req.Id);
                        AddChildren(req.Id, depth + 1);
                    }
                }

                AddChildren(null, 0);

                foreach (var req in OrderRequirements(requirements.Where(r => !displayed.Contains(r.Id))))
                    AddRequirementGridRow(req, 0, byId);
            }
            else
            {
                foreach (var req in OrderRequirements(requirements))
                    AddRequirementGridRow(req, 0, byId);
            }

            if (previousCode is not null)
            {
                foreach (DataGridViewRow row in reqGrid.Rows)
                {
                    if (row.Tag is Requirement r && r.Code == previousCode)
                    {
                        row.Selected = true;
                        reqGrid.CurrentCell = row.Cells[0];
                        break;
                    }
                }
            }
        }
        finally
        {
            reqGrid.ResumeLayout();
        }
    }

    private void AddRequirementGridRow(Requirement req, int depth, IReadOnlyDictionary<Guid, Requirement> byId)
    {
        var indent = depth > 0 ? new string(' ', depth * 3) + "↳ " : string.Empty;
        var parentCode = req.ParentId is { } parentId && byId.TryGetValue(parentId, out var parent)
            ? parent.Code
            : string.Empty;

        var rowIndex = reqGrid.Rows.Add(
            indent + req.Code,
            req.Category,
            req.Title,
            req.Description,
            Loc.Enum(req.Priority),
            Loc.Enum(req.Status),
            Loc.Enum(req.AggregateStatus),
            req.Source,
            parentCode);
        reqGrid.Rows[rowIndex].Tag = req;
    }

    private static Color StatusForeColor(TestRunStatus status) => status switch
    {
        TestRunStatus.Pass => Color.DarkGreen,
        TestRunStatus.Fail => Color.Firebrick,
        TestRunStatus.Blocked => Color.DarkOrange,
        _ => ModernTheme.TextPrimary
    };

    private void RefreshDetailAndGrid()
    {
        var req = SelectedRequirement;
        LoadDetailPanel(req);

        if (req is null)
        {
            testCaseGrid.Rows.Clear();
            EnsureTestCaseGridColumns();
            return;
        }

        PopulateTestCaseGrid(req);
    }

    private void EnsureTestCaseGridColumns()
    {
        if (testCaseGrid.Columns.Count > 0)
            return;

        testCaseGrid.Columns.Add("Code", Loc.T("Col_Code"));
        testCaseGrid.Columns.Add("Title", Loc.T("Col_Title"));
        testCaseGrid.Columns.Add("Steps", Loc.T("Col_Steps"));
        testCaseGrid.Columns.Add("ExpectedResult", Loc.T("Col_ExpectedResult"));
        testCaseGrid.Columns.Add("Status", Loc.T("Col_LatestStatus"));
        testCaseGrid.Columns.Add("LastRun", Loc.T("Col_LastRun"));
        testCaseGrid.Columns.Add("LastRunBy", Loc.T("Col_LastRunBy"));
        ApplyGridHeaderStyle(testCaseGrid);
        UpdateTestCaseGridHeaders();
    }

    private void PopulateTestCaseGrid(Requirement req)
    {
        testCaseGrid.Rows.Clear();
        EnsureTestCaseGridColumns();

        foreach (var tc in req.TestCases)
        {
            var rowIndex = testCaseGrid.Rows.Add(
                tc.Code, tc.Title, tc.Steps.Count, tc.ExpectedResult,
                Loc.Enum(tc.LatestStatus),
                tc.LatestRun?.ExecutedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm") ?? "-",
                tc.LatestRun?.ExecutedBy ?? "-");
            var row = testCaseGrid.Rows[rowIndex];
            row.Tag = tc;
            ApplyStatusRowStyle(row, tc.LatestStatus);
        }
    }

    private static void ApplyStatusRowStyle(DataGridViewRow row, TestRunStatus status)
    {
        var foreColor = StatusForeColor(status);
        row.DefaultCellStyle.ForeColor = foreColor;
        row.DefaultCellStyle.SelectionBackColor = ModernTheme.SelectionBack;
        row.DefaultCellStyle.SelectionForeColor = foreColor;
        foreach (DataGridViewCell cell in row.Cells)
        {
            cell.Style.ForeColor = foreColor;
            cell.Style.SelectionBackColor = ModernTheme.SelectionBack;
            cell.Style.SelectionForeColor = foreColor;
        }
    }

    private void RefreshStatusBar()
    {
        var project = _requirementService.Project;
        statusFileLabel.ImageAlign = ContentAlignment.MiddleLeft;
        statusFileLabel.Text = _currentFilePath ?? Loc.T("Status_UnsavedProject");
        if (_requirementService.IsDirty)
            statusFileLabel.Text += Loc.T("Status_DirtyMarker");
        statusCountLabel.Text = Loc.T("Status_Requirements", project.Requirements.Count);
        statusCoverageLabel.Text = Loc.T("Status_Coverage", TraceabilityCalculator.CoveragePercent(project));
        statusPassRateLabel.Text = Loc.T("Status_PassRate", TraceabilityCalculator.PassRatePercent(project));
    }
}

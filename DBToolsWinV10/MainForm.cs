using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.App;
using DBToolsWinV10.Controls;
using DBToolsWinV10.Dialogs;
using DBToolsWinV10.Export;
using DBToolsWinV10.Import;
using DBToolsWinV10.Models;
using DBToolsWinV10.Serialization;

namespace DBToolsWinV10;

public class MainForm : Form
{
	private const string FileFilter = "DB 프로젝트 파일 (*.mdprj)|*.mdprj|모든 파일 (*.*)|*.*";

	private string _currentFilePath;

	private bool _isDirty;

	private bool _rightPanelVisible = true;

	private const int RightPanelWidth = 300;

	private ToolStripLabel lblTsZoom = null;

	private IContainer components = null;

	private ToolTip toolTip1;

	private MenuStrip menuStrip;

	private ToolStripMenuItem menuFile;

	private ToolStripMenuItem menuNew;

	private ToolStripMenuItem menuOpen;

	private ToolStripMenuItem menuOpenDatabase;

	private ToolStripSeparator sepFile1;

	private ToolStripMenuItem menuSave;

	private ToolStripMenuItem menuSaveAs;

	private ToolStripSeparator sepFile2;

	private ToolStripMenuItem menuRecent;

	private ToolStripSeparator sepFile3;

	private ToolStripMenuItem menuExport;

	private ToolStripMenuItem menuExportSql;

	private ToolStripMenuItem menuExportJson;

	private ToolStripSeparator sepFile4;

	private ToolStripMenuItem menuExit;

	private ToolStripMenuItem menuEdit;

	private ToolStripMenuItem menuAddTable;

	private ToolStripMenuItem menuAddColumn;

	private ToolStripMenuItem menuAddRel;

	private ToolStripSeparator sepEdit1;

	private ToolStripMenuItem menuEditSel;

	private ToolStripMenuItem menuDeleteSel;

	private ToolStripMenuItem menuView;

	private ToolStripMenuItem menuZoomIn;

	private ToolStripMenuItem menuZoomOut;

	private ToolStripMenuItem menuFitAll;

	private ToolStripSeparator sepView1;

	private ToolStripSeparator sepView2;

	private ToolStripMenuItem menuToggleRightPanel;

	private ToolStripMenuItem menuDbType;

	private ToolStripMenuItem menuDbPostgres;

	private ToolStripMenuItem menuDbMySQL;

	private ToolStripMenuItem menuDbMariaDB;

	private ToolStripMenuItem menuDbSQLite;

	private ToolStripMenuItem menuDbSqlServer;

	private ToolStripMenuItem menuAnalyzeTop;

	private ToolStripMenuItem menuAnalyze;

	private ToolStripMenuItem menuWriteReport;

	private ToolStripSeparator sepAnalyze1;

	private ToolStripMenuItem menuAbout;

	private ToolStrip toolStrip;

	private ToolStripButton btnTsNew;

	private ToolStripButton btnTsOpen;

	private ToolStripButton btnTsOpenDatabase;

	private ToolStripButton btnTsSave;

	private ToolStripButton btnTsSaveAs;

	private ToolStripSeparator tsSep1;

	private ToolStripButton btnTsAddTable;

	private ToolStripButton btnTsAddRel;

	private ToolStripSeparator tsSep2;

	private ToolStripButton btnTsZoomIn;

	private ToolStripButton btnTsZoomOut;

	private ToolStripButton btnTsFitAll;

	private ToolStripSeparator tsSep3;

	private ToolStripButton btnTsToggleRight;

	private ToolStripButton btnTsAnalyze;

	private ToolStripButton btnTsWriteReport;

	private ToolStripSeparator tsSep4;

	private ToolStripDropDownButton tsDbType;

	private ToolStripMenuItem tsDbPostgres;

	private ToolStripMenuItem tsDbMySQL;

	private ToolStripMenuItem tsDbMariaDB;

	private ToolStripMenuItem tsDbSQLite;

	private ToolStripMenuItem tsDbSqlServer;

	private ToolStripButton btnTsAbout;

	private Panel panelContent;

	private Panel panelToolBox;

	private Panel panelCanvasHost;

	private TableLayoutPanel tlpCanvasChrome;

	private Panel panelRulerCorner;

	private CanvasRuler rulerHorizontal;

	private CanvasRuler rulerVertical;

	private Panel panelCanvasInner;

	private Panel panelCanvasArea;

	private Panel panelToggleStrip;

	private Button btnCanvasToggleRight;

	private Panel panelRight;

	private SplitContainer splitRightPanel;

	private ToolboxGroupBox grpTools;

	private ToolboxGroupBox grpRelation;

	private ToolboxGroupBox grpView;

	private Button btnToolSelect;

	private Button btnToolAddTable;

	private Button btnToolRel11;

	private Button btnToolRel1N;

	private Button btnToolRelNM;

	private Button btnZoomIn;

	private Button btnZoomOut;

	private Button btnFitAll;

	private DiagramCanvas diagramCanvas;

	private TabControl tabControlRight;

	private TabPage tabTreeView;

	private TabPage tabAnalysis;

	private TreeView treeViewSchema;

	private ListView listViewAnalysis;

	private BufferedPropertyGrid propertyGrid = null!;

	private SplitContainer splitPropertyDetail;

	private TextBox txtPropertyDescription;

	private StatusStrip statusStrip;

	private ToolStripStatusLabel statusLabel;

	public MainForm(string initialFile = null)
	{
		UiThread.EnsureSta();
		InitializeComponent();
		if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
		{
			ConfigureToolStripZoomLabel();
			ApplyModernTheme();
			ApplyIcons();
			WireEvents();
			diagramCanvas.ViewportChanged += delegate
			{
				UpdateViewportUi();
			};
			NewSchema();
			if (initialFile != null && File.Exists(initialFile))
			{
				LoadFile(initialFile);
			}
		}
	}

	protected override void OnLoad(EventArgs e)
	{
		base.OnLoad(e);
		SetRightPanelVisible(visible: true);
		UpdateViewportUi();
		BeginInvoke(() =>
		{
			ApplyRightPanelSplitterLayout();
			ApplyPropertyDetailSplitterLayout();
		});
	}

	private void ApplyPropertyDetailSplitterLayout()
	{
		if (splitPropertyDetail.Height <= 0)
			return;

		const int defaultDescriptionHeight = 72;
		int distance = splitPropertyDetail.Height - defaultDescriptionHeight - splitPropertyDetail.SplitterWidth;
		int maxDistance = splitPropertyDetail.Height - splitPropertyDetail.Panel2MinSize - splitPropertyDetail.SplitterWidth;
		splitPropertyDetail.SplitterDistance = Math.Clamp(distance, splitPropertyDetail.Panel1MinSize, Math.Max(splitPropertyDetail.Panel1MinSize, maxDistance));
	}

	private void ApplyRightPanelSplitterLayout()
	{
		if (splitRightPanel.Height <= 0)
			return;

		const int defaultPropertyHeight = 240;
		int distance = splitRightPanel.Height - defaultPropertyHeight - splitRightPanel.SplitterWidth;
		int maxDistance = splitRightPanel.Height - splitRightPanel.Panel2MinSize - splitRightPanel.SplitterWidth;
		splitRightPanel.SplitterDistance = Math.Clamp(distance, splitRightPanel.Panel1MinSize, Math.Max(splitRightPanel.Panel1MinSize, maxDistance));
	}

	private void SetRightPanelVisible(bool visible, bool syncUiOnly = false)
	{
		_rightPanelVisible = visible;
		if (!syncUiOnly)
		{
			panelRight.Visible = visible;
			if (visible)
			{
				panelRight.Width = 300;
			}
		}
		UpdateRightPanelToggleUi();
	}

	private void UpdateRightPanelToggleUi()
	{
		menuToggleRightPanel.Checked = _rightPanelVisible;
		menuToggleRightPanel.Image = IconProvider.Get(_rightPanelVisible ? "PanelCollapse" : "PanelExpand");
		btnTsToggleRight.DisplayStyle = ToolStripItemDisplayStyle.Image;
		btnTsToggleRight.Text = string.Empty;
		btnTsToggleRight.Image = IconProvider.Get(_rightPanelVisible ? "PanelCollapse" : "PanelExpand", 22);
		btnTsToggleRight.ToolTipText = (_rightPanelVisible ? "우측 패널 접기" : "우측 패널 펼치기");
		btnCanvasToggleRight.Text = (_rightPanelVisible ? "▶" : "◀");
	}

	private void ToggleRightPanel()
	{
		SetRightPanelVisible(!_rightPanelVisible);
	}

	private void UpdateViewportUi()
	{
		lblTsZoom.Text = $"{diagramCanvas.Zoom:P0}";
		Point scrollPosition = diagramCanvas.ScrollPosition;
		rulerHorizontal.Zoom = diagramCanvas.Zoom;
		rulerHorizontal.ScrollOffset = scrollPosition.X;
		rulerVertical.Zoom = diagramCanvas.Zoom;
		rulerVertical.ScrollOffset = scrollPosition.Y;
		rulerHorizontal.Invalidate();
		rulerVertical.Invalidate();
	}

	private void ApplyModernTheme()
	{
		Font = ModernTheme.UiFont;
		BackColor = ModernTheme.AppBackground;
		ModernTheme.StyleMenuStrip(menuStrip);
		ModernTheme.StyleToolStrip(toolStrip);
		ModernTheme.StyleStatusStrip(statusStrip);
		statusLabel.ForeColor = ModernTheme.TextSecondary;
		panelToolBox.BackColor = ModernTheme.SidebarBackground;
		ModernTheme.StyleToolboxGroupBox(grpTools);
		ModernTheme.StyleToolboxGroupBox(grpRelation);
		ModernTheme.StyleToolboxGroupBox(grpView);
		ConfigureToolboxButton(btnToolSelect, "Select", "선택");
		ConfigureToolboxButton(btnToolAddTable, "AddTable", "테이블");
		ConfigureToolboxButton(btnToolRel11, "Rel11", "1:1");
		ConfigureToolboxButton(btnToolRel1N, "Rel1N", "1:N");
		ConfigureToolboxButton(btnToolRelNM, "RelNM", "N:M");
		ConfigureToolboxButton(btnZoomIn, "ZoomIn", "확대");
		ConfigureToolboxButton(btnZoomOut, "ZoomOut", "축소");
		ConfigureToolboxButton(btnFitAll, "FitAll", "맞춤");
		ModernTheme.StyleTabControl(tabControlRight);
		ModernTheme.StyleDataTree(treeViewSchema);
		ModernTheme.StyleDataList(listViewAnalysis);
		ModernTheme.StylePropertyGrid(propertyGrid);
		ModernTheme.StylePropertyDescription(txtPropertyDescription);
		ModernTheme.StyleSplitContainer(splitRightPanel, ModernTheme.PanelBackground, ModernTheme.PanelBackground);
		ModernTheme.StyleSplitContainer(splitPropertyDetail, ModernTheme.PanelBackground, ModernTheme.SidebarBackground);
		panelContent.BackColor = ModernTheme.AppBackground;
		panelCanvasHost.BackColor = ModernTheme.CanvasChrome;
		panelCanvasInner.BackColor = ModernTheme.CanvasBackground;
		panelRulerCorner.BackColor = ModernTheme.ToolHover;
		ModernTheme.StyleCanvasToggleButton(btnCanvasToggleRight);
		panelToggleStrip.BackColor = ModernTheme.CanvasChrome;
		panelRight.BackColor = ModernTheme.PanelBackground;
		diagramCanvas.BackColor = ModernTheme.CanvasBackground;
		btnTsAbout.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
		btnTsAbout.Text = "정보";
		UpdateToolButtonStates();
	}

	private void ConfigureToolStripZoomLabel()
	{
		lblTsZoom = new ToolStripLabel
		{
			Margin = new Padding(6, 0, 2, 0),
			Name = "lblTsZoom",
			Size = new Size(38, 25),
			Text = "100%",
			ForeColor = ModernTheme.TextSecondary,
			Font = ModernTheme.UiFontSmall
		};
		int num = toolStrip.Items.IndexOf(btnTsZoomOut);
		toolStrip.Items.Insert(num + 1, lblTsZoom);
	}

	private static void ConfigureToolboxButton(Button button, string iconName, string caption)
	{
		button.Image = IconProvider.Get(iconName, 20);
		button.Text = caption;
		button.ImageAlign = ContentAlignment.TopCenter;
		button.TextAlign = ContentAlignment.BottomCenter;
		button.TextImageRelation = TextImageRelation.ImageAboveText;
		button.Padding = new Padding(0, 2, 0, 2);
		ModernTheme.StyleToolboxButton(button);
	}

	private void ApplyIcons()
	{
		btnTsNew.Image = IconProvider.Get("New", 22);
		btnTsOpen.Image = IconProvider.Get("Open", 22);
		btnTsOpenDatabase.Image = IconProvider.Get("OpenDbFile", 22);
		btnTsSave.Image = IconProvider.Get("Save", 22);
		btnTsSaveAs.Image = IconProvider.Get("SaveAs", 22);
		btnTsAddTable.Image = IconProvider.Get("AddTable", 22);
		btnTsAddRel.Image = IconProvider.Get("AddRelation", 22);
		btnTsZoomIn.Image = IconProvider.Get("ZoomIn", 22);
		btnTsZoomOut.Image = IconProvider.Get("ZoomOut", 22);
		btnTsFitAll.Image = IconProvider.Get("FitAll", 22);
		UpdateRightPanelToggleUi();
		btnTsAnalyze.Image = IconProvider.Get("Analyze", 22);
		btnTsWriteReport.Image = IconProvider.Get("Report", 22);
		tsDbType.Image = IconProvider.Get("SQLite", 22);
		btnTsAbout.Image = IconProvider.Get("About", 22);
		tsDbPostgres.Image = IconProvider.Get("PostgreSQL");
		tsDbMySQL.Image = IconProvider.Get("MySQL");
		tsDbMariaDB.Image = IconProvider.Get("MariaDB");
		tsDbSQLite.Image = IconProvider.Get("SQLite");
		tsDbSqlServer.Image = IconProvider.Get("SqlServer");
		menuNew.Image = IconProvider.Get("New");
		menuOpen.Image = IconProvider.Get("Open");
		menuOpenDatabase.Image = IconProvider.Get("OpenDbFile");
		menuSave.Image = IconProvider.Get("Save");
		menuSaveAs.Image = IconProvider.Get("SaveAs");
		menuRecent.Image = IconProvider.Get("Recent");
		menuExport.Image = IconProvider.Get("Export");
		menuExportSql.Image = IconProvider.Get("ExportSql");
		menuExportJson.Image = IconProvider.Get("Export");
		menuExit.Image = IconProvider.Get("Exit");
		menuAddTable.Image = IconProvider.Get("AddTable");
		menuAddColumn.Image = IconProvider.Get("AddColumn");
		menuAddRel.Image = IconProvider.Get("AddRelation");
		menuEditSel.Image = IconProvider.Get("Edit");
		menuDeleteSel.Image = IconProvider.Get("Delete");
		menuZoomIn.Image = IconProvider.Get("ZoomIn");
		menuZoomOut.Image = IconProvider.Get("ZoomOut");
		menuFitAll.Image = IconProvider.Get("FitAll");
		menuToggleRightPanel.Image = IconProvider.Get("PanelCollapse");
		menuDbType.Image = IconProvider.Get("SQLite");
		menuDbPostgres.Image = IconProvider.Get("PostgreSQL");
		menuDbMySQL.Image = IconProvider.Get("MySQL");
		menuDbMariaDB.Image = IconProvider.Get("MariaDB");
		menuDbSQLite.Image = IconProvider.Get("SQLite");
		menuDbSqlServer.Image = IconProvider.Get("SqlServer");
		menuAnalyze.Image = IconProvider.Get("Analyze");
		menuWriteReport.Image = IconProvider.Get("Report");
		menuAbout.Image = IconProvider.Get("About");
		btnToolSelect.Image = IconProvider.Get("Select", 24);
		btnToolSelect.Text = "";
		btnToolSelect.ImageAlign = ContentAlignment.MiddleCenter;
		btnToolAddTable.Image = IconProvider.Get("AddTable", 24);
		btnToolAddTable.Text = "";
		btnToolAddTable.ImageAlign = ContentAlignment.MiddleCenter;
		btnToolRel11.Image = IconProvider.Get("Rel11", 24);
		btnToolRel11.Text = "";
		btnToolRel11.ImageAlign = ContentAlignment.MiddleCenter;
		btnToolRel1N.Image = IconProvider.Get("Rel1N", 24);
		btnToolRel1N.Text = "";
		btnToolRel1N.ImageAlign = ContentAlignment.MiddleCenter;
		btnToolRelNM.Image = IconProvider.Get("RelNM", 24);
		btnToolRelNM.Text = "";
		btnToolRelNM.ImageAlign = ContentAlignment.MiddleCenter;
		btnZoomIn.Image = IconProvider.Get("ZoomIn", 24);
		btnZoomIn.Text = "";
		btnZoomIn.ImageAlign = ContentAlignment.MiddleCenter;
		btnZoomOut.Image = IconProvider.Get("ZoomOut", 24);
		btnZoomOut.Text = "";
		btnZoomOut.ImageAlign = ContentAlignment.MiddleCenter;
		btnFitAll.Image = IconProvider.Get("FitAll", 24);
		btnFitAll.Text = "";
		btnFitAll.ImageAlign = ContentAlignment.MiddleCenter;
		try
		{
			string text = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
			if (File.Exists(text))
			{
				base.Icon = new Icon(text);
			}
		}
		catch
		{
		}
	}

	private void WireEvents()
	{
		diagramCanvas.SchemaChanged += delegate
		{
			_isDirty = true;
			RefreshTreeView();
			RefreshStatus();
		};
		diagramCanvas.SelectionChanged += delegate
		{
			RefreshPropertyGrid();
		};
		diagramCanvas.TableEditRequested += delegate(object sender, EventArgs _)
		{
			if (sender is DbTable table)
			{
				EditTable(table);
			}
		};
		diagramCanvas.RelationEditRequested += delegate(object sender, EventArgs _)
		{
			if (sender is DbRelationship rel)
			{
				EditRelationship(rel);
			}
		};
		diagramCanvas.ColumnEditRequested += delegate(object _, ColumnEventArgs e)
		{
			EditColumn(e.Table, e.Column);
		};
		diagramCanvas.ColumnAddRequested += delegate(object sender, EventArgs _)
		{
			if (sender is DbTable table)
			{
				AddColumnToTable(table);
			}
		};
		diagramCanvas.ColumnDeleteRequested += delegate(object _, ColumnEventArgs e)
		{
			DeleteColumn(e.Table, e.Column);
		};
		SetupPropertyGridContextMenu();
		btnToolSelect.Click += delegate
		{
			SetTool(ToolMode.Select);
		};
		btnToolAddTable.Click += delegate
		{
			SetTool(ToolMode.AddTable);
		};
		btnToolRel11.Click += delegate
		{
			SetTool(ToolMode.RelationOneToOne);
		};
		btnToolRel1N.Click += delegate
		{
			SetTool(ToolMode.RelationOneToMany);
		};
		btnToolRelNM.Click += delegate
		{
			SetTool(ToolMode.RelationManyToMany);
		};
		btnFitAll.Click += delegate
		{
			diagramCanvas.FitAll();
		};
		btnZoomIn.Click += delegate
		{
			diagramCanvas.ZoomIn();
		};
		btnZoomOut.Click += delegate
		{
			diagramCanvas.ZoomOut();
		};
		btnTsNew.Click += delegate
		{
			NewSchema();
		};
		btnTsOpen.Click += delegate
		{
			OpenSchema();
		};
		btnTsOpenDatabase.Click += delegate
		{
			OpenDatabaseFile();
		};
		btnTsSave.Click += delegate
		{
			SaveSchema();
		};
		btnTsSaveAs.Click += delegate
		{
			SaveSchemaAs();
		};
		btnTsAddTable.Click += delegate
		{
			AddNewTable();
		};
		btnTsAddRel.Click += delegate
		{
			AddNewRelationship();
		};
		btnTsZoomIn.Click += delegate
		{
			diagramCanvas.ZoomIn();
		};
		btnTsZoomOut.Click += delegate
		{
			diagramCanvas.ZoomOut();
		};
		btnTsFitAll.Click += delegate
		{
			diagramCanvas.FitAll();
		};
		btnTsToggleRight.Click += delegate
		{
			ToggleRightPanel();
		};
		btnCanvasToggleRight.Click += delegate
		{
			ToggleRightPanel();
		};
		btnTsAnalyze.Click += delegate
		{
			RunNormalizationCheck();
		};
		btnTsWriteReport.Click += delegate
		{
			WriteReport();
		};
		btnTsAbout.Click += delegate
		{
			ShowAbout();
		};
		tsDbPostgres.Click += delegate
		{
			SetDbType(DbTargetType.PostgreSQL);
		};
		tsDbMySQL.Click += delegate
		{
			SetDbType(DbTargetType.MySQL);
		};
		tsDbMariaDB.Click += delegate
		{
			SetDbType(DbTargetType.MariaDB);
		};
		tsDbSQLite.Click += delegate
		{
			SetDbType(DbTargetType.SQLite);
		};
		tsDbSqlServer.Click += delegate
		{
			SetDbType(DbTargetType.SqlServer);
		};
		treeViewSchema.AfterSelect += TreeView_AfterSelect;
		treeViewSchema.NodeMouseDoubleClick += TreeView_DoubleClick;
		menuNew.Click += delegate
		{
			NewSchema();
		};
		menuOpen.Click += delegate
		{
			OpenSchema();
		};
		menuOpenDatabase.Click += delegate
		{
			OpenDatabaseFile();
		};
		menuSave.Click += delegate
		{
			SaveSchema();
		};
		menuSaveAs.Click += delegate
		{
			SaveSchemaAs();
		};
		menuExportSql.Click += delegate
		{
			ExportSql();
		};
		menuExportJson.Click += delegate
		{
			ExportJson();
		};
		menuExit.Click += delegate
		{
			Close();
		};
		menuRecent.DropDownOpening += delegate
		{
			RebuildRecentMenu();
		};
		menuAddTable.Click += delegate
		{
			AddNewTable();
		};
		menuAddColumn.Click += delegate
		{
			AddColumnToSelected();
		};
		menuAddRel.Click += delegate
		{
			AddNewRelationship();
		};
		menuDeleteSel.Click += delegate
		{
			diagramCanvas.DeleteSelected();
		};
		menuEditSel.Click += delegate
		{
			EditSelected();
		};
		menuZoomIn.Click += delegate
		{
			diagramCanvas.ZoomIn();
		};
		menuZoomOut.Click += delegate
		{
			diagramCanvas.ZoomOut();
		};
		menuFitAll.Click += delegate
		{
			diagramCanvas.FitAll();
		};
		menuToggleRightPanel.Click += delegate
		{
			SetRightPanelVisible(menuToggleRightPanel.Checked);
		};
		menuDbPostgres.Click += delegate
		{
			SetDbType(DbTargetType.PostgreSQL);
		};
		menuDbMySQL.Click += delegate
		{
			SetDbType(DbTargetType.MySQL);
		};
		menuDbMariaDB.Click += delegate
		{
			SetDbType(DbTargetType.MariaDB);
		};
		menuDbSQLite.Click += delegate
		{
			SetDbType(DbTargetType.SQLite);
		};
		menuDbSqlServer.Click += delegate
		{
			SetDbType(DbTargetType.SqlServer);
		};
		menuAnalyze.Click += delegate
		{
			RunNormalizationCheck();
		};
		menuWriteReport.Click += delegate
		{
			WriteReport();
		};
		menuAbout.Click += delegate
		{
			ShowAbout();
		};
		propertyGrid.PropertyValueChanged += PropertyGrid_PropertyValueChanged;
		propertyGrid.PropertySortChanged += PropertyGrid_PropertySortChanged;
		propertyGrid.SelectedGridItemChanged += PropertyGrid_SelectedGridItemChanged;
		splitRightPanel.SplitterMoving += SplitPanel_SplitterMoving;
		splitRightPanel.SplitterMoved += SplitPanel_SplitterMoved;
		splitPropertyDetail.SplitterMoving += SplitPanel_SplitterMoving;
		splitPropertyDetail.SplitterMoved += SplitPanel_SplitterMoved;
		base.FormClosing += MainForm_FormClosing;
		base.KeyPreview = true;
		base.KeyDown += MainForm_KeyDown;
	}

	private void NewSchema()
	{
		if (ConfirmDiscard())
		{
			diagramCanvas.LoadSchema(new DbSchema());
			_currentFilePath = null;
			_isDirty = false;
			RefreshAll();
			UpdateDbTypeIndicator(diagramCanvas.Schema.TargetDb);
			statusLabel.Text = "새 프로젝트가 생성되었습니다.";
		}
	}

	private void OpenSchema()
	{
		if (!ConfirmDiscard())
		{
			return;
		}
		using OpenFileDialog openFileDialog = new OpenFileDialog
		{
			Filter = "DB 프로젝트 파일 (*.mdprj)|*.mdprj|모든 파일 (*.*)|*.*",
			Title = "프로젝트 불러오기"
		};
		string text = AppSettings.ResolveInitialOpenDirectory();
		if (text != null)
		{
			openFileDialog.InitialDirectory = text;
		}
		if (openFileDialog.ShowDialog(this) == DialogResult.OK)
		{
			RememberOpenDirectory(openFileDialog.FileName);
			LoadFile(openFileDialog.FileName);
		}
	}

	private void OpenDatabaseFile()
	{
		if (!ConfirmDiscard())
		{
			return;
		}
		using OpenFileDialog openFileDialog = new OpenFileDialog
		{
			Filter = "지원 DB 파일|*.db;*.sqlite;*.sqlite3;*.db3;*.sql;*.mdf;*.mdb;*.accdb|SQLite (*.db;*.sqlite;*.sqlite3)|*.db;*.sqlite;*.sqlite3;*.db3|SQL DDL (*.sql)|*.sql|SQL Server (*.mdf)|*.mdf|Access (*.mdb;*.accdb)|*.mdb;*.accdb|모든 파일 (*.*)|*.*",
			Title = "DB 파일 열기"
		};
		string text = AppSettings.ResolveInitialDatabaseFileOpenDirectory();
		if (text != null)
		{
			openFileDialog.InitialDirectory = text;
		}
		if (openFileDialog.ShowDialog(this) == DialogResult.OK)
		{
			RememberDatabaseFileOpenDirectory(openFileDialog.FileName);
			LoadDatabaseFile(openFileDialog.FileName);
		}
	}

	private static void RememberDatabaseFileOpenDirectory(string filePath)
	{
		string directoryName = Path.GetDirectoryName(filePath);
		if (directoryName != null)
		{
			AppSettings.SetLastDatabaseFileOpenDirectory(directoryName);
		}
	}

	private void LoadDatabaseFile(string path)
	{
		try
		{
			DbFileFormat dbFileFormat = DbFileFormatDetector.Detect(path);
			if (dbFileFormat == DbFileFormat.Unknown)
			{
				ErrorDialog.Show(this, "지원하지 않는 형식", "지원하지 않는 DB 파일 형식입니다.\n\n지원 형식: SQLite(.db), SQL DDL(.sql), SQL Server(.mdf), Access(.mdb/.accdb)");
				return;
			}
			DbSchema dbSchema = DatabaseFileImporter.Import(path);
			diagramCanvas.LoadSchema(dbSchema);
			_currentFilePath = null;
			_isDirty = true;
			UpdateDbTypeIndicator(dbSchema.TargetDb);
			RefreshAll();
			diagramCanvas.FitAll();
			UpdateViewportUi();
			string displayName = DbFileFormatDetector.GetDisplayName(dbFileFormat);
			statusLabel.Text = $"{displayName} 가져오기 완료: {Path.GetFileName(path)}  (테이블 {dbSchema.Tables.Count}개, 관계 {dbSchema.Relationships.Count}개)";
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "DB 파일 열기 오류", ex, "데이터베이스 구조를 읽을 수 없습니다.\n" + path);
		}
	}

	private static void RememberOpenDirectory(string filePath)
	{
		string directoryName = Path.GetDirectoryName(filePath);
		if (directoryName != null)
		{
			AppSettings.SetLastOpenDirectory(directoryName);
		}
	}

	private void LoadFile(string path)
	{
		try
		{
			DbSchema dbSchema = SchemaSerializer.Load(path);
			diagramCanvas.LoadSchema(dbSchema);
			_currentFilePath = path;
			_isDirty = false;
			RecentFilesManager.Push(path);
			RememberOpenDirectory(path);
			UpdateDbTypeIndicator(dbSchema.TargetDb);
			RefreshAll();
			statusLabel.Text = "불러오기 완료: " + Path.GetFileName(path);
		}
		catch (Exception ex)
		{
			RecentFilesManager.Remove(path);
			ErrorDialog.Show(this, "파일 열기 오류", ex, "파일을 열 수 없습니다.\n" + path);
		}
	}

	private void SaveSchema()
	{
		if (_currentFilePath == null)
		{
			SaveSchemaAs();
		}
		else
		{
			DoSave(_currentFilePath);
		}
	}

	private void SaveSchemaAs()
	{
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "DB 프로젝트 파일 (*.mdprj)|*.mdprj|모든 파일 (*.*)|*.*",
			Title = "다른 이름으로 저장",
			FileName = diagramCanvas.Schema.Name,
			DefaultExt = "mdprj"
		};
		if (saveFileDialog.ShowDialog(this) == DialogResult.OK)
		{
			DoSave(saveFileDialog.FileName);
			_currentFilePath = saveFileDialog.FileName;
		}
	}

	private void DoSave(string path)
	{
		try
		{
			SchemaSerializer.Save(diagramCanvas.Schema, path);
			_isDirty = false;
			RecentFilesManager.Push(path);
			UpdateTitle();
			statusLabel.Text = "저장 완료: " + Path.GetFileName(path);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "저장 오류", ex, "파일을 저장할 수 없습니다.\n" + path);
		}
	}

	private void ExportSql()
	{
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "SQL 파일 (*.sql)|*.sql|텍스트 파일 (*.txt)|*.txt",
			Title = "SQL DDL 내보내기",
			FileName = diagramCanvas.Schema.Name
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			string contents = SqlExporter.Export(diagramCanvas.Schema);
			File.WriteAllText(saveFileDialog.FileName, contents, Encoding.UTF8);
			statusLabel.Text = "SQL 내보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
			if (MessageBox.Show("SQL 파일을 메모장으로 열까요?", "내보내기 완료", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
			{
				Process.Start("notepad.exe", saveFileDialog.FileName);
			}
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "SQL보내기 오류", ex, "SQL 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportJson()
	{
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "JSON 파일 (*.json)|*.json",
			Title = "JSON 내보내기",
			FileName = diagramCanvas.Schema.Name
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			SchemaSerializer.Save(diagramCanvas.Schema, saveFileDialog.FileName);
			statusLabel.Text = "JSON 내보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "JSON보내기 오류", ex, "JSON 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void RebuildRecentMenu()
	{
		menuRecent.DropDownItems.Clear();
		List<string> list = RecentFilesManager.Load();
		if (list.Count == 0)
		{
			ToolStripMenuItem value = new ToolStripMenuItem("(최근 파일 없음)")
			{
				Enabled = false
			};
			menuRecent.DropDownItems.Add(value);
			return;
		}
		for (int i = 0; i < list.Count; i++)
		{
			string file = list[i];
			string text = $"&{i + 1}  {Path.GetFileName(file)}";
			ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem(text)
			{
				ToolTipText = file
			};
			toolStripMenuItem.Click += delegate
			{
				if (ConfirmDiscard())
				{
					LoadFile(file);
				}
			};
			menuRecent.DropDownItems.Add(toolStripMenuItem);
		}
		menuRecent.DropDownItems.Add(new ToolStripSeparator());
		ToolStripMenuItem toolStripMenuItem2 = new ToolStripMenuItem("목록 지우기");
		toolStripMenuItem2.Click += delegate
		{
			foreach (string item in RecentFilesManager.Load())
			{
				RecentFilesManager.Remove(item);
			}
		};
		menuRecent.DropDownItems.Add(toolStripMenuItem2);
	}

	private void AddNewTable()
	{
		DbTable table = new DbTable
		{
			Name = $"table_{diagramCanvas.Schema.Tables.Count + 1}",
			X = 100f,
			Y = 100f
		};
		using TableEditDialog tableEditDialog = new TableEditDialog(table, diagramCanvas.Schema.TargetDb);
		if (tableEditDialog.ShowDialog(this) == DialogResult.OK)
		{
			tableEditDialog.Result.X = 80 + diagramCanvas.Schema.Tables.Count * 30;
			tableEditDialog.Result.Y = 80 + diagramCanvas.Schema.Tables.Count * 20;
			diagramCanvas.Schema.Tables.Add(tableEditDialog.Result);
			diagramCanvas.Invalidate();
			_isDirty = true;
			RefreshAll();
		}
	}

	private void AddColumnToSelected()
	{
		AddColumnToTable(diagramCanvas.SelectedTable);
	}

	private void AddColumnToTable(DbTable table)
	{
		if (table == null)
		{
			MessageBox.Show("테이블을 먼저 선택하세요.", "안내");
			return;
		}
		DbColumn column = new DbColumn
		{
			Name = $"col_{table.Columns.Count + 1}",
			DataType = "VARCHAR",
			Length = 255
		};
		using ColumnEditDialog columnEditDialog = new ColumnEditDialog(column, diagramCanvas.Schema.TargetDb);
		if (columnEditDialog.ShowDialog(this) == DialogResult.OK)
		{
			table.Columns.Add(columnEditDialog.Result);
			_isDirty = true;
			RefreshAll();
		}
	}

	private void AddNewRelationship()
	{
		if (diagramCanvas.Schema.Tables.Count < 2)
		{
			MessageBox.Show("관계를 추가하려면 최소 2개의 테이블이 필요합니다.", "안내");
			return;
		}
		DbRelationship rel = new DbRelationship
		{
			SourceTableId = diagramCanvas.Schema.Tables[0].Id,
			TargetTableId = diagramCanvas.Schema.Tables[1].Id
		};
		using RelationshipDialog relationshipDialog = new RelationshipDialog(rel, diagramCanvas.Schema);
		if (relationshipDialog.ShowDialog(this) == DialogResult.OK)
		{
			diagramCanvas.Schema.Relationships.Add(relationshipDialog.Result);
			_isDirty = true;
			RefreshAll();
		}
	}

	private void EditSelected()
	{
		DbColumn selectedColumn = diagramCanvas.SelectedColumn;
		if (selectedColumn != null)
		{
			DbTable selectedTable = diagramCanvas.SelectedTable;
			if (selectedTable != null)
			{
				EditColumn(selectedTable, selectedColumn);
				return;
			}
		}
		if (diagramCanvas.SelectedTable != null)
		{
			EditTable(diagramCanvas.SelectedTable);
		}
		else if (diagramCanvas.SelectedRelationship != null)
		{
			EditRelationship(diagramCanvas.SelectedRelationship);
		}
		else
		{
			TryEditFromPropertyGrid();
		}
	}

	private void EditColumn(DbTable table, DbColumn column)
	{
		using ColumnEditDialog columnEditDialog = new ColumnEditDialog(column, diagramCanvas.Schema.TargetDb);
		if (columnEditDialog.ShowDialog(this) == DialogResult.OK)
		{
			int num = table.Columns.FindIndex((DbColumn c) => c.Id == column.Id);
			if (num >= 0)
			{
				table.Columns[num] = columnEditDialog.Result;
			}
			_isDirty = true;
			RefreshAll();
		}
	}

	private void DeleteColumn(DbTable table, DbColumn column)
	{
		if (MessageBox.Show("컬럼 '" + column.Name + "'을(를) 삭제하시겠습니까?", "컬럼 삭제", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
		{
			diagramCanvas.Schema.RemoveColumn(table.Id, column.Id);
			diagramCanvas.NotifyColumnRemoved(column);
			_isDirty = true;
			RefreshAll();
		}
	}

	private void SetupPropertyGridContextMenu()
	{
		ContextMenuStrip contextMenuStrip = new ContextMenuStrip();
		ModernTheme.StyleContextMenu(contextMenuStrip);
		ToolStripMenuItem miEditCol = ModernTheme.CreateMenuItem("컬럼 편집...", "Edit");
		ToolStripMenuItem miAddCol = ModernTheme.CreateMenuItem("컬럼 추가", "AddColumn");
		ToolStripMenuItem miDeleteCol = ModernTheme.CreateMenuItem("컬럼 삭제", "Delete");
		ToolStripSeparator toolStripSeparator = new ToolStripSeparator();
		ToolStripMenuItem miEditTable = ModernTheme.CreateMenuItem("테이블 편집...", "Edit");
		ToolStripMenuItem miDeleteTable = ModernTheme.CreateMenuItem("테이블 삭제", "Delete");
		miEditCol.Click += delegate
		{
			(DbTable, DbColumn)? columnContext = GetColumnContext();
			if (columnContext.HasValue)
			{
				(DbTable, DbColumn) valueOrDefault = columnContext.GetValueOrDefault();
				if (true)
				{
					EditColumn(valueOrDefault.Item1, valueOrDefault.Item2);
				}
			}
		};
		miAddCol.Click += delegate
		{
			AddColumnToTable(GetTableContext());
		};
		miDeleteCol.Click += delegate
		{
			(DbTable, DbColumn)? columnContext = GetColumnContext();
			if (columnContext.HasValue)
			{
				(DbTable, DbColumn) valueOrDefault = columnContext.GetValueOrDefault();
				if (true)
				{
					DeleteColumn(valueOrDefault.Item1, valueOrDefault.Item2);
				}
			}
		};
		miEditTable.Click += delegate
		{
			DbTable tableContext = GetTableContext();
			if (tableContext != null)
			{
				EditTable(tableContext);
			}
		};
		miDeleteTable.Click += delegate
		{
			DbTable t = GetTableContext();
			if (t != null && MessageBox.Show("테이블 '" + t.Name + "'을(를) 삭제하시겠습니까?", "테이블 삭제", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation) == DialogResult.Yes)
			{
				diagramCanvas.Schema.Tables.RemoveAll((DbTable tb) => tb.Id == t.Id);
				diagramCanvas.Schema.Relationships.RemoveAll((DbRelationship r) => r.SourceTableId == t.Id || r.TargetTableId == t.Id);
				diagramCanvas.ClearSelection();
				_isDirty = true;
				RefreshAll();
			}
		};
		contextMenuStrip.Items.AddRange(miEditCol, miAddCol, miDeleteCol, toolStripSeparator, miEditTable, miDeleteTable);
		contextMenuStrip.Opening += delegate
		{
			(DbTable, DbColumn)? columnContext = GetColumnContext();
			DbTable tableContext = GetTableContext();
			miEditCol.Enabled = columnContext.HasValue;
			miDeleteCol.Enabled = columnContext.HasValue;
			miAddCol.Enabled = tableContext != null;
			miEditTable.Enabled = tableContext != null;
			miDeleteTable.Enabled = tableContext != null;
		};
		propertyGrid.ContextMenuStrip = contextMenuStrip;
	}

	private DbTable GetTableContext()
	{
		DbTable selectedTable = diagramCanvas.SelectedTable;
		if (selectedTable != null)
		{
			return selectedTable;
		}
		if (propertyGrid.SelectedObject is DbTable result)
		{
			return result;
		}
		(DbTable, DbColumn)? columnContext = GetColumnContext();
		if (columnContext.HasValue)
		{
			(DbTable, DbColumn) valueOrDefault = columnContext.GetValueOrDefault();
			if (true)
			{
				return valueOrDefault.Item1;
			}
		}
		return null;
	}

	private (DbTable Table, DbColumn Column)? GetColumnContext()
	{
		DbColumn selectedColumn = diagramCanvas.SelectedColumn;
		if (selectedColumn != null)
		{
			DbTable selectedTable = diagramCanvas.SelectedTable;
			if (selectedTable != null)
			{
				return (selectedTable, selectedColumn);
			}
		}
		object selectedObject = propertyGrid.SelectedObject;
		DbColumn pgCol = selectedObject as DbColumn;
		if (pgCol != null)
		{
			DbTable dbTable = diagramCanvas.Schema.Tables.FirstOrDefault((DbTable t) => t.Columns.Any((DbColumn c) => c.Id == pgCol.Id));
			if (dbTable != null)
			{
				return (dbTable, pgCol);
			}
		}
		return null;
	}

	private void TryEditFromPropertyGrid()
	{
		(DbTable, DbColumn)? columnContext = GetColumnContext();
		if (columnContext.HasValue)
		{
			(DbTable, DbColumn) valueOrDefault = columnContext.GetValueOrDefault();
			if (true)
			{
				EditColumn(valueOrDefault.Item1, valueOrDefault.Item2);
				return;
			}
		}
		if (propertyGrid.SelectedObject is DbTable table)
		{
			EditTable(table);
		}
		else if (propertyGrid.SelectedObject is DbRelationship rel)
		{
			EditRelationship(rel);
		}
	}

	private void EditTable(DbTable table)
	{
		using TableEditDialog tableEditDialog = new TableEditDialog(table, diagramCanvas.Schema.TargetDb);
		if (tableEditDialog.ShowDialog(this) == DialogResult.OK)
		{
			table.Name = tableEditDialog.Result.Name;
			table.Comment = tableEditDialog.Result.Comment;
			table.Columns = tableEditDialog.Result.Columns;
			_isDirty = true;
			RefreshAll();
		}
	}

	private void EditRelationship(DbRelationship rel)
	{
		using RelationshipDialog relationshipDialog = new RelationshipDialog(rel, diagramCanvas.Schema);
		if (relationshipDialog.ShowDialog(this) == DialogResult.OK)
		{
			rel.Name = relationshipDialog.Result.Name;
			rel.Type = relationshipDialog.Result.Type;
			rel.SourceTableId = relationshipDialog.Result.SourceTableId;
			rel.SourceColumnId = relationshipDialog.Result.SourceColumnId;
			rel.TargetTableId = relationshipDialog.Result.TargetTableId;
			rel.TargetColumnId = relationshipDialog.Result.TargetColumnId;
			_isDirty = true;
			RefreshAll();
		}
	}

	private void SetDbType(DbTargetType db)
	{
		diagramCanvas.Schema.TargetDb = db;
		_isDirty = true;
		UpdateDbTypeIndicator(db);
		RefreshAll();
		statusLabel.Text = $"데이터베이스 종류: {db}";
	}

	private void UpdateDbTypeIndicator(DbTargetType db)
	{
		tsDbType.Text = db.ToString();
		tsDbType.Image = IconProvider.Get(db.ToString(), 22);
		menuDbType.Image = IconProvider.Get(db.ToString());
	}

	private void SetTool(ToolMode mode)
	{
		diagramCanvas.SetToolMode(mode);
		UpdateToolButtonStates();
		ToolStripStatusLabel toolStripStatusLabel = statusLabel;
		if (1 == 0)
		{
		}
		string text = mode switch
		{
			ToolMode.AddTable => "캔버스를 클릭하면 새 테이블이 추가됩니다.", 
			ToolMode.RelationOneToOne => "소스 테이블 → 타겟 테이블을 순서대로 클릭하세요. (1:1)", 
			ToolMode.RelationOneToMany => "소스 테이블 → 타겟 테이블을 순서대로 클릭하세요. (1:N)", 
			ToolMode.RelationManyToMany => "소스 테이블 → 타겟 테이블을 순서대로 클릭하세요. (N:M)", 
			_ => "준비", 
		};
		if (1 == 0)
		{
		}
		toolStripStatusLabel.Text = text;
	}

	private void ShowAbout()
	{
		using AboutDialog aboutDialog = new AboutDialog();
		aboutDialog.ShowDialog(this);
	}

	private void RunNormalizationCheck()
	{
		IReadOnlyList<NormalizationIssue> readOnlyList = NormalizationAnalyzer.Analyze(diagramCanvas.Schema);
		listViewAnalysis.Items.Clear();
		foreach (NormalizationIssue item in readOnlyList)
		{
			ListViewItem listViewItem = new ListViewItem(item.Level.ToString())
			{
				Tag = item
			};
			listViewItem.SubItems.Add(item.Table);
			listViewItem.SubItems.Add(item.Message);
			ListViewItem listViewItem2 = listViewItem;
			IssueSeverity severity = item.Severity;
			if (1 == 0)
			{
			}
			Color foreColor = severity switch
			{
				IssueSeverity.Error => ModernTheme.Danger, 
				IssueSeverity.Warning => ModernTheme.Warning, 
				_ => ModernTheme.Info, 
			};
			if (1 == 0)
			{
			}
			listViewItem2.ForeColor = foreColor;
			listViewAnalysis.Items.Add(listViewItem);
		}
		tabControlRight.SelectedTab = tabAnalysis;
		statusLabel.Text = ((readOnlyList.Count == 0) ? "정규화 검사 완료: 문제 없음" : $"정규화 검사 완료: {readOnlyList.Count}개 항목 발견");
	}

	private void WriteReport()
	{
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Markdown 보고서 (*.md)|*.md|텍스트 파일 (*.txt)|*.txt",
			Title = "보고서 저장",
			FileName = diagramCanvas.Schema.Name + "_report",
			DefaultExt = "md"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			string contents = SchemaReportWriter.Write(diagramCanvas.Schema, _currentFilePath);
			File.WriteAllText(saveFileDialog.FileName, contents, Encoding.UTF8);
			statusLabel.Text = "보고서 작성 완료: " + Path.GetFileName(saveFileDialog.FileName);
			if (MessageBox.Show("보고서 파일을 메모장으로 열까요?", "보고서 작성 완료", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
			{
				Process.Start("notepad.exe", saveFileDialog.FileName);
			}
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "보고서 작성 오류", ex, "보고서를 저장할 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void RefreshTreeView()
	{
		treeViewSchema.BeginUpdate();
		treeViewSchema.Nodes.Clear();
		DbSchema schema = diagramCanvas.Schema;
		TreeNode treeNode = new TreeNode($"\ud83d\udce6 {schema.Name}  [{schema.TargetDb}]")
		{
			Tag = schema
		};
		treeNode.NodeFont = new Font(treeViewSchema.Font, FontStyle.Bold);
		TreeNode treeNode2 = new TreeNode($"\ud83d\udccb 테이블 ({schema.Tables.Count})");
		foreach (DbTable table in schema.Tables)
		{
			TreeNode treeNode3 = new TreeNode("\ud83d\uddc2 " + table.Name)
			{
				Tag = table
			};
			foreach (DbColumn col in table.Columns)
			{
				string value = (col.IsPrimaryKey ? "\ud83d\udd11" : (schema.Relationships.Any((DbRelationship r) => r.SourceTableId == table.Id && r.SourceColumnId == col.Id) ? "\ud83d\udd17" : "·"));
				treeNode3.Nodes.Add(new TreeNode($"{value} {col.Name}  :  {col.GetTypeDisplay()}")
				{
					Tag = col
				});
			}
			treeNode2.Nodes.Add(treeNode3);
		}
		treeNode.Nodes.Add(treeNode2);
		TreeNode treeNode4 = new TreeNode($"\ud83d\udd17 관계 ({schema.Relationships.Count})");
		foreach (DbRelationship relationship in schema.Relationships)
		{
			DbTable dbTable = schema.FindTable(relationship.SourceTableId);
			DbTable dbTable2 = schema.FindTable(relationship.TargetTableId);
			RelationshipType type = relationship.Type;
			if (1 == 0)
			{
			}
			string text = type switch
			{
				RelationshipType.OneToOne => "1:1", 
				RelationshipType.OneToMany => "1:N", 
				RelationshipType.ManyToMany => "N:M", 
				_ => "?", 
			};
			if (1 == 0)
			{
			}
			string value2 = text;
			string text2 = (string.IsNullOrWhiteSpace(relationship.Name) ? $"{dbTable.Name ?? "?"} → {dbTable2.Name ?? "?"} ({value2})" : $"{relationship.Name}: {dbTable.Name ?? "?"} → {dbTable2.Name ?? "?"} ({value2})");
			treeNode4.Nodes.Add(new TreeNode(text2)
			{
				Tag = relationship
			});
		}
		treeNode.Nodes.Add(treeNode4);
		treeViewSchema.Nodes.Add(treeNode);
		treeNode.Expand();
		treeNode2.Expand();
		treeViewSchema.EndUpdate();
	}

	private void TreeView_AfterSelect(object sender, TreeViewEventArgs e)
	{
		object obj = e.Node.Tag;
		diagramCanvas.ClearSelection();
		PropertyGrid propertyGrid = this.propertyGrid;
		if (1 == 0)
		{
		}
		object selectedObject = ((obj is DbTable dbTable) ? dbTable : ((obj is DbColumn dbColumn) ? dbColumn : ((obj is DbRelationship dbRelationship) ? ((object)dbRelationship) : ((object)((!(obj is DbSchema dbSchema)) ? null : dbSchema)))));
		if (1 == 0)
		{
		}
		propertyGrid.SelectedObject = selectedObject;
	}

	private void TreeView_DoubleClick(object sender, TreeNodeMouseClickEventArgs e)
	{
		object obj = e.Node.Tag;
		if (obj is DbTable table)
		{
			EditTable(table);
			return;
		}
		if (obj is DbRelationship rel)
		{
			EditRelationship(rel);
			return;
		}
		DbColumn c = obj as DbColumn;
		if (c == null)
		{
			return;
		}
		DbTable dbTable = diagramCanvas.Schema.Tables.FirstOrDefault((DbTable tb) => tb.Columns.Any((DbColumn col) => col.Id == c.Id));
		if (dbTable != null)
		{
			EditColumn(dbTable, c);
		}
	}

	private void RefreshPropertyGrid()
	{
		object obj = diagramCanvas.SelectedColumn ?? ((object)diagramCanvas.SelectedRelationship) ?? ((object)diagramCanvas.SelectedTable);
		if (obj == null)
		{
			obj = diagramCanvas.Schema;
		}
		if (!ReferenceEquals(propertyGrid.SelectedObject, obj))
		{
			propertyGrid.SelectedObject = obj;
		}
		UpdatePropertyDescription(propertyGrid.SelectedGridItem);
	}

	private void PropertyGrid_SelectedGridItemChanged(object sender, SelectedGridItemChangedEventArgs e)
	{
		UpdatePropertyDescription(e.NewSelection);
	}

	private void UpdatePropertyDescription(GridItem item)
	{
		string text = item.PropertyDescriptor.Description ?? string.Empty;
		if (txtPropertyDescription.Text != text)
			txtPropertyDescription.Text = text;
	}

	private void SplitPanel_SplitterMoving(object sender, SplitterCancelEventArgs e)
	{
		splitPropertyDetail.SuspendLayout();
		propertyGrid.Visible = false;
		txtPropertyDescription.Visible = false;
	}

	private void SplitPanel_SplitterMoved(object sender, SplitterEventArgs e)
	{
		propertyGrid.Visible = true;
		txtPropertyDescription.Visible = true;
		splitPropertyDetail.ResumeLayout(performLayout: true);
	}

	private void PropertyGrid_PropertySortChanged(object sender, EventArgs e)
	{
		// 사전순 선택 시에도 카테고리 헤더·접기/펼치기가 유지되도록 한다.
		if (propertyGrid.PropertySort == PropertySort.Alphabetical)
			propertyGrid.PropertySort = PropertySort.CategorizedAlphabetical;
	}

	private void PropertyGrid_PropertyValueChanged(object s, PropertyValueChangedEventArgs e)
	{
		_isDirty = true;
		diagramCanvas.Invalidate();
		RefreshTreeView();
		UpdateTitle();
	}

	private void RefreshAll()
	{
		RefreshTreeView();
		RefreshPropertyGrid();
		RefreshStatus();
		UpdateTitle();
		UpdateViewportUi();
		diagramCanvas.Invalidate();
	}

	private void RefreshStatus()
	{
		DbSchema schema = diagramCanvas.Schema;
		statusLabel.Text = $"{schema.Name}  |  {schema.TargetDb}  |  테이블 {schema.Tables.Count}개  |  관계 {schema.Relationships.Count}개";
	}

	private void UpdateTitle()
	{
		string text = ((_currentFilePath != null) ? Path.GetFileName(_currentFilePath) : "새 프로젝트");
		Text = (_isDirty ? "● " : "") + text + " — DBTools v1.0";
	}

	private void UpdateToolButtonStates()
	{
		ToolMode currentTool = diagramCanvas.CurrentTool;
		ModernTheme.SetToolboxButtonActive(btnToolSelect, currentTool == ToolMode.Select);
		ModernTheme.SetToolboxButtonActive(btnToolAddTable, currentTool == ToolMode.AddTable);
		ModernTheme.SetToolboxButtonActive(btnToolRel11, currentTool == ToolMode.RelationOneToOne);
		ModernTheme.SetToolboxButtonActive(btnToolRel1N, currentTool == ToolMode.RelationOneToMany);
		ModernTheme.SetToolboxButtonActive(btnToolRelNM, currentTool == ToolMode.RelationManyToMany);
	}

	private bool ConfirmDiscard()
	{
		if (!_isDirty)
		{
			return true;
		}
		return MessageBox.Show("저장되지 않은 변경사항이 있습니다. 계속할까요?", "확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
	}

	private void MainForm_KeyDown(object sender, KeyEventArgs e)
	{
		if (e.Control)
		{
			switch (e.KeyCode)
			{
			case Keys.N:
				NewSchema();
				e.Handled = true;
				break;
			case Keys.O:
				if (e.Shift)
				{
					OpenDatabaseFile();
					e.Handled = true;
				}
				else
				{
					OpenSchema();
					e.Handled = true;
				}
				break;
			case Keys.S:
				if (e.Shift)
				{
					SaveSchemaAs();
					e.Handled = true;
				}
				else
				{
					SaveSchema();
					e.Handled = true;
				}
				break;
			case Keys.T:
				AddNewTable();
				e.Handled = true;
				break;
			case Keys.L:
				AddColumnToSelected();
				e.Handled = true;
				break;
			case Keys.R:
				if (e.Shift)
				{
					WriteReport();
					e.Handled = true;
				}
				else
				{
					AddNewRelationship();
					e.Handled = true;
				}
				break;
			case Keys.Oemplus:
				diagramCanvas.ZoomIn();
				e.Handled = true;
				break;
			case Keys.OemMinus:
				diagramCanvas.ZoomOut();
				e.Handled = true;
				break;
			case Keys.D0:
				diagramCanvas.FitAll();
				e.Handled = true;
				break;
			}
		}
		else if (e.KeyCode == Keys.F5)
		{
			RunNormalizationCheck();
			e.Handled = true;
		}
	}

	private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
	{
		if (!ConfirmDiscard())
		{
			e.Cancel = true;
		}
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing && components != null)
		{
			components.Dispose();
		}
		base.Dispose(disposing);
	}

    private void InitializeComponent()
    {
        components = new Container();
        ComponentResourceManager resources = new ComponentResourceManager(typeof(MainForm));
        toolTip1 = new ToolTip(components);
        btnToolSelect = new Button();
        btnToolAddTable = new Button();
        btnToolRel11 = new Button();
        btnToolRel1N = new Button();
        btnToolRelNM = new Button();
        btnZoomIn = new Button();
        btnZoomOut = new Button();
        btnFitAll = new Button();
        btnCanvasToggleRight = new Button();
        menuNew = new ToolStripMenuItem();
        menuOpen = new ToolStripMenuItem();
        menuOpenDatabase = new ToolStripMenuItem();
        sepFile1 = new ToolStripSeparator();
        menuSave = new ToolStripMenuItem();
        menuSaveAs = new ToolStripMenuItem();
        sepFile2 = new ToolStripSeparator();
        menuRecent = new ToolStripMenuItem();
        sepFile3 = new ToolStripSeparator();
        menuExportSql = new ToolStripMenuItem();
        menuExportJson = new ToolStripMenuItem();
        menuExport = new ToolStripMenuItem();
        sepFile4 = new ToolStripSeparator();
        menuExit = new ToolStripMenuItem();
        menuFile = new ToolStripMenuItem();
        menuAddTable = new ToolStripMenuItem();
        menuAddColumn = new ToolStripMenuItem();
        menuAddRel = new ToolStripMenuItem();
        sepEdit1 = new ToolStripSeparator();
        menuEditSel = new ToolStripMenuItem();
        menuDeleteSel = new ToolStripMenuItem();
        menuEdit = new ToolStripMenuItem();
        menuZoomIn = new ToolStripMenuItem();
        menuZoomOut = new ToolStripMenuItem();
        menuFitAll = new ToolStripMenuItem();
        sepView1 = new ToolStripSeparator();
        menuToggleRightPanel = new ToolStripMenuItem();
        sepView2 = new ToolStripSeparator();
        menuDbPostgres = new ToolStripMenuItem();
        menuDbMySQL = new ToolStripMenuItem();
        menuDbMariaDB = new ToolStripMenuItem();
        menuDbSQLite = new ToolStripMenuItem();
        menuDbSqlServer = new ToolStripMenuItem();
        menuDbType = new ToolStripMenuItem();
        menuView = new ToolStripMenuItem();
        menuAnalyze = new ToolStripMenuItem();
        menuWriteReport = new ToolStripMenuItem();
        sepAnalyze1 = new ToolStripSeparator();
        menuAnalyzeTop = new ToolStripMenuItem();
        menuAbout = new ToolStripMenuItem();
        menuStrip = new MenuStrip();
        btnTsNew = new ToolStripButton();
        btnTsOpen = new ToolStripButton();
        btnTsOpenDatabase = new ToolStripButton();
        btnTsSave = new ToolStripButton();
        btnTsSaveAs = new ToolStripButton();
        tsSep1 = new ToolStripSeparator();
        btnTsAddTable = new ToolStripButton();
        btnTsAddRel = new ToolStripButton();
        tsSep2 = new ToolStripSeparator();
        btnTsZoomIn = new ToolStripButton();
        btnTsZoomOut = new ToolStripButton();
        btnTsFitAll = new ToolStripButton();
        tsSep3 = new ToolStripSeparator();
        btnTsToggleRight = new ToolStripButton();
        btnTsAnalyze = new ToolStripButton();
        btnTsWriteReport = new ToolStripButton();
        tsSep4 = new ToolStripSeparator();
        tsDbPostgres = new ToolStripMenuItem();
        tsDbMySQL = new ToolStripMenuItem();
        tsDbMariaDB = new ToolStripMenuItem();
        tsDbSQLite = new ToolStripMenuItem();
        tsDbSqlServer = new ToolStripMenuItem();
        tsDbType = new ToolStripDropDownButton();
        btnTsAbout = new ToolStripButton();
        toolStrip = new ToolStrip();
        grpTools = new ToolboxGroupBox();
        grpRelation = new ToolboxGroupBox();
        grpView = new ToolboxGroupBox();
        panelToolBox = new Panel();
        treeViewSchema = new TreeView();
        listViewAnalysis = new ListView();
        tabTreeView = new TabPage();
        tabAnalysis = new TabPage();
        tabControlRight = new TabControl();
        splitPropertyDetail = new SplitContainer();
        txtPropertyDescription = new TextBox();
        splitRightPanel = new SplitContainer();
        panelRight = new Panel();
        diagramCanvas = new DiagramCanvas();
        panelCanvasArea = new Panel();
        panelToggleStrip = new Panel();
        panelCanvasInner = new Panel();
        panelRulerCorner = new Panel();
        rulerHorizontal = new CanvasRuler();
        rulerVertical = new CanvasRuler();
        tlpCanvasChrome = new TableLayoutPanel();
        panelCanvasHost = new Panel();
        panelContent = new Panel();
        statusLabel = new ToolStripStatusLabel();
        statusStrip = new StatusStrip();
        menuStrip.SuspendLayout();
        toolStrip.SuspendLayout();
        grpTools.SuspendLayout();
        grpRelation.SuspendLayout();
        grpView.SuspendLayout();
        panelToolBox.SuspendLayout();
        tabTreeView.SuspendLayout();
        tabAnalysis.SuspendLayout();
        tabControlRight.SuspendLayout();
        ((ISupportInitialize)splitPropertyDetail).BeginInit();
        splitPropertyDetail.Panel2.SuspendLayout();
        splitPropertyDetail.SuspendLayout();
        ((ISupportInitialize)splitRightPanel).BeginInit();
        splitRightPanel.Panel1.SuspendLayout();
        splitRightPanel.Panel2.SuspendLayout();
        splitRightPanel.SuspendLayout();
        panelRight.SuspendLayout();
        panelCanvasArea.SuspendLayout();
        panelToggleStrip.SuspendLayout();
        panelCanvasInner.SuspendLayout();
        tlpCanvasChrome.SuspendLayout();
        panelCanvasHost.SuspendLayout();
        panelContent.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // btnToolSelect
        // 
        btnToolSelect.Cursor = Cursors.Hand;
        btnToolSelect.FlatStyle = FlatStyle.Flat;
        btnToolSelect.Location = new Point(6, 20);
        btnToolSelect.Name = "btnToolSelect";
        btnToolSelect.Size = new Size(60, 40);
        btnToolSelect.TabIndex = 1;
        btnToolSelect.Text = "선택";
        toolTip1.SetToolTip(btnToolSelect, "포인터로 테이블/관계를 선택·이동합니다");
        // 
        // btnToolAddTable
        // 
        btnToolAddTable.Cursor = Cursors.Hand;
        btnToolAddTable.FlatStyle = FlatStyle.Flat;
        btnToolAddTable.Location = new Point(6, 64);
        btnToolAddTable.Name = "btnToolAddTable";
        btnToolAddTable.Size = new Size(60, 40);
        btnToolAddTable.TabIndex = 0;
        btnToolAddTable.Text = "테이블";
        toolTip1.SetToolTip(btnToolAddTable, "클릭한 위치에 새 테이블을 추가합니다");
        // 
        // btnToolRel11
        // 
        btnToolRel11.Cursor = Cursors.Hand;
        btnToolRel11.FlatStyle = FlatStyle.Flat;
        btnToolRel11.Location = new Point(6, 20);
        btnToolRel11.Name = "btnToolRel11";
        btnToolRel11.Size = new Size(60, 40);
        btnToolRel11.TabIndex = 2;
        btnToolRel11.Text = "1:1";
        toolTip1.SetToolTip(btnToolRel11, "일대일(1:1) 관계를 그립니다");
        // 
        // btnToolRel1N
        // 
        btnToolRel1N.Cursor = Cursors.Hand;
        btnToolRel1N.FlatStyle = FlatStyle.Flat;
        btnToolRel1N.Location = new Point(6, 64);
        btnToolRel1N.Name = "btnToolRel1N";
        btnToolRel1N.Size = new Size(60, 40);
        btnToolRel1N.TabIndex = 1;
        btnToolRel1N.Text = "1:N";
        toolTip1.SetToolTip(btnToolRel1N, "일대다(1:N) 관계를 그립니다");
        // 
        // btnToolRelNM
        // 
        btnToolRelNM.Cursor = Cursors.Hand;
        btnToolRelNM.FlatStyle = FlatStyle.Flat;
        btnToolRelNM.Location = new Point(6, 108);
        btnToolRelNM.Name = "btnToolRelNM";
        btnToolRelNM.Size = new Size(60, 40);
        btnToolRelNM.TabIndex = 0;
        btnToolRelNM.Text = "N:M";
        toolTip1.SetToolTip(btnToolRelNM, "다대다(N:M) 관계를 그립니다");
        // 
        // btnZoomIn
        // 
        btnZoomIn.Cursor = Cursors.Hand;
        btnZoomIn.FlatStyle = FlatStyle.Flat;
        btnZoomIn.Location = new Point(6, 20);
        btnZoomIn.Name = "btnZoomIn";
        btnZoomIn.Size = new Size(60, 40);
        btnZoomIn.TabIndex = 2;
        btnZoomIn.Text = "확대";
        toolTip1.SetToolTip(btnZoomIn, "다이어그램을 확대합니다");
        // 
        // btnZoomOut
        // 
        btnZoomOut.Cursor = Cursors.Hand;
        btnZoomOut.FlatStyle = FlatStyle.Flat;
        btnZoomOut.Location = new Point(6, 64);
        btnZoomOut.Name = "btnZoomOut";
        btnZoomOut.Size = new Size(60, 40);
        btnZoomOut.TabIndex = 1;
        btnZoomOut.Text = "축소";
        toolTip1.SetToolTip(btnZoomOut, "다이어그램을 축소합니다");
        // 
        // btnFitAll
        // 
        btnFitAll.Cursor = Cursors.Hand;
        btnFitAll.FlatStyle = FlatStyle.Flat;
        btnFitAll.Location = new Point(6, 108);
        btnFitAll.Name = "btnFitAll";
        btnFitAll.Size = new Size(60, 40);
        btnFitAll.TabIndex = 0;
        btnFitAll.Text = "맞춤";
        toolTip1.SetToolTip(btnFitAll, "모든 테이블이 보이도록 화면을 조정합니다");
        // 
        // btnCanvasToggleRight
        // 
        btnCanvasToggleRight.Cursor = Cursors.Hand;
        btnCanvasToggleRight.Dock = DockStyle.Fill;
        btnCanvasToggleRight.FlatStyle = FlatStyle.Flat;
        btnCanvasToggleRight.Location = new Point(0, 0);
        btnCanvasToggleRight.Name = "btnCanvasToggleRight";
        btnCanvasToggleRight.Size = new Size(24, 660);
        btnCanvasToggleRight.TabIndex = 0;
        btnCanvasToggleRight.TabStop = false;
        btnCanvasToggleRight.Text = "◀";
        toolTip1.SetToolTip(btnCanvasToggleRight, "우측 패널 접기/펼치기");
        // 
        // menuNew
        // 
        menuNew.Name = "menuNew";
        menuNew.ShortcutKeys = Keys.Control | Keys.N;
        menuNew.Size = new Size(261, 22);
        menuNew.Text = "새 프로젝트(&N)";
        menuNew.ToolTipText = "새 프로젝트를 만듭니다 (Ctrl+N)";
        // 
        // menuOpen
        // 
        menuOpen.Name = "menuOpen";
        menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        menuOpen.Size = new Size(261, 22);
        menuOpen.Text = "프로젝트 불러오기(&O)...";
        menuOpen.ToolTipText = "프로젝트 파일(.mdprj)을 불러옵니다 (Ctrl+O)";
        // 
        // menuOpenDatabase
        // 
        menuOpenDatabase.Name = "menuOpenDatabase";
        menuOpenDatabase.ShortcutKeys = Keys.Control | Keys.Shift | Keys.O;
        menuOpenDatabase.Size = new Size(261, 22);
        menuOpenDatabase.Text = "DB 파일 열기(&D)...";
        menuOpenDatabase.ToolTipText = "SQLite, SQL DDL, SQL Server, Access DB 파일을 분석해 다이어그램으로 표시합니다 (Ctrl+Shift+O)";
        // 
        // sepFile1
        // 
        sepFile1.Name = "sepFile1";
        sepFile1.Size = new Size(258, 6);
        // 
        // menuSave
        // 
        menuSave.Name = "menuSave";
        menuSave.ShortcutKeys = Keys.Control | Keys.S;
        menuSave.Size = new Size(261, 22);
        menuSave.Text = "저장(&S)";
        menuSave.ToolTipText = "현재 프로젝트를 저장합니다 (Ctrl+S)";
        // 
        // menuSaveAs
        // 
        menuSaveAs.Name = "menuSaveAs";
        menuSaveAs.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuSaveAs.Size = new Size(261, 22);
        menuSaveAs.Text = "다른 이름으로 저장...";
        menuSaveAs.ToolTipText = "새 이름으로 프로젝트를 저장합니다 (Ctrl+Shift+S)";
        // 
        // sepFile2
        // 
        sepFile2.Name = "sepFile2";
        sepFile2.Size = new Size(258, 6);
        // 
        // menuRecent
        // 
        menuRecent.Name = "menuRecent";
        menuRecent.Size = new Size(261, 22);
        menuRecent.Text = "최근 파일";
        menuRecent.ToolTipText = "최근에 사용한 프로젝트 파일 목록 (최대 10개)";
        // 
        // sepFile3
        // 
        sepFile3.Name = "sepFile3";
        sepFile3.Size = new Size(258, 6);
        // 
        // menuExportSql
        // 
        menuExportSql.Name = "menuExportSql";
        menuExportSql.Size = new Size(185, 22);
        menuExportSql.Text = "SQL DDL 내보내기...";
        menuExportSql.ToolTipText = "현재 스키마를 SQL DDL 파일로 내보냅니다";
        // 
        // menuExportJson
        // 
        menuExportJson.Name = "menuExportJson";
        menuExportJson.Size = new Size(185, 22);
        menuExportJson.Text = "JSON 내보내기...";
        menuExportJson.ToolTipText = "현재 스키마를 JSON 파일로 내보냅니다";
        // 
        // menuExport
        // 
        menuExport.DropDownItems.AddRange(new ToolStripItem[] { menuExportSql, menuExportJson });
        menuExport.Name = "menuExport";
        menuExport.Size = new Size(261, 22);
        menuExport.Text = "내보내기";
        menuExport.ToolTipText = "SQL 또는 JSON으로 내보냅니다";
        // 
        // sepFile4
        // 
        sepFile4.Name = "sepFile4";
        sepFile4.Size = new Size(258, 6);
        // 
        // menuExit
        // 
        menuExit.Name = "menuExit";
        menuExit.Size = new Size(261, 22);
        menuExit.Text = "끝내기(&X)";
        menuExit.ToolTipText = "프로그램을 종료합니다";
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuNew, menuOpen, menuOpenDatabase, sepFile1, menuSave, menuSaveAs, sepFile2, menuRecent, sepFile3, menuExport, sepFile4, menuExit });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(57, 20);
        menuFile.Text = "파일(&F)";
        // 
        // menuAddTable
        // 
        menuAddTable.Name = "menuAddTable";
        menuAddTable.ShortcutKeys = Keys.Control | Keys.T;
        menuAddTable.Size = new Size(212, 22);
        menuAddTable.Text = "테이블 추가(&T)";
        menuAddTable.ToolTipText = "새 테이블을 추가합니다 (Ctrl+T)";
        // 
        // menuAddColumn
        // 
        menuAddColumn.Name = "menuAddColumn";
        menuAddColumn.ShortcutKeys = Keys.Control | Keys.L;
        menuAddColumn.Size = new Size(212, 22);
        menuAddColumn.Text = "컬럼 추가(&L)";
        menuAddColumn.ToolTipText = "선택한 테이블에 컬럼을 추가합니다 (Ctrl+L)";
        // 
        // menuAddRel
        // 
        menuAddRel.Name = "menuAddRel";
        menuAddRel.ShortcutKeys = Keys.Control | Keys.R;
        menuAddRel.Size = new Size(212, 22);
        menuAddRel.Text = "관계 추가(&R)";
        menuAddRel.ToolTipText = "테이블 간 관계를 추가합니다 (Ctrl+R)";
        // 
        // sepEdit1
        // 
        sepEdit1.Name = "sepEdit1";
        sepEdit1.Size = new Size(209, 6);
        // 
        // menuEditSel
        // 
        menuEditSel.Name = "menuEditSel";
        menuEditSel.ShortcutKeys = Keys.F2;
        menuEditSel.Size = new Size(212, 22);
        menuEditSel.Text = "선택 항목 편집(&E)";
        menuEditSel.ToolTipText = "선택한 테이블 또는 관계를 편집합니다 (F2)";
        // 
        // menuDeleteSel
        // 
        menuDeleteSel.Name = "menuDeleteSel";
        menuDeleteSel.ShortcutKeys = Keys.Delete;
        menuDeleteSel.Size = new Size(212, 22);
        menuDeleteSel.Text = "선택 항목 삭제(&D)";
        menuDeleteSel.ToolTipText = "선택한 항목을 삭제합니다 (Delete)";
        // 
        // menuEdit
        // 
        menuEdit.DropDownItems.AddRange(new ToolStripItem[] { menuAddTable, menuAddColumn, menuAddRel, sepEdit1, menuEditSel, menuDeleteSel });
        menuEdit.Name = "menuEdit";
        menuEdit.Size = new Size(57, 20);
        menuEdit.Text = "편집(&E)";
        // 
        // menuZoomIn
        // 
        menuZoomIn.Name = "menuZoomIn";
        menuZoomIn.ShortcutKeys = Keys.Control | Keys.Oemplus;
        menuZoomIn.Size = new Size(204, 22);
        menuZoomIn.Text = "확대(+)";
        menuZoomIn.ToolTipText = "다이어그램을 확대합니다 (Ctrl++)";
        // 
        // menuZoomOut
        // 
        menuZoomOut.Name = "menuZoomOut";
        menuZoomOut.ShortcutKeys = Keys.Control | Keys.OemMinus;
        menuZoomOut.Size = new Size(204, 22);
        menuZoomOut.Text = "축소(-)";
        menuZoomOut.ToolTipText = "다이어그램을 축소합니다 (Ctrl+-)";
        // 
        // menuFitAll
        // 
        menuFitAll.Name = "menuFitAll";
        menuFitAll.ShortcutKeys = Keys.Control | Keys.D0;
        menuFitAll.Size = new Size(204, 22);
        menuFitAll.Text = "전체 맞춤";
        menuFitAll.ToolTipText = "모든 테이블이 보이도록 화면을 조정합니다 (Ctrl+0)";
        // 
        // sepView1
        // 
        sepView1.Name = "sepView1";
        sepView1.Size = new Size(201, 6);
        // 
        // menuToggleRightPanel
        // 
        menuToggleRightPanel.Checked = true;
        menuToggleRightPanel.CheckOnClick = true;
        menuToggleRightPanel.CheckState = CheckState.Checked;
        menuToggleRightPanel.Name = "menuToggleRightPanel";
        menuToggleRightPanel.Size = new Size(204, 22);
        menuToggleRightPanel.Text = "속성 패널(&P)";
        menuToggleRightPanel.ToolTipText = "우측 패널(구조·분석·속성) 표시/숨기기";
        // 
        // sepView2
        // 
        sepView2.Name = "sepView2";
        sepView2.Size = new Size(201, 6);
        // 
        // menuDbPostgres
        // 
        menuDbPostgres.Name = "menuDbPostgres";
        menuDbPostgres.Size = new Size(136, 22);
        menuDbPostgres.Text = "PostgreSQL";
        // 
        // menuDbMySQL
        // 
        menuDbMySQL.Name = "menuDbMySQL";
        menuDbMySQL.Size = new Size(136, 22);
        menuDbMySQL.Text = "MySQL";
        // 
        // menuDbMariaDB
        // 
        menuDbMariaDB.Name = "menuDbMariaDB";
        menuDbMariaDB.Size = new Size(136, 22);
        menuDbMariaDB.Text = "MariaDB";
        // 
        // menuDbSQLite
        // 
        menuDbSQLite.Name = "menuDbSQLite";
        menuDbSQLite.Size = new Size(136, 22);
        menuDbSQLite.Text = "SQLite";
        // 
        // menuDbSqlServer
        // 
        menuDbSqlServer.Name = "menuDbSqlServer";
        menuDbSqlServer.Size = new Size(136, 22);
        menuDbSqlServer.Text = "SQL Server";
        // 
        // menuDbType
        // 
        menuDbType.DropDownItems.AddRange(new ToolStripItem[] { menuDbPostgres, menuDbMySQL, menuDbMariaDB, menuDbSQLite, menuDbSqlServer });
        menuDbType.Name = "menuDbType";
        menuDbType.Size = new Size(204, 22);
        menuDbType.Text = "데이터베이스 종류";
        menuDbType.ToolTipText = "대상 데이터베이스 종류를 선택합니다";
        // 
        // menuView
        // 
        menuView.DropDownItems.AddRange(new ToolStripItem[] { menuZoomIn, menuZoomOut, menuFitAll, sepView1, menuToggleRightPanel, sepView2, menuDbType });
        menuView.Name = "menuView";
        menuView.Size = new Size(59, 20);
        menuView.Text = "보기(&V)";
        // 
        // menuAnalyze
        // 
        menuAnalyze.Name = "menuAnalyze";
        menuAnalyze.ShortcutKeys = Keys.F5;
        menuAnalyze.Size = new Size(227, 22);
        menuAnalyze.Text = "정규화 검사 실행(&C)";
        menuAnalyze.ToolTipText = "1NF/2NF/3NF 정규화 검사를 실행합니다 (F5)";
        // 
        // menuWriteReport
        // 
        menuWriteReport.Name = "menuWriteReport";
        menuWriteReport.ShortcutKeys = Keys.Control | Keys.Shift | Keys.R;
        menuWriteReport.Size = new Size(227, 22);
        menuWriteReport.Text = "보고서 작성(&R)";
        menuWriteReport.ToolTipText = "스키마 분석 보고서를 파일로 저장합니다 (Ctrl+Shift+R)";
        // 
        // sepAnalyze1
        // 
        sepAnalyze1.Name = "sepAnalyze1";
        sepAnalyze1.Size = new Size(224, 6);
        // 
        // menuAnalyzeTop
        // 
        menuAnalyzeTop.DropDownItems.AddRange(new ToolStripItem[] { menuAnalyze, sepAnalyze1, menuWriteReport });
        menuAnalyzeTop.Name = "menuAnalyzeTop";
        menuAnalyzeTop.Size = new Size(59, 20);
        menuAnalyzeTop.Text = "분석(&A)";
        // 
        // menuAbout
        // 
        menuAbout.Name = "menuAbout";
        menuAbout.Size = new Size(54, 20);
        menuAbout.Text = "정보(&I)";
        menuAbout.ToolTipText = "프로그램 정보";
        // 
        // menuStrip
        // 
        menuStrip.Items.AddRange(new ToolStripItem[] { menuFile, menuEdit, menuView, menuAnalyzeTop, menuAbout });
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1264, 24);
        menuStrip.TabIndex = 3;
        // 
        // btnTsNew
        // 
        btnTsNew.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsNew.Name = "btnTsNew";
        btnTsNew.Size = new Size(23, 22);
        btnTsNew.ToolTipText = "새 프로젝트 (Ctrl+N)";
        // 
        // btnTsOpen
        // 
        btnTsOpen.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsOpen.Name = "btnTsOpen";
        btnTsOpen.Size = new Size(23, 22);
        btnTsOpen.ToolTipText = "프로젝트 불러오기 (Ctrl+O)";
        // 
        // btnTsOpenDatabase
        // 
        btnTsOpenDatabase.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsOpenDatabase.Name = "btnTsOpenDatabase";
        btnTsOpenDatabase.Size = new Size(23, 22);
        btnTsOpenDatabase.ToolTipText = "DB 파일 열기 (Ctrl+Shift+O)";
        // 
        // btnTsSave
        // 
        btnTsSave.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsSave.Name = "btnTsSave";
        btnTsSave.Size = new Size(23, 22);
        btnTsSave.ToolTipText = "저장 (Ctrl+S)";
        // 
        // btnTsSaveAs
        // 
        btnTsSaveAs.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsSaveAs.Name = "btnTsSaveAs";
        btnTsSaveAs.Size = new Size(23, 22);
        btnTsSaveAs.ToolTipText = "다른 이름으로 저장 (Ctrl+Shift+S)";
        // 
        // tsSep1
        // 
        tsSep1.Name = "tsSep1";
        tsSep1.Size = new Size(6, 25);
        // 
        // btnTsAddTable
        // 
        btnTsAddTable.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsAddTable.Name = "btnTsAddTable";
        btnTsAddTable.Size = new Size(23, 22);
        btnTsAddTable.ToolTipText = "테이블 추가 (Ctrl+T)";
        // 
        // btnTsAddRel
        // 
        btnTsAddRel.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsAddRel.Name = "btnTsAddRel";
        btnTsAddRel.Size = new Size(23, 22);
        btnTsAddRel.ToolTipText = "관계 추가 (Ctrl+R)";
        // 
        // tsSep2
        // 
        tsSep2.Name = "tsSep2";
        tsSep2.Size = new Size(6, 25);
        // 
        // btnTsZoomIn
        // 
        btnTsZoomIn.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsZoomIn.Name = "btnTsZoomIn";
        btnTsZoomIn.Size = new Size(23, 22);
        btnTsZoomIn.ToolTipText = "확대 (Ctrl++)";
        // 
        // btnTsZoomOut
        // 
        btnTsZoomOut.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsZoomOut.Name = "btnTsZoomOut";
        btnTsZoomOut.Size = new Size(23, 22);
        btnTsZoomOut.ToolTipText = "축소 (Ctrl+-)";
        // 
        // btnTsFitAll
        // 
        btnTsFitAll.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsFitAll.Name = "btnTsFitAll";
        btnTsFitAll.Size = new Size(23, 22);
        btnTsFitAll.ToolTipText = "전체 맞춤 (Ctrl+0)";
        // 
        // tsSep3
        // 
        tsSep3.Name = "tsSep3";
        tsSep3.Size = new Size(6, 25);
        // 
        // btnTsToggleRight
        // 
        btnTsToggleRight.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsToggleRight.Name = "btnTsToggleRight";
        btnTsToggleRight.Size = new Size(23, 22);
        btnTsToggleRight.ToolTipText = "우측 패널 접기/펼치기";
        // 
        // btnTsAnalyze
        // 
        btnTsAnalyze.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsAnalyze.Name = "btnTsAnalyze";
        btnTsAnalyze.Size = new Size(23, 22);
        btnTsAnalyze.ToolTipText = "정규화 검사 실행 (F5)";
        // 
        // btnTsWriteReport
        // 
        btnTsWriteReport.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnTsWriteReport.Name = "btnTsWriteReport";
        btnTsWriteReport.Size = new Size(23, 22);
        btnTsWriteReport.ToolTipText = "보고서 작성 (Ctrl+Shift+R)";
        // 
        // tsSep4
        // 
        tsSep4.Name = "tsSep4";
        tsSep4.Size = new Size(6, 25);
        // 
        // tsDbPostgres
        // 
        tsDbPostgres.Name = "tsDbPostgres";
        tsDbPostgres.Size = new Size(136, 22);
        tsDbPostgres.Text = "PostgreSQL";
        // 
        // tsDbMySQL
        // 
        tsDbMySQL.Name = "tsDbMySQL";
        tsDbMySQL.Size = new Size(136, 22);
        tsDbMySQL.Text = "MySQL";
        // 
        // tsDbMariaDB
        // 
        tsDbMariaDB.Name = "tsDbMariaDB";
        tsDbMariaDB.Size = new Size(136, 22);
        tsDbMariaDB.Text = "MariaDB";
        // 
        // tsDbSQLite
        // 
        tsDbSQLite.Name = "tsDbSQLite";
        tsDbSQLite.Size = new Size(136, 22);
        tsDbSQLite.Text = "SQLite";
        // 
        // tsDbSqlServer
        // 
        tsDbSqlServer.Name = "tsDbSqlServer";
        tsDbSqlServer.Size = new Size(136, 22);
        tsDbSqlServer.Text = "SQL Server";
        // 
        // tsDbType
        // 
        tsDbType.DropDownItems.AddRange(new ToolStripItem[] { tsDbSQLite, tsDbMySQL, tsDbMariaDB, tsDbPostgres, tsDbSqlServer });
        tsDbType.Name = "tsDbType";
        tsDbType.Size = new Size(55, 22);
        tsDbType.Text = "SQLite";
        tsDbType.ToolTipText = "데이터베이스 종류 선택";
        // 
        // btnTsAbout
        // 
        btnTsAbout.Alignment = ToolStripItemAlignment.Right;
        btnTsAbout.Name = "btnTsAbout";
        btnTsAbout.Size = new Size(35, 22);
        btnTsAbout.Text = "정보";
        btnTsAbout.ToolTipText = "프로그램 정보 및 버전";
        // 
        // toolStrip
        // 
        toolStrip.ImageScalingSize = new Size(22, 22);
        toolStrip.Items.AddRange(new ToolStripItem[] { btnTsNew, btnTsOpen, btnTsOpenDatabase, btnTsSave, btnTsSaveAs, tsSep1, btnTsAddTable, btnTsAddRel, tsSep2, btnTsZoomIn, btnTsZoomOut, btnTsFitAll, tsSep3, btnTsToggleRight, btnTsAnalyze, btnTsWriteReport, tsSep4, tsDbType, btnTsAbout });
        toolStrip.Location = new Point(0, 24);
        toolStrip.Name = "toolStrip";
        toolStrip.Size = new Size(1264, 25);
        toolStrip.TabIndex = 2;
        // 
        // grpTools
        // 
        grpTools.Controls.Add(btnToolAddTable);
        grpTools.Controls.Add(btnToolSelect);
        grpTools.Dock = DockStyle.Top;
        grpTools.Location = new Point(2, 4);
        grpTools.Name = "grpTools";
        grpTools.Padding = new Padding(4, 2, 4, 4);
        grpTools.Size = new Size(72, 112);
        grpTools.TabIndex = 2;
        grpTools.TabStop = false;
        grpTools.Text = "도구";
        // 
        // grpRelation
        // 
        grpRelation.Controls.Add(btnToolRelNM);
        grpRelation.Controls.Add(btnToolRel1N);
        grpRelation.Controls.Add(btnToolRel11);
        grpRelation.Dock = DockStyle.Top;
        grpRelation.Location = new Point(2, 116);
        grpRelation.Name = "grpRelation";
        grpRelation.Padding = new Padding(4, 2, 4, 4);
        grpRelation.Size = new Size(72, 156);
        grpRelation.TabIndex = 1;
        grpRelation.TabStop = false;
        grpRelation.Text = "관계";
        // 
        // grpView
        // 
        grpView.Controls.Add(btnFitAll);
        grpView.Controls.Add(btnZoomOut);
        grpView.Controls.Add(btnZoomIn);
        grpView.Dock = DockStyle.Top;
        grpView.Location = new Point(2, 272);
        grpView.Name = "grpView";
        grpView.Padding = new Padding(4, 2, 4, 4);
        grpView.Size = new Size(72, 156);
        grpView.TabIndex = 0;
        grpView.TabStop = false;
        grpView.Text = "보기";
        // 
        // panelToolBox
        // 
        panelToolBox.Controls.Add(grpView);
        panelToolBox.Controls.Add(grpRelation);
        panelToolBox.Controls.Add(grpTools);
        panelToolBox.Dock = DockStyle.Left;
        panelToolBox.Location = new Point(0, 0);
        panelToolBox.MaximumSize = new Size(76, 0);
        panelToolBox.MinimumSize = new Size(76, 0);
        panelToolBox.Name = "panelToolBox";
        panelToolBox.Padding = new Padding(2, 4, 2, 4);
        panelToolBox.Size = new Size(76, 690);
        panelToolBox.TabIndex = 1;
        // 
        // treeViewSchema
        // 
        treeViewSchema.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        treeViewSchema.BorderStyle = BorderStyle.None;
        treeViewSchema.HideSelection = false;
        treeViewSchema.Location = new Point(0, 0);
        treeViewSchema.Name = "treeViewSchema";
        treeViewSchema.ShowNodeToolTips = true;
        treeViewSchema.Size = new Size(384, 811);
        treeViewSchema.TabIndex = 0;
        // 
        // listViewAnalysis
        // 
        listViewAnalysis.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        listViewAnalysis.BorderStyle = BorderStyle.None;
        listViewAnalysis.FullRowSelect = true;
        listViewAnalysis.Location = new Point(0, 0);
        listViewAnalysis.Name = "listViewAnalysis";
        listViewAnalysis.Size = new Size(284, 422);
        listViewAnalysis.TabIndex = 0;
        listViewAnalysis.UseCompatibleStateImageBehavior = false;
        listViewAnalysis.View = View.Details;
        // 
        // tabTreeView
        // 
        tabTreeView.Controls.Add(treeViewSchema);
        tabTreeView.Location = new Point(4, 24);
        tabTreeView.Name = "tabTreeView";
        tabTreeView.Size = new Size(292, 461);
        tabTreeView.TabIndex = 0;
        tabTreeView.Text = "구조";
        // 
        // tabAnalysis
        // 
        tabAnalysis.Controls.Add(listViewAnalysis);
        tabAnalysis.Location = new Point(4, 24);
        tabAnalysis.Name = "tabAnalysis";
        tabAnalysis.Size = new Size(192, 72);
        tabAnalysis.TabIndex = 1;
        tabAnalysis.Text = "정규화 분석";
        // 
        // tabControlRight
        // 
        tabControlRight.Controls.Add(tabTreeView);
        tabControlRight.Controls.Add(tabAnalysis);
        tabControlRight.Dock = DockStyle.Fill;
        tabControlRight.Location = new Point(0, 0);
        tabControlRight.Name = "tabControlRight";
        tabControlRight.SelectedIndex = 0;
        tabControlRight.Size = new Size(300, 489);
        tabControlRight.TabIndex = 0;
        // 
        // splitPropertyDetail
        // 
        splitPropertyDetail.Dock = DockStyle.Fill;
        splitPropertyDetail.Location = new Point(0, 0);
        splitPropertyDetail.Name = "splitPropertyDetail";
        splitPropertyDetail.Orientation = Orientation.Horizontal;
        splitPropertyDetail.Panel1MinSize = 80;
        // 
        // splitPropertyDetail.Panel2
        // 
        splitPropertyDetail.Panel2.Controls.Add(txtPropertyDescription);
        splitPropertyDetail.Panel2MinSize = 48;
        splitPropertyDetail.Size = new Size(300, 197);
        splitPropertyDetail.SplitterDistance = 139;
        splitPropertyDetail.TabIndex = 0;
        // 
        // txtPropertyDescription
        // 
        txtPropertyDescription.Dock = DockStyle.Fill;
        txtPropertyDescription.Location = new Point(0, 0);
        txtPropertyDescription.Name = "txtPropertyDescription";
        txtPropertyDescription.Size = new Size(300, 23);
        txtPropertyDescription.TabIndex = 0;
        // 
        // splitRightPanel
        // 
        splitRightPanel.Dock = DockStyle.Fill;
        splitRightPanel.Location = new Point(0, 0);
        splitRightPanel.Name = "splitRightPanel";
        splitRightPanel.Orientation = Orientation.Horizontal;
        // 
        // splitRightPanel.Panel1
        // 
        splitRightPanel.Panel1.Controls.Add(tabControlRight);
        splitRightPanel.Panel1MinSize = 100;
        // 
        // splitRightPanel.Panel2
        // 
        splitRightPanel.Panel2.Controls.Add(splitPropertyDetail);
        splitRightPanel.Panel2MinSize = 120;
        splitRightPanel.Size = new Size(300, 690);
        splitRightPanel.SplitterDistance = 489;
        splitRightPanel.TabIndex = 0;
        // 
        // panelRight
        // 
        panelRight.Controls.Add(splitRightPanel);
        panelRight.Dock = DockStyle.Right;
        panelRight.Location = new Point(964, 0);
        panelRight.Name = "panelRight";
        panelRight.Size = new Size(300, 690);
        panelRight.TabIndex = 2;
        // 
        // diagramCanvas
        // 
        diagramCanvas.BackColor = Color.FromArgb(255, 255, 255);
        diagramCanvas.Dock = DockStyle.Fill;
        diagramCanvas.Location = new Point(0, 0);
        diagramCanvas.Name = "diagramCanvas";
        diagramCanvas.Size = new Size(830, 660);
        diagramCanvas.TabIndex = 0;
        // 
        // panelCanvasArea
        // 
        panelCanvasArea.Controls.Add(diagramCanvas);
        panelCanvasArea.Dock = DockStyle.Fill;
        panelCanvasArea.Location = new Point(0, 0);
        panelCanvasArea.Name = "panelCanvasArea";
        panelCanvasArea.Size = new Size(830, 660);
        panelCanvasArea.TabIndex = 0;
        // 
        // panelToggleStrip
        // 
        panelToggleStrip.Controls.Add(btnCanvasToggleRight);
        panelToggleStrip.Dock = DockStyle.Right;
        panelToggleStrip.Location = new Point(830, 0);
        panelToggleStrip.Name = "panelToggleStrip";
        panelToggleStrip.Size = new Size(24, 660);
        panelToggleStrip.TabIndex = 1;
        // 
        // panelCanvasInner
        // 
        panelCanvasInner.Controls.Add(panelCanvasArea);
        panelCanvasInner.Controls.Add(panelToggleStrip);
        panelCanvasInner.Dock = DockStyle.Fill;
        panelCanvasInner.Location = new Point(31, 27);
        panelCanvasInner.Name = "panelCanvasInner";
        panelCanvasInner.Size = new Size(854, 660);
        panelCanvasInner.TabIndex = 3;
        // 
        // panelRulerCorner
        // 
        panelRulerCorner.BackColor = Color.FromArgb(243, 244, 246);
        panelRulerCorner.Dock = DockStyle.Fill;
        panelRulerCorner.Location = new Point(3, 3);
        panelRulerCorner.Name = "panelRulerCorner";
        panelRulerCorner.Size = new Size(22, 18);
        panelRulerCorner.TabIndex = 0;
        // 
        // rulerHorizontal
        // 
        rulerHorizontal.BackColor = Color.FromArgb(248, 249, 251);
        rulerHorizontal.Dock = DockStyle.Fill;
        rulerHorizontal.Location = new Point(31, 3);
        rulerHorizontal.Name = "rulerHorizontal";
        rulerHorizontal.Size = new Size(854, 18);
        rulerHorizontal.TabIndex = 1;
        // 
        // rulerVertical
        // 
        rulerVertical.BackColor = Color.FromArgb(248, 249, 251);
        rulerVertical.Dock = DockStyle.Fill;
        rulerVertical.Location = new Point(3, 27);
        rulerVertical.Name = "rulerVertical";
        rulerVertical.Size = new Size(22, 660);
        rulerVertical.TabIndex = 2;
        // 
        // tlpCanvasChrome
        // 
        tlpCanvasChrome.ColumnCount = 2;
        tlpCanvasChrome.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 28F));
        tlpCanvasChrome.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tlpCanvasChrome.Controls.Add(panelRulerCorner, 0, 0);
        tlpCanvasChrome.Controls.Add(rulerHorizontal, 1, 0);
        tlpCanvasChrome.Controls.Add(rulerVertical, 0, 1);
        tlpCanvasChrome.Controls.Add(panelCanvasInner, 1, 1);
        tlpCanvasChrome.Dock = DockStyle.Fill;
        tlpCanvasChrome.Location = new Point(0, 0);
        tlpCanvasChrome.Name = "tlpCanvasChrome";
        tlpCanvasChrome.RowCount = 2;
        tlpCanvasChrome.RowStyles.Add(new RowStyle(SizeType.Absolute, 24F));
        tlpCanvasChrome.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        tlpCanvasChrome.Size = new Size(888, 690);
        tlpCanvasChrome.TabIndex = 0;
        // 
        // panelCanvasHost
        // 
        panelCanvasHost.Controls.Add(tlpCanvasChrome);
        panelCanvasHost.Dock = DockStyle.Fill;
        panelCanvasHost.Location = new Point(76, 0);
        panelCanvasHost.Name = "panelCanvasHost";
        panelCanvasHost.Size = new Size(888, 690);
        panelCanvasHost.TabIndex = 0;
        // 
        // panelContent
        // 
        panelContent.Controls.Add(panelCanvasHost);
        panelContent.Controls.Add(panelRight);
        panelContent.Controls.Add(panelToolBox);
        panelContent.Dock = DockStyle.Fill;
        panelContent.Location = new Point(0, 49);
        panelContent.Name = "panelContent";
        panelContent.Size = new Size(1264, 690);
        panelContent.TabIndex = 0;
        // 
        // statusLabel
        // 
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(1249, 17);
        statusLabel.Spring = true;
        statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel });
        statusStrip.Location = new Point(0, 739);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1264, 22);
        statusStrip.TabIndex = 1;
        // 
        // MainForm
        // 
        ClientSize = new Size(1264, 761);
        Controls.Add(panelContent);
        Controls.Add(statusStrip);
        Controls.Add(toolStrip);
        Controls.Add(menuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(900, 600);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "DBTools v1.0";
        menuStrip.ResumeLayout(false);
        menuStrip.PerformLayout();
        toolStrip.ResumeLayout(false);
        toolStrip.PerformLayout();
        grpTools.ResumeLayout(false);
        grpRelation.ResumeLayout(false);
        grpView.ResumeLayout(false);
        panelToolBox.ResumeLayout(false);
        tabTreeView.ResumeLayout(false);
        tabAnalysis.ResumeLayout(false);
        tabControlRight.ResumeLayout(false);
        splitPropertyDetail.Panel2.ResumeLayout(false);
        splitPropertyDetail.Panel2.PerformLayout();
        ((ISupportInitialize)splitPropertyDetail).EndInit();
        splitPropertyDetail.ResumeLayout(false);
        splitRightPanel.Panel1.ResumeLayout(false);
        splitRightPanel.Panel2.ResumeLayout(false);
        ((ISupportInitialize)splitRightPanel).EndInit();
        splitRightPanel.ResumeLayout(false);
        panelRight.ResumeLayout(false);
        panelCanvasArea.ResumeLayout(false);
        panelToggleStrip.ResumeLayout(false);
        panelCanvasInner.ResumeLayout(false);
        tlpCanvasChrome.ResumeLayout(false);
        panelCanvasHost.ResumeLayout(false);
        panelContent.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

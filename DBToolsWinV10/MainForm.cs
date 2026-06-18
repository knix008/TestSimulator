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
using DBToolsWinV10.Sample;
using DBToolsWinV10.Serialization;

namespace DBToolsWinV10;

public partial class MainForm : Form
{
	private const string FileFilter = "DB 프로젝트 파일 (*.mdprj)|*.mdprj|모든 파일 (*.*)|*.*";

	private string _currentFilePath;

	private DbSchema _cleanSchemaSnapshot;

	private bool _rightPanelVisible = true;

	private const int RightPanelMinWidth = 260;

	private const int CanvasMinWidth = 320;

	private const float RulerThickness = 28f;

	private const float RulerHeaderThickness = 24f;

	private SplitContainer splitMain;

	private int _rightPanelWidth;

	private bool _mainSplitDistanceInitialized;

	private ToolStripButton btnTsZoom = null;

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

	private ToolStripSeparator tsSepExport;

	private ToolStripDropDownButton tsExport;

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

	private ToolStripMenuItem menuDbVectorDb;

	private ToolStripMenuItem menuAnalyzeTop;

	private ToolStripMenuItem menuAnalyze;

	private ToolStripMenuItem menuWriteReport;

	private ToolStripSeparator sepAnalyze1;

	private ToolStripMenuItem menuAbout;

	private ToolStripMenuItem menuSample;

	private ToolStripDropDownButton tsSample;

	private ToolStripSeparator tsSepSample;

	private ToolStrip toolStrip;

	private ToolStripButton btnTsNew;

	private ToolStripButton btnTsOpen;

	private ToolStripButton btnTsOpenDatabase;

	private ToolStripButton btnTsSave;

	private ToolStripButton btnTsSaveAs;

	private ToolStripSeparator tsSep1;

	private ToolStripButton btnTsAddTable;

	private ToolStripButton btnTsAddRel;

	private ToolStripSeparator tsSepLineStyle;

	private ToolStripDropDownButton tsLineStyle;

	private ToolStripMenuItem tsLineStraight;

	private ToolStripMenuItem tsLineCurved;

	private ToolStripMenuItem tsLineOrthogonal;

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

	private ToolStripMenuItem tsDbVectorDb;

	private ToolStripButton btnTsAbout;

	private Panel panelContent;

	private Panel panelToolBox;

	private Panel panelCanvasHost;

	private Panel panelCanvasChromeTop;

	private Panel panelCanvasChromeBody;

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

	private TabPage tabIndexAdvisor;

	private TreeView treeViewSchema;

	private ListView listViewAnalysis;

	private ListView listViewIndexAdvisor;

	private Label lblAnalysisSummary;

	private BufferedPropertyGrid propertyGrid = null!;

	private ToolStrip propertySortBar;

	private ToolStripButton btnPropertySortCategory;

	private ToolStripButton btnPropertySortAlphabetical;

	private StatusStrip statusStrip;

	private ToolStripStatusLabel statusLabel;

	public MainForm(string initialFile = null)
	{
		UiThread.EnsureSta();
		InitializeComponent();
		if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
		{
			ConfigureToolStripZoomButton();
			ConfigureToolStripLineStyle();
			ConfigureExportMenus();
			ConfigureMainLayoutSplit();
			ApplyModernTheme();
			ConfigureSampleMenus();
			ApplyIcons();
			WireEvents();
			diagramCanvas.ViewportChanged += delegate
			{
				UpdateViewportUi();
			};
			if (!string.IsNullOrWhiteSpace(initialFile) && File.Exists(initialFile))
			{
				if (!TryLoadFile(initialFile, showErrorOnFailure: false))
				{
					InitializeEmptyProject();
				}
			}
			else
			{
				InitializeEmptyProject();
			}
		}
	}

	protected override void OnLoad(EventArgs e)
	{
		base.OnLoad(e);
		SetRightPanelVisible(visible: true);
		UpdateViewportUi();
		BeginInvoke(ApplyMainSplitDistanceIfReady);
		BeginInvoke(AdjustAnalysisColumnWidths);
	}

	private void SetRightPanelVisible(bool visible, bool syncUiOnly = false)
	{
		_rightPanelVisible = visible;
		if (!syncUiOnly)
		{
			if (splitMain != null)
			{
				if (visible)
				{
					bool wasCollapsed = splitMain.Panel2Collapsed;
					splitMain.Panel2Collapsed = false;
					if (wasCollapsed)
					{
						SetRightPanelWidth(_rightPanelWidth, persist: false);
					}
					else if (AppSettings.TryGetRightPanelWidth(out int savedWidth))
					{
						SetRightPanelWidth(savedWidth, persist: false);
					}
				}
				else
				{
					_rightPanelWidth = GetCurrentRightPanelWidth();
					splitMain.Panel2Collapsed = true;
				}
			}
			else
			{
				panelRight.Visible = visible;
			}
		}
		UpdateRightPanelToggleUi();
	}

	private void ConfigureMainLayoutSplit()
	{
		_rightPanelWidth = panelRight.Width;
		splitMain.SplitterMoved += MainSplit_SplitterMoved;
		splitMain.Resize += MainSplit_Resize;
	}

	private void EnsureMainSplitConstraints()
	{
		if (splitMain == null || splitMain.Width <= 0)
		{
			return;
		}

		int available = splitMain.Width - splitMain.SplitterWidth;
		if (available <= 0)
		{
			return;
		}

		int panel1Min = CanvasMinWidth;
		int panel2Min = RightPanelMinWidth;
		if (panel1Min + panel2Min > available)
		{
			panel1Min = Math.Max(100, available * 55 / 100);
			panel2Min = Math.Max(100, available - panel1Min);
		}

		if (splitMain.Panel1MinSize != panel1Min)
		{
			splitMain.Panel1MinSize = panel1Min;
		}

		if (splitMain.Panel2MinSize != panel2Min)
		{
			splitMain.Panel2MinSize = panel2Min;
		}
	}

	private static bool TrySetSplitterDistance(SplitContainer split, int distance)
	{
		try
		{
			split.SplitterDistance = distance;
			return true;
		}
		catch (InvalidOperationException)
		{
			return false;
		}
	}

	private void MainSplit_Resize(object sender, EventArgs e)
	{
		ApplyMainSplitDistanceIfReady();
	}

	private void ApplyMainSplitDistanceIfReady()
	{
		if (_mainSplitDistanceInitialized || splitMain == null || splitMain.Width <= 0)
		{
			return;
		}

		EnsureMainSplitConstraints();
		if (_rightPanelVisible && AppSettings.TryGetRightPanelWidth(out int savedWidth))
		{
			SetRightPanelWidth(savedWidth, persist: false);
		}

		_rightPanelWidth = GetCurrentRightPanelWidth();
		_mainSplitDistanceInitialized = true;
	}

	private void SetRightPanelWidth(int width, bool persist = true)
	{
		if (splitMain == null || splitMain.Width <= 0)
		{
			return;
		}

		EnsureMainSplitConstraints();
		int available = splitMain.Width - splitMain.SplitterWidth;
		if (available <= splitMain.Panel1MinSize + splitMain.Panel2MinSize)
		{
			return;
		}

		int maxPanel2 = available - splitMain.Panel1MinSize;
		int panel2Width = Math.Clamp(width, splitMain.Panel2MinSize, maxPanel2);
		if (!TrySetSplitterDistance(splitMain, available - panel2Width))
		{
			return;
		}

		_rightPanelWidth = panel2Width;
		if (persist)
		{
			AppSettings.SetRightPanelWidth(panel2Width);
		}
	}

	private int GetCurrentRightPanelWidth()
	{
		if (splitMain == null || splitMain.Width <= 0)
		{
			return _rightPanelWidth;
		}

		return splitMain.Width - splitMain.SplitterDistance - splitMain.SplitterWidth;
	}

	private void MainSplit_SplitterMoved(object sender, SplitterEventArgs e)
	{
		if (!_rightPanelVisible || splitMain.Panel2Collapsed)
		{
			return;
		}

		_rightPanelWidth = GetCurrentRightPanelWidth();
		AppSettings.SetRightPanelWidth(_rightPanelWidth);
		propertyGrid.PerformLayout();
		propertyGrid.Invalidate(true);
		ApplyAnalysisColumnLayout(fillOnly: true);
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
		btnTsZoom.Text = $"{diagramCanvas.Zoom:P0}";
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
		ModernTheme.StyleDataList(listViewIndexAdvisor);
		ConfigureAnalysisPanel();
		ConfigureIndexAdvisorPanel();
		ModernTheme.StylePropertyGrid(propertyGrid);
		propertyGrid.HelpVisible = false;
		ModernTheme.StyleSplitContainer(splitRightPanel, ModernTheme.PanelBackground, ModernTheme.PanelBackground);
		if (splitMain != null)
		{
			ModernTheme.StyleSplitContainer(splitMain, ModernTheme.AppBackground, ModernTheme.PanelBackground);
		}
		panelContent.BackColor = ModernTheme.AppBackground;
		panelCanvasHost.BackColor = ModernTheme.CanvasChrome;
		panelCanvasInner.BackColor = ModernTheme.CanvasBackground;
		panelRulerCorner.BackColor = ModernTheme.ToolHover;
		ConfigureCanvasChromeLayout();
		ModernTheme.StyleCanvasToggleButton(btnCanvasToggleRight);
		panelToggleStrip.BackColor = ModernTheme.CanvasChrome;
		panelRight.BackColor = ModernTheme.PanelBackground;
		diagramCanvas.BackColor = ModernTheme.CanvasBackground;
		btnTsAbout.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
		btnTsAbout.Text = "정보";
		UpdateToolButtonStates();
	}

	private void ConfigureCanvasChromeLayout()
	{
		rulerHorizontal.Orientation = RulerOrientation.Horizontal;
		rulerVertical.Orientation = RulerOrientation.Vertical;
		UpdateViewportUi();
	}

	private void ConfigureToolStripZoomButton()
	{
		btnTsZoom = new ToolStripButton
		{
			Margin = new Padding(6, 0, 2, 0),
			Name = "btnTsZoom",
			Text = "100%",
			DisplayStyle = ToolStripItemDisplayStyle.Text,
			ForeColor = ModernTheme.TextSecondary,
			Font = ModernTheme.UiFontSmall,
			ToolTipText = "배율을 100%로 복원"
		};
		btnTsZoom.Click += delegate
		{
			diagramCanvas.ResetZoom();
		};
		int num = toolStrip.Items.IndexOf(btnTsZoomOut);
		toolStrip.Items.Insert(num + 1, btnTsZoom);
	}

	private void ConfigureToolStripLineStyle()
	{
		tsSepLineStyle = new ToolStripSeparator
		{
			Name = "tsSepLineStyle"
		};
		tsLineStraight = CreateLineStyleMenuItem("직선", RelationshipLineStyle.Straight);
		tsLineCurved = CreateLineStyleMenuItem("곡선", RelationshipLineStyle.Curved);
		tsLineOrthogonal = CreateLineStyleMenuItem("꺾은선", RelationshipLineStyle.Orthogonal);
		tsLineStyle = new ToolStripDropDownButton
		{
			DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
			ImageScaling = ToolStripItemImageScaling.None,
			Name = "tsLineStyle",
			Text = "직선",
			TextImageRelation = TextImageRelation.ImageBeforeText,
			ToolTipText = "관계선 스타일. 관계가 선택되면 해당 선에 적용되고, 없으면 새 관계의 기본 스타일입니다."
		};
		tsLineStyle.DropDownItems.AddRange(tsLineStraight, tsLineCurved, tsLineOrthogonal);
		tsLineStraight.Click += delegate
		{
			ApplyToolbarLineStyle(RelationshipLineStyle.Straight);
		};
		tsLineCurved.Click += delegate
		{
			ApplyToolbarLineStyle(RelationshipLineStyle.Curved);
		};
		tsLineOrthogonal.Click += delegate
		{
			ApplyToolbarLineStyle(RelationshipLineStyle.Orthogonal);
		};
		int num = toolStrip.Items.IndexOf(btnTsAddRel);
		toolStrip.Items.Insert(num + 1, tsSepLineStyle);
		toolStrip.Items.Insert(num + 2, tsLineStyle);
		UpdateToolbarLineStyleDisplay(diagramCanvas.DefaultLineStyle);
	}

	private static ToolStripMenuItem CreateLineStyleMenuItem(string text, RelationshipLineStyle style)
	{
		return new ToolStripMenuItem(text)
		{
			CheckOnClick = true,
			DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
			Image = IconProvider.Get(GetLineStyleIconName(style), 16),
			ImageScaling = ToolStripItemImageScaling.None,
			Name = style switch
			{
				RelationshipLineStyle.Curved => "tsLineCurved",
				RelationshipLineStyle.Orthogonal => "tsLineOrthogonal",
				_ => "tsLineStraight"
			},
			TextImageRelation = TextImageRelation.ImageBeforeText
		};
	}

	private static string GetLineStyleIconName(RelationshipLineStyle style) => style switch
	{
		RelationshipLineStyle.Curved => "LineCurved",
		RelationshipLineStyle.Orthogonal => "LineOrthogonal",
		_ => "LineStraight"
	};

	private void ApplyToolbarLineStyle(RelationshipLineStyle style)
	{
		DbRelationship selectedRelationship = diagramCanvas.SelectedRelationship;
		if (selectedRelationship != null)
		{
			diagramCanvas.SetRelationshipLineStyle(selectedRelationship, style);
			RefreshPropertyGrid();
			diagramCanvas.Invalidate();
		}
		else
		{
			diagramCanvas.DefaultLineStyle = style;
		}
		UpdateToolbarLineStyleDisplay(style);
	}

	private void UpdateToolbarLineStyleFromSelection()
	{
		RelationshipLineStyle style = diagramCanvas.SelectedRelationship?.LineStyle ?? diagramCanvas.DefaultLineStyle;
		UpdateToolbarLineStyleDisplay(style);
	}

	private void UpdateToolbarLineStyleDisplay(RelationshipLineStyle style)
	{
		if (tsLineStyle == null)
		{
			return;
		}
		tsLineStyle.Text = style switch
		{
			RelationshipLineStyle.Curved => "곡선",
			RelationshipLineStyle.Orthogonal => "꺾은선",
			_ => "직선"
		};
		tsLineStyle.Image = IconProvider.Get(GetLineStyleIconName(style), 16);
		tsLineStraight.Checked = style == RelationshipLineStyle.Straight;
		tsLineCurved.Checked = style == RelationshipLineStyle.Curved;
		tsLineOrthogonal.Checked = style == RelationshipLineStyle.Orthogonal;
	}

	private static readonly string[] AnalysisColumnHeaders = { "수준", "심각도", "테이블", "문제 컬럼", "문제", "권장" };

	private int _analysisSortColumn = -1;

	private SortOrder _analysisSortOrder = SortOrder.None;

	private bool _analysisColumnsUserSized;

	private int[] _analysisColumnWidths;

	private bool _suppressAnalysisColumnWidthEvents;

	private Analysis.NormalizationLevel _normLevel = Analysis.NormalizationLevel.NF1;
	private ToolStrip _normLevelStrip;
	private ToolStripButton _btnNf1, _btnNf2, _btnNf3, _btnBcnf;

	private void ConfigureAnalysisPanel()
	{
		lblAnalysisSummary = new Label
		{
			Dock = DockStyle.Top,
			AutoSize = false,
			Height = 48,
			Padding = new Padding(10, 8, 10, 4),
			TextAlign = ContentAlignment.TopLeft,
			Text = "정규화 분석 결과가 여기에 표시됩니다.",
			ForeColor = ModernTheme.TextSecondary,
			BackColor = ModernTheme.SidebarBackground,
			Font = ModernTheme.UiFontSmall
		};
		// Normalization level selector toolbar
		_normLevelStrip = new ToolStrip
		{
			GripStyle = ToolStripGripStyle.Hidden,
			BackColor = ModernTheme.SidebarBackground,
			Dock = DockStyle.Top,
			Padding = new Padding(4, 2, 4, 2),
			AutoSize = true,
			ShowItemToolTips = true
		};
		_btnNf1  = MakeNfBtn("1NF",  Analysis.NormalizationLevel.NF1,
			"1정규화(1NF): 항상 선택 가능");
		_btnNf2  = MakeNfBtn("2NF",  Analysis.NormalizationLevel.NF2,
			"2정규화(2NF): 1NF 오류가 없을 때만 선택 가능");
		_btnNf3  = MakeNfBtn("3NF",  Analysis.NormalizationLevel.NF3,
			"3정규화(3NF): 2NF 오류가 없을 때만 선택 가능");
		_btnBcnf = MakeNfBtn("BCNF", Analysis.NormalizationLevel.BCNF,
			"보이스코드 정규화(BCNF): 3NF 오류가 없을 때만 선택 가능");
		_btnNf1.Checked = true;
		_normLevelStrip.Items.Add(new ToolStripLabel("검사 수준:") { ForeColor = ModernTheme.TextSecondary });
		_normLevelStrip.Items.Add(_btnNf1);
		_normLevelStrip.Items.Add(_btnNf2);
		_normLevelStrip.Items.Add(_btnNf3);
		_normLevelStrip.Items.Add(_btnBcnf);

		tabAnalysis.Controls.Clear();
		listViewAnalysis.Dock = DockStyle.Fill;
		tabAnalysis.Controls.Add(listViewAnalysis);
		tabAnalysis.Controls.Add(lblAnalysisSummary);
		tabAnalysis.Controls.Add(_normLevelStrip);
		listViewAnalysis.Columns.Clear();
		foreach (string header in AnalysisColumnHeaders)
		{
			listViewAnalysis.Columns.Add(header);
		}
		listViewAnalysis.ShowGroups = true;
		listViewAnalysis.HeaderStyle = ColumnHeaderStyle.Clickable;
		listViewAnalysis.SelectedIndexChanged += ListViewAnalysis_SelectedIndexChanged;
		listViewAnalysis.DoubleClick += ListViewAnalysis_DoubleClick;
		listViewAnalysis.ColumnClick += ListViewAnalysis_ColumnClick;
		listViewAnalysis.ColumnWidthChanging += ListViewAnalysis_ColumnWidthChanging;
		listViewAnalysis.ColumnWidthChanged += ListViewAnalysis_ColumnWidthChanged;
		tabAnalysis.Resize += (_, _) =>
		{
			UpdateAnalysisSummaryLayout();
			ApplyAnalysisColumnLayout(fillOnly: true);
		};
	}

	private ToolStripButton MakeNfBtn(string label, Analysis.NormalizationLevel level, string tip)
	{
		var btn = new ToolStripButton(label)
		{
			CheckOnClick = false,
			ToolTipText = tip,
			Margin = new Padding(1, 0, 1, 0),
			Padding = new Padding(4, 1, 4, 1),
			Font = ModernTheme.UiFontSmall
		};
		btn.Click += (_, _) => TrySetNormLevel(level);
		return btn;
	}

	private void TrySetNormLevel(Analysis.NormalizationLevel requested)
	{
		// Check prerequisite: run previous level and check for errors
		if (requested > Analysis.NormalizationLevel.NF1)
		{
			var prereqLevel = (Analysis.NormalizationLevel)((int)requested - 1);
			var prereqIssues = Analysis.NormalizationAnalyzer.AnalyzeLevel(diagramCanvas.Schema, prereqLevel);
			bool prereqHasErrors = prereqIssues.Any(i =>
				i.Severity == Analysis.IssueSeverity.Error &&
				i.Level == prereqLevel);
			if (prereqHasErrors)
			{
				string levelName = prereqLevel switch
				{
					Analysis.NormalizationLevel.NF1 => "1NF",
					Analysis.NormalizationLevel.NF2 => "2NF",
					Analysis.NormalizationLevel.NF3 => "3NF",
					_ => prereqLevel.ToString()
				};
				statusLabel.Text = $"{levelName} 오류를 먼저 해결해야 더 높은 정규화 수준을 선택할 수 있습니다.";
				return;
			}
		}
		_normLevel = requested;
		UpdateNfLevelButtons();
		RefreshNormalizationAnalysis(focusTab: false);
	}

	private void UpdateNfLevelButtons()
	{
		if (_btnNf1 == null) return;
		foreach (var (btn, lvl) in new[] {
			(_btnNf1, Analysis.NormalizationLevel.NF1),
			(_btnNf2, Analysis.NormalizationLevel.NF2),
			(_btnNf3, Analysis.NormalizationLevel.NF3),
			(_btnBcnf, Analysis.NormalizationLevel.BCNF) })
		{
			btn.Checked = lvl == _normLevel;
			btn.Font = lvl == _normLevel
				? new Font(ModernTheme.UiFontSmall, FontStyle.Bold)
				: ModernTheme.UiFontSmall;
		}
	}

	private void ListViewAnalysis_ColumnClick(object sender, ColumnClickEventArgs e)
	{
		if (_analysisSortColumn == e.Column)
		{
			_analysisSortOrder = _analysisSortOrder == SortOrder.Ascending ? SortOrder.Descending : SortOrder.Ascending;
		}
		else
		{
			_analysisSortColumn = e.Column;
			_analysisSortOrder = SortOrder.Ascending;
		}

		listViewAnalysis.ListViewItemSorter = new AnalysisListViewItemComparer(_analysisSortColumn, _analysisSortOrder);
		listViewAnalysis.Sort();
	}

	private void ListViewAnalysis_ColumnWidthChanging(object sender, ColumnWidthChangingEventArgs e)
	{
		int minWidth = MeasureAnalysisColumnHeaderWidth(AnalysisColumnHeaders[e.ColumnIndex]);
		if (e.NewWidth < minWidth)
		{
			e.NewWidth = minWidth;
		}
	}

	private void ListViewAnalysis_ColumnWidthChanged(object sender, ColumnWidthChangedEventArgs e)
	{
		if (_suppressAnalysisColumnWidthEvents)
		{
			return;
		}

		_analysisColumnsUserSized = true;
		SaveAnalysisColumnWidths();
	}

	private int MeasureAnalysisColumnHeaderWidth(string headerText)
	{
		const int padding = 20;
		Size size = TextRenderer.MeasureText(headerText, listViewAnalysis.Font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
		return size.Width + padding;
	}

	private void SaveAnalysisColumnWidths()
	{
		_analysisColumnWidths = new int[listViewAnalysis.Columns.Count];
		for (int i = 0; i < listViewAnalysis.Columns.Count; i++)
		{
			_analysisColumnWidths[i] = listViewAnalysis.Columns[i].Width;
		}
	}

	private int GetAnalysisAvailableWidth()
	{
		int available = listViewAnalysis.ClientSize.Width;
		if (available <= 0)
		{
			return 0;
		}

		if (listViewAnalysis.Items.Count > 0)
		{
			int itemHeight = Math.Max(18, listViewAnalysis.GetItemRect(0).Height);
			int visibleRows = Math.Max(1, listViewAnalysis.ClientSize.Height / itemHeight);
			if (listViewAnalysis.Items.Count > visibleRows)
			{
				available -= SystemInformation.VerticalScrollBarWidth;
			}
		}

		return available;
	}

	private void ApplyAnalysisColumnLayout(bool fillOnly = false)
	{
		if (listViewAnalysis.Columns.Count < AnalysisColumnHeaders.Length)
		{
			return;
		}

		int available = GetAnalysisAvailableWidth();
		if (available <= 0)
		{
			return;
		}

		_suppressAnalysisColumnWidthEvents = true;
		try
		{
			if (_analysisColumnsUserSized && _analysisColumnWidths != null)
			{
				ApplySavedAnalysisColumnWidths(available);
			}
			else if (!fillOnly)
			{
				ApplyDefaultAnalysisColumnWidths(available);
			}
			else
			{
				ExpandLastAnalysisColumnToFill(available);
			}
		}
		finally
		{
			_suppressAnalysisColumnWidthEvents = false;
		}

		UpdateAnalysisSummaryLayout();
	}

	private void ApplyDefaultAnalysisColumnWidths(int available)
	{
		int[] minWidths = AnalysisColumnHeaders.Select(MeasureAnalysisColumnHeaderWidth).ToArray();
		int minTotal = minWidths.Sum();
		for (int i = 0; i < minWidths.Length; i++)
		{
			listViewAnalysis.Columns[i].Width = minWidths[i];
		}

		if (available <= minTotal)
		{
			SaveAnalysisColumnWidths();
			return;
		}

		int extra = available - minTotal;
		int problemExtra = extra * 55 / 100;
		listViewAnalysis.Columns[4].Width = minWidths[4] + problemExtra;
		listViewAnalysis.Columns[5].Width = minWidths[5] + (extra - problemExtra);
		SaveAnalysisColumnWidths();
	}

	private void ApplySavedAnalysisColumnWidths(int available)
	{
		int columnCount = Math.Min(_analysisColumnWidths.Length, listViewAnalysis.Columns.Count);
		for (int i = 0; i < columnCount; i++)
		{
			int minWidth = MeasureAnalysisColumnHeaderWidth(AnalysisColumnHeaders[i]);
			listViewAnalysis.Columns[i].Width = Math.Max(minWidth, _analysisColumnWidths[i]);
		}

		ExpandLastAnalysisColumnToFill(available);
	}

	private void ExpandLastAnalysisColumnToFill(int available)
	{
		if (listViewAnalysis.Columns.Count == 0)
		{
			return;
		}

		int total = 0;
		for (int i = 0; i < listViewAnalysis.Columns.Count; i++)
		{
			total += listViewAnalysis.Columns[i].Width;
		}

		int lastIndex = listViewAnalysis.Columns.Count - 1;
		if (total < available)
		{
			listViewAnalysis.Columns[lastIndex].Width += available - total;
		}
		else if (total > available)
		{
			int overflow = total - available;
			int minWidth = MeasureAnalysisColumnHeaderWidth(AnalysisColumnHeaders[lastIndex]);
			listViewAnalysis.Columns[lastIndex].Width = Math.Max(minWidth, listViewAnalysis.Columns[lastIndex].Width - overflow);
		}

		SaveAnalysisColumnWidths();
	}

	private void AdjustAnalysisColumnWidths()
	{
		ApplyAnalysisColumnLayout();
	}

	private void UpdateAnalysisSummaryLayout()
	{
		if (lblAnalysisSummary == null || tabAnalysis == null)
		{
			return;
		}

		int width = Math.Max(120, tabAnalysis.ClientSize.Width - lblAnalysisSummary.Padding.Horizontal);
		Size textSize = TextRenderer.MeasureText(lblAnalysisSummary.Text, lblAnalysisSummary.Font, new Size(width, int.MaxValue), TextFormatFlags.WordBreak | TextFormatFlags.Left);
		lblAnalysisSummary.Height = Math.Max(40, textSize.Height + lblAnalysisSummary.Padding.Vertical + 4);
	}

	private void ListViewAnalysis_SelectedIndexChanged(object sender, EventArgs e)
	{
		if (listViewAnalysis.SelectedItems.Count == 0)
		{
			diagramCanvas.ClearNormalizationHighlight();
			return;
		}

		NavigateToSelectedAnalysisIssue();
	}

	private void ListViewAnalysis_DoubleClick(object sender, EventArgs e)
	{
		if (listViewAnalysis.SelectedItems.Count == 0 || listViewAnalysis.SelectedItems[0].Tag is not NormalizationIssue issue)
		{
			return;
		}

		NormalizationIssueDialog.Show(this, issue);
	}

	private void NavigateToSelectedAnalysisIssue()
	{
		if (listViewAnalysis.SelectedItems.Count == 0 || listViewAnalysis.SelectedItems[0].Tag is not NormalizationIssue issue)
		{
			return;
		}

		DbTable table = diagramCanvas.Schema.Tables.FirstOrDefault((DbTable t) => string.Equals(t.Name, issue.Table, StringComparison.OrdinalIgnoreCase));
		if (table == null)
		{
			return;
		}

		diagramCanvas.ShowNormalizationIssue(table, ParseAffectedColumnNames(issue.AffectedColumns));
		RefreshPropertyGrid();
	}

	private static IEnumerable<string> ParseAffectedColumnNames(string affectedColumns)
	{
		if (string.IsNullOrWhiteSpace(affectedColumns) || string.Equals(affectedColumns, "-", StringComparison.Ordinal))
		{
			yield break;
		}

		if (affectedColumns.Contains("테이블 전체", StringComparison.Ordinal))
		{
			yield break;
		}

		string[] parts = affectedColumns.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
		foreach (string part in parts)
		{
			yield return part;
		}
	}

	private static readonly string[] IndexAdvisorColumnHeaders = ["테이블", "컬럼", "분류", "이유", "권고 사항"];

	private void ConfigureIndexAdvisorPanel()
	{
		tabIndexAdvisor.Controls.Clear();
		listViewIndexAdvisor.Dock = DockStyle.Fill;
		tabIndexAdvisor.Controls.Add(listViewIndexAdvisor);
		listViewIndexAdvisor.Columns.Clear();
		foreach (string header in IndexAdvisorColumnHeaders)
			listViewIndexAdvisor.Columns.Add(header, 100);
		listViewIndexAdvisor.FullRowSelect = true;
		listViewIndexAdvisor.GridLines = true;
	}

	private void RefreshIndexAdvisorAnalysis()
	{
		DbSchema schema = diagramCanvas.Schema;
		IReadOnlyList<Analysis.IndexSuggestion> suggestions = Analysis.IndexAdvisor.Analyze(schema);
		listViewIndexAdvisor.BeginUpdate();
		listViewIndexAdvisor.Items.Clear();
		foreach (var s in suggestions)
		{
			string kindLabel = s.Kind switch
			{
				Analysis.IndexSuggestionKind.AlreadyIndexed => "✓ 인덱싱됨",
				Analysis.IndexSuggestionKind.Required       => "● 필수",
				Analysis.IndexSuggestionKind.Recommended    => "◆ 권장",
				Analysis.IndexSuggestionKind.Consider       => "○ 검토",
				_ => s.Kind.ToString(),
			};
			var item = new ListViewItem([s.Table, s.Column, kindLabel, s.Reason, s.Recommendation]);
			item.ForeColor = s.Kind switch
			{
				Analysis.IndexSuggestionKind.AlreadyIndexed => Color.FromArgb(80, 160, 80),
				Analysis.IndexSuggestionKind.Required       => Color.FromArgb(220, 60, 60),
				Analysis.IndexSuggestionKind.Recommended    => Color.FromArgb(200, 120, 20),
				Analysis.IndexSuggestionKind.Consider       => ModernTheme.TextSecondary,
				_ => ModernTheme.TextPrimary,
			};
			listViewIndexAdvisor.Items.Add(item);
		}
		listViewIndexAdvisor.EndUpdate();
		// Auto-size first three columns; let Reason fill
		for (int i = 0; i < 3; i++)
			listViewIndexAdvisor.Columns[i].Width = -2;
	}

	private void ApplyRightPanelIcons()
	{
		ImageList rightTabImages = new ImageList
		{
			ColorDepth = ColorDepth.Depth32Bit,
			ImageSize = new Size(16, 16)
		};
		rightTabImages.Images.Add("Structure", IconProvider.Get("Structure", 16));
		rightTabImages.Images.Add("Analyze", IconProvider.Get("Analyze", 16));
		rightTabImages.Images.Add("IndexAdvisor", IconProvider.Get("IndexAdvisor", 16));
		tabControlRight.ImageList = rightTabImages;
		tabTreeView.ImageKey = "Structure";
		tabAnalysis.ImageKey = "Analyze";
		tabIndexAdvisor.ImageKey = "IndexAdvisor";

		btnPropertySortCategory.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
		btnPropertySortCategory.Image = IconProvider.Get("SortCategory", 16);
		btnPropertySortCategory.TextImageRelation = TextImageRelation.ImageBeforeText;

		btnPropertySortAlphabetical.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
		btnPropertySortAlphabetical.Image = IconProvider.Get("SortAlphabetical", 16);
		btnPropertySortAlphabetical.TextImageRelation = TextImageRelation.ImageBeforeText;
	}

	private static void ConfigureToolboxButton(Button button, string iconName, string caption)
	{
		button.Image = IconProvider.Get(iconName, 20);
		button.Text = "";             // icon-only; tooltip carries the label
		button.ImageAlign = ContentAlignment.MiddleCenter;
		button.TextImageRelation = TextImageRelation.Overlay;
		button.Padding = new Padding(0);
		ModernTheme.StyleToolboxButton(button);
	}

	private void ApplyIcons()
	{
		btnTsNew.Image = IconProvider.Get("New", 22);
		btnTsOpen.Image = IconProvider.Get("Open", 22);
		btnTsOpenDatabase.Image = IconProvider.Get("OpenDbFile", 22);
		btnTsSave.Image = IconProvider.Get("Save", 22);
		btnTsSaveAs.Image = IconProvider.Get("SaveAs", 22);
		if (tsExport != null)
		{
			tsExport.Image = IconProvider.Get("Export", 22);
			ApplyExportDropdownIcons(tsExport.DropDownItems);
		}
		btnTsAddTable.Image = IconProvider.Get("AddTable", 22);
		btnTsAddRel.Image = IconProvider.Get("AddRelation", 22);
		btnTsZoomIn.Image = IconProvider.Get("ZoomIn", 22);
		btnTsZoomOut.Image = IconProvider.Get("ZoomOut", 22);
		btnTsFitAll.Image = IconProvider.Get("FitAll", 22);
		UpdateRightPanelToggleUi();
		btnTsAnalyze.Image = IconProvider.Get("Analyze", 22);
		btnTsWriteReport.Image = IconProvider.Get("Report", 22);
		if (tsSample != null)
		{
			tsSample.Image = IconProvider.Get("Sample", 22);
			ApplySampleDropdownIcons(tsSample.DropDownItems);
		}
		tsDbType.Image = IconProvider.Get("SQLite", 22);
		btnTsAbout.Image = IconProvider.Get("About", 22);
		tsDbPostgres.Image = IconProvider.Get("PostgreSQL");
		tsDbMySQL.Image = IconProvider.Get("MySQL");
		tsDbMariaDB.Image = IconProvider.Get("MariaDB");
		tsDbSQLite.Image = IconProvider.Get("SQLite");
		tsDbSqlServer.Image = IconProvider.Get("SqlServer");
		tsDbVectorDb.Image = IconProvider.Get("FAISS");
		menuNew.Image = IconProvider.Get("New");
		menuOpen.Image = IconProvider.Get("Open");
		menuOpenDatabase.Image = IconProvider.Get("OpenDbFile");
		menuSave.Image = IconProvider.Get("Save");
		menuSaveAs.Image = IconProvider.Get("SaveAs");
		menuRecent.Image = IconProvider.Get("Recent");
		menuExport.Image = IconProvider.Get("Export");
		menuExportSql.Image = IconProvider.Get("ExportSql");
		menuExportJson.Image = IconProvider.Get("Export");
		if (menuSample != null)
			menuSample.Image = IconProvider.Get("Sample");
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
		menuDbVectorDb.Image = IconProvider.Get("FAISS");
		menuAnalyze.Image = IconProvider.Get("Analyze");
		menuWriteReport.Image = IconProvider.Get("Report");
		menuAbout.Image = IconProvider.Get("About");
		ApplyRightPanelIcons();
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
		btnZoomIn.Image = IconProvider.Get("ZoomIn", 20);
		btnZoomIn.Text = "";
		btnZoomIn.ImageAlign = ContentAlignment.MiddleCenter;
		btnZoomOut.Image = IconProvider.Get("ZoomOut", 20);
		btnZoomOut.Text = "";
		btnZoomOut.ImageAlign = ContentAlignment.MiddleCenter;
		btnFitAll.Image = IconProvider.Get("FitAll", 20);
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
			RefreshTreeView();
			RefreshStatus();
			UpdateTitle();
		};
		diagramCanvas.SelectionChanged += delegate
		{
			RefreshPropertyGrid();
			UpdateToolbarLineStyleFromSelection();
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
		tsDbVectorDb.Click += delegate
		{
			SetDbType(DbTargetType.VectorDb);
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
		menuDbVectorDb.Click += delegate
		{
			SetDbType(DbTargetType.VectorDb);
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
		ConfigurePropertySortBar();
		splitRightPanel.SplitterMoving += SplitPanel_SplitterMoving;
		splitRightPanel.SplitterMoved += SplitPanel_SplitterMoved;
		base.FormClosing += MainForm_FormClosing;
		base.KeyPreview = true;
		base.KeyDown += MainForm_KeyDown;
	}

	private void ConfigureSampleMenus()
	{
		menuSample = new ToolStripMenuItem
		{
			Name = "menuSample",
			Text = "Sample 생성(&S)",
			ToolTipText = "DB별 OnlineShop Template 파일을 생성합니다"
		};
		AddSampleMenuItems(menuSample.DropDownItems);

		int fileIdx = menuFile.DropDownItems.IndexOf(sepFile4);
		menuFile.DropDownItems.Insert(fileIdx, menuSample);

		tsSepSample = new ToolStripSeparator { Name = "tsSepSample" };
		tsSample = new ToolStripDropDownButton
		{
			Name = "tsSample",
			Text = "Sample",
			DisplayStyle = ToolStripItemDisplayStyle.Image,
			ToolTipText = "DB별 Sample 파일 생성"
		};
		AddSampleMenuItems(tsSample.DropDownItems);

		int tsIdx = toolStrip.Items.IndexOf(tsSep4);
		toolStrip.Items.Insert(tsIdx, tsSepSample);
		toolStrip.Items.Insert(tsIdx + 1, tsSample);
	}

	private void AddSampleMenuItems(ToolStripItemCollection items)
	{
		items.Add(CreateSampleMenuItem("전체 Sample 생성...", "Sample", "모든 DB 형식의 OnlineShop Sample을 생성합니다", GenerateAllSamples));
		items.Add(new ToolStripSeparator());
		items.Add(CreateSampleMenuItem("SQLite Sample...", "SQLite", "SQLite DB Sample 파일을 생성합니다", () => GenerateDbSample(DbTargetType.SQLite)));
		items.Add(CreateSampleMenuItem("PostgreSQL Sample...", "PostgreSQL", "PostgreSQL DDL Sample 파일을 생성합니다", () => GenerateDbSample(DbTargetType.PostgreSQL)));
		items.Add(CreateSampleMenuItem("MySQL Sample...", "MySQL", "MySQL DDL Sample 파일을 생성합니다", () => GenerateDbSample(DbTargetType.MySQL)));
		items.Add(CreateSampleMenuItem("MariaDB Sample...", "MariaDB", "MariaDB DDL Sample 파일을 생성합니다", () => GenerateDbSample(DbTargetType.MariaDB)));
		items.Add(CreateSampleMenuItem("SQL Server Sample...", "SqlServer", "SQL Server DDL 및 MDF Sample 파일을 생성합니다", () => GenerateDbSample(DbTargetType.SqlServer)));
		items.Add(CreateSampleMenuItem("Access Sample...", "Access", "Access ACCDB Sample 파일을 생성합니다", GenerateAccessSample));
	}

	private ToolStripMenuItem CreateSampleMenuItem(string text, string iconName, string tooltip, Action handler)
	{
		var item = new ToolStripMenuItem(text)
		{
			Image = IconProvider.Get(iconName),
			ToolTipText = tooltip
		};
		item.Click += (_, _) => handler();
		return item;
	}

	private static void ApplySampleDropdownIcons(ToolStripItemCollection items)
	{
		string[] icons = { "Sample", null, "SQLite", "PostgreSQL", "MySQL", "MariaDB", "SqlServer", "Access" };
		int iconIdx = 0;
		foreach (ToolStripItem item in items)
		{
			if (item is ToolStripSeparator)
			{
				iconIdx++;
				continue;
			}
			if (iconIdx < icons.Length && icons[iconIdx] != null)
				item.Image = IconProvider.Get(icons[iconIdx], 22);
			iconIdx++;
		}
	}

	private void GenerateAllSamples()
	{
		RunSampleGeneration(SampleDbGenerator.GenerateAll);
	}

	private void GenerateDbSample(DbTargetType target)
	{
		RunSampleGeneration(dir => SampleDbGenerator.Generate(target, dir));
	}

	private void GenerateAccessSample()
	{
		RunSampleGeneration(SampleDbGenerator.GenerateAccess);
	}

	private void RunSampleGeneration(Func<string, SampleGenerationResult> generate)
	{
		using var dlg = new FolderBrowserDialog
		{
			Description = "Template 파일을 저장할 폴더를 선택하세요.",
			SelectedPath = SampleDbGenerator.ResolveTemplateDirectory(),
			UseDescriptionForTitle = true
		};
		if (dlg.ShowDialog(this) != DialogResult.OK)
			return;

		try
		{
			SampleGenerationResult result = generate(dlg.SelectedPath);
			statusLabel.Text = result.Message;
			if (result.CreatedFiles.Count > 0)
			{
				OperationCompleteDialog.ShowSavedMany(this,
					result.Success ? "Sample 생성 완료" : "Sample 생성 경고",
					result.CreatedFiles,
					result.Message);
			}
			else
			{
				if (result.Success)
				{
					OperationCompleteDialog.ShowSaved(this, "Sample 생성 완료", dlg.SelectedPath, result.Message);
				}
				else
				{
					OperationCompleteDialog.ShowFailed(this, "Sample 생성 실패", dlg.SelectedPath, result.Message);
				}
			}
		}
		catch (Exception ex)
		{
			OperationCompleteDialog.ShowFailed(this, "Sample 생성 실패", dlg.SelectedPath, "Sample 파일을 생성하지 못했습니다.", ex);
			statusLabel.Text = "Sample 생성 실패";
		}
	}

	private void InitializeEmptyProject()
	{
		diagramCanvas.LoadSchema(new DbSchema(), notifyChange: false);
		_currentFilePath = null;
		MarkDocumentClean();
		RefreshAll();
		UpdateDbTypeIndicator(diagramCanvas.Schema.TargetDb);
		statusLabel.Text = "새 프로젝트";
	}

	private void NewSchema()
	{
		if (ConfirmDiscard())
		{
			InitializeEmptyProject();
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
			Filter = DbFileFormatDetector.OpenFileFilter,
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
				ErrorDialog.Show(this, "지원하지 않는 형식", "지원하지 않는 DB 파일 형식입니다.\n\n지원 형식: SQLite(.db), SQLCipher, Vector Index(Faiss/hnswlib), SQL DDL(.sql), SQL Server(.mdf), Access(.mdb/.accdb)");
				return;
			}
			DbSchema dbSchema = dbFileFormat == DbFileFormat.Sqlite
				? ImportSqliteDatabase(path)
				: DatabaseFileImporter.Import(path);
			diagramCanvas.LoadSchema(dbSchema, notifyChange: false);
			_currentFilePath = null;
			UpdateDbTypeIndicator(dbSchema.TargetDb);
			RefreshAll();
			diagramCanvas.FitAll();
			UpdateViewportUi();
			string displayName = DbFileFormatDetector.GetDisplayName(dbFileFormat);
			statusLabel.Text = $"{displayName} 가져오기 완료: {Path.GetFileName(path)}  (테이블 {dbSchema.Tables.Count}개, 관계 {dbSchema.Relationships.Count}개)";
		}
		catch (OperationCanceledException)
		{
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "DB 파일 열기 오류", ex, "데이터베이스 구조를 읽을 수 없습니다.\n" + path);
		}
	}

	private DbSchema ImportSqliteDatabase(string path)
	{
		string password = null;
		while (true)
		{
			try
			{
				return SqliteSchemaImporter.Import(path, password);
			}
			catch (SqlitePasswordRequiredException)
			{
				if (!SqlitePasswordDialog.TryPrompt(this, path, null, out password))
					throw new OperationCanceledException();
			}
			catch (SqlitePasswordRejectedException)
			{
				if (!SqlitePasswordDialog.TryPrompt(this, path, "암호가 올바르지 않습니다.", out password))
					throw new OperationCanceledException();
			}
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
		TryLoadFile(path, showErrorOnFailure: true);
	}

	private bool TryLoadFile(string path, bool showErrorOnFailure)
	{
		try
		{
			DbSchema dbSchema = SchemaSerializer.Load(path);
			diagramCanvas.LoadSchema(dbSchema, notifyChange: false);
			_currentFilePath = path;
			MarkDocumentClean();
			RecentFilesManager.Push(path);
			RememberOpenDirectory(path);
			UpdateDbTypeIndicator(dbSchema.TargetDb);
			RefreshAll();
			statusLabel.Text = "불러오기 완료: " + Path.GetFileName(path);
			return true;
		}
		catch (Exception ex)
		{
			RecentFilesManager.Remove(path);
			if (showErrorOnFailure)
			{
				ErrorDialog.Show(this, "파일 열기 오류", ex, "파일을 열 수 없습니다.\n" + path);
			}

			return false;
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
			MarkDocumentClean();
			RecentFilesManager.Push(path);
			UpdateTitle();
			NotifyExportSucceeded("저장 완료", path, "프로젝트 파일을 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("저장 실패", path, ex);
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

		try
		{
			DbTargetType targetDb = diagramCanvas.Schema.TargetDb;
			string[] types = DataTypeProvider.GetTypes(targetDb);
			DbColumn column = new DbColumn
			{
				Name = $"col_{table.Columns.Count + 1}",
				DataType = types.Length > 0 ? types[0] : "TEXT",
				IsNullable = true
			};
			if (DataTypeProvider.TypeHasLength(column.DataType))
				column.Length = targetDb == DbTargetType.VectorDb ? 128 : 255;

			using ColumnEditDialog columnEditDialog = new ColumnEditDialog(column, targetDb);
			if (columnEditDialog.ShowDialog(this) == DialogResult.OK)
			{
				table.Columns.Add(columnEditDialog.Result);
				RefreshAll();
			}
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "컬럼 추가 오류", ex, "컬럼을 추가할 수 없습니다.");
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
			TargetTableId = diagramCanvas.Schema.Tables[1].Id,
			LineStyle = diagramCanvas.DefaultLineStyle
		};
		using RelationshipDialog relationshipDialog = new RelationshipDialog(rel, diagramCanvas.Schema);
		if (relationshipDialog.ShowDialog(this) == DialogResult.OK)
		{
			diagramCanvas.Schema.Relationships.Add(relationshipDialog.Result);
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
			RefreshAll();
		}
	}

	private void DeleteColumn(DbTable table, DbColumn column)
	{
		if (MessageBox.Show("컬럼 '" + column.Name + "'을(를) 삭제하시겠습니까?", "컬럼 삭제", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
		{
			diagramCanvas.Schema.RemoveColumn(table.Id, column.Id);
			diagramCanvas.NotifyColumnRemoved(column);
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
		ToolStripSeparator sortSeparator = new ToolStripSeparator();
		ToolStripMenuItem miSortCategory = ModernTheme.CreateMenuItem("분류별 정렬", "SortCategory");
		ToolStripMenuItem miSortAlphabetical = ModernTheme.CreateMenuItem("사전순 정렬", "SortAlphabetical");
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
				RefreshAll();
			}
		};
		miSortCategory.Click += delegate
		{
			ApplyPropertySortMode(categorized: true);
		};
		miSortAlphabetical.Click += delegate
		{
			ApplyPropertySortMode(categorized: false);
		};
		contextMenuStrip.Items.AddRange(miEditCol, miAddCol, miDeleteCol, toolStripSeparator, miEditTable, miDeleteTable, sortSeparator, miSortCategory, miSortAlphabetical);
		contextMenuStrip.Opening += delegate
		{
			(DbTable, DbColumn)? columnContext = GetColumnContext();
			DbTable tableContext = GetTableContext();
			miEditCol.Enabled = columnContext.HasValue;
			miDeleteCol.Enabled = columnContext.HasValue;
			miAddCol.Enabled = tableContext != null;
			miEditTable.Enabled = tableContext != null;
			miDeleteTable.Enabled = tableContext != null;
			miSortCategory.Checked = !propertyGrid.IsAlphabeticalWithinCategories;
			miSortAlphabetical.Checked = propertyGrid.IsAlphabeticalWithinCategories;
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
			rel.LineStyle = relationshipDialog.Result.LineStyle;
			rel.RoutePoints = relationshipDialog.Result.RoutePoints?.Select((RelationshipPoint p) => p.Clone()).ToList() ?? new List<RelationshipPoint>();
			rel.SourceTableId = relationshipDialog.Result.SourceTableId;
			rel.SourceColumnId = relationshipDialog.Result.SourceColumnId;
			rel.TargetTableId = relationshipDialog.Result.TargetTableId;
			rel.TargetColumnId = relationshipDialog.Result.TargetColumnId;
			RefreshAll();
		}
	}

	private void SetDbType(DbTargetType db)
	{
		diagramCanvas.Schema.TargetDb = db;
		UpdateDbTypeIndicator(db);
		RefreshAll();
		statusLabel.Text = $"데이터베이스 종류: {DbTargetTypeHelper.GetDisplayName(db)}";
	}

	private void UpdateDbTypeIndicator(DbTargetType db)
	{
		string displayName = DbTargetTypeHelper.GetDisplayName(db);
		string iconKey = DbTargetTypeHelper.GetIconKey(db);
		tsDbType.Text = displayName;
		tsDbType.Image = IconProvider.Get(iconKey, 22);
		menuDbType.Image = IconProvider.Get(iconKey);
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
		RefreshNormalizationAnalysis(focusTab: true);
	}

	private void RefreshNormalizationAnalysis(bool focusTab = false)
	{
		DbSchema schema = diagramCanvas.Schema;
		IReadOnlyList<NormalizationIssue> issues = NormalizationAnalyzer.AnalyzeLevel(schema, _normLevel);
		listViewAnalysis.BeginUpdate();
		listViewAnalysis.Items.Clear();
		listViewAnalysis.Groups.Clear();
		if (schema.Tables.Count == 0)
		{
			lblAnalysisSummary.Text = "테이블이 없어 정규화 검사를 수행할 수 없습니다.";
			lblAnalysisSummary.ForeColor = ModernTheme.TextMuted;
			listViewAnalysis.EndUpdate();
			UpdateAnalysisSummaryLayout();
			if (focusTab)
			{
				tabControlRight.SelectedTab = tabAnalysis;
			}
			return;
		}
		Dictionary<NormalizationLevel, ListViewGroup> groups = new Dictionary<NormalizationLevel, ListViewGroup>();
		foreach (NormalizationIssue issue in issues.OrderBy((NormalizationIssue i) => i.Severity).ThenBy((NormalizationIssue i) => i.Level).ThenBy((NormalizationIssue i) => i.Table, StringComparer.OrdinalIgnoreCase))
		{
			if (!groups.TryGetValue(issue.Level, out ListViewGroup group))
			{
				group = new ListViewGroup(NormalizationLabels.GetLevelGroupTitle(issue.Level), HorizontalAlignment.Left);
				listViewAnalysis.Groups.Add(group);
				groups[issue.Level] = group;
			}
			ListViewItem listViewItem = new ListViewItem(NormalizationLabels.GetLevelLabel(issue.Level))
			{
				Group = groups[issue.Level],
				Tag = issue
			};
			listViewItem.SubItems.Add(NormalizationLabels.GetSeverityLabel(issue.Severity));
			listViewItem.SubItems.Add(issue.Table);
			listViewItem.SubItems.Add(string.IsNullOrWhiteSpace(issue.AffectedColumns) ? "-" : issue.AffectedColumns);
			listViewItem.SubItems.Add(issue.Message);
			listViewItem.SubItems.Add(issue.Hint);
			NormalizationLabels.ApplyListItemStyle(listViewItem, issue.Severity);
			listViewAnalysis.Items.Add(listViewItem);
		}
		int errorCount = issues.Count((NormalizationIssue i) => i.Severity == IssueSeverity.Error);
		int warningCount = issues.Count((NormalizationIssue i) => i.Severity == IssueSeverity.Warning);
		int infoCount = issues.Count((NormalizationIssue i) => i.Severity == IssueSeverity.Info);
		string levelLabel = _normLevel switch
		{
			Analysis.NormalizationLevel.NF1  => "1NF",
			Analysis.NormalizationLevel.NF2  => "1NF · 2NF",
			Analysis.NormalizationLevel.NF3  => "1NF · 2NF · 3NF",
			Analysis.NormalizationLevel.BCNF => "1NF · 2NF · 3NF · BCNF",
			_ => _normLevel.ToString()
		};
		if (issues.Count == 0)
		{
			lblAnalysisSummary.Text = $"정규화 검사: 문제 없음 ({levelLabel})";
			lblAnalysisSummary.ForeColor = ModernTheme.Success;
		}
		else
		{
			List<string> parts = new List<string>();
			if (errorCount > 0)
			{
				parts.Add($"오류 {errorCount}건");
			}
			if (warningCount > 0)
			{
				parts.Add($"경고 {warningCount}건");
			}
			if (infoCount > 0)
			{
				parts.Add($"정보 {infoCount}건");
			}
			lblAnalysisSummary.Text = "정규화 검사: " + string.Join(", ", parts) + " — 아래 목록에서 문제 위치를 확인하세요.";
			lblAnalysisSummary.ForeColor = (errorCount > 0) ? ModernTheme.Danger : ModernTheme.Warning;
		}
		listViewAnalysis.EndUpdate();
		if (_analysisSortColumn >= 0)
		{
			listViewAnalysis.ListViewItemSorter = new AnalysisListViewItemComparer(_analysisSortColumn, _analysisSortOrder);
			listViewAnalysis.Sort();
		}

		ApplyAnalysisColumnLayout();
		if (focusTab)
		{
			tabControlRight.SelectedTab = tabAnalysis;
			statusLabel.Text = ((issues.Count == 0) ? "정규화 검사 완료: 문제 없음" : $"정규화 검사 완료: {issues.Count}개 항목 발견");
		}
	}

	private void WriteReport()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema) + "_report";
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = ReportExporter.SaveFileFilter,
			Title = "보고서 저장",
			FileName = baseName,
			DefaultExt = "md",
			FilterIndex = 1
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			ReportFormat format = ReportExporter.GetFormatFromPath(saveFileDialog.FileName);
			using Bitmap diagramImage = diagramCanvas.RenderToImage(transparentBackground: false);
			ReportExporter.Export(diagramCanvas.Schema, saveFileDialog.FileName, format, _currentFilePath, diagramImage);
			string displayName = ReportExporter.GetDisplayName(format);
			NotifyExportSucceeded("보고서 작성 완료", saveFileDialog.FileName,
				$"{displayName} 보고서를 저장했습니다.",
				ReportExporter.OfferOpenInNotepad(format));
		}
		catch (Exception ex)
		{
			NotifyExportFailed("보고서 작성 실패", saveFileDialog.FileName, ex);
		}
	}

	private void RefreshTreeView()
	{
		treeViewSchema.BeginUpdate();
		treeViewSchema.Nodes.Clear();
		DbSchema schema = diagramCanvas.Schema;
		TreeNode treeNode = new TreeNode($"\ud83d\udce6 {schema.Name}  [{DbTargetTypeHelper.GetDisplayName(schema.TargetDb)}]")
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
			foreach (DbColumn col in table.Columns ?? Enumerable.Empty<DbColumn>())
			{
				if (col == null)
					continue;
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
		if (e.Node == null)
			return;

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
		if (e.Node == null)
			return;

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
	}

	private void SplitPanel_SplitterMoving(object sender, SplitterCancelEventArgs e)
	{
		propertyGrid.Invalidate(true);
	}

	private void ConfigurePropertySortBar()
	{
		ModernTheme.StyleToolStrip(propertySortBar);
		btnPropertySortCategory.Click += delegate
		{
			ApplyPropertySortMode(categorized: true);
		};
		btnPropertySortAlphabetical.Click += delegate
		{
			ApplyPropertySortMode(categorized: false);
		};
		UpdatePropertySortButtons();
	}

	private void ApplyPropertySortMode(bool categorized)
	{
		if (categorized)
		{
			propertyGrid.SetSortByCategory();
		}
		else
		{
			propertyGrid.SetSortAlphabetical();
		}

		UpdatePropertySortButtons();
	}

	private void UpdatePropertySortButtons()
	{
		if (btnPropertySortCategory == null || btnPropertySortAlphabetical == null)
		{
			return;
		}

		bool alphabetical = propertyGrid.IsAlphabeticalWithinCategories;
		btnPropertySortCategory.Checked = !alphabetical;
		btnPropertySortAlphabetical.Checked = alphabetical;
	}

	private void SplitPanel_SplitterMoved(object sender, SplitterEventArgs e)
	{
		propertyGrid.PerformLayout();
		propertyGrid.Invalidate(true);
	}

	private void PropertyGrid_PropertyValueChanged(object s, PropertyValueChangedEventArgs e)
	{
		if (propertyGrid.SelectedObject is DbRelationship rel && e.ChangedItem?.PropertyDescriptor?.Name == nameof(DbRelationship.LineStyle))
		{
			rel.RoutePoints?.Clear();
			UpdateToolbarLineStyleFromSelection();
		}
		diagramCanvas.Invalidate();
		RefreshTreeView();
		UpdateTitle();
	}

	private void RefreshAll()
	{
		RefreshTreeView();
		RefreshNormalizationAnalysis();
		RefreshIndexAdvisorAnalysis();
		RefreshPropertyGrid();
		RefreshStatus();
		UpdateTitle();
		UpdateViewportUi();
		UpdateToolbarLineStyleFromSelection();
		diagramCanvas.Invalidate();
	}

	private void RefreshStatus()
	{
		DbSchema schema = diagramCanvas.Schema;
		statusLabel.Text = $"{schema.Name}  |  {DbTargetTypeHelper.GetDisplayName(schema.TargetDb)}  |  테이블 {schema.Tables.Count}개  |  관계 {schema.Relationships.Count}개";
	}

	private void UpdateTitle()
	{
		string text = ((_currentFilePath != null) ? Path.GetFileName(_currentFilePath) : "새 프로젝트");
		Text = (HasUnsavedChanges() ? "● " : "") + text + " — DBTools v1.0";
	}

	private void MarkDocumentClean()
	{
		diagramCanvas.NormalizeRelationshipRoutes();
		_cleanSchemaSnapshot = diagramCanvas.CreateSnapshot();
		UpdateTitle();
	}

	private bool HasUnsavedChanges()
	{
		if (_cleanSchemaSnapshot == null)
		{
			return false;
		}
		diagramCanvas.NormalizeRelationshipRoutes();
		return !SchemaSerializer.AreEquivalent(_cleanSchemaSnapshot, diagramCanvas.Schema);
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
		if (!HasUnsavedChanges())
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
        menuDbVectorDb = new ToolStripMenuItem();
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
        tsDbVectorDb = new ToolStripMenuItem();
        tsDbType = new ToolStripDropDownButton();
        btnTsAbout = new ToolStripButton();
        toolStrip = new ToolStrip();
        grpTools = new ToolboxGroupBox();
        grpRelation = new ToolboxGroupBox();
        grpView = new ToolboxGroupBox();
        panelToolBox = new Panel();
        treeViewSchema = new TreeView();
        listViewAnalysis = new BufferedListView();
        listViewIndexAdvisor = new BufferedListView();
        tabTreeView = new TabPage();
        tabAnalysis = new TabPage();
        tabIndexAdvisor = new TabPage();
        tabControlRight = new TabControl();
        propertyGrid = new BufferedPropertyGrid();
        propertySortBar = new ToolStrip();
        btnPropertySortCategory = new ToolStripButton();
        btnPropertySortAlphabetical = new ToolStripButton();
        splitRightPanel = new SplitContainer();
        panelRight = new Panel();
        diagramCanvas = new DiagramCanvas();
        panelCanvasArea = new Panel();
        panelToggleStrip = new Panel();
        panelCanvasInner = new Panel();
        panelCanvasChromeTop = new Panel();
        panelCanvasChromeBody = new Panel();
        panelRulerCorner = new Panel();
        rulerHorizontal = new CanvasRuler();
        rulerVertical = new CanvasRuler();
        splitMain = new SplitContainer();
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
        tabIndexAdvisor.SuspendLayout();
        tabControlRight.SuspendLayout();
        ((ISupportInitialize)splitRightPanel).BeginInit();
        splitRightPanel.Panel1.SuspendLayout();
        splitRightPanel.Panel2.SuspendLayout();
        propertySortBar.SuspendLayout();
        splitRightPanel.SuspendLayout();
        panelRight.SuspendLayout();
        panelCanvasArea.SuspendLayout();
        panelToggleStrip.SuspendLayout();
        panelCanvasInner.SuspendLayout();
        panelCanvasChromeTop.SuspendLayout();
        panelCanvasChromeBody.SuspendLayout();
        ((ISupportInitialize)splitMain).BeginInit();
        splitMain.Panel1.SuspendLayout();
        splitMain.Panel2.SuspendLayout();
        splitMain.SuspendLayout();
        panelCanvasHost.SuspendLayout();
        panelContent.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // btnToolSelect
        // 
        btnToolSelect.Cursor = Cursors.Hand;
        btnToolSelect.FlatStyle = FlatStyle.Flat;
        btnToolSelect.Location = new Point(4, 20);
        btnToolSelect.Name = "btnToolSelect";
        btnToolSelect.Size = new Size(40, 38);
        btnToolSelect.TabIndex = 1;
        btnToolSelect.Text = "선택";
        toolTip1.SetToolTip(btnToolSelect, "테이블/관계 선택·이동, 빈 영역 드래그로 화면 이동");
        // 
        // btnToolAddTable
        // 
        btnToolAddTable.Cursor = Cursors.Hand;
        btnToolAddTable.FlatStyle = FlatStyle.Flat;
        btnToolAddTable.Location = new Point(4, 62);
        btnToolAddTable.Name = "btnToolAddTable";
        btnToolAddTable.Size = new Size(40, 38);
        btnToolAddTable.TabIndex = 0;
        btnToolAddTable.Text = "테이블";
        toolTip1.SetToolTip(btnToolAddTable, "클릭한 위치에 새 테이블을 추가합니다");
        // 
        // btnToolRel11
        // 
        btnToolRel11.Cursor = Cursors.Hand;
        btnToolRel11.FlatStyle = FlatStyle.Flat;
        btnToolRel11.Location = new Point(4, 20);
        btnToolRel11.Name = "btnToolRel11";
        btnToolRel11.Size = new Size(40, 38);
        btnToolRel11.TabIndex = 2;
        btnToolRel11.Text = "1:1";
        toolTip1.SetToolTip(btnToolRel11, "일대일(1:1) 관계를 그립니다");
        // 
        // btnToolRel1N
        // 
        btnToolRel1N.Cursor = Cursors.Hand;
        btnToolRel1N.FlatStyle = FlatStyle.Flat;
        btnToolRel1N.Location = new Point(4, 62);
        btnToolRel1N.Name = "btnToolRel1N";
        btnToolRel1N.Size = new Size(40, 38);
        btnToolRel1N.TabIndex = 1;
        btnToolRel1N.Text = "1:N";
        toolTip1.SetToolTip(btnToolRel1N, "일대다(1:N) 관계를 그립니다");
        // 
        // btnToolRelNM
        // 
        btnToolRelNM.Cursor = Cursors.Hand;
        btnToolRelNM.FlatStyle = FlatStyle.Flat;
        btnToolRelNM.Location = new Point(4, 104);
        btnToolRelNM.Name = "btnToolRelNM";
        btnToolRelNM.Size = new Size(40, 38);
        btnToolRelNM.TabIndex = 0;
        btnToolRelNM.Text = "N:M";
        toolTip1.SetToolTip(btnToolRelNM, "다대다(N:M) 관계를 그립니다");
        // 
        // btnZoomIn
        // 
        btnZoomIn.Cursor = Cursors.Hand;
        btnZoomIn.FlatStyle = FlatStyle.Flat;
        btnZoomIn.Location = new Point(4, 20);
        btnZoomIn.Name = "btnZoomIn";
        btnZoomIn.Size = new Size(40, 38);
        btnZoomIn.TabIndex = 2;
        btnZoomIn.Text = "확대";
        toolTip1.SetToolTip(btnZoomIn, "다이어그램을 확대합니다");
        // 
        // btnZoomOut
        // 
        btnZoomOut.Cursor = Cursors.Hand;
        btnZoomOut.FlatStyle = FlatStyle.Flat;
        btnZoomOut.Location = new Point(4, 62);
        btnZoomOut.Name = "btnZoomOut";
        btnZoomOut.Size = new Size(40, 38);
        btnZoomOut.TabIndex = 1;
        btnZoomOut.Text = "축소";
        toolTip1.SetToolTip(btnZoomOut, "다이어그램을 축소합니다");
        // 
        // btnFitAll
        // 
        btnFitAll.Cursor = Cursors.Hand;
        btnFitAll.FlatStyle = FlatStyle.Flat;
        btnFitAll.Location = new Point(4, 104);
        btnFitAll.Name = "btnFitAll";
        btnFitAll.Size = new Size(40, 38);
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
        menuOpenDatabase.ToolTipText = "SQLite, SQLCipher, Vector Index(Faiss/hnswlib), SQL DDL, SQL Server, Access DB 파일을 분석해 다이어그램으로 표시합니다 (Ctrl+Shift+O)";
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
        // menuDbVectorDb
        // 
        menuDbVectorDb.Name = "menuDbVectorDb";
        menuDbVectorDb.Size = new Size(136, 22);
        menuDbVectorDb.Text = "FAISS (Vector DB)";
        menuDbVectorDb.ToolTipText = "Faiss/hnswlib 벡터 인덱스용 스키마 타입";
        // 
        // menuDbType
        // 
        menuDbType.DropDownItems.AddRange(new ToolStripItem[] { menuDbPostgres, menuDbMySQL, menuDbMariaDB, menuDbSQLite, menuDbSqlServer, menuDbVectorDb });
        menuDbType.Name = "menuDbType";
        menuDbType.Size = new Size(204, 22);
        menuDbType.Text = "데이터베이스 종류";
        menuDbType.ToolTipText = "대상 데이터베이스 종류를 선택합니다 (PostgreSQL, MySQL, SQLite, SQL Server, FAISS 등)";
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
        menuWriteReport.ToolTipText = "스키마 보고서를 Markdown, Excel, Word, PDF로 저장합니다 (Ctrl+Shift+R)";
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
        btnTsWriteReport.ToolTipText = "보고서 작성 — Markdown, Excel, Word, PDF (Ctrl+Shift+R)";
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
        // tsDbVectorDb
        // 
        tsDbVectorDb.Name = "tsDbVectorDb";
        tsDbVectorDb.Size = new Size(136, 22);
        tsDbVectorDb.Text = "FAISS (Vector DB)";
        tsDbVectorDb.ToolTipText = "Faiss/hnswlib 벡터 인덱스용 스키마 타입";
        // 
        // tsDbType
        // 
        tsDbType.DropDownItems.AddRange(new ToolStripItem[] { tsDbSQLite, tsDbMySQL, tsDbMariaDB, tsDbPostgres, tsDbSqlServer, tsDbVectorDb });
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
        grpTools.Size = new Size(48, 108);
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
        grpRelation.Location = new Point(2, 112);
        grpRelation.Name = "grpRelation";
        grpRelation.Padding = new Padding(4, 2, 4, 4);
        grpRelation.Size = new Size(48, 150);
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
        grpView.Location = new Point(2, 266);
        grpView.Name = "grpView";
        grpView.Padding = new Padding(4, 2, 4, 4);
        grpView.Size = new Size(48, 150);
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
        panelToolBox.MaximumSize = new Size(52, 0);
        panelToolBox.MinimumSize = new Size(52, 0);
        panelToolBox.Name = "panelToolBox";
        panelToolBox.Padding = new Padding(2, 4, 2, 4);
        panelToolBox.Size = new Size(52, 690);
        panelToolBox.TabIndex = 1;
        // 
        // treeViewSchema
        // 
        treeViewSchema.Dock = DockStyle.Fill;
        treeViewSchema.BorderStyle = BorderStyle.None;
        treeViewSchema.HideSelection = false;
        treeViewSchema.Location = new Point(0, 0);
        treeViewSchema.Name = "treeViewSchema";
        treeViewSchema.ShowNodeToolTips = true;
        treeViewSchema.Size = new Size(384, 422);
        treeViewSchema.TabIndex = 0;
        // 
        // listViewAnalysis
        // 
        listViewAnalysis.Dock = DockStyle.Fill;
        listViewAnalysis.BorderStyle = BorderStyle.None;
        listViewAnalysis.FullRowSelect = true;
        listViewAnalysis.Location = new Point(0, 0);
        listViewAnalysis.Name = "listViewAnalysis";
        listViewAnalysis.Size = new Size(384, 811);
        listViewAnalysis.TabIndex = 0;
        listViewAnalysis.UseCompatibleStateImageBehavior = false;
        listViewAnalysis.View = View.Details;
        //
        // listViewIndexAdvisor
        //
        listViewIndexAdvisor.Dock = DockStyle.Fill;
        listViewIndexAdvisor.BorderStyle = BorderStyle.None;
        listViewIndexAdvisor.FullRowSelect = true;
        listViewIndexAdvisor.Location = new Point(0, 0);
        listViewIndexAdvisor.Name = "listViewIndexAdvisor";
        listViewIndexAdvisor.Size = new Size(384, 811);
        listViewIndexAdvisor.TabIndex = 0;
        listViewIndexAdvisor.UseCompatibleStateImageBehavior = false;
        listViewIndexAdvisor.View = View.Details;
        //
        // tabTreeView
        // 
        tabTreeView.Controls.Add(treeViewSchema);
        tabTreeView.Location = new Point(4, 24);
        tabTreeView.Name = "tabTreeView";
        tabTreeView.Size = new Size(292, 72);
        tabTreeView.TabIndex = 0;
        tabTreeView.Text = "구조";
        // 
        // tabAnalysis
        // 
        tabAnalysis.Controls.Add(listViewAnalysis);
        tabAnalysis.Location = new Point(4, 24);
        tabAnalysis.Name = "tabAnalysis";
        tabAnalysis.Size = new Size(292, 461);
        tabAnalysis.TabIndex = 1;
        tabAnalysis.Text = "정규화 분석";
        //
        // tabIndexAdvisor
        //
        tabIndexAdvisor.Controls.Add(listViewIndexAdvisor);
        tabIndexAdvisor.Location = new Point(4, 24);
        tabIndexAdvisor.Name = "tabIndexAdvisor";
        tabIndexAdvisor.Size = new Size(292, 461);
        tabIndexAdvisor.TabIndex = 2;
        tabIndexAdvisor.Text = "인덱스 어드바이저";
        //
        // tabControlRight
        //
        tabControlRight.Controls.Add(tabTreeView);
        tabControlRight.Controls.Add(tabAnalysis);
        tabControlRight.Controls.Add(tabIndexAdvisor);
        tabControlRight.Dock = DockStyle.Fill;
        tabControlRight.Location = new Point(0, 0);
        tabControlRight.Name = "tabControlRight";
        tabControlRight.SelectedIndex = 0;
        tabControlRight.Size = new Size(300, 100);
        tabControlRight.TabIndex = 0;
        // 
        // propertyGrid
        // 
        propertyGrid.Dock = DockStyle.Fill;
        propertyGrid.HelpVisible = false;
        propertyGrid.Location = new Point(0, 25);
        propertyGrid.Name = "propertyGrid";
        propertyGrid.Size = new Size(300, 212);
        propertyGrid.TabIndex = 0;
        propertyGrid.ToolbarVisible = false;
        propertyGrid.PropertySort = PropertySort.CategorizedAlphabetical;
        // 
        // propertySortBar
        // 
        propertySortBar.Dock = DockStyle.Top;
        propertySortBar.GripStyle = ToolStripGripStyle.Hidden;
        propertySortBar.Items.AddRange(new ToolStripItem[] { btnPropertySortCategory, btnPropertySortAlphabetical });
        propertySortBar.Location = new Point(0, 0);
        propertySortBar.Name = "propertySortBar";
        propertySortBar.Size = new Size(300, 25);
        propertySortBar.TabIndex = 1;
        // 
        // btnPropertySortCategory
        // 
        btnPropertySortCategory.CheckOnClick = true;
        btnPropertySortCategory.Checked = false;
        btnPropertySortCategory.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnPropertySortCategory.Name = "btnPropertySortCategory";
        btnPropertySortCategory.Size = new Size(47, 22);
        btnPropertySortCategory.Text = "분류별";
        btnPropertySortCategory.ToolTipText = "카테고리별로 속성을 표시합니다.";
        // 
        // btnPropertySortAlphabetical
        // 
        btnPropertySortAlphabetical.CheckOnClick = true;
        btnPropertySortAlphabetical.Checked = true;
        btnPropertySortAlphabetical.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnPropertySortAlphabetical.Name = "btnPropertySortAlphabetical";
        btnPropertySortAlphabetical.Size = new Size(47, 22);
        btnPropertySortAlphabetical.Text = "사전순";
        btnPropertySortAlphabetical.ToolTipText = "카테고리를 유지한 채 각 카테고리 안에서 사전순으로 정렬합니다.";
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
        splitRightPanel.Panel1MinSize = 80;
        // 
        // splitRightPanel.Panel2
        // 
        splitRightPanel.Panel2.Controls.Add(propertyGrid);
        splitRightPanel.Panel2.Controls.Add(propertySortBar);
        splitRightPanel.Panel2MinSize = 80;
        splitRightPanel.Size = new Size(300, 690);
        splitRightPanel.SplitterDistance = 345;
        splitRightPanel.TabIndex = 0;
        // 
        // panelRight
        // 
        panelRight.Controls.Add(splitRightPanel);
        panelRight.Dock = DockStyle.Fill;
        panelRight.Location = new Point(0, 0);
        panelRight.Name = "panelRight";
        panelRight.Size = new Size(300, 690);
        panelRight.TabIndex = 0;
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
        panelCanvasInner.Location = new Point(28, 0);
        panelCanvasInner.Name = "panelCanvasInner";
        panelCanvasInner.Size = new Size(860, 666);
        panelCanvasInner.TabIndex = 1;
        // 
        // panelCanvasChromeTop
        // 
        panelCanvasChromeTop.Controls.Add(panelRulerCorner);
        panelCanvasChromeTop.Controls.Add(rulerHorizontal);
        panelCanvasChromeTop.Dock = DockStyle.Top;
        panelCanvasChromeTop.Location = new Point(0, 0);
        panelCanvasChromeTop.Name = "panelCanvasChromeTop";
        panelCanvasChromeTop.Size = new Size(888, 24);
        panelCanvasChromeTop.TabIndex = 0;
        panelCanvasChromeTop.Height = 24;
        // 
        // panelCanvasChromeBody
        // 
        panelCanvasChromeBody.Controls.Add(rulerVertical);
        panelCanvasChromeBody.Controls.Add(panelCanvasInner);
        panelCanvasChromeBody.Dock = DockStyle.Fill;
        panelCanvasChromeBody.Location = new Point(0, 24);
        panelCanvasChromeBody.Name = "panelCanvasChromeBody";
        panelCanvasChromeBody.Size = new Size(888, 666);
        panelCanvasChromeBody.TabIndex = 1;
        // 
        // panelRulerCorner
        // 
        panelRulerCorner.BackColor = Color.FromArgb(243, 244, 246);
        panelRulerCorner.Dock = DockStyle.Left;
        panelRulerCorner.Location = new Point(0, 0);
        panelRulerCorner.Name = "panelRulerCorner";
        panelRulerCorner.Size = new Size(28, 24);
        panelRulerCorner.TabIndex = 0;
        // 
        // rulerHorizontal
        // 
        rulerHorizontal.BackColor = Color.FromArgb(248, 249, 251);
        rulerHorizontal.Dock = DockStyle.Fill;
        rulerHorizontal.Location = new Point(28, 0);
        rulerHorizontal.Name = "rulerHorizontal";
        rulerHorizontal.Orientation = RulerOrientation.Horizontal;
        rulerHorizontal.Size = new Size(860, 24);
        rulerHorizontal.TabIndex = 1;
        // 
        // rulerVertical
        // 
        rulerVertical.BackColor = Color.FromArgb(248, 249, 251);
        rulerVertical.Dock = DockStyle.Left;
        rulerVertical.Location = new Point(0, 0);
        rulerVertical.Name = "rulerVertical";
        rulerVertical.Orientation = RulerOrientation.Vertical;
        rulerVertical.Size = new Size(28, 666);
        rulerVertical.TabIndex = 0;
        // 
        // splitMain
        // 
        splitMain.Dock = DockStyle.Fill;
        splitMain.FixedPanel = FixedPanel.Panel2;
        splitMain.Location = new Point(52, 0);
        splitMain.Name = "splitMain";
        splitMain.Orientation = Orientation.Vertical;
        // 
        // splitMain.Panel1
        // 
        splitMain.Panel1.Controls.Add(panelCanvasHost);
        splitMain.Panel1MinSize = 320;
        // 
        // splitMain.Panel2
        // 
        splitMain.Panel2.Controls.Add(panelRight);
        splitMain.Panel2MinSize = 260;
        splitMain.Size = new Size(1212, 690);
        splitMain.SplitterDistance = 888;
        splitMain.TabIndex = 3;
        // 
        // panelCanvasHost
        // 
        panelCanvasHost.Controls.Add(panelCanvasChromeBody);
        panelCanvasHost.Controls.Add(panelCanvasChromeTop);
        panelCanvasHost.Dock = DockStyle.Fill;
        panelCanvasHost.Location = new Point(0, 0);
        panelCanvasHost.Name = "panelCanvasHost";
        panelCanvasHost.Size = new Size(888, 690);
        panelCanvasHost.TabIndex = 0;
        // 
        // panelContent
        // 
        panelContent.Controls.Add(splitMain);
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
        ClientSize = new Size(1400, 800);
        Controls.Add(panelContent);
        Controls.Add(statusStrip);
        Controls.Add(toolStrip);
        Controls.Add(menuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(960, 600);
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
        tabIndexAdvisor.ResumeLayout(false);
        tabControlRight.ResumeLayout(false);
        splitRightPanel.Panel1.ResumeLayout(false);
        splitRightPanel.Panel2.ResumeLayout(false);
        splitRightPanel.Panel2.PerformLayout();
        propertySortBar.ResumeLayout(false);
        propertySortBar.PerformLayout();
        ((ISupportInitialize)splitRightPanel).EndInit();
        splitRightPanel.ResumeLayout(false);
        panelRight.ResumeLayout(false);
        panelCanvasArea.ResumeLayout(false);
        panelToggleStrip.ResumeLayout(false);
        panelCanvasInner.ResumeLayout(false);
        panelCanvasChromeTop.ResumeLayout(false);
        panelCanvasChromeBody.ResumeLayout(false);
        splitMain.Panel1.ResumeLayout(false);
        splitMain.Panel2.ResumeLayout(false);
        ((ISupportInitialize)splitMain).EndInit();
        splitMain.ResumeLayout(false);
        panelCanvasHost.ResumeLayout(false);
        panelContent.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

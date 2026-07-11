using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Linq;
using System.Windows.Forms;
using DBToolsWinV10.App;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Controls;

public sealed class DiagramCanvas : Control
{
	private const float HeaderHeight = 28f;

	private const float RowHeight = 22f;

	private const float FooterPad = 4f;

	private const float MinContentW = 3000f;

	private const float MinContentH = 2000f;

	private const float ContentPad = 300f;

	private const float MinZoom = 0.2f;

	private const float MaxZoom = 4f;

	private static readonly Color HeaderColorPg = Color.FromArgb(52, 101, 164);

	private static readonly Color HeaderColorMySql = Color.FromArgb(0, 114, 66);

	private static readonly Color HeaderColorMaria = Color.FromArgb(194, 63, 63);

	private static readonly Color HeaderColorSqlite = Color.FromArgb(90, 90, 140);

	private static readonly Color HeaderColorSqlServer = Color.FromArgb(152, 34, 34);

	private static readonly Color HeaderColorVector = Color.FromArgb(88, 64, 168);

	private DbSchema _schema = new DbSchema();

	private ToolMode _toolMode = ToolMode.Select;

	private float _zoom = 1f;

	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public bool ShowGrid { get; set; } = false;
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public bool SnapToGrid { get; set; } = false;
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public int SnapInterval { get; set; } = 20;

	private readonly VScrollBar _vScroll = new VScrollBar();

	private readonly HScrollBar _hScroll = new HScrollBar();

	private DbTable _selectedTable;

	private DbColumn _selectedColumn;

	private DbRelationship _selectedRelationship;

	private readonly HashSet<Guid> _normalizationHighlightedColumnIds = new HashSet<Guid>();

	private bool _isDragging;

	private PointF _dragStartCanvas;

	private PointF _lastMouseCanvas;

	private PointF _tableOriginAtDrag;

	private bool _isPanning;

	private Point _panStartScreen;

	private int _panStartH;

	private int _panStartV;

	private bool _spacePressed;

	private DbTable _relSource;

	private PointF _relCurrentMouse;

	private DbRelationship _dragRouteRel;

	private int _dragRoutePointIndex = -1;

	private float _dragRouteOriginX;

	private float _dragRouteOriginY;

	// Segment-midpoint dragging (orthogonal lines)
	private DbRelationship _dragSegRel;
	private int _dragSegIdx = -1;
	private List<PointF> _dragSegOrigPath;
	private float[] _dragSegOrigRpX;
	private float[] _dragSegOrigRpY;
	private PointF _dragSegStart;

	public DbSchema Schema => _schema;

	public UndoRedoManager UndoRedo { get; } = new UndoRedoManager();

	public void SaveUndoSnapshot() => UndoRedo.Push(_schema.Clone());

	public void Undo()
	{
		if (!UndoRedo.CanUndo) return;
		_schema = UndoRedo.Undo(_schema.Clone());
		ClearSelection();
		Invalidate();
		NotifyChanged();
	}

	public void Redo()
	{
		if (!UndoRedo.CanRedo) return;
		_schema = UndoRedo.Redo(_schema.Clone());
		ClearSelection();
		Invalidate();
		NotifyChanged();
	}

	public ToolMode CurrentTool => _toolMode;

	public float Zoom => _zoom;

	public Point ScrollPosition => new Point(_hScroll.Value, _vScroll.Value);

	public DbTable SelectedTable => _selectedTable;

	public DbColumn SelectedColumn => _selectedColumn;

	public DbRelationship SelectedRelationship => _selectedRelationship;

	[Browsable(false)]
	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	public RelationshipLineStyle DefaultLineStyle { get; set; } = RelationshipLineStyle.Straight;

	public event EventHandler SelectionChanged;

	public event EventHandler SchemaChanged;

	public event EventHandler ViewportChanged;

	public event EventHandler TableEditRequested;

	public event EventHandler RelationEditRequested;

	public event EventHandler<ColumnEventArgs> ColumnEditRequested;

	public event EventHandler ColumnAddRequested;

	public event EventHandler<ColumnEventArgs> ColumnDeleteRequested;

	public DiagramCanvas()
	{
		DoubleBuffered = true;
		SetStyle(ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		BackColor = ModernTheme.CanvasBackground;
		if (LicenseManager.UsageMode != LicenseUsageMode.Designtime)
		{
			_vScroll.Dock = DockStyle.Right;
			_vScroll.Visible = false;
			_vScroll.Scroll += delegate
			{
				Invalidate();
				this.ViewportChanged?.Invoke(this, EventArgs.Empty);
			};
			_hScroll.Dock = DockStyle.Bottom;
			_hScroll.Visible = false;
			_hScroll.Scroll += delegate
			{
				Invalidate();
				this.ViewportChanged?.Invoke(this, EventArgs.Empty);
			};
			base.Controls.Add(_vScroll);
			base.Controls.Add(_hScroll);
		}
	}

	public void ApplyTheme()
	{
		BackColor = ModernTheme.CanvasBackground;
		ScrollBarTheme.Refresh(this);
	}

	public void LoadSchema(DbSchema schema, bool notifyChange = true)
	{
		_schema = schema ?? new DbSchema();
		_schema.EnsureInitialized();
		ClearSelection();
		ResetView();
		if (notifyChange)
		{
			NotifyChanged();
		}
	}

	public void NormalizeRelationshipRoutes()
	{
		_schema.EnsureInitialized();
		foreach (DbRelationship rel in _schema.Relationships)
		{
			if (rel.LineStyle == RelationshipLineStyle.Straight)
			{
				continue;
			}
			if (!TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection))
			{
				continue;
			}
			RelationshipPathBuilder.GetPathPoints(rel, connection);
		}
	}

	public DbSchema CreateSnapshot()
	{
		return _schema.Clone();
	}

	public void SetToolMode(ToolMode mode)
	{
		_toolMode = mode;
		_relSource = null;
		UpdateCursor();
		Invalidate();
	}

	public void ZoomIn()
	{
		SetZoom(_zoom * 1.2f, GetViewportCenter());
	}

	public void ZoomOut()
	{
		SetZoom(_zoom * 0.83f, GetViewportCenter());
	}

	public void ResetZoom()
	{
		SetZoom(1f, GetViewportCenter());
	}

	public void FitAll()
	{
		if (_schema.Tables.Count == 0)
		{
			SetZoom(1f);
			return;
		}
		RectangleF allTablesBounds = GetAllTablesBounds();
		Size viewportSize = GetViewportSize();
		float val = (float)viewportSize.Width / (allTablesBounds.Width + 80f);
		float val2 = (float)viewportSize.Height / (allTablesBounds.Height + 80f);
		float zoom = Math.Clamp(Math.Min(val, val2), 0.2f, 4f);
		_zoom = zoom;
		_hScroll.Value = ClampScroll(_hScroll, (int)((allTablesBounds.X - 40f) * _zoom));
		_vScroll.Value = ClampScroll(_vScroll, (int)((allTablesBounds.Y - 40f) * _zoom));
		UpdateScrollBars();
		Invalidate();
		this.ViewportChanged?.Invoke(this, EventArgs.Empty);
	}

	public void SetSpacePressed(bool pressed)
	{
		_spacePressed = pressed;
		UpdateCursor();
	}

	public void DeleteSelected()
	{
		if (_selectedColumn != null && _selectedTable != null)
		{
			this.ColumnDeleteRequested?.Invoke(this, new ColumnEventArgs(_selectedTable, _selectedColumn));
		}
		else if (_selectedTable != null)
		{
			SaveUndoSnapshot();
			Guid id = _selectedTable.Id;
			_schema.Tables.RemoveAll((DbTable t) => t.Id == id);
			_schema.Relationships.RemoveAll((DbRelationship r) => r.SourceTableId == id || r.TargetTableId == id);
			ClearSelection();
			NotifyChanged();
		}
		else if (_selectedRelationship != null)
		{
			SaveUndoSnapshot();
			Guid id2 = _selectedRelationship.Id;
			_schema.Relationships.RemoveAll((DbRelationship r) => r.Id == id2);
			ClearSelection();
			NotifyChanged();
		}
	}

	public void ClearSelection()
	{
		_selectedTable = null;
		_selectedColumn = null;
		_selectedRelationship = null;
		_normalizationHighlightedColumnIds.Clear();
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	public void ClearNormalizationHighlight()
	{
		if (_normalizationHighlightedColumnIds.Count == 0)
		{
			return;
		}

		_normalizationHighlightedColumnIds.Clear();
		Invalidate();
	}

	public void SelectTable(DbTable table)
	{
		_selectedTable = table;
		_selectedColumn = null;
		_selectedRelationship = null;
		_normalizationHighlightedColumnIds.Clear();
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	public void ShowNormalizationIssue(DbTable table, IEnumerable<string> affectedColumnNames)
	{
		if (table == null)
		{
			return;
		}

		_selectedTable = table;
		_selectedRelationship = null;
		_normalizationHighlightedColumnIds.Clear();
		DbColumn firstSelected = null;
		if (affectedColumnNames != null)
		{
			foreach (string columnName in affectedColumnNames)
			{
				if (string.IsNullOrWhiteSpace(columnName))
				{
					continue;
				}

				DbColumn column = table.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, columnName.Trim(), StringComparison.OrdinalIgnoreCase));
				if (column == null)
				{
					continue;
				}

				_normalizationHighlightedColumnIds.Add(column.Id);
				firstSelected ??= column;
			}
		}

		_selectedColumn = firstSelected;
		EnsureNormalizationTargetVisible(table);
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	public RectangleF GetContentBounds()
	{
		if (_schema.Tables.Count == 0)
		{
			return new RectangleF(0f, 0f, 3000f, 2000f);
		}
		RectangleF allTablesBounds = GetAllTablesBounds();
		return new RectangleF(allTablesBounds.X - 300f, allTablesBounds.Y - 300f, allTablesBounds.Width + 600f, allTablesBounds.Height + 600f);
	}

	public RectangleF GetViewportBounds()
	{
		Size viewportSize = GetViewportSize();
		return new RectangleF((float)_hScroll.Value / _zoom, (float)_vScroll.Value / _zoom, (float)viewportSize.Width / _zoom, (float)viewportSize.Height / _zoom);
	}

	public void ScrollToCanvas(PointF pt)
	{
		Size viewportSize = GetViewportSize();
		_hScroll.Value = ClampScroll(_hScroll, (int)(pt.X * _zoom - (float)(viewportSize.Width / 2)));
		_vScroll.Value = ClampScroll(_vScroll, (int)(pt.Y * _zoom - (float)(viewportSize.Height / 2)));
		Invalidate();
		this.ViewportChanged?.Invoke(this, EventArgs.Empty);
	}

	private void EnsureNormalizationTargetVisible(DbTable table)
	{
		RectangleF focusBounds = GetTableBounds(table);
		if (_normalizationHighlightedColumnIds.Count > 0)
		{
			float minY = float.MaxValue;
			float maxY = float.MinValue;
			for (int i = 0; i < table.Columns.Count; i++)
			{
				DbColumn column = table.Columns[i];
				if (column == null || !_normalizationHighlightedColumnIds.Contains(column.Id))
				{
					continue;
				}

				float rowY = table.Y + 28f + i * 22f;
				minY = Math.Min(minY, rowY);
				maxY = Math.Max(maxY, rowY + 22f);
			}

			if (maxY > minY)
			{
				focusBounds = new RectangleF(table.X, minY, table.Width, maxY - minY);
			}
		}

		EnsureCanvasRectVisible(focusBounds);
	}

	private void EnsureCanvasRectVisible(RectangleF rect, float margin = 48f)
	{
		rect.Inflate(margin, margin);
		RectangleF viewport = GetViewportBounds();
		float newLeft = viewport.Left;
		float newTop = viewport.Top;
		if (rect.Right > viewport.Right)
		{
			newLeft += rect.Right - viewport.Right;
		}

		if (rect.Left < viewport.Left)
		{
			newLeft += rect.Left - viewport.Left;
		}

		if (rect.Bottom > viewport.Bottom)
		{
			newTop += rect.Bottom - viewport.Bottom;
		}

		if (rect.Top < viewport.Top)
		{
			newTop += rect.Top - viewport.Top;
		}

		if (Math.Abs(newLeft - viewport.Left) < 0.5f && Math.Abs(newTop - viewport.Top) < 0.5f)
		{
			return;
		}

		_hScroll.Value = ClampScroll(_hScroll, (int)(newLeft * _zoom));
		_vScroll.Value = ClampScroll(_vScroll, (int)(newTop * _zoom));
		Invalidate();
		this.ViewportChanged?.Invoke(this, EventArgs.Empty);
	}

	public Bitmap RenderToImage(bool transparentBackground, float padding = 48f, float scale = 1f)
	{
		scale = Math.Max(0.1f, scale);
		RectangleF bounds = GetDiagramExportBounds(padding);
		int width = Math.Max(1, (int)Math.Ceiling(bounds.Width * scale));
		int height = Math.Max(1, (int)Math.Ceiling(bounds.Height * scale));
		const long maxPixels = 16_000_000L;
		long pixelCount = (long)width * height;
		if (pixelCount > maxPixels)
		{
			float fit = MathF.Sqrt(maxPixels / pixelCount);
			scale *= fit;
			width = Math.Max(1, (int)Math.Ceiling(bounds.Width * scale));
			height = Math.Max(1, (int)Math.Ceiling(bounds.Height * scale));
		}

		Bitmap bitmap = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
		using Graphics graphics = Graphics.FromImage(bitmap);
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
		graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
		graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
		graphics.Clear(transparentBackground ? Color.Transparent : Color.White);
		graphics.TranslateTransform(-bounds.X * scale, -bounds.Y * scale);
		graphics.ScaleTransform(scale, scale);
		if (_schema.Tables.Count == 0)
		{
			using Font font = new Font("맑은 고딕", 12f, FontStyle.Regular, GraphicsUnit.Point);
			using SolidBrush brush = new SolidBrush(Color.FromArgb(120, 120, 120));
			graphics.DrawString("테이블이 없습니다.", font, brush, bounds.X + padding, bounds.Y + padding);
			return bitmap;
		}

		foreach (DbRelationship relationship in _schema.Relationships)
		{
			DrawRelationship(graphics, relationship);
		}
		foreach (DbTable table in _schema.Tables)
		{
			DrawTable(graphics, table);
		}
		return bitmap;
	}

	private RectangleF GetDiagramExportBounds(float padding)
	{
		if (_schema.Tables.Count == 0)
		{
			return new RectangleF(0f, 0f, 640f, 360f);
		}

		RectangleF bounds = GetAllTablesBounds();
		foreach (DbRelationship relationship in _schema.Relationships)
		{
			if (!TryGetRelationshipConnection(relationship, out RelationshipConnectionInfo connection))
			{
				continue;
			}
			foreach (PointF point in RelationshipPathBuilder.GetPathPoints(relationship, connection))
			{
				ExpandBounds(ref bounds, point);
			}
		}
		bounds.Inflate(padding, padding);
		return bounds;
	}

	private static void ExpandBounds(ref RectangleF bounds, PointF point)
	{
		if (point.X < bounds.Left)
		{
			bounds.Width += bounds.Left - point.X;
			bounds.X = point.X;
		}
		if (point.Y < bounds.Top)
		{
			bounds.Height += bounds.Top - point.Y;
			bounds.Y = point.Y;
		}
		if (point.X > bounds.Right)
		{
			bounds.Width = point.X - bounds.Left;
		}
		if (point.Y > bounds.Bottom)
		{
			bounds.Height = point.Y - bounds.Top;
		}
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		base.OnPaint(e);
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
		graphics.TranslateTransform(-_hScroll.Value, -_vScroll.Value);
		graphics.ScaleTransform(_zoom, _zoom);
		DrawGrid(graphics);

		foreach (DbRelationship relationship in _schema.Relationships)
		{
			DrawRelationship(graphics, relationship);
		}

		if (_relSource != null && _toolMode != ToolMode.Select)
		{
			DrawRelationPreview(graphics);
		}
		foreach (DbTable table in _schema.Tables)
		{
			DrawTable(graphics, table);
		}
	}

	private void DrawGrid(Graphics g)
	{
		if (!ShowGrid) return;
		int minor = Math.Max(5, SnapInterval);
		int major = minor * 5;
		float num = (float)_hScroll.Value / _zoom;
		float num2 = (float)_vScroll.Value / _zoom;
		Size viewportSize = GetViewportSize();
		float num3 = num + (float)viewportSize.Width / _zoom;
		float num4 = num2 + (float)viewportSize.Height / _zoom;
		using Pen pen = new Pen(ModernTheme.CanvasGridMinor, 1f / _zoom);
		using Pen pen2 = new Pen(ModernTheme.CanvasGridMajor, 1.2f / _zoom);
		int num5 = (int)(Math.Floor(num / minor) * minor);
		int num6 = (int)(Math.Floor(num2 / minor) * minor);
		int num7 = (int)(Math.Floor(num / major) * major);
		int num8 = (int)(Math.Floor(num2 / major) * major);
		for (int i = num5; (float)i <= num3 + minor; i += minor)
			g.DrawLine(pen, i, num2, i, num4);
		for (int j = num6; (float)j <= num4 + minor; j += minor)
			g.DrawLine(pen, num, j, num3, j);
		for (int k = num7; (float)k <= num3 + major; k += major)
			g.DrawLine(pen2, k, num2, k, num4);
		for (int l = num8; (float)l <= num4 + major; l += major)
			g.DrawLine(pen2, num, l, num3, l);
	}

	private bool IsTableSelected(DbTable table)
	{
		return _selectedTable != null && _selectedTable.Id == table.Id;
	}

	private bool IsColumnSelected(DbTable table, DbColumn column)
	{
		if (column == null)
			return false;
		return _selectedColumn != null
			&& _selectedTable != null
			&& _selectedColumn.Id == column.Id
			&& _selectedTable.Id == table.Id;
	}

	private bool IsNormalizationHighlighted(DbTable table, DbColumn column)
	{
		return column != null
			&& _selectedTable != null
			&& _selectedTable.Id == table.Id
			&& _normalizationHighlightedColumnIds.Contains(column.Id);
	}

	private bool IsRelationshipSelected(DbRelationship relationship)
	{
		return _selectedRelationship != null && _selectedRelationship.Id == relationship.Id;
	}

	private void DrawTable(Graphics g, DbTable table)
	{
		float tableHeight = GetTableHeight(table);
		RectangleF rect = new RectangleF(table.X, table.Y, table.Width, tableHeight);
		bool flag = IsTableSelected(table);
		using SolidBrush brush = new SolidBrush(ModernTheme.CanvasShadow);
		g.FillRectangle(brush, rect.X + 3f, rect.Y + 3f, rect.Width, rect.Height);
		using SolidBrush brush2 = new SolidBrush(ModernTheme.CanvasRowOdd);
		g.FillRectangle(brush2, rect);
		RectangleF rect2 = new RectangleF(rect.X, rect.Y, rect.Width, 28f);
		Color headerColor = GetHeaderColor(_schema.TargetDb);
		using SolidBrush brush3 = new SolidBrush(headerColor);
		g.FillRectangle(brush3, rect2);
		using Font font = new Font("맑은 고딕", 9.5f, FontStyle.Bold, GraphicsUnit.Point);
		using SolidBrush brush4 = new SolidBrush(Color.White);
		RectangleF layoutRectangle = new RectangleF(rect2.X + 8f, rect2.Y + 2f, rect2.Width - 16f, 28f);
		using StringFormat format = new StringFormat
		{
			Alignment = StringAlignment.Near,
			LineAlignment = StringAlignment.Center,
			Trimming = StringTrimming.EllipsisCharacter
		};
		g.DrawString(table.Name, font, brush4, layoutRectangle, format);
		using Font font2 = new Font("맑은 고딕", 7f, FontStyle.Regular, GraphicsUnit.Point);
		using SolidBrush brush5 = new SolidBrush(Color.FromArgb(160, 255, 255, 255));
		string s = DbTargetTypeHelper.GetDisplayName(_schema.TargetDb);
		g.DrawString(s, font2, brush5, new RectangleF(rect.X, rect.Y + 2f, rect.Width - 4f, 24f), new StringFormat
		{
			Alignment = StringAlignment.Far,
			LineAlignment = StringAlignment.Near
		});
		using Font font3 = new Font("맑은 고딕", 8.5f, FontStyle.Regular, GraphicsUnit.Point);
		using Font font4 = new Font("맑은 고딕", 8.5f, FontStyle.Bold, GraphicsUnit.Point);
		using SolidBrush solidBrush = new SolidBrush(ModernTheme.CanvasTextPrimary);
		using SolidBrush brush6 = new SolidBrush(ModernTheme.CanvasTextSecondary);
		using SolidBrush solidBrush2 = new SolidBrush(ModernTheme.CanvasPkText);
		using SolidBrush solidBrush3 = new SolidBrush(ModernTheme.CanvasFkText);
		for (int i = 0; i < table.Columns.Count; i++)
		{
			DbColumn col = table.Columns[i];
			if (col == null)
				continue;
			float num = rect.Y + 28f + (float)i * 22f;
			RectangleF rect3 = new RectangleF(rect.X, num, rect.Width, 22f);
			bool columnSelected = IsColumnSelected(table, col);
			bool normalizationHighlighted = IsNormalizationHighlighted(table, col);
			using SolidBrush brush7 = new SolidBrush(columnSelected || normalizationHighlighted ? ModernTheme.CanvasHighlightRow : ((i % 2 == 0) ? ModernTheme.CanvasRowEven : ModernTheme.CanvasRowOdd));
			g.FillRectangle(brush7, rect3);
			using Pen pen = new Pen(ModernTheme.CanvasBorderLight, 0.5f / _zoom);
			g.DrawLine(pen, rect3.X, rect3.Bottom, rect3.Right, rect3.Bottom);
			string text = (col.IsPrimaryKey ? "\ud83d\udd11" : (IsFK(col) ? "\ud83d\udd17" : "  "));
			bool flag2 = IsFK(col);
			bool flag3 = _schema.Relationships.Any((DbRelationship r) => r.SourceTableId == table.Id && r.SourceColumnId == col.Id);
			string s2 = (col.IsPrimaryKey ? "PK" : (flag3 ? "FK" : "  "));
			Brush brush8 = (col.IsPrimaryKey ? solidBrush2 : (flag3 ? solidBrush3 : solidBrush));
			using Font font5 = new Font("Consolas", 7f, col.IsPrimaryKey ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
			g.DrawString(s2, font5, brush8, new RectangleF(rect3.X + 2f, num + 1f, 22f, 20f), new StringFormat
			{
				Alignment = StringAlignment.Center,
				LineAlignment = StringAlignment.Center
			});
			Font font6 = (col.IsPrimaryKey ? font4 : font3);
			Brush brush9 = (col.IsPrimaryKey ? solidBrush2 : solidBrush);
			g.DrawString(col.Name, font6, brush9, new RectangleF(rect3.X + 26f, num + 1f, rect.Width * 0.48f - 26f, 20f), new StringFormat
			{
				Alignment = StringAlignment.Near,
				LineAlignment = StringAlignment.Center,
				Trimming = StringTrimming.EllipsisCharacter
			});
			g.DrawString(col.GetTypeDisplay(), font3, brush6, new RectangleF(rect3.X + rect.Width * 0.48f, num + 1f, rect.Width * 0.52f - 4f, 20f), new StringFormat
			{
				Alignment = StringAlignment.Near,
				LineAlignment = StringAlignment.Center,
				Trimming = StringTrimming.EllipsisCharacter
			});
		}
		using Pen pen2 = new Pen(flag ? ModernTheme.Accent : ModernTheme.CanvasBorder, flag ? (2.5f / _zoom) : (1f / _zoom));
		g.DrawRectangle(pen2, rect.X, rect.Y, rect.Width, rect.Height);
		if (flag)
		{
			using (Pen pen3 = new Pen(Color.FromArgb(80, 255, 165, 0), 6f / _zoom))
			{
				g.DrawRectangle(pen3, rect.X - 3f, rect.Y - 3f, rect.Width + 6f, rect.Height + 6f);
				return;
			}
		}
	}

	private bool IsFK(DbColumn col)
	{
		if (col == null)
			return false;
		return _schema.Relationships.Any((DbRelationship r) => r.SourceColumnId == col.Id || r.TargetColumnId == col.Id);
	}

	private void DrawRelationship(Graphics g, DbRelationship rel)
	{
		DbTable dbTable = _schema.FindTable(rel.SourceTableId);
		DbTable dbTable2 = _schema.FindTable(rel.TargetTableId);
		if (dbTable == null || dbTable2 == null)
		{
			return;
		}
		if (!TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection))
		{
			return;
		}
		bool liveRoute = ShouldLiveRouteRelationship(rel);
		List<PointF> pathPoints = RelationshipPathBuilder.GetPathPoints(rel, connection, liveRoute);
		bool flag = IsRelationshipSelected(rel);
		Color color = (flag ? ModernTheme.Accent : ModernTheme.CanvasRelLine);
		float width = (flag ? (3f / _zoom) : (2.2f / _zoom));
		using Pen pen = new Pen(color, width)
		{
			DashStyle = DashStyle.Solid
		};
		if (rel.LineStyle == RelationshipLineStyle.Curved)
		{
			var (cp1, cp2) = RelationshipPathBuilder.GetCubicControls(rel, connection.Start, connection.End, connection.StartEdge, connection.EndEdge);
			using var curvePath = new GraphicsPath();
			curvePath.AddBezier(connection.Start, cp1, cp2, connection.End);
			g.DrawPath(pen, curvePath);
		}
		else
		{
			g.DrawLines(pen, pathPoints.ToArray());
		}
		bool isMany = rel.Type == RelationshipType.ManyToMany;
		RelationshipType type = rel.Type;
		bool flag2 = (uint)(type - 1) <= 1u;
		bool isMany2 = flag2;
		DrawCardinality(g, pen, pathPoints[0], pathPoints[1], isMany);
		DrawCardinality(g, pen, pathPoints[pathPoints.Count - 1], pathPoints[pathPoints.Count - 2], isMany2);
		if (flag && !liveRoute)
		{
			DrawRelationshipRouteHandles(g, rel, connection);
		}
		if (string.IsNullOrWhiteSpace(rel.Name))
		{
			return;
		}
		PointF pathMidpoint = RelationshipPathBuilder.GetPathMidpoint(rel, connection, liveRoute);
		using Font font = new Font("맑은 고딕", 7.5f, FontStyle.Regular, GraphicsUnit.Point);
		using SolidBrush brush = new SolidBrush(ModernTheme.CanvasRelText);
		using SolidBrush brush2 = new SolidBrush(ModernTheme.CanvasRelNameBg);
		SizeF sizeF = g.MeasureString(rel.Name, font);
		g.FillRectangle(brush2, pathMidpoint.X - sizeF.Width / 2f - 2f, pathMidpoint.Y - sizeF.Height / 2f - 1f, sizeF.Width + 4f, sizeF.Height + 2f);
		g.DrawString(rel.Name, font, brush, pathMidpoint, new StringFormat
		{
			Alignment = StringAlignment.Center,
			LineAlignment = StringAlignment.Center
		});
	}

	private void DrawRelationshipRouteHandles(Graphics g, DbRelationship rel, RelationshipConnectionInfo connection)
	{
		if (rel.LineStyle == RelationshipLineStyle.Straight || rel.RoutePoints == null)
			return;

		RelationshipPathBuilder.EnsureRoutePoints(rel, connection.Start, connection.End, connection.StartEdge, connection.EndEdge);

		if (rel.LineStyle == RelationshipLineStyle.Curved && rel.RoutePoints.Count >= 2)
		{
			PointF cp1 = new PointF(rel.RoutePoints[0].X, rel.RoutePoints[0].Y);
			PointF cp2 = new PointF(rel.RoutePoints[1].X, rel.RoutePoints[1].Y);

			// Dotted arm lines: start→CP1, end→CP2
			using var armPen = new Pen(Color.FromArgb(180, 90, 140, 230), 1.2f / _zoom) { DashStyle = DashStyle.Dot };
			g.DrawLine(armPen, connection.Start, cp1);
			g.DrawLine(armPen, connection.End,   cp2);

			// CP1: blue diamond
			float r = 6f / _zoom;
			using var fill1   = new SolidBrush(Color.FromArgb(240, 60, 130, 255));
			using var fill2   = new SolidBrush(Color.FromArgb(240, 40, 210, 140));
			using var outline = new Pen(Color.White, 1.5f / _zoom);
			DrawDiamond(g, cp1, r, fill1, outline);
			DrawDiamond(g, cp2, r, fill2, outline);
		}
		else
		{
			// Orthogonal: show square handles at SEGMENT MIDPOINTS (between bends)
			List<PointF> pathPts = RelationshipPathBuilder.GetPathPoints(rel, connection);
			float hr = 5f / _zoom;
			using var fillBrush = new SolidBrush(Color.FromArgb(240, 255, 220, 60));
			using var outlinePen = new Pen(Color.FromArgb(200, 160, 90, 0), 1.5f / _zoom);
			using var activeBrush = new SolidBrush(Color.FromArgb(240, 60, 160, 255));
			for (int i = 0; i < pathPts.Count - 1; i++)
			{
				PointF mid = new PointF(
					(pathPts[i].X + pathPts[i + 1].X) * 0.5f,
					(pathPts[i].Y + pathPts[i + 1].Y) * 0.5f);
				bool isDragging = _dragSegRel != null && _dragSegRel.Id == rel.Id && _dragSegIdx == i;
				RectangleF r = new RectangleF(mid.X - hr, mid.Y - hr, hr * 2f, hr * 2f);
				g.FillRectangle(isDragging ? activeBrush : fillBrush, r);
				g.DrawRectangle(outlinePen, r.X, r.Y, r.Width, r.Height);
			}
		}
	}

	private static void DrawDiamond(Graphics g, PointF center, float r, Brush fill, Pen border)
	{
		PointF[] pts =
		{
			new PointF(center.X,     center.Y - r),
			new PointF(center.X + r, center.Y    ),
			new PointF(center.X,     center.Y + r),
			new PointF(center.X - r, center.Y    )
		};
		g.FillPolygon(fill, pts);
		g.DrawPolygon(border, pts);
	}

	private void DrawCardinality(Graphics g, Pen pen, PointF tip, PointF other, bool isMany)
	{
		float num = tip.X - other.X;
		float num2 = tip.Y - other.Y;
		float num3 = MathF.Sqrt(num * num + num2 * num2);
		if (!(num3 < 0.001f))
		{
			float num4 = num / num3;
			float num5 = num2 / num3;
			float num6 = 0f - num5;
			float num7 = num4;
			PointF pt = new PointF(tip.X - num4 * 14f - num6 * 7f, tip.Y - num5 * 14f - num7 * 7f);
			PointF pt2 = new PointF(tip.X - num4 * 14f + num6 * 7f, tip.Y - num5 * 14f + num7 * 7f);
			g.DrawLine(pen, pt, pt2);
			if (isMany)
			{
				PointF pt3 = new PointF(tip.X - num4 * 28f, tip.Y - num5 * 28f);
				g.DrawLine(pen, pt3, tip);
				g.DrawLine(pen, pt3, new PointF(tip.X - num6 * 7f, tip.Y - num7 * 7f));
				g.DrawLine(pen, pt3, new PointF(tip.X + num6 * 7f, tip.Y + num7 * 7f));
			}
			else
			{
				PointF pt4 = new PointF(tip.X - num4 * 21f - num6 * 7f, tip.Y - num5 * 21f - num7 * 7f);
				PointF pt5 = new PointF(tip.X - num4 * 21f + num6 * 7f, tip.Y - num5 * 21f + num7 * 7f);
				g.DrawLine(pen, pt4, pt5);
			}
		}
	}

	private void DrawRelationPreview(Graphics g)
	{
		if (_relSource == null)
		{
			return;
		}
		PointF tableCenter = GetTableCenter(_relSource);
		PointF connectionPoint = GetConnectionPoint(_relSource, _relCurrentMouse);
		using Pen pen = new Pen(Color.FromArgb(180, 255, 140, 0), 2.5f / _zoom)
		{
			DashStyle = DashStyle.Dash
		};
		g.DrawLine(pen, connectionPoint, _relCurrentMouse);
		float num = 5f / _zoom;
		using SolidBrush brush = new SolidBrush(Color.OrangeRed);
		g.FillEllipse(brush, connectionPoint.X - num, connectionPoint.Y - num, num * 2f, num * 2f);
	}

	protected override void OnMouseDown(MouseEventArgs e)
	{
		base.OnMouseDown(e);
		Focus();
		PointF cp = ScreenToCanvas(e.Location);
		if (e.Button == MouseButtons.Right)
		{
			ShowContextMenu(e.Location, cp);
		}
		else if (e.Button == MouseButtons.Middle || (_spacePressed && e.Button == MouseButtons.Left))
		{
			StartPan(e.Location);
		}
		else
		{
			if (e.Button != MouseButtons.Left)
			{
				return;
			}
			if (_toolMode == ToolMode.Select)
			{
				HandleSelectDown(cp, e.Location);
			}
			else if (_toolMode == ToolMode.AddTable)
			{
				SaveUndoSnapshot();
				DbTable dbTable = new DbTable
				{
					Name = $"table_{_schema.Tables.Count + 1}",
					X = cp.X - 105f,
					Y = cp.Y - 14f
				};
				_schema.Tables.Add(dbTable);
				_selectedTable = dbTable;
				this.SelectionChanged?.Invoke(this, EventArgs.Empty);
				NotifyChanged();
			}
			else
			{
				ToolMode toolMode = _toolMode;
				if ((uint)(toolMode - 2) <= 2u)
				{
					if (HitTestTable(cp) == null)
					{
						StartPan(e.Location);
					}
					else
					{
						HandleRelationDown(cp);
					}
				}
			}
		}
	}

	private void HandleSelectDown(PointF cp, Point screenPt)
	{
		_normalizationHighlightedColumnIds.Clear();
		float handleRadius = 7f / _zoom;

		// Check orthogonal segment-midpoint handles FIRST (they have priority)
		foreach (DbRelationship relationship in _schema.Relationships)
		{
			if (relationship.LineStyle != RelationshipLineStyle.Orthogonal) continue;
			if (!IsRelationshipSelected(relationship)) continue; // only when selected
			if (!TryGetRelationshipConnection(relationship, out RelationshipConnectionInfo conn)) continue;

			RelationshipPathBuilder.EnsureRoutePoints(relationship, conn.Start, conn.End, conn.StartEdge, conn.EndEdge);
			List<PointF> pathPts = RelationshipPathBuilder.GetPathPoints(relationship, conn);
			for (int i = 0; i < pathPts.Count - 1; i++)
			{
				PointF mid = new PointF(
					(pathPts[i].X + pathPts[i + 1].X) * 0.5f,
					(pathPts[i].Y + pathPts[i + 1].Y) * 0.5f);
				float dist = MathF.Sqrt((cp.X - mid.X) * (cp.X - mid.X) + (cp.Y - mid.Y) * (cp.Y - mid.Y));
				if (dist <= handleRadius)
				{
					_selectedRelationship = relationship;
					_selectedTable = null;
					_selectedColumn = null;
					SaveUndoSnapshot();
					_dragSegRel = relationship;
					_dragSegIdx = i;
					_dragSegOrigPath = new List<PointF>(pathPts);
					_dragSegOrigRpX = relationship.RoutePoints.Select(rp => rp.X).ToArray();
					_dragSegOrigRpY = relationship.RoutePoints.Select(rp => rp.Y).ToArray();
					_dragSegStart = cp;
					base.Capture = true;
					this.SelectionChanged?.Invoke(this, EventArgs.Empty);
					Invalidate();
					return;
				}
			}
		}

		foreach (DbRelationship relationship in _schema.Relationships)
		{
			if (!TryGetRelationshipConnection(relationship, out RelationshipConnectionInfo connection))
			{
				continue;
			}
			int num = RelationshipPathBuilder.HitTestRoutePoint(relationship, cp, connection.Start, connection.End, connection.StartEdge, connection.EndEdge, handleRadius);
			if (num >= 0)
			{
				_selectedRelationship = relationship;
				_selectedTable = null;
				_selectedColumn = null;
				SaveUndoSnapshot();
				_dragRouteRel = relationship;
				_dragRoutePointIndex = num;
				RelationshipPoint routePoint = relationship.RoutePoints[num];
				_dragRouteOriginX = routePoint.X;
				_dragRouteOriginY = routePoint.Y;
				base.Capture = true;
				this.SelectionChanged?.Invoke(this, EventArgs.Empty);
				Invalidate();
				return;
			}
		}
		foreach (DbTable item in Enumerable.Reverse(_schema.Tables))
		{
			int num = HitTestColumn(item, cp);
			if (num >= 0)
			{
				_selectedTable = item;
				_selectedColumn = item.Columns[num];
				_selectedRelationship = null;
				this.SelectionChanged?.Invoke(this, EventArgs.Empty);
				Invalidate();
				return;
			}
		}
		foreach (DbRelationship relationship in _schema.Relationships)
		{
			if (HitTestRelationship(relationship, cp))
			{
				SelectRelationship(relationship);
				return;
			}
		}
		foreach (DbTable item in Enumerable.Reverse(_schema.Tables))
		{
			if (HitTestTableHeader(item, cp))
			{
				_selectedTable = item;
				_selectedColumn = null;
				_selectedRelationship = null;
				this.SelectionChanged?.Invoke(this, EventArgs.Empty);
				SaveUndoSnapshot();
				_isDragging = true;
				_dragStartCanvas = cp;
				_lastMouseCanvas = cp;
				_tableOriginAtDrag = new PointF(item.X, item.Y);
				base.Capture = true;
				Invalidate();
				return;
			}
			if (GetTableBounds(item).Contains(cp))
			{
				_selectedTable = item;
				_selectedColumn = null;
				_selectedRelationship = null;
				this.SelectionChanged?.Invoke(this, EventArgs.Empty);
				Invalidate();
				return;
			}
		}
		ClearSelection();
		StartPan(screenPt);
	}

	private void SelectRelationship(DbRelationship relationship)
	{
		_selectedRelationship = relationship;
		_selectedTable = null;
		_selectedColumn = null;
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	private bool TryGetRelationshipConnection(DbRelationship rel, out RelationshipConnectionInfo connection)
	{
		connection = default;
		DbTable dbTable = _schema.FindTable(rel.SourceTableId);
		DbTable dbTable2 = _schema.FindTable(rel.TargetTableId);
		if (dbTable == null || dbTable2 == null)
			return false;

		RectangleF srcBounds = GetTableBounds(dbTable);
		RectangleF dstBounds = GetTableBounds(dbTable2);
		PointF start, end;
		ConnectionEdge startEdge, endEdge;

		if (rel.LineStyle == RelationshipLineStyle.Orthogonal && rel.RoutePoints is { Count: >= 1 })
		{
			// Sliding connection: align start/end to first/last bend so first and last
			// segments always leave/arrive at exactly 90 degrees.
			PointF firstBend = new PointF(rel.RoutePoints[0].X, rel.RoutePoints[0].Y);
			PointF lastBend  = new PointF(rel.RoutePoints[^1].X, rel.RoutePoints[^1].Y);
			startEdge = GetNearestEdgeForPoint(srcBounds, firstBend);
			start     = GetSlidingConnectionPoint(srcBounds, startEdge, firstBend);
			endEdge   = GetNearestEdgeForPoint(dstBounds, lastBend);
			end       = GetSlidingConnectionPoint(dstBounds, endEdge, lastBend);
		}
		else
		{
			PointF tableCenter = GetTableCenter(dbTable);
			PointF tableCenter2 = GetTableCenter(dbTable2);
			start     = GetConnectionPoint(dbTable, tableCenter2);
			end       = GetConnectionPoint(dbTable2, tableCenter);
			startEdge = RelationshipPathBuilder.GetConnectionEdge(srcBounds, start);
			endEdge   = RelationshipPathBuilder.GetConnectionEdge(dstBounds, end);
		}

		connection = new RelationshipConnectionInfo
		{
			Start     = start,
			End       = end,
			StartEdge = startEdge,
			EndEdge   = endEdge
		};
		return true;
	}

	private static ConnectionEdge GetNearestEdgeForPoint(RectangleF bounds, PointF pt)
	{
		bool isLeft  = pt.X <= bounds.Left;
		bool isRight = pt.X >= bounds.Right;
		bool isAbove = pt.Y <= bounds.Top;
		bool isBelow = pt.Y >= bounds.Bottom;

		if (isLeft  && !isAbove && !isBelow) return ConnectionEdge.Left;
		if (isRight && !isAbove && !isBelow) return ConnectionEdge.Right;
		if (isAbove && !isLeft  && !isRight) return ConnectionEdge.Top;
		if (isBelow && !isLeft  && !isRight) return ConnectionEdge.Bottom;

		float dL = MathF.Abs(pt.X - bounds.Left);
		float dR = MathF.Abs(pt.X - bounds.Right);
		float dT = MathF.Abs(pt.Y - bounds.Top);
		float dB = MathF.Abs(pt.Y - bounds.Bottom);
		float mn = MathF.Min(MathF.Min(dL, dR), MathF.Min(dT, dB));
		if (mn == dL) return ConnectionEdge.Left;
		if (mn == dR) return ConnectionEdge.Right;
		if (mn == dT) return ConnectionEdge.Top;
		return ConnectionEdge.Bottom;
	}

	private static PointF GetSlidingConnectionPoint(RectangleF bounds, ConnectionEdge edge, PointF toward) => edge switch
	{
		ConnectionEdge.Left   => new PointF(bounds.Left,  Math.Clamp(toward.Y, bounds.Top, bounds.Bottom)),
		ConnectionEdge.Right  => new PointF(bounds.Right, Math.Clamp(toward.Y, bounds.Top, bounds.Bottom)),
		ConnectionEdge.Top    => new PointF(Math.Clamp(toward.X, bounds.Left, bounds.Right), bounds.Top),
		ConnectionEdge.Bottom => new PointF(Math.Clamp(toward.X, bounds.Left, bounds.Right), bounds.Bottom),
		_                     => new PointF(bounds.Left + bounds.Width / 2f, bounds.Top)
	};

	private void HandleRelationDown(PointF cp)
	{
		DbTable dbTable = HitTestTable(cp);
		if (dbTable == null)
		{
			return;
		}
		if (_relSource == null)
		{
			_relSource = dbTable;
			Invalidate();
			return;
		}
		if (_relSource.Id == dbTable.Id)
		{
			_relSource = null;
			Invalidate();
			return;
		}
		_schema.EnsureInitialized();
		DbColumn dbColumn = FindPrimaryKeyColumn(_relSource);
		DbColumn dbColumn2 = FindPrimaryKeyColumn(dbTable);
		if (dbColumn == null || dbColumn2 == null)
		{
			_relSource = null;
			Invalidate();
			MessageBox.Show(
				L.S("RelNeedPk", "관계를 추가하려면 두 테이블 모두에 기본 키(PK) 컬럼이 필요합니다.\n테이블 편집에서 PK 컬럼을 지정한 후 다시 시도하세요."),
				L.S("MenuAddRelation", "관계 추가"),
				MessageBoxButtons.OK,
				MessageBoxIcon.Information);
			return;
		}
		RelationshipType type = _toolMode switch
		{
			ToolMode.RelationOneToOne => RelationshipType.OneToOne,
			ToolMode.RelationManyToMany => RelationshipType.ManyToMany,
			_ => RelationshipType.OneToMany,
		};
		SaveUndoSnapshot();
		DbRelationship dbRelationship = new DbRelationship
		{
			Type = type,
			LineStyle = DefaultLineStyle,
			SourceTableId = _relSource.Id,
			SourceColumnId = dbColumn.Id,
			TargetTableId = dbTable.Id,
			TargetColumnId = dbColumn2.Id
		};
		_schema.Relationships.Add(dbRelationship);
		if (TryGetRelationshipConnection(dbRelationship, out RelationshipConnectionInfo connection))
		{
			if (dbRelationship.LineStyle == RelationshipLineStyle.Orthogonal)
				PlanOrthogonalRouteAroundTables(dbRelationship);
			else
				RelationshipPathBuilder.EnsureRoutePoints(dbRelationship, connection.Start, connection.End, connection.StartEdge, connection.EndEdge);
		}
		_relSource = null;
		_selectedTable = null;
		_selectedColumn = null;
		_selectedRelationship = dbRelationship;
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		NotifyChanged();
	}

	private static DbColumn FindPrimaryKeyColumn(DbTable table)
	{
		if (table?.Columns == null)
			return null;

		return table.Columns.FirstOrDefault(c => c != null && c.IsPrimaryKey);
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		base.OnMouseMove(e);
		PointF pointF = (_relCurrentMouse = ScreenToCanvas(e.Location));
		if (_isPanning)
		{
			_hScroll.Value = ClampScroll(_hScroll, _panStartH + (_panStartScreen.X - e.X));
			_vScroll.Value = ClampScroll(_vScroll, _panStartV + (_panStartScreen.Y - e.Y));
			Invalidate();
			this.ViewportChanged?.Invoke(this, EventArgs.Empty);
		}
		else if (_isDragging && _selectedTable != null)
		{
			float nx = _tableOriginAtDrag.X + (pointF.X - _dragStartCanvas.X);
			float ny = _tableOriginAtDrag.Y + (pointF.Y - _dragStartCanvas.Y);
			if (SnapToGrid && SnapInterval > 0)
			{
				nx = MathF.Round(nx / SnapInterval) * SnapInterval;
				ny = MathF.Round(ny / SnapInterval) * SnapInterval;
			}
			_selectedTable.X = nx;
			_selectedTable.Y = ny;
			Invalidate();
		}
		else if (_dragSegRel != null && _dragSegIdx >= 0)
		{
			MoveSegment(pointF);
			Invalidate();
		}
		else if (_dragRouteRel != null && _dragRoutePointIndex >= 0)
		{
			if (_dragRouteRel.RoutePoints != null && _dragRoutePointIndex < _dragRouteRel.RoutePoints.Count)
			{
				RelationshipPoint relationshipPoint = _dragRouteRel.RoutePoints[_dragRoutePointIndex];
				relationshipPoint.X = pointF.X;
				relationshipPoint.Y = pointF.Y;
			}
			Invalidate();
		}
		else if (_relSource != null)
		{
			Invalidate();
		}
	}

	private void MoveSegment(PointF cp)
	{
		if (_dragSegRel?.RoutePoints == null || _dragSegOrigPath == null) return;
		List<PointF> pts = _dragSegOrigPath;
		int i = _dragSegIdx;
		if (i < 0 || i >= pts.Count - 1) return;

		bool isH = MathF.Abs(pts[i].Y - pts[i + 1].Y) < 1f; // horizontal segment
		float delta = isH ? cp.Y - _dragSegStart.Y : cp.X - _dragSegStart.X;
		int lastIdx = pts.Count - 1;
		var rp = _dragSegRel.RoutePoints;

		// pathPoints[j] maps to RoutePoints[j-1] for j in [1 .. lastIdx-1]
		int rpA = i - 1;
		int rpB = i;

		if (isH)
		{
			if (rpA >= 0 && rpA < _dragSegOrigRpY.Length)
				rp[rpA].Y = _dragSegOrigRpY[rpA] + delta;
			if (rpB >= 0 && rpB < _dragSegOrigRpY.Length && i + 1 < lastIdx)
				rp[rpB].Y = _dragSegOrigRpY[rpB] + delta;
		}
		else
		{
			if (rpA >= 0 && rpA < _dragSegOrigRpX.Length)
				rp[rpA].X = _dragSegOrigRpX[rpA] + delta;
			if (rpB >= 0 && rpB < _dragSegOrigRpX.Length && i + 1 < lastIdx)
				rp[rpB].X = _dragSegOrigRpX[rpB] + delta;
		}
	}

	protected override void OnMouseDoubleClick(MouseEventArgs e)
	{
		base.OnMouseDoubleClick(e);
		if (e.Button != MouseButtons.Left || _toolMode != ToolMode.Select)
		{
			return;
		}
		PointF p = ScreenToCanvas(e.Location);
		foreach (DbTable item in Enumerable.Reverse(_schema.Tables))
		{
			int num = HitTestColumn(item, p);
			if (num >= 0)
			{
				DbColumn dbColumn = item.Columns[num];
				_selectedTable = item;
				_selectedColumn = dbColumn;
				_selectedRelationship = null;
				this.SelectionChanged?.Invoke(this, EventArgs.Empty);
				Invalidate();
				this.ColumnEditRequested?.Invoke(this, new ColumnEventArgs(item, dbColumn));
				return;
			}
		}
		DbRelationship hitRelationship = _schema.Relationships.FirstOrDefault((DbRelationship r) => HitTestRelationship(r, p));
		if (hitRelationship != null)
		{
			SelectRelationship(hitRelationship);
			this.RelationEditRequested?.Invoke(hitRelationship, EventArgs.Empty);
			return;
		}
		foreach (DbTable item in Enumerable.Reverse(_schema.Tables))
		{
			if (HitTestTableHeader(item, p))
			{
				this.TableEditRequested?.Invoke(item, EventArgs.Empty);
				break;
			}
		}
	}

	protected override void OnMouseUp(MouseEventArgs e)
	{
		base.OnMouseUp(e);
		if (_isPanning)
		{
			_isPanning = false;
			base.Capture = false;
			UpdateCursor();
		}
		else if (_isDragging)
		{
			_isDragging = false;
			base.Capture = false;
			if (_selectedTable != null && (Math.Abs(_selectedTable.X - _tableOriginAtDrag.X) > 0.01f || Math.Abs(_selectedTable.Y - _tableOriginAtDrag.Y) > 0.01f))
			{
				ResetOrthogonalRoutesForTable(_selectedTable);
				NotifyChanged();
			}
		}
		else if (_dragSegRel != null)
		{
			bool moved = _dragSegOrigPath != null && _dragSegIdx >= 0;
			_dragSegRel = null;
			_dragSegIdx = -1;
			_dragSegOrigPath = null;
			_dragSegOrigRpX = null;
			_dragSegOrigRpY = null;
			base.Capture = false;
			if (moved) NotifyChanged();
		}
		else if (_dragRouteRel != null)
		{
			bool moved = _dragRouteRel.RoutePoints != null
				&& _dragRoutePointIndex >= 0
				&& _dragRoutePointIndex < _dragRouteRel.RoutePoints.Count
				&& (Math.Abs(_dragRouteRel.RoutePoints[_dragRoutePointIndex].X - _dragRouteOriginX) > 0.01f
					|| Math.Abs(_dragRouteRel.RoutePoints[_dragRoutePointIndex].Y - _dragRouteOriginY) > 0.01f);
			_dragRouteRel = null;
			_dragRoutePointIndex = -1;
			base.Capture = false;
			if (moved)
			{
				NotifyChanged();
			}
		}
	}

	protected override void OnMouseWheel(MouseEventArgs e)
	{
		base.OnMouseWheel(e);
		if (Control.ModifierKeys.HasFlag(Keys.Control))
		{
			float factor = ((e.Delta > 0) ? 1.1f : 0.9f);
			ZoomAt(e.Location, factor);
			return;
		}
		int num = ((e.Delta > 0) ? (-_vScroll.SmallChange) : _vScroll.SmallChange);
		_vScroll.Value = ClampScroll(_vScroll, _vScroll.Value + num);
		Invalidate();
		this.ViewportChanged?.Invoke(this, EventArgs.Empty);
	}

	protected override void OnResize(EventArgs e)
	{
		base.OnResize(e);
		UpdateScrollBars();
	}

	protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
	{
		switch (keyData)
		{
		case Keys.Delete:
			DeleteSelected();
			return true;
		case Keys.Escape:
			SetToolMode(ToolMode.Select);
			ClearSelection();
			return true;
		default:
			return base.ProcessCmdKey(ref msg, keyData);
		}
	}

	protected override void OnKeyDown(KeyEventArgs e)
	{
		base.OnKeyDown(e);
		if (e.KeyCode == Keys.Space)
		{
			SetSpacePressed(pressed: true);
		}
	}

	protected override void OnKeyUp(KeyEventArgs e)
	{
		base.OnKeyUp(e);
		if (e.KeyCode == Keys.Space)
		{
			SetSpacePressed(pressed: false);
		}
	}

	private void ShowContextMenu(Point screenPt, PointF cp)
	{
		_schema.EnsureInitialized();
		ContextMenuStrip contextMenuStrip = new ContextMenuStrip();
		ModernTheme.StyleContextMenu(contextMenuStrip);
		bool canUndo = UndoRedo.CanUndo;
		bool canRedo = UndoRedo.CanRedo;
		if (canUndo || canRedo)
		{
			var itemUndo = ModernTheme.CreateMenuItem(L.S("MenuUndo", "실행 취소"), "Undo", delegate { Undo(); });
			itemUndo.Enabled = canUndo;
			var itemRedo = ModernTheme.CreateMenuItem(L.S("MenuRedo", "다시 실행"), "Redo", delegate { Redo(); });
			itemRedo.Enabled = canRedo;
			contextMenuStrip.Items.Add(itemUndo);
			contextMenuStrip.Items.Add(itemRedo);
			contextMenuStrip.Items.Add(new ToolStripSeparator());
		}
		foreach (DbTable table in Enumerable.Reverse(_schema.Tables))
		{
			int num = HitTestColumn(table, cp);
			if (num < 0)
			{
				continue;
			}
			DbColumn col = table.Columns[num];
			if (col == null)
			{
				continue;
			}
			_selectedTable = table;
			_selectedColumn = col;
			_selectedRelationship = null;
			this.SelectionChanged?.Invoke(this, EventArgs.Empty);
			Invalidate();
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmEditColumn", "컬럼 편집..."), "Edit", delegate
			{
				this.ColumnEditRequested?.Invoke(this, new ColumnEventArgs(table, col));
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmAddColumn", "컬럼 추가"), "AddColumn", delegate
			{
				this.ColumnAddRequested?.Invoke(table, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmDeleteColumn", "컬럼 삭제"), "Delete", delegate
			{
				this.ColumnDeleteRequested?.Invoke(this, new ColumnEventArgs(table, col));
			}));
			contextMenuStrip.Show(this, screenPt);
			return;
		}
		DbRelationship hitRel = _schema.Relationships.FirstOrDefault((DbRelationship r) => HitTestRelationship(r, cp));
		if (hitRel != null)
		{
			SelectRelationship(hitRel);
			AddRelationshipContextMenuItems(contextMenuStrip, hitRel, cp);
			contextMenuStrip.Show(this, screenPt);
			return;
		}
		foreach (DbTable table in Enumerable.Reverse(_schema.Tables))
		{
			if (!HitTestTableHeader(table, cp))
			{
				continue;
			}
			_selectedTable = table;
			_selectedColumn = null;
			_selectedRelationship = null;
			this.SelectionChanged?.Invoke(this, EventArgs.Empty);
			Invalidate();
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmEditTable", "테이블 편집..."), "Edit", delegate
			{
				this.TableEditRequested?.Invoke(table, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmAddColumn", "컬럼 추가"), "AddColumn", delegate
			{
				this.ColumnAddRequested?.Invoke(table, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmBringToFront", "앞으로 가져오기"), "BringToFront", delegate
			{
				BringTableToFront(table);
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmSendToBack", "뒤로 보내기"), "SendToBack", delegate
			{
				SendTableToBack(table);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmDeleteTable", "테이블 삭제"), "Delete", delegate
			{
				DeleteSelected();
			}));
			contextMenuStrip.Show(this, screenPt);
			return;
		}
		DbTable hitTable = HitTestTable(cp);
		if (hitTable != null)
		{
			_selectedTable = hitTable;
			_selectedColumn = null;
			_selectedRelationship = null;
			this.SelectionChanged?.Invoke(this, EventArgs.Empty);
			Invalidate();
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmEditTable", "테이블 편집..."), "Edit", delegate
			{
				this.TableEditRequested?.Invoke(hitTable, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmAddColumn", "컬럼 추가"), "AddColumn", delegate
			{
				this.ColumnAddRequested?.Invoke(hitTable, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmBringToFront", "앞으로 가져오기"), "BringToFront", delegate
			{
				BringTableToFront(hitTable);
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmSendToBack", "뒤로 보내기"), "SendToBack", delegate
			{
				SendTableToBack(hitTable);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem(L.S("CmDeleteTable", "테이블 삭제"), "Delete", delegate
			{
				DeleteSelected();
			}));
			contextMenuStrip.Show(this, screenPt);
			return;
		}
		AddCanvasBackgroundMenuItems(contextMenuStrip, cp);
		contextMenuStrip.Show(this, screenPt);
	}

	private void AddRelationshipContextMenuItems(ContextMenuStrip menu, DbRelationship rel, PointF cp)
	{
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmEditRelation", "관계 편집..."), "AddRelation", delegate
		{
			this.RelationEditRequested?.Invoke(rel, EventArgs.Empty);
		}));
		menu.Items.Add(CreateRelationshipTypeMenu(rel));
		menu.Items.Add(CreateRelationshipLineStyleMenu(rel));
		if (rel.LineStyle == RelationshipLineStyle.Orthogonal)
		{
			menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmAddBend", "꺾임 점 추가"), "AddRelation", delegate
			{
				SaveUndoSnapshot();
				if (TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection) && RelationshipPathBuilder.TryInsertOrthogonalBend(rel, cp, connection, out _))
				{
					NotifyChanged();
					Invalidate();
				}
			}));
		}
		if (rel.LineStyle != RelationshipLineStyle.Straight)
		{
			menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmResetRoute", "경로 초기화"), "FitAll", delegate
			{
				SaveUndoSnapshot();
				if (TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection))
				{
					RelationshipPathBuilder.ResetRoutePoints(rel, connection);
					NotifyChanged();
					Invalidate();
				}
			}));
		}
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmDeleteRelation", "관계 삭제"), "Delete", delegate
		{
			DeleteSelected();
		}));
	}

	private ToolStripMenuItem CreateRelationshipTypeMenu(DbRelationship rel)
	{
		ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem(L.S("CmRelationType", "관계 유형"));
		ToolStripMenuItem oneToOneItem = new ToolStripMenuItem(L.S("CmRelType11", "1:1 (일대일)"))
		{
			Checked = rel.Type == RelationshipType.OneToOne
		};
		ToolStripMenuItem oneToManyItem = new ToolStripMenuItem(L.S("CmRelType1N", "1:N (일대다)"))
		{
			Checked = rel.Type == RelationshipType.OneToMany
		};
		ToolStripMenuItem manyToManyItem = new ToolStripMenuItem(L.S("CmRelTypeNM", "N:M (다대다)"))
		{
			Checked = rel.Type == RelationshipType.ManyToMany
		};
		oneToOneItem.Click += delegate
		{
			ApplyRelationshipType(rel, RelationshipType.OneToOne);
		};
		oneToManyItem.Click += delegate
		{
			ApplyRelationshipType(rel, RelationshipType.OneToMany);
		};
		manyToManyItem.Click += delegate
		{
			ApplyRelationshipType(rel, RelationshipType.ManyToMany);
		};
		toolStripMenuItem.DropDownItems.AddRange(oneToOneItem, oneToManyItem, manyToManyItem);
		return toolStripMenuItem;
	}

	private void ApplyRelationshipType(DbRelationship rel, RelationshipType type)
	{
		if (rel.Type == type)
		{
			return;
		}
		SaveUndoSnapshot();
		rel.Type = type;
		SelectRelationship(rel);
		NotifyChanged();
	}

	private ToolStripMenuItem CreateRelationshipLineStyleMenu(DbRelationship rel)
	{
		ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem(L.S("CmLineStyle", "선 스타일"));
		ToolStripMenuItem straightItem = new ToolStripMenuItem(L.S("LineStyleStraight", "직선"))
		{
			Checked = rel.LineStyle == RelationshipLineStyle.Straight
		};
		ToolStripMenuItem curvedItem = new ToolStripMenuItem(L.S("LineStyleCurved", "곡선"))
		{
			Checked = rel.LineStyle == RelationshipLineStyle.Curved
		};
		ToolStripMenuItem orthogonalItem = new ToolStripMenuItem(L.S("LineStyleOrthogonal", "꺾은선"))
		{
			Checked = rel.LineStyle == RelationshipLineStyle.Orthogonal
		};
		straightItem.Click += delegate
		{
			ApplyRelationshipLineStyle(rel, RelationshipLineStyle.Straight);
		};
		curvedItem.Click += delegate
		{
			ApplyRelationshipLineStyle(rel, RelationshipLineStyle.Curved);
		};
		orthogonalItem.Click += delegate
		{
			ApplyRelationshipLineStyle(rel, RelationshipLineStyle.Orthogonal);
		};
		toolStripMenuItem.DropDownItems.AddRange(straightItem, curvedItem, orthogonalItem);
		return toolStripMenuItem;
	}

	public void SetRelationshipLineStyle(DbRelationship rel, RelationshipLineStyle style)
	{
		ApplyRelationshipLineStyle(rel, style);
	}

	private void ApplyRelationshipLineStyle(DbRelationship rel, RelationshipLineStyle style)
	{
		if (rel.LineStyle == style)
		{
			return;
		}
		rel.LineStyle = style;
		rel.RoutePoints ??= new List<RelationshipPoint>();
		rel.RoutePoints.Clear();
		if (TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection))
		{
			RelationshipPathBuilder.EnsureRoutePoints(rel, connection.Start, connection.End, connection.StartEdge, connection.EndEdge);
		}
		_selectedRelationship = rel;
		NotifyChanged();
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	private void AddCanvasBackgroundMenuItems(ContextMenuStrip menu, PointF cp)
	{
		ClearSelection();
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmAddTableHere", "여기에 새 테이블 추가"), "AddTable", delegate
		{
			SaveUndoSnapshot();
			DbTable item = new DbTable
			{
				Name = $"table_{_schema.Tables.Count + 1}",
				X = cp.X - 105f,
				Y = cp.Y - 14f
			};
			_schema.Tables.Add(item);
			_selectedTable = item;
			this.SelectionChanged?.Invoke(this, EventArgs.Empty);
			NotifyChanged();
		}));
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmFitAll", "화면 맞춤"), "FitAll", delegate
		{
			FitAll();
		}));
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmZoomIn", "확대"), "ZoomIn", delegate
		{
			ZoomIn();
		}));
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmZoomOut", "축소"), "ZoomOut", delegate
		{
			ZoomOut();
		}));
		menu.Items.Add(ModernTheme.CreateMenuItem(L.S("CmResetZoom", "배율 100%로 복원"), "FitAll", delegate
		{
			ResetZoom();
		}));
	}

	public void NotifyColumnRemoved(DbColumn column)
	{
		if (_selectedColumn != null && _selectedColumn.Id == column.Id)
		{
			_selectedColumn = null;
		}
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	private void BringTableToFront(DbTable table)
	{
		if (_schema.Tables.Count < 2 || _schema.Tables[^1] == table)
			return;
		SaveUndoSnapshot();
		_schema.Tables.Remove(table);
		_schema.Tables.Add(table);
		NotifyChanged();
	}

	private void SendTableToBack(DbTable table)
	{
		if (_schema.Tables.Count < 2 || _schema.Tables[0] == table)
			return;
		SaveUndoSnapshot();
		_schema.Tables.Remove(table);
		_schema.Tables.Insert(0, table);
		NotifyChanged();
	}

	private DbTable HitTestTable(PointF p)
	{
		for (int num = _schema.Tables.Count - 1; num >= 0; num--)
		{
			DbTable dbTable = _schema.Tables[num];
			if (GetTableBounds(dbTable).Contains(p))
			{
				return dbTable;
			}
		}
		return null;
	}

	private bool HitTestTableHeader(DbTable t, PointF p)
	{
		return new RectangleF(t.X, t.Y, t.Width, 28f).Contains(p);
	}

	private int HitTestColumn(DbTable t, PointF p)
	{
		if (p.X < t.X || p.X > t.X + t.Width || t.Columns == null)
		{
			return -1;
		}
		for (int i = 0; i < t.Columns.Count; i++)
		{
			float num = t.Y + 28f + (float)i * 22f;
			if (p.Y >= num && p.Y < num + 22f)
			{
				return i;
			}
		}
		return -1;
	}

	private bool HitTestRelationship(DbRelationship rel, PointF p)
	{
		if (!TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection))
		{
			return false;
		}
		return RelationshipPathBuilder.HitTest(rel, p, connection, 6f / _zoom, ShouldLiveRouteRelationship(rel));
	}

	private bool ShouldLiveRouteRelationship(DbRelationship rel)
	{
		return _isDragging
			&& _selectedTable != null
			&& rel.LineStyle == RelationshipLineStyle.Orthogonal
			&& (rel.SourceTableId == _selectedTable.Id || rel.TargetTableId == _selectedTable.Id);
	}

	private void ResetOrthogonalRoutesForTable(DbTable table)
	{
		if (table == null) return;
		RelationshipPathBuilder.ResetOrthogonalRoutesForTable(_schema, table.Id, rel =>
		{
			if (TryGetRelationshipConnection(rel, out RelationshipConnectionInfo conn)) return conn;
			return null;
		});
		foreach (DbRelationship rel in _schema.Relationships)
		{
			if (rel.LineStyle == RelationshipLineStyle.Orthogonal)
				PlanOrthogonalRouteAroundTables(rel);
		}
	}

	private void PlanOrthogonalRouteAroundTables(DbRelationship rel)
	{
		if (rel.LineStyle != RelationshipLineStyle.Orthogonal) return;
		if (!TryGetRelationshipConnection(rel, out var conn)) return;

		const float pad = 36f;
		DbTable srcTbl = _schema.FindTable(rel.SourceTableId);
		DbTable dstTbl = _schema.FindTable(rel.TargetTableId);
		if (srcTbl == null || dstTbl == null) return;

		var obstacles = new List<RectangleF>();
		foreach (DbTable t in _schema.Tables)
		{
			if (t.Id == rel.SourceTableId || t.Id == rel.TargetTableId) continue;
			RectangleF b = GetTableBounds(t);
			b.Inflate(8f, 8f);
			obstacles.Add(b);
		}

		var allBounds = new List<RectangleF>(obstacles);
		{ RectangleF b = GetTableBounds(srcTbl); b.Inflate(8f, 8f); allBounds.Add(b); }
		{ RectangleF b = GetTableBounds(dstTbl); b.Inflate(8f, 8f); allBounds.Add(b); }

		var bends = FindClearOrthogonalBends(
			conn.Start, conn.StartEdge, conn.End, conn.EndEdge,
			obstacles, allBounds, pad);

		rel.RoutePoints ??= new System.Collections.Generic.List<RelationshipPoint>();
		rel.RoutePoints.Clear();
		foreach (PointF pt in bends)
			rel.RoutePoints.Add(new RelationshipPoint(pt.X, pt.Y));
	}

	private static List<PointF> FindClearOrthogonalBends(
		PointF start, ConnectionEdge startEdge,
		PointF end,   ConnectionEdge endEdge,
		List<RectangleF> obstacles,
		List<RectangleF> allBounds,
		float pad)
	{
		bool startH = startEdge is ConnectionEdge.Left or ConnectionEdge.Right;
		bool endH   = endEdge   is ConnectionEdge.Left or ConnectionEdge.Right;
		float midX  = (start.X + end.X) * 0.5f;
		float midY  = (start.Y + end.Y) * 0.5f;

		// Candidate lanes built from obstacle edges + natural midpoints, sorted closest-first
		var xSet = new HashSet<float> { start.X, end.X, midX };
		var ySet = new HashSet<float> { start.Y, end.Y, midY };
		foreach (RectangleF b in allBounds)
		{
			xSet.Add(b.Left - pad); xSet.Add(b.Right  + pad);
			ySet.Add(b.Top  - pad); ySet.Add(b.Bottom + pad);
		}
		List<float> xC = xSet.OrderBy(x => MathF.Abs(x - midX)).ToList();
		List<float> yC = ySet.OrderBy(y => MathF.Abs(y - midY)).ToList();

		bool Clear(List<PointF> bends)
		{
			if (obstacles.Count == 0) return true;
			var path = new List<PointF>(bends.Count + 2) { start };
			path.AddRange(bends);
			path.Add(end);
			for (int i = 0; i < path.Count - 1; i++)
				foreach (RectangleF obs in obstacles)
					if (OrthogonalSegmentHitsRect(path[i], path[i + 1], obs))
						return false;
			return true;
		}

		List<PointF> Fallback()
		{
			if (startH && endH) return new List<PointF> { new PointF(midX, start.Y), new PointF(midX, end.Y) };
			if (startH)         return new List<PointF> { new PointF(end.X, start.Y) };
			if (endH)           return new List<PointF> { new PointF(start.X, end.Y) };
			return new List<PointF> { new PointF(start.X, midY), new PointF(end.X, midY) };
		}

		if (startH && endH)
		{
			if (MathF.Abs(start.Y - end.Y) < 1f && Clear(new List<PointF>()))
				return new List<PointF>();
			foreach (float xL in xC)
			{
				var b = new List<PointF> { new PointF(xL, start.Y), new PointF(xL, end.Y) };
				if (Clear(b)) return b;
			}
		}
		else if (!startH && !endH)
		{
			if (MathF.Abs(start.X - end.X) < 1f && Clear(new List<PointF>()))
				return new List<PointF>();
			foreach (float yL in yC)
			{
				var b = new List<PointF> { new PointF(start.X, yL), new PointF(end.X, yL) };
				if (Clear(b)) return b;
			}
		}
		else if (startH && !endH)
		{
			// 1-bend L-shape
			{ var b1 = new List<PointF> { new PointF(end.X, start.Y) }; if (Clear(b1)) return b1; }
			// 3-bend detour through (xL, yL) gap
			foreach (float xL in xC)
			{
				if (MathF.Abs(xL - end.X) < 1f) continue;
				foreach (float yL in yC)
				{
					if (MathF.Abs(yL - start.Y) < 1f) continue;
					var b = new List<PointF> { new PointF(xL, start.Y), new PointF(xL, yL), new PointF(end.X, yL) };
					if (Clear(b)) return b;
				}
			}
		}
		else // !startH && endH
		{
			// 1-bend L-shape
			{ var b1 = new List<PointF> { new PointF(start.X, end.Y) }; if (Clear(b1)) return b1; }
			// 3-bend detour through (yL, xL) gap
			foreach (float yL in yC)
			{
				if (MathF.Abs(yL - end.Y) < 1f) continue;
				foreach (float xL in xC)
				{
					if (MathF.Abs(xL - start.X) < 1f) continue;
					var b = new List<PointF> { new PointF(start.X, yL), new PointF(xL, yL), new PointF(xL, end.Y) };
					if (Clear(b)) return b;
				}
			}
		}

		return Fallback();
	}

	private static bool OrthogonalSegmentHitsRect(PointF a, PointF b, RectangleF r)
	{
		bool isH = MathF.Abs(a.Y - b.Y) < 1f;
		if (isH)
		{
			float minX = MathF.Min(a.X, b.X);
			float maxX = MathF.Max(a.X, b.X);
			return a.Y > r.Top && a.Y < r.Bottom && minX < r.Right && maxX > r.Left;
		}
		else
		{
			float minY = MathF.Min(a.Y, b.Y);
			float maxY = MathF.Max(a.Y, b.Y);
			return a.X > r.Left && a.X < r.Right && minY < r.Bottom && maxY > r.Top;
		}
	}

	public static float GetTableHeight(DbTable t)
	{
		int columnCount = t.Columns?.Count ?? 0;
		return 28f + (float)columnCount * 22f + 4f;
	}

	private RectangleF GetTableBounds(DbTable t)
	{
		return new RectangleF(t.X, t.Y, t.Width, GetTableHeight(t));
	}

	private PointF GetTableCenter(DbTable t)
	{
		RectangleF tableBounds = GetTableBounds(t);
		return new PointF(tableBounds.X + tableBounds.Width / 2f, tableBounds.Y + tableBounds.Height / 2f);
	}

	private PointF GetConnectionPoint(DbTable t, PointF from)
	{
		RectangleF tableBounds = GetTableBounds(t);
		float num = tableBounds.X + tableBounds.Width / 2f;
		float num2 = tableBounds.Y + tableBounds.Height / 2f;
		float num3 = from.X - num;
		float num4 = from.Y - num2;
		float num5 = tableBounds.Width / 2f;
		float num6 = tableBounds.Height / 2f;
		if (Math.Abs(num3) < 0.001f && Math.Abs(num4) < 0.001f)
		{
			return new PointF(num, tableBounds.Y);
		}
		if (Math.Abs(num4) * num5 > Math.Abs(num3) * num6)
		{
			float num7 = ((num4 > 0f) ? 1 : (-1));
			float num8 = num6 / Math.Abs(num4);
			return new PointF(num + num3 * num8, num2 + num7 * num6);
		}
		float num9 = ((num3 > 0f) ? 1 : (-1));
		float num10 = num5 / Math.Abs(num3);
		return new PointF(num + num9 * num5, num2 + num4 * num10);
	}

	private RectangleF GetAllTablesBounds()
	{
		float num = float.MaxValue;
		float num2 = float.MaxValue;
		float num3 = float.MinValue;
		float num4 = float.MinValue;
		foreach (DbTable table in _schema.Tables)
		{
			RectangleF tableBounds = GetTableBounds(table);
			if (tableBounds.Left < num)
			{
				num = tableBounds.Left;
			}
			if (tableBounds.Top < num2)
			{
				num2 = tableBounds.Top;
			}
			if (tableBounds.Right > num3)
			{
				num3 = tableBounds.Right;
			}
			if (tableBounds.Bottom > num4)
			{
				num4 = tableBounds.Bottom;
			}
		}
		return new RectangleF(num, num2, num3 - num, num4 - num2);
	}

	private void SetZoom(float zoom, Point? anchor = null)
	{
		float zoom2 = _zoom;
		_zoom = Math.Clamp(zoom, 0.2f, 4f);
		if (!(Math.Abs(_zoom - zoom2) < 0.001f))
		{
			Point point = anchor ?? GetViewportCenter();
			PointF pointF = new PointF((float)(point.X + _hScroll.Value) / zoom2, (float)(point.Y + _vScroll.Value) / zoom2);
			_hScroll.Value = ClampScroll(_hScroll, (int)(pointF.X * _zoom - (float)point.X));
			_vScroll.Value = ClampScroll(_vScroll, (int)(pointF.Y * _zoom - (float)point.Y));
			UpdateScrollBars();
			Invalidate();
			this.ViewportChanged?.Invoke(this, EventArgs.Empty);
		}
	}

	private void ZoomAt(Point screenPt, float factor)
	{
		float zoom = _zoom;
		_zoom = Math.Clamp(_zoom * factor, 0.2f, 4f);
		if (!(Math.Abs(_zoom - zoom) < 0.001f))
		{
			PointF pointF = new PointF((float)(screenPt.X + _hScroll.Value) / zoom, (float)(screenPt.Y + _vScroll.Value) / zoom);
			_hScroll.Value = ClampScroll(_hScroll, (int)(pointF.X * _zoom - (float)screenPt.X));
			_vScroll.Value = ClampScroll(_vScroll, (int)(pointF.Y * _zoom - (float)screenPt.Y));
			UpdateScrollBars();
			Invalidate();
			this.ViewportChanged?.Invoke(this, EventArgs.Empty);
		}
	}

	private void ResetView()
	{
		_zoom = 1f;
		_hScroll.Value = 0;
		_vScroll.Value = 0;
		UpdateScrollBars();
		Invalidate();
		this.ViewportChanged?.Invoke(this, EventArgs.Empty);
	}

	private void StartPan(Point screenPt)
	{
		_isPanning = true;
		_panStartScreen = screenPt;
		_panStartH = _hScroll.Value;
		_panStartV = _vScroll.Value;
		base.Capture = true;
		Cursor = Cursors.Hand;
	}

	private void UpdateScrollBars()
	{
		Size contentSize = GetContentSize();
		Size viewportSize = GetViewportSize();
		bool flag = contentSize.Height > viewportSize.Height;
		bool flag2 = contentSize.Width > viewportSize.Width;
		_vScroll.Visible = flag;
		_hScroll.Visible = flag2;
		if (flag)
		{
			ConfigureBar(_vScroll, contentSize.Height, viewportSize.Height);
		}
		if (flag2)
		{
			ConfigureBar(_hScroll, contentSize.Width, viewportSize.Width);
		}
		if (_hScroll.Visible)
		{
			_hScroll.Value = ClampScroll(_hScroll, _hScroll.Value);
		}
		if (_vScroll.Visible)
		{
			_vScroll.Value = ClampScroll(_vScroll, _vScroll.Value);
		}
	}

	private static void ConfigureBar(ScrollBar sb, int content, int viewport)
	{
		sb.Minimum = 0;
		sb.LargeChange = Math.Max(1, viewport);
		sb.SmallChange = Math.Max(1, viewport / 10);
		sb.Maximum = Math.Max(0, content - 1);
	}

	private static int ClampScroll(ScrollBar sb, int val)
	{
		if (!sb.Visible)
		{
			return 0;
		}
		int max = Math.Max(sb.Minimum, sb.Maximum - sb.LargeChange + 1);
		return Math.Clamp(val, sb.Minimum, max);
	}

	private Size GetContentSize()
	{
		RectangleF contentBounds = GetContentBounds();
		return new Size((int)(contentBounds.Right * _zoom), (int)(contentBounds.Bottom * _zoom));
	}

	private Size GetViewportSize()
	{
		int val = base.ClientSize.Width - (_vScroll.Visible ? _vScroll.Width : 0);
		int val2 = base.ClientSize.Height - (_hScroll.Visible ? _hScroll.Height : 0);
		return new Size(Math.Max(1, val), Math.Max(1, val2));
	}

	private Point GetViewportCenter()
	{
		Size viewportSize = GetViewportSize();
		return new Point(viewportSize.Width / 2, viewportSize.Height / 2);
	}

	private PointF ScreenToCanvas(Point p)
	{
		return new PointF((float)(p.X + _hScroll.Value) / _zoom, (float)(p.Y + _vScroll.Value) / _zoom);
	}

	private void UpdateCursor()
	{
		if (_isPanning || _spacePressed)
		{
			Cursor = Cursors.Hand;
			return;
		}
		ToolMode toolMode = _toolMode;
		if (1 == 0)
		{
		}
		Cursor cursor;
		switch (toolMode)
		{
		case ToolMode.AddTable:
			cursor = Cursors.Cross;
			break;
		case ToolMode.RelationOneToOne:
		case ToolMode.RelationOneToMany:
		case ToolMode.RelationManyToMany:
			cursor = Cursors.UpArrow;
			break;
		default:
			cursor = Cursors.Default;
			break;
		}
		if (1 == 0)
		{
		}
		Cursor = cursor;
	}

	private void NotifyChanged()
	{
		UpdateScrollBars();
		Invalidate();
		this.SchemaChanged?.Invoke(this, EventArgs.Empty);
		this.ViewportChanged?.Invoke(this, EventArgs.Empty);
	}

	private static Color GetHeaderColor(DbTargetType db)
	{
		if (1 == 0)
		{
		}
		Color result = db switch
		{
			DbTargetType.PostgreSQL => HeaderColorPg, 
			DbTargetType.MySQL => HeaderColorMySql, 
			DbTargetType.MariaDB => HeaderColorMaria, 
			DbTargetType.SQLite => HeaderColorSqlite, 
			DbTargetType.SqlServer => HeaderColorSqlServer, 
			DbTargetType.VectorDb => HeaderColorVector, 
			_ => HeaderColorPg, 
		};
		if (1 == 0)
		{
		}
		return result;
	}
}

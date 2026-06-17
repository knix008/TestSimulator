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

	private static readonly Color RowEvenColor = Color.FromArgb(248, 249, 250);

	private static readonly Color RowOddColor = Color.White;

	private static readonly Color BorderColor = Color.FromArgb(180, 180, 190);

	private static readonly Color SelectionColor = Color.FromArgb(37, 99, 235);

	private static readonly Color GridMinorColor = Color.FromArgb(10, 0, 0, 0);

	private static readonly Color GridMajorColor = Color.FromArgb(22, 0, 0, 0);

	private DbSchema _schema = new DbSchema();

	private ToolMode _toolMode = ToolMode.Select;

	private float _zoom = 1f;

	private readonly VScrollBar _vScroll = new VScrollBar();

	private readonly HScrollBar _hScroll = new HScrollBar();

	private DbTable _selectedTable;

	private DbColumn _selectedColumn;

	private DbRelationship _selectedRelationship;

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

	public DbSchema Schema => _schema;

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
		BackColor = Color.FromArgb(255, 255, 255);
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
			Guid id = _selectedTable.Id;
			_schema.Tables.RemoveAll((DbTable t) => t.Id == id);
			_schema.Relationships.RemoveAll((DbRelationship r) => r.SourceTableId == id || r.TargetTableId == id);
			ClearSelection();
			NotifyChanged();
		}
		else if (_selectedRelationship != null)
		{
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
		this.SelectionChanged?.Invoke(this, EventArgs.Empty);
		Invalidate();
	}

	public void SelectTable(DbTable table)
	{
		_selectedTable = table;
		_selectedColumn = null;
		_selectedRelationship = null;
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
		RectangleF contentBounds = GetContentBounds();
		float num = (float)_hScroll.Value / _zoom;
		float num2 = (float)_vScroll.Value / _zoom;
		Size viewportSize = GetViewportSize();
		float num3 = num + (float)viewportSize.Width / _zoom;
		float num4 = num2 + (float)viewportSize.Height / _zoom;
		using Pen pen = new Pen(GridMinorColor, 1f / _zoom);
		using Pen pen2 = new Pen(GridMajorColor, 1.2f / _zoom);
		int num5 = (int)(Math.Floor(num / 20f) * 20.0);
		int num6 = (int)(Math.Floor(num2 / 20f) * 20.0);
		int num7 = (int)(Math.Floor(num / 100f) * 100.0);
		int num8 = (int)(Math.Floor(num2 / 100f) * 100.0);
		for (int i = num5; (float)i <= num3 + 20f; i += 20)
		{
			g.DrawLine(pen, i, num2, i, num4);
		}
		for (int j = num6; (float)j <= num4 + 20f; j += 20)
		{
			g.DrawLine(pen, num, j, num3, j);
		}
		for (int k = num7; (float)k <= num3 + 100f; k += 100)
		{
			g.DrawLine(pen2, k, num2, k, num4);
		}
		for (int l = num8; (float)l <= num4 + 100f; l += 100)
		{
			g.DrawLine(pen2, num, l, num3, l);
		}
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

	private bool IsRelationshipSelected(DbRelationship relationship)
	{
		return _selectedRelationship != null && _selectedRelationship.Id == relationship.Id;
	}

	private void DrawTable(Graphics g, DbTable table)
	{
		float tableHeight = GetTableHeight(table);
		RectangleF rect = new RectangleF(table.X, table.Y, table.Width, tableHeight);
		bool flag = IsTableSelected(table);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(30, 0, 0, 0));
		g.FillRectangle(brush, rect.X + 3f, rect.Y + 3f, rect.Width, rect.Height);
		using SolidBrush brush2 = new SolidBrush(Color.White);
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
		using SolidBrush solidBrush = new SolidBrush(Color.FromArgb(40, 40, 40));
		using SolidBrush brush6 = new SolidBrush(Color.FromArgb(110, 110, 120));
		using SolidBrush solidBrush2 = new SolidBrush(Color.FromArgb(180, 100, 0));
		using SolidBrush solidBrush3 = new SolidBrush(Color.FromArgb(0, 100, 160));
		for (int i = 0; i < table.Columns.Count; i++)
		{
			DbColumn col = table.Columns[i];
			if (col == null)
				continue;
			float num = rect.Y + 28f + (float)i * 22f;
			RectangleF rect3 = new RectangleF(rect.X, num, rect.Width, 22f);
			bool columnSelected = IsColumnSelected(table, col);
			using SolidBrush brush7 = new SolidBrush(columnSelected ? Color.FromArgb(255, 243, 205) : ((i % 2 == 0) ? RowEvenColor : RowOddColor));
			g.FillRectangle(brush7, rect3);
			using Pen pen = new Pen(Color.FromArgb(220, 220, 226), 0.5f / _zoom);
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
		using Pen pen2 = new Pen(flag ? SelectionColor : BorderColor, flag ? (2.5f / _zoom) : (1f / _zoom));
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
		List<PointF> pathPoints = RelationshipPathBuilder.GetPathPoints(rel, connection);
		bool flag = IsRelationshipSelected(rel);
		Color color = (flag ? SelectionColor : Color.FromArgb(100, 100, 120));
		float width = (flag ? (3f / _zoom) : (2.2f / _zoom));
		using Pen pen = new Pen(color, width)
		{
			DashStyle = DashStyle.Solid
		};
		if (rel.LineStyle == RelationshipLineStyle.Curved && pathPoints.Count > 2)
		{
			using GraphicsPath graphicsPath = new GraphicsPath();
			graphicsPath.AddLines(pathPoints.ToArray());
			g.DrawPath(pen, graphicsPath);
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
		if (flag)
		{
			DrawRelationshipRouteHandles(g, rel, connection);
		}
		if (string.IsNullOrWhiteSpace(rel.Name))
		{
			return;
		}
		PointF pathMidpoint = RelationshipPathBuilder.GetPathMidpoint(rel, connection);
		using Font font = new Font("맑은 고딕", 7.5f, FontStyle.Regular, GraphicsUnit.Point);
		using SolidBrush brush = new SolidBrush(Color.FromArgb(80, 80, 100));
		using SolidBrush brush2 = new SolidBrush(Color.FromArgb(200, 242, 242, 248));
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
		{
			return;
		}
		RelationshipPathBuilder.EnsureRoutePoints(rel, connection.Start, connection.End, connection.StartEdge, connection.EndEdge);
		float num = 5f / _zoom;
		using SolidBrush brush = new SolidBrush(Color.White);
		using Pen pen = new Pen(SelectionColor, 1.5f / _zoom);
		foreach (RelationshipPoint routePoint in rel.RoutePoints)
		{
			RectangleF rect = new RectangleF(routePoint.X - num, routePoint.Y - num, num * 2f, num * 2f);
			g.FillEllipse(brush, rect);
			g.DrawEllipse(pen, rect);
		}
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
		float handleRadius = 7f / _zoom;
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
		{
			return false;
		}
		PointF tableCenter = GetTableCenter(dbTable);
		PointF tableCenter2 = GetTableCenter(dbTable2);
		PointF start = GetConnectionPoint(dbTable, tableCenter2);
		PointF end = GetConnectionPoint(dbTable2, tableCenter);
		RectangleF tableBounds = GetTableBounds(dbTable);
		RectangleF tableBounds2 = GetTableBounds(dbTable2);
		connection = new RelationshipConnectionInfo
		{
			Start = start,
			End = end,
			StartEdge = RelationshipPathBuilder.GetConnectionEdge(tableBounds, start),
			EndEdge = RelationshipPathBuilder.GetConnectionEdge(tableBounds2, end)
		};
		return true;
	}

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
				"관계를 추가하려면 두 테이블 모두에 기본 키(PK) 컬럼이 필요합니다.\n테이블 편집에서 PK 컬럼을 지정한 후 다시 시도하세요.",
				"관계 추가",
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
			_selectedTable.X = _tableOriginAtDrag.X + (pointF.X - _dragStartCanvas.X);
			_selectedTable.Y = _tableOriginAtDrag.Y + (pointF.Y - _dragStartCanvas.Y);
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
				NotifyChanged();
			}
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
			_relSource = null;
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
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("컬럼 편집...", "Edit", delegate
			{
				this.ColumnEditRequested?.Invoke(this, new ColumnEventArgs(table, col));
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("컬럼 추가", "AddColumn", delegate
			{
				this.ColumnAddRequested?.Invoke(table, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("컬럼 삭제", "Delete", delegate
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
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("테이블 편집...", "Edit", delegate
			{
				this.TableEditRequested?.Invoke(table, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("컬럼 추가", "AddColumn", delegate
			{
				this.ColumnAddRequested?.Invoke(table, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("테이블 삭제", "Delete", delegate
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
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("테이블 편집...", "Edit", delegate
			{
				this.TableEditRequested?.Invoke(hitTable, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("컬럼 추가", "AddColumn", delegate
			{
				this.ColumnAddRequested?.Invoke(hitTable, EventArgs.Empty);
			}));
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			contextMenuStrip.Items.Add(ModernTheme.CreateMenuItem("테이블 삭제", "Delete", delegate
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
		menu.Items.Add(ModernTheme.CreateMenuItem("관계 편집...", "AddRelation", delegate
		{
			this.RelationEditRequested?.Invoke(rel, EventArgs.Empty);
		}));
		menu.Items.Add(CreateRelationshipTypeMenu(rel));
		menu.Items.Add(CreateRelationshipLineStyleMenu(rel));
		if (rel.LineStyle == RelationshipLineStyle.Orthogonal)
		{
			menu.Items.Add(ModernTheme.CreateMenuItem("꺾임 점 추가", "AddRelation", delegate
			{
				if (TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection) && RelationshipPathBuilder.TryInsertOrthogonalBend(rel, cp, connection, out _))
				{
					NotifyChanged();
					Invalidate();
				}
			}));
		}
		if (rel.LineStyle != RelationshipLineStyle.Straight)
		{
			menu.Items.Add(ModernTheme.CreateMenuItem("경로 초기화", "FitAll", delegate
			{
				if (TryGetRelationshipConnection(rel, out RelationshipConnectionInfo connection))
				{
					RelationshipPathBuilder.ResetRoutePoints(rel, connection);
					NotifyChanged();
					Invalidate();
				}
			}));
		}
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add(ModernTheme.CreateMenuItem("관계 삭제", "Delete", delegate
		{
			DeleteSelected();
		}));
	}

	private ToolStripMenuItem CreateRelationshipTypeMenu(DbRelationship rel)
	{
		ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem("관계 유형");
		ToolStripMenuItem oneToOneItem = new ToolStripMenuItem("1:1 (일대일)")
		{
			Checked = rel.Type == RelationshipType.OneToOne
		};
		ToolStripMenuItem oneToManyItem = new ToolStripMenuItem("1:N (일대다)")
		{
			Checked = rel.Type == RelationshipType.OneToMany
		};
		ToolStripMenuItem manyToManyItem = new ToolStripMenuItem("N:M (다대다)")
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
		rel.Type = type;
		SelectRelationship(rel);
		NotifyChanged();
	}

	private ToolStripMenuItem CreateRelationshipLineStyleMenu(DbRelationship rel)
	{
		ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem("선 스타일");
		ToolStripMenuItem straightItem = new ToolStripMenuItem("직선")
		{
			Checked = rel.LineStyle == RelationshipLineStyle.Straight
		};
		ToolStripMenuItem curvedItem = new ToolStripMenuItem("곡선")
		{
			Checked = rel.LineStyle == RelationshipLineStyle.Curved
		};
		ToolStripMenuItem orthogonalItem = new ToolStripMenuItem("꺾은선")
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
		menu.Items.Add(ModernTheme.CreateMenuItem("여기에 새 테이블 추가", "AddTable", delegate
		{
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
		menu.Items.Add(ModernTheme.CreateMenuItem("화면 맞춤", "FitAll", delegate
		{
			FitAll();
		}));
		menu.Items.Add(ModernTheme.CreateMenuItem("확대", "ZoomIn", delegate
		{
			ZoomIn();
		}));
		menu.Items.Add(ModernTheme.CreateMenuItem("축소", "ZoomOut", delegate
		{
			ZoomOut();
		}));
		menu.Items.Add(ModernTheme.CreateMenuItem("배율 100%로 복원", "FitAll", delegate
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
		return RelationshipPathBuilder.HitTest(rel, p, connection, 6f / _zoom);
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

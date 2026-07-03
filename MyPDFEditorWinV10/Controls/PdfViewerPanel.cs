using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using MyPDFEditorWinV10.App;
using MyPDFEditorWinV10.Models;
using MyPDFEditorWinV10.Services;
using PdfiumViewer;

namespace MyPDFEditorWinV10.Controls;

public enum PdfInteractionMode
{
	TextSelect,
	ImageSelect
}

internal enum ImageSelectionKind
{
	None,
	Region,
	Embedded
}

public partial class PdfViewerPanel : UserControl
{
	private const int ClickDragThreshold = 5;
	private const float MinEditorFontSize = 10f;
	private const float MaxEditorFontSize = 18f;

	private PdfViewer _viewer;
	private SelectionOverlay _selectionOverlay;
	private ContextMenuStrip _contextMenu;
	private Point? _selectStart;
	private Rectangle _regionSelection = Rectangle.Empty;
	private bool _isSelecting;
	private PdfInteractionMode _interactionMode = PdfInteractionMode.TextSelect;
	private ImageSelectionKind _imageSelectionKind = ImageSelectionKind.None;
	private readonly List<PdfImageBlock> _pageImages = new();
	private PdfImageBlock _selectedEmbeddedImage;
	private PdfImageBlock _hoveredEmbeddedImage;
	private bool _hoverOverText;
	private Point? _mouseDownRendererPoint;
	private IList<PdfTextBlock> _textBlocks;
	private TextBox _inlineTextBox;
	private PdfTextBlock _editingBlock;
	private Font _inlineEditorFont;

	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	[Browsable(false)]
	public IList<PdfTextBlock> TextBlocks
	{
		get => _textBlocks;
		set => _textBlocks = value;
	}

	public bool IsInlineEditing => _editingBlock != null;

	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	[Browsable(false)]
	public PdfInteractionMode InteractionMode
	{
		get => _interactionMode;
		set
		{
			if (_interactionMode == value)
			{
				return;
			}

			_interactionMode = value;
			ApplyInteractionMode();
			InteractionModeChanged?.Invoke(this, EventArgs.Empty);
		}
	}

	[DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
	[Browsable(false)]
	public bool ImageSelectionMode
	{
		get => _interactionMode == PdfInteractionMode.ImageSelect;
		set => InteractionMode = value ? PdfInteractionMode.ImageSelect : PdfInteractionMode.TextSelect;
	}

	public bool HasRegionSelection => _imageSelectionKind == ImageSelectionKind.Region && _regionSelection.Width >= 4 && _regionSelection.Height >= 4;

	public bool HasEmbeddedImageSelection => _imageSelectionKind == ImageSelectionKind.Embedded && _selectedEmbeddedImage != null;

	public bool HasImageSelection => HasRegionSelection || HasEmbeddedImageSelection;

	public bool HasSelection => HasImageSelection;

	public bool HasTextSelection => _viewer?.Renderer.IsTextSelected == true;

	public PdfViewerPanel()
	{
		InitializeComponent();

		if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
		{
			_viewer = null;
			return;
		}

		_viewer = new PdfViewer
		{
			Dock = DockStyle.Fill,
			ShowToolbar = false,
			ShowBookmarks = false
		};

		PdfRenderer renderer = _viewer.Renderer;
		renderer.Layout += (_, _) =>
		{
			RefreshSelectionOverlay();
			RepositionInlineEditor();
		};
		renderer.MouseDown += Renderer_MouseDown;
		renderer.MouseMove += Renderer_MouseMove;
		renderer.MouseUp += Renderer_MouseUp;
		renderer.MouseLeave += Renderer_MouseLeave;
		renderer.MouseWheel += (_, _) => BeginInvoke(RefreshSelectionOverlay);
		renderer.MouseDoubleClick += Renderer_MouseDoubleClick;

		_selectionOverlay = new SelectionOverlay
		{
			Dock = DockStyle.Fill,
			Visible = true
		};
		_selectionOverlay.Paint += SelectionOverlay_Paint;

		Controls.Add(_viewer);
		Controls.Add(_selectionOverlay);
		ApplyInteractionMode();
	}

	public event EventHandler<int> PageChanged;

	public event EventHandler SelectionChanged;

	public event EventHandler TextSelectionChanged;

	public event EventHandler InteractionModeChanged;

	public event EventHandler TextBlockEdited;

	public bool HasDocument => _viewer?.Document != null;

	public int PageCount => _viewer?.Document?.PageCount ?? 0;

	public int GetActivePageIndex() => _viewer?.Renderer.Page ?? 0;

	public void AttachContextMenu(ContextMenuStrip menu)
	{
		_contextMenu = menu;
	}

	public string GetSelectedText()
	{
		if (_viewer?.Renderer.IsTextSelected != true)
		{
			return string.Empty;
		}

		return _viewer.Renderer.SelectedText ?? string.Empty;
	}

	public IReadOnlyList<PdfBounds> GetTextSelectionPdfBounds()
	{
		if (_viewer?.Renderer == null)
		{
			return Array.Empty<PdfBounds>();
		}

		return PdfRendererSelectionHelper.GetSelectionPdfBounds(_viewer.Renderer);
	}

	public void SetActivePageIndex(int pageIndex)
	{
		if (_viewer?.Document != null)
		{
			int clamped = Math.Clamp(pageIndex, 0, _viewer.Document.PageCount - 1);
			if (clamped != _viewer.Renderer.Page)
			{
				EndInlineEdit(commit: true);
			}

			_viewer.Renderer.Page = clamped;
			ClearImageSelection();
			RefreshSelectionOverlay();
		}
	}

	public void LoadDocument(string filePath, string password = null)
	{
		if (_viewer == null)
		{
			return;
		}

		EndInlineEdit(commit: false);
		CloseDocument();
		_viewer.Document = string.IsNullOrEmpty(password)
			? PdfDocument.Load(filePath)
			: PdfDocument.Load(filePath, password);
		_viewer.Renderer.Page = 0;
		_viewer.ZoomMode = PdfViewerZoomMode.FitWidth;
		LoadPageImages(filePath, password);
		ClearImageSelection();
		PageChanged?.Invoke(this, _viewer.Renderer.Page);
		ApplyInteractionMode();
	}

	public void ReloadDocument(string filePath, string password = null)
	{
		if (_viewer == null || string.IsNullOrWhiteSpace(filePath))
		{
			return;
		}

		int pageIndex = GetActivePageIndex();
		EndInlineEdit(commit: false);

		_viewer.Document?.Dispose();
		_viewer.Document = string.IsNullOrEmpty(password)
			? PdfDocument.Load(filePath)
			: PdfDocument.Load(filePath, password);
		_viewer.Renderer.Page = Math.Clamp(pageIndex, 0, Math.Max(0, _viewer.Document.PageCount - 1));
		LoadPageImages(filePath, password);
		ClearImageSelection();
		PdfRendererSelectionHelper.ClearTextSelection(_viewer.Renderer);
		RefreshSelectionOverlay();
		PageChanged?.Invoke(this, _viewer.Renderer.Page);
	}

	public void CloseDocument()
	{
		if (_viewer == null)
		{
			return;
		}

		EndInlineEdit(commit: false);
		ClearPageImages();
		_viewer.Document?.Dispose();
		_viewer.Document = null;
		ClearImageSelection();
		_interactionMode = PdfInteractionMode.TextSelect;
		ApplyInteractionMode();
	}

	public void ZoomIn()
	{
		_viewer?.Renderer.ZoomIn();
		RefreshSelectionOverlay();
	}

	public void ZoomOut()
	{
		_viewer?.Renderer.ZoomOut();
		RefreshSelectionOverlay();
	}

	public void PreviousPage()
	{
		if (_viewer == null || _viewer.Document == null || _viewer.Renderer.Page <= 0)
		{
			return;
		}

		EndInlineEdit(commit: true);
		_viewer.Renderer.Page--;
		ClearImageSelection();
		PageChanged?.Invoke(this, _viewer.Renderer.Page);
		RefreshSelectionOverlay();
	}

	public void NextPage()
	{
		if (_viewer == null || _viewer.Document == null || _viewer.Renderer.Page >= _viewer.Document.PageCount - 1)
		{
			return;
		}

		EndInlineEdit(commit: true);
		_viewer.Renderer.Page++;
		ClearImageSelection();
		PageChanged?.Invoke(this, _viewer.Renderer.Page);
		RefreshSelectionOverlay();
	}

	public void ClearSelection()
	{
		ClearImageSelection();
	}

	public void ClearImageSelection()
	{
		bool hadSelection = HasImageSelection;
		_selectStart = null;
		_isSelecting = false;
		_regionSelection = Rectangle.Empty;
		_imageSelectionKind = ImageSelectionKind.None;
		_selectedEmbeddedImage = null;
		RefreshSelectionOverlay();
		if (hadSelection)
		{
			SelectionChanged?.Invoke(this, EventArgs.Empty);
		}
	}

	public bool TryGetSelectedImage(out Bitmap bitmap)
	{
		bitmap = null;
		if (_viewer == null || _viewer.Document == null || !HasImageSelection)
		{
			return false;
		}

		if (HasEmbeddedImageSelection)
		{
			if (_selectedEmbeddedImage.Bitmap != null)
			{
				bitmap = new Bitmap(_selectedEmbeddedImage.Bitmap);
				return true;
			}

			return TryCropEmbeddedImageFromPage(_selectedEmbeddedImage, out bitmap);
		}

		if (!HasRegionSelection)
		{
			return false;
		}

		Rectangle rendererSelection = OverlayRectToRenderer(_regionSelection);
		int page = _viewer.Renderer.Page;
		Rectangle pageBounds = _viewer.Renderer.GetOuterBounds(page);
		Rectangle intersect = Rectangle.Intersect(rendererSelection, pageBounds);
		if (intersect.Width < 4 || intersect.Height < 4)
		{
			return false;
		}

		PdfRectangle pdfBounds = _viewer.Renderer.BoundsToPdf(intersect);
		if (!pdfBounds.IsValid)
		{
			return false;
		}

		SizeF pageSize = _viewer.Document.PageSizes[page];
		int renderWidth = Math.Max(1, (int)Math.Ceiling(pageSize.Width));
		int renderHeight = Math.Max(1, (int)Math.Ceiling(pageSize.Height));
		using Image pageImage = _viewer.Document.Render(page, renderWidth, renderHeight, 96f, 96f, PdfRenderFlags.Annotations);
		float relX = (intersect.X - pageBounds.X) / (float)pageBounds.Width;
		float relY = (intersect.Y - pageBounds.Y) / (float)pageBounds.Height;
		float relW = intersect.Width / (float)pageBounds.Width;
		float relH = intersect.Height / (float)pageBounds.Height;
		int cropX = (int)Math.Round(relX * pageImage.Width);
		int cropY = (int)Math.Round(relY * pageImage.Height);
		int cropW = Math.Max(1, (int)Math.Round(relW * pageImage.Width));
		int cropH = Math.Max(1, (int)Math.Round(relH * pageImage.Height));
		cropX = Math.Clamp(cropX, 0, pageImage.Width - 1);
		cropY = Math.Clamp(cropY, 0, pageImage.Height - 1);
		cropW = Math.Clamp(cropW, 1, pageImage.Width - cropX);
		cropH = Math.Clamp(cropH, 1, pageImage.Height - cropY);

		Rectangle cropRect = new Rectangle(cropX, cropY, cropW, cropH);
		bitmap = new Bitmap(cropW, cropH);
		using Graphics g = Graphics.FromImage(bitmap);
		g.DrawImage(pageImage, new Rectangle(0, 0, cropW, cropH), cropRect, GraphicsUnit.Pixel);
		return true;
	}

	private void LoadPageImages(string filePath, string password = null)
	{
		ClearPageImages();
		foreach (PdfImageBlock image in PdfContentExtractor.ExtractImageRegions(filePath, password))
		{
			_pageImages.Add(image);
		}
	}

	private void ClearPageImages()
	{
		foreach (PdfImageBlock image in _pageImages)
		{
			image.Dispose();
		}

		_pageImages.Clear();
		if (_selectedEmbeddedImage != null && !_pageImages.Contains(_selectedEmbeddedImage))
		{
			_selectedEmbeddedImage = null;
		}
	}

	private void ApplyInteractionMode()
	{
		if (_viewer == null || _selectionOverlay == null)
		{
			return;
		}

		PdfRenderer renderer = _viewer.Renderer;
		switch (_interactionMode)
		{
			case PdfInteractionMode.TextSelect:
				renderer.CursorMode = PdfViewerCursorMode.TextSelection;
				ClearImageSelection();
				break;
			case PdfInteractionMode.ImageSelect:
				renderer.CursorMode = PdfViewerCursorMode.Pan;
				break;
		}

		UpdateHoverCursor();
		renderer.Invalidate();
		RefreshSelectionOverlay();
	}

	private void RefreshSelectionOverlay()
	{
		if (_selectionOverlay == null || _viewer?.Document == null)
		{
			return;
		}

		Region region = BuildOverlayRegion();
		if (region == null)
		{
			_selectionOverlay.Visible = false;
			Region oldHiddenRegion = _selectionOverlay.Region;
			_selectionOverlay.Region = null;
			oldHiddenRegion?.Dispose();
			return;
		}

		_selectionOverlay.Visible = true;
		Region oldRegion = _selectionOverlay.Region;
		_selectionOverlay.Region = region;
		oldRegion?.Dispose();
		_selectionOverlay.Invalidate();
	}

	private Region BuildOverlayRegion()
	{
		GraphicsPath path = new GraphicsPath();
		try
		{
			if (_interactionMode == PdfInteractionMode.TextSelect)
			{
				foreach (Rectangle rect in PdfRendererSelectionHelper.GetSelectionRectangles(_viewer.Renderer))
				{
					AddOverlayRect(path, RendererRectToOverlay(rect));
				}
			}

			if (_hoveredEmbeddedImage != null && _hoveredEmbeddedImage != _selectedEmbeddedImage)
			{
				AddOverlayRect(path, PdfBlockToOverlay(
					_hoveredEmbeddedImage.PageIndex,
					_hoveredEmbeddedImage.Left,
					_hoveredEmbeddedImage.Bottom,
					_hoveredEmbeddedImage.Right,
					_hoveredEmbeddedImage.Top));
			}

			if (HasEmbeddedImageSelection)
			{
				PdfImageBlock image = _selectedEmbeddedImage;
				AddOverlayRect(path, PdfBlockToOverlay(image.PageIndex, image.Left, image.Bottom, image.Right, image.Top));
			}

			if (_interactionMode == PdfInteractionMode.ImageSelect && (_isSelecting || HasRegionSelection))
			{
				AddOverlayRect(path, _regionSelection);
			}

			if (path.PointCount == 0)
			{
				return null;
			}

			return new Region(path);
		}
		finally
		{
			path.Dispose();
		}
	}

	private static void AddOverlayRect(GraphicsPath path, Rectangle rect)
	{
		if (rect.Width >= 1 && rect.Height >= 1)
		{
			path.AddRectangle(Rectangle.Inflate(rect, 1, 1));
		}
	}

	private Rectangle RendererRectToOverlay(Rectangle rendererRect)
	{
		if (rendererRect.IsEmpty)
		{
			return Rectangle.Empty;
		}

		Point overlayPoint = _selectionOverlay.PointToClient(_viewer.Renderer.PointToScreen(rendererRect.Location));
		return new Rectangle(overlayPoint, rendererRect.Size);
	}

	private Rectangle PdfBoundsToOverlay(PdfRectangle pdfRect)
	{
		Rectangle rendererBounds = _viewer.Renderer.BoundsFromPdf(pdfRect);
		if (rendererBounds.IsEmpty)
		{
			return Rectangle.Empty;
		}

		Point overlayPoint = _selectionOverlay.PointToClient(_viewer.Renderer.PointToScreen(rendererBounds.Location));
		return new Rectangle(overlayPoint, rendererBounds.Size);
	}

	private Rectangle PdfBlockToOverlay(int pageIndex, double left, double bottom, double right, double top)
	{
		return PdfBoundsToOverlay(PdfImageGeometry.ToPdfRectangle(pageIndex, left, bottom, right, top));
	}

	private Point RendererPointToOverlay(Point rendererPoint)
	{
		return _selectionOverlay.PointToClient(_viewer.Renderer.PointToScreen(rendererPoint));
	}

	private Point OverlayPointToRenderer(Point overlayPoint)
	{
		return _viewer.Renderer.PointToClient(_selectionOverlay.PointToScreen(overlayPoint));
	}

	private Rectangle OverlayRectToRenderer(Rectangle overlayRect)
	{
		Point topLeft = OverlayPointToRenderer(overlayRect.Location);
		Point bottomRight = OverlayPointToRenderer(new Point(overlayRect.Right, overlayRect.Bottom));
		return NormalizeRectangle(topLeft, bottomRight);
	}

	private void SelectionOverlay_Paint(object sender, PaintEventArgs e)
	{
		if (_viewer?.Document == null)
		{
			return;
		}

		DrawHoveredEmbeddedImage(e.Graphics);

		if (_interactionMode == PdfInteractionMode.TextSelect)
		{
			DrawTextSelection(e.Graphics);
		}

		if (HasEmbeddedImageSelection)
		{
			DrawEmbeddedImageSelection(e.Graphics);
		}

		if (_interactionMode == PdfInteractionMode.ImageSelect && (_isSelecting || HasRegionSelection))
		{
			DrawRegionSelection(e.Graphics);
		}
	}

	private void DrawTextSelection(Graphics graphics)
	{
		foreach (Rectangle rendererRect in PdfRendererSelectionHelper.GetSelectionRectangles(_viewer.Renderer))
		{
			Rectangle overlayRect = RendererRectToOverlay(rendererRect);
			using SolidBrush fill = new SolidBrush(Color.FromArgb(120, 30, 144, 255));
			graphics.FillRectangle(fill, overlayRect);
			using Pen pen = new Pen(Color.FromArgb(220, 0, 90, 200), 1.5f);
			graphics.DrawRectangle(pen, overlayRect);
		}
	}

	private void DrawHoveredEmbeddedImage(Graphics graphics)
	{
		if (_hoveredEmbeddedImage == null || _hoveredEmbeddedImage == _selectedEmbeddedImage)
		{
			return;
		}

		Rectangle bounds = PdfBlockToOverlay(_hoveredEmbeddedImage.PageIndex, _hoveredEmbeddedImage.Left, _hoveredEmbeddedImage.Bottom, _hoveredEmbeddedImage.Right, _hoveredEmbeddedImage.Top);
		if (bounds.Width < 4 || bounds.Height < 4)
		{
			return;
		}

		using SolidBrush fill = new SolidBrush(Color.FromArgb(35, 255, 140, 0));
		graphics.FillRectangle(fill, bounds);
		using Pen pen = new Pen(Color.FromArgb(200, 255, 120, 0), 2f);
		pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dot;
		graphics.DrawRectangle(pen, bounds);
	}

	private void DrawEmbeddedImageSelection(Graphics graphics)
	{
		PdfImageBlock image = _selectedEmbeddedImage;
		Rectangle bounds = PdfBlockToOverlay(image.PageIndex, image.Left, image.Bottom, image.Right, image.Top);
		if (bounds.Width < 4 || bounds.Height < 4)
		{
			return;
		}

		using SolidBrush fill = new SolidBrush(Color.FromArgb(60, 255, 140, 0));
		graphics.FillRectangle(fill, bounds);
		using Pen pen = new Pen(Color.OrangeRed, 2.5f);
		graphics.DrawRectangle(pen, bounds);
	}

	private void DrawRegionSelection(Graphics graphics)
	{
		Rectangle drawRect = _isSelecting || HasRegionSelection ? _regionSelection : Rectangle.Empty;
		if (drawRect.Width <= 0 || drawRect.Height <= 0)
		{
			return;
		}

		using Pen pen = new Pen(Color.DodgerBlue, 2f);
		pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
		graphics.DrawRectangle(pen, drawRect);
		using SolidBrush fill = new SolidBrush(Color.FromArgb(50, 30, 144, 255));
		graphics.FillRectangle(fill, drawRect);
	}

	private void Renderer_MouseDown(object sender, MouseEventArgs e)
	{
		if (_viewer?.Document == null)
		{
			return;
		}

		if (_interactionMode == PdfInteractionMode.ImageSelect && e.Button == MouseButtons.Left)
		{
			Point overlayPoint = RendererPointToOverlay(e.Location);
			_mouseDownRendererPoint = e.Location;
			_selectStart = overlayPoint;
			_isSelecting = true;
			_regionSelection = new Rectangle(overlayPoint.X, overlayPoint.Y, 0, 0);
			_imageSelectionKind = ImageSelectionKind.None;
			_selectedEmbeddedImage = null;
			RefreshSelectionOverlay();
			return;
		}

		if (_interactionMode == PdfInteractionMode.TextSelect && e.Button == MouseButtons.Left)
		{
			_mouseDownRendererPoint = e.Location;
			RefreshSelectionOverlay();
		}
	}

	private void Renderer_MouseMove(object sender, MouseEventArgs e)
	{
		UpdateHoverState(e.Location);
		UpdateHoverCursor();

		if (_interactionMode == PdfInteractionMode.ImageSelect && _isSelecting && _selectStart.HasValue)
		{
			Point overlayPoint = RendererPointToOverlay(e.Location);
			_regionSelection = NormalizeRectangle(_selectStart.Value, overlayPoint);
			RefreshSelectionOverlay();
			return;
		}

		RefreshSelectionOverlay();
	}

	private void Renderer_MouseLeave(object sender, EventArgs e)
	{
		_hoveredEmbeddedImage = null;
		_hoverOverText = false;
		if (_viewer?.Renderer != null)
		{
			_viewer.Renderer.Cursor = PdfCursorFactory.DefaultHover;
		}
	}

	private void UpdateHoverState(Point rendererPoint)
	{
		if (_viewer?.Document == null)
		{
			_hoveredEmbeddedImage = null;
			_hoverOverText = false;
			return;
		}

		if (TryGetEmbeddedImageAt(rendererPoint, out PdfImageBlock image))
		{
			_hoveredEmbeddedImage = image;
			_hoverOverText = false;
			return;
		}

		_hoveredEmbeddedImage = null;
		_hoverOverText = PdfRendererSelectionHelper.IsOverText(_viewer.Renderer, rendererPoint);
	}

	private void UpdateHoverCursor()
	{
		if (_viewer?.Renderer == null)
		{
			return;
		}

		if (_hoveredEmbeddedImage != null)
		{
			_viewer.Renderer.Cursor = PdfCursorFactory.ImageHover;
		}
		else if (_hoverOverText)
		{
			_viewer.Renderer.Cursor = PdfCursorFactory.TextHover;
		}
		else
		{
			_viewer.Renderer.Cursor = PdfCursorFactory.DefaultHover;
		}
	}

	private void Renderer_MouseUp(object sender, MouseEventArgs e)
	{
		if (_viewer?.Document == null)
		{
			return;
		}

		if (e.Button == MouseButtons.Right)
		{
			_contextMenu?.Show(_viewer.Renderer, e.Location);
			return;
		}

		if (_interactionMode == PdfInteractionMode.ImageSelect)
		{
			_isSelecting = false;
			Point overlayPoint = RendererPointToOverlay(e.Location);
			bool wasClick = _selectStart.HasValue &&
				Math.Abs(overlayPoint.X - _selectStart.Value.X) < ClickDragThreshold &&
				Math.Abs(overlayPoint.Y - _selectStart.Value.Y) < ClickDragThreshold;

			if (wasClick && TryGetEmbeddedImageAt(e.Location, out PdfImageBlock hit))
			{
				SelectEmbeddedImage(hit);
			}
			else if (wasClick)
			{
				ClearImageSelection();
			}
			else if (_selectStart.HasValue)
			{
				_regionSelection = NormalizeRectangle(_selectStart.Value, overlayPoint);
				if (_regionSelection.Width >= 4 && _regionSelection.Height >= 4)
				{
					_imageSelectionKind = ImageSelectionKind.Region;
					_selectedEmbeddedImage = null;
				}
				else
				{
					ClearImageSelection();
					_selectStart = null;
					return;
				}
			}

			_selectStart = null;
			_mouseDownRendererPoint = null;
			RefreshSelectionOverlay();
			SelectionChanged?.Invoke(this, EventArgs.Empty);
			return;
		}

		if (_interactionMode == PdfInteractionMode.TextSelect && e.Button == MouseButtons.Left)
		{
			bool wasClick = _mouseDownRendererPoint.HasValue &&
				Math.Abs(e.X - _mouseDownRendererPoint.Value.X) < ClickDragThreshold &&
				Math.Abs(e.Y - _mouseDownRendererPoint.Value.Y) < ClickDragThreshold;

			_mouseDownRendererPoint = null;

			if (wasClick && TryGetEmbeddedImageAt(e.Location, out PdfImageBlock hit))
			{
				SelectEmbeddedImage(hit);
				PdfRendererSelectionHelper.ClearTextSelection(_viewer.Renderer);
				RefreshSelectionOverlay();
				SelectionChanged?.Invoke(this, EventArgs.Empty);
				return;
			}

			BeginInvoke(() =>
			{
				RefreshSelectionOverlay();
				TextSelectionChanged?.Invoke(this, EventArgs.Empty);
			});
		}
	}

	private void SelectEmbeddedImage(PdfImageBlock image)
	{
		_selectedEmbeddedImage = image;
		_imageSelectionKind = ImageSelectionKind.Embedded;
		_regionSelection = Rectangle.Empty;
		_isSelecting = false;
		_selectStart = null;
	}

	private bool TryGetEmbeddedImageAt(Point rendererPoint, out PdfImageBlock hit)
	{
		hit = null;
		if (_viewer?.Document == null)
		{
			return false;
		}

		PdfRenderer renderer = _viewer.Renderer;
		PdfPoint pdfPoint = renderer.PointToPdf(rendererPoint);
		if (!pdfPoint.IsValid || pdfPoint.Page != renderer.Page)
		{
			return false;
		}

		int pageIndex = renderer.Page;
		PointF location = pdfPoint.Location;
		foreach (PdfImageBlock image in _pageImages.Where(image => image.PageIndex == pageIndex))
		{
			if (PdfImageGeometry.ContainsPdfPoint(image.Left, image.Bottom, image.Right, image.Top, location))
			{
				hit = image;
				return true;
			}
		}

		return false;
	}

	private bool TryCropEmbeddedImageFromPage(PdfImageBlock image, out Bitmap bitmap)
	{
		bitmap = null;
		if (_viewer?.Document == null)
		{
			return false;
		}

		Rectangle rendererBounds = _viewer.Renderer.BoundsFromPdf(
			PdfImageGeometry.ToPdfRectangle(image.PageIndex, image.Left, image.Bottom, image.Right, image.Top));
		if (rendererBounds.IsEmpty)
		{
			return false;
		}

		int page = image.PageIndex;
		Rectangle pageBounds = _viewer.Renderer.GetOuterBounds(page);
		Rectangle intersect = Rectangle.Intersect(rendererBounds, pageBounds);
		if (intersect.Width < 4 || intersect.Height < 4)
		{
			return false;
		}

		SizeF pageSize = _viewer.Document.PageSizes[page];
		int renderWidth = Math.Max(1, (int)Math.Ceiling(pageSize.Width));
		int renderHeight = Math.Max(1, (int)Math.Ceiling(pageSize.Height));
		using Image pageImage = _viewer.Document.Render(page, renderWidth, renderHeight, 96f, 96f, PdfRenderFlags.Annotations);
		float relX = (intersect.X - pageBounds.X) / (float)pageBounds.Width;
		float relY = (intersect.Y - pageBounds.Y) / (float)pageBounds.Height;
		float relW = intersect.Width / (float)pageBounds.Width;
		float relH = intersect.Height / (float)pageBounds.Height;
		int cropX = (int)Math.Round(relX * pageImage.Width);
		int cropY = (int)Math.Round(relY * pageImage.Height);
		int cropW = Math.Max(1, (int)Math.Round(relW * pageImage.Width));
		int cropH = Math.Max(1, (int)Math.Round(relH * pageImage.Height));
		cropX = Math.Clamp(cropX, 0, pageImage.Width - 1);
		cropY = Math.Clamp(cropY, 0, pageImage.Height - 1);
		cropW = Math.Clamp(cropW, 1, pageImage.Width - cropX);
		cropH = Math.Clamp(cropH, 1, pageImage.Height - cropY);

		Rectangle cropRect = new Rectangle(cropX, cropY, cropW, cropH);
		bitmap = new Bitmap(cropW, cropH);
		using Graphics g = Graphics.FromImage(bitmap);
		g.DrawImage(pageImage, new Rectangle(0, 0, cropW, cropH), cropRect, GraphicsUnit.Pixel);
		return true;
	}

	private void Renderer_MouseDoubleClick(object sender, MouseEventArgs e)
	{
		if (_viewer?.Document == null || _interactionMode != PdfInteractionMode.TextSelect || e.Button != MouseButtons.Left)
		{
			return;
		}

		if (TryGetTextBlockAt(e.Location, out PdfTextBlock block))
		{
			BeginInlineEdit(block);
		}
	}

	public bool BeginInlineEditForSelection()
	{
		if (_viewer?.Document == null || _textBlocks == null || _textBlocks.Count == 0 || !HasTextSelection)
		{
			return false;
		}

		IReadOnlyList<PdfBounds> selectionBounds = GetTextSelectionPdfBounds();
		if (selectionBounds.Count == 0)
		{
			return false;
		}

		int pageIndex = _viewer.Renderer.Page;
		List<PdfBounds> pageBounds = selectionBounds.Where(bounds => bounds.PageIndex == pageIndex).ToList();
		if (pageBounds.Count == 0)
		{
			return false;
		}

		PdfTextBlock target = TextBlockEditor.ResolveEditTarget(_textBlocks, pageIndex, pageBounds);
		if (target == null)
		{
			return false;
		}

		BeginInlineEdit(target);
		return true;
	}

	public void BeginInlineEdit(PdfTextBlock block)
	{
		if (_viewer?.Document == null || block == null || block.PageIndex != _viewer.Renderer.Page)
		{
			return;
		}

		EndInlineEdit(commit: true);

		_editingBlock = block;
		Rectangle blockBounds = PdfBlockToOverlay(block.PageIndex, block.Left, block.Bottom, block.Right, block.Top);
		Rectangle editorBounds = CalculateEditorBounds(blockBounds, block, block.Text ?? string.Empty, out bool needsVerticalScroll);

		_inlineTextBox = new TextBox
		{
			BorderStyle = BorderStyle.FixedSingle,
			BackColor = Color.FromArgb(255, 255, 252, 210),
			Text = block.Text ?? string.Empty,
			Multiline = true,
			AcceptsReturn = true,
			AcceptsTab = false,
			ScrollBars = needsVerticalScroll ? ScrollBars.Vertical : ScrollBars.None,
			WordWrap = true
		};
		ApplyInlineEditorLayout(editorBounds, block, blockBounds);
		_inlineTextBox.KeyDown += InlineTextBox_KeyDown;
		_inlineTextBox.LostFocus += InlineTextBox_LostFocus;

		Controls.Add(_inlineTextBox);
		_inlineTextBox.BringToFront();
		_inlineTextBox.Focus();
		_inlineTextBox.SelectAll();
		PdfRendererSelectionHelper.ClearTextSelection(_viewer.Renderer);
		RefreshSelectionOverlay();
	}

	public void EndInlineEdit(bool commit)
	{
		if (_editingBlock == null || _inlineTextBox == null)
		{
			return;
		}

		PdfTextBlock block = _editingBlock;
		TextBox textBox = _inlineTextBox;
		_editingBlock = null;
		_inlineTextBox = null;

		string newText = textBox.Text ?? string.Empty;
		bool changed = commit && !string.Equals(newText, block.Text, StringComparison.Ordinal);

		textBox.KeyDown -= InlineTextBox_KeyDown;
		textBox.LostFocus -= InlineTextBox_LostFocus;
		Controls.Remove(textBox);
		textBox.Dispose();
		DisposeInlineEditorFont();

		if (changed)
		{
			block.Text = newText;
			TextBlockEdited?.Invoke(this, EventArgs.Empty);
		}

		RefreshSelectionOverlay();
	}

	private void InlineTextBox_KeyDown(object sender, KeyEventArgs e)
	{
		if (e.KeyCode == Keys.Escape)
		{
			EndInlineEdit(commit: false);
			e.Handled = true;
			e.SuppressKeyPress = true;
			return;
		}

		if (e.KeyCode == Keys.Enter && !e.Shift)
		{
			EndInlineEdit(commit: true);
			e.Handled = true;
			e.SuppressKeyPress = true;
		}
	}

	private void InlineTextBox_LostFocus(object sender, EventArgs e)
	{
		if (_editingBlock != null)
		{
			EndInlineEdit(commit: true);
		}
	}

	private void RepositionInlineEditor()
	{
		if (_editingBlock == null || _inlineTextBox == null)
		{
			return;
		}

		Rectangle blockBounds = PdfBlockToOverlay(_editingBlock.PageIndex, _editingBlock.Left, _editingBlock.Bottom, _editingBlock.Right, _editingBlock.Top);
		Rectangle editorBounds = CalculateEditorBounds(blockBounds, _editingBlock, _inlineTextBox.Text ?? string.Empty, out bool needsVerticalScroll);
		_inlineTextBox.ScrollBars = needsVerticalScroll ? ScrollBars.Vertical : ScrollBars.None;
		ApplyInlineEditorLayout(editorBounds, _editingBlock, blockBounds);
	}

	private Rectangle CalculateEditorBounds(Rectangle blockBounds, PdfTextBlock block, string text, out bool needsVerticalScroll)
	{
		const int minWidth = 180;
		const int minHeight = 36;
		const int maxEditorHeight = 320;
		const int padding = 10;

		int width = Math.Max(blockBounds.Width, minWidth);
		if (_selectionOverlay != null)
		{
			int maxWidth = Math.Max(minWidth, _selectionOverlay.Width - blockBounds.X - 4);
			width = Math.Min(width, maxWidth);
		}

		float fontSize = EstimateEditorFontSize(blockBounds, block);
		using Font font = CreateReadableEditorFont(fontSize);
		string measureText = string.IsNullOrEmpty(text) ? " " : text.Replace("\r\n", "\n");
		Size textSize = TextRenderer.MeasureText(
			measureText,
			font,
			new Size(Math.Max(1, width - padding), int.MaxValue),
			TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl);

		int lineCount = measureText.Split('\n').Length;
		int lineHeight = Math.Max(16, (int)Math.Ceiling(fontSize * 1.35f));
		int desiredHeight = Math.Max(
			Math.Max(blockBounds.Height, minHeight),
			Math.Max(textSize.Height + padding, lineCount * lineHeight + padding));

		int maxHeight = maxEditorHeight;
		if (_selectionOverlay != null)
		{
			int availableBelow = _selectionOverlay.Height - blockBounds.Y - 4;
			maxHeight = Math.Min(maxHeight, Math.Max(minHeight, availableBelow));
		}

		needsVerticalScroll = desiredHeight > maxHeight;
		int height = Math.Min(desiredHeight, maxHeight);
		return new Rectangle(blockBounds.X, blockBounds.Y, width, height);
	}

	private void ApplyInlineEditorLayout(Rectangle editorBounds, PdfTextBlock block, Rectangle blockBounds)
	{
		_inlineTextBox.SetBounds(editorBounds.X, editorBounds.Y, editorBounds.Width, editorBounds.Height);
		float fontSize = EstimateEditorFontSize(blockBounds, block);
		Font newFont = CreateReadableEditorFont(fontSize);
		Font previousFont = _inlineEditorFont;
		_inlineEditorFont = newFont;
		_inlineTextBox.Font = newFont;
		if (!ReferenceEquals(previousFont, newFont))
		{
			previousFont?.Dispose();
		}
		_inlineTextBox.ForeColor = Color.Black;
	}

	private static Font CreateReadableEditorFont(float fontSize)
	{
		float normalized = Math.Clamp(fontSize, MinEditorFontSize, MaxEditorFontSize);
		try
		{
			return new Font("Malgun Gothic", normalized, FontStyle.Regular, GraphicsUnit.Point);
		}
		catch
		{
			return new Font(FontFamily.GenericSansSerif, normalized, FontStyle.Regular, GraphicsUnit.Point);
		}
	}

	private void DisposeInlineEditorFont()
	{
		Font font = _inlineEditorFont;
		_inlineEditorFont = null;
		font?.Dispose();
	}

	private static float EstimateEditorFontSize(Rectangle blockBounds, PdfTextBlock block)
	{
		double pdfHeight = block.Top - block.Bottom;
		float scale = pdfHeight > 0 ? blockBounds.Height / (float)pdfHeight : 1f;
		if (block.FontSize > 0)
		{
			return Math.Max(MinEditorFontSize, Math.Min((float)block.FontSize * scale, MaxEditorFontSize));
		}

		return Math.Max(MinEditorFontSize, Math.Min(blockBounds.Height * 0.55f, MaxEditorFontSize));
	}

	private bool TryGetTextBlockAt(Point rendererPoint, out PdfTextBlock block)
	{
		block = null;
		if (_viewer?.Document == null || _textBlocks == null || _textBlocks.Count == 0)
		{
			return false;
		}

		PdfRenderer renderer = _viewer.Renderer;
		PdfPoint pdfPoint = renderer.PointToPdf(rendererPoint);
		if (!pdfPoint.IsValid || pdfPoint.Page != renderer.Page)
		{
			return false;
		}

		int pageIndex = renderer.Page;
		PointF location = pdfPoint.Location;
		foreach (PdfTextBlock candidate in _textBlocks
			.Where(candidate => candidate.PageIndex == pageIndex)
			.OrderByDescending(candidate => candidate.Top)
			.ThenBy(candidate => candidate.Left))
		{
			if (PdfImageGeometry.ContainsPdfPoint(candidate.Left, candidate.Bottom, candidate.Right, candidate.Top, location))
			{
				block = candidate;
				return true;
			}
		}

		return false;
	}

	private static Rectangle NormalizeRectangle(Point a, Point b)
	{
		int x = Math.Min(a.X, b.X);
		int y = Math.Min(a.Y, b.Y);
		int width = Math.Abs(a.X - b.X);
		int height = Math.Abs(a.Y - b.Y);
		return new Rectangle(x, y, width, height);
	}

	private sealed class SelectionOverlay : Panel
	{
		public SelectionOverlay()
		{
			BackColor = Color.Transparent;
			SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer, true);
		}

		protected override void OnPaintBackground(PaintEventArgs e)
		{
		}

		protected override void WndProc(ref Message m)
		{
			const int wmEraseBkgnd = 0x0014;
			const int wmNcHitTest = 0x0084;
			const nint htTransparent = -1;

			if (m.Msg == wmEraseBkgnd)
			{
				m.Result = 1;
				return;
			}

			if (m.Msg == wmNcHitTest)
			{
				m.Result = htTransparent;
				return;
			}

			base.WndProc(ref m);
		}
	}
}

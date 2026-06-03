using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using MyMindWin.Models;
using MyMindWin.Services;

namespace MyMindWin.Controls
{
    public partial class MindMapCanvasControl
    {
        // CreateNodeElement: level 0 → 16, 그 외 → 13
        private const double ExportNodeFontSize = 13;
        private const double ExportHeadingFontSize = ExportNodeFontSize + 1;
        private const double ExportHeadingLeftPadding = 8;
        private const double ExportHeadingTopPadding = 8;
        private const double ExportHeadingRightPadding = 16;
        private const double ExportHeadingBottomPadding = 8;

        public bool TryExportToFile(string filePath, CanvasImageExportOptions options, out string? errorMessage)
        {
            errorMessage = null;

            if (_vm?.RootNode == null)
            {
                errorMessage = "보낼 마인드맵이 없습니다.";
                return false;
            }

            try
            {
                if (IsCanvasLayoutBusy)
                {
                    errorMessage = "캔버스 레이아웃이 진행 중입니다. 잠시 후 다시 시도해 주세요.";
                    return false;
                }

                EnsureExportLayoutReady();
                var bitmap = RenderMapBitmap(options);
                CanvasImageExporter.Save(bitmap, filePath, options);
                return true;
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
                return false;
            }
        }

        private void EnsureExportLayoutReady()
        {
            if (!Dispatcher.CheckAccess())
            {
                Dispatcher.Invoke(EnsureExportLayoutReady, DispatcherPriority.Send);
                return;
            }

            Dispatcher.Invoke(() => { }, DispatcherPriority.Loaded);
            UpdateContentExtent();
            RootCanvas.UpdateLayout();
            ConnectionCanvas.UpdateLayout();
            NodeCanvas.UpdateLayout();
        }

        /// <summary>보내기용 RootCanvas 좌표계에서 마인드맵 전체(연결선·여백 포함) 영역.</summary>
        private Rect GetExportBoundsInCanvasCoords()
        {
            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue)
                return Rect.Empty;

            double left = MapX(minX);
            double top = MapY(minY);
            double right = maxX - _contentOriginX;
            double bottom = maxY - _contentOriginY;

            foreach (UIElement child in ConnectionCanvas.Children)
            {
                if (child is not System.Windows.Shapes.Path path || path.Data == null)
                    continue;

                var bounds = path.Data.Bounds;
                if (bounds.IsEmpty)
                    continue;

                left = Math.Min(left, bounds.Left);
                top = Math.Min(top, bounds.Top);
                right = Math.Max(right, bounds.Right);
                bottom = Math.Max(bottom, bounds.Bottom);
            }

            left = Math.Max(0, left - ContentPadding);
            top = Math.Max(0, top - ContentPadding);
            right = Math.Min(_contentWidth, right + ContentPadding);
            bottom = Math.Min(_contentHeight, bottom + ContentPadding);

            return new Rect(left, top, Math.Max(1, right - left), Math.Max(1, bottom - top));
        }

        private RenderTargetBitmap RenderMapBitmap(CanvasImageExportOptions options)
        {
            double savedScaleX = ScaleXform.ScaleX;
            double savedScaleY = ScaleXform.ScaleY;
            _suppressZoomSync = true;
            try
            {
                // Reset zoom to 1:1 first so layout positions are consistent with world coords
                ScaleXform.ScaleX = 1;
                ScaleXform.ScaleY = 1;
                RootCanvas.UpdateLayout();
                ConnectionCanvas.UpdateLayout();
                NodeCanvas.UpdateLayout();
                UpdateContentExtent();
                RootCanvas.UpdateLayout();

                var exportBounds = GetExportBoundsInCanvasCoords();
                if (exportBounds.IsEmpty)
                    throw new InvalidOperationException("보낼 노드가 없습니다.");

                double viewX = exportBounds.X;
                double viewY = exportBounds.Y;
                double viewW = exportBounds.Width;
                double viewH = exportBounds.Height;

                double scale = Math.Clamp(options.Scale, 0.5, 8.0);

                string? heading = options.IncludeHeading && !string.IsNullOrWhiteSpace(options.Heading)
                    ? options.Heading.Trim()
                    : null;

                int pixelW = Math.Max(1, (int)Math.Ceiling(viewW * scale));
                int pixelH = Math.Max(1, (int)Math.Ceiling(viewH * scale));
                double dpi = 96 * scale;

                bool transparent = options.TransparentBackground && options.Format.SupportsTransparency();

                var bitmap = new RenderTargetBitmap(pixelW, pixelH, dpi, dpi, PixelFormats.Pbgra32);

                // Opaque background
                if (!transparent)
                {
                    var bgVisual = new DrawingVisual();
                    using (var dc = bgVisual.RenderOpen())
                        dc.DrawRectangle(new SolidColorBrush(options.OpaqueBackgroundColor), null,
                            new Rect(0, 0, pixelW, pixelH));
                    bitmap.Render(bgVisual);
                }

                var contentTransform = new TransformGroup();
                contentTransform.Children.Add(new TranslateTransform(-viewX, -viewY));
                contentTransform.Children.Add(new ScaleTransform(scale, scale));

                var savedConnectionXform = ConnectionCanvas.RenderTransform;
                var savedNodeXform = NodeCanvas.RenderTransform;
                try
                {
                    ConnectionCanvas.RenderTransform = contentTransform;
                    NodeCanvas.RenderTransform = contentTransform;
                    bitmap.Render(ConnectionCanvas);
                    bitmap.Render(NodeCanvas);
                }
                finally
                {
                    ConnectionCanvas.RenderTransform = savedConnectionXform;
                    NodeCanvas.RenderTransform = savedNodeXform;
                }

                // Heading: 맵 위 오버레이 (배경 없음)
                if (heading != null)
                {
                    var headingOverlay = CreateExportHeadingOverlay(heading, viewW, viewH, options);
                    headingOverlay.Measure(new Size(viewW, viewH));
                    headingOverlay.Arrange(new Rect(0, 0, viewW, viewH));
                    headingOverlay.UpdateLayout();

                    var headingTransform = new ScaleTransform(scale, scale);
                    var savedHeadingXform = headingOverlay.RenderTransform;
                    try
                    {
                        headingOverlay.RenderTransform = headingTransform;
                        bitmap.Render(headingOverlay);
                    }
                    finally
                    {
                        headingOverlay.RenderTransform = savedHeadingXform;
                    }
                }

                bitmap.Freeze();
                return bitmap;
            }
            finally
            {
                ScaleXform.ScaleX = savedScaleX;
                ScaleXform.ScaleY = savedScaleY;
                _suppressZoomSync = false;
            }
        }

        private static FrameworkElement CreateExportHeadingOverlay(
            string heading, double viewW, double viewH, CanvasImageExportOptions options)
        {
            bool isTop = IsTopHeadingPosition(options.HeadingPosition);
            var grid = new Grid
            {
                Width = viewW,
                Height = viewH,
                Background = Brushes.Transparent
            };
            grid.RowDefinitions.Add(new RowDefinition
            {
                Height = isTop ? GridLength.Auto : new GridLength(1, GridUnitType.Star)
            });
            grid.RowDefinitions.Add(new RowDefinition
            {
                Height = isTop ? new GridLength(1, GridUnitType.Star) : GridLength.Auto
            });

            var block = CreateExportHeadingBlock(heading, viewW, options, isTop);
            block.HorizontalAlignment = GetHeadingHorizontalAlignment(options.HeadingPosition);
            block.TextAlignment = GetHeadingTextAlignment(options.HeadingPosition);
            block.VerticalAlignment = isTop ? VerticalAlignment.Top : VerticalAlignment.Bottom;
            Grid.SetRow(block, isTop ? 0 : 1);
            grid.Children.Add(block);
            return grid;
        }

        private static bool IsTopHeadingPosition(ExportHeadingPosition position) =>
            position is ExportHeadingPosition.TopLeft
                or ExportHeadingPosition.TopCenter
                or ExportHeadingPosition.TopRight;

        private static HorizontalAlignment GetHeadingHorizontalAlignment(ExportHeadingPosition position) =>
            position switch
            {
                ExportHeadingPosition.TopCenter or ExportHeadingPosition.BottomCenter =>
                    HorizontalAlignment.Center,
                ExportHeadingPosition.TopRight or ExportHeadingPosition.BottomRight =>
                    HorizontalAlignment.Right,
                _ => HorizontalAlignment.Left
            };

        private static TextAlignment GetHeadingTextAlignment(ExportHeadingPosition position) =>
            position switch
            {
                ExportHeadingPosition.TopCenter or ExportHeadingPosition.BottomCenter =>
                    TextAlignment.Center,
                ExportHeadingPosition.TopRight or ExportHeadingPosition.BottomRight =>
                    TextAlignment.Right,
                _ => TextAlignment.Left
            };

        private static TextBlock CreateExportHeadingBlock(
            string heading, double totalWidth, CanvasImageExportOptions options, bool isTop)
        {
            return new TextBlock
            {
                Text = heading,
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = ExportHeadingFontSize,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(options.HeadingColor),
                TextWrapping = TextWrapping.Wrap,
                MaxWidth = Math.Max(80, totalWidth - ExportHeadingLeftPadding - ExportHeadingRightPadding),
                Margin = new Thickness(
                    ExportHeadingLeftPadding,
                    isTop ? ExportHeadingTopPadding : 0,
                    ExportHeadingRightPadding,
                    isTop ? 0 : ExportHeadingBottomPadding)
            };
        }
    }
}

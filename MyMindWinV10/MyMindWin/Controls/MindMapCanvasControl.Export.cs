using System;
using System.Globalization;
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

        private double GetExportPixelsPerDip()
        {
            try
            {
                if (IsLoaded)
                    return VisualTreeHelper.GetDpi(this).PixelsPerDip;
            }
            catch
            {
                // ignored
            }

            return 1.0;
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
                double headingHeight = heading != null ? MeasureExportHeadingHeight(heading, viewW) : 0;
                double totalW = viewW;
                double totalH = viewH + headingHeight;

                int pixelW = Math.Max(1, (int)Math.Ceiling(totalW * scale));
                int pixelH = Math.Max(1, (int)Math.Ceiling(totalH * scale));
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

                // Render ConnectionCanvas and NodeCanvas directly — NOT RootCanvas.
                // RootCanvas has a LayoutClip set by ScrollViewer that clips to the viewport,
                // and also has a dark Background that would break transparency.
                // ConnectionCanvas/NodeCanvas have no parent-set LayoutClip (RootCanvas has no
                // ClipToBounds) and no background, so bitmap.Render produces the full, unclipped
                // content on a transparent base.
                var contentTransform = new TransformGroup();
                contentTransform.Children.Add(new TranslateTransform(-viewX, -viewY + headingHeight));
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

                // Heading: 이미지 좌측 상단 (맵 영역 위 별도 줄)
                if (heading != null)
                {
                    var headingSurface = new Grid
                    {
                        Width = viewW,
                        Height = headingHeight,
                        Background = transparent ? null : new SolidColorBrush(options.OpaqueBackgroundColor)
                    };
                    headingSurface.Children.Add(CreateExportHeadingBlock(heading, viewW, transparent));
                    headingSurface.Measure(new Size(viewW, headingHeight));
                    headingSurface.Arrange(new Rect(0, 0, viewW, headingHeight));
                    headingSurface.UpdateLayout();

                    var headingTransform = new ScaleTransform(scale, scale);
                    var savedHeadingXform = headingSurface.RenderTransform;
                    try
                    {
                        headingSurface.RenderTransform = headingTransform;
                        bitmap.Render(headingSurface);
                    }
                    finally
                    {
                        headingSurface.RenderTransform = savedHeadingXform;
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

        private double MeasureExportHeadingHeight(string heading, double totalWidth)
        {
            double textWidth = Math.Max(80, totalWidth - ExportHeadingLeftPadding - ExportHeadingRightPadding);
            var ft = new FormattedText(
                heading,
                CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal),
                ExportHeadingFontSize,
                Brushes.White,
                GetExportPixelsPerDip())
            {
                MaxTextWidth = textWidth,
                TextAlignment = TextAlignment.Left
            };

            return ft.Height + ExportHeadingTopPadding + ExportHeadingBottomPadding;
        }

        private static FrameworkElement CreateExportHeadingBlock(string heading, double totalWidth, bool transparent)
        {
            var foreground = transparent
                ? Color.FromRgb(0xE8, 0xEE, 0xF8)
                : Color.FromRgb(0xE8, 0xEE, 0xF8);

            return new TextBlock
            {
                Text = heading,
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = ExportHeadingFontSize,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(foreground),
                TextAlignment = TextAlignment.Left,
                TextWrapping = TextWrapping.Wrap,
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                MaxWidth = Math.Max(80, totalWidth - ExportHeadingLeftPadding - ExportHeadingRightPadding),
                Margin = new Thickness(
                    ExportHeadingLeftPadding,
                    ExportHeadingTopPadding,
                    ExportHeadingRightPadding,
                    ExportHeadingBottomPadding)
            };
        }
    }
}

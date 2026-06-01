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
        private const double ExportHeadingFontSize = 22;
        private const double ExportHeadingTopPadding = 16;
        private const double ExportHeadingBottomPadding = 12;
        private const double ExportHeadingHorizontalPadding = 16;

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
            UpdateContentExtent();

            var exportBounds = GetExportBoundsInCanvasCoords();
            if (exportBounds.IsEmpty)
                throw new InvalidOperationException("보낼 노드가 없습니다.");

            double savedScaleX = ScaleXform.ScaleX;
            double savedScaleY = ScaleXform.ScaleY;
            _suppressZoomSync = true;
            try
            {
                ScaleXform.ScaleX = 1;
                ScaleXform.ScaleY = 1;
                RootCanvas.UpdateLayout();
                ConnectionCanvas.UpdateLayout();
                NodeCanvas.UpdateLayout();

                double viewX = exportBounds.X;
                double viewY = exportBounds.Y;
                double viewW = exportBounds.Width;
                double viewH = exportBounds.Height;

                double scale = Math.Clamp(options.Scale, 0.5, 8.0);

                string? heading = string.IsNullOrWhiteSpace(options.Heading) ? null : options.Heading.Trim();
                double headingHeight = heading != null ? MeasureExportHeadingHeight(heading, viewW) : 0;
                double totalW = viewW;
                double totalH = viewH + headingHeight;

                int pixelW = Math.Max(1, (int)Math.Ceiling(totalW * scale));
                int pixelH = Math.Max(1, (int)Math.Ceiling(totalH * scale));
                double dpi = 96 * scale;

                bool transparent = options.TransparentBackground && options.Format.SupportsTransparency();

                var mapBrush = new VisualBrush(RootCanvas)
                {
                    Viewbox = new Rect(viewX, viewY, viewW, viewH),
                    ViewboxUnits = BrushMappingMode.Absolute,
                    Stretch = Stretch.Fill,
                    AlignmentX = AlignmentX.Left,
                    AlignmentY = AlignmentY.Top
                };
                RenderOptions.SetBitmapScalingMode(mapBrush, BitmapScalingMode.HighQuality);
                RenderOptions.SetEdgeMode(mapBrush, EdgeMode.Aliased);

                var surface = new Grid
                {
                    Width = totalW,
                    Height = totalH,
                    Background = transparent ? null : new SolidColorBrush(options.OpaqueBackgroundColor)
                };

                if (heading != null)
                {
                    surface.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
                    surface.RowDefinitions.Add(new RowDefinition { Height = new GridLength(viewH) });

                    var headingBlock = CreateExportHeadingBlock(heading, totalW, transparent);
                    Grid.SetRow(headingBlock, 0);
                    surface.Children.Add(headingBlock);

                    var mapHost = new Grid { Width = viewW, Height = viewH };
                    mapHost.Children.Add(new Rectangle
                    {
                        Width = viewW,
                        Height = viewH,
                        Fill = mapBrush
                    });
                    Grid.SetRow(mapHost, 1);
                    surface.Children.Add(mapHost);
                }
                else
                {
                    surface.Children.Add(new Rectangle
                    {
                        Width = viewW,
                        Height = viewH,
                        Fill = mapBrush
                    });
                }

                surface.Measure(new Size(totalW, totalH));
                surface.Arrange(new Rect(0, 0, totalW, totalH));
                surface.UpdateLayout();

                var bitmap = new RenderTargetBitmap(pixelW, pixelH, dpi, dpi, PixelFormats.Pbgra32);
                bitmap.Render(surface);
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
            double textWidth = Math.Max(80, totalWidth - ExportHeadingHorizontalPadding * 2);
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
                TextAlignment = TextAlignment.Center
            };

            return ft.Height + ExportHeadingTopPadding + ExportHeadingBottomPadding;
        }

        private static FrameworkElement CreateExportHeadingBlock(string heading, double totalWidth, bool transparent)
        {
            var foreground = transparent
                ? Color.FromRgb(0x1A, 0x1F, 0x2E)
                : Color.FromRgb(0xE8, 0xEE, 0xF8);

            return new TextBlock
            {
                Text = heading,
                FontFamily = new FontFamily("Segoe UI"),
                FontSize = ExportHeadingFontSize,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(foreground),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                HorizontalAlignment = HorizontalAlignment.Center,
                MaxWidth = Math.Max(80, totalWidth - ExportHeadingHorizontalPadding * 2),
                Margin = new Thickness(
                    ExportHeadingHorizontalPadding,
                    ExportHeadingTopPadding,
                    ExportHeadingHorizontalPadding,
                    ExportHeadingBottomPadding)
            };
        }
    }
}

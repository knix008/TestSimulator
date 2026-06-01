using System;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
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

        private RenderTargetBitmap RenderMapBitmap(CanvasImageExportOptions options)
        {
            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue)
                throw new InvalidOperationException("보낼 노드가 없습니다.");

            double scale = Math.Clamp(options.Scale, 0.5, 8.0);
            double pad = ContentPadding;
            double viewX = minX - _contentOriginX - pad;
            double viewY = minY - _contentOriginY - pad;
            double viewW = maxX - minX + pad * 2;
            double viewH = maxY - minY + pad * 2;

            string? heading = string.IsNullOrWhiteSpace(options.Heading) ? null : options.Heading.Trim();
            double headingHeight = heading != null ? MeasureExportHeadingHeight(heading, viewW) : 0;
            double totalW = viewW;
            double totalH = viewH + headingHeight;

            int pixelW = Math.Max(1, (int)Math.Ceiling(totalW * scale));
            int pixelH = Math.Max(1, (int)Math.Ceiling(totalH * scale));
            double dpi = 96 * scale;

            RootCanvas.UpdateLayout();
            ConnectionCanvas.UpdateLayout();
            NodeCanvas.UpdateLayout();

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
                surface.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

                var headingBlock = CreateExportHeadingBlock(heading, totalW, transparent);
                Grid.SetRow(headingBlock, 0);
                surface.Children.Add(headingBlock);

                var mapHost = new Grid();
                mapHost.Children.Add(new Rectangle
                {
                    Width = viewW,
                    Height = viewH,
                    HorizontalAlignment = HorizontalAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Top,
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
                VisualTreeHelper.GetDpi(this).PixelsPerDip)
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

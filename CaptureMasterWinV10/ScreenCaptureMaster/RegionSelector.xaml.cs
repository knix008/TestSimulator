using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace ScreenCaptureMaster
{
    /// <summary>
    /// Region selection overlay window
    /// </summary>
    public partial class RegionSelector : Window
    {
        private Point startPoint;
        private Rectangle selectionRectangle;
        private bool isSelecting = false;

        public System.Drawing.Rectangle SelectedRegion { get; private set; }
        public bool RegionSelected { get; private set; } = false;

        public RegionSelector()
        {
            InitializeComponent();
            
            // Set window to cover all screens
            var bounds = ScreenCapture.GetScreenBounds();
            this.Left = bounds.Left;
            this.Top = bounds.Top;
            this.Width = bounds.Width;
            this.Height = bounds.Height;

            this.Cursor = Cursors.Cross;
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            startPoint = e.GetPosition(this);
            isSelecting = true;

            // Create selection rectangle
            selectionRectangle = new Rectangle
            {
                Stroke = Brushes.Red,
                StrokeThickness = 2,
                Fill = new SolidColorBrush(Color.FromArgb(50, 255, 0, 0))
            };

            Canvas.SetLeft(selectionRectangle, startPoint.X);
            Canvas.SetTop(selectionRectangle, startPoint.Y);
            SelectionCanvas.Children.Add(selectionRectangle);

            e.Handled = true;
        }

        private void Window_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isSelecting || selectionRectangle == null)
                return;

            Point currentPoint = e.GetPosition(this);

            double x = Math.Min(startPoint.X, currentPoint.X);
            double y = Math.Min(startPoint.Y, currentPoint.Y);
            double width = Math.Abs(currentPoint.X - startPoint.X);
            double height = Math.Abs(currentPoint.Y - startPoint.Y);

            Canvas.SetLeft(selectionRectangle, x);
            Canvas.SetTop(selectionRectangle, y);
            selectionRectangle.Width = width;
            selectionRectangle.Height = height;

            // Update instruction text
            InstructionText.Text = $"Selected region: {(int)width} x {(int)height} pixels. Release to capture.";
        }

        private void Window_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (!isSelecting || selectionRectangle == null)
                return;

            isSelecting = false;

            // Get the selected region in screen coordinates
            Point topLeft = SelectionCanvas.PointToScreen(new Point(
                Canvas.GetLeft(selectionRectangle),
                Canvas.GetTop(selectionRectangle)));

            int width = (int)selectionRectangle.Width;
            int height = (int)selectionRectangle.Height;

            if (width > 5 && height > 5) // Minimum size threshold
            {
                SelectedRegion = new System.Drawing.Rectangle(
                    (int)topLeft.X,
                    (int)topLeft.Y,
                    width,
                    height);
                
                RegionSelected = true;
                this.DialogResult = true;
                this.Close();
            }
            else
            {
                // Selection too small, reset
                SelectionCanvas.Children.Remove(selectionRectangle);
                selectionRectangle = null;
                InstructionText.Text = "Click and drag to select a region to capture. Press ESC to cancel.";
            }

            e.Handled = true;
        }

        private void Window_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                RegionSelected = false;
                this.DialogResult = false;
                this.Close();
            }
        }
    }
}

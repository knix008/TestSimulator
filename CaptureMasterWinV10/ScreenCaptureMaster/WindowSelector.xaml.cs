using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;

namespace ScreenCaptureMaster
{
    /// <summary>
    /// Window information
    /// </summary>
    public class WindowInfo
    {
        public IntPtr Handle { get; set; }
        public string Title { get; set; }
        public System.Drawing.Rectangle Bounds { get; set; }

        public override string ToString()
        {
            return string.IsNullOrWhiteSpace(Title) ? "[Untitled Window]" : Title;
        }
    }

    /// <summary>
    /// Window selector dialog
    /// </summary>
    public partial class WindowSelector : Window
    {
        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, ref RECT rect);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        public WindowInfo SelectedWindow { get; private set; }
        private List<WindowInfo> windows = new List<WindowInfo>();

        public WindowSelector()
        {
            InitializeComponent();
            LoadWindows();
        }

        private void LoadWindows()
        {
            windows.Clear();

            EnumWindows((hWnd, lParam) =>
            {
                if (!IsWindowVisible(hWnd))
                    return true;

                int length = GetWindowTextLength(hWnd);
                if (length == 0)
                    return true;

                StringBuilder builder = new StringBuilder(length + 1);
                GetWindowText(hWnd, builder, builder.Capacity);
                string title = builder.ToString();

                if (string.IsNullOrWhiteSpace(title))
                    return true;

                RECT rect = new RECT();
                GetWindowRect(hWnd, ref rect);

                windows.Add(new WindowInfo
                {
                    Handle = hWnd,
                    Title = title,
                    Bounds = new System.Drawing.Rectangle(
                        rect.Left,
                        rect.Top,
                        rect.Right - rect.Left,
                        rect.Bottom - rect.Top)
                });

                return true;
            }, IntPtr.Zero);

            WindowListBox.ItemsSource = windows;
            StatusText.Text = $"{windows.Count} windows found";
        }

        private void WindowListBox_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (WindowListBox.SelectedItem is WindowInfo window)
            {
                SelectedWindow = window;
                this.DialogResult = true;
                this.Close();
            }
        }

        private void SelectButton_Click(object sender, RoutedEventArgs e)
        {
            if (WindowListBox.SelectedItem is WindowInfo window)
            {
                SelectedWindow = window;
                this.DialogResult = true;
                this.Close();
            }
            else
            {
                MessageBox.Show("Please select a window first.", "No Selection",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            LoadWindows();
        }
    }
}

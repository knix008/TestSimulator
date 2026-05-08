using Microsoft.Win32;
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;

namespace ScreenCaptureMaster
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : Window
    {
        private string defaultSavePath;
        private Bitmap lastCapture;
        private string lastSavedFilePath;

        public MainWindow()
        {
            InitializeComponent();
            InitializeDefaultPath();
        }

        private void InitializeDefaultPath()
        {
            defaultSavePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
                "ScreenCaptures");

            if (!Directory.Exists(defaultSavePath))
            {
                Directory.CreateDirectory(defaultSavePath);
            }

            SavePathTextBox.Text = defaultSavePath;
        }

        private void CaptureFullScreenButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                UpdateStatus("Capturing screen...");

                // Minimize window for clean capture
                this.WindowState = WindowState.Minimized;
                System.Threading.Thread.Sleep(300); // Brief delay to ensure window is minimized

                // Capture screen
                lastCapture = ScreenCapture.CaptureFullScreen();

                // Restore window
                this.WindowState = WindowState.Normal;

                // Display preview
                DisplayPreview(lastCapture);

                // Save to file
                SaveCapturedImage(lastCapture);
            }
            catch (Exception ex)
            {
                this.WindowState = WindowState.Normal;
                UpdateStatus($"Error: {ex.Message}");
                MessageBox.Show($"Failed to capture screen: {ex.Message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CaptureRegionButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                UpdateStatus("Select a region to capture...");

                // Hide main window
                this.WindowState = WindowState.Minimized;
                System.Threading.Thread.Sleep(300);

                // Show region selector
                var regionSelector = new RegionSelector();
                bool? result = regionSelector.ShowDialog();

                // Restore main window
                this.WindowState = WindowState.Normal;

                if (result == true && regionSelector.RegionSelected)
                {
                    // Capture the selected region
                    lastCapture = ScreenCapture.CaptureRegion(regionSelector.SelectedRegion);

                    // Display preview
                    DisplayPreview(lastCapture);

                    // Save to file
                    SaveCapturedImage(lastCapture);
                }
                else
                {
                    UpdateStatus("Region capture cancelled.");
                }
            }
            catch (Exception ex)
            {
                this.WindowState = WindowState.Normal;
                UpdateStatus($"Error: {ex.Message}");
                MessageBox.Show($"Failed to capture region: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CaptureWindowButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                UpdateStatus("Select a window to capture...");

                // Show window selector
                var windowSelector = new WindowSelector();
                bool? result = windowSelector.ShowDialog();

                if (result == true && windowSelector.SelectedWindow != null)
                {
                    // Minimize main window
                    this.WindowState = WindowState.Minimized;
                    System.Threading.Thread.Sleep(300);

                    // Capture the selected window by handle so occluded windows can still be captured.
                    lastCapture = ScreenCapture.CaptureWindow(windowSelector.SelectedWindow.Handle);

                    // Restore main window
                    this.WindowState = WindowState.Normal;

                    // Display preview
                    DisplayPreview(lastCapture);

                    // Save to file
                    SaveCapturedImage(lastCapture);
                }
                else
                {
                    UpdateStatus("Window capture cancelled.");
                }
            }
            catch (Exception ex)
            {
                this.WindowState = WindowState.Normal;
                UpdateStatus($"Error: {ex.Message}");
                MessageBox.Show($"Failed to capture window: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BrowseButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new System.Windows.Forms.FolderBrowserDialog();
            dialog.Description = "Select folder to save screenshots";
            dialog.SelectedPath = SavePathTextBox.Text;

            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                SavePathTextBox.Text = dialog.SelectedPath;
                UpdateStatus($"Save location changed to: {dialog.SelectedPath}");
            }
        }

        private void DisplayPreview(Bitmap bitmap)
        {
            if (bitmap == null)
                return;

            using (MemoryStream memory = new MemoryStream())
            {
                bitmap.Save(memory, ImageFormat.Png);
                memory.Position = 0;

                BitmapImage bitmapImage = new BitmapImage();
                bitmapImage.BeginInit();
                bitmapImage.StreamSource = memory;
                bitmapImage.CacheOption = BitmapCacheOption.OnLoad;
                bitmapImage.EndInit();
                bitmapImage.Freeze();

                PreviewImage.Source = bitmapImage;
            }
        }

        private void SaveCapturedImage(Bitmap bitmap)
        {
            if (bitmap == null)
                return;

            try
            {
                ImageFormat format = GetSelectedImageFormat();
                string extension = GetFormatExtension(format);

                if (AutoSaveCheckBox.IsChecked == true)
                {
                    // Auto-save with unique filename
                    string savePath = SavePathTextBox.Text;
                    lastSavedFilePath = ScreenCapture.GenerateUniqueFileName(savePath, extension);
                    ScreenCapture.SaveBitmap(bitmap, lastSavedFilePath, format);
                    UpdateStatus($"Image saved to: {lastSavedFilePath}");
                    EnableActionButtons(true);
                }
                else
                {
                    // Show save dialog
                    SaveFileDialog saveDialog = new SaveFileDialog();
                    saveDialog.Filter = $"{extension.ToUpper()} Image|*.{extension}|All Files|*.*";
                    saveDialog.Title = "Save Captured Image";
                    saveDialog.FileName = $"Screenshot_{DateTime.Now:yyyyMMdd_HHmmss}.{extension}";
                    saveDialog.InitialDirectory = SavePathTextBox.Text;

                    if (saveDialog.ShowDialog() == true)
                    {
                        lastSavedFilePath = saveDialog.FileName;
                        ScreenCapture.SaveBitmap(bitmap, lastSavedFilePath, format);
                        UpdateStatus($"Image saved to: {lastSavedFilePath}");
                        EnableActionButtons(true);
                    }
                    else
                    {
                        UpdateStatus("Save cancelled. Image is in clipboard and preview.");
                    }
                }
            }
            catch (Exception ex)
            {
                UpdateStatus($"Error saving image: {ex.Message}");
                MessageBox.Show($"Failed to save image: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private ImageFormat GetSelectedImageFormat()
        {
            if (FormatComboBox.SelectedItem is System.Windows.Controls.ComboBoxItem item)
            {
                string format = item.Content.ToString();
                return format switch
                {
                    "PNG" => ImageFormat.Png,
                    "JPEG" => ImageFormat.Jpeg,
                    "BMP" => ImageFormat.Bmp,
                    "GIF" => ImageFormat.Gif,
                    _ => ImageFormat.Png
                };
            }
            return ImageFormat.Png;
        }

        private string GetFormatExtension(ImageFormat format)
        {
            if (format.Equals(ImageFormat.Png)) return "png";
            if (format.Equals(ImageFormat.Jpeg)) return "jpg";
            if (format.Equals(ImageFormat.Bmp)) return "bmp";
            if (format.Equals(ImageFormat.Gif)) return "gif";
            return "png";
        }

        private void CopyToClipboardButton_Click(object sender, RoutedEventArgs e)
        {
            if (lastCapture == null)
            {
                MessageBox.Show("No image to copy. Please capture an image first.", "No Image",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            try
            {
                // Copy to clipboard
                using (MemoryStream ms = new MemoryStream())
                {
                    lastCapture.Save(ms, ImageFormat.Png);
                    ms.Position = 0;

                    BitmapImage bitmapImage = new BitmapImage();
                    bitmapImage.BeginInit();
                    bitmapImage.StreamSource = ms;
                    bitmapImage.CacheOption = BitmapCacheOption.OnLoad;
                    bitmapImage.EndInit();
                    bitmapImage.Freeze();

                    Clipboard.SetImage(bitmapImage);
                }

                UpdateStatus("Image copied to clipboard!");
                MessageBox.Show("Image copied to clipboard!", "Success",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                UpdateStatus($"Error copying to clipboard: {ex.Message}");
                MessageBox.Show($"Failed to copy to clipboard: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void OpenFileButton_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(lastSavedFilePath) || !File.Exists(lastSavedFilePath))
            {
                MessageBox.Show("No saved file to open.", "No File",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = lastSavedFilePath,
                    UseShellExecute = true
                });
                UpdateStatus($"Opened: {lastSavedFilePath}");
            }
            catch (Exception ex)
            {
                UpdateStatus($"Error opening file: {ex.Message}");
                MessageBox.Show($"Failed to open file: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void OpenFolderButton_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(lastSavedFilePath) || !File.Exists(lastSavedFilePath))
            {
                // Open default save folder
                string folder = SavePathTextBox.Text;
                if (Directory.Exists(folder))
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = folder,
                        UseShellExecute = true
                    });
                    UpdateStatus($"Opened folder: {folder}");
                }
                return;
            }

            try
            {
                string argument = "/select, \"" + lastSavedFilePath + "\"";
                System.Diagnostics.Process.Start("explorer.exe", argument);
                UpdateStatus($"Opened folder with selected file");
            }
            catch (Exception ex)
            {
                UpdateStatus($"Error opening folder: {ex.Message}");
                MessageBox.Show($"Failed to open folder: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void EnableActionButtons(bool enable)
        {
            // Enable/disable action buttons based on whether we have a saved file
            // This will be connected to buttons in XAML
        }

        private void UpdateStatus(string message)
        {
            StatusTextBlock.Text = message;
        }

        protected override void OnClosed(EventArgs e)
        {
            lastCapture?.Dispose();
            base.OnClosed(e);
        }
    }
}

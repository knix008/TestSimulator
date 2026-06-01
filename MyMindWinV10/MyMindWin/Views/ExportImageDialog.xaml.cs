using System.Windows;

namespace MyMindWin.Views
{
    public partial class ExportImageDialog : Window
    {
        public ExportImageDialog(string documentTitle, Window? owner)
        {
            InitializeComponent();

            IncludeHeadingCheck.Checked += IncludeHeadingCheck_Changed;
            IncludeHeadingCheck.Unchecked += IncludeHeadingCheck_Changed;

            HeadingBox.Text = documentTitle;
            IncludeHeadingCheck.IsChecked = true;
            UpdateHeadingEnabled();

            if (owner != null)
            {
                Owner = owner;
                WindowStartupLocation = WindowStartupLocation.CenterOwner;
            }
        }

        public bool IncludeHeading => IncludeHeadingCheck.IsChecked == true;

        public string? HeadingText
        {
            get
            {
                if (!IncludeHeading)
                    return null;

                var text = HeadingBox.Text.Trim();
                return string.IsNullOrEmpty(text) ? null : text;
            }
        }

        private void IncludeHeadingCheck_Changed(object sender, RoutedEventArgs e) => UpdateHeadingEnabled();

        private void UpdateHeadingEnabled()
        {
            if (HeadingBox == null || IncludeHeadingCheck == null)
                return;

            HeadingBox.IsEnabled = IncludeHeadingCheck.IsChecked == true;
        }

        private void Ok_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
            Close();
        }
    }
}

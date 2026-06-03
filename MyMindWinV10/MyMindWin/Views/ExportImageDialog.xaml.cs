using System.Windows;

namespace MyMindWin.Views
{
    public partial class ExportImageDialog : Window
    {
        private bool _includeHeading;
        private string _headingText = string.Empty;

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

        /// <summary>확인 시점에 확정된 Heading 포함 여부.</summary>
        public bool IncludeHeading => _includeHeading;

        /// <summary>확인 시점의 Heading 텍스트 (포함 해제 시 null).</summary>
        public string? HeadingText =>
            _includeHeading && !string.IsNullOrWhiteSpace(_headingText)
                ? _headingText.Trim()
                : null;

        private void IncludeHeadingCheck_Changed(object sender, RoutedEventArgs e) => UpdateHeadingEnabled();

        private void UpdateHeadingEnabled()
        {
            if (HeadingBox == null || IncludeHeadingCheck == null)
                return;

            HeadingBox.IsEnabled = IncludeHeadingCheck.IsChecked == true;
        }

        private void Ok_Click(object sender, RoutedEventArgs e)
        {
            _includeHeading = IncludeHeadingCheck.IsChecked == true;
            _headingText = HeadingBox.Text ?? string.Empty;
            DialogResult = true;
            Close();
        }
    }
}

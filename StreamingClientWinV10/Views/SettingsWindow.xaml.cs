using System.Windows;

namespace StreamingClientWinV10.Views
{
    public partial class SettingsWindow : Window
    {
        public string ServerUrl => UrlBox.Text.Trim().TrimEnd('/');

        public SettingsWindow(string currentUrl)
        {
            InitializeComponent();
            UrlBox.Text = currentUrl;
            Loaded += (_, _) => { UrlBox.Focus(); UrlBox.SelectAll(); };
        }

        private void OnSaveClick(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(UrlBox.Text))
            {
                MessageBox.Show("서버 URL을 입력해주세요.", "입력 오류",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            DialogResult = true;
        }

        private void OnCancelClick(object sender, RoutedEventArgs e)
            => DialogResult = false;
    }
}

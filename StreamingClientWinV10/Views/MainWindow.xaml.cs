using System.Windows;
using StreamingClientWinV10.ViewModels;

namespace StreamingClientWinV10.Views
{
    public partial class MainWindow : Window
    {
        private MainViewModel ViewModel => (MainViewModel)DataContext;

        public MainWindow()
        {
            InitializeComponent();
            Loaded += async (_, _) => await ViewModel.LoadVideosAsync();
        }

        private void OnSettingsClick(object sender, RoutedEventArgs e)
        {
            var dlg = new SettingsWindow(ViewModel.ServerUrl)
            {
                Owner = this
            };
            if (dlg.ShowDialog() == true)
            {
                ViewModel.ServerUrl = dlg.ServerUrl;
            }
        }
    }
}

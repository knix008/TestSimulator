using System.Windows;

namespace STTWinV10
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            
            // 처리되지 않은 예외 핸들러 등록
            this.DispatcherUnhandledException += (s, args) =>
            {
                MessageBox.Show($"예외 발생:\n{args.Exception.Message}\n\nStack Trace:\n{args.Exception.StackTrace}", 
                    "오류", MessageBoxButton.OK, MessageBoxImage.Error);
                args.Handled = true;
            };
        }
    }
}

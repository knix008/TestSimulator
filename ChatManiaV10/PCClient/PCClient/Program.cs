namespace PCClient
{
    internal static class Program
    {
        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetHighDpiMode(HighDpiMode.SystemAware);
                Application.Run(new MainForm());
            }
            catch (Exception ex)
            {
                MessageBox.Show($"오류 발생:\n{ex.Message}\n\n{ex.StackTrace}", "애플리케이션 오류", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}

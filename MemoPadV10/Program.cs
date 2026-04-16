namespace MemoPadV10;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        ApplicationContext appContext = new();
        MemoPadForm firstPad = new();
        Application.Idle += (_, _) =>
        {
            if (Application.OpenForms.Count == 0)
            {
                appContext.ExitThread();
            }
        };
        firstPad.Show();
        Application.Run(appContext);
    }
}

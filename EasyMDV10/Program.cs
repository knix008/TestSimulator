namespace EasyMDV10;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new EasyMDForm());
    }
}

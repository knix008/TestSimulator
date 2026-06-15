using MyAgileBoardWinV10.Forms;

namespace MyAgileBoardWinV10;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MyAgileForm());
    }
}
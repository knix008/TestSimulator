using System.Reflection;

namespace MyAgileBoardWinV10.Forms;

public partial class AboutForm : Form
{
    public AboutForm()
    {
        InitializeComponent();
        var ver = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0);
        lblVersion.Text = $"버전  {ver.Major}.{ver.Minor}.{ver.Build}";
    }

    private void btnOk_Click(object? sender, EventArgs e) => Close();
}

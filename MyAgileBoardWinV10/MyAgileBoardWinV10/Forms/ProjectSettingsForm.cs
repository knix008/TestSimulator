using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class ProjectSettingsForm : Form
{
    private KanbanProject _project = null!;

    public event EventHandler<bool>? GridVisibilityChanged;

    public ProjectSettingsForm()
    {
        InitializeComponent();
    }

    public ProjectSettingsForm(KanbanProject project) : this()
    {
        _project = project;
        LoadFromProject();
        chkShowGrid.CheckedChanged += (_, _) => GridVisibilityChanged?.Invoke(this, chkShowGrid.Checked);
    }

    private void LoadFromProject()
    {
        txtProjectName.Text = _project.Name;
        chkShowGrid.Checked = _project.ShowGrid;
        lblCreated.Text = $"생성일: {_project.CreatedAt:yyyy-MM-dd HH:mm}";
        lblFilePath.Text = string.IsNullOrEmpty(_project.FilePath)
            ? "저장되지 않음"
            : _project.FilePath;
    }

    private void btnOk_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtProjectName.Text))
        {
            MessageBox.Show("프로젝트 이름을 입력하세요.", "입력 오류",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            txtProjectName.Focus();
            return;
        }

        _project.Name = txtProjectName.Text.Trim();
        _project.ShowGrid = chkShowGrid.Checked;
        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}

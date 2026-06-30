using MyWorkspace.Core.Entities;

using MyWorkspace.Core.Enums;



namespace MyWorkspace.Win.Forms;



public partial class AdminUserForm : Form

{

    public AdminUserForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void AdminUserForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        btnEdit.Margin = new Padding(8, 0, 0, 0);
        btnDelete.Margin = new Padding(8, 0, 0, 0);
        LoadUsers();
    }



    private void ApplyLocalization()

    {

        Text = Localization.Get(K.MenuAdminUsers);

        colUsername.HeaderText = Localization.Get(K.LabelUsername);

        colRole.HeaderText = Localization.Get(K.LabelRole);

        colCreatedAt.HeaderText = Localization.Get(K.LabelCreatedAt);

        btnAdd.Text = Localization.Get(K.ButtonAdd);

        btnEdit.Text = Localization.Get(K.ButtonEdit);

        btnDelete.Text = Localization.Get(K.ButtonDelete);

        btnClose.Text = Localization.Get(K.ButtonClose);

    }



    private void LoadUsers()
    {
        gridUsers.Rows.Clear();
        foreach (var user in AppConfig.Services.Users.GetAllUsers())
        {
            gridUsers.Rows.Add(
                user.Id,
                user.Username,
                LocalizationDisplay.FormatUserRole(user.Role),
                user.CreatedAt.ToLocalTime());
        }

        AppTheme.StyleDataGridView(gridUsers);
    }



    private User? GetSelectedUser()

    {

        if (gridUsers.CurrentRow == null)

            return null;



        var id = Convert.ToInt32(gridUsers.CurrentRow.Cells["colId"].Value);

        return AppConfig.Services.Users.GetById(id);

    }



    private void btnAdd_Click(object sender, EventArgs e)

    {

        using var form = new UserEditForm();

        if (form.ShowDialog() == DialogResult.OK)

            LoadUsers();

    }



    private void btnEdit_Click(object sender, EventArgs e)

    {

        var user = GetSelectedUser();

        if (user == null)

        {

            MessageBox.Show(Localization.Get(K.SelectUser), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);

            return;

        }



        using var form = new UserEditForm(user);

        if (form.ShowDialog() == DialogResult.OK)

            LoadUsers();

    }



    private void btnDelete_Click(object sender, EventArgs e)

    {

        var user = GetSelectedUser();

        if (user == null)

        {

            MessageBox.Show(Localization.Get(K.SelectUser), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);

            return;

        }



        if (MessageBox.Show(

                string.Format(Localization.Get(K.ConfirmDeleteUser), user.Username),

                Localization.Get(K.Confirm),

                MessageBoxButtons.YesNo,

                MessageBoxIcon.Question) != DialogResult.Yes)

            return;



        try

        {

            AppConfig.Services.Users.DeleteUser(user.Id);

            LoadUsers();

        }

        catch (Exception ex)

        {

            ErrorDetailForm.Show(this, Text, ex);

        }

    }



    private void btnClose_Click(object sender, EventArgs e) => Close();

}


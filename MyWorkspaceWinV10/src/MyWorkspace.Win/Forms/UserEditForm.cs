using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class UserEditForm : Form
{
    private readonly User? _existingUser;

    public UserEditForm(User? existingUser = null)
    {
        _existingUser = existingUser;
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void UserEditForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        PopulateRoles();

        if (_existingUser == null)
            return;

        txtUsername.Text = _existingUser.Username;
        SelectRole(_existingUser.Role);
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(_existingUser == null ? K.UserAddTitle : K.UserEditTitle);
        lblUsername.Text = Localization.Get(K.LabelUsername);
        lblPassword.Text = Localization.Get(_existingUser == null ? K.LabelPassword : K.PasswordNewOptional);
        lblRole.Text = Localization.Get(K.LabelRole);
        btnSave.Text = Localization.Get(K.ButtonSave);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void PopulateRoles()
    {
        cboRole.Items.Clear();
        cboRole.Items.Add(new RoleListItem(UserRole.User));
        cboRole.Items.Add(new RoleListItem(UserRole.Admin));
        cboRole.DisplayMember = nameof(RoleListItem.DisplayName);
        cboRole.SelectedIndex = 0;
    }

    private void SelectRole(UserRole role)
    {
        for (var i = 0; i < cboRole.Items.Count; i++)
        {
            if (cboRole.Items[i] is RoleListItem item && item.Role == role)
            {
                cboRole.SelectedIndex = i;
                return;
            }
        }
    }

    private UserRole GetSelectedRole() =>
        cboRole.SelectedItem is RoleListItem item ? item.Role : UserRole.User;

    private void btnSave_Click(object sender, EventArgs e)
    {
        try
        {
            if (_existingUser == null)
            {
                AppConfig.Services.Users.CreateUser(
                    txtUsername.Text,
                    txtPassword.Text,
                    GetSelectedRole());
            }
            else
            {
                AppConfig.Services.Users.UpdateUser(
                    _existingUser.Id,
                    txtUsername.Text,
                    GetSelectedRole(),
                    string.IsNullOrWhiteSpace(txtPassword.Text) ? null : txtPassword.Text);
            }

            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Text, ex);
        }
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}

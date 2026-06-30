using MyWorkspace.Core.Enums;



namespace MyWorkspace.Win.Forms;



public partial class WorkspaceMemberForm : Form

{

    private readonly int _workspaceId;



    public WorkspaceMemberForm(int workspaceId)

    {

        _workspaceId = workspaceId;

        InitializeComponent();

        AppTheme.ApplyStandardDialog(this);

    }



    private void WorkspaceMemberForm_Load(object sender, EventArgs e)

    {

        ApplyLocalization();

        PopulateRoles();

        LoadMembers();

        LoadAvailableUsers();

    }



    private void ApplyLocalization()

    {

        Text = Localization.Get(K.MenuWorkspaceMembers);

        lblMembers.Text = Localization.Get(K.LabelRegisteredMembers);

        lblAddUser.Text = Localization.Get(K.LabelAddUser);

        lblRole.Text = Localization.Get(K.LabelRole);

        btnAdd.Text = Localization.Get(K.ButtonAddMember);

        btnRemove.Text = Localization.Get(K.ButtonRemoveMember);

        btnClose.Text = Localization.Get(K.ButtonClose);

    }



    private void PopulateRoles()

    {

        cboRole.Items.Clear();

        cboRole.Items.Add(new MemberRoleListItem(WorkspaceMemberRole.Viewer));

        cboRole.Items.Add(new MemberRoleListItem(WorkspaceMemberRole.Editor));

        cboRole.DisplayMember = nameof(MemberRoleListItem.DisplayName);

        cboRole.SelectedIndex = 0;

    }



    private WorkspaceMemberRole GetSelectedRole() =>

        cboRole.SelectedItem is MemberRoleListItem item ? item.Role : WorkspaceMemberRole.Viewer;



    private void LoadMembers()

    {

        lstMembers.Items.Clear();

        var members = AppConfig.Services.Workspaces.GetMembers(SessionContext.CurrentUser, _workspaceId);

        foreach (var member in members)

            lstMembers.Items.Add(new MemberListItem(member.UserId, member.User.Username, member.Role));

    }



    private void LoadAvailableUsers()

    {

        cboUser.Items.Clear();

        var memberIds = AppConfig.Services.Workspaces.GetMembers(SessionContext.CurrentUser, _workspaceId)

            .Select(m => m.UserId)

            .ToHashSet();



        foreach (var user in AppConfig.Services.Users.GetAllUsers())

        {

            if (!memberIds.Contains(user.Id))

                cboUser.Items.Add(new UserListItem(user.Id, user.Username));

        }



        if (cboUser.Items.Count > 0)

            cboUser.SelectedIndex = 0;

    }



    private void btnAdd_Click(object sender, EventArgs e)

    {

        if (cboUser.SelectedItem is not UserListItem user)

        {

            MessageBox.Show(Localization.Get(K.SelectUserToAdd), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);

            return;

        }



        try

        {

            AppConfig.Services.Workspaces.AddMember(

                SessionContext.CurrentUser,

                _workspaceId,

                user.UserId,

                GetSelectedRole());



            LoadMembers();

            LoadAvailableUsers();

        }

        catch (Exception ex)

        {

            ErrorDetailForm.Show(this, Text, ex);

        }

    }



    private void btnRemove_Click(object sender, EventArgs e)

    {

        if (lstMembers.SelectedItem is not MemberListItem member)

        {

            MessageBox.Show(Localization.Get(K.SelectMemberToRemove), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);

            return;

        }



        try

        {

            AppConfig.Services.Workspaces.RemoveMember(SessionContext.CurrentUser, _workspaceId, member.UserId);

            LoadMembers();

            LoadAvailableUsers();

        }

        catch (Exception ex)

        {

            ErrorDetailForm.Show(this, Text, ex);

        }

    }



    private void btnClose_Click(object sender, EventArgs e) => Close();



    private sealed class UserListItem(int userId, string username)

    {

        public int UserId { get; } = userId;

        public override string ToString() => username;

    }



    private sealed class MemberListItem(int userId, string username, WorkspaceMemberRole role)

    {

        public int UserId { get; } = userId;

        public override string ToString() => $"{username} ({LocalizationDisplay.FormatWorkspaceMemberRole(role)})";

    }

}


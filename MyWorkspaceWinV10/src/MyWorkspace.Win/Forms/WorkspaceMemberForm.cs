using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class WorkspaceMemberForm : Form
{
    private readonly int _workspaceId;
    private readonly Dictionary<int, WorkspaceMemberRole> _originalRoles = new();
    private readonly HashSet<int> _originalUserIds = new();
    private readonly List<PendingMember> _members = new();
    private bool _syncingRole;

    public WorkspaceMemberForm(int workspaceId)
    {
        _workspaceId = workspaceId;
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
        Shown += (_, _) => AppTheme.FinalizeDialogLayout(this);
    }

    private void WorkspaceMemberForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        PopulateRoles();
        LoadMembersFromDatabase();
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
        btnSave.Text = Localization.Get(K.ButtonSave);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
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

    private void LoadMembersFromDatabase()
    {
        _members.Clear();
        _originalRoles.Clear();
        _originalUserIds.Clear();

        foreach (var member in AppConfig.Services.Workspaces.GetMembers(SessionContext.CurrentUser, _workspaceId))
        {
            _originalUserIds.Add(member.UserId);
            _originalRoles[member.UserId] = member.Role;
            _members.Add(new PendingMember(member.UserId, member.User.Username, member.Role));
        }

        RefreshMemberList();
    }

    private void LoadAvailableUsers()
    {
        cboUser.Items.Clear();

        var activeMemberIds = _members
            .Where(member => !member.IsRemoved)
            .Select(member => member.UserId)
            .ToHashSet();

        foreach (var user in AppConfig.Services.Users.GetAllUsers())
        {
            if (!activeMemberIds.Contains(user.Id))
                cboUser.Items.Add(new UserListItem(user.Id, user.Username));
        }

        if (cboUser.Items.Count > 0)
            cboUser.SelectedIndex = 0;
    }

    private void RefreshMemberList()
    {
        var selectedUserId = (lstMembers.SelectedItem as PendingMember)?.UserId;

        lstMembers.Items.Clear();
        foreach (var member in _members.Where(member => !member.IsRemoved).OrderBy(member => member.Username))
            lstMembers.Items.Add(member);

        if (selectedUserId.HasValue)
        {
            for (var index = 0; index < lstMembers.Items.Count; index++)
            {
                if (lstMembers.Items[index] is PendingMember member && member.UserId == selectedUserId.Value)
                {
                    lstMembers.SelectedIndex = index;
                    break;
                }
            }
        }

        UpdateSaveButtonState();
        SyncRoleCombo();
        LoadAvailableUsers();
    }

    private void UpdateSaveButtonState() => btnSave.Enabled = HasChanges;

    private bool HasChanges =>
        _members.Any(member => member.IsNew && !member.IsRemoved)
        || _members.Any(member => member.IsRemoved && !member.IsNew)
        || _members.Any(member =>
            !member.IsNew
            && !member.IsRemoved
            && !member.IsOwner
            && _originalRoles.TryGetValue(member.UserId, out var originalRole)
            && originalRole != member.Role);

    private void SyncRoleCombo()
    {
        if (lstMembers.SelectedItem is not PendingMember member)
        {
            cboRole.Enabled = false;
            return;
        }

        if (member.IsOwner)
        {
            cboRole.Enabled = false;
            return;
        }

        cboRole.Enabled = true;
        SelectRole(member.Role);
    }

    private void SelectRole(WorkspaceMemberRole role)
    {
        _syncingRole = true;
        try
        {
            for (var index = 0; index < cboRole.Items.Count; index++)
            {
                if (cboRole.Items[index] is MemberRoleListItem item && item.Role == role)
                {
                    cboRole.SelectedIndex = index;
                    return;
                }
            }

            cboRole.SelectedIndex = 0;
        }
        finally
        {
            _syncingRole = false;
        }
    }

    private void lstMembers_SelectedIndexChanged(object sender, EventArgs e) => SyncRoleCombo();

    private void cboRole_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (_syncingRole || lstMembers.SelectedItem is not PendingMember member || member.IsOwner)
            return;

        member.Role = GetSelectedRole();
        RefreshMemberListItem(member);
        UpdateSaveButtonState();
    }

    private void RefreshMemberListItem(PendingMember member)
    {
        for (var index = 0; index < lstMembers.Items.Count; index++)
        {
            if (lstMembers.Items[index] is PendingMember listed && listed.UserId == member.UserId)
            {
                lstMembers.Items[index] = member;
                lstMembers.SelectedIndex = index;
                break;
            }
        }
    }

    private void btnAdd_Click(object sender, EventArgs e)
    {
        if (cboUser.SelectedItem is not UserListItem user)
        {
            MessageBox.Show(Localization.Get(K.SelectUserToAdd), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (_members.Any(member => member.UserId == user.UserId && !member.IsRemoved))
        {
            MessageBox.Show(Localization.Get(K.ErrMemberAlreadyAdded), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var existing = _members.FirstOrDefault(member => member.UserId == user.UserId);
        if (existing != null)
        {
            existing.IsRemoved = false;
            existing.Role = GetSelectedRole();
        }
        else
        {
            _members.Add(new PendingMember(user.UserId, user.ToString()!, GetSelectedRole(), isNew: true));
        }

        RefreshMemberList();
    }

    private void btnRemove_Click(object sender, EventArgs e)
    {
        if (lstMembers.SelectedItem is not PendingMember member)
        {
            MessageBox.Show(Localization.Get(K.SelectMemberToRemove), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (member.IsOwner)
        {
            MessageBox.Show(Localization.Get(K.ErrCannotRemoveOwner), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (member.IsNew)
            _members.Remove(member);
        else
            member.IsRemoved = true;

        RefreshMemberList();
    }

    private void btnSave_Click(object sender, EventArgs e)
    {
        if (!HasChanges)
        {
            DialogResult = DialogResult.OK;
            Close();
            return;
        }

        try
        {
            ApplyChanges();
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Text, ex);
        }
    }

    private void ApplyChanges()
    {
        var service = AppConfig.Services.Workspaces;
        var currentUser = SessionContext.CurrentUser;

        foreach (var member in _members.Where(member => member.IsRemoved && !member.IsNew))
            service.RemoveMember(currentUser, _workspaceId, member.UserId);

        foreach (var member in _members.Where(member => member.IsNew && !member.IsRemoved))
            service.AddMember(currentUser, _workspaceId, member.UserId, member.Role);

        foreach (var member in _members.Where(member => !member.IsNew && !member.IsRemoved && !member.IsOwner))
        {
            if (!_originalRoles.TryGetValue(member.UserId, out var originalRole) || originalRole == member.Role)
                continue;

            service.RemoveMember(currentUser, _workspaceId, member.UserId);
            service.AddMember(currentUser, _workspaceId, member.UserId, member.Role);
        }
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        if (HasChanges && !ConfirmDiscardChanges())
            return;

        DialogResult = DialogResult.Cancel;
        Close();
    }

    private void WorkspaceMemberForm_FormClosing(object sender, FormClosingEventArgs e)
    {
        if (DialogResult != DialogResult.None || !HasChanges)
            return;

        if (!ConfirmDiscardChanges())
            e.Cancel = true;
    }

    private bool ConfirmDiscardChanges() =>
        MessageBox.Show(
            Localization.Get(K.ConfirmDiscardMemberChanges),
            Text,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question) == DialogResult.Yes;

    private sealed class UserListItem(int userId, string username)
    {
        public int UserId { get; } = userId;

        public override string ToString() => username;
    }

    private sealed class PendingMember(int userId, string username, WorkspaceMemberRole role, bool isNew = false)
    {
        public int UserId { get; } = userId;
        public string Username { get; } = username;
        public WorkspaceMemberRole Role { get; set; } = role;
        public bool IsOwner => Role == WorkspaceMemberRole.Owner;
        public bool IsNew { get; } = isNew;
        public bool IsRemoved { get; set; }

        public override string ToString()
        {
            var roleLabel = IsOwner
                ? Localization.Get(K.MemberRoleOwner)
                : LocalizationDisplay.FormatWorkspaceMemberRole(Role);
            return $"{Username} ({roleLabel})";
        }
    }
}

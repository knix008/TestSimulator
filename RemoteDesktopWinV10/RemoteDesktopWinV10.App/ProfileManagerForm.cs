using System.Linq;

namespace RemoteDesktopWinV10.App;

public partial class ProfileManagerForm : Form
{
    private List<ConnectionProfile> _profiles = new();

    public ProfileManagerForm()
    {
        InitializeComponent();
        UiTheme.ApplyDialogChrome(this);
        UiTheme.StylePanelRoot(panelRoot);
        UiTheme.StyleListBox(listProfiles);
        UiTheme.StyleLabelMuted(labelHint);
        UiTheme.StylePrimaryButton(buttonAdd);
        UiTheme.StyleSecondaryButton(buttonEdit);
        UiTheme.StyleSecondaryButton(buttonClose);
        UiTheme.StyleDangerOutlineButton(buttonDelete);
        ReloadList();
    }

    /// <summary>닫을 때 목록에서 선택돼 있던 프로필 Id(메인 창 콤보 복원용).</summary>
    public Guid? LastSelectedProfileId { get; private set; }

    private void ReloadList()
    {
        try
        {
            _profiles = ConnectionProfileStore.Load();
        }
        catch (Exception ex)
        {
            _profiles = new List<ConnectionProfile>();
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "프로필 목록을 불러오지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }

        listProfiles.BeginUpdate();
        listProfiles.Items.Clear();
        foreach (var p in _profiles)
        {
            listProfiles.Items.Add(p);
        }

        listProfiles.DisplayMember = nameof(ConnectionProfile.Name);
        listProfiles.EndUpdate();
    }

    private ConnectionProfile? SelectedProfile =>
        listProfiles.SelectedItem is ConnectionProfile p ? p : null;

    private void buttonAdd_Click(object sender, EventArgs e)
    {
        using var dlg = new ProfileEditForm(null);
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _profiles.Add(dlg.Profile);
        try
        {
            ConnectionProfileStore.Save(_profiles);
        }
        catch (Exception ex)
        {
            _profiles.RemoveAt(_profiles.Count - 1);
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "프로필을 저장하지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        ReloadList();
        SelectById(dlg.Profile.Id);
    }

    private void buttonEdit_Click(object sender, EventArgs e)
    {
        var cur = SelectedProfile;
        if (cur == null)
        {
            MessageBox.Show(this, "편집할 프로필을 선택하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dlg = new ProfileEditForm(cur);
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var idx = _profiles.FindIndex(x => x.Id == cur.Id);
        if (idx >= 0)
        {
            _profiles[idx] = dlg.Profile;
        }

        try
        {
            ConnectionProfileStore.Save(_profiles);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "프로필 변경을 저장하지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            ReloadList();
            return;
        }

        ReloadList();
        SelectById(dlg.Profile.Id);
    }

    private void buttonDelete_Click(object sender, EventArgs e)
    {
        var cur = SelectedProfile;
        if (cur == null)
        {
            MessageBox.Show(this, "삭제할 프로필을 선택하세요.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (MessageBox.Show(this, $"프로필 \"{cur.Name}\" 을(를) 삭제할까요?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
        {
            return;
        }

        var removed = _profiles.Where(x => x.Id == cur.Id).ToList();
        _profiles.RemoveAll(x => x.Id == cur.Id);
        try
        {
            ConnectionProfileStore.Save(_profiles);
        }
        catch (Exception ex)
        {
            foreach (var p in removed)
            {
                _profiles.Add(p);
            }

            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "프로필 삭제를 저장하지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        ReloadList();
    }

    private void SelectById(Guid id)
    {
        for (var i = 0; i < listProfiles.Items.Count; i++)
        {
            if (listProfiles.Items[i] is ConnectionProfile p && p.Id == id)
            {
                listProfiles.SelectedIndex = i;
                return;
            }
        }
    }

    private void listProfiles_DoubleClick(object sender, EventArgs e)
    {
        buttonEdit_Click(sender, e);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        LastSelectedProfileId = SelectedProfile?.Id;
        base.OnFormClosing(e);
    }
}

using MyWorkspace.Core.Models;

namespace MyWorkspace.Win.Forms;

public partial class PageHistoryForm : Form
{
    private readonly int _pageId;
    private readonly string _pageTitle;

    public bool Restored { get; private set; }

    public PageHistoryForm(int pageId, string pageTitle)
    {
        _pageId = pageId;
        _pageTitle = pageTitle;
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void PageHistoryForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        LoadVersions();
    }

    private void ApplyLocalization()
    {
        Text = string.Format(Localization.Get(K.PageHistoryTitleFormat), _pageTitle);
        lblList.Text = Localization.Get(K.LabelSavedVersions);
        colSavedAt.HeaderText = Localization.Get(K.ColSavedAt);
        colSavedBy.HeaderText = Localization.Get(K.ColSavedBy);
        colTitle.HeaderText = Localization.Get(K.LabelTitle);
        lblPreview.Text = Localization.Get(K.LabelPreview);
        btnRestore.Text = Localization.Get(K.ButtonRestore);
        btnClose.Text = Localization.Get(K.ButtonClose);
    }

    private void LoadVersions()
    {
        gridVersions.Rows.Clear();
        foreach (var version in AppConfig.Services.PageVersions.GetVersions(SessionContext.CurrentUser, _pageId))
        {
            gridVersions.Rows.Add(
                version.Id,
                version.SavedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss"),
                version.SavedByUsername,
                version.Title);
        }

        txtPreview.Clear();
        btnRestore.Enabled = false;
    }

    private int? GetSelectedVersionId()
    {
        if (gridVersions.CurrentRow == null)
            return null;

        return Convert.ToInt32(gridVersions.CurrentRow.Cells["colVersionId"].Value);
    }

    private void gridVersions_SelectionChanged(object sender, EventArgs e)
    {
        var versionId = GetSelectedVersionId();
        if (!versionId.HasValue)
        {
            txtPreview.Clear();
            btnRestore.Enabled = false;
            return;
        }

        var version = AppConfig.Services.PageVersions.GetVersion(SessionContext.CurrentUser, versionId.Value);
        if (version == null)
            return;

        txtPreview.Text = $"# {version.Title}\r\n\r\n{version.Content}";
        btnRestore.Enabled = true;
    }

    private void btnRestore_Click(object sender, EventArgs e)
    {
        var versionId = GetSelectedVersionId();
        if (!versionId.HasValue)
            return;

        if (MessageBox.Show(
                Localization.Get(K.ConfirmRestoreVersion),
                Text,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
            return;

        try
        {
            AppConfig.Services.PageVersions.RestoreVersion(SessionContext.CurrentUser, versionId.Value);
            Restored = true;
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Text, ex);
        }
    }

    private void btnClose_Click(object sender, EventArgs e) => Close();
}

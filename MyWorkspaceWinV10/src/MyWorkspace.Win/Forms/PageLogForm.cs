namespace MyWorkspace.Win.Forms;

public partial class PageLogForm : Form
{
    private readonly int _pageId;
    private readonly string _pageTitle;

    public PageLogForm(int pageId, string pageTitle)
    {
        _pageId = pageId;
        _pageTitle = pageTitle;
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void PageLogForm_Load(object sender, EventArgs e)
    {
        ApplyLocalization();
        LoadLogs();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Format(K.PageLogTitleFormat, _pageTitle);
        lblList.Text = Localization.Get(K.LabelPageChangeLog);
        colChangedAt.HeaderText = Localization.Get(K.ColChangedAt);
        colChangedBy.HeaderText = Localization.Get(K.ColChangedBy);
        colChange.HeaderText = Localization.Get(K.ColChangeDescription);
        btnClose.Text = Localization.Get(K.ButtonClose);
    }

    private void LoadLogs()
    {
        gridLogs.Rows.Clear();
        foreach (var log in AppConfig.Services.PageChangeLogs.GetLogs(SessionContext.CurrentUser, _pageId))
        {
            gridLogs.Rows.Add(
                log.Id,
                log.ChangedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss"),
                log.ChangedByUsername,
                PageChangeLogFormatter.FormatDescription(log));
        }
    }

    private void btnClose_Click(object sender, EventArgs e) => Close();
}

using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class RepositorySummaryPreviewForm : Form
{
    private readonly RepositorySummary _summary;
    private readonly string? _preferredFormat;
    private readonly List<Image> _chartImages = [];

    public string? ExportedFilePath { get; private set; }

    public string? ExportedFormat { get; private set; }

    public RepositorySummaryPreviewForm(RepositorySummary summary, string? preferredFormat = null)
    {
        _summary = summary;
        _preferredFormat = preferredFormat;
        InitializeComponent();
        ApplyLocalizedChrome();
        BuildPreview();
        ApplyPreferredFormatHighlight();

        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged()
    {
        ApplyLocalizedChrome();
        BuildPreview();
    }

    private void ApplyLocalizedChrome()
    {
        Text = Localization.Tf("Preview.Title", _summary.RepositoryName);
        titleLabel.Text = Localization.T("Preview.ReportTitle");
        subtitleLabel.Text = Localization.Tf("Preview.Subtitle", _summary.CurrentBranch, _summary.GeneratedAt);
        exportPdfButton.Text = Localization.T("Preview.ExportPdf");
        exportWordButton.Text = Localization.T("Preview.ExportWord");
        exportMarkdownButton.Text = Localization.T("Preview.ExportMarkdown");
        closeButton.Text = Localization.T("Preview.Close");
    }

    private void ApplyPreferredFormatHighlight()
    {
        Button? preferred = _preferredFormat switch
        {
            "pdf" => exportPdfButton,
            "docx" => exportWordButton,
            "md" => exportMarkdownButton,
            _ => null
        };

        if (preferred is null)
        {
            return;
        }

        AcceptButton = preferred;
        preferred.Font = new Font(preferred.Font, FontStyle.Bold);
    }

    private void BuildPreview()
    {
        contentPanel.SuspendLayout();
        contentPanel.Controls.Clear();

        var flow = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            Padding = new Padding(4),
            Width = Math.Max(200, contentPanel.ClientSize.Width - 24)
        };

        flow.Controls.Add(CreateHeading(Localization.Tf("Preview.RepoSummaryHeading", _summary.RepositoryName)));
        flow.Controls.Add(CreateParagraph(
            Localization.Tf(
                "Preview.SummaryInfo",
                _summary.RepositoryPath,
                _summary.CurrentBranch,
                _summary.LocalBranches.Count,
                _summary.RemoteBranches.Count,
                _summary.Tags.Count,
                _summary.Releases.Count)));

        if (_summary.Charts.Count > 0)
        {
            flow.Controls.Add(CreateHeading(Localization.T("Preview.Charts")));
            foreach (var chart in _summary.Charts)
            {
                flow.Controls.Add(CreateSubheading(chart.Title));
                flow.Controls.Add(CreateChartPicture(chart));
            }
        }

        flow.Controls.Add(CreateHeading(Localization.T("Preview.HeadCommit")));
        if (_summary.HeadCommitSha is null)
        {
            flow.Controls.Add(CreateParagraph(Localization.T("Preview.NoCommits")));
        }
        else
        {
            flow.Controls.Add(CreateParagraph(
                Localization.Tf(
                    "Preview.HeadInfo",
                    _summary.HeadCommitSha ?? string.Empty,
                    _summary.HeadCommitAuthor ?? string.Empty,
                    _summary.HeadCommitDate ?? DateTimeOffset.MinValue,
                    _summary.HeadCommitMessage ?? string.Empty)));
        }

        AddListSection(flow, Localization.T("Preview.Remotes"), _summary.Remotes);
        AddListSection(flow, Localization.T("Preview.LocalBranchesSection"), _summary.LocalBranches);
        AddListSection(flow, Localization.T("Preview.RemoteBranchesSection"), _summary.RemoteBranches);
        AddListSection(flow, Localization.T("Preview.TagsSection"), _summary.Tags);

        flow.Controls.Add(CreateHeading(Localization.T("Preview.ReleasesSection")));
        if (_summary.Releases.Count == 0)
        {
            flow.Controls.Add(CreateParagraph(Localization.T("Preview.None")));
        }
        else
        {
            var releaseLines = _summary.Releases
                .Select(release =>
                {
                    string date = release.PublishedAt?.ToString("yyyy-MM-dd") ?? "n/a";
                    return $"• {release.Name} (tag: {release.TagName}, published: {date})";
                });
            flow.Controls.Add(CreateParagraph(string.Join(Environment.NewLine, releaseLines)));
        }

        flow.Controls.Add(CreateHeading(Localization.T("Preview.RecentCommits")));
        flow.Controls.Add(CreateRecentCommitsView(_summary.RecentCommits));

        contentPanel.Controls.Add(flow);
        contentPanel.Resize += (_, _) => flow.Width = Math.Max(200, contentPanel.ClientSize.Width - 24);
        contentPanel.ResumeLayout(true);
    }

    private static void AddListSection(FlowLayoutPanel flow, string title, IReadOnlyList<string> items)
    {
        flow.Controls.Add(CreateHeading(title));
        flow.Controls.Add(items.Count == 0
            ? CreateParagraph(Localization.T("Preview.None"))
            : CreateParagraph(string.Join(Environment.NewLine, items.Select(item => $"• {item}"))));
    }

    private static Label CreateHeading(string text) =>
        new()
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(820, 0),
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 64, 175),
            Margin = new Padding(0, 16, 0, 6),
            UseCompatibleTextRendering = true
        };

    private static Label CreateSubheading(string text) =>
        new()
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(820, 0),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(51, 65, 85),
            Margin = new Padding(0, 8, 0, 4),
            UseCompatibleTextRendering = true
        };

    private static Label CreateParagraph(string text) =>
        new()
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(820, 0),
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(30, 41, 59),
            Margin = new Padding(0, 0, 0, 4),
            UseCompatibleTextRendering = true
        };

    private PictureBox CreateChartPicture(RepositoryChartImage chart)
    {
        using var stream = new MemoryStream(chart.PngData);
        var image = Image.FromStream(stream);
        _chartImages.Add(image);

        int maxWidth = 820;
        int width = Math.Min(maxWidth, image.Width);
        int height = (int)Math.Round(image.Height * (width / (double)image.Width));

        return new PictureBox
        {
            Image = image,
            SizeMode = PictureBoxSizeMode.Zoom,
            Size = new Size(width, height),
            Margin = new Padding(0, 0, 0, 8),
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.White
        };
    }

    private static Control CreateRecentCommitsView(IReadOnlyList<RepositoryCommitSummary> commits)
    {
        if (commits.Count == 0)
        {
            return CreateParagraph(Localization.T("Preview.None"));
        }

        var listView = new ListView
        {
            View = View.Details,
            FullRowSelect = true,
            GridLines = true,
            HeaderStyle = ColumnHeaderStyle.Nonclickable,
            Size = new Size(820, Math.Min(260, 24 + commits.Count * 22)),
            Margin = new Padding(0, 0, 0, 8),
            Font = new Font("Segoe UI", 9f)
        };
        listView.Columns.Add("SHA", 72);
        listView.Columns.Add("Date", 92);
        listView.Columns.Add("Author", 140);
        listView.Columns.Add("Message", 500);

        foreach (var commit in commits)
        {
            var item = new ListViewItem(commit.ShortSha);
            item.SubItems.Add(commit.Date.ToString("yyyy-MM-dd"));
            item.SubItems.Add(commit.Author);
            item.SubItems.Add(commit.Message);
            listView.Items.Add(item);
        }

        return listView;
    }

    private void ExportPdfButton_Click(object? sender, EventArgs e) => Export("pdf");

    private void ExportWordButton_Click(object? sender, EventArgs e) => Export("docx");

    private void ExportMarkdownButton_Click(object? sender, EventArgs e) => Export("md");

    private void Export(string format)
    {
        if (!RepositorySummaryExportDialog.TryPickExportPath(this, _summary, format, out string? filePath)
            || filePath is null)
        {
            return;
        }

        try
        {
            RepositorySummaryExportService.Export(_summary, filePath);
            ExportedFilePath = filePath;
            ExportedFormat = format;
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            ErrorDetailDialog.Show(this, "Export Failed", ex);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            foreach (var image in _chartImages)
            {
                image.Dispose();
            }

            _chartImages.Clear();
            components?.Dispose();
        }

        base.Dispose(disposing);
    }
}

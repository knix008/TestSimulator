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
        Text = $"Report Preview — {summary.RepositoryName}";
        subtitleLabel.Text = $"{summary.CurrentBranch}  ·  Generated {summary.GeneratedAt:yyyy-MM-dd HH:mm:ss}";
        BuildPreview();
        ApplyPreferredFormatHighlight();
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

        flow.Controls.Add(CreateHeading($"Repository Summary: {_summary.RepositoryName}"));
        flow.Controls.Add(CreateParagraph(
            $"Path: {_summary.RepositoryPath}{Environment.NewLine}" +
            $"Current branch: {_summary.CurrentBranch}{Environment.NewLine}" +
            $"Local branches: {_summary.LocalBranches.Count}   " +
            $"Remote branches: {_summary.RemoteBranches.Count}   " +
            $"Tags: {_summary.Tags.Count}   " +
            $"Releases: {_summary.Releases.Count}"));

        if (_summary.Charts.Count > 0)
        {
            flow.Controls.Add(CreateHeading("Charts"));
            foreach (var chart in _summary.Charts)
            {
                flow.Controls.Add(CreateSubheading(chart.Title));
                flow.Controls.Add(CreateChartPicture(chart));
            }
        }

        flow.Controls.Add(CreateHeading("HEAD Commit"));
        if (_summary.HeadCommitSha is null)
        {
            flow.Controls.Add(CreateParagraph("(no commits)"));
        }
        else
        {
            flow.Controls.Add(CreateParagraph(
                $"SHA: {_summary.HeadCommitSha}{Environment.NewLine}" +
                $"Author: {_summary.HeadCommitAuthor}{Environment.NewLine}" +
                $"Date: {_summary.HeadCommitDate:yyyy-MM-dd HH:mm:ss}{Environment.NewLine}" +
                $"Message: {_summary.HeadCommitMessage}"));
        }

        AddListSection(flow, "Remotes", _summary.Remotes);
        AddListSection(flow, "Local Branches", _summary.LocalBranches);
        AddListSection(flow, "Remote Branches", _summary.RemoteBranches);
        AddListSection(flow, "Tags", _summary.Tags);

        flow.Controls.Add(CreateHeading("Releases"));
        if (_summary.Releases.Count == 0)
        {
            flow.Controls.Add(CreateParagraph("(none)"));
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

        flow.Controls.Add(CreateHeading("Recent Commits"));
        flow.Controls.Add(CreateRecentCommitsView(_summary.RecentCommits));

        contentPanel.Controls.Add(flow);
        contentPanel.Resize += (_, _) => flow.Width = Math.Max(200, contentPanel.ClientSize.Width - 24);
        contentPanel.ResumeLayout(true);
    }

    private static void AddListSection(FlowLayoutPanel flow, string title, IReadOnlyList<string> items)
    {
        flow.Controls.Add(CreateHeading(title));
        flow.Controls.Add(items.Count == 0
            ? CreateParagraph("(none)")
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
            return CreateParagraph("(none)");
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

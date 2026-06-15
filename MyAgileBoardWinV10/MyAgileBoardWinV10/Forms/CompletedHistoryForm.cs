using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class CompletedHistoryForm : Form
{
    private readonly KanbanProject _project;

    public CompletedHistoryForm(KanbanProject project)
    {
        _project = project;
        InitializeComponent();
        PopulateAll();
    }

    private void PopulateAll()
    {
        PopulateTab(lvWeekly,  GroupByWeek);
        PopulateTab(lvMonthly, GroupByMonth);
        PopulateTab(lvYearly,  GroupByYear);
    }

    private void PopulateTab(ListView lv,
        Func<IEnumerable<ArchivedCard>, IEnumerable<(string Label, IEnumerable<ArchivedCard> Items)>> grouper)
    {
        lv.Groups.Clear();
        lv.Items.Clear();

        var sorted = _project.ArchivedCards
            .OrderByDescending(a => a.ArchivedAt)
            .ToList();

        foreach (var (label, items) in grouper(sorted))
        {
            var grp = new ListViewGroup(label) { HeaderAlignment = HorizontalAlignment.Left };
            lv.Groups.Add(grp);
            foreach (var a in items)
            {
                var li = new ListViewItem(a.Card.Title) { Group = grp };
                li.SubItems.Add(a.Card.Points + "pt");
                li.SubItems.Add(a.Card.Priority.ToString());
                li.SubItems.Add(a.Card.Assignee);
                li.SubItems.Add(a.SourceColumnName);
                li.SubItems.Add(a.ArchivedAt.ToString("yyyy-MM-dd HH:mm"));
                li.Tag = a;
                lv.Items.Add(li);
            }
        }
    }

    // ── Groupers ─────────────────────────────────────────────────────

    private static IEnumerable<(string, IEnumerable<ArchivedCard>)> GroupByWeek(
        IEnumerable<ArchivedCard> cards)
    {
        return cards
            .GroupBy(a =>
            {
                var d = a.ArchivedAt.Date;
                int week = System.Globalization.ISOWeek.GetWeekOfYear(d);
                return $"{d.Year}년 {week:D2}주";
            })
            .Select(g => (g.Key, g.AsEnumerable()));
    }

    private static IEnumerable<(string, IEnumerable<ArchivedCard>)> GroupByMonth(
        IEnumerable<ArchivedCard> cards)
    {
        return cards
            .GroupBy(a => $"{a.ArchivedAt.Year}년 {a.ArchivedAt.Month:D2}월")
            .Select(g => (g.Key, g.AsEnumerable()));
    }

    private static IEnumerable<(string, IEnumerable<ArchivedCard>)> GroupByYear(
        IEnumerable<ArchivedCard> cards)
    {
        return cards
            .GroupBy(a => $"{a.ArchivedAt.Year}년")
            .Select(g => (g.Key, g.AsEnumerable()));
    }

    // ── Status label ─────────────────────────────────────────────────

    private void tabControl_SelectedIndexChanged(object? sender, EventArgs e)
        => UpdateStatus();

    private void UpdateStatus()
    {
        var lv = tabControl.SelectedIndex switch
        {
            0 => lvWeekly,
            1 => lvMonthly,
            _ => lvYearly
        };
        int totalPts = lv.Items.Cast<ListViewItem>()
            .Sum(li => int.TryParse(li.SubItems[1].Text.Replace("pt", ""), out var v) ? v : 0);
        lblStatus.Text = $"항목 {lv.Items.Count}개  /  합계 {totalPts}pt";
    }
}

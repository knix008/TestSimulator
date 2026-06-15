using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Forms;

public partial class SummaryForm : Form
{
    private readonly KanbanProject _project;

    private static readonly Color[] ChartColors =
    {
        Color.FromArgb(68, 114, 196),
        Color.FromArgb(237, 125, 49),
        Color.FromArgb(112, 173, 71),
        Color.FromArgb(158, 73, 211),
        Color.FromArgb(231, 76, 60),
        Color.FromArgb(26, 188, 156),
        Color.FromArgb(241, 196, 15),
        Color.FromArgb(52, 152, 219),
    };

    public SummaryForm(KanbanProject project)
    {
        _project = project;
        InitializeComponent();
        LoadStats();
        Text = $"Summary — {project.Name}";
    }

    private void LoadStats()
    {
        int total = _project.Columns.Sum(c => c.Cards.Count);
        int done = _project.Columns.Where(c => c.IsCompletionColumn).Sum(c => c.Cards.Count);
        int overdue = _project.Columns
            .SelectMany(c => c.Cards)
            .Count(c => c.DueDate.HasValue && c.DueDate.Value.Date < DateTime.Today && !_project.Columns.Where(col => col.IsCompletionColumn).SelectMany(col => col.Cards).Any(x => x.Id == c.Id));

        lblTotalCards.Text = $"전체 카드: {total}개";
        lblDoneCards.Text = $"완료: {done}개";
        lblRemainingCards.Text = $"진행중/대기: {total - done}개";
        lblOverdue.Text = $"기한 초과: {overdue}개";
        lblOverdue.ForeColor = overdue > 0 ? Color.Red : Color.SeaGreen;

        BuildColumnStats();
        BuildPriorityStats();

        panelPieChart.Invalidate();
        panelBarChart.Invalidate();
    }

    private void BuildColumnStats()
    {
        panelColumnStats.Controls.Clear();
        int y = 4;
        foreach (var col in _project.Columns)
        {
            var color = ColorTranslator.FromHtml(col.HeaderColorHex);
            var row = new Panel { Location = new Point(0, y), Size = new Size(panelColumnStats.Width - 4, 22), Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            var chip = new Panel { Location = new Point(4, 4), Size = new Size(14, 14), BackColor = color };
            var lbl = new Label { AutoSize = true, Location = new Point(24, 3), Text = $"{col.Name}: {col.Cards.Count}개", Font = new Font("Segoe UI", 8.5F) };
            row.Controls.Add(chip);
            row.Controls.Add(lbl);
            panelColumnStats.Controls.Add(row);
            y += 24;
        }
    }

    private void BuildPriorityStats()
    {
        var allCards = _project.Columns.SelectMany(c => c.Cards).ToList();
        var byPriority = Enum.GetValues<Priority>()
            .ToDictionary(p => p, p => allCards.Count(c => c.Priority == p));

        panelPriorityStats.Controls.Clear();
        int y = 4;
        var priorityColors = new Dictionary<Priority, Color>
        {
            { Priority.Critical, Color.Red },
            { Priority.High, Color.OrangeRed },
            { Priority.Medium, Color.DarkOrange },
            { Priority.Low, Color.SeaGreen },
        };

        foreach (var (priority, count) in byPriority.OrderByDescending(kv => (int)kv.Key))
        {
            var row = new Panel { Location = new Point(0, y), Size = new Size(panelPriorityStats.Width - 4, 22), Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            var chip = new Panel { Location = new Point(4, 4), Size = new Size(14, 14), BackColor = priorityColors[priority] };
            var lbl = new Label { AutoSize = true, Location = new Point(24, 3), Text = $"{priority}: {count}개", Font = new Font("Segoe UI", 8.5F) };
            row.Controls.Add(chip);
            row.Controls.Add(lbl);
            panelPriorityStats.Controls.Add(row);
            y += 24;
        }
    }

    private void panelPieChart_Paint(object sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        var panel = (Panel)sender;
        int size = Math.Min(panel.Width, panel.Height) - 40;
        if (size < 20) return;

        var rect = new Rectangle(10, 10, size, size);
        int total = _project.Columns.Sum(c => c.Cards.Count);

        if (total == 0)
        {
            using var brush = new SolidBrush(Color.LightGray);
            g.FillEllipse(brush, rect);
            g.DrawString("카드 없음", new Font("Segoe UI", 9F), Brushes.Gray, rect.X + 20, rect.Y + size / 2 - 8);
            return;
        }

        float startAngle = -90f;
        int colorIdx = 0;
        int legendY = 10;

        foreach (var col in _project.Columns)
        {
            if (col.Cards.Count == 0) { colorIdx++; continue; }
            float sweep = 360f * col.Cards.Count / total;
            var color = ChartColors[colorIdx % ChartColors.Length];

            using var brush = new SolidBrush(color);
            g.FillPie(brush, rect, startAngle, sweep);
            using var pen = new Pen(Color.White, 1.5f);
            g.DrawPie(pen, rect, startAngle, sweep);

            // Legend
            int lx = size + 20;
            g.FillRectangle(brush, lx, legendY, 12, 12);
            g.DrawString($"{col.Name} ({col.Cards.Count})", new Font("Segoe UI", 7.5F),
                Brushes.Black, lx + 16, legendY - 1);

            startAngle += sweep;
            colorIdx++;
            legendY += 18;
        }
    }

    private void panelBarChart_Paint(object sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        var panel = (Panel)sender;
        var allCards = _project.Columns.SelectMany(c => c.Cards).ToList();
        int total = allCards.Count;
        if (total == 0) return;

        var priorities = Enum.GetValues<Priority>().Reverse().ToArray();
        var priorityColors = new Dictionary<Priority, Color>
        {
            { Priority.Critical, Color.Red },
            { Priority.High, Color.OrangeRed },
            { Priority.Medium, Color.DarkOrange },
            { Priority.Low, Color.SeaGreen },
        };

        int maxCount = priorities.Max(p => allCards.Count(c => c.Priority == p));
        if (maxCount == 0) return;

        int barHeight = 24;
        int barMaxWidth = panel.Width - 120;
        int startY = 10;
        int startX = 80;

        foreach (var priority in priorities)
        {
            int count = allCards.Count(c => c.Priority == priority);
            int barWidth = maxCount > 0 ? count * barMaxWidth / maxCount : 0;

            using var brush = new SolidBrush(priorityColors[priority]);
            var barRect = new Rectangle(startX, startY, Math.Max(barWidth, 2), barHeight - 4);
            g.FillRectangle(brush, barRect);

            g.DrawString(priority.ToString(), new Font("Segoe UI", 8F), Brushes.Black, 2, startY + 4);
            g.DrawString(count.ToString(), new Font("Segoe UI", 8F), Brushes.DimGray,
                startX + barWidth + 4, startY + 4);

            startY += barHeight;
        }
    }

    private void btnClose_Click(object sender, EventArgs e) => Close();

    private void btnRefresh_Click(object sender, EventArgs e) => LoadStats();
}

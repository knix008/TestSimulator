using System.Drawing.Drawing2D;
using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Services;

namespace MyAgileBoardWinV10.Forms;

public partial class BurndownChartForm : Form
{
    private readonly KanbanProject _project;
    private BurndownChartColorSettings _chartColors;

    // Chart data computed on refresh
    private record DayData(DateTime Date, int PointsCompleted, int CumulativeCompleted);
    private List<DayData> _chartData = new();
    private int _totalPoints;

    public BurndownChartForm(KanbanProject project)
    {
        _project = project;
        _chartColors = AppSettings.GetBurndownChartColors();
        InitializeComponent();
        dtpStart.Value = DateTime.Today.AddDays(-13);
        dtpEnd.Value   = DateTime.Today;
        dtpStart.ValueChanged += DateRange_ValueChanged;
        dtpEnd.ValueChanged   += DateRange_ValueChanged;
        RefreshChart();
    }

    private void DateRange_ValueChanged(object? sender, EventArgs e)
    {
        if (dtpStart.Value.Date > dtpEnd.Value.Date)
        {
            if (sender == dtpStart)
                dtpEnd.Value = dtpStart.Value;
            else
                dtpStart.Value = dtpEnd.Value;
        }
        RefreshChart();
    }

    private void RefreshChart()
    {
        var start = dtpStart.Value.Date;
        var end   = dtpEnd.Value.Date;
        if (start > end) return;

        // ── Total scope = 현재 모든 컬럼의 카드 + 아카이브된 카드 ──────────
        int activePoints   = _project.Columns.Sum(c => c.Cards.Sum(k => k.Points));
        int archivedPoints = _project.ArchivedCards.Sum(a => a.Card.Points);
        _totalPoints = activePoints + archivedPoints;

        // ── 완료된 포인트 수집 (두 소스를 합산) ──────────────────────────
        // ① 현재 완료(Done) 컬럼에 남아 있는 카드 → CompletedAt 기준
        var fromDoneColumns = _project.Columns
            .Where(c => c.IsCompletionColumn)
            .SelectMany(c => c.Cards)
            .Where(k => k.CompletedAt.HasValue
                     && k.CompletedAt.Value.Date >= start
                     && k.CompletedAt.Value.Date <= end)
            .Select(k => (Date: k.CompletedAt!.Value.Date, Points: k.Points));

        // ② Done에서 삭제(아카이브)된 카드 → ArchivedAt 기준
        var fromArchive = _project.ArchivedCards
            .Where(a => a.ArchivedAt.Date >= start && a.ArchivedAt.Date <= end)
            .Select(a => (Date: a.ArchivedAt.Date, Points: a.Card.Points));

        var completedByDay = fromDoneColumns
            .Concat(fromArchive)
            .GroupBy(x => x.Date)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Points));

        // ── 날짜별 누적 완료 및 잔여 계산 ────────────────────────────────
        _chartData = new List<DayData>();
        int cumulative = 0;
        for (var d = start; d <= end; d = d.AddDays(1))
        {
            int pts = completedByDay.TryGetValue(d, out var v) ? v : 0;
            cumulative += pts;
            _chartData.Add(new DayData(d, pts, cumulative));
        }

        int remaining = Math.Max(0, _totalPoints - cumulative);
        lblSummary.Text = $"기간: {start:yyyy-MM-dd} ~ {end:yyyy-MM-dd}  |  " +
                          $"완료: {cumulative}pt / 전체: {_totalPoints}pt  |  " +
                          $"잔여: {remaining}pt";

        panelChart.Invalidate();
    }

    // ── Chart rendering ──────────────────────────────────────────────

    private void panelChart_Paint(object? sender, PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.White);

        if (_chartData.Count == 0 || _totalPoints == 0)
        {
            using var emptyFont = new Font("Segoe UI", 10F);
            g.DrawString("데이터가 없습니다. 날짜 범위를 조정하거나 카드를 Done으로 이동하세요.",
                emptyFont, Brushes.DimGray, 20, 20);
            return;
        }

        var r = panelChart.ClientRectangle;
        const int marginL = 55;   // Y축 레이블 공간
        const int marginR = 20;
        const int marginT = 20;
        const int marginB = 36;   // X축 레이블 공간

        int chartW = r.Width  - marginL - marginR;
        int chartH = r.Height - marginT - marginB;
        if (chartW < 10 || chartH < 10) return;

        using var gridPen = new Pen(Color.FromArgb(220, 220, 220), 1f) { DashStyle = DashStyle.Dot };
        using var axisPen = new Pen(Color.DimGray, 1.5f);
        using var axisFont  = new Font("Segoe UI", 7.5f);

        // ── Y 축 ─────────────────────────────────────────────────────────
        g.DrawLine(axisPen, marginL, marginT, marginL, marginT + chartH);
        g.DrawLine(axisPen, marginL, marginT + chartH, marginL + chartW, marginT + chartH);

        int maxY   = _totalPoints;
        int yDivs  = Math.Min(maxY, 10);

        for (int i = 0; i <= yDivs; i++)
        {
            int val = (int)Math.Round((double)maxY * i / yDivs);
            int y   = marginT + chartH - (int)((double)chartH * i / yDivs);
            g.DrawLine(gridPen, marginL, y, marginL + chartW, y);
            var label = val.ToString();
            var sz    = g.MeasureString(label, axisFont);
            g.DrawString(label, axisFont, Brushes.DimGray, marginL - sz.Width - 3, y - sz.Height / 2);
        }

        int days  = _chartData.Count;
        float stepX = (float)chartW / Math.Max(days - 1, 1);

        // ── X 축 레이블 ────────────────────────────────────────────────────
        int xStep = Math.Max(1, days / 12);
        for (int i = 0; i < days; i += xStep)
        {
            float x = marginL + i * stepX;
            var label = _chartData[i].Date.ToString("MM/dd");
            var sz    = g.MeasureString(label, axisFont);
            g.DrawString(label, axisFont, Brushes.DimGray, x - sz.Width / 2, marginT + chartH + 4);
        }

        // ── 이상 소진선 (Ideal Burn Down): totalPoints → 0 ────────────────
        var idealColor = ColorFromHex(_chartColors.IdealLineHex, Color.FromArgb(160, 160, 160));
        using var idealPen = new Pen(Color.FromArgb(180, idealColor), 1.5f) { DashStyle = DashStyle.Dash };
        float iy0 = marginT;                         // 시작: totalPoints (상단)
        float iy1 = marginT + chartH;               // 끝: 0 (하단)
        g.DrawLine(idealPen, marginL, iy0, marginL + chartW, iy1);

        // ── 일별 완료 포인트 막대 ───────────────────────────────────────────
        float barW = Math.Max(2f, stepX * 0.45f);
        var barColor = ColorFromHex(_chartColors.DailyBarHex, Color.FromArgb(34, 139, 71));
        using var barBrush = new SolidBrush(barColor);
        using var barBorderPen = new Pen(Darken(barColor, 0.85f), 1f);
        for (int i = 0; i < days; i++)
        {
            if (_chartData[i].PointsCompleted <= 0) continue;
            float bh = (float)chartH * _chartData[i].PointsCompleted / maxY;
            float bx = marginL + i * stepX - barW / 2;
            float by = marginT + chartH - bh;
            var barRect = new RectangleF(bx, by, barW, bh);
            g.FillRectangle(barBrush, barRect);
            g.DrawRectangle(barBorderPen, barRect.X, barRect.Y, barRect.Width, barRect.Height);
        }

        // ── 실제 잔여량 선 (Actual Burn Down): remaining = total - cumulative ─
        var remainingColor = ColorFromHex(_chartColors.RemainingLineHex, Color.FromArgb(220, 60, 60));
        using var actualPen  = new Pen(remainingColor, 2.2f);
        using var actualBrush = new SolidBrush(remainingColor);
        var burnPts = new PointF[days];
        for (int i = 0; i < days; i++)
        {
            int remaining = Math.Max(0, _totalPoints - _chartData[i].CumulativeCompleted);
            burnPts[i] = new PointF(
                marginL + i * stepX,
                marginT + chartH - (float)chartH * remaining / maxY);
        }
        if (burnPts.Length > 1) g.DrawLines(actualPen, burnPts);

        // 점 마커
        foreach (var pt in burnPts)
            g.FillEllipse(actualBrush, pt.X - 3.5f, pt.Y - 3.5f, 7, 7);

        // 마지막 날 잔여량 레이블
        var lastPt  = burnPts[^1];
        int lastRem = Math.Max(0, _totalPoints - _chartData[^1].CumulativeCompleted);
        if (lastRem > 0)
        {
            using var remFont = new Font("Segoe UI", 8f, FontStyle.Bold);
            g.DrawString($"{lastRem}pt 남음", remFont, actualBrush,
                lastPt.X + 4, lastPt.Y - 8);
        }

        // ── 범례 ──────────────────────────────────────────────────────────
        using var legendFont = new Font("Segoe UI", 8f);
        int lx = marginL + chartW - 160;
        int ly = marginT + 8;

        using var legendBarBrush = new SolidBrush(barColor);
        g.FillRectangle(legendBarBrush, lx, ly + 2, 20, 10);
        g.DrawRectangle(barBorderPen, lx, ly + 2, 20, 10);
        g.DrawString("일별 완료", legendFont, Brushes.DimGray, lx + 24, ly);

        g.DrawLine(idealPen, lx, ly + 22, lx + 20, ly + 22);
        g.DrawString("이상 소진선", legendFont, Brushes.DimGray, lx + 24, ly + 15);

        g.DrawLine(actualPen, lx, ly + 38, lx + 20, ly + 38);
        g.DrawString("실제 잔여량", legendFont, actualBrush, lx + 24, ly + 31);
    }

    // ── Event handlers ───────────────────────────────────────────────

    private void btnRefresh_Click(object? sender, EventArgs e) => RefreshChart();

    private void btnColors_Click(object? sender, EventArgs e)
    {
        using var dlg = new BurndownChartColorForm(_chartColors);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        _chartColors = dlg.Colors;
        AppSettings.SetBurndownChartColors(_chartColors);
        panelChart.Invalidate();
    }

    private void panelChart_Resize(object? sender, EventArgs e) => panelChart.Invalidate();

    private static Color ColorFromHex(string hex, Color fallback)
    {
        try { return ColorTranslator.FromHtml(hex); }
        catch { return fallback; }
    }

    private static Color Darken(Color color, float factor)
    {
        factor = Math.Clamp(factor, 0f, 1f);
        return Color.FromArgb(
            color.A,
            (int)(color.R * factor),
            (int)(color.G * factor),
            (int)(color.B * factor));
    }
}

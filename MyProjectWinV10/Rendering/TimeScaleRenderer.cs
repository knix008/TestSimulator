using MyProject.Theme;

namespace MyProject.Rendering
{
    public enum ZoomLevel { Days, Weeks, Months }

    public class TimeScaleRenderer
    {
        private readonly GanttViewport _viewport;
        private static readonly string[] WeekdayAbbr = { "Su", "Mo", "Tu", "We", "Th", "Fr", "Sa" };

        public TimeScaleRenderer(GanttViewport viewport)
        {
            _viewport = viewport;
        }

        public void Draw(Graphics g, Rectangle bounds)
        {
            DrawBackground(g, bounds);
            DrawUpperRow(g, bounds);       // Month / Year
            DrawMiddleRow(g, bounds);      // Day number
            DrawLowerRow(g, bounds);       // Weekday
        }

        private void DrawBackground(Graphics g, Rectangle bounds)
        {
            using var brush = new SolidBrush(AppTheme.TimescaleBackground);
            g.FillRectangle(brush, bounds);
        }

        // ── Row 1: Month ─────────────────────────────────────────────────────
        private void DrawUpperRow(Graphics g, Rectangle bounds)
        {
            int rowH = AppTheme.TimescaleTopHeight;
            var topBounds = new Rectangle(bounds.X, bounds.Y, bounds.Width, rowH);

            foreach (var (month, x, width) in GetMonthsInView())
            {
                // Cell background gradient
                using var bgBrush = new System.Drawing.Drawing2D.LinearGradientBrush(
                    topBounds,
                    Color.FromArgb(245, 247, 252),
                    AppTheme.TimescaleBackground,
                    System.Drawing.Drawing2D.LinearGradientMode.Vertical);
                g.FillRectangle(bgBrush, new Rectangle(x, topBounds.Y, width, rowH));

                var cellRect = new Rectangle(x + 4, topBounds.Y, width - 8, rowH);
                using var textBrush = new SolidBrush(AppTheme.TimescaleText);
                var sf = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center,
                    Trimming = StringTrimming.EllipsisCharacter
                };
                string label = width > 60 ? month.ToString("MMMM yyyy")
                             : width > 30 ? month.ToString("MMM yy")
                             : month.ToString("M");
                g.DrawString(label, AppTheme.FontTimescaleLarge, textBrush, cellRect, sf);

                using var pen = new Pen(AppTheme.TimescaleBorder);
                g.DrawLine(pen, x + width - 1, topBounds.Y + 2, x + width - 1, topBounds.Bottom - 2);
            }

            using var borderPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(borderPen, bounds.X, topBounds.Bottom - 1, bounds.Right, topBounds.Bottom - 1);
        }

        // ── Row 2: Day number ─────────────────────────────────────────────────
        private void DrawMiddleRow(Graphics g, Rectangle bounds)
        {
            int rowY = bounds.Y + AppTheme.TimescaleTopHeight;
            int rowH = AppTheme.TimescaleMiddleHeight;
            var rowBounds = new Rectangle(bounds.X, rowY, bounds.Width, rowH);

            foreach (var (date, x, width) in GetDaysInView())
            {
                bool isWeekend = date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday;
                bool isToday = date.Date == DateTime.Today;

                // Cell fill
                Color cellBg = isToday ? AppTheme.TimescaleToday
                             : isWeekend ? AppTheme.TimescaleWeekend
                             : AppTheme.TimescaleBackground;
                using var cellBrush = new SolidBrush(cellBg);
                g.FillRectangle(cellBrush, x, rowY, width, rowH);

                // Day number text
                if (width >= 10)
                {
                    bool showNum = _viewport.ZoomLevel == ZoomLevel.Days
                                || (_viewport.ZoomLevel == ZoomLevel.Weeks && date.DayOfWeek == DayOfWeek.Monday)
                                || (_viewport.ZoomLevel == ZoomLevel.Months && date.Day == 1);

                    if (_viewport.ZoomLevel == ZoomLevel.Days || showNum)
                    {
                        var font = isToday ? AppTheme.FontTimescaleLarge : AppTheme.FontTimescaleSmall;
                        Color textCol = isToday ? AppTheme.GridLineToday
                                     : isWeekend ? Color.FromArgb(140, 150, 170)
                                     : AppTheme.TimescaleText;
                        using var textBrush = new SolidBrush(textCol);
                        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                        g.DrawString(date.Day.ToString(), font, textBrush,
                            new RectangleF(x, rowY, width, rowH), sf);
                    }
                }

                // Right border (only for week start or every day if wide enough)
                bool drawBorder = _viewport.ZoomLevel == ZoomLevel.Days
                               || (_viewport.ZoomLevel == ZoomLevel.Weeks && date.DayOfWeek == DayOfWeek.Sunday)
                               || (_viewport.ZoomLevel == ZoomLevel.Months && date.Day == DateTime.DaysInMonth(date.Year, date.Month));
                if (drawBorder)
                {
                    using var pen = new Pen(AppTheme.GridLineColor);
                    g.DrawLine(pen, x + width - 1, rowY + 2, x + width - 1, rowY + rowH - 2);
                }
            }

            using var borderPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(borderPen, bounds.X, rowY + rowH - 1, bounds.Right, rowY + rowH - 1);
        }

        // ── Row 3: Weekday abbreviation ───────────────────────────────────────
        private void DrawLowerRow(Graphics g, Rectangle bounds)
        {
            int rowY = bounds.Y + AppTheme.TimescaleTopHeight + AppTheme.TimescaleMiddleHeight;
            int rowH = AppTheme.TimescaleBottomHeight;

            foreach (var (date, x, width) in GetDaysInView())
            {
                bool isWeekend = date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday;
                bool isToday = date.Date == DateTime.Today;

                Color cellBg = isToday ? AppTheme.TimescaleToday
                             : isWeekend ? AppTheme.TimescaleWeekend
                             : AppTheme.TimescaleBackground;
                using var cellBrush = new SolidBrush(cellBg);
                g.FillRectangle(cellBrush, x, rowY, width, rowH);

                if (width >= 14)
                {
                    bool showLabel = _viewport.ZoomLevel == ZoomLevel.Days
                                  || (_viewport.ZoomLevel == ZoomLevel.Weeks && date.DayOfWeek == DayOfWeek.Monday)
                                  || (_viewport.ZoomLevel == ZoomLevel.Months && date.Day == 1);

                    if (_viewport.ZoomLevel == ZoomLevel.Days || showLabel)
                    {
                        string weekday = width >= 22
                            ? WeekdayAbbr[(int)date.DayOfWeek]
                            : WeekdayAbbr[(int)date.DayOfWeek][0].ToString();

                        Color textCol = isToday ? AppTheme.GridLineToday
                                     : isWeekend ? Color.FromArgb(160, 100, 100)
                                     : Color.FromArgb(130, 140, 160);

                        using var textBrush = new SolidBrush(textCol);
                        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                        g.DrawString(weekday, AppTheme.FontTimescaleSmall, textBrush,
                            new RectangleF(x, rowY, width, rowH), sf);
                    }
                }

                if (_viewport.ZoomLevel == ZoomLevel.Days)
                {
                    using var pen = new Pen(AppTheme.GridLineColor);
                    g.DrawLine(pen, x + width - 1, rowY + 2, x + width - 1, rowY + rowH - 2);
                }
            }

            using var borderPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(borderPen, bounds.X, rowY + rowH - 1, bounds.Right, rowY + rowH - 1);
        }

        public void DrawTodayLine(Graphics g, Rectangle chartArea)
        {
            int x = _viewport.DateToX(DateTime.Today);
            if (x >= chartArea.Left && x <= chartArea.Right)
            {
                using var pen = new Pen(AppTheme.TimescaleTodayLine, 2f);
                pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                g.DrawLine(pen, x, chartArea.Top, x, chartArea.Bottom);
            }
        }

        public void DrawWeekendShading(Graphics g, Rectangle chartArea)
        {
            foreach (var (date, x, width) in GetDaysInView())
            {
                if (date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday)
                {
                    using var brush = new SolidBrush(AppTheme.GridLineWeekend);
                    g.FillRectangle(brush, x, chartArea.Top, width, chartArea.Height);
                }
            }
        }

        public void DrawVerticalGridLines(Graphics g, Rectangle chartArea)
        {
            using var pen = new Pen(AppTheme.GridLineColor);
            pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dot;

            foreach (var (date, x, width) in GetDaysInView())
            {
                bool drawLine = _viewport.ZoomLevel == ZoomLevel.Days
                    || (_viewport.ZoomLevel == ZoomLevel.Weeks && date.DayOfWeek == DayOfWeek.Monday)
                    || (_viewport.ZoomLevel == ZoomLevel.Months && date.Day == 1);

                if (drawLine)
                    g.DrawLine(pen, x, chartArea.Top, x, chartArea.Bottom);
            }
        }

        private IEnumerable<(DateTime month, int x, int width)> GetMonthsInView()
        {
            var startDate = _viewport.ViewStartDate;
            var endDate = _viewport.ViewEndDate;
            var result = new List<(DateTime, int, int)>();

            var current = new DateTime(startDate.Year, startDate.Month, 1);
            while (current <= endDate)
            {
                var next = current.AddMonths(1);
                int xStart = Math.Max(_viewport.DateToX(current), _viewport.ChartLeft);
                int xEnd = Math.Min(_viewport.DateToX(next), _viewport.ChartLeft + _viewport.ChartWidth);
                if (xEnd > xStart)
                    result.Add((current, xStart, xEnd - xStart));
                current = next;
            }
            return result;
        }

        private IEnumerable<(DateTime date, int x, int width)> GetDaysInView()
        {
            var result = new List<(DateTime, int, int)>();
            var current = _viewport.ViewStartDate.Date;
            var endDate = _viewport.ViewEndDate.Date;

            while (current <= endDate)
            {
                int x = _viewport.DateToX(current);
                int nextX = _viewport.DateToX(current.AddDays(1));
                if (nextX > _viewport.ChartLeft && x < _viewport.ChartLeft + _viewport.ChartWidth)
                    result.Add((current, x, nextX - x));
                current = current.AddDays(1);
            }
            return result;
        }
    }
}

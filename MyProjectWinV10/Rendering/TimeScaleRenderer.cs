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
            DrawLabels(g, bounds);
        }

        public void DrawHeaderBackground(Graphics g, Rectangle bounds) =>
            DrawBackground(g, bounds);

        public void DrawHeaderLabels(Graphics g, Rectangle bounds) =>
            DrawLabels(g, bounds);

        private void DrawLabels(Graphics g, Rectangle bounds)
        {
            DrawUpperRow(g, bounds);
            DrawMiddleRow(g, bounds);
            DrawLowerRow(g, bounds);
        }

        private void DrawBackground(Graphics g, Rectangle bounds)
        {
            using var brush = new SolidBrush(AppTheme.TimescaleBackground);
            g.FillRectangle(brush, bounds);
        }

        // ── Row 1: Month / Year ───────────────────────────────────────────────
        private void DrawUpperRow(Graphics g, Rectangle bounds)
        {
            int rowH = AppTheme.TimescaleTopHeight;
            var topBounds = new Rectangle(bounds.X, bounds.Y, bounds.Width, rowH);

            IEnumerable<(DateTime label, int x, int width)> segments =
                _viewport.ZoomLevel == ZoomLevel.Months
                    ? GetYearsInView()
                    : GetMonthsInView();

            foreach (var (label, x, width) in segments)
            {
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

                string text;
                if (_viewport.ZoomLevel == ZoomLevel.Months)
                {
                    text = label.Year.ToString();
                }
                else
                {
                    text = width > 60 ? label.ToString("MMMM yyyy", DisplayCulture.Current)
                         : width > 30 ? label.ToString("MMM yy", DisplayCulture.Current)
                         : label.ToString("M", DisplayCulture.Current);
                }

                g.DrawString(text, AppTheme.FontTimescaleLarge, textBrush, cellRect, sf);
            }

            using var borderPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(borderPen, bounds.X, topBounds.Bottom - 1, bounds.Right, topBounds.Bottom - 1);
        }

        // ── Row 2: Day number / Week start / Month name ───────────────────────
        private void DrawMiddleRow(Graphics g, Rectangle bounds)
        {
            int rowY = bounds.Y + AppTheme.TimescaleTopHeight;
            int rowH = AppTheme.TimescaleMiddleHeight;

            // Fill per-day backgrounds (weekend, today highlight)
            foreach (var (date, x, width) in GetDaysInView())
            {
                bool isWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                bool isToday   = date.Date == DateTime.Today;
                Color cellBg   = isToday   ? AppTheme.TimescaleToday
                               : isWeekend ? AppTheme.TimescaleWeekend
                               : AppTheme.TimescaleBackground;
                using var cellBrush = new SolidBrush(cellBg);
                g.FillRectangle(cellBrush, x, rowY, width, rowH);
            }

            var sf = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter
            };

            if (_viewport.ZoomLevel == ZoomLevel.Days)
            {
                foreach (var (date, x, width) in GetDaysInView())
                {
                    if (width < 10) continue;
                    bool isToday   = date.Date == DateTime.Today;
                    bool isWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                    var  font      = isToday ? AppTheme.FontTimescaleLarge : AppTheme.FontTimescaleSmall;
                    Color textCol  = isToday   ? AppTheme.GridLineToday
                                   : isWeekend ? Color.FromArgb(140, 150, 170)
                                   : AppTheme.TimescaleText;
                    using var textBrush = new SolidBrush(textCol);
                    g.DrawString(date.Day.ToString(), font, textBrush,
                        new RectangleF(x, rowY, width, rowH), sf);
                }
            }
            else if (_viewport.ZoomLevel == ZoomLevel.Weeks)
            {
                // Draw Monday's date spanning the full week width
                foreach (var (monday, x, width) in GetWeeksInView())
                {
                    if (width < 8) continue;
                    bool isCurrentWeek = monday <= DateTime.Today && DateTime.Today < monday.AddDays(7);
                    Color textCol = isCurrentWeek ? AppTheme.GridLineToday : AppTheme.TimescaleText;
                    using var textBrush = new SolidBrush(textCol);
                    string label = width > 50
                        ? monday.ToString("M/d", DisplayCulture.Current)
                        : monday.Day.ToString();
                    g.DrawString(label, AppTheme.FontTimescaleSmall, textBrush,
                        new RectangleF(x, rowY, width, rowH), sf);
                }
            }
            else // Months: show month name spanning the full month width
            {
                foreach (var (month, x, width) in GetMonthsInView())
                {
                    if (width < 8) continue;
                    using var textBrush = new SolidBrush(AppTheme.TimescaleText);
                    string label = width > 40 ? month.ToString("MMMM", DisplayCulture.Current)
                                 : width > 18 ? month.ToString("MMM", DisplayCulture.Current)
                                 : month.ToString("%M", DisplayCulture.Current);
                    g.DrawString(label, AppTheme.FontTimescaleSmall, textBrush,
                        new RectangleF(x, rowY, width, rowH), sf);
                }
            }

            using var borderPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(borderPen, bounds.X, rowY + rowH - 1, bounds.Right, rowY + rowH - 1);
        }

        // ── Row 3: Weekday abbr / Week date range / (empty for Months) ────────
        private void DrawLowerRow(Graphics g, Rectangle bounds)
        {
            int rowY = bounds.Y + AppTheme.TimescaleTopHeight + AppTheme.TimescaleMiddleHeight;
            int rowH = AppTheme.TimescaleBottomHeight;

            // Fill per-day backgrounds
            foreach (var (date, x, width) in GetDaysInView())
            {
                bool isWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                bool isToday   = date.Date == DateTime.Today;
                Color cellBg   = isToday   ? AppTheme.TimescaleToday
                               : isWeekend ? AppTheme.TimescaleWeekend
                               : AppTheme.TimescaleBackground;
                using var cellBrush = new SolidBrush(cellBg);
                g.FillRectangle(cellBrush, x, rowY, width, rowH);
            }

            var sf = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter
            };

            if (_viewport.ZoomLevel == ZoomLevel.Days)
            {
                foreach (var (date, x, width) in GetDaysInView())
                {
                    if (width < 14) continue;
                    bool isToday   = date.Date == DateTime.Today;
                    bool isWeekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                    string weekday = width >= 22
                        ? WeekdayAbbr[(int)date.DayOfWeek]
                        : WeekdayAbbr[(int)date.DayOfWeek][0].ToString();
                    Color textCol = isToday   ? AppTheme.GridLineToday
                                  : isWeekend ? Color.FromArgb(160, 100, 100)
                                  : Color.FromArgb(130, 140, 160);
                    using var textBrush = new SolidBrush(textCol);
                    g.DrawString(weekday, AppTheme.FontTimescaleSmall, textBrush,
                        new RectangleF(x, rowY, width, rowH), sf);
                }
            }
            else if (_viewport.ZoomLevel == ZoomLevel.Weeks)
            {
                // Weekday row must only show weekday abbreviation — never a date
                foreach (var (monday, x, width) in GetWeeksInView())
                {
                    if (width < 14) continue;
                    bool isCurrentWeek = monday <= DateTime.Today && DateTime.Today < monday.AddDays(7);
                    Color textCol = isCurrentWeek ? AppTheme.GridLineToday : Color.FromArgb(130, 140, 160);
                    using var textBrush = new SolidBrush(textCol);
                    g.DrawString(WeekdayAbbr[(int)DayOfWeek.Monday], AppTheme.FontTimescaleSmall, textBrush,
                        new RectangleF(x, rowY, width, rowH), sf);
                }
            }
            // Months: lower row left empty — month info is already in Row 2

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

        public void DrawVerticalGridLines(Graphics g, Rectangle chartArea, int? top = null, int? bottom = null)
        {
            int yTop    = top    ?? chartArea.Top;
            int yBottom = bottom ?? chartArea.Bottom;
            if (yBottom <= yTop)
                return;

            using var pen = new Pen(AppTheme.GridLineColor);

            foreach (var (date, x, _) in GetDaysInView())
            {
                bool drawLine = _viewport.ZoomLevel == ZoomLevel.Days
                    || (_viewport.ZoomLevel == ZoomLevel.Weeks  && date.DayOfWeek == DayOfWeek.Monday)
                    || (_viewport.ZoomLevel == ZoomLevel.Months && date.Day == 1);

                if (drawLine)
                    g.DrawLine(pen, x, yTop, x, yBottom);
            }
        }

        // ── Data helpers ──────────────────────────────────────────────────────

        private IEnumerable<(DateTime month, int x, int width)> GetMonthsInView()
        {
            var startDate = _viewport.ViewStartDate;
            var endDate   = _viewport.ViewEndDate;
            var result    = new List<(DateTime, int, int)>();

            var current = new DateTime(startDate.Year, startDate.Month, 1);
            while (current <= endDate)
            {
                var next   = current.AddMonths(1);
                int xStart = Math.Max(_viewport.DateToX(current), _viewport.ChartLeft);
                int xEnd   = Math.Min(_viewport.DateToX(next), _viewport.ChartLeft + _viewport.ChartWidth);
                if (xEnd > xStart)
                    result.Add((current, xStart, xEnd - xStart));
                current = next;
            }
            return result;
        }

        private IEnumerable<(DateTime year, int x, int width)> GetYearsInView()
        {
            var startDate = _viewport.ViewStartDate;
            var endDate   = _viewport.ViewEndDate;
            var result    = new List<(DateTime, int, int)>();

            var current = new DateTime(startDate.Year, 1, 1);
            while (current <= endDate)
            {
                var next   = current.AddYears(1);
                int xStart = Math.Max(_viewport.DateToX(current), _viewport.ChartLeft);
                int xEnd   = Math.Min(_viewport.DateToX(next), _viewport.ChartLeft + _viewport.ChartWidth);
                if (xEnd > xStart)
                    result.Add((current, xStart, xEnd - xStart));
                current = next;
            }
            return result;
        }

        private IEnumerable<(DateTime monday, int x, int width)> GetWeeksInView()
        {
            var startDate = _viewport.ViewStartDate.Date;
            var endDate   = _viewport.ViewEndDate.Date;
            var result    = new List<(DateTime, int, int)>();

            // Snap back to the Monday at or before viewStart
            int daysBack = ((int)startDate.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
            var current  = startDate.AddDays(-daysBack);

            while (current <= endDate)
            {
                var nextMonday = current.AddDays(7);
                int xStart = Math.Max(_viewport.DateToX(current), _viewport.ChartLeft);
                int xEnd   = Math.Min(_viewport.DateToX(nextMonday), _viewport.ChartLeft + _viewport.ChartWidth);
                if (xEnd > xStart)
                    result.Add((current, xStart, xEnd - xStart));
                current = nextMonday;
            }
            return result;
        }

        private IEnumerable<(DateTime date, int x, int width)> GetDaysInView()
        {
            var result  = new List<(DateTime, int, int)>();
            var current = _viewport.ViewStartDate.Date;
            var endDate = _viewport.ViewEndDate.Date;

            while (current <= endDate)
            {
                int x     = _viewport.DateToX(current);
                int nextX = _viewport.DateToX(current.AddDays(1));
                if (nextX > _viewport.ChartLeft && x < _viewport.ChartLeft + _viewport.ChartWidth)
                    result.Add((current, x, nextX - x));
                current = current.AddDays(1);
            }
            return result;
        }
    }
}

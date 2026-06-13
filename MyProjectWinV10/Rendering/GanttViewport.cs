using MyProject.Theme;

namespace MyProject.Rendering
{
    public class GanttViewport
    {
        private int _dayWidth = AppTheme.DefaultDayWidth;
        private DateTime _viewStartDate = DateTime.Today.AddDays(-3);

        public int ChartLeft { get; set; } = 0;
        public int ChartWidth { get; set; } = 800;
        public int ScrollOffsetX { get; set; } = 0;
        public int ScrollOffsetY { get; set; } = 0;

        public ZoomLevel ZoomLevel { get; set; } = ZoomLevel.Days;

        public int DayWidth
        {
            get => _dayWidth;
            set => _dayWidth = Math.Clamp(value, 4, 120);
        }

        public DateTime ViewStartDate
        {
            get => _viewStartDate;
            set => _viewStartDate = value.Date;
        }

        public DateTime ViewEndDate => ViewStartDate.AddDays((double)ChartWidth / DayWidth + 2);

        public int DateToX(DateTime date)
        {
            double days = (date.Date - ViewStartDate).TotalDays;
            return ChartLeft + (int)(days * DayWidth);
        }

        public DateTime XToDate(int x)
        {
            double days = (double)(x - ChartLeft) / DayWidth;
            return ViewStartDate.AddDays(days);
        }

        public void ZoomIn()
        {
            var center = XToDate(ChartLeft + ChartWidth / 2);
            DayWidth = (int)(DayWidth * 1.3);
            UpdateZoomLevel();
            CenterOnDate(center);
        }

        public void ZoomOut()
        {
            var center = XToDate(ChartLeft + ChartWidth / 2);
            DayWidth = (int)(DayWidth / 1.3);
            UpdateZoomLevel();
            CenterOnDate(center);
        }

        public void CenterOnDate(DateTime date)
        {
            double days = (double)ChartWidth / 2 / DayWidth;
            ViewStartDate = date.AddDays(-days);
        }

        public void ScrollToDate(DateTime date)
        {
            ViewStartDate = date.AddDays(-3);
        }

        private void UpdateZoomLevel()
        {
            if (DayWidth >= 18) ZoomLevel = ZoomLevel.Days;
            else if (DayWidth >= 6) ZoomLevel = ZoomLevel.Weeks;
            else ZoomLevel = ZoomLevel.Months;
        }
    }
}

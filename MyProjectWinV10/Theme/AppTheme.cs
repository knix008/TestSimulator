namespace MyProject.Theme
{
    public static class AppTheme
    {
        // Background
        public static Color Background { get; } = Color.FromArgb(250, 250, 252);
        public static Color SurfaceColor { get; } = Color.White;
        public static Color SidebarColor { get; } = Color.FromArgb(244, 245, 247);
        public static Color HeaderColor { get; } = Color.FromArgb(255, 255, 255);
        public static Color RowAltColor { get; } = Color.FromArgb(248, 249, 251);
        public static Color RowHoverColor { get; } = Color.FromArgb(232, 240, 255);
        public static Color RowSelectedColor { get; } = Color.FromArgb(210, 228, 255);

        // Grid lines
        public static Color GridLineColor { get; } = Color.FromArgb(220, 223, 230);
        public static Color GridLineWeekend { get; } = Color.FromArgb(245, 246, 250);
        public static Color GridLineToday { get; } = Color.FromArgb(255, 82, 82);

        // Text
        public static Color TextPrimary { get; } = Color.FromArgb(32, 33, 36);
        public static Color TextSecondary { get; } = Color.FromArgb(95, 99, 104);
        public static Color TextDisabled { get; } = Color.FromArgb(180, 184, 190);
        public static Color TextOnAccent { get; } = Color.White;

        // Accent
        public static Color Accent { get; } = Color.FromArgb(26, 115, 232);
        public static Color AccentLight { get; } = Color.FromArgb(210, 227, 252);
        public static Color AccentDark { get; } = Color.FromArgb(16, 80, 180);

        // Task bar colors
        public static Color TaskBarNormal { get; } = Color.FromArgb(26, 115, 232);
        public static Color TaskBarProgress { get; } = Color.FromArgb(11, 83, 190);
        public static Color TaskBarSummary { get; } = Color.FromArgb(60, 64, 67);
        public static Color TaskBarCritical { get; } = Color.FromArgb(217, 48, 37);
        public static Color TaskBarCriticalProgress { get; } = Color.FromArgb(180, 30, 20);
        public static Color TaskBarMilestone { get; } = Color.FromArgb(234, 134, 0);

        // Toolbar
        public static Color ToolbarBackground { get; } = Color.FromArgb(26, 115, 232);
        public static Color ToolbarText { get; } = Color.White;
        public static Color ToolbarButtonHover { get; } = Color.FromArgb(40, 130, 245);
        public static Color ToolbarButtonPressed { get; } = Color.FromArgb(16, 80, 180);
        public static Color ToolbarSeparator { get; } = Color.FromArgb(100, 160, 240);

        // Timescale
        public static Color TimescaleBackground { get; } = Color.FromArgb(240, 243, 250);
        public static Color TimescaleBorder { get; } = Color.FromArgb(200, 208, 220);
        public static Color TimescaleText { get; } = Color.FromArgb(60, 70, 90);
        public static Color TimescaleWeekend { get; } = Color.FromArgb(235, 236, 242);
        public static Color TimescaleToday { get; } = Color.FromArgb(255, 235, 235);
        public static Color TimescaleTodayLine { get; } = Color.FromArgb(255, 82, 82);

        // Dependency arrows
        public static Color DependencyLine { get; } = Color.FromArgb(120, 130, 150);
        public static Color DependencyLineCritical { get; } = Color.FromArgb(217, 48, 37);

        // Border
        public static Color BorderColor { get; } = Color.FromArgb(218, 220, 224);
        public static Color DividerColor { get; } = Color.FromArgb(200, 205, 215);

        // Fonts
        public static Font FontNormal { get; } = new Font("Segoe UI", 9f);
        public static Font FontBold { get; } = new Font("Segoe UI", 9f, FontStyle.Bold);
        public static Font FontSmall { get; } = new Font("Segoe UI", 8f);
        public static Font FontLarge { get; } = new Font("Segoe UI", 11f);
        public static Font FontToolbar { get; } = new Font("Segoe UI", 9f);
        public static Font FontTimescaleLarge { get; } = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        public static Font FontTimescaleSmall { get; } = new Font("Segoe UI", 7.5f);
        public static Font FontTaskName { get; } = new Font("Segoe UI", 8.5f);

        // Sizes
        public static int RowHeight { get; } = 28;
        public static int TimescaleHeaderHeight { get; } = 54;   // top + middle + bottom
        public static int TimescaleTopHeight { get; } = 22;      // Month/Year row
        public static int TimescaleMiddleHeight { get; } = 16;   // Day number row
        public static int TimescaleBottomHeight { get; } = 16;   // Weekday row
        public static int TaskBarHeight { get; } = 16;
        public static int MilestoneSize { get; } = 14;
        public static int ToolbarHeight { get; } = 40;
        public static int TaskGridWidth { get; } = 500;
        public static int SplitterWidth { get; } = 4;

        // Day pixel width at default zoom
        public static int DefaultDayWidth { get; } = 22;
    }
}

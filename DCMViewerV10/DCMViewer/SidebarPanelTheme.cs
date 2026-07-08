namespace DCMViewer;

internal static class SidebarPanelTheme
{
    private const int EmSetMargins = 0xD3;
    private const int EcRightMargin = 0x2;

    public static readonly Color SidebarChromeBackground = Color.FromArgb(236, 240, 246);
    public static readonly Color SectionDividerColor = Color.FromArgb(206, 218, 232);
    public const int SectionSplitterWidth = 1;
    public static readonly Padding SidebarPadding = new(4);
    public const int FileInfoTextRightMargin = 14;

    public static readonly Color FolderSectionBackground = Color.FromArgb(230, 242, 255);
    public static readonly Color FolderTitleBackground = Color.FromArgb(200, 225, 248);
    public static readonly Color FolderContentBackground = Color.FromArgb(248, 251, 255);

    public static readonly Color FileInfoSectionBackground = Color.FromArgb(238, 232, 248);
    public static readonly Color FileInfoTitleBackground = Color.FromArgb(218, 208, 235);
    public static readonly Color FileInfoContentBackground = Color.FromArgb(246, 242, 252);

    public static readonly Color SectionForeground = Color.FromArgb(52, 58, 68);
    public static readonly Color TreeSelectionBackground = Color.FromArgb(158, 198, 236);
    public static readonly Color TreeSelectionForeground = Color.FromArgb(32, 48, 72);

    public static void Apply(
        Panel panelDicomInfo,
        SplitContainer splitContainerLeft,
        Label labelFolderTitle,
        MultiSelectTreeView treeViewFolder,
        Label labelInfoTitle,
        RichTextBox textBoxDicomInfo)
    {
        panelDicomInfo.BackColor = SidebarChromeBackground;
        panelDicomInfo.Padding = SidebarPadding;

        splitContainerLeft.BackColor = SectionDividerColor;
        splitContainerLeft.SplitterWidth = SectionSplitterWidth;

        splitContainerLeft.Panel1.BackColor = FolderSectionBackground;
        splitContainerLeft.Panel2.BackColor = FileInfoSectionBackground;

        labelFolderTitle.BackColor = FolderTitleBackground;
        labelFolderTitle.ForeColor = SectionForeground;

        treeViewFolder.BackColor = FolderContentBackground;
        treeViewFolder.ForeColor = SectionForeground;
        treeViewFolder.MultiSelectBackColor = TreeSelectionBackground;
        treeViewFolder.MultiSelectForeColor = TreeSelectionForeground;

        labelInfoTitle.BackColor = FileInfoTitleBackground;
        labelInfoTitle.ForeColor = SectionForeground;

        textBoxDicomInfo.BackColor = FileInfoContentBackground;
        textBoxDicomInfo.ForeColor = SectionForeground;
        ApplyFileInfoTextMargins(textBoxDicomInfo);
    }

    private static void ApplyFileInfoTextMargins(RichTextBox textBox)
    {
        void Apply()
        {
            if (!textBox.IsHandleCreated)
                return;

            NativeMethods.SetRichTextRightMargin(textBox.Handle, FileInfoTextRightMargin);
        }

        textBox.HandleCreated += (_, _) => Apply();
        Apply();
    }

    private static class NativeMethods
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        internal static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

        internal static void SetRichTextRightMargin(IntPtr handle, int rightMarginPx)
            => SendMessage(handle, EmSetMargins, (IntPtr)EcRightMargin, (IntPtr)(rightMarginPx << 16));
    }
}

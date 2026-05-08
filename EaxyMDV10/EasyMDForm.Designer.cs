using Microsoft.Web.WebView2.WinForms;

namespace EaxyMDV10;

partial class EasyMDForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        var resources = new System.ComponentModel.ComponentResourceManager(typeof(EasyMDForm));
        components = new System.ComponentModel.Container();

        menuStrip1 = new MenuStrip();
        fileToolStripMenuItem = new ToolStripMenuItem();
        newToolStripMenuItem = new ToolStripMenuItem();
        openToolStripMenuItem = new ToolStripMenuItem();
        saveToolStripMenuItem = new ToolStripMenuItem();
        saveAsToolStripMenuItem = new ToolStripMenuItem();
        menuSep1 = new ToolStripSeparator();
        exitToolStripMenuItem = new ToolStripMenuItem();
        helpToolStripMenuItem = new ToolStripMenuItem();
        aboutToolStripMenuItem = new ToolStripMenuItem();

        toolStrip1 = new ToolStrip();
        btnH1 = new ToolStripButton();
        btnH2 = new ToolStripButton();
        btnH3 = new ToolStripButton();
        tbSep1 = new ToolStripSeparator();
        btnBold = new ToolStripButton();
        btnItalic = new ToolStripButton();
        btnStrike = new ToolStripButton();
        tbSep2 = new ToolStripSeparator();
        btnCode = new ToolStripButton();
        btnCodeBlock = new ToolStripButton();
        tbSep3 = new ToolStripSeparator();
        btnLink = new ToolStripButton();
        btnImage = new ToolStripButton();
        tbSep4 = new ToolStripSeparator();
        btnUL = new ToolStripButton();
        btnOL = new ToolStripButton();
        btnQuote = new ToolStripButton();
        tbSep5 = new ToolStripSeparator();
        btnHR = new ToolStripButton();
        btnTable = new ToolStripButton();

        btnToggleSidebar = new ToolStripButton();
        tbSep0 = new ToolStripSeparator();

        outerSplitContainer = new SplitContainer();
        pnlSidebar = new Panel();
        pnlSidebarHeader = new Panel();
        lblOutline = new Label();
        btnCollapse = new Button();
        treeOutline = new TreeView();

        splitContainer1 = new SplitContainer();
        txtMarkdown = new RichTextBox();
        webViewPreview = new WebView2();

        renderTimer = new System.Windows.Forms.Timer(components) { Interval = 300 };

        menuStrip1.SuspendLayout();
        toolStrip1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)outerSplitContainer).BeginInit();
        outerSplitContainer.Panel1.SuspendLayout();
        outerSplitContainer.Panel2.SuspendLayout();
        outerSplitContainer.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainer1).BeginInit();
        splitContainer1.Panel1.SuspendLayout();
        splitContainer1.Panel2.SuspendLayout();
        splitContainer1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)webViewPreview).BeginInit();
        pnlSidebar.SuspendLayout();
        pnlSidebarHeader.SuspendLayout();
        SuspendLayout();

        // ── menuStrip1 ──────────────────────────────────────────────────────
        menuStrip1.Items.AddRange(new ToolStripItem[] { fileToolStripMenuItem, helpToolStripMenuItem });
        menuStrip1.Font = new Font("Segoe UI", 11f);
        menuStrip1.Location = new Point(0, 0);
        menuStrip1.Name = "menuStrip1";
        menuStrip1.Size = new Size(1200, 28);
        menuStrip1.TabIndex = 0;
        menuStrip1.Text = "menuStrip1";

        // ── 파일 메뉴 ────────────────────────────────────────────────────────
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[]
        {
            newToolStripMenuItem,
            openToolStripMenuItem,
            saveToolStripMenuItem,
            saveAsToolStripMenuItem,
            menuSep1,
            exitToolStripMenuItem
        });
        fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        fileToolStripMenuItem.Size = new Size(43, 20);
        fileToolStripMenuItem.Text = "파일(&F)";

        newToolStripMenuItem.Name = "newToolStripMenuItem";
        newToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.N;
        newToolStripMenuItem.Size = new Size(220, 22);
        newToolStripMenuItem.Text = "새 파일(&N)";
        newToolStripMenuItem.Click += newToolStripMenuItem_Click;

        openToolStripMenuItem.Name = "openToolStripMenuItem";
        openToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.O;
        openToolStripMenuItem.Size = new Size(220, 22);
        openToolStripMenuItem.Text = "열기(&O)...";
        openToolStripMenuItem.Click += openToolStripMenuItem_Click;

        saveToolStripMenuItem.Name = "saveToolStripMenuItem";
        saveToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.S;
        saveToolStripMenuItem.Size = new Size(220, 22);
        saveToolStripMenuItem.Text = "저장(&S)";
        saveToolStripMenuItem.Click += saveToolStripMenuItem_Click;

        saveAsToolStripMenuItem.Name = "saveAsToolStripMenuItem";
        saveAsToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        saveAsToolStripMenuItem.Size = new Size(220, 22);
        saveAsToolStripMenuItem.Text = "다른 이름으로 저장(&A)...";
        saveAsToolStripMenuItem.Click += saveAsToolStripMenuItem_Click;

        menuSep1.Name = "menuSep1";
        menuSep1.Size = new Size(217, 6);

        exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        exitToolStripMenuItem.Size = new Size(220, 22);
        exitToolStripMenuItem.Text = "끝내기(&X)";
        exitToolStripMenuItem.Click += exitToolStripMenuItem_Click;

        // ── 도움말 메뉴 ──────────────────────────────────────────────────────
        helpToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { aboutToolStripMenuItem });
        helpToolStripMenuItem.Name = "helpToolStripMenuItem";
        helpToolStripMenuItem.Size = new Size(52, 20);
        helpToolStripMenuItem.Text = "도움말(&H)";

        aboutToolStripMenuItem.Name = "aboutToolStripMenuItem";
        aboutToolStripMenuItem.ShortcutKeys = Keys.F1;
        aboutToolStripMenuItem.Size = new Size(160, 22);
        aboutToolStripMenuItem.Text = "정보(&A)...";
        aboutToolStripMenuItem.Click += aboutToolStripMenuItem_Click;

        // ── toolStrip1 ──────────────────────────────────────────────────────
        toolStrip1.GripStyle = ToolStripGripStyle.Hidden;
        toolStrip1.Items.AddRange(new ToolStripItem[]
        {
            btnToggleSidebar, tbSep0,
            btnH1, btnH2, btnH3, tbSep1,
            btnBold, btnItalic, btnStrike, tbSep2,
            btnCode, btnCodeBlock, tbSep3,
            btnLink, btnImage, tbSep4,
            btnUL, btnOL, btnQuote, tbSep5,
            btnHR, btnTable
        });
        toolStrip1.Font = new Font("Segoe UI", 11f);
        toolStrip1.Location = new Point(0, 28);
        toolStrip1.Name = "toolStrip1";
        toolStrip1.Padding = new Padding(4, 2, 4, 2);
        toolStrip1.Size = new Size(1200, 36);
        toolStrip1.TabIndex = 1;
        toolStrip1.Text = "toolStrip1";

        // ── 사이드바 토글 버튼 ────────────────────────────────────────────────
        btnToggleSidebar.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnToggleSidebar.Font = new Font("Segoe UI", 13f);
        btnToggleSidebar.Name = "btnToggleSidebar";
        btnToggleSidebar.Padding = new Padding(4, 0, 4, 0);
        btnToggleSidebar.Text = "☰";
        btnToggleSidebar.ToolTipText = "문서 구조 사이드바 열기/닫기";
        btnToggleSidebar.Click += btnToggleSidebar_Click;

        tbSep0.Name = "tbSep0";

        // ── 제목 버튼 ─────────────────────────────────────────────────────────
        btnH1.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnH1.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        btnH1.Name = "btnH1";
        btnH1.Padding = new Padding(6, 0, 6, 0);
        btnH1.Text = "H1";
        btnH1.ToolTipText = "제목 1  (# )";
        btnH1.Click += btnH1_Click;

        btnH2.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnH2.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        btnH2.Name = "btnH2";
        btnH2.Padding = new Padding(6, 0, 6, 0);
        btnH2.Text = "H2";
        btnH2.ToolTipText = "제목 2  (## )";
        btnH2.Click += btnH2_Click;

        btnH3.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnH3.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        btnH3.Name = "btnH3";
        btnH3.Padding = new Padding(6, 0, 6, 0);
        btnH3.Text = "H3";
        btnH3.ToolTipText = "제목 3  (### )";
        btnH3.Click += btnH3_Click;

        tbSep1.Name = "tbSep1";

        // ── 텍스트 서식 버튼 ──────────────────────────────────────────────────
        btnBold.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnBold.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        btnBold.Name = "btnBold";
        btnBold.Padding = new Padding(6, 0, 6, 0);
        btnBold.Text = "B";
        btnBold.ToolTipText = "굵게  (**텍스트**)";
        btnBold.Click += btnBold_Click;

        btnItalic.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnItalic.Font = new Font("Segoe UI", 12f, FontStyle.Italic);
        btnItalic.Name = "btnItalic";
        btnItalic.Padding = new Padding(6, 0, 6, 0);
        btnItalic.Text = "I";
        btnItalic.ToolTipText = "기울임  (*텍스트*)";
        btnItalic.Click += btnItalic_Click;

        btnStrike.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnStrike.Font = new Font("Segoe UI", 12f);
        btnStrike.Name = "btnStrike";
        btnStrike.Padding = new Padding(6, 0, 6, 0);
        btnStrike.Text = "S̶";
        btnStrike.ToolTipText = "취소선  (~~텍스트~~)";
        btnStrike.Click += btnStrike_Click;

        tbSep2.Name = "tbSep2";

        // ── 코드 버튼 ─────────────────────────────────────────────────────────
        btnCode.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnCode.Font = new Font("Consolas", 11f);
        btnCode.Name = "btnCode";
        btnCode.Padding = new Padding(6, 0, 6, 0);
        btnCode.Text = "`코드`";
        btnCode.ToolTipText = "인라인 코드  (`코드`)";
        btnCode.Click += btnCode_Click;

        btnCodeBlock.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnCodeBlock.Font = new Font("Consolas", 11f);
        btnCodeBlock.Name = "btnCodeBlock";
        btnCodeBlock.Padding = new Padding(6, 0, 6, 0);
        btnCodeBlock.Text = "```블록```";
        btnCodeBlock.ToolTipText = "코드 블록  (``` ... ```)";
        btnCodeBlock.Click += btnCodeBlock_Click;

        tbSep3.Name = "tbSep3";

        // ── 링크/이미지 버튼 ──────────────────────────────────────────────────
        btnLink.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnLink.Font = new Font("Segoe UI", 11f);
        btnLink.Name = "btnLink";
        btnLink.Padding = new Padding(6, 0, 6, 0);
        btnLink.Text = "링크";
        btnLink.ToolTipText = "링크 삽입  ([텍스트](URL))";
        btnLink.Click += btnLink_Click;

        btnImage.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnImage.Font = new Font("Segoe UI", 11f);
        btnImage.Name = "btnImage";
        btnImage.Padding = new Padding(6, 0, 6, 0);
        btnImage.Text = "이미지";
        btnImage.ToolTipText = "이미지 삽입  (![설명](URL))";
        btnImage.Click += btnImage_Click;

        tbSep4.Name = "tbSep4";

        // ── 목록/인용 버튼 ────────────────────────────────────────────────────
        btnUL.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnUL.Font = new Font("Segoe UI", 11f);
        btnUL.Name = "btnUL";
        btnUL.Padding = new Padding(6, 0, 6, 0);
        btnUL.Text = "● 목록";
        btnUL.ToolTipText = "글머리 기호 목록  (- 항목)";
        btnUL.Click += btnUL_Click;

        btnOL.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnOL.Font = new Font("Segoe UI", 11f);
        btnOL.Name = "btnOL";
        btnOL.Padding = new Padding(6, 0, 6, 0);
        btnOL.Text = "1. 목록";
        btnOL.ToolTipText = "번호 목록  (1. 항목)";
        btnOL.Click += btnOL_Click;

        btnQuote.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnQuote.Font = new Font("Segoe UI", 11f);
        btnQuote.Name = "btnQuote";
        btnQuote.Padding = new Padding(6, 0, 6, 0);
        btnQuote.Text = "인용";
        btnQuote.ToolTipText = "인용구  (> 텍스트)";
        btnQuote.Click += btnQuote_Click;

        tbSep5.Name = "tbSep5";

        // ── 기타 버튼 ─────────────────────────────────────────────────────────
        btnHR.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnHR.Font = new Font("Segoe UI", 11f);
        btnHR.Name = "btnHR";
        btnHR.Padding = new Padding(6, 0, 6, 0);
        btnHR.Text = "구분선";
        btnHR.ToolTipText = "수평선  (---)";
        btnHR.Click += btnHR_Click;

        btnTable.DisplayStyle = ToolStripItemDisplayStyle.Text;
        btnTable.Font = new Font("Segoe UI", 11f);
        btnTable.Name = "btnTable";
        btnTable.Padding = new Padding(6, 0, 6, 0);
        btnTable.Text = "표";
        btnTable.ToolTipText = "표 삽입";
        btnTable.Click += btnTable_Click;

        // ── outerSplitContainer ─────────────────────────────────────────────
        outerSplitContainer.Dock = DockStyle.Fill;
        outerSplitContainer.Location = new Point(0, 64);
        outerSplitContainer.Name = "outerSplitContainer";
        outerSplitContainer.Size = new Size(1200, 636);
        outerSplitContainer.SplitterDistance = 220;
        outerSplitContainer.SplitterWidth = 4;
        outerSplitContainer.TabIndex = 2;
        outerSplitContainer.Panel1MinSize = 120;
        outerSplitContainer.Panel2MinSize = 400;
        outerSplitContainer.Panel1.Controls.Add(pnlSidebar);
        outerSplitContainer.Panel2.Controls.Add(splitContainer1);

        // ── pnlSidebar ──────────────────────────────────────────────────────
        pnlSidebar.BackColor = Color.FromArgb(245, 245, 245);
        pnlSidebar.Dock = DockStyle.Fill;
        pnlSidebar.Name = "pnlSidebar";
        pnlSidebar.Controls.Add(treeOutline);
        pnlSidebar.Controls.Add(pnlSidebarHeader);

        // ── pnlSidebarHeader ────────────────────────────────────────────────
        pnlSidebarHeader.BackColor = Color.FromArgb(51, 51, 51);
        pnlSidebarHeader.Dock = DockStyle.Top;
        pnlSidebarHeader.Height = 36;
        pnlSidebarHeader.Name = "pnlSidebarHeader";
        pnlSidebarHeader.Controls.Add(lblOutline);
        pnlSidebarHeader.Controls.Add(btnCollapse);

        // ── lblOutline ──────────────────────────────────────────────────────
        lblOutline.AutoSize = false;
        lblOutline.Dock = DockStyle.Fill;
        lblOutline.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        lblOutline.ForeColor = Color.White;
        lblOutline.Name = "lblOutline";
        lblOutline.Padding = new Padding(10, 0, 0, 0);
        lblOutline.Text = "문서 구조";
        lblOutline.TextAlign = ContentAlignment.MiddleLeft;

        // ── btnCollapse ──────────────────────────────────────────────────────
        btnCollapse.BackColor = Color.Transparent;
        btnCollapse.Cursor = Cursors.Hand;
        btnCollapse.Dock = DockStyle.Right;
        btnCollapse.FlatStyle = FlatStyle.Flat;
        btnCollapse.FlatAppearance.BorderSize = 0;
        btnCollapse.FlatAppearance.MouseOverBackColor = Color.FromArgb(80, 80, 80);
        btnCollapse.Font = new Font("Segoe UI", 12f);
        btnCollapse.ForeColor = Color.White;
        btnCollapse.Name = "btnCollapse";
        btnCollapse.Size = new Size(36, 36);
        btnCollapse.Text = "◀";
        btnCollapse.Click += btnCollapse_Click;

        // ── treeOutline ──────────────────────────────────────────────────────
        treeOutline.BackColor = Color.FromArgb(245, 245, 245);
        treeOutline.BorderStyle = BorderStyle.None;
        treeOutline.Dock = DockStyle.Fill;
        treeOutline.Font = new Font("Segoe UI", 10f);
        treeOutline.FullRowSelect = true;
        treeOutline.HotTracking = true;
        treeOutline.Indent = 14;
        treeOutline.ItemHeight = 26;
        treeOutline.Name = "treeOutline";
        treeOutline.ShowLines = false;
        treeOutline.ShowRootLines = false;
        treeOutline.TabIndex = 0;
        treeOutline.NodeMouseClick += treeOutline_NodeMouseClick;

        // ── splitContainer1 ─────────────────────────────────────────────────
        splitContainer1.Dock = DockStyle.Fill;
        splitContainer1.Location = new Point(0, 0);
        splitContainer1.Name = "splitContainer1";
        splitContainer1.Size = new Size(1200, 649);
        splitContainer1.SplitterDistance = 598;
        splitContainer1.SplitterWidth = 5;
        splitContainer1.TabIndex = 2;

        // ── txtMarkdown (왼쪽 편집 창) ────────────────────────────────────────
        txtMarkdown.BackColor = Color.FromArgb(30, 30, 30);
        txtMarkdown.ForeColor = Color.FromArgb(212, 212, 212);
        txtMarkdown.Dock = DockStyle.Fill;
        txtMarkdown.Font = new Font("Consolas", 12f);
        txtMarkdown.HideSelection = false;
        txtMarkdown.Location = new Point(0, 0);
        txtMarkdown.Name = "txtMarkdown";
        txtMarkdown.ScrollBars = RichTextBoxScrollBars.Vertical;
        txtMarkdown.Size = new Size(598, 649);
        txtMarkdown.TabIndex = 0;
        txtMarkdown.Text = "";
        txtMarkdown.WordWrap = true;
        splitContainer1.Panel1.Controls.Add(txtMarkdown);

        // ── webViewPreview (오른쪽 미리보기 창) ─────────────────────────────
        webViewPreview.Dock = DockStyle.Fill;
        webViewPreview.Location = new Point(0, 0);
        webViewPreview.Name = "webViewPreview";
        webViewPreview.Size = new Size(597, 649);
        webViewPreview.TabIndex = 0;
        webViewPreview.ZoomFactor = 1.0;
        splitContainer1.Panel2.Controls.Add(webViewPreview);

        // ── EasyMDForm ────────────────────────────────────────────────────────────
        AutoScaleDimensions = new SizeF(7f, 15f);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1200, 700);
        Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
        Controls.Add(outerSplitContainer);
        Controls.Add(toolStrip1);
        Controls.Add(menuStrip1);
        MainMenuStrip = menuStrip1;
        MinimumSize = new Size(800, 500);
        Name = "EasyMDForm";
        Text = "EaxyMD - 새 파일";
        Load += EasyMDForm_Load;

        menuStrip1.ResumeLayout(false);
        menuStrip1.PerformLayout();
        toolStrip1.ResumeLayout(false);
        toolStrip1.PerformLayout();
        pnlSidebarHeader.ResumeLayout(false);
        pnlSidebar.ResumeLayout(false);
        splitContainer1.Panel1.ResumeLayout(false);
        splitContainer1.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainer1).EndInit();
        splitContainer1.ResumeLayout(false);
        outerSplitContainer.Panel1.ResumeLayout(false);
        outerSplitContainer.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)outerSplitContainer).EndInit();
        outerSplitContainer.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)webViewPreview).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    // ── 필드 선언 ────────────────────────────────────────────────────────────
    private MenuStrip menuStrip1;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem newToolStripMenuItem;
    private ToolStripMenuItem openToolStripMenuItem;
    private ToolStripMenuItem saveToolStripMenuItem;
    private ToolStripMenuItem saveAsToolStripMenuItem;
    private ToolStripSeparator menuSep1;
    private ToolStripMenuItem exitToolStripMenuItem;
    private ToolStripMenuItem helpToolStripMenuItem;
    private ToolStripMenuItem aboutToolStripMenuItem;

    private ToolStrip toolStrip1;
    private ToolStripButton btnH1;
    private ToolStripButton btnH2;
    private ToolStripButton btnH3;
    private ToolStripSeparator tbSep1;
    private ToolStripButton btnBold;
    private ToolStripButton btnItalic;
    private ToolStripButton btnStrike;
    private ToolStripSeparator tbSep2;
    private ToolStripButton btnCode;
    private ToolStripButton btnCodeBlock;
    private ToolStripSeparator tbSep3;
    private ToolStripButton btnLink;
    private ToolStripButton btnImage;
    private ToolStripSeparator tbSep4;
    private ToolStripButton btnUL;
    private ToolStripButton btnOL;
    private ToolStripButton btnQuote;
    private ToolStripSeparator tbSep5;
    private ToolStripButton btnHR;
    private ToolStripButton btnTable;

    private ToolStripButton btnToggleSidebar;
    private ToolStripSeparator tbSep0;

    private SplitContainer outerSplitContainer;
    private Panel pnlSidebar;
    private Panel pnlSidebarHeader;
    private Label lblOutline;
    private Button btnCollapse;
    private TreeView treeOutline;

    private SplitContainer splitContainer1;
    private RichTextBox txtMarkdown;
    private WebView2 webViewPreview;
    private System.Windows.Forms.Timer renderTimer;
}

namespace LVLGEditor1._0
{
    partial class Form1
    {
        private System.ComponentModel.IContainer components = null;

        // ── Field declarations ────────────────────────────────────────────

        // Menu
        private System.Windows.Forms.MenuStrip           menuStrip;
        private System.Windows.Forms.ToolStripMenuItem   menuFile;
        private System.Windows.Forms.ToolStripMenuItem   menuFileSave;
        private System.Windows.Forms.ToolStripMenuItem   menuFileLoad;
        private System.Windows.Forms.ToolStripSeparator  menuFileSep;
        private System.Windows.Forms.ToolStripMenuItem   menuFileExit;

        // Toolbar – row 1
        private System.Windows.Forms.Panel    editorToolbar;
        private System.Windows.Forms.Button   saveButton;
        private System.Windows.Forms.Button   loadButton;
        private System.Windows.Forms.Label    fontSizeLabel;
        private System.Windows.Forms.ComboBox fontSizeCombo;
        private System.Windows.Forms.Button   alignLeftBtn;
        private System.Windows.Forms.Button   alignCenterBtn;
        private System.Windows.Forms.Button   alignRightBtn;
        private System.Windows.Forms.Button   boldBtn;

        // Toolbar – row 2 (color swatches)
        private System.Windows.Forms.Label  colorBgSectionLabel;
        private System.Windows.Forms.Label  colorTitleBgLabel;
        private System.Windows.Forms.Button titleBgColorBtn;
        private System.Windows.Forms.Label  colorContentBgLabel;
        private System.Windows.Forms.Button contentBgColorBtn;
        private System.Windows.Forms.Label  colorShortcutBgLabel;
        private System.Windows.Forms.Button shortcutBgColorBtn;
        private System.Windows.Forms.Label  colorFgSectionLabel;
        private System.Windows.Forms.Label  colorTitleFgLabel;
        private System.Windows.Forms.Button titleFgColorBtn;
        private System.Windows.Forms.Label  colorContentFgLabel;
        private System.Windows.Forms.Button contentFgColorBtn;

        // Shared tooltip
        private System.Windows.Forms.ToolTip toolTip1;

        // LVGL Preview
        private System.Windows.Forms.Panel   lvglPreview;
        private System.Windows.Forms.Panel   titleBar;
        private System.Windows.Forms.TextBox titleTextBox;
        private System.Windows.Forms.Panel   contentArea;
        private System.Windows.Forms.Panel   shortcutBar;

        // Icon Palette
        private System.Windows.Forms.Panel           iconPaletteContainer;
        private System.Windows.Forms.Label           iconPaletteTitle;
        private System.Windows.Forms.FlowLayoutPanel iconPalette;
        private System.Windows.Forms.Button          loadIconsButton;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.components    = new System.ComponentModel.Container();
            this.toolTip1      = new System.Windows.Forms.ToolTip(this.components);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.SuspendLayout();

            // ── Form  700 × 760 ──────────────────────────────────────────
            // Menu(24) + Toolbar(72) + gap(8) + LVGL(640) + margin(16) = 760
            this.ClientSize      = new System.Drawing.Size(700, 760);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox     = false;
            this.Text            = "LVGL GUI Editor";
            this.BackColor       = System.Drawing.Color.FromArgb(45, 45, 48);

            // ── Menu strip ────────────────────────────────────────────────
            this.menuStrip    = new System.Windows.Forms.MenuStrip();
            this.menuFile     = new System.Windows.Forms.ToolStripMenuItem();
            this.menuFileSave = new System.Windows.Forms.ToolStripMenuItem();
            this.menuFileLoad = new System.Windows.Forms.ToolStripMenuItem();
            this.menuFileSep  = new System.Windows.Forms.ToolStripSeparator();
            this.menuFileExit = new System.Windows.Forms.ToolStripMenuItem();

            this.menuStrip.BackColor = System.Drawing.Color.FromArgb(37, 37, 38);
            this.menuStrip.ForeColor = System.Drawing.Color.White;
            this.menuStrip.Renderer  = new DarkMenuRenderer();
            this.menuStrip.Size      = new System.Drawing.Size(700, 24);

            this.menuFile.Text      = "파일(&F)";
            this.menuFile.ForeColor = System.Drawing.Color.White;

            this.menuFileSave.Text         = "저장(&S)";
            this.menuFileSave.ShortcutKeys = System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.S;
            this.menuFileSave.Click       += new System.EventHandler(this.MenuFileSave_Click);

            this.menuFileLoad.Text         = "불러오기(&O)";
            this.menuFileLoad.ShortcutKeys = System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.O;
            this.menuFileLoad.Click       += new System.EventHandler(this.MenuFileLoad_Click);

            this.menuFileExit.Text   = "종료(&X)";
            this.menuFileExit.Click += new System.EventHandler(this.MenuFileExit_Click);

            this.menuFile.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.menuFileSave, this.menuFileLoad, this.menuFileSep, this.menuFileExit });
            this.menuStrip.Items.Add(this.menuFile);

            // ── Toolbar (row1: y=5..33 / row2: y=44..66)  72px tall ──────
            this.editorToolbar           = new System.Windows.Forms.Panel();
            this.editorToolbar.Location  = new System.Drawing.Point(0, 24);
            this.editorToolbar.Size      = new System.Drawing.Size(700, 72);
            this.editorToolbar.BackColor = System.Drawing.Color.FromArgb(37, 37, 38);

            // ── Row 1 ──────────────────────────────────────────────

            this.saveButton           = new System.Windows.Forms.Button();
            this.saveButton.Text      = "💾 저장";
            this.saveButton.Location  = new System.Drawing.Point(8, 5);
            this.saveButton.Size      = new System.Drawing.Size(80, 28);
            this.saveButton.BackColor = System.Drawing.Color.FromArgb(0, 122, 204);
            this.saveButton.ForeColor = System.Drawing.Color.White;
            this.saveButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.saveButton.FlatAppearance.BorderSize = 0;
            this.saveButton.Click    += new System.EventHandler(this.MenuFileSave_Click);

            this.loadButton           = new System.Windows.Forms.Button();
            this.loadButton.Text      = "📂 열기";
            this.loadButton.Location  = new System.Drawing.Point(96, 5);
            this.loadButton.Size      = new System.Drawing.Size(80, 28);
            this.loadButton.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.loadButton.ForeColor = System.Drawing.Color.White;
            this.loadButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.loadButton.FlatAppearance.BorderSize = 0;
            this.loadButton.Click    += new System.EventHandler(this.MenuFileLoad_Click);

            this.fontSizeLabel          = new System.Windows.Forms.Label();
            this.fontSizeLabel.Text     = "글꼴 크기:";
            this.fontSizeLabel.ForeColor = System.Drawing.Color.White;
            this.fontSizeLabel.AutoSize = true;
            this.fontSizeLabel.Location = new System.Drawing.Point(200, 11);

            this.fontSizeCombo = new System.Windows.Forms.ComboBox();
            this.fontSizeCombo.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.fontSizeCombo.Location      = new System.Drawing.Point(278, 7);
            this.fontSizeCombo.Size          = new System.Drawing.Size(66, 21);
            this.fontSizeCombo.Items.AddRange(new object[] { 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48 });
            this.fontSizeCombo.SelectedIndex = 3;
            this.fontSizeCombo.SelectedIndexChanged += new System.EventHandler(this.FontSizeCombo_Changed);

            this.boldBtn           = new System.Windows.Forms.Button();
            this.boldBtn.Text      = "B";
            this.boldBtn.Font      = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.boldBtn.Location  = new System.Drawing.Point(354, 5);
            this.boldBtn.Size      = new System.Drawing.Size(36, 28);
            this.boldBtn.ForeColor = System.Drawing.Color.White;
            this.boldBtn.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.boldBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.boldBtn.FlatAppearance.BorderSize = 0;
            this.boldBtn.Click    += new System.EventHandler(this.BoldBtn_Click);
            this.toolTip1.SetToolTip(this.boldBtn, "굵게 (Ctrl+B)");

            this.alignLeftBtn           = new System.Windows.Forms.Button();
            this.alignLeftBtn.Text      = "≡ 좌";
            this.alignLeftBtn.Location  = new System.Drawing.Point(402, 5);
            this.alignLeftBtn.Size      = new System.Drawing.Size(52, 28);
            this.alignLeftBtn.ForeColor = System.Drawing.Color.White;
            this.alignLeftBtn.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.alignLeftBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.alignLeftBtn.FlatAppearance.BorderSize = 0;
            this.alignLeftBtn.Tag       = System.Windows.Forms.HorizontalAlignment.Left;
            this.alignLeftBtn.Click    += new System.EventHandler(this.AlignBtn_Click);

            this.alignCenterBtn           = new System.Windows.Forms.Button();
            this.alignCenterBtn.Text      = "≡ 중";
            this.alignCenterBtn.Location  = new System.Drawing.Point(458, 5);
            this.alignCenterBtn.Size      = new System.Drawing.Size(52, 28);
            this.alignCenterBtn.ForeColor = System.Drawing.Color.White;
            this.alignCenterBtn.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.alignCenterBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.alignCenterBtn.FlatAppearance.BorderSize = 0;
            this.alignCenterBtn.Tag       = System.Windows.Forms.HorizontalAlignment.Center;
            this.alignCenterBtn.Click    += new System.EventHandler(this.AlignBtn_Click);

            this.alignRightBtn           = new System.Windows.Forms.Button();
            this.alignRightBtn.Text      = "≡ 우";
            this.alignRightBtn.Location  = new System.Drawing.Point(514, 5);
            this.alignRightBtn.Size      = new System.Drawing.Size(52, 28);
            this.alignRightBtn.ForeColor = System.Drawing.Color.White;
            this.alignRightBtn.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.alignRightBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.alignRightBtn.FlatAppearance.BorderSize = 0;
            this.alignRightBtn.Tag       = System.Windows.Forms.HorizontalAlignment.Right;
            this.alignRightBtn.Click    += new System.EventHandler(this.AlignBtn_Click);

            // ── Row 2 – color swatches ─────────────────────────────────

            this.colorBgSectionLabel          = new System.Windows.Forms.Label();
            this.colorBgSectionLabel.Text     = "배경색";
            this.colorBgSectionLabel.ForeColor = System.Drawing.Color.FromArgb(200, 200, 200);
            this.colorBgSectionLabel.Font     = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            this.colorBgSectionLabel.AutoSize = true;
            this.colorBgSectionLabel.Location = new System.Drawing.Point(8, 48);

            this.colorTitleBgLabel          = new System.Windows.Forms.Label();
            this.colorTitleBgLabel.Text     = "제목";
            this.colorTitleBgLabel.ForeColor = System.Drawing.Color.FromArgb(180, 180, 180);
            this.colorTitleBgLabel.Font     = new System.Drawing.Font("Segoe UI", 8F);
            this.colorTitleBgLabel.AutoSize = true;
            this.colorTitleBgLabel.Location = new System.Drawing.Point(66, 48);

            this.titleBgColorBtn                            = new System.Windows.Forms.Button();
            this.titleBgColorBtn.Location                   = new System.Drawing.Point(93, 44);
            this.titleBgColorBtn.Size                       = new System.Drawing.Size(32, 22);
            this.titleBgColorBtn.BackColor                  = System.Drawing.Color.FromArgb(25, 25, 112);
            this.titleBgColorBtn.FlatStyle                  = System.Windows.Forms.FlatStyle.Flat;
            this.titleBgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(150, 150, 150);
            this.titleBgColorBtn.FlatAppearance.BorderSize  = 1;
            this.titleBgColorBtn.Cursor                     = System.Windows.Forms.Cursors.Hand;
            this.titleBgColorBtn.Click                     += new System.EventHandler(this.TitleBgColorBtn_Click);
            this.toolTip1.SetToolTip(this.titleBgColorBtn, "제목 표시줄 배경색");

            this.colorContentBgLabel          = new System.Windows.Forms.Label();
            this.colorContentBgLabel.Text     = "본문";
            this.colorContentBgLabel.ForeColor = System.Drawing.Color.FromArgb(180, 180, 180);
            this.colorContentBgLabel.Font     = new System.Drawing.Font("Segoe UI", 8F);
            this.colorContentBgLabel.AutoSize = true;
            this.colorContentBgLabel.Location = new System.Drawing.Point(136, 48);

            this.contentBgColorBtn                            = new System.Windows.Forms.Button();
            this.contentBgColorBtn.Location                   = new System.Drawing.Point(163, 44);
            this.contentBgColorBtn.Size                       = new System.Drawing.Size(32, 22);
            this.contentBgColorBtn.BackColor                  = System.Drawing.Color.FromArgb(18, 18, 60);
            this.contentBgColorBtn.FlatStyle                  = System.Windows.Forms.FlatStyle.Flat;
            this.contentBgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(150, 150, 150);
            this.contentBgColorBtn.FlatAppearance.BorderSize  = 1;
            this.contentBgColorBtn.Cursor                     = System.Windows.Forms.Cursors.Hand;
            this.contentBgColorBtn.Click                     += new System.EventHandler(this.ContentBgColorBtn_Click);
            this.toolTip1.SetToolTip(this.contentBgColorBtn, "본문 배경색");

            this.colorShortcutBgLabel          = new System.Windows.Forms.Label();
            this.colorShortcutBgLabel.Text     = "상태";
            this.colorShortcutBgLabel.ForeColor = System.Drawing.Color.FromArgb(180, 180, 180);
            this.colorShortcutBgLabel.Font     = new System.Drawing.Font("Segoe UI", 8F);
            this.colorShortcutBgLabel.AutoSize = true;
            this.colorShortcutBgLabel.Location = new System.Drawing.Point(206, 48);

            this.shortcutBgColorBtn                            = new System.Windows.Forms.Button();
            this.shortcutBgColorBtn.Location                   = new System.Drawing.Point(233, 44);
            this.shortcutBgColorBtn.Size                       = new System.Drawing.Size(32, 22);
            this.shortcutBgColorBtn.BackColor                  = System.Drawing.Color.FromArgb(30, 30, 30);
            this.shortcutBgColorBtn.FlatStyle                  = System.Windows.Forms.FlatStyle.Flat;
            this.shortcutBgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(150, 150, 150);
            this.shortcutBgColorBtn.FlatAppearance.BorderSize  = 1;
            this.shortcutBgColorBtn.Cursor                     = System.Windows.Forms.Cursors.Hand;
            this.shortcutBgColorBtn.Click                     += new System.EventHandler(this.ShortcutBgColorBtn_Click);
            this.toolTip1.SetToolTip(this.shortcutBgColorBtn, "상태 표시줄 배경색");

            this.colorFgSectionLabel          = new System.Windows.Forms.Label();
            this.colorFgSectionLabel.Text     = "글자색";
            this.colorFgSectionLabel.ForeColor = System.Drawing.Color.FromArgb(200, 200, 200);
            this.colorFgSectionLabel.Font     = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            this.colorFgSectionLabel.AutoSize = true;
            this.colorFgSectionLabel.Location = new System.Drawing.Point(290, 48);

            this.colorTitleFgLabel          = new System.Windows.Forms.Label();
            this.colorTitleFgLabel.Text     = "제목";
            this.colorTitleFgLabel.ForeColor = System.Drawing.Color.FromArgb(180, 180, 180);
            this.colorTitleFgLabel.Font     = new System.Drawing.Font("Segoe UI", 8F);
            this.colorTitleFgLabel.AutoSize = true;
            this.colorTitleFgLabel.Location = new System.Drawing.Point(356, 48);

            this.titleFgColorBtn                            = new System.Windows.Forms.Button();
            this.titleFgColorBtn.Location                   = new System.Drawing.Point(383, 44);
            this.titleFgColorBtn.Size                       = new System.Drawing.Size(32, 22);
            this.titleFgColorBtn.BackColor                  = System.Drawing.Color.White;
            this.titleFgColorBtn.FlatStyle                  = System.Windows.Forms.FlatStyle.Flat;
            this.titleFgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(150, 150, 150);
            this.titleFgColorBtn.FlatAppearance.BorderSize  = 1;
            this.titleFgColorBtn.Cursor                     = System.Windows.Forms.Cursors.Hand;
            this.titleFgColorBtn.Click                     += new System.EventHandler(this.TitleFgColorBtn_Click);
            this.toolTip1.SetToolTip(this.titleFgColorBtn, "제목 표시줄 글자색");

            this.colorContentFgLabel          = new System.Windows.Forms.Label();
            this.colorContentFgLabel.Text     = "본문";
            this.colorContentFgLabel.ForeColor = System.Drawing.Color.FromArgb(180, 180, 180);
            this.colorContentFgLabel.Font     = new System.Drawing.Font("Segoe UI", 8F);
            this.colorContentFgLabel.AutoSize = true;
            this.colorContentFgLabel.Location = new System.Drawing.Point(428, 48);

            this.contentFgColorBtn                            = new System.Windows.Forms.Button();
            this.contentFgColorBtn.Location                   = new System.Drawing.Point(455, 44);
            this.contentFgColorBtn.Size                       = new System.Drawing.Size(32, 22);
            this.contentFgColorBtn.BackColor                  = System.Drawing.Color.White;
            this.contentFgColorBtn.FlatStyle                  = System.Windows.Forms.FlatStyle.Flat;
            this.contentFgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(150, 150, 150);
            this.contentFgColorBtn.FlatAppearance.BorderSize  = 1;
            this.contentFgColorBtn.Cursor                     = System.Windows.Forms.Cursors.Hand;
            this.contentFgColorBtn.Click                     += new System.EventHandler(this.ContentFgColorBtn_Click);
            this.toolTip1.SetToolTip(this.contentFgColorBtn, "본문 글자색");

            // Add all toolbar controls
            this.editorToolbar.Controls.Add(this.saveButton);
            this.editorToolbar.Controls.Add(this.loadButton);
            this.editorToolbar.Controls.Add(this.fontSizeLabel);
            this.editorToolbar.Controls.Add(this.fontSizeCombo);
            this.editorToolbar.Controls.Add(this.boldBtn);
            this.editorToolbar.Controls.Add(this.alignLeftBtn);
            this.editorToolbar.Controls.Add(this.alignCenterBtn);
            this.editorToolbar.Controls.Add(this.alignRightBtn);
            this.editorToolbar.Controls.Add(this.colorBgSectionLabel);
            this.editorToolbar.Controls.Add(this.colorTitleBgLabel);
            this.editorToolbar.Controls.Add(this.titleBgColorBtn);
            this.editorToolbar.Controls.Add(this.colorContentBgLabel);
            this.editorToolbar.Controls.Add(this.contentBgColorBtn);
            this.editorToolbar.Controls.Add(this.colorShortcutBgLabel);
            this.editorToolbar.Controls.Add(this.shortcutBgColorBtn);
            this.editorToolbar.Controls.Add(this.colorFgSectionLabel);
            this.editorToolbar.Controls.Add(this.colorTitleFgLabel);
            this.editorToolbar.Controls.Add(this.titleFgColorBtn);
            this.editorToolbar.Controls.Add(this.colorContentFgLabel);
            this.editorToolbar.Controls.Add(this.contentFgColorBtn);

            // ── LVGL Preview (360×640)  at (20, 104) ──────────────────────
            this.lvglPreview             = new System.Windows.Forms.Panel();
            this.lvglPreview.Location    = new System.Drawing.Point(20, 104);
            this.lvglPreview.Size        = new System.Drawing.Size(360, 640);
            this.lvglPreview.BackColor   = System.Drawing.Color.Black;
            this.lvglPreview.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;

            this.titleBar           = new System.Windows.Forms.Panel();
            this.titleBar.Dock      = System.Windows.Forms.DockStyle.Top;
            this.titleBar.Height    = 80;
            this.titleBar.BackColor = System.Drawing.Color.FromArgb(25, 25, 112);

            this.titleTextBox             = new System.Windows.Forms.TextBox();
            this.titleTextBox.Text        = "Screen Title";
            this.titleTextBox.TextAlign   = System.Windows.Forms.HorizontalAlignment.Center;
            this.titleTextBox.Font        = new System.Drawing.Font("Segoe UI", 16F, System.Drawing.FontStyle.Bold);
            this.titleTextBox.ForeColor   = System.Drawing.Color.White;
            this.titleTextBox.BackColor   = System.Drawing.Color.FromArgb(25, 25, 112);
            this.titleTextBox.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.titleTextBox.Multiline   = true;
            this.titleTextBox.Location    = new System.Drawing.Point(5, 20);
            this.titleTextBox.Size        = new System.Drawing.Size(348, 40);
            this.titleBar.Controls.Add(this.titleTextBox);

            this.shortcutBar           = new System.Windows.Forms.Panel();
            this.shortcutBar.Dock      = System.Windows.Forms.DockStyle.Bottom;
            this.shortcutBar.Height    = 80;
            this.shortcutBar.BackColor = System.Drawing.Color.FromArgb(30, 30, 30);

            this.contentArea           = new System.Windows.Forms.Panel();
            this.contentArea.Dock      = System.Windows.Forms.DockStyle.Fill;
            this.contentArea.BackColor = System.Drawing.Color.FromArgb(18, 18, 60);

            this.lvglPreview.Controls.Add(this.contentArea);
            this.lvglPreview.Controls.Add(this.shortcutBar);
            this.lvglPreview.Controls.Add(this.titleBar);

            // ── Icon Palette (280px wide)  at (400, 104) ──────────────────
            this.iconPaletteContainer           = new System.Windows.Forms.Panel();
            this.iconPaletteContainer.Location  = new System.Drawing.Point(400, 104);
            this.iconPaletteContainer.Size      = new System.Drawing.Size(280, 640);
            this.iconPaletteContainer.BackColor = System.Drawing.Color.FromArgb(60, 60, 60);

            this.iconPaletteTitle           = new System.Windows.Forms.Label();
            this.iconPaletteTitle.Text      = "Icons";
            this.iconPaletteTitle.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.iconPaletteTitle.Font      = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.iconPaletteTitle.ForeColor = System.Drawing.Color.White;
            this.iconPaletteTitle.Dock      = System.Windows.Forms.DockStyle.Top;
            this.iconPaletteTitle.Height    = 24;

            this.loadIconsButton           = new System.Windows.Forms.Button();
            this.loadIconsButton.Text      = "아이콘 폴더 선택";
            this.loadIconsButton.Dock      = System.Windows.Forms.DockStyle.Top;
            this.loadIconsButton.Height    = 30;
            this.loadIconsButton.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.loadIconsButton.ForeColor = System.Drawing.Color.White;
            this.loadIconsButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.loadIconsButton.Click    += new System.EventHandler(this.LoadIconsButton_Click);

            this.iconPalette              = new System.Windows.Forms.FlowLayoutPanel();
            this.iconPalette.Dock         = System.Windows.Forms.DockStyle.Fill;
            this.iconPalette.FlowDirection = System.Windows.Forms.FlowDirection.LeftToRight;
            this.iconPalette.BackColor    = System.Drawing.Color.FromArgb(55, 55, 55);
            this.iconPalette.AutoScroll   = true;
            this.iconPalette.Padding      = new System.Windows.Forms.Padding(10);
            this.iconPalette.WrapContents = true;

            this.iconPaletteContainer.Controls.Add(this.iconPalette);
            this.iconPaletteContainer.Controls.Add(this.loadIconsButton);
            this.iconPaletteContainer.Controls.Add(this.iconPaletteTitle);

            // ── Form ──────────────────────────────────────────────────────
            this.MainMenuStrip = this.menuStrip;
            this.Controls.Add(this.menuStrip);
            this.Controls.Add(this.editorToolbar);
            this.Controls.Add(this.lvglPreview);
            this.Controls.Add(this.iconPaletteContainer);

            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion
    }
}

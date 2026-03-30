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
        private System.Windows.Forms.Button   saveImageButton;
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
        private System.Windows.Forms.Panel   titleLeftIconZone;
        private System.Windows.Forms.Panel   titleRightIconZone;
        private System.Windows.Forms.TextBox titleTextBox;
        private System.Windows.Forms.Panel   contentArea;
        private System.Windows.Forms.Panel   shortcutBar;

        // Icon Palette
        private System.Windows.Forms.Panel           iconPaletteContainer;
        private System.Windows.Forms.Label           iconPaletteTitle;
        private System.Windows.Forms.FlowLayoutPanel iconPalette;
        private System.Windows.Forms.Button          loadIconsButton;

        // Button Palette
        private System.Windows.Forms.Panel           buttonPaletteContainer;
        private System.Windows.Forms.Label           buttonPaletteTitle;
        private System.Windows.Forms.FlowLayoutPanel buttonPalette;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.toolTip1 = new System.Windows.Forms.ToolTip(this.components);
            this.boldBtn = new System.Windows.Forms.Button();
            this.titleBgColorBtn = new System.Windows.Forms.Button();
            this.contentBgColorBtn = new System.Windows.Forms.Button();
            this.shortcutBgColorBtn = new System.Windows.Forms.Button();
            this.titleFgColorBtn = new System.Windows.Forms.Button();
            this.contentFgColorBtn = new System.Windows.Forms.Button();
            this.menuStrip = new System.Windows.Forms.MenuStrip();
            this.menuFile = new System.Windows.Forms.ToolStripMenuItem();
            this.menuFileSave = new System.Windows.Forms.ToolStripMenuItem();
            this.menuFileLoad = new System.Windows.Forms.ToolStripMenuItem();
            this.menuFileSep = new System.Windows.Forms.ToolStripSeparator();
            this.menuFileExit = new System.Windows.Forms.ToolStripMenuItem();
            this.editorToolbar = new System.Windows.Forms.Panel();
            this.saveButton = new System.Windows.Forms.Button();
            this.loadButton = new System.Windows.Forms.Button();
            this.saveImageButton = new System.Windows.Forms.Button();
            this.fontSizeLabel = new System.Windows.Forms.Label();
            this.fontSizeCombo = new System.Windows.Forms.ComboBox();
            this.alignLeftBtn = new System.Windows.Forms.Button();
            this.alignCenterBtn = new System.Windows.Forms.Button();
            this.alignRightBtn = new System.Windows.Forms.Button();
            this.colorBgSectionLabel = new System.Windows.Forms.Label();
            this.colorTitleBgLabel = new System.Windows.Forms.Label();
            this.colorContentBgLabel = new System.Windows.Forms.Label();
            this.colorShortcutBgLabel = new System.Windows.Forms.Label();
            this.colorFgSectionLabel = new System.Windows.Forms.Label();
            this.colorTitleFgLabel = new System.Windows.Forms.Label();
            this.colorContentFgLabel = new System.Windows.Forms.Label();
            this.lvglPreview = new System.Windows.Forms.Panel();
            this.contentArea = new System.Windows.Forms.Panel();
            this.shortcutBar = new System.Windows.Forms.Panel();
            this.titleBar = new System.Windows.Forms.Panel();
            this.titleLeftIconZone  = new System.Windows.Forms.Panel();
            this.titleRightIconZone = new System.Windows.Forms.Panel();
            this.titleTextBox = new System.Windows.Forms.TextBox();
            this.iconPaletteContainer = new System.Windows.Forms.Panel();
            this.iconPalette = new System.Windows.Forms.FlowLayoutPanel();
            this.loadIconsButton = new System.Windows.Forms.Button();
            this.iconPaletteTitle = new System.Windows.Forms.Label();
            this.buttonPaletteContainer = new System.Windows.Forms.Panel();
            this.buttonPalette = new System.Windows.Forms.FlowLayoutPanel();
            this.buttonPaletteTitle = new System.Windows.Forms.Label();
            this.menuStrip.SuspendLayout();
            this.editorToolbar.SuspendLayout();
            this.lvglPreview.SuspendLayout();
            this.titleBar.SuspendLayout();
            this.iconPaletteContainer.SuspendLayout();
            this.buttonPaletteContainer.SuspendLayout();
            this.SuspendLayout();
            //
            // boldBtn
            //
            this.boldBtn.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(80)))), ((int)(((byte)(80)))), ((int)(((byte)(80)))));
            this.boldBtn.FlatAppearance.BorderSize = 0;
            this.boldBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.boldBtn.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.boldBtn.ForeColor = System.Drawing.Color.White;
            this.boldBtn.Location = new System.Drawing.Point(494, 5);
            this.boldBtn.Name = "boldBtn";
            this.boldBtn.Size = new System.Drawing.Size(36, 28);
            this.boldBtn.TabIndex = 4;
            this.boldBtn.Text = "B";
            this.toolTip1.SetToolTip(this.boldBtn, "굵게 (Ctrl+B)");
            this.boldBtn.UseVisualStyleBackColor = false;
            this.boldBtn.Click += new System.EventHandler(this.BoldBtn_Click);
            //
            // titleBgColorBtn
            //
            this.titleBgColorBtn.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(64)))), ((int)(((byte)(64)))));
            this.titleBgColorBtn.Cursor = System.Windows.Forms.Cursors.Hand;
            this.titleBgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(((int)(((byte)(150)))), ((int)(((byte)(150)))), ((int)(((byte)(150)))));
            this.titleBgColorBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.titleBgColorBtn.Location = new System.Drawing.Point(100, 44);
            this.titleBgColorBtn.Name = "titleBgColorBtn";
            this.titleBgColorBtn.Size = new System.Drawing.Size(32, 22);
            this.titleBgColorBtn.TabIndex = 10;
            this.toolTip1.SetToolTip(this.titleBgColorBtn, "제목 표시줄 배경색");
            this.titleBgColorBtn.UseVisualStyleBackColor = false;
            this.titleBgColorBtn.Click += new System.EventHandler(this.TitleBgColorBtn_Click);
            //
            // contentBgColorBtn
            //
            this.contentBgColorBtn.BackColor = System.Drawing.Color.White;
            this.contentBgColorBtn.Cursor = System.Windows.Forms.Cursors.Hand;
            this.contentBgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(((int)(((byte)(150)))), ((int)(((byte)(150)))), ((int)(((byte)(150)))));
            this.contentBgColorBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.contentBgColorBtn.Location = new System.Drawing.Point(192, 44);
            this.contentBgColorBtn.Name = "contentBgColorBtn";
            this.contentBgColorBtn.Size = new System.Drawing.Size(32, 22);
            this.contentBgColorBtn.TabIndex = 12;
            this.toolTip1.SetToolTip(this.contentBgColorBtn, "본문 배경색");
            this.contentBgColorBtn.UseVisualStyleBackColor = false;
            this.contentBgColorBtn.Click += new System.EventHandler(this.ContentBgColorBtn_Click);
            //
            // shortcutBgColorBtn
            //
            this.shortcutBgColorBtn.BackColor = System.Drawing.Color.White;
            this.shortcutBgColorBtn.Cursor = System.Windows.Forms.Cursors.Hand;
            this.shortcutBgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(((int)(((byte)(150)))), ((int)(((byte)(150)))), ((int)(((byte)(150)))));
            this.shortcutBgColorBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.shortcutBgColorBtn.Location = new System.Drawing.Point(284, 44);
            this.shortcutBgColorBtn.Name = "shortcutBgColorBtn";
            this.shortcutBgColorBtn.Size = new System.Drawing.Size(32, 22);
            this.shortcutBgColorBtn.TabIndex = 14;
            this.toolTip1.SetToolTip(this.shortcutBgColorBtn, "상태 표시줄 배경색");
            this.shortcutBgColorBtn.UseVisualStyleBackColor = false;
            this.shortcutBgColorBtn.Click += new System.EventHandler(this.ShortcutBgColorBtn_Click);
            //
            // titleFgColorBtn
            //
            this.titleFgColorBtn.BackColor = System.Drawing.Color.White;
            this.titleFgColorBtn.Cursor = System.Windows.Forms.Cursors.Hand;
            this.titleFgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(((int)(((byte)(150)))), ((int)(((byte)(150)))), ((int)(((byte)(150)))));
            this.titleFgColorBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.titleFgColorBtn.Location = new System.Drawing.Point(452, 44);
            this.titleFgColorBtn.Name = "titleFgColorBtn";
            this.titleFgColorBtn.Size = new System.Drawing.Size(32, 22);
            this.titleFgColorBtn.TabIndex = 17;
            this.toolTip1.SetToolTip(this.titleFgColorBtn, "제목 표시줄 글자색");
            this.titleFgColorBtn.UseVisualStyleBackColor = false;
            this.titleFgColorBtn.Click += new System.EventHandler(this.TitleFgColorBtn_Click);
            //
            // contentFgColorBtn
            //
            this.contentFgColorBtn.BackColor = System.Drawing.Color.Black;
            this.contentFgColorBtn.Cursor = System.Windows.Forms.Cursors.Hand;
            this.contentFgColorBtn.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(((int)(((byte)(150)))), ((int)(((byte)(150)))), ((int)(((byte)(150)))));
            this.contentFgColorBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.contentFgColorBtn.Location = new System.Drawing.Point(544, 44);
            this.contentFgColorBtn.Name = "contentFgColorBtn";
            this.contentFgColorBtn.Size = new System.Drawing.Size(32, 22);
            this.contentFgColorBtn.TabIndex = 19;
            this.toolTip1.SetToolTip(this.contentFgColorBtn, "본문 글자색");
            this.contentFgColorBtn.UseVisualStyleBackColor = false;
            this.contentFgColorBtn.Click += new System.EventHandler(this.ContentFgColorBtn_Click);
            //
            // menuStrip
            //
            this.menuStrip.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(37)))), ((int)(((byte)(37)))), ((int)(((byte)(38)))));
            this.menuStrip.ForeColor = System.Drawing.Color.White;
            this.menuStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.menuFile});
            this.menuStrip.Location = new System.Drawing.Point(0, 0);
            this.menuStrip.Name = "menuStrip";
            this.menuStrip.Size = new System.Drawing.Size(1010, 24);
            this.menuStrip.TabIndex = 0;
            //
            // menuFile
            //
            this.menuFile.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.menuFileSave,
            this.menuFileLoad,
            this.menuFileSep,
            this.menuFileExit});
            this.menuFile.ForeColor = System.Drawing.Color.White;
            this.menuFile.Name = "menuFile";
            this.menuFile.Size = new System.Drawing.Size(57, 20);
            this.menuFile.Text = "파일(&F)";
            //
            // menuFileSave
            //
            this.menuFileSave.Name = "menuFileSave";
            this.menuFileSave.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.S)));
            this.menuFileSave.Size = new System.Drawing.Size(182, 22);
            this.menuFileSave.Text = "저장(&S)";
            this.menuFileSave.Click += new System.EventHandler(this.MenuFileSave_Click);
            //
            // menuFileLoad
            //
            this.menuFileLoad.Name = "menuFileLoad";
            this.menuFileLoad.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.O)));
            this.menuFileLoad.Size = new System.Drawing.Size(182, 22);
            this.menuFileLoad.Text = "불러오기(&O)";
            this.menuFileLoad.Click += new System.EventHandler(this.MenuFileLoad_Click);
            //
            // menuFileSep
            //
            this.menuFileSep.Name = "menuFileSep";
            this.menuFileSep.Size = new System.Drawing.Size(179, 6);
            //
            // menuFileExit
            //
            this.menuFileExit.Name = "menuFileExit";
            this.menuFileExit.Size = new System.Drawing.Size(182, 22);
            this.menuFileExit.Text = "종료(&X)";
            this.menuFileExit.Click += new System.EventHandler(this.MenuFileExit_Click);
            //
            // editorToolbar
            //
            this.editorToolbar.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(37)))), ((int)(((byte)(37)))), ((int)(((byte)(38)))));
            this.editorToolbar.Controls.Add(this.saveButton);
            this.editorToolbar.Controls.Add(this.loadButton);
            this.editorToolbar.Controls.Add(this.saveImageButton);
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
            this.editorToolbar.Location = new System.Drawing.Point(0, 24);
            this.editorToolbar.Name = "editorToolbar";
            this.editorToolbar.Size = new System.Drawing.Size(1010, 72);
            this.editorToolbar.TabIndex = 1;
            //
            // saveButton
            //
            this.saveButton.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(0)))), ((int)(((byte)(122)))), ((int)(((byte)(204)))));
            this.saveButton.FlatAppearance.BorderSize = 0;
            this.saveButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.saveButton.ForeColor = System.Drawing.Color.White;
            this.saveButton.Location = new System.Drawing.Point(8, 5);
            this.saveButton.Name = "saveButton";
            this.saveButton.Size = new System.Drawing.Size(80, 28);
            this.saveButton.TabIndex = 0;
            this.saveButton.Text = "💾 저장";
            this.saveButton.UseVisualStyleBackColor = false;
            this.saveButton.Click += new System.EventHandler(this.MenuFileSave_Click);
            //
            // loadButton
            //
            this.loadButton.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(80)))), ((int)(((byte)(80)))), ((int)(((byte)(80)))));
            this.loadButton.FlatAppearance.BorderSize = 0;
            this.loadButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.loadButton.ForeColor = System.Drawing.Color.White;
            this.loadButton.Location = new System.Drawing.Point(104, 5);
            this.loadButton.Name = "loadButton";
            this.loadButton.Size = new System.Drawing.Size(80, 28);
            this.loadButton.TabIndex = 1;
            this.loadButton.Text = "📂 열기";
            this.loadButton.UseVisualStyleBackColor = false;
            this.loadButton.Click += new System.EventHandler(this.MenuFileLoad_Click);
            //
            // saveImageButton
            //
            this.saveImageButton.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(60)))), ((int)(((byte)(100)))), ((int)(((byte)(60)))));
            this.saveImageButton.FlatAppearance.BorderSize = 0;
            this.saveImageButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.saveImageButton.ForeColor = System.Drawing.Color.White;
            this.saveImageButton.Location = new System.Drawing.Point(200, 5);
            this.saveImageButton.Name = "saveImageButton";
            this.saveImageButton.Size = new System.Drawing.Size(110, 28);
            this.saveImageButton.TabIndex = 20;
            this.saveImageButton.Text = "🖼 이미지 저장";
            this.saveImageButton.UseVisualStyleBackColor = false;
            this.saveImageButton.Click += new System.EventHandler(this.SaveImageButton_Click);
            //
            // fontSizeLabel
            //
            this.fontSizeLabel.AutoSize = true;
            this.fontSizeLabel.ForeColor = System.Drawing.Color.White;
            this.fontSizeLabel.Location = new System.Drawing.Point(334, 11);
            this.fontSizeLabel.Name = "fontSizeLabel";
            this.fontSizeLabel.Size = new System.Drawing.Size(61, 12);
            this.fontSizeLabel.TabIndex = 2;
            this.fontSizeLabel.Text = "글꼴 크기:";
            //
            // fontSizeCombo
            //
            this.fontSizeCombo.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.fontSizeCombo.Items.AddRange(new object[] {
            8,
            10,
            12,
            14,
            16,
            18,
            20,
            24,
            28,
            32,
            36,
            40,
            48});
            this.fontSizeCombo.Location = new System.Drawing.Point(412, 7);
            this.fontSizeCombo.Name = "fontSizeCombo";
            this.fontSizeCombo.Size = new System.Drawing.Size(66, 20);
            this.fontSizeCombo.TabIndex = 3;
            this.fontSizeCombo.SelectedIndexChanged += new System.EventHandler(this.FontSizeCombo_Changed);
            //
            // alignLeftBtn
            //
            this.alignLeftBtn.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(80)))), ((int)(((byte)(80)))), ((int)(((byte)(80)))));
            this.alignLeftBtn.FlatAppearance.BorderSize = 0;
            this.alignLeftBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.alignLeftBtn.ForeColor = System.Drawing.Color.White;
            this.alignLeftBtn.Location = new System.Drawing.Point(546, 5);
            this.alignLeftBtn.Name = "alignLeftBtn";
            this.alignLeftBtn.Size = new System.Drawing.Size(52, 28);
            this.alignLeftBtn.TabIndex = 5;
            this.alignLeftBtn.Tag = System.Windows.Forms.HorizontalAlignment.Left;
            this.alignLeftBtn.Text = "≡ 좌";
            this.alignLeftBtn.UseVisualStyleBackColor = false;
            this.alignLeftBtn.Click += new System.EventHandler(this.AlignBtn_Click);
            //
            // alignCenterBtn
            //
            this.alignCenterBtn.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(80)))), ((int)(((byte)(80)))), ((int)(((byte)(80)))));
            this.alignCenterBtn.FlatAppearance.BorderSize = 0;
            this.alignCenterBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.alignCenterBtn.ForeColor = System.Drawing.Color.White;
            this.alignCenterBtn.Location = new System.Drawing.Point(614, 5);
            this.alignCenterBtn.Name = "alignCenterBtn";
            this.alignCenterBtn.Size = new System.Drawing.Size(52, 28);
            this.alignCenterBtn.TabIndex = 6;
            this.alignCenterBtn.Tag = System.Windows.Forms.HorizontalAlignment.Center;
            this.alignCenterBtn.Text = "≡ 중";
            this.alignCenterBtn.UseVisualStyleBackColor = false;
            this.alignCenterBtn.Click += new System.EventHandler(this.AlignBtn_Click);
            //
            // alignRightBtn
            //
            this.alignRightBtn.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(80)))), ((int)(((byte)(80)))), ((int)(((byte)(80)))));
            this.alignRightBtn.FlatAppearance.BorderSize = 0;
            this.alignRightBtn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.alignRightBtn.ForeColor = System.Drawing.Color.White;
            this.alignRightBtn.Location = new System.Drawing.Point(682, 5);
            this.alignRightBtn.Name = "alignRightBtn";
            this.alignRightBtn.Size = new System.Drawing.Size(52, 28);
            this.alignRightBtn.TabIndex = 7;
            this.alignRightBtn.Tag = System.Windows.Forms.HorizontalAlignment.Right;
            this.alignRightBtn.Text = "≡ 우";
            this.alignRightBtn.UseVisualStyleBackColor = false;
            this.alignRightBtn.Click += new System.EventHandler(this.AlignBtn_Click);
            //
            // colorBgSectionLabel
            //
            this.colorBgSectionLabel.AutoSize = true;
            this.colorBgSectionLabel.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            this.colorBgSectionLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(200)))), ((int)(((byte)(200)))));
            this.colorBgSectionLabel.Location = new System.Drawing.Point(8, 48);
            this.colorBgSectionLabel.Name = "colorBgSectionLabel";
            this.colorBgSectionLabel.Size = new System.Drawing.Size(43, 15);
            this.colorBgSectionLabel.TabIndex = 8;
            this.colorBgSectionLabel.Text = "배경색";
            //
            // colorTitleBgLabel
            //
            this.colorTitleBgLabel.AutoSize = true;
            this.colorTitleBgLabel.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.colorTitleBgLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(180)))), ((int)(((byte)(180)))), ((int)(((byte)(180)))));
            this.colorTitleBgLabel.Location = new System.Drawing.Point(68, 48);
            this.colorTitleBgLabel.Name = "colorTitleBgLabel";
            this.colorTitleBgLabel.Size = new System.Drawing.Size(29, 13);
            this.colorTitleBgLabel.TabIndex = 9;
            this.colorTitleBgLabel.Text = "제목";
            //
            // colorContentBgLabel
            //
            this.colorContentBgLabel.AutoSize = true;
            this.colorContentBgLabel.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.colorContentBgLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(180)))), ((int)(((byte)(180)))), ((int)(((byte)(180)))));
            this.colorContentBgLabel.Location = new System.Drawing.Point(160, 48);
            this.colorContentBgLabel.Name = "colorContentBgLabel";
            this.colorContentBgLabel.Size = new System.Drawing.Size(29, 13);
            this.colorContentBgLabel.TabIndex = 11;
            this.colorContentBgLabel.Text = "본문";
            //
            // colorShortcutBgLabel
            //
            this.colorShortcutBgLabel.AutoSize = true;
            this.colorShortcutBgLabel.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.colorShortcutBgLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(180)))), ((int)(((byte)(180)))), ((int)(((byte)(180)))));
            this.colorShortcutBgLabel.Location = new System.Drawing.Point(252, 48);
            this.colorShortcutBgLabel.Name = "colorShortcutBgLabel";
            this.colorShortcutBgLabel.Size = new System.Drawing.Size(29, 13);
            this.colorShortcutBgLabel.TabIndex = 13;
            this.colorShortcutBgLabel.Text = "상태";
            //
            // colorFgSectionLabel
            //
            this.colorFgSectionLabel.AutoSize = true;
            this.colorFgSectionLabel.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            this.colorFgSectionLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(200)))), ((int)(((byte)(200)))), ((int)(((byte)(200)))));
            this.colorFgSectionLabel.Location = new System.Drawing.Point(360, 48);
            this.colorFgSectionLabel.Name = "colorFgSectionLabel";
            this.colorFgSectionLabel.Size = new System.Drawing.Size(43, 15);
            this.colorFgSectionLabel.TabIndex = 15;
            this.colorFgSectionLabel.Text = "글자색";
            //
            // colorTitleFgLabel
            //
            this.colorTitleFgLabel.AutoSize = true;
            this.colorTitleFgLabel.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.colorTitleFgLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(180)))), ((int)(((byte)(180)))), ((int)(((byte)(180)))));
            this.colorTitleFgLabel.Location = new System.Drawing.Point(420, 48);
            this.colorTitleFgLabel.Name = "colorTitleFgLabel";
            this.colorTitleFgLabel.Size = new System.Drawing.Size(29, 13);
            this.colorTitleFgLabel.TabIndex = 16;
            this.colorTitleFgLabel.Text = "제목";
            //
            // colorContentFgLabel
            //
            this.colorContentFgLabel.AutoSize = true;
            this.colorContentFgLabel.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.colorContentFgLabel.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(180)))), ((int)(((byte)(180)))), ((int)(((byte)(180)))));
            this.colorContentFgLabel.Location = new System.Drawing.Point(512, 48);
            this.colorContentFgLabel.Name = "colorContentFgLabel";
            this.colorContentFgLabel.Size = new System.Drawing.Size(29, 13);
            this.colorContentFgLabel.TabIndex = 18;
            this.colorContentFgLabel.Text = "본문";
            //
            // lvglPreview
            //
            this.lvglPreview.BackColor = System.Drawing.Color.White;
            this.lvglPreview.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.lvglPreview.Controls.Add(this.contentArea);
            this.lvglPreview.Controls.Add(this.shortcutBar);
            this.lvglPreview.Controls.Add(this.titleBar);
            this.lvglPreview.Location = new System.Drawing.Point(20, 104);
            this.lvglPreview.Name = "lvglPreview";
            this.lvglPreview.Size = new System.Drawing.Size(360, 640);
            this.lvglPreview.TabIndex = 2;
            //
            // contentArea
            //
            this.contentArea.BackColor = System.Drawing.Color.White;
            this.contentArea.Dock = System.Windows.Forms.DockStyle.Fill;
            this.contentArea.Location = new System.Drawing.Point(0, 80);
            this.contentArea.Name = "contentArea";
            this.contentArea.Size = new System.Drawing.Size(358, 478);
            this.contentArea.TabIndex = 0;
            //
            // shortcutBar
            //
            this.shortcutBar.BackColor = System.Drawing.Color.White;
            this.shortcutBar.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.shortcutBar.Location = new System.Drawing.Point(0, 558);
            this.shortcutBar.Name = "shortcutBar";
            this.shortcutBar.Size = new System.Drawing.Size(358, 80);
            this.shortcutBar.TabIndex = 1;
            //
            // titleBar
            //
            this.titleBar.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(64)))), ((int)(((byte)(64)))));
            this.titleBar.Controls.Add(this.titleRightIconZone);
            this.titleBar.Controls.Add(this.titleLeftIconZone);
            this.titleBar.Controls.Add(this.titleTextBox);
            this.titleBar.Dock = System.Windows.Forms.DockStyle.Top;
            this.titleBar.Location = new System.Drawing.Point(0, 0);
            this.titleBar.Name = "titleBar";
            this.titleBar.Size = new System.Drawing.Size(358, 80);
            this.titleBar.TabIndex = 2;
            //
            // titleLeftIconZone
            //
            this.titleLeftIconZone.BackColor = System.Drawing.Color.Transparent;
            this.titleLeftIconZone.Location = new System.Drawing.Point(0, 0);
            this.titleLeftIconZone.Name = "titleLeftIconZone";
            this.titleLeftIconZone.Size = new System.Drawing.Size(80, 80);
            this.titleLeftIconZone.TabIndex = 1;
            //
            // titleRightIconZone
            //
            this.titleRightIconZone.BackColor = System.Drawing.Color.Transparent;
            this.titleRightIconZone.Location = new System.Drawing.Point(278, 0);
            this.titleRightIconZone.Name = "titleRightIconZone";
            this.titleRightIconZone.Size = new System.Drawing.Size(80, 80);
            this.titleRightIconZone.TabIndex = 2;
            //
            // titleTextBox
            //
            this.titleTextBox.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(64)))), ((int)(((byte)(64)))));
            this.titleTextBox.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.titleTextBox.Font = new System.Drawing.Font("Segoe UI", 28F, System.Drawing.FontStyle.Bold);
            this.titleTextBox.ForeColor = System.Drawing.Color.White;
            this.titleTextBox.Location = new System.Drawing.Point(80, 18);
            this.titleTextBox.Multiline = true;
            this.titleTextBox.Name = "titleTextBox";
            this.titleTextBox.Size = new System.Drawing.Size(198, 44);
            this.titleTextBox.TabIndex = 0;
            this.titleTextBox.Text = "Screen Title";
            this.titleTextBox.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            //
            // iconPaletteContainer
            //
            this.iconPaletteContainer.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(60)))), ((int)(((byte)(60)))), ((int)(((byte)(60)))));
            this.iconPaletteContainer.Controls.Add(this.iconPalette);
            this.iconPaletteContainer.Controls.Add(this.loadIconsButton);
            this.iconPaletteContainer.Controls.Add(this.iconPaletteTitle);
            this.iconPaletteContainer.Location = new System.Drawing.Point(400, 104);
            this.iconPaletteContainer.Name = "iconPaletteContainer";
            this.iconPaletteContainer.Size = new System.Drawing.Size(280, 640);
            this.iconPaletteContainer.TabIndex = 3;
            //
            // iconPalette
            //
            this.iconPalette.AutoScroll = true;
            this.iconPalette.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(55)))), ((int)(((byte)(55)))), ((int)(((byte)(55)))));
            this.iconPalette.Dock = System.Windows.Forms.DockStyle.Fill;
            this.iconPalette.Location = new System.Drawing.Point(0, 54);
            this.iconPalette.Name = "iconPalette";
            this.iconPalette.Padding = new System.Windows.Forms.Padding(10);
            this.iconPalette.Size = new System.Drawing.Size(280, 586);
            this.iconPalette.TabIndex = 0;
            //
            // loadIconsButton
            //
            this.loadIconsButton.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(80)))), ((int)(((byte)(80)))), ((int)(((byte)(80)))));
            this.loadIconsButton.Dock = System.Windows.Forms.DockStyle.Top;
            this.loadIconsButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.loadIconsButton.ForeColor = System.Drawing.Color.White;
            this.loadIconsButton.Location = new System.Drawing.Point(0, 24);
            this.loadIconsButton.Name = "loadIconsButton";
            this.loadIconsButton.Size = new System.Drawing.Size(280, 30);
            this.loadIconsButton.TabIndex = 1;
            this.loadIconsButton.Text = "아이콘 폴더 선택";
            this.loadIconsButton.UseVisualStyleBackColor = false;
            this.loadIconsButton.Click += new System.EventHandler(this.LoadIconsButton_Click);
            //
            // iconPaletteTitle
            //
            this.iconPaletteTitle.Dock = System.Windows.Forms.DockStyle.Top;
            this.iconPaletteTitle.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.iconPaletteTitle.ForeColor = System.Drawing.Color.White;
            this.iconPaletteTitle.Location = new System.Drawing.Point(0, 0);
            this.iconPaletteTitle.Name = "iconPaletteTitle";
            this.iconPaletteTitle.Size = new System.Drawing.Size(280, 24);
            this.iconPaletteTitle.TabIndex = 2;
            this.iconPaletteTitle.Text = "Icons";
            this.iconPaletteTitle.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            //
            // buttonPaletteContainer
            //
            this.buttonPaletteContainer.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(50)))), ((int)(((byte)(50)))), ((int)(((byte)(60)))));
            this.buttonPaletteContainer.Controls.Add(this.buttonPalette);
            this.buttonPaletteContainer.Controls.Add(this.buttonPaletteTitle);
            this.buttonPaletteContainer.Location = new System.Drawing.Point(690, 104);
            this.buttonPaletteContainer.Name = "buttonPaletteContainer";
            this.buttonPaletteContainer.Size = new System.Drawing.Size(300, 640);
            this.buttonPaletteContainer.TabIndex = 4;
            //
            // buttonPalette
            //
            this.buttonPalette.AutoScroll = true;
            this.buttonPalette.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(45)))), ((int)(((byte)(45)))), ((int)(((byte)(55)))));
            this.buttonPalette.Dock = System.Windows.Forms.DockStyle.Fill;
            this.buttonPalette.Location = new System.Drawing.Point(0, 24);
            this.buttonPalette.Name = "buttonPalette";
            this.buttonPalette.Padding = new System.Windows.Forms.Padding(8);
            this.buttonPalette.Size = new System.Drawing.Size(300, 616);
            this.buttonPalette.TabIndex = 0;
            //
            // buttonPaletteTitle
            //
            this.buttonPaletteTitle.Dock = System.Windows.Forms.DockStyle.Top;
            this.buttonPaletteTitle.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.buttonPaletteTitle.ForeColor = System.Drawing.Color.White;
            this.buttonPaletteTitle.Location = new System.Drawing.Point(0, 0);
            this.buttonPaletteTitle.Name = "buttonPaletteTitle";
            this.buttonPaletteTitle.Size = new System.Drawing.Size(300, 24);
            this.buttonPaletteTitle.TabIndex = 1;
            this.buttonPaletteTitle.Text = "Buttons";
            this.buttonPaletteTitle.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            //
            // Form1
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(45)))), ((int)(((byte)(45)))), ((int)(((byte)(48)))));
            this.ClientSize = new System.Drawing.Size(1010, 760);
            this.Controls.Add(this.menuStrip);
            this.Controls.Add(this.editorToolbar);
            this.Controls.Add(this.lvglPreview);
            this.Controls.Add(this.iconPaletteContainer);
            this.Controls.Add(this.buttonPaletteContainer);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MainMenuStrip = this.menuStrip;
            this.MaximizeBox = false;
            this.Name = "Form1";
            this.Text = "LVGL GUI Editor";
            this.menuStrip.ResumeLayout(false);
            this.menuStrip.PerformLayout();
            this.editorToolbar.ResumeLayout(false);
            this.editorToolbar.PerformLayout();
            this.lvglPreview.ResumeLayout(false);
            this.titleBar.ResumeLayout(false);
            this.titleBar.PerformLayout();
            this.iconPaletteContainer.ResumeLayout(false);
            this.buttonPaletteContainer.ResumeLayout(false);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion
    }
}

namespace PandocWinV2._0
{
    partial class PandocWin20Form
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(PandocWin20Form));
            Color shellBack = Color.FromArgb(241, 245, 249);
            Color headerBack = Color.FromArgb(30, 58, 95);
            Color cardBack = Color.White;
            Color mutedText = Color.FromArgb(100, 116, 139);
            Color sectionText = Color.FromArgb(51, 65, 85);
            Color accentBlue = Color.FromArgb(37, 99, 235);
            Color accentBlueHover = Color.FromArgb(29, 78, 216);
            Color accentBluePress = Color.FromArgb(30, 64, 175);
            Color borderSubtle = Color.FromArgb(226, 232, 240);

            menuStrip = new MenuStrip();
            menuHelp = new ToolStripMenuItem();
            menuCheckDeps = new ToolStripMenuItem();
            menuSeparator = new ToolStripSeparator();
            menuAbout = new ToolStripMenuItem();
            panelShell = new Panel();
            panelHeader = new Panel();
            lblAppTitle = new Label();
            lblAppSubtitle = new Label();
            panelBody = new Panel();
            pnlCardInput = new Panel();
            lblSectionInput = new Label();
            lblInputPath = new Label();
            txtInputPath = new TextBox();
            btnBrowseInput = new Button();
            lblFormatHint = new Label();
            lblAutoFormat = new Label();
            cmbInputFormat = new ComboBox();
            pnlGap1 = new Panel();
            pnlCardOutput = new Panel();
            lblSectionOutput = new Label();
            lblOutputFormat = new Label();
            cmbOutputFormat = new ComboBox();
            lblOutputPath = new Label();
            txtOutputPath = new TextBox();
            btnBrowseOutput = new Button();
            pnlGap2 = new Panel();
            btnConvert = new Button();
            pnlFillRest = new Panel();
            statusStrip = new StatusStrip();
            lblStatus = new ToolStripStatusLabel();
            statusProgress = new ToolStripProgressBar();
            menuStrip.SuspendLayout();
            panelShell.SuspendLayout();
            panelHeader.SuspendLayout();
            panelBody.SuspendLayout();
            pnlCardInput.SuspendLayout();
            pnlCardOutput.SuspendLayout();
            statusStrip.SuspendLayout();
            SuspendLayout();
            // 
            // menuStrip
            // 
            menuStrip.BackColor = Color.White;
            menuStrip.Items.AddRange(new ToolStripItem[] { menuHelp });
            menuStrip.Location = new Point(0, 0);
            menuStrip.Name = "menuStrip";
            menuStrip.Padding = new Padding(8, 2, 0, 2);
            menuStrip.Size = new Size(680, 24);
            menuStrip.TabIndex = 0;
            // 
            // menuHelp
            // 
            menuHelp.DropDownItems.AddRange(new ToolStripItem[] { menuCheckDeps, menuSeparator, menuAbout });
            menuHelp.Name = "menuHelp";
            menuHelp.Size = new Size(72, 20);
            menuHelp.Text = "도움말(&H)";
            // 
            // menuCheckDeps
            // 
            menuCheckDeps.Name = "menuCheckDeps";
            menuCheckDeps.Size = new Size(196, 22);
            menuCheckDeps.Text = "의존성 확인(&D)...";
            menuCheckDeps.Click += MenuCheckDeps_Click;
            // 
            // menuSeparator
            // 
            menuSeparator.Name = "menuSeparator";
            menuSeparator.Size = new Size(193, 6);
            // 
            // menuAbout
            // 
            menuAbout.Name = "menuAbout";
            menuAbout.Size = new Size(196, 22);
            menuAbout.Text = "정보(&A)...";
            menuAbout.Click += MenuAbout_Click;
            // 
            // panelShell
            // 
            panelShell.BackColor = shellBack;
            panelShell.Controls.Add(panelBody);
            panelShell.Controls.Add(panelHeader);
            panelShell.Dock = DockStyle.Fill;
            panelShell.Location = new Point(0, 24);
            panelShell.Name = "panelShell";
            panelShell.Size = new Size(680, 462);
            panelShell.TabIndex = 1;
            // 
            // panelHeader
            // 
            panelHeader.BackColor = headerBack;
            panelHeader.Controls.Add(lblAppTitle);
            panelHeader.Controls.Add(lblAppSubtitle);
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Location = new Point(0, 0);
            panelHeader.Name = "panelHeader";
            panelHeader.Padding = new Padding(24, 0, 24, 0);
            panelHeader.Size = new Size(680, 72);
            panelHeader.TabIndex = 0;
            // 
            // lblAppTitle
            // 
            lblAppTitle.AutoSize = true;
            lblAppTitle.Font = new Font("Segoe UI", 13.5F, FontStyle.Bold);
            lblAppTitle.ForeColor = Color.White;
            lblAppTitle.Location = new Point(24, 14);
            lblAppTitle.Name = "lblAppTitle";
            lblAppTitle.Size = new Size(196, 25);
            lblAppTitle.TabIndex = 0;
            lblAppTitle.Text = "Pandoc 파일 변환기";
            // 
            // lblAppSubtitle
            // 
            lblAppSubtitle.AutoSize = true;
            lblAppSubtitle.Font = new Font("Segoe UI", 9F);
            lblAppSubtitle.ForeColor = Color.FromArgb(184, 197, 214);
            lblAppSubtitle.Location = new Point(26, 42);
            lblAppSubtitle.Name = "lblAppSubtitle";
            lblAppSubtitle.Size = new Size(314, 15);
            lblAppSubtitle.TabIndex = 1;
            lblAppSubtitle.Text = "Markdown, Word, HTML 등 다양한 형식을 손쉽게 변환합니다.";
            // 
            // panelBody
            // 
            panelBody.BackColor = shellBack;
            panelBody.Controls.Add(pnlFillRest);
            panelBody.Controls.Add(btnConvert);
            panelBody.Controls.Add(pnlGap2);
            panelBody.Controls.Add(pnlCardOutput);
            panelBody.Controls.Add(pnlGap1);
            panelBody.Controls.Add(pnlCardInput);
            panelBody.Dock = DockStyle.Fill;
            panelBody.Location = new Point(0, 72);
            panelBody.Name = "panelBody";
            panelBody.Padding = new Padding(20, 18, 20, 18);
            panelBody.Size = new Size(680, 390);
            panelBody.TabIndex = 1;
            // 
            // pnlCardInput
            // 
            pnlCardInput.BackColor = cardBack;
            pnlCardInput.BorderStyle = BorderStyle.FixedSingle;
            pnlCardInput.Controls.Add(lblSectionInput);
            pnlCardInput.Controls.Add(lblInputPath);
            pnlCardInput.Controls.Add(txtInputPath);
            pnlCardInput.Controls.Add(btnBrowseInput);
            pnlCardInput.Controls.Add(lblFormatHint);
            pnlCardInput.Controls.Add(lblAutoFormat);
            pnlCardInput.Controls.Add(cmbInputFormat);
            pnlCardInput.Dock = DockStyle.Top;
            pnlCardInput.Location = new Point(20, 18);
            pnlCardInput.Name = "pnlCardInput";
            pnlCardInput.Size = new Size(640, 128);
            pnlCardInput.TabIndex = 0;
            // 
            // lblSectionInput
            // 
            lblSectionInput.AutoSize = true;
            lblSectionInput.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            lblSectionInput.ForeColor = sectionText;
            lblSectionInput.Location = new Point(18, 14);
            lblSectionInput.Name = "lblSectionInput";
            lblSectionInput.Size = new Size(37, 19);
            lblSectionInput.TabIndex = 0;
            lblSectionInput.Text = "입력";
            // 
            // lblInputPath
            // 
            lblInputPath.Font = new Font("Segoe UI", 9F);
            lblInputPath.ForeColor = sectionText;
            lblInputPath.Location = new Point(18, 46);
            lblInputPath.Name = "lblInputPath";
            lblInputPath.Size = new Size(48, 23);
            lblInputPath.TabIndex = 1;
            lblInputPath.Text = "파일";
            lblInputPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // txtInputPath
            // 
            txtInputPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            txtInputPath.BackColor = Color.FromArgb(248, 250, 252);
            txtInputPath.BorderStyle = BorderStyle.FixedSingle;
            txtInputPath.Font = new Font("Segoe UI", 9F);
            txtInputPath.Location = new Point(72, 44);
            txtInputPath.Name = "txtInputPath";
            txtInputPath.ReadOnly = true;
            txtInputPath.Size = new Size(444, 23);
            txtInputPath.TabIndex = 2;
            // 
            // btnBrowseInput
            // 
            btnBrowseInput.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnBrowseInput.BackColor = Color.White;
            btnBrowseInput.Cursor = Cursors.Hand;
            btnBrowseInput.FlatAppearance.BorderColor = borderSubtle;
            btnBrowseInput.FlatAppearance.MouseDownBackColor = Color.FromArgb(241, 245, 249);
            btnBrowseInput.FlatAppearance.MouseOverBackColor = Color.FromArgb(248, 250, 252);
            btnBrowseInput.FlatStyle = FlatStyle.Flat;
            btnBrowseInput.Font = new Font("Segoe UI", 9F);
            btnBrowseInput.ForeColor = sectionText;
            btnBrowseInput.Location = new Point(528, 42);
            btnBrowseInput.Name = "btnBrowseInput";
            btnBrowseInput.Size = new Size(92, 28);
            btnBrowseInput.TabIndex = 3;
            btnBrowseInput.Text = "찾아보기…";
            btnBrowseInput.UseVisualStyleBackColor = false;
            btnBrowseInput.Click += BtnBrowseInput_Click;
            // 
            // lblFormatHint
            // 
            lblFormatHint.Font = new Font("Segoe UI", 9F);
            lblFormatHint.ForeColor = sectionText;
            lblFormatHint.Location = new Point(18, 82);
            lblFormatHint.Name = "lblFormatHint";
            lblFormatHint.Size = new Size(48, 23);
            lblFormatHint.TabIndex = 4;
            lblFormatHint.Text = "형식";
            lblFormatHint.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblAutoFormat
            // 
            lblAutoFormat.Font = new Font("Segoe UI", 9F);
            lblAutoFormat.ForeColor = mutedText;
            lblAutoFormat.Location = new Point(72, 82);
            lblAutoFormat.Name = "lblAutoFormat";
            lblAutoFormat.Size = new Size(200, 23);
            lblAutoFormat.TabIndex = 5;
            lblAutoFormat.Text = "자동 감지";
            lblAutoFormat.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // cmbInputFormat
            // 
            cmbInputFormat.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            cmbInputFormat.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbInputFormat.FlatStyle = FlatStyle.Flat;
            cmbInputFormat.Font = new Font("Segoe UI", 9F);
            cmbInputFormat.Location = new Point(458, 80);
            cmbInputFormat.Name = "cmbInputFormat";
            cmbInputFormat.Size = new Size(162, 23);
            cmbInputFormat.TabIndex = 6;
            // 
            // pnlGap1
            // 
            pnlGap1.BackColor = shellBack;
            pnlGap1.Dock = DockStyle.Top;
            pnlGap1.Location = new Point(20, 146);
            pnlGap1.Name = "pnlGap1";
            pnlGap1.Size = new Size(640, 14);
            pnlGap1.TabIndex = 1;
            // 
            // pnlCardOutput
            // 
            pnlCardOutput.BackColor = cardBack;
            pnlCardOutput.BorderStyle = BorderStyle.FixedSingle;
            pnlCardOutput.Controls.Add(lblSectionOutput);
            pnlCardOutput.Controls.Add(lblOutputFormat);
            pnlCardOutput.Controls.Add(cmbOutputFormat);
            pnlCardOutput.Controls.Add(lblOutputPath);
            pnlCardOutput.Controls.Add(txtOutputPath);
            pnlCardOutput.Controls.Add(btnBrowseOutput);
            pnlCardOutput.Dock = DockStyle.Top;
            pnlCardOutput.Location = new Point(20, 160);
            pnlCardOutput.Name = "pnlCardOutput";
            pnlCardOutput.Size = new Size(640, 128);
            pnlCardOutput.TabIndex = 2;
            // 
            // lblSectionOutput
            // 
            lblSectionOutput.AutoSize = true;
            lblSectionOutput.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            lblSectionOutput.ForeColor = sectionText;
            lblSectionOutput.Location = new Point(18, 14);
            lblSectionOutput.Name = "lblSectionOutput";
            lblSectionOutput.Size = new Size(37, 19);
            lblSectionOutput.TabIndex = 0;
            lblSectionOutput.Text = "출력";
            // 
            // lblOutputFormat
            // 
            lblOutputFormat.Font = new Font("Segoe UI", 9F);
            lblOutputFormat.ForeColor = sectionText;
            lblOutputFormat.Location = new Point(18, 46);
            lblOutputFormat.Name = "lblOutputFormat";
            lblOutputFormat.Size = new Size(48, 23);
            lblOutputFormat.TabIndex = 1;
            lblOutputFormat.Text = "형식";
            lblOutputFormat.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // cmbOutputFormat
            // 
            cmbOutputFormat.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            cmbOutputFormat.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbOutputFormat.FlatStyle = FlatStyle.Flat;
            cmbOutputFormat.Font = new Font("Segoe UI", 9F);
            cmbOutputFormat.Location = new Point(72, 44);
            cmbOutputFormat.Name = "cmbOutputFormat";
            cmbOutputFormat.Size = new Size(548, 23);
            cmbOutputFormat.TabIndex = 2;
            // 
            // lblOutputPath
            // 
            lblOutputPath.Font = new Font("Segoe UI", 9F);
            lblOutputPath.ForeColor = sectionText;
            lblOutputPath.Location = new Point(18, 82);
            lblOutputPath.Name = "lblOutputPath";
            lblOutputPath.Size = new Size(48, 23);
            lblOutputPath.TabIndex = 3;
            lblOutputPath.Text = "저장";
            lblOutputPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // txtOutputPath
            // 
            txtOutputPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            txtOutputPath.BackColor = Color.White;
            txtOutputPath.BorderStyle = BorderStyle.FixedSingle;
            txtOutputPath.Font = new Font("Segoe UI", 9F);
            txtOutputPath.Location = new Point(72, 80);
            txtOutputPath.Name = "txtOutputPath";
            txtOutputPath.Size = new Size(444, 23);
            txtOutputPath.TabIndex = 4;
            // 
            // btnBrowseOutput
            // 
            btnBrowseOutput.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnBrowseOutput.BackColor = Color.White;
            btnBrowseOutput.Cursor = Cursors.Hand;
            btnBrowseOutput.FlatAppearance.BorderColor = borderSubtle;
            btnBrowseOutput.FlatAppearance.MouseDownBackColor = Color.FromArgb(241, 245, 249);
            btnBrowseOutput.FlatAppearance.MouseOverBackColor = Color.FromArgb(248, 250, 252);
            btnBrowseOutput.FlatStyle = FlatStyle.Flat;
            btnBrowseOutput.Font = new Font("Segoe UI", 9F);
            btnBrowseOutput.ForeColor = sectionText;
            btnBrowseOutput.Location = new Point(528, 78);
            btnBrowseOutput.Name = "btnBrowseOutput";
            btnBrowseOutput.Size = new Size(92, 28);
            btnBrowseOutput.TabIndex = 5;
            btnBrowseOutput.Text = "찾아보기…";
            btnBrowseOutput.UseVisualStyleBackColor = false;
            btnBrowseOutput.Click += BtnBrowseOutput_Click;
            // 
            // pnlGap2
            // 
            pnlGap2.BackColor = shellBack;
            pnlGap2.Dock = DockStyle.Top;
            pnlGap2.Location = new Point(20, 288);
            pnlGap2.Name = "pnlGap2";
            pnlGap2.Size = new Size(640, 18);
            pnlGap2.TabIndex = 3;
            // 
            // btnConvert
            // 
            btnConvert.BackColor = accentBlue;
            btnConvert.Cursor = Cursors.Hand;
            btnConvert.Dock = DockStyle.Top;
            btnConvert.FlatAppearance.BorderSize = 0;
            btnConvert.FlatAppearance.MouseDownBackColor = accentBluePress;
            btnConvert.FlatAppearance.MouseOverBackColor = accentBlueHover;
            btnConvert.FlatStyle = FlatStyle.Flat;
            btnConvert.Font = new Font("Segoe UI", 10.5F, FontStyle.Bold);
            btnConvert.ForeColor = Color.White;
            btnConvert.Location = new Point(20, 306);
            btnConvert.Name = "btnConvert";
            btnConvert.Size = new Size(640, 44);
            btnConvert.TabIndex = 4;
            btnConvert.Text = "변환 시작";
            btnConvert.UseVisualStyleBackColor = false;
            btnConvert.Click += BtnConvert_Click;
            // 
            // pnlFillRest
            // 
            pnlFillRest.BackColor = shellBack;
            pnlFillRest.Dock = DockStyle.Fill;
            pnlFillRest.Location = new Point(20, 350);
            pnlFillRest.Name = "pnlFillRest";
            pnlFillRest.Size = new Size(640, 22);
            pnlFillRest.TabIndex = 5;
            // 
            // statusStrip
            // 
            statusStrip.BackColor = Color.FromArgb(248, 250, 252);
            statusStrip.Items.AddRange(new ToolStripItem[] { lblStatus, statusProgress });
            statusStrip.Location = new Point(0, 486);
            statusStrip.Name = "statusStrip";
            statusStrip.Padding = new Padding(1, 0, 12, 0);
            statusStrip.Size = new Size(680, 22);
            statusStrip.SizingGrip = false;
            statusStrip.TabIndex = 2;
            // 
            // lblStatus
            // 
            lblStatus.Font = new Font("Segoe UI", 9F);
            lblStatus.ForeColor = mutedText;
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(100, 17);
            lblStatus.Spring = true;
            lblStatus.Text = "준비";
            lblStatus.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // statusProgress
            // 
            statusProgress.AutoSize = false;
            statusProgress.Margin = new Padding(0, 2, 8, 2);
            statusProgress.MarqueeAnimationSpeed = 35;
            statusProgress.Name = "statusProgress";
            statusProgress.Size = new Size(200, 16);
            statusProgress.Style = ProgressBarStyle.Marquee;
            statusProgress.Visible = false;
            // 
            // PandocWin20Form
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = shellBack;
            ClientSize = new Size(680, 508);
            Controls.Add(panelShell);
            Controls.Add(statusStrip);
            Controls.Add(menuStrip);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuStrip;
            MaximizeBox = false;
            MaximumSize = new Size(696, 547);
            MinimumSize = new Size(696, 547);
            Name = "PandocWin20Form";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Pandoc 파일 변환기";
            Load += PandocWin20Form_Load;
            menuStrip.ResumeLayout(false);
            menuStrip.PerformLayout();
            panelShell.ResumeLayout(false);
            panelHeader.ResumeLayout(false);
            panelHeader.PerformLayout();
            panelBody.ResumeLayout(false);
            pnlCardInput.ResumeLayout(false);
            pnlCardInput.PerformLayout();
            pnlCardOutput.ResumeLayout(false);
            pnlCardOutput.PerformLayout();
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private MenuStrip            menuStrip;
        private ToolStripMenuItem    menuHelp;
        private ToolStripMenuItem    menuCheckDeps;
        private ToolStripSeparator   menuSeparator;
        private ToolStripMenuItem    menuAbout;

        private Panel                panelShell;
        private Panel                panelHeader;
        private Label                lblAppTitle;
        private Label                lblAppSubtitle;
        private Panel                panelBody;
        private Panel                pnlCardInput;
        private Label                lblSectionInput;
        private Label                lblInputPath;
        private TextBox              txtInputPath;
        private Button               btnBrowseInput;
        private Label                lblFormatHint;
        private Label                lblAutoFormat;
        private ComboBox             cmbInputFormat;
        private Panel                pnlGap1;
        private Panel                pnlCardOutput;
        private Label                lblSectionOutput;
        private Label                lblOutputFormat;
        private ComboBox             cmbOutputFormat;
        private Label                lblOutputPath;
        private TextBox              txtOutputPath;
        private Button               btnBrowseOutput;
        private Panel                pnlGap2;
        private Button               btnConvert;
        private Panel                pnlFillRest;

        private StatusStrip            statusStrip;
        private ToolStripStatusLabel   lblStatus;
        private ToolStripProgressBar   statusProgress;
    }
}

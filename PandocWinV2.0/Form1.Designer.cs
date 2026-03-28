namespace PandocWinV2._0
{
    partial class Form1
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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Form1));
            menuStrip = new MenuStrip();
            menuHelp = new ToolStripMenuItem();
            menuCheckDeps = new ToolStripMenuItem();
            menuSeparator = new ToolStripSeparator();
            menuAbout = new ToolStripMenuItem();
            grpInput = new GroupBox();
            lblInputPath = new Label();
            txtInputPath = new TextBox();
            btnBrowseInput = new Button();
            lblFormatHint = new Label();
            lblAutoFormat = new Label();
            cmbInputFormat = new ComboBox();
            grpOutput = new GroupBox();
            lblOutputFormat = new Label();
            cmbOutputFormat = new ComboBox();
            lblOutputPath = new Label();
            txtOutputPath = new TextBox();
            btnBrowseOutput = new Button();
            btnConvert = new Button();
            statusStrip = new StatusStrip();
            lblStatus = new ToolStripStatusLabel();
            menuStrip.SuspendLayout();
            grpInput.SuspendLayout();
            grpOutput.SuspendLayout();
            statusStrip.SuspendLayout();
            SuspendLayout();
            // 
            // menuStrip
            // 
            menuStrip.Items.AddRange(new ToolStripItem[] { menuHelp });
            menuStrip.Location = new Point(0, 0);
            menuStrip.Name = "menuStrip";
            menuStrip.Size = new Size(602, 24);
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
            menuCheckDeps.Size = new Size(32, 19);
            menuCheckDeps.Text = "의존성 확인(&D)...";
            menuCheckDeps.Click += MenuCheckDeps_Click;
            // 
            // menuSeparator
            // 
            menuSeparator.Name = "menuSeparator";
            menuSeparator.Size = new Size(6, 6);
            // 
            // menuAbout
            // 
            menuAbout.Name = "menuAbout";
            menuAbout.Size = new Size(32, 19);
            menuAbout.Text = "정보(&A)...";
            menuAbout.Click += MenuAbout_Click;
            // 
            // grpInput
            // 
            grpInput.Controls.Add(lblInputPath);
            grpInput.Controls.Add(txtInputPath);
            grpInput.Controls.Add(btnBrowseInput);
            grpInput.Controls.Add(lblFormatHint);
            grpInput.Controls.Add(lblAutoFormat);
            grpInput.Controls.Add(cmbInputFormat);
            grpInput.Location = new Point(10, 36);
            grpInput.Name = "grpInput";
            grpInput.Size = new Size(575, 100);
            grpInput.TabIndex = 1;
            grpInput.TabStop = false;
            grpInput.Text = "입력 파일";
            // 
            // lblInputPath
            // 
            lblInputPath.Location = new Point(10, 28);
            lblInputPath.Name = "lblInputPath";
            lblInputPath.Size = new Size(35, 23);
            lblInputPath.TabIndex = 0;
            lblInputPath.Text = "경로:";
            lblInputPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // txtInputPath
            // 
            txtInputPath.BackColor = SystemColors.Window;
            txtInputPath.Location = new Point(50, 26);
            txtInputPath.Name = "txtInputPath";
            txtInputPath.ReadOnly = true;
            txtInputPath.Size = new Size(425, 23);
            txtInputPath.TabIndex = 0;
            // 
            // btnBrowseInput
            // 
            btnBrowseInput.Location = new Point(482, 25);
            btnBrowseInput.Name = "btnBrowseInput";
            btnBrowseInput.Size = new Size(82, 25);
            btnBrowseInput.TabIndex = 1;
            btnBrowseInput.Text = "찾아보기...";
            btnBrowseInput.Click += BtnBrowseInput_Click;
            // 
            // lblFormatHint
            // 
            lblFormatHint.Location = new Point(10, 62);
            lblFormatHint.Name = "lblFormatHint";
            lblFormatHint.Size = new Size(35, 23);
            lblFormatHint.TabIndex = 2;
            lblFormatHint.Text = "형식:";
            lblFormatHint.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // lblAutoFormat
            // 
            lblAutoFormat.ForeColor = Color.Gray;
            lblAutoFormat.Location = new Point(50, 62);
            lblAutoFormat.Name = "lblAutoFormat";
            lblAutoFormat.Size = new Size(185, 23);
            lblAutoFormat.TabIndex = 3;
            lblAutoFormat.Text = "자동 감지";
            lblAutoFormat.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // cmbInputFormat
            // 
            cmbInputFormat.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbInputFormat.Location = new Point(242, 60);
            cmbInputFormat.Name = "cmbInputFormat";
            cmbInputFormat.Size = new Size(140, 23);
            cmbInputFormat.TabIndex = 2;
            // 
            // grpOutput
            // 
            grpOutput.Controls.Add(lblOutputFormat);
            grpOutput.Controls.Add(cmbOutputFormat);
            grpOutput.Controls.Add(lblOutputPath);
            grpOutput.Controls.Add(txtOutputPath);
            grpOutput.Controls.Add(btnBrowseOutput);
            grpOutput.Location = new Point(10, 146);
            grpOutput.Name = "grpOutput";
            grpOutput.Size = new Size(575, 98);
            grpOutput.TabIndex = 2;
            grpOutput.TabStop = false;
            grpOutput.Text = "출력 설정";
            // 
            // lblOutputFormat
            // 
            lblOutputFormat.Location = new Point(10, 28);
            lblOutputFormat.Name = "lblOutputFormat";
            lblOutputFormat.Size = new Size(65, 23);
            lblOutputFormat.TabIndex = 0;
            lblOutputFormat.Text = "출력 형식:";
            lblOutputFormat.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // cmbOutputFormat
            // 
            cmbOutputFormat.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbOutputFormat.Location = new Point(80, 26);
            cmbOutputFormat.Name = "cmbOutputFormat";
            cmbOutputFormat.Size = new Size(180, 23);
            cmbOutputFormat.TabIndex = 3;
            // 
            // lblOutputPath
            // 
            lblOutputPath.Location = new Point(10, 62);
            lblOutputPath.Name = "lblOutputPath";
            lblOutputPath.Size = new Size(65, 23);
            lblOutputPath.TabIndex = 4;
            lblOutputPath.Text = "저장 위치:";
            lblOutputPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // txtOutputPath
            // 
            txtOutputPath.Location = new Point(80, 60);
            txtOutputPath.Name = "txtOutputPath";
            txtOutputPath.Size = new Size(395, 23);
            txtOutputPath.TabIndex = 4;
            // 
            // btnBrowseOutput
            // 
            btnBrowseOutput.Location = new Point(482, 59);
            btnBrowseOutput.Name = "btnBrowseOutput";
            btnBrowseOutput.Size = new Size(82, 25);
            btnBrowseOutput.TabIndex = 5;
            btnBrowseOutput.Text = "찾아보기...";
            btnBrowseOutput.Click += BtnBrowseOutput_Click;
            // 
            // btnConvert
            // 
            btnConvert.BackColor = Color.FromArgb(0, 120, 215);
            btnConvert.FlatAppearance.BorderSize = 0;
            btnConvert.FlatStyle = FlatStyle.Flat;
            btnConvert.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            btnConvert.ForeColor = Color.White;
            btnConvert.Location = new Point(10, 256);
            btnConvert.Name = "btnConvert";
            btnConvert.Size = new Size(575, 38);
            btnConvert.TabIndex = 6;
            btnConvert.Text = "변환 시작";
            btnConvert.UseVisualStyleBackColor = false;
            btnConvert.Click += BtnConvert_Click;
            // 
            // statusStrip
            // 
            statusStrip.Items.AddRange(new ToolStripItem[] { lblStatus });
            statusStrip.Location = new Point(0, 403);
            statusStrip.Name = "statusStrip";
            statusStrip.Size = new Size(602, 22);
            statusStrip.SizingGrip = false;
            statusStrip.TabIndex = 7;
            // 
            // lblStatus
            // 
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(587, 17);
            lblStatus.Spring = true;
            lblStatus.Text = "준비";
            lblStatus.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // Form1
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(602, 425);
            Controls.Add(menuStrip);
            Controls.Add(grpInput);
            Controls.Add(grpOutput);
            Controls.Add(btnConvert);
            Controls.Add(statusStrip);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuStrip;
            MaximumSize = new Size(618, 464);
            MinimumSize = new Size(618, 464);
            Name = "Form1";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Pandoc 파일 변환기";
            Load += Form1_Load;
            menuStrip.ResumeLayout(false);
            menuStrip.PerformLayout();
            grpInput.ResumeLayout(false);
            grpInput.PerformLayout();
            grpOutput.ResumeLayout(false);
            grpOutput.PerformLayout();
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

        private GroupBox             grpInput;
        private Label                lblInputPath;
        private TextBox              txtInputPath;
        private Button               btnBrowseInput;
        private Label                lblFormatHint;
        private Label                lblAutoFormat;
        private ComboBox             cmbInputFormat;

        private GroupBox             grpOutput;
        private Label                lblOutputFormat;
        private ComboBox             cmbOutputFormat;
        private Label                lblOutputPath;
        private TextBox              txtOutputPath;
        private Button               btnBrowseOutput;

        private Button               btnConvert;
        private StatusStrip          statusStrip;
        private ToolStripStatusLabel lblStatus;
    }
}

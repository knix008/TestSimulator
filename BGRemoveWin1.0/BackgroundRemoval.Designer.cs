namespace BGRemoveWin1._0
{
    partial class BackgroundRemoval
    {
        private System.ComponentModel.IContainer components = null;

        // Controls
        private Panel              pnlToolbar;
        private Button             btnOpenImage;
        private Button             btnLoadModel;
        private Button             btnRemoveBg;
        private Button             btnSave;
        private Button             btnCancelDownload;
        private Button             btnDeleteModel;
        private Label              lblModelStatus;
        private TableLayoutPanel   tblMain;
        private Panel              pnlInputOuter;
        private Label              lblInputTitle;
        private ZoomableImagePanel picInput;
        private Panel              pnlOutputOuter;
        private Label              lblOutputTitle;
        private ZoomableImagePanel pnlOutputCanvas;
        private StatusStrip        statusStrip;
        private ToolStripStatusLabel lblStatus;
        private ToolStripProgressBar progressBar;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(BackgroundRemoval));
            pnlToolbar = new Panel();
            btnOpenImage = new Button();
            btnLoadModel = new Button();
            btnRemoveBg = new Button();
            btnSave = new Button();
            btnCancelDownload = new Button();
            btnDeleteModel = new Button();
            lblModelStatus = new Label();
            tblMain = new TableLayoutPanel();
            pnlInputOuter = new Panel();
            picInput = new ZoomableImagePanel();
            lblInputTitle = new Label();
            pnlOutputOuter = new Panel();
            pnlOutputCanvas = new ZoomableImagePanel();
            lblOutputTitle = new Label();
            statusStrip = new StatusStrip();
            lblStatus = new ToolStripStatusLabel();
            progressBar = new ToolStripProgressBar();
            pnlToolbar.SuspendLayout();
            tblMain.SuspendLayout();
            pnlInputOuter.SuspendLayout();
            pnlOutputOuter.SuspendLayout();
            statusStrip.SuspendLayout();
            SuspendLayout();
            // 
            // pnlToolbar
            // 
            pnlToolbar.BackColor = Color.FromArgb(50, 50, 60);
            pnlToolbar.Controls.Add(btnOpenImage);
            pnlToolbar.Controls.Add(btnLoadModel);
            pnlToolbar.Controls.Add(btnRemoveBg);
            pnlToolbar.Controls.Add(btnSave);
            pnlToolbar.Controls.Add(btnCancelDownload);
            pnlToolbar.Controls.Add(btnDeleteModel);
            pnlToolbar.Controls.Add(lblModelStatus);
            pnlToolbar.Dock = DockStyle.Top;
            pnlToolbar.Location = new Point(0, 0);
            pnlToolbar.Name = "pnlToolbar";
            pnlToolbar.Padding = new Padding(10, 8, 10, 8);
            pnlToolbar.Size = new Size(1200, 56);
            pnlToolbar.TabIndex = 1;
            //
            // btnOpenImage
            //
            SetupToolbarButton(btnOpenImage,      "이미지 열기",   0,   Color.FromArgb(70, 130, 180));
            btnOpenImage.Name     = "btnOpenImage";
            btnOpenImage.TabIndex = 0;
            //
            // btnLoadModel
            //
            SetupToolbarButton(btnLoadModel,      "모델 로드",     140, Color.FromArgb(100, 149, 237));
            btnLoadModel.Name     = "btnLoadModel";
            btnLoadModel.TabIndex = 1;
            //
            // btnRemoveBg
            //
            SetupToolbarButton(btnRemoveBg,       "배경 제거",     280, Color.FromArgb(60, 179, 113));
            btnRemoveBg.Enabled   = false;
            btnRemoveBg.Name      = "btnRemoveBg";
            btnRemoveBg.TabIndex  = 2;
            //
            // btnSave
            //
            SetupToolbarButton(btnSave,           "결과 저장",     420, Color.FromArgb(210, 105, 30));
            btnSave.Enabled   = false;
            btnSave.Name      = "btnSave";
            btnSave.TabIndex  = 3;
            //
            // btnCancelDownload
            //
            SetupToolbarButton(btnCancelDownload, "다운로드 취소", 560, Color.FromArgb(180, 60, 60));
            btnCancelDownload.Name     = "btnCancelDownload";
            btnCancelDownload.TabIndex = 4;
            btnCancelDownload.Visible  = false;
            //
            // btnDeleteModel
            //
            SetupToolbarButton(btnDeleteModel,    "모델 삭제",     560, Color.FromArgb(160, 50, 50));
            btnDeleteModel.Name     = "btnDeleteModel";
            btnDeleteModel.TabIndex = 5;
            btnDeleteModel.Visible  = false;
            // 
            // lblModelStatus
            // 
            lblModelStatus.Font = new Font("Segoe UI", 9F);
            lblModelStatus.ForeColor = Color.FromArgb(180, 180, 180);
            lblModelStatus.Location = new Point(700, 8);
            lblModelStatus.Name = "lblModelStatus";
            lblModelStatus.Size = new Size(330, 40);
            lblModelStatus.TabIndex = 6;
            lblModelStatus.Text = "모델 미로드 — ONNX 모델 파일(.onnx)을 로드하세요";
            lblModelStatus.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // tblMain
            // 
            tblMain.BackColor = Color.FromArgb(235, 235, 240);
            tblMain.ColumnCount = 2;
            tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            tblMain.Controls.Add(pnlInputOuter, 0, 0);
            tblMain.Controls.Add(pnlOutputOuter, 1, 0);
            tblMain.Dock = DockStyle.Fill;
            tblMain.Location = new Point(0, 56);
            tblMain.Name = "tblMain";
            tblMain.Padding = new Padding(8);
            tblMain.RowCount = 1;
            tblMain.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            tblMain.Size = new Size(1200, 642);
            tblMain.TabIndex = 0;
            // 
            // pnlInputOuter
            // 
            pnlInputOuter.BackColor = Color.White;
            pnlInputOuter.Controls.Add(picInput);
            pnlInputOuter.Controls.Add(lblInputTitle);
            pnlInputOuter.Dock = DockStyle.Fill;
            pnlInputOuter.Location = new Point(12, 12);
            pnlInputOuter.Margin = new Padding(4);
            pnlInputOuter.Name = "pnlInputOuter";
            pnlInputOuter.Size = new Size(584, 618);
            pnlInputOuter.TabIndex = 0;
            // 
            // picInput
            // 
            picInput.AllowDrop = true;
            picInput.BackColor = Color.FromArgb(200, 205, 215);
            picInput.Dock = DockStyle.Fill;
            picInput.Location = new Point(0, 30);
            picInput.Name = "picInput";
            picInput.Size = new Size(584, 588);
            picInput.TabIndex = 0;
            // 
            // lblInputTitle
            // 
            lblInputTitle.BackColor = Color.FromArgb(220, 225, 235);
            lblInputTitle.Dock = DockStyle.Top;
            lblInputTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblInputTitle.ForeColor = Color.FromArgb(60, 60, 70);
            lblInputTitle.Location = new Point(0, 0);
            lblInputTitle.Name = "lblInputTitle";
            lblInputTitle.Size = new Size(584, 30);
            lblInputTitle.TabIndex = 1;
            lblInputTitle.Text = "원본 이미지  (더블클릭: 맞춤 / 휠: 확대축소 / 드래그: 이동)";
            lblInputTitle.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // pnlOutputOuter
            // 
            pnlOutputOuter.BackColor = Color.White;
            pnlOutputOuter.Controls.Add(pnlOutputCanvas);
            pnlOutputOuter.Controls.Add(lblOutputTitle);
            pnlOutputOuter.Dock = DockStyle.Fill;
            pnlOutputOuter.Location = new Point(604, 12);
            pnlOutputOuter.Margin = new Padding(4);
            pnlOutputOuter.Name = "pnlOutputOuter";
            pnlOutputOuter.Size = new Size(584, 618);
            pnlOutputOuter.TabIndex = 1;
            // 
            // pnlOutputCanvas
            // 
            pnlOutputCanvas.BackColor = Color.FromArgb(200, 205, 215);
            pnlOutputCanvas.Dock = DockStyle.Fill;
            pnlOutputCanvas.Location = new Point(0, 30);
            pnlOutputCanvas.Name = "pnlOutputCanvas";
            pnlOutputCanvas.Size = new Size(584, 588);
            pnlOutputCanvas.TabIndex = 0;
            // 
            // lblOutputTitle
            // 
            lblOutputTitle.BackColor = Color.FromArgb(220, 225, 235);
            lblOutputTitle.Dock = DockStyle.Top;
            lblOutputTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblOutputTitle.ForeColor = Color.FromArgb(60, 60, 70);
            lblOutputTitle.Location = new Point(0, 0);
            lblOutputTitle.Name = "lblOutputTitle";
            lblOutputTitle.Size = new Size(584, 30);
            lblOutputTitle.TabIndex = 1;
            lblOutputTitle.Text = "배경 제거 결과  (더블클릭: 맞춤 / 휠: 확대축소 / 드래그: 이동)";
            lblOutputTitle.TextAlign = ContentAlignment.MiddleCenter;
            // 
            // statusStrip
            // 
            statusStrip.BackColor = Color.FromArgb(230, 230, 235);
            statusStrip.Items.AddRange(new ToolStripItem[] { lblStatus, progressBar });
            statusStrip.Location = new Point(0, 698);
            statusStrip.Name = "statusStrip";
            statusStrip.Size = new Size(1200, 22);
            statusStrip.TabIndex = 2;
            // 
            // lblStatus
            // 
            lblStatus.Name = "lblStatus";
            lblStatus.Size = new Size(31, 17);
            lblStatus.Text = "준비";
            // 
            // progressBar
            // 
            progressBar.Name = "progressBar";
            progressBar.Size = new Size(100, 16);
            progressBar.Visible = false;
            // 
            // BackgroundRemoval
            // 
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(245, 245, 245);
            ClientSize = new Size(1200, 720);
            Controls.Add(tblMain);
            Controls.Add(pnlToolbar);
            Controls.Add(statusStrip);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MinimumSize = new Size(900, 600);
            Name = "BackgroundRemoval";
            Text = "Background Removal V1.0";
            pnlToolbar.ResumeLayout(false);
            tblMain.ResumeLayout(false);
            pnlInputOuter.ResumeLayout(false);
            pnlOutputOuter.ResumeLayout(false);
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }

        private static void SetupToolbarButton(Button btn, string text, int left, Color backColor)
        {
            btn.Text      = text;
            btn.Location  = new Point(left + 10, 8);
            btn.Size      = new Size(120, 38);
            btn.FlatStyle = FlatStyle.Flat;
            btn.BackColor = backColor;
            btn.ForeColor = Color.White;
            btn.Font      = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btn.FlatAppearance.BorderSize         = 0;
            btn.FlatAppearance.MouseOverBackColor = ControlPaint.Light(backColor, 0.3f);
            btn.Cursor = Cursors.Hand;
        }
    }
}

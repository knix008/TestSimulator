namespace RemBGWin1._0
{
    partial class RemBG
    {
        private System.ComponentModel.IContainer components = null;

        private Panel                pnlToolbar;
        private Button               btnOpen;
        private Button               btnModel;
        private Button               btnRemove;
        private Button               btnSave;
        private Button               btnCancel;
        private Button               btnDelModel;
        private Label                lblModelStatus;
        private TableLayoutPanel     tblMain;
        private Panel                pnlInputOuter;
        private Label                lblInputTitle;
        private ZoomableImagePanel   panelInput;
        private Panel                pnlOutputOuter;
        private Label                lblOutputTitle;
        private ZoomableImagePanel   panelOutput;
        private StatusStrip          statusStrip;
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
            System.ComponentModel.ComponentResourceManager resources =
                new System.ComponentModel.ComponentResourceManager(typeof(RemBG));

            this.components    = new System.ComponentModel.Container();
            this.pnlToolbar    = new System.Windows.Forms.Panel();
            this.btnOpen       = new System.Windows.Forms.Button();
            this.btnModel      = new System.Windows.Forms.Button();
            this.btnRemove     = new System.Windows.Forms.Button();
            this.btnSave       = new System.Windows.Forms.Button();
            this.btnCancel     = new System.Windows.Forms.Button();
            this.btnDelModel   = new System.Windows.Forms.Button();
            this.lblModelStatus = new System.Windows.Forms.Label();
            this.tblMain       = new System.Windows.Forms.TableLayoutPanel();
            this.pnlInputOuter  = new System.Windows.Forms.Panel();
            this.lblInputTitle  = new System.Windows.Forms.Label();
            this.panelInput     = new ZoomableImagePanel();
            this.pnlOutputOuter = new System.Windows.Forms.Panel();
            this.lblOutputTitle = new System.Windows.Forms.Label();
            this.panelOutput    = new ZoomableImagePanel();
            this.statusStrip   = new System.Windows.Forms.StatusStrip();
            this.lblStatus     = new System.Windows.Forms.ToolStripStatusLabel();
            this.progressBar   = new System.Windows.Forms.ToolStripProgressBar();

            this.pnlToolbar.SuspendLayout();
            this.tblMain.SuspendLayout();
            this.pnlInputOuter.SuspendLayout();
            this.pnlOutputOuter.SuspendLayout();
            this.statusStrip.SuspendLayout();
            this.SuspendLayout();

            // ── pnlToolbar ───────────────────────────────────────────────
            this.pnlToolbar.BackColor = System.Drawing.Color.FromArgb(45, 45, 55);
            this.pnlToolbar.Controls.Add(this.lblModelStatus);
            this.pnlToolbar.Controls.Add(this.btnDelModel);
            this.pnlToolbar.Controls.Add(this.btnCancel);
            this.pnlToolbar.Controls.Add(this.btnSave);
            this.pnlToolbar.Controls.Add(this.btnRemove);
            this.pnlToolbar.Controls.Add(this.btnModel);
            this.pnlToolbar.Controls.Add(this.btnOpen);
            this.pnlToolbar.Dock     = System.Windows.Forms.DockStyle.Top;
            this.pnlToolbar.Location = new System.Drawing.Point(0, 0);
            this.pnlToolbar.Name     = "pnlToolbar";
            this.pnlToolbar.Padding  = new System.Windows.Forms.Padding(10, 8, 10, 8);
            this.pnlToolbar.Size     = new System.Drawing.Size(1200, 56);
            this.pnlToolbar.TabIndex = 0;

            // ── btnOpen ──────────────────────────────────────────────────
            this.btnOpen.BackColor = System.Drawing.Color.FromArgb(60, 120, 180);
            this.btnOpen.Cursor    = System.Windows.Forms.Cursors.Hand;
            this.btnOpen.FlatAppearance.BorderSize = 0;
            this.btnOpen.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(107, 159, 213);
            this.btnOpen.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnOpen.Font      = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.btnOpen.ForeColor = System.Drawing.Color.White;
            this.btnOpen.Location  = new System.Drawing.Point(20, 8);
            this.btnOpen.Name      = "btnOpen";
            this.btnOpen.Size      = new System.Drawing.Size(120, 38);
            this.btnOpen.TabIndex  = 0;
            this.btnOpen.Text      = "이미지 열기";

            // ── btnModel ─────────────────────────────────────────────────
            this.btnModel.BackColor = System.Drawing.Color.FromArgb(90, 140, 220);
            this.btnModel.Cursor    = System.Windows.Forms.Cursors.Hand;
            this.btnModel.FlatAppearance.BorderSize = 0;
            this.btnModel.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(133, 178, 231);
            this.btnModel.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnModel.Font      = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.btnModel.ForeColor = System.Drawing.Color.White;
            this.btnModel.Location  = new System.Drawing.Point(160, 8);
            this.btnModel.Name      = "btnModel";
            this.btnModel.Size      = new System.Drawing.Size(120, 38);
            this.btnModel.TabIndex  = 1;
            this.btnModel.Text      = "모델 로드";

            // ── btnRemove ────────────────────────────────────────────────
            this.btnRemove.BackColor = System.Drawing.Color.FromArgb(50, 165, 100);
            this.btnRemove.Cursor    = System.Windows.Forms.Cursors.Hand;
            this.btnRemove.Enabled   = false;
            this.btnRemove.FlatAppearance.BorderSize = 0;
            this.btnRemove.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(97, 195, 142);
            this.btnRemove.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnRemove.Font      = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.btnRemove.ForeColor = System.Drawing.Color.White;
            this.btnRemove.Location  = new System.Drawing.Point(300, 8);
            this.btnRemove.Name      = "btnRemove";
            this.btnRemove.Size      = new System.Drawing.Size(120, 38);
            this.btnRemove.TabIndex  = 2;
            this.btnRemove.Text      = "배경 제거";

            // ── btnSave ──────────────────────────────────────────────────
            this.btnSave.BackColor = System.Drawing.Color.FromArgb(200, 100, 30);
            this.btnSave.Cursor    = System.Windows.Forms.Cursors.Hand;
            this.btnSave.Enabled   = false;
            this.btnSave.FlatAppearance.BorderSize = 0;
            this.btnSave.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(224, 145, 80);
            this.btnSave.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnSave.Font      = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.btnSave.ForeColor = System.Drawing.Color.White;
            this.btnSave.Location  = new System.Drawing.Point(440, 8);
            this.btnSave.Name      = "btnSave";
            this.btnSave.Size      = new System.Drawing.Size(120, 38);
            this.btnSave.TabIndex  = 3;
            this.btnSave.Text      = "결과 저장";

            // ── btnCancel ────────────────────────────────────────────────
            this.btnCancel.BackColor = System.Drawing.Color.FromArgb(170, 55, 55);
            this.btnCancel.Cursor    = System.Windows.Forms.Cursors.Hand;
            this.btnCancel.FlatAppearance.BorderSize = 0;
            this.btnCancel.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(200, 100, 100);
            this.btnCancel.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnCancel.Font      = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.btnCancel.ForeColor = System.Drawing.Color.White;
            this.btnCancel.Location  = new System.Drawing.Point(580, 8);
            this.btnCancel.Name      = "btnCancel";
            this.btnCancel.Size      = new System.Drawing.Size(120, 38);
            this.btnCancel.TabIndex  = 4;
            this.btnCancel.Text      = "다운로드 취소";
            this.btnCancel.Visible   = false;

            // ── btnDelModel ──────────────────────────────────────────────
            this.btnDelModel.BackColor = System.Drawing.Color.FromArgb(150, 45, 45);
            this.btnDelModel.Cursor    = System.Windows.Forms.Cursors.Hand;
            this.btnDelModel.FlatAppearance.BorderSize = 0;
            this.btnDelModel.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(190, 90, 90);
            this.btnDelModel.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnDelModel.Font      = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.btnDelModel.ForeColor = System.Drawing.Color.White;
            this.btnDelModel.Location  = new System.Drawing.Point(580, 8);
            this.btnDelModel.Name      = "btnDelModel";
            this.btnDelModel.Size      = new System.Drawing.Size(120, 38);
            this.btnDelModel.TabIndex  = 5;
            this.btnDelModel.Text      = "모델 삭제";
            this.btnDelModel.Visible   = false;

            // ── lblModelStatus ───────────────────────────────────────────
            this.lblModelStatus.AutoSize  = false;
            this.lblModelStatus.Font      = new System.Drawing.Font("Segoe UI", 9F);
            this.lblModelStatus.ForeColor = System.Drawing.Color.FromArgb(170, 170, 170);
            this.lblModelStatus.Location  = new System.Drawing.Point(720, 8);
            this.lblModelStatus.Name      = "lblModelStatus";
            this.lblModelStatus.Size      = new System.Drawing.Size(460, 40);
            this.lblModelStatus.TabIndex  = 6;
            this.lblModelStatus.Text      = "모델 미로드 — ONNX 모델 파일(.onnx)을 로드하세요";
            this.lblModelStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            // ── tblMain ──────────────────────────────────────────────────
            this.tblMain.BackColor  = System.Drawing.Color.FromArgb(230, 232, 238);
            this.tblMain.ColumnCount = 2;
            this.tblMain.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
            this.tblMain.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 50F));
            this.tblMain.Controls.Add(this.pnlInputOuter,  0, 0);
            this.tblMain.Controls.Add(this.pnlOutputOuter, 1, 0);
            this.tblMain.Dock      = System.Windows.Forms.DockStyle.Fill;
            this.tblMain.Location  = new System.Drawing.Point(0, 56);
            this.tblMain.Name      = "tblMain";
            this.tblMain.Padding   = new System.Windows.Forms.Padding(8);
            this.tblMain.RowCount  = 1;
            this.tblMain.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Percent, 100F));
            this.tblMain.Size      = new System.Drawing.Size(1200, 642);
            this.tblMain.TabIndex  = 1;

            // ── pnlInputOuter ────────────────────────────────────────────
            this.pnlInputOuter.BackColor = System.Drawing.Color.White;
            this.pnlInputOuter.Controls.Add(this.panelInput);
            this.pnlInputOuter.Controls.Add(this.lblInputTitle);
            this.pnlInputOuter.Dock     = System.Windows.Forms.DockStyle.Fill;
            this.pnlInputOuter.Location = new System.Drawing.Point(12, 12);
            this.pnlInputOuter.Margin   = new System.Windows.Forms.Padding(4);
            this.pnlInputOuter.Name     = "pnlInputOuter";
            this.pnlInputOuter.Size     = new System.Drawing.Size(580, 618);
            this.pnlInputOuter.TabIndex = 0;

            // ── lblInputTitle ────────────────────────────────────────────
            this.lblInputTitle.BackColor  = System.Drawing.Color.FromArgb(215, 220, 232);
            this.lblInputTitle.Dock       = System.Windows.Forms.DockStyle.Top;
            this.lblInputTitle.Font       = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblInputTitle.ForeColor  = System.Drawing.Color.FromArgb(50, 55, 70);
            this.lblInputTitle.Location   = new System.Drawing.Point(0, 0);
            this.lblInputTitle.Name       = "lblInputTitle";
            this.lblInputTitle.Size       = new System.Drawing.Size(580, 28);
            this.lblInputTitle.TabIndex   = 1;
            this.lblInputTitle.Text       = "원본 이미지   (더블클릭: 맞춤 / 휠: 확대·축소 / 드래그: 이동)";
            this.lblInputTitle.TextAlign  = System.Drawing.ContentAlignment.MiddleCenter;

            // ── panelInput ───────────────────────────────────────────────
            this.panelInput.AllowDrop  = true;
            this.panelInput.BackColor  = System.Drawing.Color.FromArgb(195, 200, 212);
            this.panelInput.Dock       = System.Windows.Forms.DockStyle.Fill;
            this.panelInput.Location   = new System.Drawing.Point(0, 28);
            this.panelInput.Name       = "panelInput";
            this.panelInput.Size       = new System.Drawing.Size(580, 590);
            this.panelInput.TabIndex   = 0;

            // ── pnlOutputOuter ───────────────────────────────────────────
            this.pnlOutputOuter.BackColor = System.Drawing.Color.White;
            this.pnlOutputOuter.Controls.Add(this.panelOutput);
            this.pnlOutputOuter.Controls.Add(this.lblOutputTitle);
            this.pnlOutputOuter.Dock     = System.Windows.Forms.DockStyle.Fill;
            this.pnlOutputOuter.Location = new System.Drawing.Point(608, 12);
            this.pnlOutputOuter.Margin   = new System.Windows.Forms.Padding(4);
            this.pnlOutputOuter.Name     = "pnlOutputOuter";
            this.pnlOutputOuter.Size     = new System.Drawing.Size(580, 618);
            this.pnlOutputOuter.TabIndex = 1;

            // ── lblOutputTitle ───────────────────────────────────────────
            this.lblOutputTitle.BackColor  = System.Drawing.Color.FromArgb(215, 220, 232);
            this.lblOutputTitle.Dock       = System.Windows.Forms.DockStyle.Top;
            this.lblOutputTitle.Font       = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblOutputTitle.ForeColor  = System.Drawing.Color.FromArgb(50, 55, 70);
            this.lblOutputTitle.Location   = new System.Drawing.Point(0, 0);
            this.lblOutputTitle.Name       = "lblOutputTitle";
            this.lblOutputTitle.Size       = new System.Drawing.Size(580, 28);
            this.lblOutputTitle.TabIndex   = 1;
            this.lblOutputTitle.Text       = "배경 제거 결과   (더블클릭: 맞춤 / 휠: 확대·축소 / 드래그: 이동)";
            this.lblOutputTitle.TextAlign  = System.Drawing.ContentAlignment.MiddleCenter;

            // ── panelOutput ──────────────────────────────────────────────
            this.panelOutput.BackColor = System.Drawing.Color.FromArgb(195, 200, 212);
            this.panelOutput.Dock      = System.Windows.Forms.DockStyle.Fill;
            this.panelOutput.Location  = new System.Drawing.Point(0, 28);
            this.panelOutput.Name      = "panelOutput";
            this.panelOutput.Size      = new System.Drawing.Size(580, 590);
            this.panelOutput.TabIndex  = 0;

            // ── statusStrip ──────────────────────────────────────────────
            this.statusStrip.BackColor = System.Drawing.Color.FromArgb(225, 225, 232);
            this.statusStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.lblStatus,
                this.progressBar });
            this.statusStrip.Location = new System.Drawing.Point(0, 698);
            this.statusStrip.Name     = "statusStrip";
            this.statusStrip.Size     = new System.Drawing.Size(1200, 22);
            this.statusStrip.TabIndex = 2;

            // ── lblStatus ────────────────────────────────────────────────
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(29, 17);
            this.lblStatus.Text = "준비";

            // ── progressBar ──────────────────────────────────────────────
            this.progressBar.Name    = "progressBar";
            this.progressBar.Size    = new System.Drawing.Size(120, 16);
            this.progressBar.Visible = false;

            // ── Form ─────────────────────────────────────────────────────
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode       = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor           = System.Drawing.Color.FromArgb(245, 245, 248);
            this.ClientSize          = new System.Drawing.Size(1200, 720);
            this.Controls.Add(this.tblMain);
            this.Controls.Add(this.pnlToolbar);
            this.Controls.Add(this.statusStrip);
            this.Icon        = (System.Drawing.Icon)resources.GetObject("$this.Icon");
            this.MinimumSize = new System.Drawing.Size(900, 580);
            this.Name        = "RemBG";
            this.Text        = "RemBG  —  Background Removal";

            this.pnlToolbar.ResumeLayout(false);
            this.tblMain.ResumeLayout(false);
            this.pnlInputOuter.ResumeLayout(false);
            this.pnlOutputOuter.ResumeLayout(false);
            this.statusStrip.ResumeLayout(false);
            this.statusStrip.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }
    }
}

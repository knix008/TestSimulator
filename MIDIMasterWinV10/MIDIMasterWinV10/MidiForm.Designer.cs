namespace MIDIMasterWinV10
{
    partial class MidiForm
    {
        private System.ComponentModel.IContainer components = null;

        // ── Menu ──────────────────────────────────────────────────────────────
        private System.Windows.Forms.MenuStrip menuStrip;
        private System.Windows.Forms.ToolStripMenuItem fileMenu;
        private System.Windows.Forms.ToolStripMenuItem openMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exportWavMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exportMp3MenuItem;
        private System.Windows.Forms.ToolStripSeparator menuSep1;
        private System.Windows.Forms.ToolStripMenuItem exitMenuItem;

        // ── Info bar (compact single row below menu) ──────────────────────────
        private System.Windows.Forms.Panel pnlInfo;
        private System.Windows.Forms.Label lblFileName;
        private System.Windows.Forms.Label lblTrackInfo;
        private System.Windows.Forms.Label lblNoteCount;

        // ── Sheet music (fills centre) ────────────────────────────────────────
        private System.Windows.Forms.Panel pnlSheet;
        private System.Windows.Forms.PictureBox picSheet;

        // ── Control panel (bottom, two rows) ─────────────────────────────────
        // Row 1 – position slider
        // Row 2 – transport buttons + instrument selector + tempo label
        private System.Windows.Forms.Panel pnlControls;
        private System.Windows.Forms.Label lblCurrentTime;
        private System.Windows.Forms.TrackBar trkPosition;
        private System.Windows.Forms.Label lblTotalTime;
        private System.Windows.Forms.Button btnPlay;
        private System.Windows.Forms.Button btnPause;
        private System.Windows.Forms.Button btnStop;
        private System.Windows.Forms.Label lblInstrument;
        private System.Windows.Forms.ComboBox cboInstrument;
        private System.Windows.Forms.Label lblTempo;
        private System.Windows.Forms.Label lblTempoValue;

        // ── Status bar ────────────────────────────────────────────────────────
        private System.Windows.Forms.StatusStrip statusStrip;
        private System.Windows.Forms.ToolStripStatusLabel lblStatus;
        private System.Windows.Forms.ToolStripProgressBar progressBar;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();

            // ── Instantiate ──────────────────────────────────────────────────
            this.menuStrip         = new System.Windows.Forms.MenuStrip();
            this.fileMenu          = new System.Windows.Forms.ToolStripMenuItem();
            this.openMenuItem      = new System.Windows.Forms.ToolStripMenuItem();
            this.exportWavMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.exportMp3MenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.menuSep1          = new System.Windows.Forms.ToolStripSeparator();
            this.exitMenuItem      = new System.Windows.Forms.ToolStripMenuItem();

            this.pnlInfo           = new System.Windows.Forms.Panel();
            this.lblFileName       = new System.Windows.Forms.Label();
            this.lblTrackInfo      = new System.Windows.Forms.Label();
            this.lblNoteCount      = new System.Windows.Forms.Label();

            this.pnlSheet          = new System.Windows.Forms.Panel();
            this.picSheet          = new System.Windows.Forms.PictureBox();

            this.pnlControls       = new System.Windows.Forms.Panel();
            this.lblCurrentTime    = new System.Windows.Forms.Label();
            this.trkPosition       = new System.Windows.Forms.TrackBar();
            this.lblTotalTime      = new System.Windows.Forms.Label();
            this.btnPlay           = new System.Windows.Forms.Button();
            this.btnPause          = new System.Windows.Forms.Button();
            this.btnStop           = new System.Windows.Forms.Button();
            this.lblInstrument     = new System.Windows.Forms.Label();
            this.cboInstrument     = new System.Windows.Forms.ComboBox();
            this.lblTempo          = new System.Windows.Forms.Label();
            this.lblTempoValue     = new System.Windows.Forms.Label();

            this.statusStrip       = new System.Windows.Forms.StatusStrip();
            this.lblStatus         = new System.Windows.Forms.ToolStripStatusLabel();
            this.progressBar       = new System.Windows.Forms.ToolStripProgressBar();

            // ── Suspend layouts ──────────────────────────────────────────────
            this.menuStrip.SuspendLayout();
            this.pnlInfo.SuspendLayout();
            this.pnlSheet.SuspendLayout();
            this.pnlControls.SuspendLayout();
            this.statusStrip.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)this.picSheet).BeginInit();
            ((System.ComponentModel.ISupportInitialize)this.trkPosition).BeginInit();
            this.SuspendLayout();

            // ── menuStrip ────────────────────────────────────────────────────
            this.menuStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.fileMenu });
            this.menuStrip.Location = new System.Drawing.Point(0, 0);
            this.menuStrip.Name = "menuStrip";
            this.menuStrip.Size = new System.Drawing.Size(1100, 24);
            this.menuStrip.TabIndex = 0;
            this.menuStrip.Text = "menuStrip";

            // ── fileMenu ─────────────────────────────────────────────────────
            this.fileMenu.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.openMenuItem,
                this.exportWavMenuItem,
                this.exportMp3MenuItem,
                this.menuSep1,
                this.exitMenuItem });
            this.fileMenu.Name = "fileMenu";
            this.fileMenu.Size = new System.Drawing.Size(60, 20);
            this.fileMenu.Text = "파일(&F)";

            // ── openMenuItem ─────────────────────────────────────────────────
            this.openMenuItem.Name = "openMenuItem";
            this.openMenuItem.ShortcutKeys = System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.O;
            this.openMenuItem.Size = new System.Drawing.Size(220, 22);
            this.openMenuItem.Text = "열기(&O)...";

            // ── exportWavMenuItem ────────────────────────────────────────────
            this.exportWavMenuItem.Enabled = false;
            this.exportWavMenuItem.Name = "exportWavMenuItem";
            this.exportWavMenuItem.Size = new System.Drawing.Size(220, 22);
            this.exportWavMenuItem.Text = "WAV로 내보내기(&W)...";

            // ── exportMp3MenuItem ────────────────────────────────────────────
            this.exportMp3MenuItem.Enabled = false;
            this.exportMp3MenuItem.Name = "exportMp3MenuItem";
            this.exportMp3MenuItem.Size = new System.Drawing.Size(220, 22);
            this.exportMp3MenuItem.Text = "MP3로 내보내기(&M)...";

            // ── menuSep1 ─────────────────────────────────────────────────────
            this.menuSep1.Name = "menuSep1";
            this.menuSep1.Size = new System.Drawing.Size(217, 6);

            // ── exitMenuItem ─────────────────────────────────────────────────
            this.exitMenuItem.Name = "exitMenuItem";
            this.exitMenuItem.ShortcutKeys = System.Windows.Forms.Keys.Alt | System.Windows.Forms.Keys.F4;
            this.exitMenuItem.Size = new System.Drawing.Size(220, 22);
            this.exitMenuItem.Text = "종료(&X)";

            // ── pnlInfo (compact single-row info bar) ────────────────────────
            this.pnlInfo.BackColor = System.Drawing.Color.FromArgb(232, 236, 245);
            this.pnlInfo.Controls.Add(this.lblNoteCount);
            this.pnlInfo.Controls.Add(this.lblTrackInfo);
            this.pnlInfo.Controls.Add(this.lblFileName);
            this.pnlInfo.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlInfo.Location = new System.Drawing.Point(0, 24);
            this.pnlInfo.Name = "pnlInfo";
            this.pnlInfo.Size = new System.Drawing.Size(1100, 30);
            this.pnlInfo.TabIndex = 1;

            // ── lblFileName ──────────────────────────────────────────────────
            this.lblFileName.AutoSize = true;
            this.lblFileName.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblFileName.Location = new System.Drawing.Point(8, 8);
            this.lblFileName.Name = "lblFileName";
            this.lblFileName.Size = new System.Drawing.Size(75, 15);
            this.lblFileName.TabIndex = 0;
            this.lblFileName.Text = "파일: (없음)";

            // ── lblTrackInfo ─────────────────────────────────────────────────
            this.lblTrackInfo.AutoSize = true;
            this.lblTrackInfo.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblTrackInfo.ForeColor = System.Drawing.Color.DimGray;
            this.lblTrackInfo.Location = new System.Drawing.Point(380, 8);
            this.lblTrackInfo.Name = "lblTrackInfo";
            this.lblTrackInfo.Size = new System.Drawing.Size(50, 15);
            this.lblTrackInfo.TabIndex = 1;
            this.lblTrackInfo.Text = "트랙: -";

            // ── lblNoteCount ─────────────────────────────────────────────────
            this.lblNoteCount.AutoSize = true;
            this.lblNoteCount.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblNoteCount.ForeColor = System.Drawing.Color.DimGray;
            this.lblNoteCount.Location = new System.Drawing.Point(660, 8);
            this.lblNoteCount.Name = "lblNoteCount";
            this.lblNoteCount.Size = new System.Drawing.Size(50, 15);
            this.lblNoteCount.TabIndex = 2;
            this.lblNoteCount.Text = "음표: -";

            // ── picSheet ─────────────────────────────────────────────────────
            // Width matches panel; Height is set at runtime by RebuildSheet().
            // No Dock=Fill so the PictureBox can be taller than the panel (enables scrolling).
            this.picSheet.BackColor = System.Drawing.Color.White;
            this.picSheet.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.picSheet.Location = new System.Drawing.Point(0, 0);
            this.picSheet.Name = "picSheet";
            this.picSheet.Size = new System.Drawing.Size(1100, 500);
            this.picSheet.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Normal;
            this.picSheet.TabIndex = 0;
            this.picSheet.TabStop = false;

            // ── pnlSheet ─────────────────────────────────────────────────────
            this.pnlSheet.AutoScroll = true;
            this.pnlSheet.BackColor = System.Drawing.Color.White;
            this.pnlSheet.Controls.Add(this.picSheet);
            this.pnlSheet.Dock = System.Windows.Forms.DockStyle.Fill;
            this.pnlSheet.Location = new System.Drawing.Point(0, 54);
            this.pnlSheet.Name = "pnlSheet";
            this.pnlSheet.Size = new System.Drawing.Size(1100, 461);
            this.pnlSheet.TabIndex = 2;

            // ── pnlControls (two-row control panel, docked to bottom) ─────────
            this.pnlControls.BackColor = System.Drawing.Color.FromArgb(245, 245, 250);
            this.pnlControls.Controls.Add(this.lblCurrentTime);
            this.pnlControls.Controls.Add(this.trkPosition);
            this.pnlControls.Controls.Add(this.lblTotalTime);
            this.pnlControls.Controls.Add(this.btnPlay);
            this.pnlControls.Controls.Add(this.btnPause);
            this.pnlControls.Controls.Add(this.btnStop);
            this.pnlControls.Controls.Add(this.lblInstrument);
            this.pnlControls.Controls.Add(this.cboInstrument);
            this.pnlControls.Controls.Add(this.lblTempo);
            this.pnlControls.Controls.Add(this.lblTempoValue);
            this.pnlControls.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.pnlControls.Location = new System.Drawing.Point(0, 515);
            this.pnlControls.Name = "pnlControls";
            this.pnlControls.Size = new System.Drawing.Size(1100, 110);
            this.pnlControls.TabIndex = 3;

            // Row 1 – time display + position slider ─────────────────────────

            // ── lblCurrentTime ───────────────────────────────────────────────
            this.lblCurrentTime.Anchor = System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Top;
            this.lblCurrentTime.AutoSize = true;
            this.lblCurrentTime.Font = new System.Drawing.Font("Consolas", 11F, System.Drawing.FontStyle.Bold);
            this.lblCurrentTime.ForeColor = System.Drawing.Color.DarkSlateGray;
            this.lblCurrentTime.Location = new System.Drawing.Point(8, 12);
            this.lblCurrentTime.Name = "lblCurrentTime";
            this.lblCurrentTime.Size = new System.Drawing.Size(88, 18);
            this.lblCurrentTime.TabIndex = 0;
            this.lblCurrentTime.Text = "00:00.00";

            // ── trkPosition ──────────────────────────────────────────────────
            this.trkPosition.Anchor = System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right | System.Windows.Forms.AnchorStyles.Top;
            this.trkPosition.Location = new System.Drawing.Point(104, 8);
            this.trkPosition.Maximum = 1000;
            this.trkPosition.Minimum = 0;
            this.trkPosition.Name = "trkPosition";
            this.trkPosition.Size = new System.Drawing.Size(876, 26);
            this.trkPosition.TabIndex = 1;
            this.trkPosition.TickStyle = System.Windows.Forms.TickStyle.None;
            this.trkPosition.Value = 0;

            // ── lblTotalTime ─────────────────────────────────────────────────
            this.lblTotalTime.Anchor = System.Windows.Forms.AnchorStyles.Right | System.Windows.Forms.AnchorStyles.Top;
            this.lblTotalTime.AutoSize = true;
            this.lblTotalTime.Font = new System.Drawing.Font("Consolas", 11F);
            this.lblTotalTime.ForeColor = System.Drawing.Color.DimGray;
            this.lblTotalTime.Location = new System.Drawing.Point(992, 12);
            this.lblTotalTime.Name = "lblTotalTime";
            this.lblTotalTime.Size = new System.Drawing.Size(88, 18);
            this.lblTotalTime.TabIndex = 2;
            this.lblTotalTime.Text = "00:00.00";

            // Row 2 – transport buttons + instrument + tempo ──────────────────

            // ── btnPlay ──────────────────────────────────────────────────────
            this.btnPlay.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.btnPlay.Location = new System.Drawing.Point(8, 58);
            this.btnPlay.Name = "btnPlay";
            this.btnPlay.Size = new System.Drawing.Size(100, 40);
            this.btnPlay.TabIndex = 3;
            this.btnPlay.Text = "▶  재생";
            this.btnPlay.UseVisualStyleBackColor = true;

            // ── btnPause ─────────────────────────────────────────────────────
            this.btnPause.Enabled = false;
            this.btnPause.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.btnPause.Location = new System.Drawing.Point(118, 58);
            this.btnPause.Name = "btnPause";
            this.btnPause.Size = new System.Drawing.Size(120, 40);
            this.btnPause.TabIndex = 4;
            this.btnPause.Text = "⏸  일시정지";
            this.btnPause.UseVisualStyleBackColor = true;

            // ── btnStop ──────────────────────────────────────────────────────
            this.btnStop.Enabled = false;
            this.btnStop.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.btnStop.Location = new System.Drawing.Point(248, 58);
            this.btnStop.Name = "btnStop";
            this.btnStop.Size = new System.Drawing.Size(100, 40);
            this.btnStop.TabIndex = 5;
            this.btnStop.Text = "⏹  정지";
            this.btnStop.UseVisualStyleBackColor = true;

            // ── lblInstrument ────────────────────────────────────────────────
            this.lblInstrument.AutoSize = true;
            this.lblInstrument.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblInstrument.Location = new System.Drawing.Point(364, 72);
            this.lblInstrument.Name = "lblInstrument";
            this.lblInstrument.Size = new System.Drawing.Size(32, 15);
            this.lblInstrument.TabIndex = 6;
            this.lblInstrument.Text = "악기:";

            // ── cboInstrument ────────────────────────────────────────────────
            this.cboInstrument.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboInstrument.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.cboInstrument.Location = new System.Drawing.Point(400, 69);
            this.cboInstrument.Name = "cboInstrument";
            this.cboInstrument.Size = new System.Drawing.Size(240, 23);
            this.cboInstrument.TabIndex = 7;

            // ── lblTempo ─────────────────────────────────────────────────────
            this.lblTempo.AutoSize = true;
            this.lblTempo.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblTempo.Location = new System.Drawing.Point(656, 72);
            this.lblTempo.Name = "lblTempo";
            this.lblTempo.Size = new System.Drawing.Size(34, 15);
            this.lblTempo.TabIndex = 8;
            this.lblTempo.Text = "템포:";

            // ── lblTempoValue ────────────────────────────────────────────────
            this.lblTempoValue.AutoSize = true;
            this.lblTempoValue.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblTempoValue.ForeColor = System.Drawing.Color.DarkSlateBlue;
            this.lblTempoValue.Location = new System.Drawing.Point(694, 72);
            this.lblTempoValue.Name = "lblTempoValue";
            this.lblTempoValue.Size = new System.Drawing.Size(36, 15);
            this.lblTempoValue.TabIndex = 9;
            this.lblTempoValue.Text = "100%";

            // ── statusStrip ──────────────────────────────────────────────────
            this.statusStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.lblStatus,
                this.progressBar });
            this.statusStrip.Location = new System.Drawing.Point(0, 625);
            this.statusStrip.Name = "statusStrip";
            this.statusStrip.Size = new System.Drawing.Size(1100, 22);
            this.statusStrip.TabIndex = 4;
            this.statusStrip.Text = "statusStrip";

            // ── lblStatus ────────────────────────────────────────────────────
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(934, 17);
            this.lblStatus.Spring = true;
            this.lblStatus.Text = "준비";
            this.lblStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            // ── progressBar ──────────────────────────────────────────────────
            this.progressBar.Name = "progressBar";
            this.progressBar.Size = new System.Drawing.Size(150, 16);
            this.progressBar.Visible = false;

            // ── MidiForm ─────────────────────────────────────────────────────
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1100, 647);
            this.Controls.Add(this.pnlSheet);
            this.Controls.Add(this.pnlControls);
            this.Controls.Add(this.pnlInfo);
            this.Controls.Add(this.menuStrip);
            this.Controls.Add(this.statusStrip);
            this.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.MainMenuStrip = this.menuStrip;
            this.MinimumSize = new System.Drawing.Size(800, 560);
            this.Name = "MidiForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "MIDI Master - MIDI 플레이어";

            // ── Resume layouts ────────────────────────────────────────────────
            this.menuStrip.ResumeLayout(false);
            this.menuStrip.PerformLayout();
            this.pnlInfo.ResumeLayout(false);
            this.pnlInfo.PerformLayout();
            this.pnlSheet.ResumeLayout(false);
            this.pnlControls.ResumeLayout(false);
            this.pnlControls.PerformLayout();
            this.statusStrip.ResumeLayout(false);
            this.statusStrip.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)this.picSheet).EndInit();
            ((System.ComponentModel.ISupportInitialize)this.trkPosition).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();
        }
    }
}

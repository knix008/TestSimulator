namespace MIDIMasterWinV10
{
    partial class MidiForm
    {
        private System.ComponentModel.IContainer components = null;

        // ── Menu ──────────────────────────────────
        private System.Windows.Forms.MenuStrip menuStrip;
        private System.Windows.Forms.ToolStripMenuItem fileMenu;
        private System.Windows.Forms.ToolStripMenuItem openMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exportWavMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exportMp3MenuItem;
        private System.Windows.Forms.ToolStripSeparator menuSep1;
        private System.Windows.Forms.ToolStripMenuItem exitMenuItem;

        // ── Toolbar ───────────────────────────────
        private System.Windows.Forms.ToolStrip toolStrip;
        private System.Windows.Forms.ToolStripButton btnPlay;
        private System.Windows.Forms.ToolStripButton btnPause;
        private System.Windows.Forms.ToolStripButton btnStop;
        private System.Windows.Forms.ToolStripSeparator toolSep1;
        private System.Windows.Forms.ToolStripLabel lblInstrument;
        private System.Windows.Forms.ToolStripComboBox cboInstrument;
        private System.Windows.Forms.ToolStripSeparator toolSep2;
        private System.Windows.Forms.ToolStripLabel lblTempo;
        private System.Windows.Forms.ToolStripLabel lblTempoValue;
        // trkTempo and trkTempoHost are created in MidiForm.cs (not designer-managed)

        // ── Sheet music ───────────────────────────
        private System.Windows.Forms.Panel pnlSheet;
        private System.Windows.Forms.PictureBox picSheet;

        // ── Playback controls ─────────────────────
        private System.Windows.Forms.Panel pnlControls;
        private System.Windows.Forms.TrackBar trkPosition;
        private System.Windows.Forms.Label lblCurrentTime;
        private System.Windows.Forms.Label lblTotalTime;

        // ── Info panel ────────────────────────────
        private System.Windows.Forms.Panel pnlInfo;
        private System.Windows.Forms.Label lblFileName;
        private System.Windows.Forms.Label lblTrackInfo;
        private System.Windows.Forms.Label lblNoteCount;

        // ── Status bar ────────────────────────────
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

            // ── Instantiate all controls ─────────────────────────────
            this.menuStrip        = new System.Windows.Forms.MenuStrip();
            this.fileMenu         = new System.Windows.Forms.ToolStripMenuItem();
            this.openMenuItem     = new System.Windows.Forms.ToolStripMenuItem();
            this.exportWavMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.exportMp3MenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.menuSep1         = new System.Windows.Forms.ToolStripSeparator();
            this.exitMenuItem     = new System.Windows.Forms.ToolStripMenuItem();

            this.toolStrip        = new System.Windows.Forms.ToolStrip();
            this.btnPlay          = new System.Windows.Forms.ToolStripButton();
            this.btnPause         = new System.Windows.Forms.ToolStripButton();
            this.btnStop          = new System.Windows.Forms.ToolStripButton();
            this.toolSep1         = new System.Windows.Forms.ToolStripSeparator();
            this.lblInstrument    = new System.Windows.Forms.ToolStripLabel();
            this.cboInstrument    = new System.Windows.Forms.ToolStripComboBox();
            this.toolSep2         = new System.Windows.Forms.ToolStripSeparator();
            this.lblTempo         = new System.Windows.Forms.ToolStripLabel();
            this.lblTempoValue    = new System.Windows.Forms.ToolStripLabel();

            this.pnlInfo          = new System.Windows.Forms.Panel();
            this.lblFileName      = new System.Windows.Forms.Label();
            this.lblTrackInfo     = new System.Windows.Forms.Label();
            this.lblNoteCount     = new System.Windows.Forms.Label();

            this.pnlSheet         = new System.Windows.Forms.Panel();
            this.picSheet         = new System.Windows.Forms.PictureBox();

            this.pnlControls      = new System.Windows.Forms.Panel();
            this.trkPosition      = new System.Windows.Forms.TrackBar();
            this.lblCurrentTime   = new System.Windows.Forms.Label();
            this.lblTotalTime     = new System.Windows.Forms.Label();

            this.statusStrip      = new System.Windows.Forms.StatusStrip();
            this.lblStatus        = new System.Windows.Forms.ToolStripStatusLabel();
            this.progressBar      = new System.Windows.Forms.ToolStripProgressBar();

            // Suspend layouts before setting properties
            this.menuStrip.SuspendLayout();
            this.toolStrip.SuspendLayout();
            this.pnlInfo.SuspendLayout();
            this.pnlSheet.SuspendLayout();
            this.pnlControls.SuspendLayout();
            this.statusStrip.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)this.picSheet).BeginInit();
            ((System.ComponentModel.ISupportInitialize)this.trkPosition).BeginInit();
            this.SuspendLayout();

            // ── menuStrip ───────────────────────────────────────────
            this.menuStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.fileMenu});
            this.menuStrip.Location = new System.Drawing.Point(0, 0);
            this.menuStrip.Name = "menuStrip";
            this.menuStrip.Size = new System.Drawing.Size(1000, 24);
            this.menuStrip.TabIndex = 0;
            this.menuStrip.Text = "menuStrip";

            // ── fileMenu ────────────────────────────────────────────
            this.fileMenu.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.openMenuItem,
                this.exportWavMenuItem,
                this.exportMp3MenuItem,
                this.menuSep1,
                this.exitMenuItem});
            this.fileMenu.Name = "fileMenu";
            this.fileMenu.Size = new System.Drawing.Size(60, 20);
            this.fileMenu.Text = "파일(&F)";

            // ── openMenuItem ─────────────────────────────────────────
            this.openMenuItem.Name = "openMenuItem";
            this.openMenuItem.ShortcutKeys = System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.O;
            this.openMenuItem.Size = new System.Drawing.Size(220, 22);
            this.openMenuItem.Text = "열기(&O)...";

            // ── exportWavMenuItem ────────────────────────────────────
            this.exportWavMenuItem.Enabled = false;
            this.exportWavMenuItem.Name = "exportWavMenuItem";
            this.exportWavMenuItem.Size = new System.Drawing.Size(220, 22);
            this.exportWavMenuItem.Text = "WAV로 내보내기(&W)...";

            // ── exportMp3MenuItem ────────────────────────────────────
            this.exportMp3MenuItem.Enabled = false;
            this.exportMp3MenuItem.Name = "exportMp3MenuItem";
            this.exportMp3MenuItem.Size = new System.Drawing.Size(220, 22);
            this.exportMp3MenuItem.Text = "MP3로 내보내기(&M)...";

            // ── menuSep1 ─────────────────────────────────────────────
            this.menuSep1.Name = "menuSep1";
            this.menuSep1.Size = new System.Drawing.Size(217, 6);

            // ── exitMenuItem ──────────────────────────────────────────
            this.exitMenuItem.Name = "exitMenuItem";
            this.exitMenuItem.ShortcutKeys = System.Windows.Forms.Keys.Alt | System.Windows.Forms.Keys.F4;
            this.exitMenuItem.Size = new System.Drawing.Size(220, 22);
            this.exitMenuItem.Text = "종료(&X)";

            // ── toolStrip ─────────────────────────────────────────────
            this.toolStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.btnPlay,
                this.btnPause,
                this.btnStop,
                this.toolSep1,
                this.lblInstrument,
                this.cboInstrument,
                this.toolSep2,
                this.lblTempo,
                this.lblTempoValue});
            this.toolStrip.Location = new System.Drawing.Point(0, 24);
            this.toolStrip.Name = "toolStrip";
            this.toolStrip.Size = new System.Drawing.Size(1000, 25);
            this.toolStrip.TabIndex = 1;
            this.toolStrip.Text = "toolStrip";

            // ── btnPlay ───────────────────────────────────────────────
            this.btnPlay.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnPlay.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.btnPlay.Name = "btnPlay";
            this.btnPlay.Size = new System.Drawing.Size(55, 22);
            this.btnPlay.Text = "▶ 재생";

            // ── btnPause ──────────────────────────────────────────────
            this.btnPause.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnPause.Enabled = false;
            this.btnPause.Name = "btnPause";
            this.btnPause.Size = new System.Drawing.Size(70, 22);
            this.btnPause.Text = "⏸ 일시정지";

            // ── btnStop ───────────────────────────────────────────────
            this.btnStop.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnStop.Enabled = false;
            this.btnStop.Name = "btnStop";
            this.btnStop.Size = new System.Drawing.Size(50, 22);
            this.btnStop.Text = "⏹ 정지";

            // ── toolSep1 ──────────────────────────────────────────────
            this.toolSep1.Name = "toolSep1";
            this.toolSep1.Size = new System.Drawing.Size(6, 25);

            // ── lblInstrument ─────────────────────────────────────────
            this.lblInstrument.Name = "lblInstrument";
            this.lblInstrument.Size = new System.Drawing.Size(35, 22);
            this.lblInstrument.Text = "악기: ";

            // ── cboInstrument ─────────────────────────────────────────
            this.cboInstrument.AutoSize = false;
            this.cboInstrument.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboInstrument.Name = "cboInstrument";
            this.cboInstrument.Size = new System.Drawing.Size(200, 23);

            // ── toolSep2 ──────────────────────────────────────────────
            this.toolSep2.Name = "toolSep2";
            this.toolSep2.Size = new System.Drawing.Size(6, 25);

            // ── lblTempo ──────────────────────────────────────────────
            this.lblTempo.Name = "lblTempo";
            this.lblTempo.Size = new System.Drawing.Size(35, 22);
            this.lblTempo.Text = "템포: ";

            // ── lblTempoValue ─────────────────────────────────────────
            this.lblTempoValue.Name = "lblTempoValue";
            this.lblTempoValue.Size = new System.Drawing.Size(38, 22);
            this.lblTempoValue.Text = "100%";

            // ── pnlInfo ───────────────────────────────────────────────
            this.pnlInfo.BackColor = System.Drawing.Color.FromArgb(240, 240, 245);
            this.pnlInfo.Controls.Add(this.lblNoteCount);
            this.pnlInfo.Controls.Add(this.lblTrackInfo);
            this.pnlInfo.Controls.Add(this.lblFileName);
            this.pnlInfo.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlInfo.Location = new System.Drawing.Point(0, 49);
            this.pnlInfo.Name = "pnlInfo";
            this.pnlInfo.Padding = new System.Windows.Forms.Padding(8, 4, 8, 4);
            this.pnlInfo.Size = new System.Drawing.Size(1000, 60);
            this.pnlInfo.TabIndex = 2;

            // ── lblFileName ───────────────────────────────────────────
            this.lblFileName.AutoSize = true;
            this.lblFileName.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblFileName.Location = new System.Drawing.Point(8, 8);
            this.lblFileName.Name = "lblFileName";
            this.lblFileName.Size = new System.Drawing.Size(100, 15);
            this.lblFileName.TabIndex = 0;
            this.lblFileName.Text = "파일: (없음)";

            // ── lblTrackInfo ──────────────────────────────────────────
            this.lblTrackInfo.AutoSize = true;
            this.lblTrackInfo.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.lblTrackInfo.Location = new System.Drawing.Point(8, 28);
            this.lblTrackInfo.Name = "lblTrackInfo";
            this.lblTrackInfo.Size = new System.Drawing.Size(50, 13);
            this.lblTrackInfo.TabIndex = 1;
            this.lblTrackInfo.Text = "트랙: -";

            // ── lblNoteCount ──────────────────────────────────────────
            this.lblNoteCount.AutoSize = true;
            this.lblNoteCount.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.lblNoteCount.Location = new System.Drawing.Point(200, 28);
            this.lblNoteCount.Name = "lblNoteCount";
            this.lblNoteCount.Size = new System.Drawing.Size(50, 13);
            this.lblNoteCount.TabIndex = 2;
            this.lblNoteCount.Text = "음표: -";

            // ── picSheet ──────────────────────────────────────────────
            this.picSheet.BackColor = System.Drawing.Color.White;
            this.picSheet.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.picSheet.Cursor = System.Windows.Forms.Cursors.Default;
            this.picSheet.Dock = System.Windows.Forms.DockStyle.Fill;
            this.picSheet.Location = new System.Drawing.Point(0, 0);
            this.picSheet.Name = "picSheet";
            this.picSheet.Size = new System.Drawing.Size(1000, 466);
            this.picSheet.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Normal;
            this.picSheet.TabIndex = 0;
            this.picSheet.TabStop = false;

            // ── pnlSheet ──────────────────────────────────────────────
            this.pnlSheet.BackColor = System.Drawing.Color.White;
            this.pnlSheet.Controls.Add(this.picSheet);
            this.pnlSheet.Dock = System.Windows.Forms.DockStyle.Fill;
            this.pnlSheet.Location = new System.Drawing.Point(0, 109);
            this.pnlSheet.Name = "pnlSheet";
            this.pnlSheet.Size = new System.Drawing.Size(1000, 466);
            this.pnlSheet.TabIndex = 3;

            // ── trkPosition ───────────────────────────────────────────
            this.trkPosition.Location = new System.Drawing.Point(90, 10);
            this.trkPosition.Maximum = 1000;
            this.trkPosition.Minimum = 0;
            this.trkPosition.Name = "trkPosition";
            this.trkPosition.Size = new System.Drawing.Size(500, 30);
            this.trkPosition.TabIndex = 1;
            this.trkPosition.TickStyle = System.Windows.Forms.TickStyle.None;
            this.trkPosition.Value = 0;

            // ── lblCurrentTime ────────────────────────────────────────
            this.lblCurrentTime.AutoSize = true;
            this.lblCurrentTime.Font = new System.Drawing.Font("Consolas", 11F, System.Drawing.FontStyle.Bold);
            this.lblCurrentTime.ForeColor = System.Drawing.Color.DarkSlateGray;
            this.lblCurrentTime.Location = new System.Drawing.Point(8, 14);
            this.lblCurrentTime.Name = "lblCurrentTime";
            this.lblCurrentTime.Size = new System.Drawing.Size(77, 17);
            this.lblCurrentTime.TabIndex = 0;
            this.lblCurrentTime.Text = "00:00.00";

            // ── lblTotalTime ──────────────────────────────────────────
            this.lblTotalTime.AutoSize = true;
            this.lblTotalTime.Font = new System.Drawing.Font("Consolas", 11F);
            this.lblTotalTime.ForeColor = System.Drawing.Color.DarkSlateGray;
            this.lblTotalTime.Location = new System.Drawing.Point(595, 14);
            this.lblTotalTime.Name = "lblTotalTime";
            this.lblTotalTime.Size = new System.Drawing.Size(77, 17);
            this.lblTotalTime.TabIndex = 2;
            this.lblTotalTime.Text = "00:00.00";

            // ── pnlControls ───────────────────────────────────────────
            this.pnlControls.BackColor = System.Drawing.Color.FromArgb(245, 245, 248);
            this.pnlControls.Controls.Add(this.trkPosition);
            this.pnlControls.Controls.Add(this.lblTotalTime);
            this.pnlControls.Controls.Add(this.lblCurrentTime);
            this.pnlControls.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.pnlControls.Location = new System.Drawing.Point(0, 575);
            this.pnlControls.Name = "pnlControls";
            this.pnlControls.Padding = new System.Windows.Forms.Padding(8, 4, 8, 4);
            this.pnlControls.Size = new System.Drawing.Size(1000, 50);
            this.pnlControls.TabIndex = 4;

            // ── statusStrip ───────────────────────────────────────────
            this.statusStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.lblStatus,
                this.progressBar});
            this.statusStrip.Location = new System.Drawing.Point(0, 625);
            this.statusStrip.Name = "statusStrip";
            this.statusStrip.Size = new System.Drawing.Size(1000, 22);
            this.statusStrip.TabIndex = 5;
            this.statusStrip.Text = "statusStrip";

            // ── lblStatus ─────────────────────────────────────────────
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(868, 17);
            this.lblStatus.Spring = true;
            this.lblStatus.Text = "준비";
            this.lblStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            // ── progressBar ───────────────────────────────────────────
            this.progressBar.Name = "progressBar";
            this.progressBar.Size = new System.Drawing.Size(150, 16);
            this.progressBar.Visible = false;

            // ── MidiForm ──────────────────────────────────────────────
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1000, 647);
            this.Controls.Add(this.pnlSheet);
            this.Controls.Add(this.pnlControls);
            this.Controls.Add(this.pnlInfo);
            this.Controls.Add(this.toolStrip);
            this.Controls.Add(this.menuStrip);
            this.Controls.Add(this.statusStrip);
            this.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.MainMenuStrip = this.menuStrip;
            this.MinimumSize = new System.Drawing.Size(700, 500);
            this.Name = "MidiForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "MIDI Master - MIDI 플레이어";

            // Resume layouts
            this.menuStrip.ResumeLayout(false);
            this.menuStrip.PerformLayout();
            this.toolStrip.ResumeLayout(false);
            this.toolStrip.PerformLayout();
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

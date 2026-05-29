namespace FTPServerWinV10
{
    partial class GenerateCertDialog
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && components != null) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.lblCN        = new System.Windows.Forms.Label();
            this.txtCN        = new System.Windows.Forms.TextBox();
            this.lblYears     = new System.Windows.Forms.Label();
            this.numYears     = new System.Windows.Forms.NumericUpDown();
            this.lblPassword  = new System.Windows.Forms.Label();
            this.txtPassword  = new System.Windows.Forms.TextBox();
            this.lblPath      = new System.Windows.Forms.Label();
            this.txtSavePath  = new System.Windows.Forms.TextBox();
            this.btnBrowse    = new System.Windows.Forms.Button();
            this.btnGenerate  = new System.Windows.Forms.Button();
            this.btnCancel    = new System.Windows.Forms.Button();
            this.saveFileDialog1 = new System.Windows.Forms.SaveFileDialog();

            ((System.ComponentModel.ISupportInitialize)(this.numYears)).BeginInit();
            this.SuspendLayout();

            // Common measurements
            const int labelX = 12, labelW = 92, ctrlX = 108, ctrlW = 320;

            // Row 1 – 서버 이름 (y=20)
            this.lblCN.Text = "서버 이름 (CN):";
            this.lblCN.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblCN.Location = new System.Drawing.Point(labelX, 20);
            this.lblCN.Size = new System.Drawing.Size(labelW, 27);
            this.lblCN.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            this.txtCN.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.txtCN.Location = new System.Drawing.Point(ctrlX, 20);
            this.txtCN.Size = new System.Drawing.Size(ctrlW, 27);
            this.txtCN.Name = "txtCN";

            // Row 2 – 유효 기간 (y=58)
            this.lblYears.Text = "유효 기간 (년):";
            this.lblYears.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblYears.Location = new System.Drawing.Point(labelX, 58);
            this.lblYears.Size = new System.Drawing.Size(labelW, 27);
            this.lblYears.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            this.numYears.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.numYears.Location = new System.Drawing.Point(ctrlX, 58);
            this.numYears.Size = new System.Drawing.Size(80, 27);
            this.numYears.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            this.numYears.Maximum = new decimal(new int[] { 10, 0, 0, 0 });
            this.numYears.Value = new decimal(new int[] { 1, 0, 0, 0 });
            this.numYears.Name = "numYears";

            // Row 3 – 인증서 암호 (y=96)
            this.lblPassword.Text = "인증서 암호:";
            this.lblPassword.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblPassword.Location = new System.Drawing.Point(labelX, 96);
            this.lblPassword.Size = new System.Drawing.Size(labelW, 27);
            this.lblPassword.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            this.txtPassword.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.txtPassword.Location = new System.Drawing.Point(ctrlX, 96);
            this.txtPassword.Size = new System.Drawing.Size(ctrlW, 27);
            this.txtPassword.PasswordChar = '*';
            this.txtPassword.Name = "txtPassword";

            // Row 4 – 저장 경로 (y=134): textbox + browse button
            // txtSavePath: ctrlX..330 (w=222), btnBrowse: 334..428 (w=94)
            this.lblPath.Text = "저장 경로:";
            this.lblPath.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblPath.Location = new System.Drawing.Point(labelX, 134);
            this.lblPath.Size = new System.Drawing.Size(labelW, 27);
            this.lblPath.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;

            this.txtSavePath.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.txtSavePath.Location = new System.Drawing.Point(ctrlX, 134);
            this.txtSavePath.Size = new System.Drawing.Size(222, 27);
            this.txtSavePath.ReadOnly = true;
            this.txtSavePath.BackColor = System.Drawing.Color.FromArgb(242, 242, 242);
            this.txtSavePath.Name = "txtSavePath";

            this.btnBrowse.Text = "찾기";
            this.btnBrowse.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.btnBrowse.Location = new System.Drawing.Point(334, 133);
            this.btnBrowse.Size = new System.Drawing.Size(94, 29);
            this.btnBrowse.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnBrowse.Cursor = System.Windows.Forms.Cursors.Hand;
            this.btnBrowse.Name = "btnBrowse";
            this.btnBrowse.Click += new System.EventHandler(this.btnBrowse_Click);

            // Action buttons (y=176): right-aligned
            this.btnGenerate.Text = "생성";
            this.btnGenerate.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.btnGenerate.BackColor = System.Drawing.Color.FromArgb(39, 174, 96);
            this.btnGenerate.ForeColor = System.Drawing.Color.White;
            this.btnGenerate.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnGenerate.FlatAppearance.BorderSize = 0;
            this.btnGenerate.Location = new System.Drawing.Point(260, 176);
            this.btnGenerate.Size = new System.Drawing.Size(84, 29);
            this.btnGenerate.Cursor = System.Windows.Forms.Cursors.Hand;
            this.btnGenerate.Name = "btnGenerate";
            this.btnGenerate.Click += new System.EventHandler(this.btnGenerate_Click);

            this.btnCancel.Text = "취소";
            this.btnCancel.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.btnCancel.Location = new System.Drawing.Point(350, 176);
            this.btnCancel.Size = new System.Drawing.Size(78, 29);
            this.btnCancel.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnCancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
            this.btnCancel.Name = "btnCancel";

            this.saveFileDialog1.Filter = "인증서 파일 (*.pfx)|*.pfx";
            this.saveFileDialog1.DefaultExt = "pfx";
            this.saveFileDialog1.FileName = "server_cert.pfx";

            // ── Dialog form ───────────────────────────────────────────────────────
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(440, 224);
            this.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Text = "자체 서명 인증서 생성";
            this.CancelButton = this.btnCancel;
            this.Controls.Add(this.lblCN);
            this.Controls.Add(this.txtCN);
            this.Controls.Add(this.lblYears);
            this.Controls.Add(this.numYears);
            this.Controls.Add(this.lblPassword);
            this.Controls.Add(this.txtPassword);
            this.Controls.Add(this.lblPath);
            this.Controls.Add(this.txtSavePath);
            this.Controls.Add(this.btnBrowse);
            this.Controls.Add(this.btnGenerate);
            this.Controls.Add(this.btnCancel);

            ((System.ComponentModel.ISupportInitialize)(this.numYears)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private System.Windows.Forms.Label lblCN;
        private System.Windows.Forms.TextBox txtCN;
        private System.Windows.Forms.Label lblYears;
        private System.Windows.Forms.NumericUpDown numYears;
        private System.Windows.Forms.Label lblPassword;
        private System.Windows.Forms.TextBox txtPassword;
        private System.Windows.Forms.Label lblPath;
        private System.Windows.Forms.TextBox txtSavePath;
        private System.Windows.Forms.Button btnBrowse;
        private System.Windows.Forms.Button btnGenerate;
        private System.Windows.Forms.Button btnCancel;
        private System.Windows.Forms.SaveFileDialog saveFileDialog1;
    }
}

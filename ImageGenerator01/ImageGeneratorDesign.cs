namespace ImageGenerator01
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
            lblPrompt = new Label();
            txtPrompt = new TextBox();
            lblWidth = new Label();
            nudWidth = new NumericUpDown();
            lblHeight = new Label();
            nudHeight = new NumericUpDown();
            lblSteps = new Label();
            nudSteps = new NumericUpDown();
            lblGuidance = new Label();
            nudGuidance = new NumericUpDown();
            lblNegativePrompt = new Label();
            txtNegativePrompt = new TextBox();
            lblSeed = new Label();
            nudSeed = new NumericUpDown();
            lblTrueCfg = new Label();
            nudTrueCfg = new NumericUpDown();
            lblMaxSeqLen = new Label();
            nudMaxSeqLen = new NumericUpDown();
            btnGenerate = new Button();
            btnSave = new Button();
            picResult = new PictureBox();
            statusStrip = new StatusStrip();
            lblStatus = new ToolStripStatusLabel();
            lblServerUrl = new Label();
            txtServerUrl = new TextBox();
            btnCheckServer = new Button();
            pnlControls = new Panel();

            ((System.ComponentModel.ISupportInitialize)nudWidth).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudHeight).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudSteps).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudGuidance).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudSeed).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudTrueCfg).BeginInit();
            ((System.ComponentModel.ISupportInitialize)nudMaxSeqLen).BeginInit();
            ((System.ComponentModel.ISupportInitialize)picResult).BeginInit();
            statusStrip.SuspendLayout();
            pnlControls.SuspendLayout();
            SuspendLayout();

            // pnlControls (좌측 패널)
            pnlControls.Location = new Point(12, 12);
            pnlControls.Size = new Size(280, 740);
            pnlControls.BorderStyle = BorderStyle.FixedSingle;
            pnlControls.Controls.AddRange(new Control[] {
                lblServerUrl, txtServerUrl, btnCheckServer,
                lblPrompt, txtPrompt,
                lblNegativePrompt, txtNegativePrompt,
                lblWidth, nudWidth,
                lblHeight, nudHeight,
                lblSteps, nudSteps,
                lblGuidance, nudGuidance,
                lblTrueCfg, nudTrueCfg,
                lblMaxSeqLen, nudMaxSeqLen,
                lblSeed, nudSeed,
                btnGenerate, btnSave
            });

            // Server URL
            lblServerUrl.Text = "Server URL";
            lblServerUrl.Location = new Point(8, 10);
            lblServerUrl.Size = new Size(260, 18);

            txtServerUrl.Text = "http://127.0.0.1:8000";
            txtServerUrl.Location = new Point(8, 30);
            txtServerUrl.Size = new Size(180, 23);

            btnCheckServer.Text = "연결 확인";
            btnCheckServer.Location = new Point(194, 29);
            btnCheckServer.Size = new Size(78, 25);
            btnCheckServer.Click += BtnCheckServer_Click;

            // Prompt
            lblPrompt.Text = "Prompt";
            lblPrompt.Location = new Point(8, 68);
            lblPrompt.Size = new Size(260, 18);

            txtPrompt.Location = new Point(8, 88);
            txtPrompt.Size = new Size(260, 80);
            txtPrompt.Multiline = true;
            txtPrompt.ScrollBars = ScrollBars.Vertical;
            txtPrompt.Text = "A beautiful landscape with mountains and a river, highly detailed, photorealistic";

            // Negative Prompt
            lblNegativePrompt.Text = "Negative Prompt";
            lblNegativePrompt.Location = new Point(8, 182);
            lblNegativePrompt.Size = new Size(260, 18);

            txtNegativePrompt.Location = new Point(8, 200);
            txtNegativePrompt.Size = new Size(260, 52);
            txtNegativePrompt.Multiline = true;
            txtNegativePrompt.ScrollBars = ScrollBars.Vertical;

            // Width
            lblWidth.Text = "Width";
            lblWidth.Location = new Point(8, 266);
            lblWidth.Size = new Size(120, 18);

            nudWidth.Location = new Point(8, 284);
            nudWidth.Size = new Size(120, 23);
            nudWidth.Minimum = 256;
            nudWidth.Maximum = 2048;
            nudWidth.Increment = 64;
            nudWidth.Value = 1024;

            // Height
            lblHeight.Text = "Height";
            lblHeight.Location = new Point(144, 266);
            lblHeight.Size = new Size(120, 18);

            nudHeight.Location = new Point(144, 284);
            nudHeight.Size = new Size(120, 23);
            nudHeight.Minimum = 256;
            nudHeight.Maximum = 2048;
            nudHeight.Increment = 64;
            nudHeight.Value = 1024;

            // Steps
            lblSteps.Text = "Inference Steps";
            lblSteps.Location = new Point(8, 322);
            lblSteps.Size = new Size(120, 18);

            nudSteps.Location = new Point(8, 340);
            nudSteps.Size = new Size(120, 23);
            nudSteps.Minimum = 1;
            nudSteps.Maximum = 100;
            nudSteps.Value = 28;

            // Guidance
            lblGuidance.Text = "Guidance Scale";
            lblGuidance.Location = new Point(144, 322);
            lblGuidance.Size = new Size(120, 18);

            nudGuidance.Location = new Point(144, 340);
            nudGuidance.Size = new Size(120, 23);
            nudGuidance.Minimum = new decimal(new int[] { 10, 0, 0, 65536 });
            nudGuidance.Maximum = 20;
            nudGuidance.DecimalPlaces = 1;
            nudGuidance.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
            nudGuidance.Value = new decimal(new int[] { 35, 0, 0, 65536 });

            // True CFG Scale
            lblTrueCfg.Text = "True CFG Scale";
            lblTrueCfg.Location = new Point(8, 378);
            lblTrueCfg.Size = new Size(120, 18);

            nudTrueCfg.Location = new Point(8, 396);
            nudTrueCfg.Size = new Size(120, 23);
            nudTrueCfg.Minimum = new decimal(new int[] { 10, 0, 0, 65536 });
            nudTrueCfg.Maximum = 10;
            nudTrueCfg.DecimalPlaces = 1;
            nudTrueCfg.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
            nudTrueCfg.Value = new decimal(new int[] { 10, 0, 0, 65536 });   // 1.0

            // Max Sequence Length
            lblMaxSeqLen.Text = "Max Seq Length";
            lblMaxSeqLen.Location = new Point(144, 378);
            lblMaxSeqLen.Size = new Size(120, 18);

            nudMaxSeqLen.Location = new Point(144, 396);
            nudMaxSeqLen.Size = new Size(120, 23);
            nudMaxSeqLen.Minimum = 64;
            nudMaxSeqLen.Maximum = 512;
            nudMaxSeqLen.Increment = 64;
            nudMaxSeqLen.Value = 512;

            // Seed
            lblSeed.Text = "Seed (-1 = random)";
            lblSeed.Location = new Point(8, 434);
            lblSeed.Size = new Size(260, 18);

            nudSeed.Location = new Point(8, 452);
            nudSeed.Size = new Size(260, 23);
            nudSeed.Minimum = -1;
            nudSeed.Maximum = int.MaxValue;
            nudSeed.Value = -1;

            // Buttons
            btnGenerate.Text = "이미지 생성";
            btnGenerate.Location = new Point(8, 490);
            btnGenerate.Size = new Size(260, 40);
            btnGenerate.Font = new Font(btnGenerate.Font.FontFamily, 11, FontStyle.Bold);
            btnGenerate.Click += BtnGenerate_Click;

            btnSave.Text = "이미지 저장";
            btnSave.Location = new Point(8, 542);
            btnSave.Size = new Size(260, 32);
            btnSave.Enabled = false;
            btnSave.Click += BtnSave_Click;

            // picResult
            picResult.Location = new Point(304, 12);
            picResult.Size = new Size(660, 740);
            picResult.SizeMode = PictureBoxSizeMode.Zoom;
            picResult.BorderStyle = BorderStyle.FixedSingle;
            picResult.BackColor = Color.FromArgb(30, 30, 30);

            // StatusStrip
            statusStrip.Items.AddRange(new ToolStripItem[] { lblStatus });
            lblStatus.Text = "준비";

            // Form
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(976, 786);
            Controls.Add(pnlControls);
            Controls.Add(picResult);
            Controls.Add(statusStrip);
            Text = "FLUX.1 dev Image Generator";
            MinimumSize = new Size(992, 830);

            ((System.ComponentModel.ISupportInitialize)nudWidth).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudHeight).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudSteps).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudGuidance).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudSeed).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudTrueCfg).EndInit();
            ((System.ComponentModel.ISupportInitialize)nudMaxSeqLen).EndInit();
            ((System.ComponentModel.ISupportInitialize)picResult).EndInit();
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            pnlControls.ResumeLayout(false);
            pnlControls.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label lblPrompt;
        private TextBox txtPrompt;
        private Label lblNegativePrompt;
        private TextBox txtNegativePrompt;
        private Label lblWidth;
        private NumericUpDown nudWidth;
        private Label lblHeight;
        private NumericUpDown nudHeight;
        private Label lblSteps;
        private NumericUpDown nudSteps;
        private Label lblGuidance;
        private NumericUpDown nudGuidance;
        private Label lblSeed;
        private NumericUpDown nudSeed;
        private Label lblTrueCfg;
        private NumericUpDown nudTrueCfg;
        private Label lblMaxSeqLen;
        private NumericUpDown nudMaxSeqLen;
        private Button btnGenerate;
        private Button btnSave;
        private PictureBox picResult;
        private StatusStrip statusStrip;
        private ToolStripStatusLabel lblStatus;
        private Label lblServerUrl;
        private TextBox txtServerUrl;
        private Button btnCheckServer;
        private Panel pnlControls;
    }
}

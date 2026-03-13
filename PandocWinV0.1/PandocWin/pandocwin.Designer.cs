namespace PandocWin
{
    partial class PandocWin
    {
        /// <summary>
        /// 필수 디자이너 변수입니다.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// 사용 중인 모든 리소스를 정리합니다.
        /// </summary>
        /// <param name="disposing">관리되는 리소스를 삭제해야 하면 true이고, 그렇지 않으면 false입니다.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form 디자이너에서 생성한 코드

        /// <summary>
        /// 디자이너 지원에 필요한 메서드입니다. 
        /// 이 메서드의 내용을 코드 편집기로 수정하지 마세요.
        /// </summary>
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(PandocWin));
            this.Info = new System.Windows.Forms.Label();
            this.Convert = new System.Windows.Forms.Button();
            this.Log = new System.Windows.Forms.TextBox();
            this.FileButton = new System.Windows.Forms.Button();
            this.outputFormatGroupBox = new System.Windows.Forms.GroupBox();
            this.radioDocx = new System.Windows.Forms.RadioButton();
            this.radioHtml = new System.Windows.Forms.RadioButton();
            this.radioOdt = new System.Windows.Forms.RadioButton();
            this.radioTex = new System.Windows.Forms.RadioButton();
            this.radioEpub = new System.Windows.Forms.RadioButton();
            this.inputFormatsLabel = new System.Windows.Forms.Label();
            this.outputFormatGroupBox.SuspendLayout();
            this.SuspendLayout();
            // 
            // Info
            // 
            this.Info.AutoSize = true;
            this.Info.Font = new System.Drawing.Font("굴림", 12F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.Info.Location = new System.Drawing.Point(12, 9);
            this.Info.Name = "Info";
            this.Info.Size = new System.Drawing.Size(0, 16);
            this.Info.TabIndex = 0;
            this.Info.Click += new System.EventHandler(this.Info_Click);
            // 
            // Convert
            // 
            this.Convert.BackColor = System.Drawing.SystemColors.MenuHighlight;
            this.Convert.Font = new System.Drawing.Font("굴림", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.Convert.Location = new System.Drawing.Point(15, 402);
            this.Convert.Name = "Convert";
            this.Convert.Size = new System.Drawing.Size(758, 47);
            this.Convert.TabIndex = 1;
            this.Convert.Text = "파일 변환";
            this.Convert.UseVisualStyleBackColor = false;
            this.Convert.Click += new System.EventHandler(this.Convert_Click);
            // 
            // Log
            // 
            this.Log.Location = new System.Drawing.Point(12, 144);
            this.Log.Multiline = true;
            this.Log.Name = "Log";
            this.Log.Size = new System.Drawing.Size(761, 252);
            this.Log.TabIndex = 2;
            // 
            // FileButton
            // 
            this.FileButton.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(0)))), ((int)(((byte)(192)))), ((int)(((byte)(0)))));
            this.FileButton.Font = new System.Drawing.Font("굴림", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.FileButton.Location = new System.Drawing.Point(12, 13);
            this.FileButton.Name = "FileButton";
            this.FileButton.Size = new System.Drawing.Size(491, 51);
            this.FileButton.TabIndex = 3;
            this.FileButton.Text = "파일을 선택하세요.";
            this.FileButton.UseVisualStyleBackColor = false;
            this.FileButton.Click += new System.EventHandler(this.File_Click);
            // 
            // outputFormatGroupBox
            // 
            this.outputFormatGroupBox.Controls.Add(this.radioDocx);
            this.outputFormatGroupBox.Controls.Add(this.radioHtml);
            this.outputFormatGroupBox.Controls.Add(this.radioOdt);
            this.outputFormatGroupBox.Controls.Add(this.radioTex);
            this.outputFormatGroupBox.Controls.Add(this.radioEpub);
            this.outputFormatGroupBox.Font = new System.Drawing.Font("굴림", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.outputFormatGroupBox.Location = new System.Drawing.Point(565, 13);
            this.outputFormatGroupBox.Name = "outputFormatGroupBox";
            this.outputFormatGroupBox.Size = new System.Drawing.Size(207, 125);
            this.outputFormatGroupBox.TabIndex = 4;
            this.outputFormatGroupBox.TabStop = false;
            this.outputFormatGroupBox.Text = "출력 형식 지정";
            // 
            // radioDocx
            // 
            this.radioDocx.AutoSize = true;
            this.radioDocx.Location = new System.Drawing.Point(10, 20);
            this.radioDocx.Name = "radioDocx";
            this.radioDocx.Size = new System.Drawing.Size(109, 16);
            this.radioDocx.TabIndex = 0;
            this.radioDocx.TabStop = true;
            this.radioDocx.Text = "Word (.docx)";
            this.radioDocx.UseVisualStyleBackColor = true;
            // 
            // radioHtml
            // 
            this.radioHtml.AutoSize = true;
            this.radioHtml.Location = new System.Drawing.Point(10, 40);
            this.radioHtml.Name = "radioHtml";
            this.radioHtml.Size = new System.Drawing.Size(111, 16);
            this.radioHtml.TabIndex = 2;
            this.radioHtml.Text = "HTML (.html)";
            this.radioHtml.UseVisualStyleBackColor = true;
            // 
            // radioOdt
            // 
            this.radioOdt.AutoSize = true;
            this.radioOdt.Location = new System.Drawing.Point(10, 60);
            this.radioOdt.Name = "radioOdt";
            this.radioOdt.Size = new System.Drawing.Size(93, 16);
            this.radioOdt.TabIndex = 3;
            this.radioOdt.Text = "ODT (.odt)";
            this.radioOdt.UseVisualStyleBackColor = true;
            // 
            // radioTex
            // 
            this.radioTex.AutoSize = true;
            this.radioTex.Location = new System.Drawing.Point(10, 80);
            this.radioTex.Name = "radioTex";
            this.radioTex.Size = new System.Drawing.Size(107, 16);
            this.radioTex.TabIndex = 4;
            this.radioTex.Text = "LaTeX (.tex)";
            this.radioTex.UseVisualStyleBackColor = true;
            // 
            // radioEpub
            // 
            this.radioEpub.AutoSize = true;
            this.radioEpub.Location = new System.Drawing.Point(10, 100);
            this.radioEpub.Name = "radioEpub";
            this.radioEpub.Size = new System.Drawing.Size(113, 16);
            this.radioEpub.TabIndex = 5;
            this.radioEpub.Text = "EPUB (.epub)";
            this.radioEpub.UseVisualStyleBackColor = true;
            // 
            // inputFormatsLabel
            // 
            this.inputFormatsLabel.AutoSize = true;
            this.inputFormatsLabel.Font = new System.Drawing.Font("굴림", 9.75F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.inputFormatsLabel.Location = new System.Drawing.Point(15, 73);
            this.inputFormatsLabel.Name = "inputFormatsLabel";
            this.inputFormatsLabel.Size = new System.Drawing.Size(395, 52);
            this.inputFormatsLabel.TabIndex = 5;
            this.inputFormatsLabel.Text = resources.GetString("inputFormatsLabel.Text");
            this.inputFormatsLabel.Click += new System.EventHandler(this.inputFormatsLabel_Click);
            // 
            // PandocWin
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(784, 461);
            this.Controls.Add(this.outputFormatGroupBox);
            this.Controls.Add(this.FileButton);
            this.Controls.Add(this.Log);
            this.Controls.Add(this.Convert);
            this.Controls.Add(this.Info);
            this.Controls.Add(this.inputFormatsLabel);
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MaximumSize = new System.Drawing.Size(800, 500);
            this.MinimumSize = new System.Drawing.Size(800, 500);
            this.Name = "PandocWin";
            this.Text = "PandocWin";
            this.Load += new System.EventHandler(this.Form1_Load);
            this.outputFormatGroupBox.ResumeLayout(false);
            this.outputFormatGroupBox.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.Label Info;
        private System.Windows.Forms.Button Convert;
        private System.Windows.Forms.TextBox Log;
        private System.Windows.Forms.Button FileButton;
        private System.Windows.Forms.GroupBox outputFormatGroupBox;
        private System.Windows.Forms.RadioButton radioDocx;
        private System.Windows.Forms.RadioButton radioHtml;
        private System.Windows.Forms.RadioButton radioOdt;
        private System.Windows.Forms.RadioButton radioTex;
        private System.Windows.Forms.RadioButton radioEpub;
        private System.Windows.Forms.Label inputFormatsLabel;
    }
}


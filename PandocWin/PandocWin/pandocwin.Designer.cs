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
            this.Info = new System.Windows.Forms.Label();
            this.Convert = new System.Windows.Forms.Button();
            this.Log = new System.Windows.Forms.TextBox();
            this.FileButton = new System.Windows.Forms.Button();
            this.SuspendLayout();
            // 
            // Info
            // 
            this.Info.AutoSize = true;
            this.Info.Font = new System.Drawing.Font("굴림", 12F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.Info.Location = new System.Drawing.Point(12, 9);
            this.Info.Name = "Info";
            this.Info.Size = new System.Drawing.Size(368, 80);
            this.Info.TabIndex = 0;
            this.Info.Text = "PandocWin은 MarkDown으로 작성된 문서를 \r\nWord로 변경하기 위해서 만든 프로그램입니다.\r\n\r\n실행하기 위해서는 Pandoc이라는" +
    " 프로그램을\r\n미리 설치하기 바랍니다.\r\n";
            // 
            // Convert
            // 
            this.Convert.Font = new System.Drawing.Font("굴림", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.Convert.Location = new System.Drawing.Point(15, 402);
            this.Convert.Name = "Convert";
            this.Convert.Size = new System.Drawing.Size(758, 47);
            this.Convert.TabIndex = 1;
            this.Convert.Text = "Convert";
            this.Convert.UseVisualStyleBackColor = true;
            this.Convert.Click += new System.EventHandler(this.Convert_Click);
            // 
            // Log
            // 
            this.Log.Location = new System.Drawing.Point(12, 160);
            this.Log.Multiline = true;
            this.Log.Name = "Log";
            this.Log.Size = new System.Drawing.Size(761, 236);
            this.Log.TabIndex = 2;
            // 
            // FileButton
            // 
            this.FileButton.Font = new System.Drawing.Font("굴림", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(129)));
            this.FileButton.Location = new System.Drawing.Point(12, 103);
            this.FileButton.Name = "FileButton";
            this.FileButton.Size = new System.Drawing.Size(760, 51);
            this.FileButton.TabIndex = 3;
            this.FileButton.Text = "Select MD File";
            this.FileButton.UseVisualStyleBackColor = true;
            this.FileButton.Click += new System.EventHandler(this.File_Click);
            // 
            // PandocWin
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(784, 461);
            this.Controls.Add(this.FileButton);
            this.Controls.Add(this.Log);
            this.Controls.Add(this.Convert);
            this.Controls.Add(this.Info);
            this.MaximumSize = new System.Drawing.Size(800, 500);
            this.MinimumSize = new System.Drawing.Size(800, 500);
            this.Name = "PandocWin";
            this.Text = "PandocWin";
            this.Load += new System.EventHandler(this.Form1_Load);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.Label Info;
        private System.Windows.Forms.Button Convert;
        private System.Windows.Forms.TextBox Log;
        private System.Windows.Forms.Button FileButton;
    }
}


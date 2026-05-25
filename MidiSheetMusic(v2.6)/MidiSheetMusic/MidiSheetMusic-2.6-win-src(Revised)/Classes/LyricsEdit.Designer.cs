namespace MidiSheetMusic
{
    partial class LyricsEditForm
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
        /// 이 메서드의 내용을 코드 편집기로 수정하지 마십시오.
        /// </summary>
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(LyricsEditForm));
            this.btnConfirm = new System.Windows.Forms.Button();
            this.btnCancel = new System.Windows.Forms.Button();
            this.textLyrics = new System.Windows.Forms.TextBox();
            this.btnAddNewLine = new System.Windows.Forms.Button();
            this.textStartTime = new System.Windows.Forms.TextBox();
            this.label1 = new System.Windows.Forms.Label();
            this.label3 = new System.Windows.Forms.Label();
            this.btnAddSpace = new System.Windows.Forms.Button();
            this.label2 = new System.Windows.Forms.Label();
            this.SuspendLayout();
            // 
            // btnConfirm
            // 
            resources.ApplyResources(this.btnConfirm, "btnConfirm");
            this.btnConfirm.Name = "btnConfirm";
            this.btnConfirm.UseVisualStyleBackColor = true;
            this.btnConfirm.Click += new System.EventHandler(this.btnConfirm_Click);
            // 
            // btnCancel
            // 
            resources.ApplyResources(this.btnCancel, "btnCancel");
            this.btnCancel.Name = "btnCancel";
            this.btnCancel.UseVisualStyleBackColor = true;
            this.btnCancel.Click += new System.EventHandler(this.btnCancel_Click);
            // 
            // textLyrics
            // 
            this.textLyrics.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            resources.ApplyResources(this.textLyrics, "textLyrics");
            this.textLyrics.Name = "textLyrics";
            this.textLyrics.KeyDown += new System.Windows.Forms.KeyEventHandler(this.textLyrics_KeyDown);
            // 
            // btnAddNewLine
            // 
            resources.ApplyResources(this.btnAddNewLine, "btnAddNewLine");
            this.btnAddNewLine.Name = "btnAddNewLine";
            this.btnAddNewLine.UseVisualStyleBackColor = true;
            this.btnAddNewLine.Click += new System.EventHandler(this.btnNewLine_Click);
            // 
            // textStartTime
            // 
            this.textStartTime.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            resources.ApplyResources(this.textStartTime, "textStartTime");
            this.textStartTime.Name = "textStartTime";
            this.textStartTime.ReadOnly = true;
            // 
            // label1
            // 
            resources.ApplyResources(this.label1, "label1");
            this.label1.Name = "label1";
            // 
            // label3
            // 
            resources.ApplyResources(this.label3, "label3");
            this.label3.Name = "label3";
            // 
            // btnAddSpace
            // 
            resources.ApplyResources(this.btnAddSpace, "btnAddSpace");
            this.btnAddSpace.Name = "btnAddSpace";
            this.btnAddSpace.UseVisualStyleBackColor = true;
            this.btnAddSpace.Click += new System.EventHandler(this.btnAddSpace_Click);
            // 
            // label2
            // 
            resources.ApplyResources(this.label2, "label2");
            this.label2.Name = "label2";
            // 
            // LyricsEditForm
            // 
            resources.ApplyResources(this, "$this");
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.Controls.Add(this.label2);
            this.Controls.Add(this.btnAddSpace);
            this.Controls.Add(this.label3);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.textStartTime);
            this.Controls.Add(this.btnAddNewLine);
            this.Controls.Add(this.textLyrics);
            this.Controls.Add(this.btnCancel);
            this.Controls.Add(this.btnConfirm);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "LyricsEditForm";
            this.ShowInTaskbar = false;
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.LyricsEditForm_FormClosing);
            this.Load += new System.EventHandler(this.LyricsEditForm_Load);
            this.Shown += new System.EventHandler(this.LyricsEditForm_Shown);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.Button btnConfirm;
        private System.Windows.Forms.Button btnCancel;
        private System.Windows.Forms.TextBox textLyrics;
        private System.Windows.Forms.Button btnAddNewLine;
        private System.Windows.Forms.TextBox textStartTime;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.Button btnAddSpace;
        private System.Windows.Forms.Label label2;
    }
}
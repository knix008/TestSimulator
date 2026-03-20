namespace CircleIconWin
{
    partial class Form1
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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Form1));
            this.pictureBox1 = new System.Windows.Forms.PictureBox();
            this.menuStrip1 = new System.Windows.Forms.MenuStrip();
            this.파일ToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.메뉴Open = new System.Windows.Forms.ToolStripMenuItem();
            this.메뉴Save = new System.Windows.Forms.ToolStripMenuItem();
            this.메뉴Exit = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStrip1 = new System.Windows.Forms.ToolStrip();
            this.toolOpen = new System.Windows.Forms.ToolStripButton();
            this.toolSave = new System.Windows.Forms.ToolStripButton();
            this.toolStripSeparator1 = new System.Windows.Forms.ToolStripSeparator();
            this.btnOpenRight = new System.Windows.Forms.Button();
            this.btnSaveRight = new System.Windows.Forms.Button();
            this.lblSelectionInfo = new System.Windows.Forms.Label();
            this.lblMouseInfo = new System.Windows.Forms.Label();
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox1)).BeginInit();
            this.menuStrip1.SuspendLayout();
            this.toolStrip1.SuspendLayout();
            this.SuspendLayout();
            // 
            // pictureBox1
            // 
            this.pictureBox1.BackColor = System.Drawing.Color.Gray;
            this.pictureBox1.Location = new System.Drawing.Point(18, 48);
            this.pictureBox1.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.pictureBox1.Name = "pictureBox1";
            this.pictureBox1.Size = new System.Drawing.Size(788, 720);
            this.pictureBox1.SizeMode = System.Windows.Forms.PictureBoxSizeMode.AutoSize;
            this.pictureBox1.TabIndex = 0;
            this.pictureBox1.TabStop = false;
            // 
            // menuStrip1
            // 
            this.menuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.파일ToolStripMenuItem});
            this.menuStrip1.Location = new System.Drawing.Point(0, 0);
            this.menuStrip1.Name = "menuStrip1";
            this.menuStrip1.Padding = new System.Windows.Forms.Padding(5, 2, 0, 2);
            this.menuStrip1.Size = new System.Drawing.Size(1022, 24);
            this.menuStrip1.TabIndex = 3;
            this.menuStrip1.Text = "menuStrip1";
            // 
            // 파일ToolStripMenuItem
            // 
            this.파일ToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.메뉴Open,
            this.메뉴Save,
            this.메뉴Exit});
            this.파일ToolStripMenuItem.Name = "파일ToolStripMenuItem";
            this.파일ToolStripMenuItem.Size = new System.Drawing.Size(43, 20);
            this.파일ToolStripMenuItem.Text = "파일";
            // 
            // 메뉴Open
            // 
            this.메뉴Open.Name = "메뉴Open";
            this.메뉴Open.Size = new System.Drawing.Size(138, 22);
            this.메뉴Open.Text = "이미지 열기";
            // 
            // 메뉴Save
            // 
            this.메뉴Save.Name = "메뉴Save";
            this.메뉴Save.Size = new System.Drawing.Size(138, 22);
            this.메뉴Save.Text = "PNG 저장";
            // 
            // 메뉴Exit
            // 
            this.메뉴Exit.Name = "메뉴Exit";
            this.메뉴Exit.Size = new System.Drawing.Size(138, 22);
            this.메뉴Exit.Text = "종료";
            // 
            // toolStrip1
            // 
            this.toolStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.toolOpen,
            this.toolSave,
            this.toolStripSeparator1});
            this.toolStrip1.Location = new System.Drawing.Point(0, 24);
            this.toolStrip1.Name = "toolStrip1";
            this.toolStrip1.Size = new System.Drawing.Size(1022, 25);
            this.toolStrip1.TabIndex = 4;
            this.toolStrip1.Text = "toolStrip1";
            // 
            // toolOpen
            // 
            this.toolOpen.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Image;
            this.toolOpen.Image = ((System.Drawing.Image)(resources.GetObject("toolOpen.Image")));
            this.toolOpen.Name = "toolOpen";
            this.toolOpen.Size = new System.Drawing.Size(23, 22);
            this.toolOpen.Text = "이미지 열기";
            // 
            // toolSave
            // 
            this.toolSave.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Image;
            this.toolSave.Image = ((System.Drawing.Image)(resources.GetObject("toolSave.Image")));
            this.toolSave.Name = "toolSave";
            this.toolSave.Size = new System.Drawing.Size(23, 22);
            this.toolSave.Text = "PNG 저장";
            // 
            // toolStripSeparator1
            // 
            this.toolStripSeparator1.Name = "toolStripSeparator1";
            this.toolStripSeparator1.Size = new System.Drawing.Size(6, 25);
            // 
            // btnOpenRight
            // 
            this.btnOpenRight.Location = new System.Drawing.Point(812, 48);
            this.btnOpenRight.Name = "btnOpenRight";
            this.btnOpenRight.Size = new System.Drawing.Size(200, 60);
            this.btnOpenRight.TabIndex = 5;
            this.btnOpenRight.Text = "이미지 열기";
            this.btnOpenRight.UseVisualStyleBackColor = true;
            // 
            // btnSaveRight
            // 
            this.btnSaveRight.Location = new System.Drawing.Point(812, 148);
            this.btnSaveRight.Name = "btnSaveRight";
            this.btnSaveRight.Size = new System.Drawing.Size(200, 60);
            this.btnSaveRight.TabIndex = 6;
            this.btnSaveRight.Text = "PNG 저장";
            this.btnSaveRight.UseVisualStyleBackColor = true;
            // 
            // lblSelectionInfo
            // 
            this.lblSelectionInfo.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.lblSelectionInfo.Location = new System.Drawing.Point(812, 228);
            this.lblSelectionInfo.Name = "lblSelectionInfo";
            this.lblSelectionInfo.Size = new System.Drawing.Size(200, 28);
            this.lblSelectionInfo.TabIndex = 1;
            this.lblSelectionInfo.Text = "선택 영역: -";
            this.lblSelectionInfo.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // lblMouseInfo
            // 
            this.lblMouseInfo.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.lblMouseInfo.Location = new System.Drawing.Point(812, 263);
            this.lblMouseInfo.Name = "lblMouseInfo";
            this.lblMouseInfo.Size = new System.Drawing.Size(200, 28);
            this.lblMouseInfo.TabIndex = 0;
            this.lblMouseInfo.Text = "마우스: -";
            this.lblMouseInfo.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // Form1
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1022, 781);
            this.Controls.Add(this.lblMouseInfo);
            this.Controls.Add(this.lblSelectionInfo);
            this.Controls.Add(this.btnSaveRight);
            this.Controls.Add(this.btnOpenRight);
            this.Controls.Add(this.toolStrip1);
            this.Controls.Add(this.menuStrip1);
            this.Controls.Add(this.pictureBox1);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MainMenuStrip = this.menuStrip1;
            this.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "Form1";
            this.Text = "원형 아이콘 생성기";
            this.AutoScroll = true;
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox1)).EndInit();
            this.menuStrip1.ResumeLayout(false);
            this.menuStrip1.PerformLayout();
            this.toolStrip1.ResumeLayout(false);
            this.toolStrip1.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.PictureBox pictureBox1;
        private System.Windows.Forms.MenuStrip menuStrip1;
        private System.Windows.Forms.ToolStrip toolStrip1;
        private System.Windows.Forms.ToolStripButton toolOpen;
        private System.Windows.Forms.ToolStripButton toolSave;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator1;
        private System.Windows.Forms.ToolStripMenuItem 파일ToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem 메뉴Open;
        private System.Windows.Forms.ToolStripMenuItem 메뉴Save;
        private System.Windows.Forms.ToolStripMenuItem 메뉴Exit;
        private System.Windows.Forms.Button btnOpenRight;
        private System.Windows.Forms.Button btnSaveRight;
        private System.Windows.Forms.Label lblSelectionInfo;
        private System.Windows.Forms.Label lblMouseInfo;
    }
}


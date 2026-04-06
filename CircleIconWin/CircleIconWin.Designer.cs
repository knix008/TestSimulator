namespace CircleIconWin
{
    partial class CircleIconWin
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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(CircleIconWin));
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
            this.btnCircleSelection = new System.Windows.Forms.Button();
            this.btnEllipseSelection = new System.Windows.Forms.Button();
            this.btnSquareSelection = new System.Windows.Forms.Button();
            this.btnRectangleSelection = new System.Windows.Forms.Button();
            this.groupBoxSize = new System.Windows.Forms.GroupBox();
            this.btnApplySize = new System.Windows.Forms.Button();
            this.panelSizeRectangle = new System.Windows.Forms.Panel();
            this.lblRectHeight = new System.Windows.Forms.Label();
            this.nudRectHeight = new System.Windows.Forms.NumericUpDown();
            this.lblRectWidth = new System.Windows.Forms.Label();
            this.nudRectWidth = new System.Windows.Forms.NumericUpDown();
            this.panelSizeSquare = new System.Windows.Forms.Panel();
            this.lblSquareSide = new System.Windows.Forms.Label();
            this.nudSquareSide = new System.Windows.Forms.NumericUpDown();
            this.panelSizeEllipse = new System.Windows.Forms.Panel();
            this.lblEllipseRadiusVertical = new System.Windows.Forms.Label();
            this.nudEllipseRadiusVertical = new System.Windows.Forms.NumericUpDown();
            this.lblEllipseRadiusHorizontal = new System.Windows.Forms.Label();
            this.nudEllipseRadiusHorizontal = new System.Windows.Forms.NumericUpDown();
            this.panelSizeCircle = new System.Windows.Forms.Panel();
            this.lblCircleRadius = new System.Windows.Forms.Label();
            this.nudCircleRadius = new System.Windows.Forms.NumericUpDown();
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox1)).BeginInit();
            this.menuStrip1.SuspendLayout();
            this.toolStrip1.SuspendLayout();
            this.groupBoxSize.SuspendLayout();
            this.panelSizeRectangle.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudRectHeight)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.nudRectWidth)).BeginInit();
            this.panelSizeSquare.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudSquareSide)).BeginInit();
            this.panelSizeEllipse.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudEllipseRadiusVertical)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.nudEllipseRadiusHorizontal)).BeginInit();
            this.panelSizeCircle.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudCircleRadius)).BeginInit();
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
            this.btnSaveRight.Location = new System.Drawing.Point(812, 114);
            this.btnSaveRight.Name = "btnSaveRight";
            this.btnSaveRight.Size = new System.Drawing.Size(200, 60);
            this.btnSaveRight.TabIndex = 6;
            this.btnSaveRight.Text = "PNG 저장";
            this.btnSaveRight.UseVisualStyleBackColor = true;
            // 
            // lblSelectionInfo
            // 
            this.lblSelectionInfo.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.lblSelectionInfo.Location = new System.Drawing.Point(812, 188);
            this.lblSelectionInfo.Name = "lblSelectionInfo";
            this.lblSelectionInfo.Size = new System.Drawing.Size(200, 28);
            this.lblSelectionInfo.TabIndex = 1;
            this.lblSelectionInfo.Text = "선택 영역: -";
            this.lblSelectionInfo.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            this.lblSelectionInfo.Click += new System.EventHandler(this.lblSelectionInfo_Click);
            // 
            // lblMouseInfo
            // 
            this.lblMouseInfo.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.lblMouseInfo.Location = new System.Drawing.Point(812, 225);
            this.lblMouseInfo.Name = "lblMouseInfo";
            this.lblMouseInfo.Size = new System.Drawing.Size(200, 28);
            this.lblMouseInfo.TabIndex = 0;
            this.lblMouseInfo.Text = "마우스: -";
            this.lblMouseInfo.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // btnCircleSelection
            // 
            this.btnCircleSelection.Location = new System.Drawing.Point(812, 267);
            this.btnCircleSelection.Name = "btnCircleSelection";
            this.btnCircleSelection.Size = new System.Drawing.Size(200, 50);
            this.btnCircleSelection.TabIndex = 8;
            this.btnCircleSelection.Text = "원형 선택";
            this.btnCircleSelection.UseVisualStyleBackColor = true;
            // 
            // btnEllipseSelection
            // 
            this.btnEllipseSelection.Location = new System.Drawing.Point(812, 321);
            this.btnEllipseSelection.Name = "btnEllipseSelection";
            this.btnEllipseSelection.Size = new System.Drawing.Size(200, 50);
            this.btnEllipseSelection.TabIndex = 9;
            this.btnEllipseSelection.Text = "타원 선택";
            this.btnEllipseSelection.UseVisualStyleBackColor = true;
            // 
            // btnSquareSelection
            // 
            this.btnSquareSelection.Location = new System.Drawing.Point(812, 375);
            this.btnSquareSelection.Name = "btnSquareSelection";
            this.btnSquareSelection.Size = new System.Drawing.Size(200, 50);
            this.btnSquareSelection.TabIndex = 10;
            this.btnSquareSelection.Text = "사각형 선택";
            this.btnSquareSelection.UseVisualStyleBackColor = true;
            // 
            // btnRectangleSelection
            // 
            this.btnRectangleSelection.Location = new System.Drawing.Point(812, 429);
            this.btnRectangleSelection.Name = "btnRectangleSelection";
            this.btnRectangleSelection.Size = new System.Drawing.Size(200, 50);
            this.btnRectangleSelection.TabIndex = 11;
            this.btnRectangleSelection.Text = "직사각형 선택";
            this.btnRectangleSelection.UseVisualStyleBackColor = true;
            // 
            // groupBoxSize
            // 
            this.groupBoxSize.Controls.Add(this.btnApplySize);
            this.groupBoxSize.Controls.Add(this.panelSizeRectangle);
            this.groupBoxSize.Controls.Add(this.panelSizeSquare);
            this.groupBoxSize.Controls.Add(this.panelSizeEllipse);
            this.groupBoxSize.Controls.Add(this.panelSizeCircle);
            this.groupBoxSize.Location = new System.Drawing.Point(812, 483);
            this.groupBoxSize.Name = "groupBoxSize";
            this.groupBoxSize.Size = new System.Drawing.Size(200, 210);
            this.groupBoxSize.TabIndex = 12;
            this.groupBoxSize.TabStop = false;
            this.groupBoxSize.Text = "크기 입력 (픽셀)";
            // 
            // btnApplySize
            // 
            this.btnApplySize.Location = new System.Drawing.Point(10, 168);
            this.btnApplySize.Name = "btnApplySize";
            this.btnApplySize.Size = new System.Drawing.Size(180, 32);
            this.btnApplySize.TabIndex = 4;
            this.btnApplySize.Text = "크기 적용";
            this.btnApplySize.UseVisualStyleBackColor = true;
            this.btnApplySize.Click += new System.EventHandler(this.btnApplySize_Click);
            // 
            // panelSizeRectangle
            // 
            this.panelSizeRectangle.Controls.Add(this.lblRectHeight);
            this.panelSizeRectangle.Controls.Add(this.nudRectHeight);
            this.panelSizeRectangle.Controls.Add(this.lblRectWidth);
            this.panelSizeRectangle.Controls.Add(this.nudRectWidth);
            this.panelSizeRectangle.Location = new System.Drawing.Point(6, 18);
            this.panelSizeRectangle.Name = "panelSizeRectangle";
            this.panelSizeRectangle.Size = new System.Drawing.Size(188, 140);
            this.panelSizeRectangle.TabIndex = 3;
            this.panelSizeRectangle.Visible = false;
            // 
            // lblRectHeight
            // 
            this.lblRectHeight.AutoSize = true;
            this.lblRectHeight.Location = new System.Drawing.Point(3, 6);
            this.lblRectHeight.Name = "lblRectHeight";
            this.lblRectHeight.Size = new System.Drawing.Size(29, 12);
            this.lblRectHeight.TabIndex = 0;
            this.lblRectHeight.Text = "높이";
            // 
            // nudRectHeight
            // 
            this.nudRectHeight.DecimalPlaces = 1;
            this.nudRectHeight.Increment = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudRectHeight.Location = new System.Drawing.Point(5, 24);
            this.nudRectHeight.Maximum = new decimal(new int[] {
            10000,
            0,
            0,
            0});
            this.nudRectHeight.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudRectHeight.Name = "nudRectHeight";
            this.nudRectHeight.Size = new System.Drawing.Size(100, 21);
            this.nudRectHeight.TabIndex = 1;
            this.nudRectHeight.Value = new decimal(new int[] {
            80,
            0,
            0,
            0});
            // 
            // lblRectWidth
            // 
            this.lblRectWidth.AutoSize = true;
            this.lblRectWidth.Location = new System.Drawing.Point(3, 54);
            this.lblRectWidth.Name = "lblRectWidth";
            this.lblRectWidth.Size = new System.Drawing.Size(17, 12);
            this.lblRectWidth.TabIndex = 2;
            this.lblRectWidth.Text = "폭";
            // 
            // nudRectWidth
            // 
            this.nudRectWidth.DecimalPlaces = 1;
            this.nudRectWidth.Increment = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudRectWidth.Location = new System.Drawing.Point(5, 72);
            this.nudRectWidth.Maximum = new decimal(new int[] {
            10000,
            0,
            0,
            0});
            this.nudRectWidth.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudRectWidth.Name = "nudRectWidth";
            this.nudRectWidth.Size = new System.Drawing.Size(100, 21);
            this.nudRectWidth.TabIndex = 3;
            this.nudRectWidth.Value = new decimal(new int[] {
            120,
            0,
            0,
            0});
            // 
            // panelSizeSquare
            // 
            this.panelSizeSquare.Controls.Add(this.lblSquareSide);
            this.panelSizeSquare.Controls.Add(this.nudSquareSide);
            this.panelSizeSquare.Location = new System.Drawing.Point(6, 18);
            this.panelSizeSquare.Name = "panelSizeSquare";
            this.panelSizeSquare.Size = new System.Drawing.Size(188, 140);
            this.panelSizeSquare.TabIndex = 2;
            this.panelSizeSquare.Visible = false;
            // 
            // lblSquareSide
            // 
            this.lblSquareSide.AutoSize = true;
            this.lblSquareSide.Location = new System.Drawing.Point(3, 6);
            this.lblSquareSide.Name = "lblSquareSide";
            this.lblSquareSide.Size = new System.Drawing.Size(61, 12);
            this.lblSquareSide.TabIndex = 0;
            this.lblSquareSide.Text = "한 변 길이";
            // 
            // nudSquareSide
            // 
            this.nudSquareSide.DecimalPlaces = 1;
            this.nudSquareSide.Increment = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudSquareSide.Location = new System.Drawing.Point(5, 24);
            this.nudSquareSide.Maximum = new decimal(new int[] {
            10000,
            0,
            0,
            0});
            this.nudSquareSide.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudSquareSide.Name = "nudSquareSide";
            this.nudSquareSide.Size = new System.Drawing.Size(100, 21);
            this.nudSquareSide.TabIndex = 1;
            this.nudSquareSide.Value = new decimal(new int[] {
            100,
            0,
            0,
            0});
            // 
            // panelSizeEllipse
            // 
            this.panelSizeEllipse.Controls.Add(this.lblEllipseRadiusVertical);
            this.panelSizeEllipse.Controls.Add(this.nudEllipseRadiusVertical);
            this.panelSizeEllipse.Controls.Add(this.lblEllipseRadiusHorizontal);
            this.panelSizeEllipse.Controls.Add(this.nudEllipseRadiusHorizontal);
            this.panelSizeEllipse.Location = new System.Drawing.Point(6, 18);
            this.panelSizeEllipse.Name = "panelSizeEllipse";
            this.panelSizeEllipse.Size = new System.Drawing.Size(188, 140);
            this.panelSizeEllipse.TabIndex = 1;
            this.panelSizeEllipse.Visible = false;
            // 
            // lblEllipseRadiusVertical
            // 
            this.lblEllipseRadiusVertical.AutoSize = true;
            this.lblEllipseRadiusVertical.Location = new System.Drawing.Point(3, 6);
            this.lblEllipseRadiusVertical.Name = "lblEllipseRadiusVertical";
            this.lblEllipseRadiusVertical.Size = new System.Drawing.Size(69, 12);
            this.lblEllipseRadiusVertical.TabIndex = 0;
            this.lblEllipseRadiusVertical.Text = "상하 반지름";
            // 
            // nudEllipseRadiusVertical
            // 
            this.nudEllipseRadiusVertical.DecimalPlaces = 1;
            this.nudEllipseRadiusVertical.Increment = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudEllipseRadiusVertical.Location = new System.Drawing.Point(5, 24);
            this.nudEllipseRadiusVertical.Maximum = new decimal(new int[] {
            10000,
            0,
            0,
            0});
            this.nudEllipseRadiusVertical.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudEllipseRadiusVertical.Name = "nudEllipseRadiusVertical";
            this.nudEllipseRadiusVertical.Size = new System.Drawing.Size(100, 21);
            this.nudEllipseRadiusVertical.TabIndex = 1;
            this.nudEllipseRadiusVertical.Value = new decimal(new int[] {
            40,
            0,
            0,
            0});
            // 
            // lblEllipseRadiusHorizontal
            // 
            this.lblEllipseRadiusHorizontal.AutoSize = true;
            this.lblEllipseRadiusHorizontal.Location = new System.Drawing.Point(3, 54);
            this.lblEllipseRadiusHorizontal.Name = "lblEllipseRadiusHorizontal";
            this.lblEllipseRadiusHorizontal.Size = new System.Drawing.Size(69, 12);
            this.lblEllipseRadiusHorizontal.TabIndex = 2;
            this.lblEllipseRadiusHorizontal.Text = "좌우 반지름";
            // 
            // nudEllipseRadiusHorizontal
            // 
            this.nudEllipseRadiusHorizontal.DecimalPlaces = 1;
            this.nudEllipseRadiusHorizontal.Increment = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudEllipseRadiusHorizontal.Location = new System.Drawing.Point(5, 72);
            this.nudEllipseRadiusHorizontal.Maximum = new decimal(new int[] {
            10000,
            0,
            0,
            0});
            this.nudEllipseRadiusHorizontal.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudEllipseRadiusHorizontal.Name = "nudEllipseRadiusHorizontal";
            this.nudEllipseRadiusHorizontal.Size = new System.Drawing.Size(100, 21);
            this.nudEllipseRadiusHorizontal.TabIndex = 3;
            this.nudEllipseRadiusHorizontal.Value = new decimal(new int[] {
            60,
            0,
            0,
            0});
            // 
            // panelSizeCircle
            // 
            this.panelSizeCircle.Controls.Add(this.lblCircleRadius);
            this.panelSizeCircle.Controls.Add(this.nudCircleRadius);
            this.panelSizeCircle.Location = new System.Drawing.Point(6, 18);
            this.panelSizeCircle.Name = "panelSizeCircle";
            this.panelSizeCircle.Size = new System.Drawing.Size(188, 140);
            this.panelSizeCircle.TabIndex = 0;
            // 
            // lblCircleRadius
            // 
            this.lblCircleRadius.AutoSize = true;
            this.lblCircleRadius.Location = new System.Drawing.Point(3, 6);
            this.lblCircleRadius.Name = "lblCircleRadius";
            this.lblCircleRadius.Size = new System.Drawing.Size(41, 12);
            this.lblCircleRadius.TabIndex = 0;
            this.lblCircleRadius.Text = "반지름";
            // 
            // nudCircleRadius
            // 
            this.nudCircleRadius.DecimalPlaces = 1;
            this.nudCircleRadius.Increment = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudCircleRadius.Location = new System.Drawing.Point(5, 24);
            this.nudCircleRadius.Maximum = new decimal(new int[] {
            10000,
            0,
            0,
            0});
            this.nudCircleRadius.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            65536});
            this.nudCircleRadius.Name = "nudCircleRadius";
            this.nudCircleRadius.Size = new System.Drawing.Size(100, 21);
            this.nudCircleRadius.TabIndex = 1;
            this.nudCircleRadius.Value = new decimal(new int[] {
            50,
            0,
            0,
            0});
            // 
            // CircleIconWin
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.AutoScroll = true;
            this.ClientSize = new System.Drawing.Size(1022, 781);
            this.Controls.Add(this.groupBoxSize);
            this.Controls.Add(this.btnRectangleSelection);
            this.Controls.Add(this.btnSquareSelection);
            this.Controls.Add(this.btnEllipseSelection);
            this.Controls.Add(this.btnCircleSelection);
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
            this.Name = "CircleIconWin";
            this.Text = "원형 아이콘 생성기";
            ((System.ComponentModel.ISupportInitialize)(this.pictureBox1)).EndInit();
            this.menuStrip1.ResumeLayout(false);
            this.menuStrip1.PerformLayout();
            this.toolStrip1.ResumeLayout(false);
            this.toolStrip1.PerformLayout();
            this.groupBoxSize.ResumeLayout(false);
            this.panelSizeRectangle.ResumeLayout(false);
            this.panelSizeRectangle.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudRectHeight)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.nudRectWidth)).EndInit();
            this.panelSizeSquare.ResumeLayout(false);
            this.panelSizeSquare.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudSquareSide)).EndInit();
            this.panelSizeEllipse.ResumeLayout(false);
            this.panelSizeEllipse.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudEllipseRadiusVertical)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.nudEllipseRadiusHorizontal)).EndInit();
            this.panelSizeCircle.ResumeLayout(false);
            this.panelSizeCircle.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.nudCircleRadius)).EndInit();
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
        private System.Windows.Forms.Button btnCircleSelection;
        private System.Windows.Forms.Button btnEllipseSelection;
        private System.Windows.Forms.Button btnSquareSelection;
        private System.Windows.Forms.Button btnRectangleSelection;
        private System.Windows.Forms.GroupBox groupBoxSize;
        private System.Windows.Forms.Panel panelSizeCircle;
        private System.Windows.Forms.Label lblCircleRadius;
        private System.Windows.Forms.NumericUpDown nudCircleRadius;
        private System.Windows.Forms.Panel panelSizeEllipse;
        private System.Windows.Forms.Label lblEllipseRadiusVertical;
        private System.Windows.Forms.NumericUpDown nudEllipseRadiusVertical;
        private System.Windows.Forms.Label lblEllipseRadiusHorizontal;
        private System.Windows.Forms.NumericUpDown nudEllipseRadiusHorizontal;
        private System.Windows.Forms.Panel panelSizeSquare;
        private System.Windows.Forms.Label lblSquareSide;
        private System.Windows.Forms.NumericUpDown nudSquareSide;
        private System.Windows.Forms.Panel panelSizeRectangle;
        private System.Windows.Forms.Label lblRectHeight;
        private System.Windows.Forms.NumericUpDown nudRectHeight;
        private System.Windows.Forms.Label lblRectWidth;
        private System.Windows.Forms.NumericUpDown nudRectWidth;
        private System.Windows.Forms.Button btnApplySize;
    }
}


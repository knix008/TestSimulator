namespace ImageSelectorV10
{
    partial class ImageSelectorV10
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ImageSelectorV10));
            tableToolbar = new TableLayoutPanel();
            btnOpen = new Button();
            btnZoomIn = new Button();
            btnZoomOut = new Button();
            lblZoomTitle = new Label();
            lblZoomValue = new Label();
            lblSelectionWidth = new Label();
            txtSelectionWidth = new TextBox();
            lblSelectionHeight = new Label();
            txtSelectionHeight = new TextBox();
            btnApplySelectionSize = new Button();
            lblRegionNote = new Label();
            txtRegionNote = new TextBox();
            btnSaveSelection = new Button();
            imageEditorPanel = new ImageEditorPanel();
            tableToolbar.SuspendLayout();
            SuspendLayout();
            // 
            // tableToolbar
            // 
            tableToolbar.AutoSize = true;
            tableToolbar.ColumnCount = 13;
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            tableToolbar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tableToolbar.Controls.Add(btnOpen, 0, 0);
            tableToolbar.Controls.Add(btnZoomIn, 1, 0);
            tableToolbar.Controls.Add(btnZoomOut, 2, 0);
            tableToolbar.Controls.Add(lblZoomTitle, 3, 0);
            tableToolbar.Controls.Add(lblZoomValue, 4, 0);
            tableToolbar.Controls.Add(lblSelectionWidth, 5, 0);
            tableToolbar.Controls.Add(txtSelectionWidth, 6, 0);
            tableToolbar.Controls.Add(lblSelectionHeight, 7, 0);
            tableToolbar.Controls.Add(txtSelectionHeight, 8, 0);
            tableToolbar.Controls.Add(btnApplySelectionSize, 9, 0);
            tableToolbar.Controls.Add(lblRegionNote, 10, 0);
            tableToolbar.Controls.Add(txtRegionNote, 11, 0);
            tableToolbar.Controls.Add(btnSaveSelection, 12, 0);
            tableToolbar.Dock = DockStyle.Top;
            tableToolbar.Location = new Point(0, 0);
            tableToolbar.Name = "tableToolbar";
            tableToolbar.Padding = new Padding(8, 8, 8, 8);
            tableToolbar.RowCount = 1;
            tableToolbar.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            tableToolbar.Size = new Size(1119, 48);
            tableToolbar.TabIndex = 0;
            // 
            // btnOpen
            // 
            btnOpen.AutoSize = true;
            btnOpen.Margin = new Padding(0, 0, 8, 0);
            btnOpen.Name = "btnOpen";
            btnOpen.Size = new Size(87, 28);
            btnOpen.TabIndex = 0;
            btnOpen.Text = "이미지 열기";
            btnOpen.UseVisualStyleBackColor = true;
            btnOpen.Click += btnOpen_Click;
            // 
            // btnZoomIn
            // 
            btnZoomIn.AutoSize = true;
            btnZoomIn.Margin = new Padding(0, 0, 8, 0);
            btnZoomIn.Name = "btnZoomIn";
            btnZoomIn.Size = new Size(50, 28);
            btnZoomIn.TabIndex = 1;
            btnZoomIn.Text = "확대";
            btnZoomIn.UseVisualStyleBackColor = true;
            btnZoomIn.Click += btnZoomIn_Click;
            // 
            // btnZoomOut
            // 
            btnZoomOut.AutoSize = true;
            btnZoomOut.Margin = new Padding(0, 0, 8, 0);
            btnZoomOut.Name = "btnZoomOut";
            btnZoomOut.Size = new Size(50, 28);
            btnZoomOut.TabIndex = 2;
            btnZoomOut.Text = "축소";
            btnZoomOut.UseVisualStyleBackColor = true;
            btnZoomOut.Click += btnZoomOut_Click;
            // 
            // lblZoomTitle
            // 
            lblZoomTitle.Anchor = AnchorStyles.Left;
            lblZoomTitle.AutoSize = true;
            lblZoomTitle.Margin = new Padding(0, 0, 4, 0);
            lblZoomTitle.Name = "lblZoomTitle";
            lblZoomTitle.Size = new Size(59, 15);
            lblZoomTitle.TabIndex = 3;
            lblZoomTitle.Text = "확대 배율:";
            // 
            // lblZoomValue
            // 
            lblZoomValue.Anchor = AnchorStyles.Left;
            lblZoomValue.AutoSize = true;
            lblZoomValue.Margin = new Padding(0, 0, 12, 0);
            lblZoomValue.Name = "lblZoomValue";
            lblZoomValue.Size = new Size(35, 15);
            lblZoomValue.TabIndex = 4;
            lblZoomValue.Text = "100%";
            // 
            // lblSelectionWidth
            // 
            lblSelectionWidth.Anchor = AnchorStyles.Left;
            lblSelectionWidth.AutoSize = true;
            lblSelectionWidth.Margin = new Padding(0, 0, 4, 0);
            lblSelectionWidth.Name = "lblSelectionWidth";
            lblSelectionWidth.Size = new Size(35, 15);
            lblSelectionWidth.TabIndex = 5;
            lblSelectionWidth.Text = "가로:";
            // 
            // txtSelectionWidth
            // 
            txtSelectionWidth.Anchor = AnchorStyles.Left;
            txtSelectionWidth.Margin = new Padding(0, 0, 6, 0);
            txtSelectionWidth.Name = "txtSelectionWidth";
            txtSelectionWidth.Size = new Size(64, 23);
            txtSelectionWidth.TabIndex = 6;
            txtSelectionWidth.Text = "100";
            txtSelectionWidth.KeyDown += SelectionSizeTextBox_KeyDown;
            // 
            // lblSelectionHeight
            // 
            lblSelectionHeight.Anchor = AnchorStyles.Left;
            lblSelectionHeight.AutoSize = true;
            lblSelectionHeight.Margin = new Padding(0, 0, 4, 0);
            lblSelectionHeight.Name = "lblSelectionHeight";
            lblSelectionHeight.Size = new Size(35, 15);
            lblSelectionHeight.TabIndex = 7;
            lblSelectionHeight.Text = "세로:";
            // 
            // txtSelectionHeight
            // 
            txtSelectionHeight.Anchor = AnchorStyles.Left;
            txtSelectionHeight.Margin = new Padding(0, 0, 8, 0);
            txtSelectionHeight.Name = "txtSelectionHeight";
            txtSelectionHeight.Size = new Size(64, 23);
            txtSelectionHeight.TabIndex = 8;
            txtSelectionHeight.Text = "100";
            txtSelectionHeight.KeyDown += SelectionSizeTextBox_KeyDown;
            // 
            // btnApplySelectionSize
            // 
            btnApplySelectionSize.AutoSize = true;
            btnApplySelectionSize.Margin = new Padding(0, 0, 12, 0);
            btnApplySelectionSize.Name = "btnApplySelectionSize";
            btnApplySelectionSize.Size = new Size(75, 28);
            btnApplySelectionSize.TabIndex = 9;
            btnApplySelectionSize.Text = "크기 적용";
            btnApplySelectionSize.UseVisualStyleBackColor = true;
            btnApplySelectionSize.Click += btnApplySelectionSize_Click;
            // 
            // lblRegionNote
            // 
            lblRegionNote.Anchor = AnchorStyles.Left;
            lblRegionNote.AutoSize = true;
            lblRegionNote.Margin = new Padding(0, 0, 8, 0);
            lblRegionNote.Name = "lblRegionNote";
            lblRegionNote.Size = new Size(94, 15);
            lblRegionNote.TabIndex = 10;
            lblRegionNote.Text = "선택 영역 메모:";
            // 
            // txtRegionNote
            // 
            txtRegionNote.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            txtRegionNote.Margin = new Padding(0, 0, 8, 0);
            txtRegionNote.Name = "txtRegionNote";
            txtRegionNote.PlaceholderText = "선택 영역에 대한 설명을 입력하세요";
            txtRegionNote.Size = new Size(400, 23);
            txtRegionNote.TabIndex = 11;
            // 
            // btnSaveSelection
            // 
            btnSaveSelection.AutoSize = true;
            btnSaveSelection.Margin = new Padding(0);
            btnSaveSelection.Name = "btnSaveSelection";
            btnSaveSelection.Size = new Size(130, 28);
            btnSaveSelection.TabIndex = 12;
            btnSaveSelection.Text = "선택 영역 저장…";
            btnSaveSelection.UseVisualStyleBackColor = true;
            btnSaveSelection.Click += btnSaveSelection_Click;
            // 
            // imageEditorPanel
            // 
            imageEditorPanel.Dock = DockStyle.Fill;
            imageEditorPanel.Location = new Point(0, 48);
            imageEditorPanel.Name = "imageEditorPanel";
            imageEditorPanel.Size = new Size(1119, 610);
            imageEditorPanel.TabIndex = 1;
            // 
            // ImageSelectorV10
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1119, 658);
            Controls.Add(imageEditorPanel);
            Controls.Add(tableToolbar);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MinimumSize = new Size(640, 400);
            Name = "ImageSelectorV10";
            Text = "ImageSelector V1.0";
            tableToolbar.ResumeLayout(true);
            ResumeLayout(true);
        }

        #endregion

        private TableLayoutPanel tableToolbar;
        private Button btnOpen;
        private Button btnZoomIn;
        private Button btnZoomOut;
        private Label lblZoomTitle;
        private Label lblZoomValue;
        private Label lblSelectionWidth;
        private TextBox txtSelectionWidth;
        private Label lblSelectionHeight;
        private TextBox txtSelectionHeight;
        private Button btnApplySelectionSize;
        private Label lblRegionNote;
        private TextBox txtRegionNote;
        private Button btnSaveSelection;
        private ImageEditorPanel imageEditorPanel;
    }
}

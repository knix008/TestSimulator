namespace HexaEditorV10
{
    partial class HexaEditorV10
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(HexaEditorV10));
            menuStrip1 = new MenuStrip();
            menuFile = new ToolStripMenuItem();
            menuFileNew = new ToolStripMenuItem();
            menuFileOpen = new ToolStripMenuItem();
            menuFileClose = new ToolStripMenuItem();
            menuFileSep1 = new ToolStripSeparator();
            menuFileSave = new ToolStripMenuItem();
            menuFileSaveAs = new ToolStripMenuItem();
            menuFileSep2 = new ToolStripSeparator();
            menuFileExit = new ToolStripMenuItem();
            menuEdit = new ToolStripMenuItem();
            menuEditGoTo = new ToolStripMenuItem();
            menuEditFind = new ToolStripMenuItem();
            menuEditFindPrev = new ToolStripMenuItem();
            menuEditReplace = new ToolStripMenuItem();
            statusStrip1 = new StatusStrip();
            statusLabelOffset = new ToolStripStatusLabel();
            statusLabelSep1 = new ToolStripStatusLabel();
            statusLabelSize = new ToolStripStatusLabel();
            statusLabelSep2 = new ToolStripStatusLabel();
            statusLabelPath = new ToolStripStatusLabel();
            panelFindReplace = new Panel();
            tableLayoutFindReplace = new TableLayoutPanel();
            lblFindToolbar = new Label();
            txtFindToolbar = new TextBox();
            flowFindNextButton = new FlowLayoutPanel();
            btnToolbarFindNext = new Button();
            btnToolbarFindPrev = new Button();
            lblReplaceToolbar = new Label();
            txtReplaceToolbar = new TextBox();
            flowReplaceButtons = new FlowLayoutPanel();
            btnToolbarReplaceAll = new Button();
            btnToolbarReplace = new Button();
            hexGrid = new DataGridView();
            panelHexGridEmpty = new Panel();
            menuStrip1.SuspendLayout();
            statusStrip1.SuspendLayout();
            panelFindReplace.SuspendLayout();
            tableLayoutFindReplace.SuspendLayout();
            flowFindNextButton.SuspendLayout();
            flowReplaceButtons.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)hexGrid).BeginInit();
            SuspendLayout();
            // 
            // menuStrip1
            // 
            menuStrip1.Items.AddRange(new ToolStripItem[] { menuFile, menuEdit });
            menuStrip1.Location = new Point(0, 0);
            menuStrip1.Name = "menuStrip1";
            menuStrip1.Padding = new Padding(7, 2, 0, 2);
            menuStrip1.Size = new Size(1090, 24);
            menuStrip1.TabIndex = 0;
            menuStrip1.Text = "menuStrip1";
            // 
            // menuFile
            // 
            menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuFileNew, menuFileOpen, menuFileClose, menuFileSep1, menuFileSave, menuFileSaveAs, menuFileSep2, menuFileExit });
            menuFile.Name = "menuFile";
            menuFile.Size = new Size(57, 20);
            menuFile.Text = "파일(&F)";
            // 
            // menuFileNew
            // 
            menuFileNew.Name = "menuFileNew";
            menuFileNew.ShortcutKeys = Keys.Control | Keys.N;
            menuFileNew.Size = new Size(203, 22);
            menuFileNew.Text = "새로 만들기(&N)";
            menuFileNew.Click += menuFileNew_Click;
            // 
            // menuFileOpen
            // 
            menuFileOpen.Name = "menuFileOpen";
            menuFileOpen.ShortcutKeys = Keys.Control | Keys.O;
            menuFileOpen.Size = new Size(203, 22);
            menuFileOpen.Text = "열기(&O)...";
            menuFileOpen.Click += menuFileOpen_Click;
            // 
            // menuFileClose
            // 
            menuFileClose.Name = "menuFileClose";
            menuFileClose.Size = new Size(203, 22);
            menuFileClose.Text = "닫기(&C)";
            menuFileClose.Click += menuFileClose_Click;
            // 
            // menuFileSep1
            // 
            menuFileSep1.Name = "menuFileSep1";
            menuFileSep1.Size = new Size(200, 6);
            // 
            // menuFileSave
            // 
            menuFileSave.Name = "menuFileSave";
            menuFileSave.ShortcutKeys = Keys.Control | Keys.S;
            menuFileSave.Size = new Size(203, 22);
            menuFileSave.Text = "저장(&S)";
            menuFileSave.Click += menuFileSave_Click;
            // 
            // menuFileSaveAs
            // 
            menuFileSaveAs.Name = "menuFileSaveAs";
            menuFileSaveAs.Size = new Size(203, 22);
            menuFileSaveAs.Text = "다른 이름으로 저장(&A)...";
            menuFileSaveAs.Click += menuFileSaveAs_Click;
            // 
            // menuFileSep2
            // 
            menuFileSep2.Name = "menuFileSep2";
            menuFileSep2.Size = new Size(200, 6);
            // 
            // menuFileExit
            // 
            menuFileExit.Name = "menuFileExit";
            menuFileExit.Size = new Size(203, 22);
            menuFileExit.Text = "종료(&X)";
            menuFileExit.Click += menuFileExit_Click;
            // 
            // menuEdit
            // 
            menuEdit.DropDownItems.AddRange(new ToolStripItem[] { menuEditGoTo, menuEditFind, menuEditFindPrev, menuEditReplace });
            menuEdit.Name = "menuEdit";
            menuEdit.Size = new Size(57, 20);
            menuEdit.Text = "편집(&E)";
            // 
            // menuEditGoTo
            // 
            menuEditGoTo.Name = "menuEditGoTo";
            menuEditGoTo.ShortcutKeys = Keys.Control | Keys.G;
            menuEditGoTo.Size = new Size(229, 22);
            menuEditGoTo.Text = "오프셋으로 이동(&G)...";
            menuEditGoTo.Click += menuEditGoTo_Click;
            // 
            // menuEditFind
            // 
            menuEditFind.Name = "menuEditFind";
            menuEditFind.ShortcutKeys = Keys.Control | Keys.F;
            menuEditFind.Size = new Size(229, 22);
            menuEditFind.Text = "찾기(&F)";
            menuEditFind.Click += menuEditFind_Click;
            // 
            // menuEditFindPrev
            // 
            menuEditFindPrev.Name = "menuEditFindPrev";
            menuEditFindPrev.ShortcutKeys = Keys.Shift | Keys.F3;
            menuEditFindPrev.Size = new Size(229, 22);
            menuEditFindPrev.Text = "이전 찾기";
            menuEditFindPrev.Click += menuEditFindPrev_Click;
            // 
            // menuEditReplace
            // 
            menuEditReplace.Name = "menuEditReplace";
            menuEditReplace.ShortcutKeys = Keys.Control | Keys.H;
            menuEditReplace.Size = new Size(229, 22);
            menuEditReplace.Text = "바꾸기(&H)";
            menuEditReplace.Click += menuEditReplace_Click;
            // 
            // statusStrip1
            // 
            statusStrip1.Items.AddRange(new ToolStripItem[] { statusLabelOffset, statusLabelSep1, statusLabelSize, statusLabelSep2, statusLabelPath });
            statusStrip1.Location = new Point(0, 754);
            statusStrip1.Name = "statusStrip1";
            statusStrip1.Padding = new Padding(1, 0, 16, 0);
            statusStrip1.Size = new Size(1090, 22);
            statusStrip1.Stretch = false;
            statusStrip1.TabIndex = 2;
            statusStrip1.Text = "statusStrip1";
            // 
            // statusLabelOffset
            // 
            statusLabelOffset.Name = "statusLabelOffset";
            statusLabelOffset.Size = new Size(119, 17);
            statusLabelOffset.Text = "오프셋: 0x00000000";
            // 
            // statusLabelSep1
            // 
            statusLabelSep1.Name = "statusLabelSep1";
            statusLabelSep1.Size = new Size(10, 17);
            statusLabelSep1.Text = "|";
            // 
            // statusLabelSize
            // 
            statusLabelSize.Name = "statusLabelSize";
            statusLabelSize.Size = new Size(85, 17);
            statusLabelSize.Text = "크기: 0 바이트";
            // 
            // statusLabelSep2
            // 
            statusLabelSep2.Name = "statusLabelSep2";
            statusLabelSep2.Size = new Size(10, 17);
            statusLabelSep2.Text = "|";
            // 
            // statusLabelPath
            // 
            statusLabelPath.Name = "statusLabelPath";
            statusLabelPath.Size = new Size(818, 17);
            statusLabelPath.Spring = true;
            statusLabelPath.Text = "(없음)";
            statusLabelPath.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // panelFindReplace
            // 
            panelFindReplace.BorderStyle = BorderStyle.FixedSingle;
            panelFindReplace.Controls.Add(tableLayoutFindReplace);
            panelFindReplace.Dock = DockStyle.Top;
            panelFindReplace.Location = new Point(0, 24);
            panelFindReplace.Name = "panelFindReplace";
            panelFindReplace.Padding = new Padding(8, 6, 8, 6);
            panelFindReplace.Size = new Size(1090, 78);
            panelFindReplace.TabIndex = 3;
            // 
            // tableLayoutFindReplace
            // 
            tableLayoutFindReplace.ColumnCount = 3;
            tableLayoutFindReplace.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90F));
            tableLayoutFindReplace.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 420F));
            tableLayoutFindReplace.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            tableLayoutFindReplace.Controls.Add(lblFindToolbar, 0, 0);
            tableLayoutFindReplace.Controls.Add(txtFindToolbar, 1, 0);
            tableLayoutFindReplace.Controls.Add(flowFindNextButton, 2, 0);
            tableLayoutFindReplace.Controls.Add(lblReplaceToolbar, 0, 1);
            tableLayoutFindReplace.Controls.Add(txtReplaceToolbar, 1, 1);
            tableLayoutFindReplace.Controls.Add(flowReplaceButtons, 2, 1);
            tableLayoutFindReplace.Dock = DockStyle.Fill;
            tableLayoutFindReplace.Location = new Point(8, 6);
            tableLayoutFindReplace.Name = "tableLayoutFindReplace";
            tableLayoutFindReplace.RowCount = 2;
            tableLayoutFindReplace.RowStyles.Add(new RowStyle(SizeType.Percent, 50F));
            tableLayoutFindReplace.RowStyles.Add(new RowStyle(SizeType.Percent, 50F));
            tableLayoutFindReplace.Size = new Size(1072, 64);
            tableLayoutFindReplace.TabIndex = 0;
            // 
            // lblFindToolbar
            // 
            lblFindToolbar.Anchor = AnchorStyles.Left;
            lblFindToolbar.AutoSize = true;
            lblFindToolbar.Location = new Point(3, 8);
            lblFindToolbar.Name = "lblFindToolbar";
            lblFindToolbar.Size = new Size(62, 15);
            lblFindToolbar.TabIndex = 0;
            lblFindToolbar.Text = "찾을 내용:";
            lblFindToolbar.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // txtFindToolbar
            // 
            txtFindToolbar.Anchor = AnchorStyles.Left;
            txtFindToolbar.Location = new Point(93, 4);
            txtFindToolbar.Name = "txtFindToolbar";
            txtFindToolbar.Size = new Size(380, 23);
            txtFindToolbar.TabIndex = 1;
            txtFindToolbar.KeyDown += txtFindToolbar_KeyDown;
            // 
            // flowFindNextButton
            // 
            flowFindNextButton.Controls.Add(btnToolbarFindNext);
            flowFindNextButton.Controls.Add(btnToolbarFindPrev);
            flowFindNextButton.Dock = DockStyle.Fill;
            flowFindNextButton.FlowDirection = FlowDirection.RightToLeft;
            flowFindNextButton.Location = new Point(510, 0);
            flowFindNextButton.Margin = new Padding(0);
            flowFindNextButton.Name = "flowFindNextButton";
            flowFindNextButton.Size = new Size(562, 32);
            flowFindNextButton.TabIndex = 2;
            flowFindNextButton.WrapContents = false;
            // 
            // btnToolbarFindNext
            // 
            btnToolbarFindNext.AutoSize = true;
            btnToolbarFindNext.Location = new Point(455, 3);
            btnToolbarFindNext.Name = "btnToolbarFindNext";
            btnToolbarFindNext.Size = new Size(104, 26);
            btnToolbarFindNext.TabIndex = 0;
            btnToolbarFindNext.Text = "다음 찾기";
            btnToolbarFindNext.UseVisualStyleBackColor = true;
            btnToolbarFindNext.Click += btnToolbarFindNext_Click;
            // 
            // btnToolbarFindPrev
            // 
            btnToolbarFindPrev.AutoSize = true;
            btnToolbarFindPrev.Location = new Point(345, 3);
            btnToolbarFindPrev.Name = "btnToolbarFindPrev";
            btnToolbarFindPrev.Size = new Size(104, 26);
            btnToolbarFindPrev.TabIndex = 1;
            btnToolbarFindPrev.Text = "이전 찾기";
            btnToolbarFindPrev.UseVisualStyleBackColor = true;
            btnToolbarFindPrev.Click += btnToolbarFindPrev_Click;
            // 
            // lblReplaceToolbar
            // 
            lblReplaceToolbar.Anchor = AnchorStyles.Left;
            lblReplaceToolbar.AutoSize = true;
            lblReplaceToolbar.Location = new Point(3, 40);
            lblReplaceToolbar.Name = "lblReplaceToolbar";
            lblReplaceToolbar.Size = new Size(62, 15);
            lblReplaceToolbar.TabIndex = 3;
            lblReplaceToolbar.Text = "바꿀 내용:";
            // 
            // txtReplaceToolbar
            // 
            txtReplaceToolbar.Anchor = AnchorStyles.Left;
            txtReplaceToolbar.Location = new Point(93, 36);
            txtReplaceToolbar.Name = "txtReplaceToolbar";
            txtReplaceToolbar.Size = new Size(380, 23);
            txtReplaceToolbar.TabIndex = 4;
            // 
            // flowReplaceButtons
            // 
            flowReplaceButtons.Controls.Add(btnToolbarReplaceAll);
            flowReplaceButtons.Controls.Add(btnToolbarReplace);
            flowReplaceButtons.Dock = DockStyle.Fill;
            flowReplaceButtons.FlowDirection = FlowDirection.RightToLeft;
            flowReplaceButtons.Location = new Point(510, 32);
            flowReplaceButtons.Margin = new Padding(0);
            flowReplaceButtons.Name = "flowReplaceButtons";
            flowReplaceButtons.Size = new Size(562, 32);
            flowReplaceButtons.TabIndex = 5;
            flowReplaceButtons.WrapContents = false;
            // 
            // btnToolbarReplaceAll
            // 
            btnToolbarReplaceAll.Location = new Point(455, 3);
            btnToolbarReplaceAll.Name = "btnToolbarReplaceAll";
            btnToolbarReplaceAll.Size = new Size(104, 26);
            btnToolbarReplaceAll.TabIndex = 1;
            btnToolbarReplaceAll.Text = "모두 바꾸기";
            btnToolbarReplaceAll.UseVisualStyleBackColor = true;
            btnToolbarReplaceAll.Click += btnToolbarReplaceAll_Click;
            // 
            // btnToolbarReplace
            // 
            btnToolbarReplace.Location = new Point(345, 3);
            btnToolbarReplace.Name = "btnToolbarReplace";
            btnToolbarReplace.Size = new Size(104, 26);
            btnToolbarReplace.TabIndex = 0;
            btnToolbarReplace.Text = "바꾸기";
            btnToolbarReplace.UseVisualStyleBackColor = true;
            btnToolbarReplace.Click += btnToolbarReplace_Click;
            // 
            // hexGrid
            // 
            hexGrid.AllowUserToAddRows = false;
            hexGrid.AllowUserToDeleteRows = false;
            hexGrid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            hexGrid.Dock = DockStyle.Fill;
            hexGrid.Location = new Point(0, 102);
            hexGrid.Margin = new Padding(4, 3, 4, 3);
            hexGrid.Name = "hexGrid";
            hexGrid.RowHeadersWidth = 60;
            hexGrid.RowTemplate.Height = 21;
            hexGrid.SelectionMode = DataGridViewSelectionMode.CellSelect;
            hexGrid.Size = new Size(1090, 652);
            hexGrid.TabIndex = 1;
            hexGrid.VirtualMode = true;
            hexGrid.CellValueNeeded += hexGrid_CellValueNeeded;
            hexGrid.CellValuePushed += hexGrid_CellValuePushed;
            hexGrid.SelectionChanged += hexGrid_SelectionChanged;
            hexGrid.KeyDown += hexGrid_KeyDown;
            // 
            // panelHexGridEmpty
            // 
            panelHexGridEmpty.BackColor = SystemColors.Window;
            panelHexGridEmpty.Dock = DockStyle.Fill;
            panelHexGridEmpty.Location = new Point(0, 102);
            panelHexGridEmpty.Name = "panelHexGridEmpty";
            panelHexGridEmpty.Size = new Size(1090, 652);
            panelHexGridEmpty.TabIndex = 4;
            // 
            // HexaEditorV10
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1090, 776);
            Controls.Add(hexGrid);
            Controls.Add(panelHexGridEmpty);
            Controls.Add(panelFindReplace);
            Controls.Add(statusStrip1);
            Controls.Add(menuStrip1);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuStrip1;
            Margin = new Padding(4, 3, 4, 3);
            MaximizeBox = false;
            MinimumSize = new Size(640, 480);
            Name = "HexaEditorV10";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "바이너리 편집기";
            menuStrip1.ResumeLayout(false);
            menuStrip1.PerformLayout();
            statusStrip1.ResumeLayout(false);
            statusStrip1.PerformLayout();
            panelFindReplace.ResumeLayout(false);
            tableLayoutFindReplace.ResumeLayout(false);
            tableLayoutFindReplace.PerformLayout();
            flowFindNextButton.ResumeLayout(false);
            flowFindNextButton.PerformLayout();
            flowReplaceButtons.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)hexGrid).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private MenuStrip menuStrip1;
        private ToolStripMenuItem menuFile;
        private ToolStripMenuItem menuFileNew;
        private ToolStripMenuItem menuFileOpen;
        private ToolStripMenuItem menuFileClose;
        private ToolStripSeparator menuFileSep1;
        private ToolStripMenuItem menuFileSave;
        private ToolStripMenuItem menuFileSaveAs;
        private ToolStripSeparator menuFileSep2;
        private ToolStripMenuItem menuFileExit;
        private ToolStripMenuItem menuEdit;
        private ToolStripMenuItem menuEditGoTo;
        private ToolStripMenuItem menuEditFind;
        private ToolStripMenuItem menuEditFindPrev;
        private ToolStripMenuItem menuEditReplace;
        private StatusStrip statusStrip1;
        private ToolStripStatusLabel statusLabelOffset;
        private ToolStripStatusLabel statusLabelSep1;
        private ToolStripStatusLabel statusLabelSize;
        private ToolStripStatusLabel statusLabelSep2;
        private ToolStripStatusLabel statusLabelPath;
        private Panel panelFindReplace;
        private TableLayoutPanel tableLayoutFindReplace;
        private Label lblFindToolbar;
        private TextBox txtFindToolbar;
        private FlowLayoutPanel flowFindNextButton;
        private Button btnToolbarFindNext;
        private Button btnToolbarFindPrev;
        private Label lblReplaceToolbar;
        private TextBox txtReplaceToolbar;
        private FlowLayoutPanel flowReplaceButtons;
        private Button btnToolbarReplace;
        private Button btnToolbarReplaceAll;
        private DataGridView hexGrid;
        private Panel panelHexGridEmpty;
    }
}

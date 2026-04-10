namespace MemoPadV10;

partial class MemoPadForm
{
    private System.ComponentModel.IContainer components = null!;
    private MenuStrip menuStrip1 = null!;
    private ToolStripMenuItem memoMenuToolStripMenuItem = null!;
    private ToolStripMenuItem addMemoToolStripMenuItem = null!;
    private ToolStripMenuItem showMemoListToolStripMenuItem = null!;
    private ToolStripMenuItem viewMenuToolStripMenuItem = null!;
    private ToolStripMenuItem fontSizeMenuToolStripMenuItem = null!;
    private ToolStripMenuItem fontSize10ToolStripMenuItem = null!;
    private ToolStripMenuItem fontSize12ToolStripMenuItem = null!;
    private ToolStripMenuItem fontSize14ToolStripMenuItem = null!;
    private ToolStripMenuItem fontSize16ToolStripMenuItem = null!;
    private ToolStripMenuItem fontSize18ToolStripMenuItem = null!;
    private ToolStripMenuItem fontSize20ToolStripMenuItem = null!;
    private Button addMemoButton = null!;
    private LinedRichTextBox memoEditor = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        menuStrip1 = new MenuStrip();
        memoMenuToolStripMenuItem = new ToolStripMenuItem();
        addMemoToolStripMenuItem = new ToolStripMenuItem();
        showMemoListToolStripMenuItem = new ToolStripMenuItem();
        viewMenuToolStripMenuItem = new ToolStripMenuItem();
        fontSizeMenuToolStripMenuItem = new ToolStripMenuItem();
        fontSize10ToolStripMenuItem = new ToolStripMenuItem();
        fontSize12ToolStripMenuItem = new ToolStripMenuItem();
        fontSize14ToolStripMenuItem = new ToolStripMenuItem();
        fontSize16ToolStripMenuItem = new ToolStripMenuItem();
        fontSize18ToolStripMenuItem = new ToolStripMenuItem();
        fontSize20ToolStripMenuItem = new ToolStripMenuItem();
        addMemoButton = new Button();
        memoEditor = new LinedRichTextBox();
        menuStrip1.SuspendLayout();
        SuspendLayout();
        //
        // menuStrip1
        //
        menuStrip1.Items.AddRange(new ToolStripItem[] { memoMenuToolStripMenuItem, viewMenuToolStripMenuItem });
        menuStrip1.Location = new Point(0, 0);
        menuStrip1.Name = "menuStrip1";
        menuStrip1.Size = new Size(800, 24);
        menuStrip1.TabIndex = 0;
        menuStrip1.Text = "menuStrip1";
        //
        // memoMenuToolStripMenuItem
        //
        memoMenuToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { addMemoToolStripMenuItem, showMemoListToolStripMenuItem });
        memoMenuToolStripMenuItem.Name = "memoMenuToolStripMenuItem";
        memoMenuToolStripMenuItem.Size = new Size(49, 20);
        memoMenuToolStripMenuItem.Text = "메모";
        //
        // addMemoToolStripMenuItem
        //
        addMemoToolStripMenuItem.Name = "addMemoToolStripMenuItem";
        addMemoToolStripMenuItem.Size = new Size(150, 22);
        addMemoToolStripMenuItem.Text = "메모 추가";
        addMemoToolStripMenuItem.Click += addMemoToolStripMenuItem_Click;
        //
        // showMemoListToolStripMenuItem
        //
        showMemoListToolStripMenuItem.Name = "showMemoListToolStripMenuItem";
        showMemoListToolStripMenuItem.Size = new Size(150, 22);
        showMemoListToolStripMenuItem.Text = "메모 목록 보기";
        showMemoListToolStripMenuItem.Click += showMemoListToolStripMenuItem_Click;
        //
        // viewMenuToolStripMenuItem
        //
        viewMenuToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { fontSizeMenuToolStripMenuItem });
        viewMenuToolStripMenuItem.Name = "viewMenuToolStripMenuItem";
        viewMenuToolStripMenuItem.Size = new Size(41, 20);
        viewMenuToolStripMenuItem.Text = "보기";
        //
        // fontSizeMenuToolStripMenuItem
        //
        fontSizeMenuToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { fontSize10ToolStripMenuItem, fontSize12ToolStripMenuItem, fontSize14ToolStripMenuItem, fontSize16ToolStripMenuItem, fontSize18ToolStripMenuItem, fontSize20ToolStripMenuItem });
        fontSizeMenuToolStripMenuItem.Name = "fontSizeMenuToolStripMenuItem";
        fontSizeMenuToolStripMenuItem.Size = new Size(180, 22);
        fontSizeMenuToolStripMenuItem.Text = "폰트 크기";
        //
        // fontSize10ToolStripMenuItem
        //
        fontSize10ToolStripMenuItem.Name = "fontSize10ToolStripMenuItem";
        fontSize10ToolStripMenuItem.Size = new Size(180, 22);
        fontSize10ToolStripMenuItem.Text = "10";
        fontSize10ToolStripMenuItem.Click += fontSizeMenuItem_Click;
        //
        // fontSize12ToolStripMenuItem
        //
        fontSize12ToolStripMenuItem.Name = "fontSize12ToolStripMenuItem";
        fontSize12ToolStripMenuItem.Size = new Size(180, 22);
        fontSize12ToolStripMenuItem.Text = "12";
        fontSize12ToolStripMenuItem.Click += fontSizeMenuItem_Click;
        //
        // fontSize14ToolStripMenuItem
        //
        fontSize14ToolStripMenuItem.Name = "fontSize14ToolStripMenuItem";
        fontSize14ToolStripMenuItem.Size = new Size(180, 22);
        fontSize14ToolStripMenuItem.Text = "14";
        fontSize14ToolStripMenuItem.Click += fontSizeMenuItem_Click;
        //
        // fontSize16ToolStripMenuItem
        //
        fontSize16ToolStripMenuItem.Name = "fontSize16ToolStripMenuItem";
        fontSize16ToolStripMenuItem.Size = new Size(180, 22);
        fontSize16ToolStripMenuItem.Text = "16";
        fontSize16ToolStripMenuItem.Click += fontSizeMenuItem_Click;
        //
        // fontSize18ToolStripMenuItem
        //
        fontSize18ToolStripMenuItem.Name = "fontSize18ToolStripMenuItem";
        fontSize18ToolStripMenuItem.Size = new Size(180, 22);
        fontSize18ToolStripMenuItem.Text = "18";
        fontSize18ToolStripMenuItem.Click += fontSizeMenuItem_Click;
        //
        // fontSize20ToolStripMenuItem
        //
        fontSize20ToolStripMenuItem.Name = "fontSize20ToolStripMenuItem";
        fontSize20ToolStripMenuItem.Size = new Size(180, 22);
        fontSize20ToolStripMenuItem.Text = "20";
        fontSize20ToolStripMenuItem.Click += fontSizeMenuItem_Click;
        //
        // addMemoButton
        //
        addMemoButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        addMemoButton.Font = new Font("맑은 고딕", 10f, FontStyle.Bold, GraphicsUnit.Point, 129);
        addMemoButton.Location = new Point(662, 32);
        addMemoButton.Name = "addMemoButton";
        addMemoButton.Size = new Size(126, 36);
        addMemoButton.TabIndex = 2;
        addMemoButton.Text = "📝 메모 추가";
        addMemoButton.UseVisualStyleBackColor = true;
        addMemoButton.Click += addMemoButton_Click;
        //
        // memoEditor
        //
        memoEditor.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        memoEditor.BackColor = Color.FromArgb(255, 252, 170);
        memoEditor.BorderStyle = BorderStyle.FixedSingle;
        memoEditor.Font = new Font("맑은 고딕", 11f, FontStyle.Regular, GraphicsUnit.Point, 129);
        memoEditor.LineColor = Color.FromArgb(230, 196, 90);
        memoEditor.Location = new Point(12, 74);
        memoEditor.Name = "memoEditor";
        memoEditor.Size = new Size(776, 364);
        memoEditor.TabIndex = 1;
        memoEditor.Text = "";
        memoEditor.WordWrap = true;
        //
        // MemoPadForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(255, 252, 170);
        ClientSize = new Size(800, 450);
        Controls.Add(addMemoButton);
        Controls.Add(memoEditor);
        Controls.Add(menuStrip1);
        MainMenuStrip = menuStrip1;
        Name = "MemoPadForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "📝 Memo Pad";
        menuStrip1.ResumeLayout(false);
        menuStrip1.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

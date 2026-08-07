using FileMasterWinV10.Controls;

namespace FileMasterWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private MenuStrip menuStrip;
    private ToolStrip toolStrip;
    private StatusStrip statusStrip;
    private ToolStripStatusLabel statusLabel;
    private SplitContainer mainSplit;
    private SplitContainer leftRightSplit;
    private FilePanel leftPanel;
    private FilePanel rightPanel;
    private PreviewPanel previewPanel;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            components?.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        menuStrip = new MenuStrip();
        toolStrip = new ToolStrip();
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        mainSplit = new SplitContainer();
        leftRightSplit = new SplitContainer();
        leftPanel = new FilePanel();
        rightPanel = new FilePanel();
        previewPanel = new PreviewPanel();
        statusStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)mainSplit).BeginInit();
        mainSplit.Panel1.SuspendLayout();
        mainSplit.Panel2.SuspendLayout();
        mainSplit.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)leftRightSplit).BeginInit();
        leftRightSplit.Panel1.SuspendLayout();
        leftRightSplit.Panel2.SuspendLayout();
        leftRightSplit.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip
        // 
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1280, 24);
        menuStrip.TabIndex = 3;
        menuStrip.Text = "menuStrip";
        // 
        // toolStrip
        // 
        toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        toolStrip.Location = new Point(0, 24);
        toolStrip.Name = "toolStrip";
        toolStrip.Padding = new Padding(6, 4, 6, 4);
        toolStrip.Size = new Size(1280, 25);
        toolStrip.TabIndex = 2;
        toolStrip.Text = "toolStrip";
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel });
        statusStrip.Location = new Point(0, 758);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1280, 22);
        statusStrip.SizingGrip = false;
        statusStrip.TabIndex = 1;
        statusStrip.Text = "statusStrip";
        // 
        // statusLabel
        // 
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(1265, 17);
        statusLabel.Spring = true;
        statusLabel.Text = "Command Center 준비 완료";
        statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        //
        // mainSplit
        // 
        mainSplit.Dock = DockStyle.Fill;
        mainSplit.Location = new Point(0, 83);
        mainSplit.Name = "mainSplit";
        mainSplit.Orientation = Orientation.Horizontal;
        // 
        // mainSplit.Panel1
        // 
        mainSplit.Panel1.Controls.Add(leftRightSplit);
        // 
        // mainSplit.Panel2
        // 
        mainSplit.Panel2.Controls.Add(previewPanel);
        mainSplit.Panel2Collapsed = true;
        mainSplit.Size = new Size(1280, 675);
        mainSplit.SplitterDistance = 500;
        mainSplit.TabIndex = 0;
        // 
        // leftRightSplit
        // 
        leftRightSplit.Dock = DockStyle.Fill;
        leftRightSplit.Location = new Point(0, 0);
        leftRightSplit.Name = "leftRightSplit";
        // 
        // leftRightSplit.Panel1
        // 
        leftRightSplit.Panel1.Controls.Add(leftPanel);
        // 
        // leftRightSplit.Panel2
        // 
        leftRightSplit.Panel2.Controls.Add(rightPanel);
        leftRightSplit.Size = new Size(1280, 675);
        leftRightSplit.SplitterDistance = 640;
        leftRightSplit.TabIndex = 0;
        // 
        // leftPanel
        // 
        leftPanel.BackColor = Color.FromArgb(245, 246, 248);
        leftPanel.Dock = DockStyle.Fill;
        leftPanel.Font = new Font("Segoe UI", 9.25F);
        leftPanel.Location = new Point(0, 0);
        leftPanel.Name = "leftPanel";
        leftPanel.Padding = new Padding(1);
        leftPanel.Size = new Size(640, 675);
        leftPanel.TabIndex = 0;
        // 
        // rightPanel
        // 
        rightPanel.BackColor = Color.FromArgb(245, 246, 248);
        rightPanel.Dock = DockStyle.Fill;
        rightPanel.Font = new Font("Segoe UI", 9.25F);
        rightPanel.Location = new Point(0, 0);
        rightPanel.Name = "rightPanel";
        rightPanel.Padding = new Padding(1);
        rightPanel.PanelSide = FilePanelSide.Right;
        rightPanel.Size = new Size(636, 675);
        rightPanel.TabIndex = 0;
        rightPanel.Load += rightPanel_Load;
        // 
        // previewPanel
        // 
        previewPanel.BackColor = Color.FromArgb(255, 255, 255);
        previewPanel.Dock = DockStyle.Fill;
        previewPanel.Location = new Point(0, 0);
        previewPanel.Name = "previewPanel";
        previewPanel.Padding = new Padding(8);
        previewPanel.Size = new Size(150, 46);
        previewPanel.TabIndex = 0;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(1400, 800);
        Controls.Add(mainSplit);
        Controls.Add(toolStrip);
        Controls.Add(menuStrip);
        Controls.Add(statusStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(1140, 560);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Command Center";
        FormClosing += MainForm_FormClosing;
        Load += MainForm_Load;
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        mainSplit.Panel1.ResumeLayout(false);
        mainSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)mainSplit).EndInit();
        mainSplit.ResumeLayout(false);
        leftRightSplit.Panel1.ResumeLayout(false);
        leftRightSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)leftRightSplit).EndInit();
        leftRightSplit.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }
}

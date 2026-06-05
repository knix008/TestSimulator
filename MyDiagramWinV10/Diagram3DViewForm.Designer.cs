namespace MyDiagramWinV10;

partial class Diagram3DViewForm
{
    private System.ComponentModel.IContainer components = null;

    private MyDiagramWinV10.Controls.DoubleBufferedPanel _viewPanel;
    private StatusStrip _statusStrip;
    private ToolStripStatusLabel _statusLabel;
    private ToolStrip _toolStrip;
    private ToolStripButton _btnResetView;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        _viewPanel = new MyDiagramWinV10.Controls.DoubleBufferedPanel();
        _statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel();
        _toolStrip = new ToolStrip();
        _btnResetView = new ToolStripButton();

        _toolStrip.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();

        // 
        // _viewPanel
        // 
        _viewPanel.BackColor = Color.FromArgb(30, 34, 48);
        _viewPanel.Dock = DockStyle.Fill;
        _viewPanel.Location = new Point(0, 25);
        _viewPanel.Name = "_viewPanel";
        _viewPanel.Size = new Size(984, 653);
        _viewPanel.TabIndex = 0;
        _viewPanel.MouseDown += ViewPanel_MouseDown;
        _viewPanel.MouseMove += ViewPanel_MouseMove;
        _viewPanel.MouseUp += ViewPanel_MouseUp;
        _viewPanel.MouseWheel += ViewPanel_MouseWheel;
        _viewPanel.Paint += ViewPanel_Paint;
        _viewPanel.Resize += ViewPanel_Resize;

        // 
        // _toolStrip
        // 
        _toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        _toolStrip.Items.AddRange(new ToolStripItem[] { _btnResetView });
        _toolStrip.Location = new Point(0, 0);
        _toolStrip.Name = "_toolStrip";
        _toolStrip.Size = new Size(984, 25);
        _toolStrip.TabIndex = 1;

        // 
        // _btnResetView
        // 
        _btnResetView.DisplayStyle = ToolStripItemDisplayStyle.Text;
        _btnResetView.Name = "_btnResetView";
        _btnResetView.Size = new Size(83, 22);
        _btnResetView.Text = "뷰 초기화";
        _btnResetView.Click += BtnResetView_Click;

        // 
        // _statusStrip
        // 
        _statusStrip.Items.AddRange(new ToolStripItem[] { _statusLabel });
        _statusStrip.Location = new Point(0, 678);
        _statusStrip.Name = "_statusStrip";
        _statusStrip.Size = new Size(984, 22);
        _statusStrip.TabIndex = 2;

        // 
        // _statusLabel
        // 
        _statusLabel.Name = "_statusLabel";
        _statusLabel.Size = new Size(969, 17);
        _statusLabel.Spring = true;
        _statusLabel.Text = "초기화 중...";
        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;

        // 
        // Diagram3DViewForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(984, 700);
        Controls.Add(_viewPanel);
        Controls.Add(_toolStrip);
        Controls.Add(_statusStrip);
        KeyPreview = true;
        MinimumSize = new Size(720, 480);
        Name = "Diagram3DViewForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "3D 다이어그램 보기";
        KeyDown += Diagram3DViewForm_KeyDown;
        KeyUp += Diagram3DViewForm_KeyUp;

        _toolStrip.ResumeLayout(false);
        _statusStrip.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }
}


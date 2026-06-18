#nullable disable

namespace CodeAnalyzer.Controls;

partial class SequenceDiagramTabHost
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        _bannerLabel = new Label();
        _pager = new EntryPointTabPager();
        _messageLabel = new Label();
        _tabs = new NavigationTabControl();
        SuspendLayout();
        //
        // _bannerLabel
        //
        _bannerLabel.Dock = DockStyle.Top;
        _bannerLabel.Height = 28;
        _bannerLabel.Padding = new Padding(8, 6, 8, 0);
        _bannerLabel.ForeColor = Color.FromArgb(30, 85, 130);
        _bannerLabel.BackColor = Color.FromArgb(224, 242, 255);
        _bannerLabel.Visible = false;
        //
        // _pager
        //
        // (EntryPointTabPager는 자체 InitializeComponent에서 Dock=Top, Height=32 등 설정)
        //
        // _messageLabel
        //
        _messageLabel.Dock = DockStyle.Fill;
        _messageLabel.TextAlign = ContentAlignment.MiddleCenter;
        _messageLabel.ForeColor = Color.FromArgb(100, 110, 125);
        _messageLabel.Font = new Font("Segoe UI", 10f);
        _messageLabel.Visible = false;
        //
        // _tabs — NavigationTabControl, 항상 Dock=Fill (자체 생성자에서 설정)
        //
        _tabs.Visible = false;
        //
        // SequenceDiagramTabHost
        //
        BackColor = Color.White;
        // 추가 역순: _tabs → Fill 영역 아래서, _messageLabel → 중앙, _headerPanel은 코드에서 추가
        Controls.Add(_tabs);
        Controls.Add(_messageLabel);
        ResumeLayout(false);
    }

    private Label _bannerLabel = null!;
    private EntryPointTabPager _pager = null!;
    private Label _messageLabel = null!;
    private NavigationTabControl _tabs = null!;
}

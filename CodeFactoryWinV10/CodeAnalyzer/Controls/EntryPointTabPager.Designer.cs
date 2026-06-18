#nullable disable

namespace CodeAnalyzer.Controls;

partial class EntryPointTabPager
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
        _summaryLabel = new Label();
        _pageLabel = new Label();
        _pageCombo = new ComboBox();
        _prevPageButton = new Button();
        _nextPageButton = new Button();
        _navPanel = new FlowLayoutPanel();
        _navPanel.SuspendLayout();
        SuspendLayout();
        //
        // _summaryLabel
        //
        _summaryLabel.AutoSize = false;
        _summaryLabel.Dock = DockStyle.Fill;
        _summaryLabel.ForeColor = Color.FromArgb(70, 80, 95);
        _summaryLabel.TextAlign = ContentAlignment.MiddleLeft;
        _summaryLabel.AutoEllipsis = true;
        //
        // _pageLabel
        //
        _pageLabel.AutoSize = false;
        _pageLabel.Width = PageLabelWidth;
        _pageLabel.Height = 24;
        _pageLabel.Margin = new Padding(0, 0, 4, 0);
        _pageLabel.Text = "페이지:";
        _pageLabel.ForeColor = Color.FromArgb(70, 80, 95);
        _pageLabel.TextAlign = ContentAlignment.MiddleRight;
        _pageLabel.Padding = new Padding(4, 0, 4, 0);
        //
        // _pageCombo
        //
        _pageCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _pageCombo.Width = PageComboWidth;
        _pageCombo.Margin = new Padding(0, 0, 4, 0);
        //
        // _prevPageButton
        //
        _prevPageButton.Text = "◀";
        _prevPageButton.AutoSize = false;
        _prevPageButton.Width = NavButtonWidth;
        _prevPageButton.Height = 24;
        _prevPageButton.Margin = new Padding(0, 0, 4, 0);
        _prevPageButton.FlatStyle = FlatStyle.Standard;
        _prevPageButton.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        _prevPageButton.ForeColor = Color.FromArgb(30, 55, 95);
        _prevPageButton.Enabled = false;
        //
        // _nextPageButton
        //
        _nextPageButton.Text = "▶";
        _nextPageButton.AutoSize = false;
        _nextPageButton.Width = NavButtonWidth;
        _nextPageButton.Height = 24;
        _nextPageButton.Margin = new Padding(4, 0, 0, 0);
        _nextPageButton.FlatStyle = FlatStyle.Standard;
        _nextPageButton.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        _nextPageButton.ForeColor = Color.FromArgb(30, 55, 95);
        _nextPageButton.Enabled = false;
        //
        // _navPanel — [◀][페이지:][ComboBox][▶]
        //
        _navPanel.AutoSize = true;
        _navPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        _navPanel.Dock = DockStyle.Right;
        _navPanel.FlowDirection = FlowDirection.LeftToRight;
        _navPanel.WrapContents = false;
        _navPanel.Padding = new Padding(0, 2, 0, 2);
        _navPanel.Controls.Add(_prevPageButton);
        _navPanel.Controls.Add(_pageLabel);
        _navPanel.Controls.Add(_pageCombo);
        _navPanel.Controls.Add(_nextPageButton);
        //
        // EntryPointTabPager
        //
        Dock = DockStyle.Top;
        Height = 36;
        MinimumSize = new Size(NavButtonWidth * 2 + PageLabelWidth + PageComboWidth + 24, 36);
        Padding = new Padding(8, 4, 8, 4);
        BackColor = Color.FromArgb(248, 249, 252);
        Visible = false;
        Controls.Add(_summaryLabel);
        Controls.Add(_navPanel);
        _navPanel.ResumeLayout(false);
        ResumeLayout(false);
    }

    private Label _summaryLabel = null!;
    private Label _pageLabel = null!;
    private ComboBox _pageCombo = null!;
    private Button _prevPageButton = null!;
    private Button _nextPageButton = null!;
    private FlowLayoutPanel _navPanel = null!;
}

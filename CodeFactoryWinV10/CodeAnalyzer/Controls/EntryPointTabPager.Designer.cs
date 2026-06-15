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
        _middlePanel = new Panel();
        _middlePanel.SuspendLayout();
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
        _pageLabel.Dock = DockStyle.Left;
        _pageLabel.Text = "페이지:";
        _pageLabel.ForeColor = Color.FromArgb(70, 80, 95);
        _pageLabel.TextAlign = ContentAlignment.MiddleRight;
        _pageLabel.Padding = new Padding(4, 0, 4, 0);
        //
        // _pageCombo
        //
        _pageCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _pageCombo.Dock = DockStyle.Fill;
        //
        // _prevPageButton
        //
        _prevPageButton.Text = "◀";
        _prevPageButton.AutoSize = false;
        _prevPageButton.Width = NavButtonWidth;
        _prevPageButton.Dock = DockStyle.Left;
        _prevPageButton.FlatStyle = FlatStyle.System;
        _prevPageButton.ForeColor = Color.FromArgb(50, 70, 100);
        _prevPageButton.Enabled = false;
        //
        // _nextPageButton
        //
        _nextPageButton.Text = "▶";
        _nextPageButton.AutoSize = false;
        _nextPageButton.Width = NavButtonWidth;
        _nextPageButton.Dock = DockStyle.Right;
        _nextPageButton.FlatStyle = FlatStyle.System;
        _nextPageButton.ForeColor = Color.FromArgb(50, 70, 100);
        _nextPageButton.Enabled = false;
        //
        // _middlePanel — [◀][페이지:][ComboBox] 우측 정렬 그룹
        //
        _middlePanel.Dock = DockStyle.Right;
        _middlePanel.Width = NavButtonWidth + PageLabelWidth + PageComboWidth;
        _middlePanel.Controls.Add(_pageCombo);
        _middlePanel.Controls.Add(_pageLabel);
        _middlePanel.Controls.Add(_prevPageButton);
        //
        // EntryPointTabPager
        //
        Dock = DockStyle.Top;
        Height = 32;
        MinimumSize = new Size(NavButtonWidth, 32);
        Padding = new Padding(8, 4, 4, 4);
        BackColor = Color.FromArgb(248, 249, 252);
        Visible = false;
        Controls.Add(_summaryLabel);
        Controls.Add(_middlePanel);
        Controls.Add(_nextPageButton);
        _middlePanel.ResumeLayout(false);
        ResumeLayout(false);
    }

    private Label _summaryLabel = null!;
    private Label _pageLabel = null!;
    private ComboBox _pageCombo = null!;
    private Button _prevPageButton = null!;
    private Button _nextPageButton = null!;
    private Panel _middlePanel = null!;
}

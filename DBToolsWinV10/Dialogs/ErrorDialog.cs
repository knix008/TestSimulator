using System;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Dialogs;

public class ErrorDialog : Form
{
	private const int ContentWidth = 520;

	private const int DetailsHeight = 220;

	private readonly string _clipboardText;

	private IContainer components = null;

	private Label lblSummary;

	private Label lblDetailsCaption;

	private TextBox txtDetails;

	private Button btnCopy;

	private Button btnClose;

	private Panel panelButtons;

	private Panel panelContent;

	private FlowLayoutPanel flowButtons;

	private ErrorDialog(string title, string summary, string details)
	{
		InitializeComponent();
		Text = title;
		lblSummary.Text = summary;
		bool hasDetails = !string.IsNullOrWhiteSpace(details);
		lblDetailsCaption.Visible = hasDetails;
		txtDetails.Visible = hasDetails;
		btnCopy.Visible = hasDetails;
		if (hasDetails)
		{
			txtDetails.Text = details;
			txtDetails.SelectionStart = 0;
			txtDetails.SelectionLength = 0;
		}

		_clipboardText = ErrorReporter.BuildClipboardText(summary, details ?? string.Empty);
		ApplyLayout(hasDetails);
		panelButtons.Resize += delegate
		{
			CenterButtonPanel();
		};
		base.Shown += delegate
		{
			CenterButtonPanel();
		};
		ModernTheme.ApplyThemeToForm(this);
		Localize();
	}

	private void Localize()
	{
		Text                    = L.S("ErrorTitle",    "오류");
		lblDetailsCaption.Text  = L.S("ErrorDetails",  "상세 내용");
		btnCopy.Text            = L.S("ErrorBtnCopy",  "전체 복사");
		btnClose.Text           = L.S("ErrorBtnClose", "닫기");
	}

	private void ApplyLayout(bool hasDetails)
	{
		int summaryHeight = TextRenderer.MeasureText(
			lblSummary.Text,
			lblSummary.Font,
			new Size(ContentWidth, int.MaxValue),
			TextFormatFlags.TextBoxControl | TextFormatFlags.WordBreak).Height;
		summaryHeight += lblSummary.Padding.Vertical + 4;
		lblSummary.Height = summaryHeight;

		int contentHeight = panelContent.Padding.Vertical + summaryHeight;
		if (hasDetails)
		{
			contentHeight += lblDetailsCaption.Height + DetailsHeight + 8;
		}

		int buttonHeight = panelButtons.Padding.Vertical + btnClose.Height;
		base.ClientSize = new Size(ContentWidth + panelContent.Padding.Horizontal, contentHeight + buttonHeight);
		MinimumSize = new Size(380, Math.Max(180, contentHeight + buttonHeight));
	}

	private void CenterButtonPanel()
	{
		flowButtons.Location = new Point(
			Math.Max(0, (panelButtons.ClientSize.Width - flowButtons.Width) / 2),
			Math.Max(0, (panelButtons.ClientSize.Height - flowButtons.Height) / 2));
	}

	public static void Show(IWin32Window owner, string title, Exception ex, string summary = null)
	{
		UiThread.Run(delegate
		{
			string displaySummary = ErrorReporter.BuildSummary(ex, summary);
			using ErrorDialog errorDialog = new ErrorDialog(title, displaySummary, ErrorReporter.Format(ex));
			errorDialog.ShowDialog(owner);
		});
	}

	public static void Show(IWin32Window owner, string title, string summary, string details = null)
	{
		UiThread.Run(delegate
		{
			using ErrorDialog errorDialog = new ErrorDialog(title, summary, details ?? string.Empty);
			errorDialog.ShowDialog(owner);
		});
	}

	private void BtnCopy_Click(object sender, EventArgs e)
	{
		try
		{
			ClipboardHelper.SetText(_clipboardText);
			btnCopy.Text = L.S("ErrorCopied", "복사됨");
		}
		catch (Exception ex)
		{
			btnCopy.Text = L.S("ErrorCopyFailed", "복사 실패");
			MessageBox.Show(this, ex.Message, L.S("ErrorClipboard", "클립보드"), MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
		}
	}

	private void BtnClose_Click(object sender, EventArgs e)
	{
		Close();
	}

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
        lblSummary = new Label();
        lblDetailsCaption = new Label();
        txtDetails = new TextBox();
        btnCopy = new Button();
        btnClose = new Button();
        panelButtons = new Panel();
        flowButtons = new FlowLayoutPanel();
        panelContent = new Panel();
        panelButtons.SuspendLayout();
        flowButtons.SuspendLayout();
        panelContent.SuspendLayout();
        SuspendLayout();
        // 
        // lblSummary
        // 
        lblSummary.Dock = DockStyle.Top;
        lblSummary.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        lblSummary.ForeColor = Color.FromArgb(17, 24, 39);
        lblSummary.Location = new Point(12, 12);
        lblSummary.Name = "lblSummary";
        lblSummary.Padding = new Padding(0, 0, 0, 6);
        lblSummary.Size = new Size(520, 23);
        lblSummary.TabIndex = 2;
        lblSummary.Text = "오류가 발생했습니다.";
        // 
        // lblDetailsCaption
        // 
        lblDetailsCaption.AutoSize = true;
        lblDetailsCaption.Dock = DockStyle.Top;
        lblDetailsCaption.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblDetailsCaption.ForeColor = Color.FromArgb(75, 85, 99);
        lblDetailsCaption.Location = new Point(12, 35);
        lblDetailsCaption.Name = "lblDetailsCaption";
        lblDetailsCaption.Padding = new Padding(0, 0, 0, 4);
        lblDetailsCaption.Size = new Size(58, 19);
        lblDetailsCaption.TabIndex = 1;
        lblDetailsCaption.Text = "상세 내용";
        // 
        // txtDetails
        // 
        txtDetails.BackColor = Color.FromArgb(248, 250, 252);
        txtDetails.BorderStyle = BorderStyle.FixedSingle;
        txtDetails.Dock = DockStyle.Top;
        txtDetails.Font = new Font("Consolas", 8.75F);
        txtDetails.ForeColor = Color.FromArgb(31, 41, 55);
        txtDetails.Location = new Point(12, 54);
        txtDetails.Multiline = true;
        txtDetails.Name = "txtDetails";
        txtDetails.ReadOnly = true;
        txtDetails.ScrollBars = ScrollBars.Vertical;
        txtDetails.Size = new Size(520, 220);
        txtDetails.TabIndex = 0;
        txtDetails.TabStop = false;
        txtDetails.WordWrap = false;
        // 
        // btnCopy
        // 
        btnCopy.Location = new Point(0, 0);
        btnCopy.Margin = new Padding(0, 0, 8, 0);
        btnCopy.Name = "btnCopy";
        btnCopy.Size = new Size(96, 30);
        btnCopy.TabIndex = 0;
        btnCopy.Text = "전체 복사";
        btnCopy.UseVisualStyleBackColor = true;
        btnCopy.Click += BtnCopy_Click;
        // 
        // btnClose
        // 
        btnClose.DialogResult = DialogResult.OK;
        btnClose.Location = new Point(104, 0);
        btnClose.Margin = new Padding(0);
        btnClose.Name = "btnClose";
        btnClose.Size = new Size(96, 30);
        btnClose.TabIndex = 1;
        btnClose.Text = "닫기";
        btnClose.UseVisualStyleBackColor = true;
        btnClose.Click += BtnClose_Click;
        // 
        // panelButtons
        // 
        panelButtons.Controls.Add(flowButtons);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Location = new Point(0, 308);
        panelButtons.Name = "panelButtons";
        panelButtons.Padding = new Padding(12, 10, 12, 10);
        panelButtons.Size = new Size(544, 52);
        panelButtons.TabIndex = 1;
        // 
        // flowButtons
        // 
        flowButtons.AutoSize = true;
        flowButtons.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowButtons.Controls.Add(btnCopy);
        flowButtons.Controls.Add(btnClose);
        flowButtons.Location = new Point(0, 0);
        flowButtons.Name = "flowButtons";
        flowButtons.Size = new Size(200, 30);
        flowButtons.TabIndex = 0;
        flowButtons.WrapContents = false;
        // 
        // panelContent
        // 
        panelContent.Controls.Add(txtDetails);
        panelContent.Controls.Add(lblDetailsCaption);
        panelContent.Controls.Add(lblSummary);
        panelContent.Dock = DockStyle.Fill;
        panelContent.Location = new Point(0, 0);
        panelContent.Name = "panelContent";
        panelContent.Padding = new Padding(12, 12, 12, 8);
        panelContent.Size = new Size(544, 308);
        panelContent.TabIndex = 0;
        // 
        // ErrorDialog
        // 
        AcceptButton = btnClose;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(250, 251, 253);
        CancelButton = btnClose;
        ClientSize = new Size(544, 360);
        Controls.Add(panelContent);
        Controls.Add(panelButtons);
        Font = new Font("Segoe UI", 9F);
        MaximizeBox = false;
        MinimizeBox = false;
        MinimumSize = new Size(380, 220);
        Name = "ErrorDialog";
        ShowIcon = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "오류";
        panelButtons.ResumeLayout(false);
        panelButtons.PerformLayout();
        flowButtons.ResumeLayout(false);
        panelContent.ResumeLayout(false);
        panelContent.PerformLayout();
        ResumeLayout(false);
    }
}

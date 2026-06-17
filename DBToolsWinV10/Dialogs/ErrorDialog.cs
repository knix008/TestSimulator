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
			btnCopy.Text = "복사됨";
		}
		catch (Exception ex)
		{
			btnCopy.Text = "복사 실패";
			MessageBox.Show(this, ex.Message, "클립보드", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
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
		this.lblSummary = new System.Windows.Forms.Label();
		this.lblDetailsCaption = new System.Windows.Forms.Label();
		this.txtDetails = new System.Windows.Forms.TextBox();
		this.btnCopy = new System.Windows.Forms.Button();
		this.btnClose = new System.Windows.Forms.Button();
		this.panelButtons = new System.Windows.Forms.Panel();
		this.panelContent = new System.Windows.Forms.Panel();
		this.flowButtons = new System.Windows.Forms.FlowLayoutPanel();
		this.panelContent.SuspendLayout();
		this.panelButtons.SuspendLayout();
		this.flowButtons.SuspendLayout();
		base.SuspendLayout();
		this.lblSummary.Dock = System.Windows.Forms.DockStyle.Top;
		this.lblSummary.Font = new System.Drawing.Font("Segoe UI", 9.5f, System.Drawing.FontStyle.Bold);
		this.lblSummary.ForeColor = System.Drawing.Color.FromArgb(17, 24, 39);
		this.lblSummary.Name = "lblSummary";
		this.lblSummary.Padding = new System.Windows.Forms.Padding(0, 0, 0, 6);
		this.lblSummary.Text = "오류가 발생했습니다.";
		this.lblDetailsCaption.AutoSize = true;
		this.lblDetailsCaption.Dock = System.Windows.Forms.DockStyle.Top;
		this.lblDetailsCaption.Font = new System.Drawing.Font("Segoe UI", 9f, System.Drawing.FontStyle.Bold);
		this.lblDetailsCaption.ForeColor = System.Drawing.Color.FromArgb(75, 85, 99);
		this.lblDetailsCaption.Name = "lblDetailsCaption";
		this.lblDetailsCaption.Padding = new System.Windows.Forms.Padding(0, 0, 0, 4);
		this.lblDetailsCaption.Text = "상세 내용";
		this.txtDetails.BackColor = System.Drawing.Color.FromArgb(248, 250, 252);
		this.txtDetails.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
		this.txtDetails.Dock = System.Windows.Forms.DockStyle.Top;
		this.txtDetails.Font = new System.Drawing.Font("Consolas", 8.75f);
		this.txtDetails.ForeColor = System.Drawing.Color.FromArgb(31, 41, 55);
		this.txtDetails.Height = 220;
		this.txtDetails.Multiline = true;
		this.txtDetails.Name = "txtDetails";
		this.txtDetails.ReadOnly = true;
		this.txtDetails.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
		this.txtDetails.TabStop = false;
		this.txtDetails.WordWrap = false;
		this.panelContent.Controls.Add(this.txtDetails);
		this.panelContent.Controls.Add(this.lblDetailsCaption);
		this.panelContent.Controls.Add(this.lblSummary);
		this.panelContent.Dock = System.Windows.Forms.DockStyle.Fill;
		this.panelContent.Name = "panelContent";
		this.panelContent.Padding = new System.Windows.Forms.Padding(12, 12, 12, 8);
		this.panelContent.Size = new System.Drawing.Size(520, 300);
		this.btnCopy.Name = "btnCopy";
		this.btnCopy.Size = new System.Drawing.Size(96, 30);
		this.btnCopy.Margin = new System.Windows.Forms.Padding(0, 0, 8, 0);
		this.btnCopy.Text = "전체 복사";
		this.btnCopy.UseVisualStyleBackColor = true;
		this.btnCopy.Click += new System.EventHandler(BtnCopy_Click);
		this.btnClose.DialogResult = System.Windows.Forms.DialogResult.OK;
		this.btnClose.Name = "btnClose";
		this.btnClose.Size = new System.Drawing.Size(96, 30);
		this.btnClose.Margin = new System.Windows.Forms.Padding(0);
		this.btnClose.Text = "닫기";
		this.btnClose.UseVisualStyleBackColor = true;
		this.btnClose.Click += new System.EventHandler(BtnClose_Click);
		this.flowButtons.AutoSize = true;
		this.flowButtons.AutoSizeMode = System.Windows.Forms.AutoSizeMode.GrowAndShrink;
		this.flowButtons.FlowDirection = System.Windows.Forms.FlowDirection.LeftToRight;
		this.flowButtons.Name = "flowButtons";
		this.flowButtons.WrapContents = false;
		this.flowButtons.Controls.Add(this.btnCopy);
		this.flowButtons.Controls.Add(this.btnClose);
		this.panelButtons.Controls.Add(this.flowButtons);
		this.panelButtons.Dock = System.Windows.Forms.DockStyle.Bottom;
		this.panelButtons.Name = "panelButtons";
		this.panelButtons.Padding = new System.Windows.Forms.Padding(12, 10, 12, 10);
		this.panelButtons.Size = new System.Drawing.Size(520, 52);
		base.AcceptButton = this.btnClose;
		base.AutoScaleDimensions = new System.Drawing.SizeF(7f, 15f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		this.BackColor = System.Drawing.Color.FromArgb(250, 251, 253);
		base.CancelButton = this.btnClose;
		base.ClientSize = new System.Drawing.Size(544, 360);
		base.Controls.Add(this.panelContent);
		base.Controls.Add(this.panelButtons);
		this.Font = new System.Drawing.Font("Segoe UI", 9f);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Sizable;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		this.MinimumSize = new System.Drawing.Size(380, 220);
		base.Name = "ErrorDialog";
		base.ShowIcon = false;
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
		this.Text = "오류";
		this.panelContent.ResumeLayout(false);
		this.panelContent.PerformLayout();
		this.flowButtons.ResumeLayout(false);
		this.flowButtons.PerformLayout();
		this.panelButtons.ResumeLayout(false);
		base.ResumeLayout(false);
	}
}

namespace MyPDFEditorWinV10.Controls;

partial class PdfViewerPanel
{
	private System.ComponentModel.IContainer components = null;

	private void InitializeComponent()
	{
		components = new System.ComponentModel.Container();
		AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		Name = "PdfViewerPanel";
		Size = new System.Drawing.Size(640, 480);
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing)
		{
			components?.Dispose();
			CloseDocument();
			_viewer?.Dispose();
		}

		base.Dispose(disposing);
	}
}

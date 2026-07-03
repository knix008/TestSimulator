using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;
using MyPDFEditorWinV10.Controls;

namespace MyPDFEditorWinV10;

partial class MainForm
{
	private IContainer components = null;

	private MenuStrip menuStripMain;
	private ToolStripMenuItem menuFile;
	private ToolStripMenuItem menuOpen;
	private ToolStripSeparator menuFileSep1;
	private ToolStripMenuItem menuSavePdf;
	private ToolStripMenuItem menuExportMd;
	private ToolStripMenuItem menuExportWord;
	private ToolStripSeparator menuFileSep2;
	private ToolStripMenuItem menuExit;
	private ToolStripMenuItem menuEdit;
	private ToolStripMenuItem menuImportText;
	private ToolStripSeparator menuEditSep1;
	private ToolStripMenuItem menuSelectText;
	private ToolStripMenuItem menuSelectImage;
	private ToolStripSeparator menuEditSepText;
	private ToolStripMenuItem menuCopyText;
	private ToolStripMenuItem menuEditText;
	private ToolStripMenuItem menuCopyImage;
	private ToolStripMenuItem menuView;
	private ToolStripMenuItem menuZoomIn;
	private ToolStripMenuItem menuZoomOut;
	private ToolStripSeparator menuViewSep1;
	private ToolStripMenuItem menuPrevPage;
	private ToolStripMenuItem menuNextPage;
	private ToolStripMenuItem menuAbout;

	private ToolStrip toolStripMain;
	private ToolStripButton btnOpen;
	private ToolStripButton btnSelectText;
	private ToolStripButton btnSelectImage;
	private ToolStripButton btnCopyImage;
	private ToolStripSeparator toolStripSep1;
	private ToolStripButton btnPrevPage;
	private ToolStripButton btnNextPage;
	private ToolStripSeparator toolStripSep2;
	private ToolStripButton btnSavePdf;
	private ToolStripButton btnExportMd;
	private ToolStripButton btnExportWord;
	private ToolStripSeparator toolStripSepAbout;
	private ToolStripButton btnAbout;

	private Panel panelPdf;
	private PdfViewerPanel pdfViewerPanel;

	private StatusStrip statusStripMain;
	private ToolStripStatusLabel statusLabel;
	private ToolStripStatusLabel pageLabel;

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
        menuStripMain = new MenuStrip();
        menuFile = new ToolStripMenuItem();
        menuOpen = new ToolStripMenuItem();
        menuFileSep1 = new ToolStripSeparator();
        menuSavePdf = new ToolStripMenuItem();
        menuExportMd = new ToolStripMenuItem();
        menuExportWord = new ToolStripMenuItem();
        menuFileSep2 = new ToolStripSeparator();
        menuExit = new ToolStripMenuItem();
        menuEdit = new ToolStripMenuItem();
        menuImportText = new ToolStripMenuItem();
        menuEditSep1 = new ToolStripSeparator();
        menuSelectText = new ToolStripMenuItem();
        menuSelectImage = new ToolStripMenuItem();
        menuEditSepText = new ToolStripSeparator();
        menuCopyText = new ToolStripMenuItem();
        menuEditText = new ToolStripMenuItem();
        menuCopyImage = new ToolStripMenuItem();
        menuView = new ToolStripMenuItem();
        menuZoomIn = new ToolStripMenuItem();
        menuZoomOut = new ToolStripMenuItem();
        menuViewSep1 = new ToolStripSeparator();
        menuPrevPage = new ToolStripMenuItem();
        menuNextPage = new ToolStripMenuItem();
        menuAbout = new ToolStripMenuItem();
        toolStripMain = new ToolStrip();
        btnOpen = new ToolStripButton();
        btnSavePdf = new ToolStripButton();
        toolStripSep1 = new ToolStripSeparator();
        btnSelectText = new ToolStripButton();
        btnSelectImage = new ToolStripButton();
        btnCopyImage = new ToolStripButton();
        toolStripSep2 = new ToolStripSeparator();
        btnPrevPage = new ToolStripButton();
        btnNextPage = new ToolStripButton();
        btnExportMd = new ToolStripButton();
        btnExportWord = new ToolStripButton();
        toolStripSepAbout = new ToolStripSeparator();
        btnAbout = new ToolStripButton();
        panelPdf = new Panel();
        pdfViewerPanel = new PdfViewerPanel();
        statusStripMain = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        pageLabel = new ToolStripStatusLabel();
        menuStripMain.SuspendLayout();
        toolStripMain.SuspendLayout();
        panelPdf.SuspendLayout();
        statusStripMain.SuspendLayout();
        SuspendLayout();
        // 
        // menuStripMain
        // 
        menuStripMain.ImageScalingSize = new Size(20, 20);
        menuStripMain.Items.AddRange(new ToolStripItem[] { menuFile, menuEdit, menuView, menuAbout });
        menuStripMain.Location = new Point(0, 0);
        menuStripMain.Name = "menuStripMain";
        menuStripMain.Size = new Size(1400, 24);
        menuStripMain.TabIndex = 0;
        menuStripMain.Text = "menuStripMain";
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuOpen, menuFileSep1, menuSavePdf, menuExportMd, menuExportWord, menuFileSep2, menuExit });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(57, 20);
        menuFile.Text = "파일(&F)";
        // 
        // menuOpen
        // 
        menuOpen.Name = "menuOpen";
        menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        menuOpen.Size = new Size(211, 22);
        menuOpen.Text = "PDF 열기(&O)...";
        // 
        // menuFileSep1
        // 
        menuFileSep1.Name = "menuFileSep1";
        menuFileSep1.Size = new Size(208, 6);
        // 
        // menuSavePdf
        // 
        menuSavePdf.Name = "menuSavePdf";
        menuSavePdf.ShortcutKeys = Keys.Control | Keys.S;
        menuSavePdf.Size = new Size(211, 22);
        menuSavePdf.Text = "저장(&S)...";
        // 
        // menuExportMd
        // 
        menuExportMd.Name = "menuExportMd";
        menuExportMd.Size = new Size(211, 22);
        menuExportMd.Text = "Markdown으로 저장(&M)...";
        // 
        // menuExportWord
        // 
        menuExportWord.Name = "menuExportWord";
        menuExportWord.Size = new Size(211, 22);
        menuExportWord.Text = "Word로 저장(&W)...";
        // 
        // menuFileSep2
        // 
        menuFileSep2.Name = "menuFileSep2";
        menuFileSep2.Size = new Size(208, 6);
        // 
        // menuExit
        // 
        menuExit.Name = "menuExit";
        menuExit.Size = new Size(211, 22);
        menuExit.Text = "종료(&X)";
        // 
        // menuEdit
        // 
        menuEdit.DropDownItems.AddRange(new ToolStripItem[] { menuImportText, menuEditSep1, menuSelectText, menuSelectImage, menuEditSepText, menuCopyText, menuEditText, menuCopyImage });
        menuEdit.Name = "menuEdit";
        menuEdit.Size = new Size(57, 20);
        menuEdit.Text = "편집(&E)";
        // 
        // menuImportText
        // 
        menuImportText.Name = "menuImportText";
        menuImportText.Size = new Size(256, 22);
        menuImportText.Text = "텍스트 재추출(&R)...";
        // 
        // menuEditSep1
        // 
        menuEditSep1.Name = "menuEditSep1";
        menuEditSep1.Size = new Size(253, 6);
        // 
        // menuSelectText
        // 
        menuSelectText.CheckOnClick = true;
        menuSelectText.Name = "menuSelectText";
        menuSelectText.Size = new Size(256, 22);
        menuSelectText.Text = "텍스트 선택(&G)";
        // 
        // menuSelectImage
        // 
        menuSelectImage.CheckOnClick = true;
        menuSelectImage.Name = "menuSelectImage";
        menuSelectImage.Size = new Size(256, 22);
        menuSelectImage.Text = "그림 선택(&P)";
        // 
        // menuEditSepText
        // 
        menuEditSepText.Name = "menuEditSepText";
        menuEditSepText.Size = new Size(253, 6);
        // 
        // menuCopyText
        // 
        menuCopyText.Name = "menuCopyText";
        menuCopyText.ShortcutKeys = Keys.Control | Keys.Shift | Keys.C;
        menuCopyText.Size = new Size(256, 22);
        menuCopyText.Text = "선택 텍스트 복사(&Y)";
        // 
        // menuEditText
        // 
        menuEditText.Name = "menuEditText";
        menuEditText.ShortcutKeys = Keys.F2;
        menuEditText.Size = new Size(256, 22);
        menuEditText.Text = "선택 영역 편집(&E)";
        // 
        // menuCopyImage
        // 
        menuCopyImage.Name = "menuCopyImage";
        menuCopyImage.ShortcutKeys = Keys.Control | Keys.Shift | Keys.I;
        menuCopyImage.Size = new Size(256, 22);
        menuCopyImage.Text = "이미지 복사(&C)";
        // 
        // menuView
        // 
        menuView.DropDownItems.AddRange(new ToolStripItem[] { menuZoomIn, menuZoomOut, menuViewSep1, menuPrevPage, menuNextPage });
        menuView.Name = "menuView";
        menuView.Size = new Size(59, 20);
        menuView.Text = "보기(&V)";
        // 
        // menuZoomIn
        // 
        menuZoomIn.Name = "menuZoomIn";
        menuZoomIn.ShortcutKeys = Keys.Control | Keys.Add;
        menuZoomIn.Size = new Size(219, 22);
        menuZoomIn.Text = "확대(&I)";
        // 
        // menuZoomOut
        // 
        menuZoomOut.Name = "menuZoomOut";
        menuZoomOut.ShortcutKeys = Keys.Control | Keys.Subtract;
        menuZoomOut.Size = new Size(219, 22);
        menuZoomOut.Text = "축소(&O)";
        // 
        // menuViewSep1
        // 
        menuViewSep1.Name = "menuViewSep1";
        menuViewSep1.Size = new Size(216, 6);
        // 
        // menuPrevPage
        // 
        menuPrevPage.Name = "menuPrevPage";
        menuPrevPage.ShortcutKeys = Keys.Control | Keys.PageUp;
        menuPrevPage.Size = new Size(219, 22);
        menuPrevPage.Text = "이전 페이지(&U)";
        // 
        // menuNextPage
        // 
        menuNextPage.Name = "menuNextPage";
        menuNextPage.ShortcutKeys = Keys.Control | Keys.Next;
        menuNextPage.Size = new Size(219, 22);
        menuNextPage.Text = "다음 페이지(&N)";
        // 
        // menuAbout
        // 
        menuAbout.Name = "menuAbout";
        menuAbout.Size = new Size(54, 20);
        menuAbout.Text = "정보(&I)";
        menuAbout.ToolTipText = "프로그램 정보";
        // 
        // toolStripMain
        // 
        toolStripMain.ImageScalingSize = new Size(22, 22);
        toolStripMain.Items.AddRange(new ToolStripItem[] { btnOpen, btnSavePdf, toolStripSep1, btnSelectText, btnSelectImage, btnCopyImage, toolStripSep2, btnPrevPage, btnNextPage, btnExportMd, btnExportWord, toolStripSepAbout, btnAbout });
        toolStripMain.Location = new Point(0, 24);
        toolStripMain.Name = "toolStripMain";
        toolStripMain.Size = new Size(1400, 25);
        toolStripMain.TabIndex = 1;
        toolStripMain.Text = "toolStripMain";
        // 
        // btnOpen
        // 
        btnOpen.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnOpen.ImageTransparentColor = Color.Magenta;
        btnOpen.Name = "btnOpen";
        btnOpen.Size = new Size(23, 22);
        btnOpen.Text = "열기";
        btnOpen.ToolTipText = "PDF 열기";
        // 
        // btnSavePdf
        // 
        btnSavePdf.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnSavePdf.ImageTransparentColor = Color.Magenta;
        btnSavePdf.Name = "btnSavePdf";
        btnSavePdf.Size = new Size(23, 22);
        btnSavePdf.Text = "저장";
        btnSavePdf.ToolTipText = "저장 (Ctrl+S) — 편집 내용을 별도 PDF 파일로 저장";
        // 
        // toolStripSep1
        // 
        toolStripSep1.Name = "toolStripSep1";
        toolStripSep1.Size = new Size(6, 25);
        // 
        // btnSelectText
        // 
        btnSelectText.CheckOnClick = true;
        btnSelectText.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnSelectText.ImageTransparentColor = Color.Magenta;
        btnSelectText.Name = "btnSelectText";
        btnSelectText.Size = new Size(23, 22);
        btnSelectText.Text = "텍스트 선택";
        btnSelectText.ToolTipText = "PDF에서 텍스트를 드래그하여 선택";
        // 
        // btnSelectImage
        // 
        btnSelectImage.CheckOnClick = true;
        btnSelectImage.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnSelectImage.ImageTransparentColor = Color.Magenta;
        btnSelectImage.Name = "btnSelectImage";
        btnSelectImage.Size = new Size(23, 22);
        btnSelectImage.Text = "그림 선택";
        btnSelectImage.ToolTipText = "PDF에서 그림 영역을 드래그하여 선택";
        // 
        // btnCopyImage
        // 
        btnCopyImage.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnCopyImage.ImageTransparentColor = Color.Magenta;
        btnCopyImage.Name = "btnCopyImage";
        btnCopyImage.Size = new Size(23, 22);
        btnCopyImage.Text = "이미지 복사";
        btnCopyImage.ToolTipText = "선택한 이미지 복사";
        // 
        // toolStripSep2
        // 
        toolStripSep2.Name = "toolStripSep2";
        toolStripSep2.Size = new Size(6, 25);
        // 
        // btnPrevPage
        // 
        btnPrevPage.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnPrevPage.ImageTransparentColor = Color.Magenta;
        btnPrevPage.Name = "btnPrevPage";
        btnPrevPage.Size = new Size(23, 22);
        btnPrevPage.Text = "이전";
        btnPrevPage.ToolTipText = "이전 페이지";
        // 
        // btnNextPage
        // 
        btnNextPage.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnNextPage.ImageTransparentColor = Color.Magenta;
        btnNextPage.Name = "btnNextPage";
        btnNextPage.Size = new Size(23, 22);
        btnNextPage.Text = "다음";
        btnNextPage.ToolTipText = "다음 페이지";
        // 
        // btnExportMd
        // 
        btnExportMd.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnExportMd.ImageTransparentColor = Color.Magenta;
        btnExportMd.Name = "btnExportMd";
        btnExportMd.Size = new Size(23, 22);
        btnExportMd.Text = "MD 저장";
        btnExportMd.ToolTipText = "Markdown으로 저장";
        // 
        // btnExportWord
        // 
        btnExportWord.DisplayStyle = ToolStripItemDisplayStyle.Image;
        btnExportWord.ImageTransparentColor = Color.Magenta;
        btnExportWord.Name = "btnExportWord";
        btnExportWord.Size = new Size(23, 22);
        btnExportWord.Text = "Word 저장";
        btnExportWord.ToolTipText = "Word로 저장";
        // 
        // toolStripSepAbout
        // 
        toolStripSepAbout.Alignment = ToolStripItemAlignment.Right;
        toolStripSepAbout.Name = "toolStripSepAbout";
        toolStripSepAbout.Size = new Size(6, 25);
        // 
        // btnAbout
        // 
        btnAbout.Alignment = ToolStripItemAlignment.Right;
        btnAbout.ImageTransparentColor = Color.Magenta;
        btnAbout.Name = "btnAbout";
        btnAbout.Size = new Size(35, 22);
        btnAbout.Text = "정보";
        btnAbout.ToolTipText = "프로그램 정보";
        // 
        // panelPdf
        // 
        panelPdf.Controls.Add(pdfViewerPanel);
        panelPdf.Dock = DockStyle.Fill;
        panelPdf.Location = new Point(0, 49);
        panelPdf.Name = "panelPdf";
        panelPdf.Padding = new Padding(4);
        panelPdf.Size = new Size(1400, 829);
        panelPdf.TabIndex = 2;
        // 
        // pdfViewerPanel
        // 
        pdfViewerPanel.Dock = DockStyle.Fill;
        pdfViewerPanel.Location = new Point(4, 4);
        pdfViewerPanel.Name = "pdfViewerPanel";
        pdfViewerPanel.Size = new Size(1392, 821);
        pdfViewerPanel.TabIndex = 1;
        // 
        // statusStripMain
        // 
        statusStripMain.Items.AddRange(new ToolStripItem[] { statusLabel, pageLabel });
        statusStripMain.Location = new Point(0, 878);
        statusStripMain.Name = "statusStripMain";
        statusStripMain.Size = new Size(1400, 22);
        statusStripMain.TabIndex = 3;
        statusStripMain.Text = "statusStripMain";
        // 
        // statusLabel
        // 
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(1330, 17);
        statusLabel.Spring = true;
        statusLabel.Text = "PDF 파일을 열어 주세요.";
        statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // pageLabel
        // 
        pageLabel.Name = "pageLabel";
        pageLabel.Size = new Size(55, 17);
        pageLabel.Text = "페이지: -";
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1400, 900);
        Controls.Add(panelPdf);
        Controls.Add(statusStripMain);
        Controls.Add(toolStripMain);
        Controls.Add(menuStripMain);
        Font = new Font("Segoe UI", 9F);
        MainMenuStrip = menuStripMain;
        MinimumSize = new Size(960, 600);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MyPDF Editor";
        menuStripMain.ResumeLayout(false);
        menuStripMain.PerformLayout();
        toolStripMain.ResumeLayout(false);
        toolStripMain.PerformLayout();
        panelPdf.ResumeLayout(false);
        statusStripMain.ResumeLayout(false);
        statusStripMain.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

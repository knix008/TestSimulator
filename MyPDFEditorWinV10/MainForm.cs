using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using MyPDFEditorWinV10.App;
using MyPDFEditorWinV10.Controls;
using MyPDFEditorWinV10.Dialogs;
using MyPDFEditorWinV10.Export;
using MyPDFEditorWinV10.Models;
using MyPDFEditorWinV10.Services;

namespace MyPDFEditorWinV10;

public partial class MainForm : Form
{
	private const string PdfFilter = "PDF 파일 (*.pdf)|*.pdf|모든 파일 (*.*)|*.*";
	private const string MarkdownFilter = "Markdown 파일 (*.md)|*.md|모든 파일 (*.*)|*.*";
	private const string WordFilter = "Word 문서 (*.docx)|*.docx|모든 파일 (*.*)|*.*";

	private readonly EditableDocument _document = new EditableDocument();
	private readonly string _initialFilePath;
	private ContextMenuStrip _pdfContextMenu;
	private ToolStripMenuItem _ctxCopyText;
	private ToolStripMenuItem _ctxCopyImage;
	private ToolStripSeparator _ctxSepModes;
	private ToolStripMenuItem _ctxSelectText;
	private ToolStripMenuItem _ctxSelectImage;

	public MainForm() : this(null)
	{
	}

	public MainForm(string initialFilePath)
	{
		_initialFilePath = initialFilePath;
		InitializeComponent();

		if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
		{
			return;
		}

		ApplyIcons();
		WireEventHandlers();
		UpdateCommandStates();
		UpdateTitle();

		if (!string.IsNullOrWhiteSpace(_initialFilePath))
		{
			LoadPdf(_initialFilePath);
		}
	}

	private void ApplyIcons()
	{
		const int menuSize = 16;
		const int toolSize = 22;

		menuFile.Image = IconProvider.Get("File", menuSize);
		menuOpen.Image = IconProvider.Get("Open", menuSize);
		menuSavePdf.Image = IconProvider.Get("Pdf", menuSize);
		menuExportMd.Image = IconProvider.Get("Markdown", menuSize);
		menuExportWord.Image = IconProvider.Get("Word", menuSize);
		menuExit.Image = IconProvider.Get("Exit", menuSize);

		menuEdit.Image = IconProvider.Get("Edit", menuSize);
		menuImportText.Image = IconProvider.Get("ImportText", menuSize);
		menuSelectText.Image = IconProvider.Get("SelectText", menuSize);
		menuSelectImage.Image = IconProvider.Get("SelectImage", menuSize);
		menuCopyText.Image = IconProvider.Get("Copy", menuSize);
		menuCopyImage.Image = IconProvider.Get("Copy", menuSize);

		menuView.Image = IconProvider.Get("View", menuSize);
		menuZoomIn.Image = IconProvider.Get("ZoomIn", menuSize);
		menuZoomOut.Image = IconProvider.Get("ZoomOut", menuSize);
		menuPrevPage.Image = IconProvider.Get("PrevPage", menuSize);
		menuNextPage.Image = IconProvider.Get("NextPage", menuSize);

		btnOpen.Image = IconProvider.Get("Open", toolSize);
		btnImportText.Image = IconProvider.Get("ImportText", toolSize);
		btnSelectText.Image = IconProvider.Get("SelectText", toolSize);
		btnSelectImage.Image = IconProvider.Get("SelectImage", toolSize);
		btnCopyImage.Image = IconProvider.Get("Copy", toolSize);
		btnPrevPage.Image = IconProvider.Get("PrevPage", toolSize);
		btnNextPage.Image = IconProvider.Get("NextPage", toolSize);
		btnSavePdf.Image = IconProvider.Get("Pdf", toolSize);
		btnExportMd.Image = IconProvider.Get("Markdown", toolSize);
		btnExportWord.Image = IconProvider.Get("Word", toolSize);
		menuAbout.Image = IconProvider.Get("About", menuSize);
		btnAbout.Image = IconProvider.Get("About", toolSize);

		try
		{
			string iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico");
			if (File.Exists(iconPath))
			{
				Icon = new Icon(iconPath);
			}
		}
		catch
		{
		}
	}

	private void WireEventHandlers()
	{
		InitializePdfContextMenu();

		menuOpen.Click += (_, _) => OpenPdf();
		menuSavePdf.Click += (_, _) => SaveAsPdf();
		menuExportMd.Click += (_, _) => ExportMarkdown();
		menuExportWord.Click += (_, _) => ExportWord();
		menuExit.Click += (_, _) => Close();

		menuImportText.Click += (_, _) => ImportTextFromPdf();
		menuSelectText.Click += (_, _) => SyncInteractionMode(PdfInteractionMode.TextSelect);
		menuSelectImage.Click += (_, _) => SyncInteractionMode(PdfInteractionMode.ImageSelect);
		menuCopyText.Click += (_, _) => CopySelectedText();
		menuCopyImage.Click += (_, _) => CopySelectedImage();

		menuZoomIn.Click += (_, _) => pdfViewerPanel.ZoomIn();
		menuZoomOut.Click += (_, _) => pdfViewerPanel.ZoomOut();
		menuPrevPage.Click += (_, _) => pdfViewerPanel.PreviousPage();
		menuNextPage.Click += (_, _) => pdfViewerPanel.NextPage();

		btnOpen.Click += (_, _) => OpenPdf();
		btnImportText.Click += (_, _) => ImportTextFromPdf();
		btnSelectText.Click += (_, _) => SyncInteractionMode(PdfInteractionMode.TextSelect);
		btnSelectImage.Click += (_, _) => SyncInteractionMode(PdfInteractionMode.ImageSelect);
		btnCopyImage.Click += (_, _) => CopySelectedImage();
		btnPrevPage.Click += (_, _) => pdfViewerPanel.PreviousPage();
		btnNextPage.Click += (_, _) => pdfViewerPanel.NextPage();
		btnSavePdf.Click += (_, _) => SaveAsPdf();
		btnExportMd.Click += (_, _) => ExportMarkdown();
		btnExportWord.Click += (_, _) => ExportWord();
		menuAbout.Click += (_, _) => ShowAbout();
		btnAbout.Click += (_, _) => ShowAbout();

		pdfViewerPanel.PageChanged += (_, pageIndex) => UpdatePageStatus(pageIndex);
		pdfViewerPanel.SelectionChanged += (_, _) => UpdateCommandStates();
		pdfViewerPanel.TextSelectionChanged += (_, _) => UpdateCommandStates();
		pdfViewerPanel.InteractionModeChanged += (_, _) => UpdateCommandStates();
	}

	private void OpenPdf()
	{
		using OpenFileDialog dialog = new OpenFileDialog
		{
			Filter = PdfFilter,
			Title = "PDF 파일 열기"
		};
		if (dialog.ShowDialog(this) == DialogResult.OK)
		{
			LoadPdf(dialog.FileName);
		}
	}

	private void LoadPdf(string filePath)
	{
		try
		{
			_document.PageTexts.Clear();
			SyncInteractionMode(PdfInteractionMode.TextSelect);
			pdfViewerPanel.LoadDocument(filePath);
			_document.SourcePdfPath = filePath;
			_document.EnsurePageCount(pdfViewerPanel.PageCount);
			_document.TextContent = string.Empty;
			_document.IsDirty = false;
			UpdatePageStatus(pdfViewerPanel.GetActivePageIndex());
			UpdateCommandStates();
			UpdateTitle();
			statusLabel.Text = filePath;
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "PDF를 열 수 없습니다.", ex);
		}
	}

	private void ImportTextFromPdf()
	{
		if (string.IsNullOrWhiteSpace(_document.SourcePdfPath))
		{
			MessageBox.Show(this, "먼저 PDF 파일을 열어 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return;
		}

		try
		{
			IReadOnlyList<string> pages = PdfContentExtractor.ExtractTextByPage(_document.SourcePdfPath);
			if (pages.Count == 0 || pages.All(string.IsNullOrWhiteSpace))
			{
				MessageBox.Show(this, "추출할 텍스트가 없습니다.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
				return;
			}

			if (_document.PageTexts.Any(page => !string.IsNullOrWhiteSpace(page)))
			{
				DialogResult result = MessageBox.Show(this, "기존 추출 텍스트를 덮어쓸까요?", "텍스트 추출", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
				if (result == DialogResult.Cancel)
				{
					return;
				}

				if (result == DialogResult.No)
				{
					return;
				}
			}

			_document.PageTexts.Clear();
			_document.PageTexts.AddRange(pages);
			_document.EnsurePageCount(pdfViewerPanel.PageCount);
			_document.TextContent = _document.BuildCombinedTextContent();
			_document.IsDirty = true;
			UpdateTitle();
			statusLabel.Text = "PDF 텍스트를 내보내기 문서에 추출했습니다.";
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "텍스트 추출에 실패했습니다.", ex);
		}
	}

	private void CopySelectedText()
	{
		string text = pdfViewerPanel.GetSelectedText();
		if (string.IsNullOrWhiteSpace(text))
		{
			string message = pdfViewerPanel.InteractionMode == PdfInteractionMode.TextSelect
				? "PDF 위에서 텍스트를 드래그하여 선택해 주세요."
				: "먼저 '텍스트 선택' 모드에서 텍스트를 선택해 주세요.";
			MessageBox.Show(this, message, "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return;
		}

		Clipboard.SetText(text);
		statusLabel.Text = "선택한 텍스트를 클립보드에 복사했습니다.";
	}

	private void CopySelectedImage()
	{
		if (!TryGetSelectedBitmap(out Bitmap bitmap))
		{
			return;
		}

		try
		{
			Clipboard.SetImage(bitmap);
			statusLabel.Text = "선택한 이미지를 클립보드에 복사했습니다.";
		}
		finally
		{
			bitmap.Dispose();
		}
	}

	private bool TryGetSelectedBitmap(out Bitmap bitmap)
	{
		bitmap = null;
		if (!pdfViewerPanel.HasDocument)
		{
			MessageBox.Show(this, "먼저 PDF 파일을 열어 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return false;
		}

		if (!pdfViewerPanel.TryGetSelectedImage(out bitmap))
		{
			string message = pdfViewerPanel.InteractionMode == PdfInteractionMode.ImageSelect
				? "PDF 위에서 드래그하여 영역을 선택하거나, 내장 이미지를 클릭해 주세요."
				: "먼저 '그림 선택' 모드에서 영역을 선택하거나 이미지를 클릭해 주세요.";
			MessageBox.Show(this, message, "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return false;
		}

		return true;
	}

	private void SaveAsPdf()
	{
		if (!EnsureEditableContent())
		{
			return;
		}

		using SaveFileDialog dialog = new SaveFileDialog
		{
			Filter = PdfFilter,
			Title = "PDF로 저장",
			FileName = SuggestExportFileName(".pdf")
		};
		if (dialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		try
		{
			SyncDocumentFromEditor();
			EditorPdfExporter.Export(_document, dialog.FileName);
			_document.IsDirty = false;
			UpdateTitle();
			statusLabel.Text = $"PDF 저장 완료: {dialog.FileName}";
			MessageBox.Show(this, "PDF 파일로 저장했습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "PDF 저장에 실패했습니다.", ex);
		}
	}

	private void ExportMarkdown()
	{
		if (!EnsureEditableContent())
		{
			return;
		}

		using SaveFileDialog dialog = new SaveFileDialog
		{
			Filter = MarkdownFilter,
			Title = "Markdown으로 저장",
			FileName = SuggestExportFileName(".md")
		};
		if (dialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		try
		{
			SyncDocumentFromEditor();
			EditorMarkdownExporter.Export(_document, dialog.FileName);
			_document.IsDirty = false;
			UpdateTitle();
			statusLabel.Text = $"Markdown 저장 완료: {dialog.FileName}";
			MessageBox.Show(this, "Markdown 파일로 저장했습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "Markdown 저장에 실패했습니다.", ex);
		}
	}

	private void ExportWord()
	{
		if (!EnsureEditableContent())
		{
			return;
		}

		using SaveFileDialog dialog = new SaveFileDialog
		{
			Filter = WordFilter,
			Title = "Word로 저장",
			FileName = SuggestExportFileName(".docx")
		};
		if (dialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		try
		{
			SyncDocumentFromEditor();
			EditorWordExporter.Export(_document, dialog.FileName);
			_document.IsDirty = false;
			UpdateTitle();
			statusLabel.Text = $"Word 저장 완료: {dialog.FileName}";
			MessageBox.Show(this, "Word 파일로 저장했습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "Word 저장에 실패했습니다.", ex);
		}
	}

	private bool EnsureEditableContent()
	{
		SyncDocumentFromEditor();
		if (_document.HasEditableContent())
		{
			return true;
		}

		MessageBox.Show(this, "저장할 내용이 없습니다. '내보내기용 텍스트 추출'을 사용해 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
		return false;
	}

	private void SyncDocumentFromEditor()
	{
		if (!pdfViewerPanel.HasDocument)
		{
			return;
		}

		_document.EnsurePageCount(pdfViewerPanel.PageCount);
		_document.TextContent = _document.BuildCombinedTextContent();
	}

	private string SuggestExportFileName(string extension)
	{
		if (!string.IsNullOrWhiteSpace(_document.SourcePdfPath))
		{
			return Path.GetFileNameWithoutExtension(_document.SourcePdfPath) + "_edited" + extension;
		}

		return "document_edited" + extension;
	}

	private void UpdateCommandStates()
	{
		bool hasPdf = pdfViewerPanel.HasDocument;
		bool hasTextSelection = hasPdf && pdfViewerPanel.HasTextSelection;
		bool hasImageSelection = hasPdf && pdfViewerPanel.HasImageSelection;
		PdfInteractionMode mode = pdfViewerPanel.InteractionMode;

		menuImportText.Enabled = hasPdf;
		menuSelectText.Enabled = hasPdf;
		menuSelectImage.Enabled = hasPdf;
		menuCopyText.Enabled = hasTextSelection;
		menuCopyImage.Enabled = hasImageSelection;
		btnImportText.Enabled = hasPdf;
		btnSelectText.Enabled = hasPdf;
		btnSelectImage.Enabled = hasPdf;
		btnCopyImage.Enabled = hasImageSelection;
		btnPrevPage.Enabled = hasPdf;
		btnNextPage.Enabled = hasPdf;
		menuZoomIn.Enabled = hasPdf;
		menuZoomOut.Enabled = hasPdf;
		menuPrevPage.Enabled = hasPdf;
		menuNextPage.Enabled = hasPdf;

		btnSelectText.Checked = mode == PdfInteractionMode.TextSelect;
		btnSelectImage.Checked = mode == PdfInteractionMode.ImageSelect;
		menuSelectText.Checked = mode == PdfInteractionMode.TextSelect;
		menuSelectImage.Checked = mode == PdfInteractionMode.ImageSelect;
	}

	private void SyncInteractionMode(PdfInteractionMode mode)
	{
		pdfViewerPanel.InteractionMode = mode;
		labelPdfHeader.Text = mode switch
		{
			PdfInteractionMode.TextSelect => "PDF — 텍스트 선택 (파란색으로 선택 표시)",
			PdfInteractionMode.ImageSelect => "PDF — 그림 선택 (드래그 또는 내장 이미지 클릭)",
			_ => "PDF"
		};

		statusLabel.Text = mode switch
		{
			PdfInteractionMode.TextSelect => "텍스트 위: T 아이콘 커서, 드래그하여 선택",
			PdfInteractionMode.ImageSelect => "이미지 위: 그림 아이콘 커서, 클릭하여 선택 / 드래그하여 영역 선택",
			_ => _document.SourcePdfPath ?? statusLabel.Text
		};

		UpdateCommandStates();
	}

	private void InitializePdfContextMenu()
	{
		_pdfContextMenu = new ContextMenuStrip();
		_ctxCopyText = new ToolStripMenuItem("텍스트 복사", IconProvider.Get("Copy", 16), (_, _) => CopySelectedText());
		_ctxCopyImage = new ToolStripMenuItem("이미지 복사", IconProvider.Get("Copy", 16), (_, _) => CopySelectedImage());
		_ctxSepModes = new ToolStripSeparator();
		_ctxSelectText = new ToolStripMenuItem("텍스트 선택 모드", IconProvider.Get("SelectText", 16), (_, _) => SyncInteractionMode(PdfInteractionMode.TextSelect));
		_ctxSelectImage = new ToolStripMenuItem("그림 선택 모드", IconProvider.Get("SelectImage", 16), (_, _) => SyncInteractionMode(PdfInteractionMode.ImageSelect));
		_ctxSelectText.CheckOnClick = true;
		_ctxSelectImage.CheckOnClick = true;

		_pdfContextMenu.Items.AddRange(new ToolStripItem[]
		{
			_ctxCopyText,
			_ctxCopyImage,
			_ctxSepModes,
			_ctxSelectText,
			_ctxSelectImage
		});
		_pdfContextMenu.Opening += PdfContextMenu_Opening;
		pdfViewerPanel.AttachContextMenu(_pdfContextMenu);
	}

	private void PdfContextMenu_Opening(object sender, System.ComponentModel.CancelEventArgs e)
	{
		if (!pdfViewerPanel.HasDocument)
		{
			e.Cancel = true;
			return;
		}

		_ctxCopyText.Enabled = pdfViewerPanel.HasTextSelection;
		_ctxCopyImage.Enabled = pdfViewerPanel.HasImageSelection;

		PdfInteractionMode mode = pdfViewerPanel.InteractionMode;
		_ctxSelectText.Checked = mode == PdfInteractionMode.TextSelect;
		_ctxSelectImage.Checked = mode == PdfInteractionMode.ImageSelect;
	}

	private void UpdatePageStatus(int pageIndex)
	{
		if (!pdfViewerPanel.HasDocument)
		{
			pageLabel.Text = "페이지: -";
			return;
		}

		pageLabel.Text = $"페이지: {pageIndex + 1} / {pdfViewerPanel.PageCount}";
	}

	private void UpdateTitle()
	{
		Text = $"MyPDF Editor - {_document.DisplayTitle}";
	}

	private void ShowAbout()
	{
		using AboutDialog dialog = new AboutDialog();
		dialog.ShowDialog(this);
	}

	protected override void OnFormClosing(FormClosingEventArgs e)
	{
		if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
		{
			base.OnFormClosing(e);
			return;
		}

		if (_document.IsDirty)
		{
			DialogResult result = MessageBox.Show(this, "저장하지 않은 변경 사항이 있습니다. 종료할까요?", "확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
			if (result != DialogResult.Yes)
			{
				e.Cancel = true;
				return;
			}
		}

		base.OnFormClosing(e);
	}
}

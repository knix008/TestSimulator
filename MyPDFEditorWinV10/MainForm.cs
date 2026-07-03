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
	private ToolStripMenuItem _ctxEditText;
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
		menuSavePdf.Image = IconProvider.Get("Save", menuSize);
		menuExportMd.Image = IconProvider.Get("Markdown", menuSize);
		menuExportWord.Image = IconProvider.Get("Word", menuSize);
		menuExit.Image = IconProvider.Get("Exit", menuSize);

		menuEdit.Image = IconProvider.Get("Edit", menuSize);
		menuImportText.Image = IconProvider.Get("ImportText", menuSize);
		menuSelectText.Image = IconProvider.Get("SelectText", menuSize);
		menuSelectImage.Image = IconProvider.Get("SelectImage", menuSize);
		menuCopyText.Image = IconProvider.Get("Copy", menuSize);
		menuEditText.Image = IconProvider.Get("Edit", menuSize);
		menuCopyImage.Image = IconProvider.Get("Copy", menuSize);

		menuView.Image = IconProvider.Get("View", menuSize);
		menuZoomIn.Image = IconProvider.Get("ZoomIn", menuSize);
		menuZoomOut.Image = IconProvider.Get("ZoomOut", menuSize);
		menuPrevPage.Image = IconProvider.Get("PrevPage", menuSize);
		menuNextPage.Image = IconProvider.Get("NextPage", menuSize);

		btnOpen.Image = IconProvider.Get("Open", toolSize);
		btnSelectText.Image = IconProvider.Get("SelectText", toolSize);
		btnSelectImage.Image = IconProvider.Get("SelectImage", toolSize);
		btnCopyImage.Image = IconProvider.Get("Copy", toolSize);
		btnPrevPage.Image = IconProvider.Get("PrevPage", toolSize);
		btnNextPage.Image = IconProvider.Get("NextPage", toolSize);
		btnSavePdf.Image = IconProvider.Get("Save", toolSize);
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
		menuEditText.Click += (_, _) => EditSelectedText();
		menuCopyImage.Click += (_, _) => CopySelectedImage();

		menuZoomIn.Click += (_, _) => pdfViewerPanel.ZoomIn();
		menuZoomOut.Click += (_, _) => pdfViewerPanel.ZoomOut();
		menuPrevPage.Click += (_, _) => pdfViewerPanel.PreviousPage();
		menuNextPage.Click += (_, _) => pdfViewerPanel.NextPage();

		btnOpen.Click += (_, _) => OpenPdf();
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
		pdfViewerPanel.TextBlockEdited += (_, _) => OnTextBlockEdited();
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
			if (!PdfUnlockService.TryUnlock(this, filePath, out string password, out bool isPasswordProtected))
			{
				return;
			}

			_document.PageTexts.Clear();
			_document.TextBlocks.Clear();
			WorkingPdfManager.Clear(_document);
			_document.PdfPassword = password;
			_document.IsPasswordProtected = isPasswordProtected;
			SyncInteractionMode(PdfInteractionMode.TextSelect);
			pdfViewerPanel.LoadDocument(filePath, password);
			_document.SourcePdfPath = filePath;
			_document.EnsurePageCount(pdfViewerPanel.PageCount);
			_document.TextContent = string.Empty;
			LoadTextBlocksFromPdf(filePath, password);
			pdfViewerPanel.TextBlocks = _document.TextBlocks;
			_document.IsDirty = false;
			UpdatePageStatus(pdfViewerPanel.GetActivePageIndex());
			UpdateCommandStates();
			UpdateTitle();
			statusLabel.Text = isPasswordProtected
				? $"{filePath} — 암호 해제됨 (저장 시 암호 없는 PDF로 저장됩니다)"
				: filePath;
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "PDF를 열 수 없습니다.", ex);
		}
	}

	private void LoadTextBlocksFromPdf(string filePath, string password = null)
	{
		IReadOnlyList<PdfTextBlock> blocks = PdfContentExtractor.ExtractTextBlocks(filePath, password);
		_document.TextBlocks.Clear();
		if (blocks.Count > 0)
		{
			_document.TextBlocks.AddRange(blocks);
			_document.SyncPageTextsFromBlocks();
		}
	}

	private void ImportTextFromPdf()
	{
		if (string.IsNullOrWhiteSpace(_document.SourcePdfPath))
		{
			MessageBox.Show(this, "먼저 PDF 파일을 열어 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return;
		}

		if (_document.HasModifiedTextBlocks())
		{
			DialogResult result = MessageBox.Show(this, "편집한 내용이 있습니다. 텍스트를 다시 추출하면 수정 사항이 사라집니다. 계속할까요?", "텍스트 재추출", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
			if (result != DialogResult.Yes)
			{
				return;
			}
		}

		try
		{
			pdfViewerPanel.EndInlineEdit(commit: false);
			WorkingPdfManager.Clear(_document);
			LoadTextBlocksFromPdf(_document.SourcePdfPath, _document.PdfPassword);
			pdfViewerPanel.ReloadDocument(_document.SourcePdfPath, _document.PdfPassword);
			pdfViewerPanel.TextBlocks = _document.TextBlocks;
			_document.EnsurePageCount(pdfViewerPanel.PageCount);
			_document.IsDirty = false;
			UpdateTitle();
			statusLabel.Text = $"텍스트 블록 {_document.TextBlocks.Count}개를 다시 추출했습니다.";
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "텍스트 추출에 실패했습니다.", ex);
		}
	}

	private void EditSelectedText()
	{
		if (!pdfViewerPanel.HasDocument)
		{
			MessageBox.Show(this, "먼저 PDF 파일을 열어 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return;
		}

		if (_document.TextBlocks.Count == 0)
		{
			MessageBox.Show(this, "이 PDF에서 편집 가능한 텍스트를 찾지 못했습니다.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
			return;
		}

		if (pdfViewerPanel.BeginInlineEditForSelection())
		{
			return;
		}

		MessageBox.Show(this, "편집할 텍스트를 드래그하여 선택하거나, 텍스트 위를 더블클릭해 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
	}

	private void OnTextBlockEdited()
	{
		_document.SyncPageTextsFromBlocks();
		_document.IsDirty = true;
		UpdateTitle();

		try
		{
			ApplyChangesToViewer();
			statusLabel.Text = "변경 내용이 PDF에 반영되었습니다. '저장'으로 별도 파일에 저장하세요.";
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "변경 내용을 PDF에 반영하지 못했습니다.", ex);
		}
	}

	private void ApplyChangesToViewer()
	{
		if (!_document.HasModifiedTextBlocks())
		{
			return;
		}

		string previousPath = _document.WorkingPdfPath;
		string workingPath = WorkingPdfManager.RegenerateWorkingCopy(_document);
		pdfViewerPanel.ReloadDocument(workingPath);
		pdfViewerPanel.TextBlocks = _document.TextBlocks;
		if (!string.IsNullOrWhiteSpace(previousPath) &&
			!string.Equals(previousPath, workingPath, StringComparison.OrdinalIgnoreCase))
		{
			WorkingPdfManager.TryDeleteFile(previousPath);
		}

		UpdatePageStatus(pdfViewerPanel.GetActivePageIndex());
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
		if (!EnsurePdfChangesToSave())
		{
			return;
		}

		string outputPath = PromptForSeparatePdfSavePath();
		if (string.IsNullOrWhiteSpace(outputPath))
		{
			return;
		}

		try
		{
			SyncDocumentFromEditor();
			if (_document.CanUseLayoutPreservingExport())
			{
				LayoutPreservingPdfExporter.Export(_document, outputPath);
			}
			else
			{
				EditorPdfExporter.Export(_document, outputPath);
			}

			_document.IsDirty = false;
			UpdateTitle();
			statusLabel.Text = $"저장 완료: {outputPath}";
			string savedMessage = "편집 내용을 별도 파일로 저장했습니다. 원본 PDF는 수정되지 않습니다.";
			if (_document.IsPasswordProtected)
			{
				savedMessage += Environment.NewLine + "저장된 파일에는 암호가 적용되지 않습니다.";
			}

			MessageBox.Show(this, savedMessage, "저장 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "오류", "PDF 저장에 실패했습니다.", ex);
		}
	}

	private bool EnsurePdfChangesToSave()
	{
		SyncDocumentFromEditor();
		if (_document.HasChangesToSave())
		{
			return true;
		}

		MessageBox.Show(this, "저장할 변경 내용이 없습니다. PDF에서 텍스트를 편집한 뒤 다시 저장해 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
		return false;
	}

	private string PromptForSeparatePdfSavePath()
	{
		string exportDirectory = GetExportDirectory();
		while (true)
		{
			using SaveFileDialog dialog = new SaveFileDialog
			{
				Filter = PdfFilter,
				Title = "다른 이름으로 저장",
				InitialDirectory = exportDirectory,
				FileName = SuggestUniqueExportFileName(".pdf"),
				OverwritePrompt = true
			};

			if (dialog.ShowDialog(this) != DialogResult.OK)
			{
				return null;
			}

			string selectedPath = dialog.FileName;
			if (IsSameFilePath(selectedPath, _document.SourcePdfPath))
			{
				MessageBox.Show(this, "원본 PDF는 변경되지 않습니다. 다른 파일 이름을 선택해 주세요.", "원본 보호", MessageBoxButtons.OK, MessageBoxIcon.Warning);
				continue;
			}

			return selectedPath;
		}
	}

	private string GetExportDirectory()
	{
		if (!string.IsNullOrWhiteSpace(_document.SourcePdfPath))
		{
			string directory = Path.GetDirectoryName(_document.SourcePdfPath);
			if (!string.IsNullOrWhiteSpace(directory) && Directory.Exists(directory))
			{
				return directory;
			}
		}

		return Environment.CurrentDirectory;
	}

	private string SuggestUniqueExportFileName(string extension)
	{
		string baseName = !string.IsNullOrWhiteSpace(_document.SourcePdfPath)
			? Path.GetFileNameWithoutExtension(_document.SourcePdfPath)
			: "document";
		string directory = GetExportDirectory();
		string candidate = baseName + "_edited" + extension;
		if (!File.Exists(Path.Combine(directory, candidate)))
		{
			return candidate;
		}

		for (int index = 2; index < 1000; index++)
		{
			candidate = $"{baseName}_edited ({index}){extension}";
			if (!File.Exists(Path.Combine(directory, candidate)))
			{
				return candidate;
			}
		}

		return baseName + "_edited" + extension;
	}

	private static bool IsSameFilePath(string pathA, string pathB)
	{
		if (string.IsNullOrWhiteSpace(pathA) || string.IsNullOrWhiteSpace(pathB))
		{
			return false;
		}

		try
		{
			string fullPathA = Path.GetFullPath(pathA).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
			string fullPathB = Path.GetFullPath(pathB).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
			return string.Equals(fullPathA, fullPathB, StringComparison.OrdinalIgnoreCase);
		}
		catch
		{
			return string.Equals(pathA, pathB, StringComparison.OrdinalIgnoreCase);
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

		MessageBox.Show(this, "저장할 내용이 없습니다. PDF에서 텍스트를 편집한 뒤 저장해 주세요.", "안내", MessageBoxButtons.OK, MessageBoxIcon.Information);
		return false;
	}

	private void SyncDocumentFromEditor()
	{
		if (!pdfViewerPanel.HasDocument)
		{
			return;
		}

		_document.EnsurePageCount(pdfViewerPanel.PageCount);
		if (_document.TextBlocks.Count > 0)
		{
			_document.SyncPageTextsFromBlocks();
		}
		else
		{
			_document.TextContent = _document.BuildCombinedTextContent();
		}
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
		menuEditText.Enabled = hasTextSelection && _document.TextBlocks.Count > 0;
		menuCopyImage.Enabled = hasImageSelection;
		btnSelectText.Enabled = hasPdf;
		btnSelectImage.Enabled = hasPdf;
		btnCopyImage.Enabled = hasImageSelection;
		btnPrevPage.Enabled = hasPdf;
		btnNextPage.Enabled = hasPdf;
		menuSavePdf.Enabled = hasPdf;
		btnSavePdf.Enabled = hasPdf;
		menuExportMd.Enabled = hasPdf;
		menuExportWord.Enabled = hasPdf;
		btnExportMd.Enabled = hasPdf;
		btnExportWord.Enabled = hasPdf;
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

		statusLabel.Text = mode switch
		{
			PdfInteractionMode.TextSelect => "텍스트 더블클릭: 바로 편집 | 드래그: 선택 | F2: 선택 영역 편집",
			PdfInteractionMode.ImageSelect => "이미지 위: 그림 아이콘 커서, 클릭하여 선택 / 드래그하여 영역 선택",
			_ => _document.SourcePdfPath ?? statusLabel.Text
		};

		UpdateCommandStates();
	}

	private void InitializePdfContextMenu()
	{
		_pdfContextMenu = new ContextMenuStrip();
		_ctxCopyText = new ToolStripMenuItem("텍스트 복사", IconProvider.Get("Copy", 16), (_, _) => CopySelectedText());
		_ctxEditText = new ToolStripMenuItem("텍스트 편집 (F2)", IconProvider.Get("Edit", 16), (_, _) => EditSelectedText());
		_ctxCopyImage = new ToolStripMenuItem("이미지 복사", IconProvider.Get("Copy", 16), (_, _) => CopySelectedImage());
		_ctxSepModes = new ToolStripSeparator();
		_ctxSelectText = new ToolStripMenuItem("텍스트 선택 모드", IconProvider.Get("SelectText", 16), (_, _) => SyncInteractionMode(PdfInteractionMode.TextSelect));
		_ctxSelectImage = new ToolStripMenuItem("그림 선택 모드", IconProvider.Get("SelectImage", 16), (_, _) => SyncInteractionMode(PdfInteractionMode.ImageSelect));
		_ctxSelectText.CheckOnClick = true;
		_ctxSelectImage.CheckOnClick = true;

		_pdfContextMenu.Items.AddRange(new ToolStripItem[]
		{
			_ctxCopyText,
			_ctxEditText,
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
		_ctxEditText.Enabled = pdfViewerPanel.HasTextSelection && _document.TextBlocks.Count > 0;
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

	protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
	{
		if (keyData == (Keys.Control | Keys.S))
		{
			SaveAsPdf();
			return true;
		}

		return base.ProcessCmdKey(ref msg, keyData);
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

		WorkingPdfManager.Clear(_document);
		base.OnFormClosing(e);
	}
}

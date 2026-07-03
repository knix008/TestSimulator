using System.Collections.ObjectModel;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using PDFEditor.App.Services;
using PDFEditor.Core.Models;
using PDFEditor.Core.Services;

namespace PDFEditor.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly IPdfDocumentService _documentService;
    private readonly IPdfRenderService _renderService;
    private readonly IErrorDialogService _errorDialogService;
    private readonly IPasswordPromptService _passwordPromptService;
    private readonly IPageImageExporter _pageImageExporter;
    private EditorDocument? _document;

    public MainViewModel(
        IPdfDocumentService documentService,
        IPdfRenderService renderService,
        IErrorDialogService errorDialogService,
        IPasswordPromptService passwordPromptService,
        IPageImageExporter pageImageExporter)
    {
        _documentService = documentService;
        _renderService = renderService;
        _errorDialogService = errorDialogService;
        _passwordPromptService = passwordPromptService;
        _pageImageExporter = pageImageExporter;
        UpdateToolStatus();
    }

    public bool IsTesseractAvailable => _documentService.GetTesseractInfo().IsAvailable;

    public ObservableCollection<TextElementViewModel> TextElements { get; } = [];
    public ObservableCollection<ImageElementViewModel> ImageElements { get; } = [];
    public ObservableCollection<AnnotationElementViewModel> AnnotationElements { get; } = [];
    public ObservableCollection<FormFieldViewModel> FormFields { get; } = [];

    [ObservableProperty]
    private string _statusText = "PDF 파일을 열어주세요.";

    [ObservableProperty]
    private string _documentTitle = "PDF Editor";

    [ObservableProperty]
    private int _currentPageIndex;

    [ObservableProperty]
    private int _pageCount;

    [ObservableProperty]
    private System.Windows.Media.Imaging.BitmapSource? _pageImage;

    [ObservableProperty]
    private TextElementViewModel? _selectedTextElement;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelectedImage))]
    private ImageElementViewModel? _selectedImageElement;

    public bool HasSelectedImage => SelectedImageElement is not null;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelectedAnnotation))]
    private AnnotationElementViewModel? _selectedAnnotationElement;

    public bool HasSelectedAnnotation => SelectedAnnotationElement is not null;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelectedFormField))]
    private FormFieldViewModel? _selectedFormField;

    public bool HasSelectedFormField => SelectedFormField is not null;

    [ObservableProperty]
    private double _pageWidth;

    [ObservableProperty]
    private double _pageHeight;

    [ObservableProperty]
    private bool _hasDocument;

    [ObservableProperty]
    private string _findText = string.Empty;

    [ObservableProperty]
    private string _replaceText = string.Empty;

    [ObservableProperty]
    private bool _matchCase;

    [ObservableProperty]
    private string _ocrLanguages = "eng+kor";

    [ObservableProperty]
    private string _toolStatusText = string.Empty;

    [ObservableProperty]
    private int _selectedTabIndex;

    partial void OnOcrLanguagesChanged(string value)
    {
        if (_document is not null)
        {
            _document.OcrLanguages = value;
        }
    }

    partial void OnCurrentPageIndexChanged(int value)
    {
        if (_document is null)
        {
            return;
        }

        try
        {
            _documentService.EnsurePageLoaded(_document, value);
            RefreshPage();
        }
        catch (Exception ex)
        {
            ReportError("페이지 로드 실패", ex, "페이지 표시");
        }
    }

    partial void OnSelectedTextElementChanged(TextElementViewModel? value)
    {
        foreach (var item in TextElements)
        {
            item.IsSelected = item == value;
        }

        if (value is not null)
        {
            ClearSelectionExcept(text: value);
        }
    }

    partial void OnSelectedImageElementChanged(ImageElementViewModel? value)
    {
        foreach (var item in ImageElements)
        {
            item.IsSelected = item == value;
        }

        if (value is not null)
        {
            ClearSelectionExcept(image: value);
            SelectedTabIndex = 1;
        }

        ReplaceImageCommand.NotifyCanExecuteChanged();
    }

    partial void OnSelectedAnnotationElementChanged(AnnotationElementViewModel? value)
    {
        foreach (var item in AnnotationElements)
        {
            item.IsSelected = item == value;
        }

        if (value is not null)
        {
            ClearSelectionExcept(annotation: value);
            SelectedTabIndex = 2;
        }
    }

    partial void OnSelectedFormFieldChanged(FormFieldViewModel? value)
    {
        foreach (var item in FormFields)
        {
            item.IsSelected = item == value;
        }

        if (value is not null)
        {
            ClearSelectionExcept(formField: value);
            SelectedTabIndex = 3;
        }
    }

    private void ClearSelectionExcept(
        TextElementViewModel? text = null,
        ImageElementViewModel? image = null,
        AnnotationElementViewModel? annotation = null,
        FormFieldViewModel? formField = null)
    {
        if (text is null)
        {
            SelectedTextElement = null;
        }

        if (image is null)
        {
            SelectedImageElement = null;
        }

        if (annotation is null)
        {
            SelectedAnnotationElement = null;
        }

        if (formField is null)
        {
            SelectedFormField = null;
        }
    }

    [RelayCommand]
    private void OpenPdf()
    {
        var dialog = new OpenFileDialog
        {
            Filter = "PDF files (*.pdf)|*.pdf",
            Title = "PDF 열기"
        };

        if (dialog.ShowDialog() != true)
        {
            return;
        }

        try
        {
            _document = OpenPdfWithPassword(dialog.FileName);
            if (_document is null)
            {
                return;
            }

            PageCount = _document.Pages.Count;
            CurrentPageIndex = 0;
            DocumentTitle = Path.GetFileName(dialog.FileName);
            HasDocument = true;
            OcrLanguages = _document.OcrLanguages;
            var encryptedLabel = _document.IsEncrypted ? ", 암호화됨" : string.Empty;
            StatusText = $"열림: {dialog.FileName} (페이지 {PageCount}, 텍스트 {CountAllTextElements()}, 이미지 {CountAllImageElements()}, 주석 {CountAllAnnotations()}, 폼 {CountAllFormFields()}{encryptedLabel})";
            RefreshPage();
        }
        catch (Exception ex)
        {
            ReportError("PDF 열기 실패", ex, "PDF 열기");
        }
    }

    [RelayCommand(CanExecute = nameof(HasDocument))]
    private void SavePdf()
    {
        if (_document is null)
        {
            return;
        }

        var dialog = new SaveFileDialog
        {
            Filter = "PDF files (*.pdf)|*.pdf",
            Title = "PDF 저장",
            FileName = Path.GetFileName(_document.SourcePdfPath)
        };

        if (dialog.ShowDialog() != true)
        {
            return;
        }

        try
        {
            var applied = _documentService.SavePdf(_document, dialog.FileName);
            StatusText = $"PDF 저장 완료 ({applied}개 변경 적용)";
            RefreshPage();
        }
        catch (Exception ex)
        {
            ReportError("PDF 저장 실패", ex, "PDF 저장");
        }
    }

    [RelayCommand(CanExecute = nameof(HasDocument))]
    private void SaveJson()
    {
        if (_document is null)
        {
            return;
        }

        var dialog = new SaveFileDialog
        {
            Filter = "JSON files (*.json)|*.json",
            Title = "JSON 저장",
            FileName = Path.ChangeExtension(Path.GetFileName(_document.SourcePdfPath), ".json")
        };

        if (dialog.ShowDialog() != true)
        {
            return;
        }

        try
        {
            _documentService.SaveJson(_document, dialog.FileName);
            StatusText = $"JSON 저장 완료: {dialog.FileName}";
        }
        catch (Exception ex)
        {
            ReportError("JSON 저장 실패", ex, "JSON 저장");
        }
    }

    [RelayCommand(CanExecute = nameof(HasDocument))]
    private void FindAndReplace()
    {
        if (_document is null || string.IsNullOrWhiteSpace(FindText))
        {
            return;
        }

        try
        {
            var count = _documentService.FindAndReplace(_document, FindText, ReplaceText, MatchCase);
            StatusText = count > 0
                ? $"찾기/바꾸기 완료: {count}건"
                : "일치하는 텍스트가 없습니다.";
            RefreshPage();
        }
        catch (Exception ex)
        {
            ReportError("찾기/바꾸기 실패", ex, "찾기/바꾸기");
        }
    }

    [RelayCommand(CanExecute = nameof(CanReplaceImage))]
    private void ReplaceImage()
    {
        if (SelectedImageElement is null)
        {
            return;
        }

        var dialog = new OpenFileDialog
        {
            Filter = "이미지 파일 (*.png;*.jpg;*.jpeg;*.bmp;*.gif)|*.png;*.jpg;*.jpeg;*.bmp;*.gif",
            Title = "교체할 이미지 선택"
        };

        if (dialog.ShowDialog() != true)
        {
            return;
        }

        try
        {
            SelectedImageElement.SetReplacementFile(dialog.FileName);
            StatusText = $"이미지 교체 준비: {Path.GetFileName(dialog.FileName)}";
            OnDocumentUpdated();
        }
        catch (Exception ex)
        {
            ReportError("이미지 선택 실패", ex, "이미지 교체");
        }
    }

    private bool CanReplaceImage() => HasDocument && SelectedImageElement is not null;

    [RelayCommand(CanExecute = nameof(CanRunOcr))]
    private void OcrCurrentPage()
    {
        if (_document is null)
        {
            return;
        }

        try
        {
            var export = _pageImageExporter.ExportPage(_document.WorkingPdfPath, CurrentPageIndex);
            if (export is null)
            {
                _errorDialogService.Show("OCR 실패", "페이지 이미지를 생성하지 못했습니다.");
                return;
            }

            var count = _documentService.RunOcrOnPage(
                _document,
                CurrentPageIndex,
                export.ImagePath,
                export.Width,
                export.Height);

            StatusText = count > 0
                ? $"OCR 완료: 현재 페이지에서 {count}개 텍스트 블록 추출"
                : "OCR 결과 텍스트가 없습니다.";
            RefreshPage();
        }
        catch (Exception ex)
        {
            ReportError("OCR 실패", ex, "현재 페이지 OCR");
        }
    }

    [RelayCommand(CanExecute = nameof(CanRunOcr))]
    private void OcrAllPages()
    {
        if (_document is null)
        {
            return;
        }

        try
        {
            var count = _documentService.RunOcrOnAllPages(_document, pageIndex =>
            {
                var export = _pageImageExporter.ExportPage(_document.WorkingPdfPath, pageIndex);
                if (export is null)
                {
                    return null;
                }

                return new PageImageInfo
                {
                    ImagePath = export.ImagePath,
                    Width = export.Width,
                    Height = export.Height
                };
            });

            StatusText = count > 0
                ? $"OCR 완료: 전체 문서에서 {count}개 텍스트 블록 추출"
                : "OCR 대상 페이지가 없거나 결과가 없습니다.";
            RefreshPage();
        }
        catch (Exception ex)
        {
            ReportError("OCR 실패", ex, "전체 페이지 OCR");
        }
    }

    private bool CanRunOcr() => HasDocument && IsTesseractAvailable;

    partial void OnHasDocumentChanged(bool value)
    {
        ReplaceImageCommand.NotifyCanExecuteChanged();
        OcrCurrentPageCommand.NotifyCanExecuteChanged();
        OcrAllPagesCommand.NotifyCanExecuteChanged();
    }

    private EditorDocument? OpenPdfWithPassword(string filePath)
    {
        string? password = null;
        var invalidPassword = false;

        while (true)
        {
            try
            {
                if (_documentService.IsEncrypted(filePath) && string.IsNullOrEmpty(password))
                {
                    password = _passwordPromptService.Prompt(Path.GetFileName(filePath), invalidPassword);
                    if (password is null)
                    {
                        return null;
                    }
                }

                return _documentService.Open(filePath, password);
            }
            catch (PdfPasswordRequiredException)
            {
                password = _passwordPromptService.Prompt(Path.GetFileName(filePath), invalidPassword);
                if (password is null)
                {
                    return null;
                }
            }
            catch (PdfPasswordInvalidException)
            {
                invalidPassword = true;
                password = _passwordPromptService.Prompt(Path.GetFileName(filePath), true);
                if (password is null)
                {
                    return null;
                }
            }
        }
    }

    private void UpdateToolStatus()
    {
        var tesseract = _documentService.GetTesseractInfo();
        ToolStatusText = tesseract.IsAvailable
            ? $"Tesseract: {tesseract.ResolvedPath}"
            : "Tesseract: 미설치 (OCR 사용 불가)";
    }

    [RelayCommand]
    private void PreviousPage()
    {
        if (CurrentPageIndex > 0)
        {
            CurrentPageIndex--;
        }
    }

    [RelayCommand]
    private void NextPage()
    {
        if (CurrentPageIndex < PageCount - 1)
        {
            CurrentPageIndex++;
        }
    }

    public void SelectTextElement(TextElementViewModel element) =>
        SelectedTextElement = element;

    public void SelectImageElement(ImageElementViewModel element) =>
        SelectedImageElement = element;

    public void SelectAnnotationElement(AnnotationElementViewModel element) =>
        SelectedAnnotationElement = element;

    public void SelectFormField(FormFieldViewModel element) =>
        SelectedFormField = element;

    private void RefreshPage()
    {
        if (_document is null || CurrentPageIndex < 0 || CurrentPageIndex >= _document.Pages.Count)
        {
            return;
        }

        _documentService.EnsurePageLoaded(_document, CurrentPageIndex);

        var page = _document.Pages[CurrentPageIndex];
        PageImage = _renderService.RenderPage(_document.WorkingPdfPath, CurrentPageIndex);

        var scale = PageImage is null ? 1.0 : PageImage.PixelWidth / page.Width;
        PageWidth = PageImage?.PixelWidth ?? page.Width;
        PageHeight = PageImage?.PixelHeight ?? page.Height;

        TextElements.Clear();
        foreach (var element in page.TextElements)
        {
            TextElements.Add(new TextElementViewModel(element, page.Height, scale, OnDocumentUpdated));
        }

        ImageElements.Clear();
        foreach (var element in page.ImageElements)
        {
            ImageElements.Add(new ImageElementViewModel(element, page.Height, scale, OnDocumentUpdated));
        }

        AnnotationElements.Clear();
        foreach (var element in page.Annotations)
        {
            AnnotationElements.Add(new AnnotationElementViewModel(element, page.Height, scale, OnDocumentUpdated));
        }

        FormFields.Clear();
        foreach (var field in _document.FormFields.Where(f => f.PageIndex == CurrentPageIndex || f.PageIndex < 0))
        {
            FormFields.Add(new FormFieldViewModel(field, page.Height, scale, OnDocumentUpdated));
        }

        SelectedTextElement = null;
        SelectedImageElement = null;
        SelectedAnnotationElement = null;
        SelectedFormField = null;
    }

    private void OnDocumentUpdated()
    {
        StatusText = _document?.IsDirty == true
            ? "변경 사항이 있습니다. 저장해주세요."
            : StatusText;
    }

    private void ReportError(string title, Exception exception, string context)
    {
        StatusText = $"{title}: {exception.Message}";
        _errorDialogService.Show(title, exception, context);
    }

    private int CountAllTextElements()
    {
        if (_document is null)
        {
            return 0;
        }

        return _document.Pages.Where(p => p.IsLoaded).Sum(p => p.TextElements.Count);
    }

    private int CountAllImageElements()
    {
        if (_document is null)
        {
            return 0;
        }

        return _document.Pages.Where(p => p.IsLoaded).Sum(p => p.ImageElements.Count);
    }

    private int CountAllAnnotations()
    {
        if (_document is null)
        {
            return 0;
        }

        return _document.Pages.Where(p => p.IsLoaded).Sum(p => p.Annotations.Count);
    }

    private int CountAllFormFields() => _document?.FormFields.Count ?? 0;
}

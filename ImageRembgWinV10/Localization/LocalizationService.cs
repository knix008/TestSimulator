using ImageRembgWinV10.Services;

namespace ImageRembgWinV10.Localization;

public static class L
{
    public static AppLanguage Current => LocalizationService.Current;

    public static event EventHandler? Changed
    {
        add => LocalizationService.Changed += value;
        remove => LocalizationService.Changed -= value;
    }

    public static string Get(string key) => LocalizationService.Get(key);

    public static string Get(AppLanguage language, string key) => LocalizationService.Get(language, key);

    public static string F(string key, params object?[] args) => LocalizationService.Format(key, args);

    public static void SetLanguage(AppLanguage language) => LocalizationService.SetLanguage(language);

    public static string OpenFileFilter => LocalizationService.GetOpenFileFilter();

    public static string SaveFileFilter => LocalizationService.GetSaveFileFilter();
}

internal static class LocalizationService
{
    private static readonly Dictionary<string, (string Ko, string En)> Strings = new(StringComparer.Ordinal)
    {
        ["Menu.File"] = ("파일", "File"),
        ["Menu.Edit"] = ("편집", "Edit"),
        ["Menu.View"] = ("보기", "View"),
        ["Menu.Tools"] = ("도구", "Tools"),
        ["Menu.Algorithm"] = ("알고리즘", "Algorithm"),
        ["Menu.Language"] = ("언어", "Language"),
        ["Menu.LanguageKorean"] = ("한국어", "Korean"),
        ["Menu.LanguageEnglish"] = ("English", "English"),
        ["Menu.Preferences"] = ("환경설정...", "Preferences..."),
        ["Preferences.Title"] = ("환경설정", "Preferences"),
        ["ProgressDialog.Title"] = ("처리 중...", "Processing..."),
        ["Preferences.Language"] = ("표시 언어", "Display language"),
        ["Common.Cancel"] = ("취소", "Cancel"),
        ["Menu.Help"] = ("도움말", "Help"),
        ["Menu.About"] = ("정보", "About"),
        ["Menu.Info"] = ("Info", "Info"),
        ["About.Title"] = ("Image Rembg 정보", "About Image Rembg"),
        ["About.Version"] = ("버전 {0}", "Version {0}"),
        ["Menu.Open"] = ("열기", "Open"),
        ["Menu.Save"] = ("저장", "Save"),
        ["Menu.Exit"] = ("종료", "Exit"),
        ["Menu.Undo"] = ("실행 취소", "Undo"),
        ["Menu.Redo"] = ("다시 실행", "Redo"),
        ["Menu.Preview"] = ("외곽선 미리보기", "Preview Outline"),
        ["Menu.RemoveBackground"] = ("배경 제거", "Remove Background"),
        ["Menu.Reset"] = ("초기화", "Reset"),
        ["Menu.ZoomIn"] = ("확대", "Zoom In"),
        ["Menu.ZoomOut"] = ("축소", "Zoom Out"),
        ["Menu.Fit"] = ("화면 맞춤", "Fit to Window"),
        ["Menu.FitShort"] = ("맞춤", "Fit"),
        ["Menu.ShowMask"] = ("마스크 미리보기", "Show Mask Preview"),
        ["Menu.ShowResult"] = ("결과 보기", "Show Result"),
        ["Menu.SelectFreehand"] = ("자유 선택", "Free Select"),
        ["Menu.SelectRect"] = ("사각형 선택", "Rectangle Select"),
        ["Menu.SelectRectShort"] = ("사각형", "Rectangle"),
        ["Menu.Foreground"] = ("전경 표시(브러시)", "Mark Foreground (Brush)"),
        ["Menu.Background"] = ("배경 표시(브러시)", "Mark Background (Brush)"),
        ["Menu.Pan"] = ("끌기", "Pan"),
        ["Menu.PanDrag"] = ("끌기 (드래그)", "Pan (Drag)"),

        ["Toolbar.PreviewShort"] = ("미리보기", "Preview"),
        ["Toolbar.RemoveBackgroundShort"] = ("배경제거", "Remove BG"),
        ["Toolbar.ShowMaskShort"] = ("마스크", "Mask"),
        ["Toolbar.ShowResultShort"] = ("결과", "Result"),
        ["Toolbar.SelectFreehandShort"] = ("자유선택", "Freehand"),
        ["Toolbar.ForegroundShort"] = ("전경", "FG"),
        ["Toolbar.BackgroundShort"] = ("배경", "BG"),

        ["Form.Title"] = ("Image Rembg - 배경 제거", "Image Rembg - Background Removal"),
        ["Label.ResultSize"] = ("결과 크기:", "Output Size:"),
        ["Label.Algorithm"] = ("알고리즘:", "Algorithm:"),
        ["Hint.Workflow"] = ("끌기 → 자유/사각형 선택 → 미리보기 → 배경 제거", "Pan → Select → Preview → Remove Background"),

        ["Tooltip.Menu.File"] = ("파일 열기, 저장, 종료", "Open, save, and exit"),
        ["Tooltip.Menu.Edit"] = ("미리보기, 배경 제거, 초기화", "Preview, remove background, and reset"),
        ["Tooltip.Menu.View"] = ("확대/축소, 표시 옵션, UI 언어", "Zoom, display options, and UI language"),
        ["Tooltip.Menu.Tools"] = ("영역 선택 및 편집 도구", "Selection and editing tools"),
        ["Tooltip.Menu.Algorithm"] = ("배경 분리 알고리즘 선택", "Choose a background removal algorithm"),
        ["Tooltip.Menu.Help"] = ("프로그램 정보 및 도움말", "Program information and help"),
        ["Tooltip.Open"] = ("이미지 파일을 엽니다 (Ctrl+O)", "Open an image file (Ctrl+O)"),
        ["Tooltip.Save"] = ("배경 제거 결과를 저장합니다 (Ctrl+S)", "Save the background removal result (Ctrl+S)"),
        ["Tooltip.Exit"] = ("프로그램을 종료합니다", "Exit the application"),
        ["Tooltip.Undo"] = ("마지막 선택/마커 작업을 취소합니다 (Ctrl+Z)", "Undo the last selection or marker edit (Ctrl+Z)"),
        ["Tooltip.Redo"] = ("취소한 작업을 다시 실행합니다 (Ctrl+Y)", "Redo the previously undone edit (Ctrl+Y)"),
        ["Tooltip.Preview"] = ("선택 영역의 외곽선과 마스크를 미리 봅니다", "Preview the outline and mask for the selected region"),
        ["Tooltip.RemoveBackground"] = ("선택 영역을 기준으로 배경을 제거합니다", "Remove the background using the selected region"),
        ["Tooltip.Reset"] = ("선택, 표시 점, 미리보기, 결과를 모두 지웁니다", "Clear selection, marks, preview, and result"),
        ["Tooltip.ZoomIn"] = ("이미지를 확대합니다 (마우스 휠)", "Zoom in on the image (mouse wheel)"),
        ["Tooltip.ZoomOut"] = ("이미지를 축소합니다 (마우스 휠)", "Zoom out on the image (mouse wheel)"),
        ["Tooltip.Fit"] = ("이미지 전체가 보이도록 화면에 맞춥니다", "Fit the entire image to the window"),
        ["Tooltip.ShowMask"] = ("분리 마스크 미리보기를 켜거나 끕니다", "Show or hide the segmentation mask preview"),
        ["Tooltip.ShowResult"] = ("배경 제거 결과를 원본과 전환해 봅니다", "Toggle between the original and the removed-background result"),
        ["Tooltip.SelectFreehand"] = ("마우스로 자유롭게 영역을 그려 선택합니다", "Draw a freehand region around the object"),
        ["Tooltip.SelectRect"] = ("사각형으로 영역을 선택합니다", "Select a rectangular region"),
        ["Tooltip.Foreground"] = ("남길 전경 영역을 브러시로 표시합니다", "Mark foreground areas to keep with the brush"),
        ["Tooltip.Background"] = ("제거할 배경 영역을 브러시로 표시합니다", "Mark background areas to remove with the brush"),
        ["Tooltip.Pan"] = ("이미지를 끌어 이동합니다 (확대 시 스크롤)", "Pan the image (scroll when zoomed in)"),
        ["Tooltip.Language"] = ("UI 표시 언어를 선택합니다", "Choose the UI display language"),
        ["Tooltip.LanguageKorean"] = ("한국어 UI로 전환합니다", "Switch the UI to Korean"),
        ["Tooltip.LanguageEnglish"] = ("English UI로 전환합니다", "Switch the UI to English"),
        ["Tooltip.Preferences"] = ("표시 언어 등 환경설정을 엽니다", "Open preferences such as display language"),
        ["Tooltip.About"] = ("버전 및 저작권 정보를 표시합니다", "Show version and copyright information"),
        ["Tooltip.Info"] = ("프로그램 정보 대화상자를 엽니다", "Open the about dialog"),
        ["Tooltip.ResultSize"] = ("저장할 결과 이미지의 크기 방식", "Output image size mode for saving"),
        ["Tooltip.ResultSizeCombo"] = ("원본 크기 또는 선택 영역만 잘라 저장", "Save at original size or crop to the selection"),
        ["Tooltip.Algorithm"] = ("배경 분리에 사용할 알고리즘", "Algorithm used for background removal"),
        ["Tooltip.AlgorithmCombo"] = ("rembg AI 또는 OpenCV 알고리즘 중 선택", "Choose rembg AI or an OpenCV algorithm"),
        ["Tooltip.WorkflowHint"] = ("권장 작업 순서 안내", "Recommended workflow steps"),

        ["Status.Ready"] = ("시작 준비 완료. 이미지를 열어 주세요.", "Ready. Open an image to begin."),
        ["Status.LoadingImage"] = ("이미지를 불러오는 중...", "Loading image..."),
        ["Status.AnalyzingOutline"] = ("외곽선을 분석하는 중...", "Analyzing outline..."),
        ["Status.RemovingBackground"] = ("배경을 제거하는 중...", "Removing background..."),
        ["Status.PreviewComplete"] = ("외곽선 미리보기 완료 [{0}] (전경 {1:P1}). 확인 후 [배경 제거]를 누르세요.", "Outline preview complete [{0}] (foreground {1:P1}). Review, then click [Remove Background]."),
        ["Status.RemoveComplete"] = ("배경 제거 완료 ({0} x {1}, {2}). PNG로 저장하세요.", "Background removed ({0} x {1}, {2}). Save as PNG."),
        ["Status.SaveComplete"] = ("저장 완료 ({0}, {1} x {2}): {3}", "Saved ({0}, {1} x {2}): {3}"),
        ["Status.Reset"] = ("선택과 결과를 초기화했습니다.", "Selection and result cleared."),
        ["Status.Algorithm"] = ("알고리즘: {0} - {1}", "Algorithm: {0} - {1}"),
        ["Status.Zoom"] = ("배율: {0}%", "Zoom: {0}%"),
        ["Status.Mode"] = ("모드: {0}", "Mode: {0}"),

        ["Mode.Pan"] = ("끌기", "Pan"),
        ["Mode.SelectFreehand"] = ("자유 선택", "Free Select"),
        ["Mode.SelectRect"] = ("사각형 선택", "Rectangle Select"),
        ["Mode.Foreground"] = ("전경 표시", "Mark Foreground"),
        ["Mode.Background"] = ("배경 표시", "Mark Background"),
        ["Mode.Unknown"] = ("-", "-"),

        ["Dialog.OpenImage"] = ("이미지 열기", "Open Image"),
        ["Dialog.SaveResult"] = ("결과 저장", "Save Result"),

        ["Msg.NoImage"] = ("이미지 없음", "No Image"),
        ["Msg.NoImageBody"] = ("먼저 이미지를 열어 주세요.", "Open an image first."),
        ["Msg.SelectionRequired"] = ("영역 선택 필요", "Selection Required"),
        ["Msg.SelectionRequiredBody"] = ("먼저 객체를 포함하도록 마우스로 자유롭게 영역을 그려 주세요.", "Draw a region around the object with the mouse."),
        ["Msg.SelectionRequiredShort"] = ("먼저 객체를 포함하도록 영역을 선택해 주세요.", "Select a region that includes the object."),
        ["Msg.NoPreview"] = ("미리보기 없음", "No Preview"),
        ["Msg.NoPreviewBody"] = ("외곽선 미리보기 없이 바로 배경을 제거할까요?\n미리보기를 먼저 실행하는 것을 권장합니다.", "Remove background without preview?\nRunning preview first is recommended."),
        ["Msg.NoResultToSave"] = ("저장", "Save"),
        ["Msg.NoResultToSaveBody"] = ("저장할 결과가 없습니다. 먼저 배경을 제거해 주세요.", "Nothing to save. Remove the background first."),

        ["OutputSize.Original"] = ("원본 크기", "Original Size"),
        ["OutputSize.Selection"] = ("선택 영역", "Selection Crop"),

        ["SaveMode.Transparent"] = ("투명 배경", "Transparent"),
        ["SaveMode.White"] = ("흰색 배경", "White Background"),

        ["Common.None"] = ("없음", "None"),
        ["Common.Present"] = ("있음", "Yes"),
        ["Common.Absent"] = ("없음", "No"),
        ["Common.Rectangle"] = ("사각형", "Rectangle"),
        ["Common.Freehand"] = ("자유선", "Freehand"),
        ["Common.Yes"] = ("예", "Yes"),
        ["Common.No"] = ("아니오", "No"),

        ["Context.Algorithm"] = ("알고리즘", "Algorithm"),
        ["Context.SelectionMode"] = ("선택 방식", "Selection Mode"),
        ["Context.SelectionArea"] = ("선택 영역", "Selection Area"),
        ["Context.ResultSize"] = ("결과 크기", "Output Size"),
        ["Context.ForegroundHint"] = ("전경 표시", "Foreground Marks"),
        ["Context.BackgroundHint"] = ("배경 표시", "Background Marks"),
        ["Context.ImageSize"] = ("이미지 크기", "Image Size"),
        ["Context.File"] = ("파일", "File"),
        ["Context.PreviewMask"] = ("미리보기 마스크", "Preview Mask"),
        ["Context.SavePath"] = ("저장 경로", "Save Path"),
        ["Context.Format"] = ("형식", "Format"),
        ["Context.Extension"] = ("확장자", "Extension"),
        ["Context.SupportedFormats"] = ("지원 형식", "Supported Formats"),
        ["Context.FilePath"] = ("파일 경로", "File Path"),
        ["Context.FileSize"] = ("파일 크기", "File Size"),
        ["Context.Executable"] = ("실행 파일", "Executable"),
        ["Context.Timestamp"] = ("시각", "Time"),
        ["Context.WillTerminate"] = ("종료 예정", "Will Terminate"),

        ["Error.OpenFailed"] = ("열기 실패", "Open Failed"),
        ["Error.OpenFailedBody"] = ("이미지를 불러오지 못했습니다.", "Could not load the image."),
        ["Error.FileNotFound"] = ("파일을 찾을 수 없습니다.", "File not found."),
        ["Error.UnsupportedFormat"] = ("지원하지 않는 형식", "Unsupported Format"),
        ["Error.UnsupportedFormatBody"] = ("지원하지 않는 이미지 형식입니다.", "This image format is not supported."),
        ["Error.PreviewFailed"] = ("미리보기 실패", "Preview Failed"),
        ["Error.PreviewFailedBody"] = ("외곽선 미리보기 중 오류가 발생했습니다.", "An error occurred during outline preview."),
        ["Error.RemoveFailed"] = ("배경 제거 실패", "Remove Failed"),
        ["Error.RemoveFailedBody"] = ("배경 제거 중 오류가 발생했습니다.", "An error occurred while removing the background."),
        ["Error.SaveFailed"] = ("저장 실패", "Save Failed"),
        ["Error.SaveFailedBody"] = ("결과 파일을 저장하지 못했습니다.", "Could not save the result file."),
        ["Error.Unhandled"] = ("처리되지 않은 오류", "Unhandled Error"),
        ["Error.UnhandledBody"] = ("예기치 않은 오류가 발생했습니다.", "An unexpected error occurred."),
        ["Error.Fatal"] = ("치명적 오류", "Fatal Error"),
        ["Error.FatalBody"] = ("프로그램을 계속 실행할 수 없습니다.", "The application cannot continue."),

        ["ErrorDialog.Title"] = ("오류", "Error"),
        ["ErrorDialog.Copy"] = ("내용 복사", "Copy Details"),
        ["ErrorDialog.Copied"] = ("복사됨", "Copied"),
        ["ErrorDialog.Ok"] = ("확인", "OK"),
        ["ErrorDialog.Summary"] = ("【요약】", "【Summary】"),
        ["ErrorDialog.Content"] = ("【오류 내용】", "【Error Message】"),
        ["ErrorDialog.Action"] = ("【조치 방법】", "【Suggested Action】"),
        ["ErrorDialog.Details"] = ("【상세 정보】", "【Details】"),
        ["ErrorDialog.Exception"] = ("【예외 정보】", "【Exception Info】"),
        ["ErrorDialog.Type"] = ("유형", "Type"),
        ["ErrorDialog.Message"] = ("메시지", "Message"),
        ["ErrorDialog.Source"] = ("소스", "Source"),
        ["ErrorDialog.Hresult"] = ("HRESULT", "HRESULT"),
        ["ErrorDialog.StackTrace"] = ("스택 추적", "Stack Trace"),
        ["ErrorDialog.InnerException"] = ("--- 내부 예외 ---", "--- Inner Exception ---"),

        ["ErrorHint.Selection"] = ("선택 영역을 더 크게 그리거나, 전/배경 표시를 추가하거나, 다른 알고리즘을 시도해 보세요.", "Try enlarging the selection, adding foreground/background marks, or using a different algorithm."),
        ["ErrorHint.Rembg"] = ("인터넷 연결과 방화벽 설정을 확인한 뒤 다시 시도해 주세요. 모델은 %LOCALAPPDATA%\\ImageRembgWinV10\\models\\ 에 저장됩니다.", "Check your internet connection and firewall, then try again. Models are stored in %LOCALAPPDATA%\\ImageRembgWinV10\\models\\."),
        ["ErrorHint.BackgroundColor"] = ("배경 표시 모드로 배경 영역을 그리거나, GrabCut·rembg 알고리즘을 사용해 보세요.", "Mark background areas with the background brush, or try GrabCut or rembg."),
        ["ErrorHint.IO"] = ("파일이 다른 프로그램에서 사용 중인지, 저장 경로 권한과 디스크 공간을 확인해 주세요.", "Check whether the file is in use, verify path permissions, and ensure enough disk space."),
        ["ErrorHint.Network"] = ("네트워크 연결 상태를 확인한 뒤 다시 시도해 주세요.", "Check your network connection and try again."),

        ["Canvas.EmptyHint"] = ("이미지를 열거나 여기로 끌어다 놓으세요", "Open an image or drag and drop it here"),

        ["Algo.Rembg.Name"] = ("rembg (AI, U2Net)", "rembg (AI, U2Net)"),
        ["Algo.Rembg.Desc"] = ("rembg U2Net 딥러닝 모델로 자동 배경 분리. 기본 알고리즘", "Automatic background separation using rembg U2Net. Default algorithm."),
        ["Algo.Rembg2.Name"] = ("rembg2 (AI, RMBG-2.0)", "rembg2 (AI, RMBG-2.0)"),
        ["Algo.Rembg2.Desc"] = ("RMBG-2.0 딥러닝 모델로 자동 배경 분리. 사물 인식이 더 강함 (비상업적 라이선스)", "Automatic background separation using RMBG-2.0. Stronger on general objects (non-commercial license)."),
        ["Algo.GrabCut.Name"] = ("GrabCut (범용)", "GrabCut (General)"),
        ["Algo.GrabCut.Desc"] = ("자유 선택과 전/배경 브러시 표시를 활용한 일반 목적 분리", "General-purpose separation using free selection and foreground/background marks."),
        ["Algo.ColorKey.Name"] = ("색상 키잉", "Color Keying"),
        ["Algo.ColorKey.Desc"] = ("단색 또는 유사색 배경. 배경 브러시를 추가하면 더 정확합니다.", "Solid or similar-color backgrounds. Add background marks for better accuracy."),
        ["Algo.EdgeFill.Name"] = ("윤곽선 채우기", "Edge Fill"),
        ["Algo.EdgeFill.Desc"] = ("객체 외곽선이 뚜렷할 때 적합합니다.", "Best when the object has clear edges."),
        ["Algo.Threshold.Name"] = ("임계값 (Otsu)", "Threshold (Otsu)"),
        ["Algo.Threshold.Desc"] = ("전경과 배경의 명암 대비가 클 때 적합합니다.", "Best when foreground and background contrast strongly."),

        ["Exception.NoSelection"] = ("선택 영역이 없습니다.", "No selection area."),
        ["Exception.NoImageLoaded"] = ("이미지가 로드되지 않았습니다.", "No image loaded."),
        ["Exception.DrawSelection"] = ("객체 영역을 마우스로 자유롭게 그려 선택해 주세요.", "Draw a region around the object with the mouse."),
        ["Exception.SelectionTooSmall"] = ("선택 영역이 너무 작습니다. 객체를 포함하도록 더 크게 그려 주세요.", "Selection is too small. Draw a larger region that includes the object."),
        ["Exception.ObjectNotFound"] = ("객체를 찾지 못했습니다. 선택 영역을 조정하거나 다른 알고리즘을 시도해 주세요.", "Object not found. Adjust the selection or try another algorithm."),
        ["Exception.CropOutOfBounds"] = ("잘라낼 영역이 이미지 범위를 벗어났습니다.", "Crop region is outside the image bounds."),
        ["Exception.SelectionNotFound"] = ("선택 영역을 찾을 수 없습니다.", "Selection area not found."),
        ["Exception.ImageMaskMismatch"] = ("이미지와 마스크 크기가 일치하지 않습니다.", "Image and mask sizes do not match."),
        ["Exception.BackgroundColorUnknown"] = ("배경 색상을 추정할 수 없습니다. 배경 영역을 마우스로 그려 주세요.", "Cannot estimate background color. Mark background areas with the mouse."),
        ["Exception.ContourNotFound"] = ("윤곽선을 찾지 못했습니다. 다른 알고리즘을 시도해 주세요.", "Contour not found. Try another algorithm."),
        ["Exception.RembgNotReady"] = ("rembg 모델이 아직 준비되지 않았습니다.", "rembg model is not ready yet."),
        ["Exception.RembgLoadFailed"] = ("rembg AI 모델을 불러오지 못했습니다: {0}. 모델 파일을 확인하거나 다시 다운로드해 주세요. ({1})", "Failed to load rembg AI model: {0}. Verify the model file or download again. ({1})"),
        ["Exception.RembgDownloadFailed"] = ("rembg AI 모델(u2net) 다운로드 실패: {0}. 인터넷 연결과 방화벽 설정을 확인한 뒤 다시 시도해 주세요.", "rembg AI model (u2net) download failed: {0}. Check internet connection and firewall, then try again."),
        ["Exception.RembgDownloadTimeout"] = ("rembg AI 모델(u2net) 다운로드 시간이 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.", "rembg AI model (u2net) download timed out. Check network status and try again."),
        ["Exception.RembgDownloadCorrupt"] = ("rembg 모델 다운로드가 손상되었습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "rembg model download is corrupted. Check network connection and try again."),
        ["Exception.RembgOutputUnreadable"] = ("rembg 모델 출력을 읽을 수 없습니다.", "Cannot read rembg model output."),
        ["Exception.Rembg2ModelMissing"] = ("rembg2(RMBG-2.0) 모델 파일을 찾을 수 없습니다: {0}. 라이선스 동의 후 Hugging Face에서 받은 onnx 파일을 이 경로에 배치해 주세요.", "rembg2 (RMBG-2.0) model file was not found: {0}. Place the ONNX file you downloaded from Hugging Face (after accepting the license) at this path."),
        ["Exception.FileNotFound"] = ("이미지 파일을 찾을 수 없습니다.", "Image file not found."),
        ["Exception.UnsupportedExtension"] = ("지원하지 않는 형식입니다: {0}", "Unsupported format: {0}"),
        ["Exception.UnsupportedImageFormat"] = ("OpenCV 처리에 필요한 이미지 형식이 아닙니다. (채널 수: {0}, 형식: {1})", "Image format is not suitable for OpenCV processing. (Channels: {0}, Type: {1})"),
        ["Exception.UnsupportedTransparentSave"] = ("투명 배경을 지원하지 않는 형식입니다: {0}", "Format does not support transparency: {0}"),

        ["Rembg.LoadingModel"] = ("rembg AI 모델을 불러오는 중...", "Loading rembg AI model..."),
        ["Rembg.DownloadingModel"] = ("rembg AI 모델(u2net)을 다운로드하는 중...", "Downloading rembg AI model (u2net)..."),
        ["Rembg.DownloadProgress"] = ("rembg AI 모델 다운로드 중... {0}%", "Downloading rembg AI model... {0}%"),

        ["FileFilter.OpenSupported"] = ("지원 이미지", "Supported Images"),
        ["FileFilter.OpenAll"] = ("모든 파일 (*.*)", "All Files (*.*)"),
        ["FileFilter.SavePng"] = ("PNG (투명 배경)", "PNG (Transparent)"),
        ["FileFilter.SaveWebp"] = ("WebP (투명 배경)", "WebP (Transparent)"),
        ["FileFilter.SaveGif"] = ("GIF (투명 배경)", "GIF (Transparent)"),
        ["FileFilter.SaveTiff"] = ("TIFF (투명 배경)", "TIFF (Transparent)"),
        ["FileFilter.SaveJpeg"] = ("JPEG (흰색 배경)", "JPEG (White Background)"),
        ["FileFilter.SaveBmp"] = ("BMP (흰색 배경)", "BMP (White Background)"),
    };

    private static AppLanguage _current = AppLanguage.Korean;

    public static AppLanguage Current => _current;

    public static event EventHandler? Changed;

    public static void Initialize(AppLanguage language)
    {
        _current = language;
    }

    public static void SetLanguage(AppLanguage language)
    {
        if (_current == language)
        {
            return;
        }

        _current = language;
        UserSettingsService.Language = language;
        Changed?.Invoke(null, EventArgs.Empty);
    }

    public static string Get(string key) => Get(_current, key);

    public static string Get(AppLanguage language, string key)
    {
        if (!Strings.TryGetValue(key, out var pair))
        {
            return key;
        }

        return language == AppLanguage.English ? pair.En : pair.Ko;
    }

    public static string Format(string key, params object?[] args)
    {
        return string.Format(Get(key), args);
    }

    public static string GetOpenFileFilter()
    {
        return string.Join('|', [
            $"{Get("FileFilter.OpenSupported")}|*.webp;*.avif;*.png;*.gif;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.heic;*.heif",
            "WebP (*.webp)|*.webp",
            "AVIF (*.avif)|*.avif",
            "PNG (*.png)|*.png",
            "GIF (*.gif)|*.gif",
            "JPEG (*.jpg;*.jpeg)|*.jpg;*.jpeg",
            $"{Get("FileFilter.OpenAll")}|*.*"
        ]);
    }

    public static string GetSaveFileFilter()
    {
        return string.Join('|', [
            $"{Get("FileFilter.SavePng")}|*.png",
            $"{Get("FileFilter.SaveWebp")}|*.webp",
            $"{Get("FileFilter.SaveGif")}|*.gif",
            $"{Get("FileFilter.SaveTiff")}|*.tif;*.tiff",
            $"{Get("FileFilter.SaveJpeg")}|*.jpg;*.jpeg",
            $"{Get("FileFilter.SaveBmp")}|*.bmp"
        ]);
    }
}

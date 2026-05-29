using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Globalization;
using System.Windows.Threading;
using System.Windows.Input;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using MeetingMinute.App.Models;
using MeetingMinute.App.Services;

namespace MeetingMinute.App;

public partial class MainWindow : Window
{
    private static readonly HashSet<string> SupportedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"
    };

    private static bool IsDesignMode =>
        DesignerProperties.GetIsInDesignMode(new DependencyObject()) ||
        LicenseManager.UsageMode == LicenseUsageMode.Designtime;

    private enum UiLanguage
    {
        Ko,
        En
    }

    private sealed class UiPreferences
    {
        public string Language { get; set; } = "ko";
        public string FontFamily { get; set; } = "맑은 고딕";
        public double BodyFontSizePt { get; set; } = 11;
        public double LineSpacing { get; set; } = 1.15;
        public double PageMarginMm { get; set; } = 25;
    }

    private static readonly Dictionary<string, string> Ko = new()
    {
        ["window.title"] = "회의록 — Meeting Minute",
        ["menu.settings"] = "언어 설정",
        ["menu.language.ko"] = "한국어",
        ["menu.language.en"] = "English",
        ["app.title"] = "회의록",
        ["button.new"] = "새 문서",
        ["button.open"] = "열기…",
        ["button.save"] = "저장",
        ["button.saveas"] = "다른 이름으로 저장…",
        ["tab.write"] = "작성",
        ["label.title"] = "회의 제목",
        ["label.date"] = "일시",
        ["label.timerange"] = "시작 / 종료 시간",
        ["label.location"] = "장소 / 온라인 링크",
        ["label.author"] = "작성자",
        ["label.attendees"] = "참석자 (한 줄에 한 명, 또는 쉼표 구분)",
        ["label.agenda"] = "안건 및 논의",
        ["button.agendaImage.add"] = "이미지 추가…",
        ["button.agendaImage.remove"] = "이미지 제거",
        ["text.agendaImage.none"] = "선택된 이미지가 없습니다.",
        ["text.agendaImage.path"] = "이미지: {0} ({1} x {2})",
        ["label.decisions"] = "결정 사항",
        ["label.actions"] = "액션 아이템 (담당 / 내용 / 기한 형식 권장)",
        ["label.next"] = "차기 회의",
        ["label.notes"] = "기타 메모",
        ["hint.markdown"] = "파일로 저장되는 Markdown 미리보기입니다. 필요하면 직접 수정할 수 있으며 저장 시 그대로 반영됩니다.",
        ["hint.path.none"] = "저장 위치가 없습니다. Markdown(.md) 또는 Word(.docx)로 저장됩니다.",
        ["dialog.open.title"] = "회의록 열기",
        ["dialog.save.title"] = "회의록 저장",
        ["dialog.open.failed"] = "파일을 열 수 없습니다.",
        ["dialog.save.failed"] = "저장하지 못했습니다.",
        ["dialog.discard"] = "현재 내용을 버리고 새로 시작하시겠습니까?",
        ["dialog.save.success"] = "파일 저장이 완료되었습니다.",
        ["status.unknown"] = "회의 시간 상태를 계산 중입니다.",
        ["status.notset"] = "회의 시간이 설정되지 않았습니다.",
        ["status.invalid"] = "시작 시간 형식이 올바르지 않습니다. (예: 14:00)",
        ["status.endsinvalid"] = "종료 시간 형식이 올바르지 않습니다. (예: 15:00)",
        ["status.before"] = "회의 시작까지 {0} 남음",
        ["status.running"] = "회의 진행 중 · 경과 {0}",
        ["status.running.remaining"] = "회의 진행 중 · 경과 {0} / 남은 {1}",
        ["status.ended"] = "회의 종료 · 총 {0} 진행 (종료 후 {1})",
        ["dialog.confirm"] = "확인",
        ["dialog.error"] = "오류",
        ["dialog.done"] = "완료",
        ["label.format"] = "서식 설정",
        ["label.format.font"] = "폰트",
        ["label.format.size"] = "크기 (pt)",
        ["label.format.spacing"] = "줄 간격",
        ["label.format.margin"] = "여백",
        ["format.margin.narrow"] = "좁게 (15 mm)",
        ["format.margin.normal"] = "보통 (25 mm)",
        ["format.margin.wide"] = "넓게 (38 mm)",
        ["dialog.filter.md"] = "Markdown (*.md)|*.md",
        ["dialog.filter.docx"] = "Word 문서 (*.docx)|*.docx",
        ["dialog.filter.pdf"] = "PDF (*.pdf)|*.pdf",
        ["dialog.filter.html"] = "HTML (*.html)|*.html",
        ["dialog.filter.all"] = "모든 파일 (*.*)|*.*",
        ["status.saving"] = "저장 중…",
    };

    private static readonly Dictionary<string, string> En = new()
    {
        ["window.title"] = "Meeting Minute",
        ["menu.settings"] = "Language Settings",
        ["menu.language.ko"] = "Korean",
        ["menu.language.en"] = "English",
        ["app.title"] = "Meeting Minutes",
        ["button.new"] = "New",
        ["button.open"] = "Open…",
        ["button.save"] = "Save",
        ["button.saveas"] = "Save As…",
        ["tab.write"] = "Write",
        ["label.title"] = "Title",
        ["label.date"] = "Date",
        ["label.timerange"] = "Start / End Time",
        ["label.location"] = "Location / Online Link",
        ["label.author"] = "Author",
        ["label.attendees"] = "Attendees (one per line or comma-separated)",
        ["label.agenda"] = "Agenda & Discussion",
        ["button.agendaImage.add"] = "Add Image…",
        ["button.agendaImage.remove"] = "Remove Image",
        ["text.agendaImage.none"] = "No image selected.",
        ["text.agendaImage.path"] = "Image: {0} ({1} x {2})",
        ["label.decisions"] = "Decisions",
        ["label.actions"] = "Action Items (Owner / Task / Due Date)",
        ["label.next"] = "Next Meeting",
        ["label.notes"] = "Notes",
        ["hint.markdown"] = "This is a Markdown preview to be saved. You can edit it directly, and it will be saved as-is.",
        ["hint.path.none"] = "No save path selected. File will be saved as Markdown (.md) or Word (.docx).",
        ["dialog.open.title"] = "Open Meeting Minutes",
        ["dialog.save.title"] = "Save Meeting Minutes",
        ["dialog.open.failed"] = "Unable to open file.",
        ["dialog.save.failed"] = "Unable to save file.",
        ["dialog.discard"] = "Discard current content and start a new document?",
        ["dialog.save.success"] = "File has been saved successfully.",
        ["status.unknown"] = "Calculating meeting time status...",
        ["status.notset"] = "Meeting time is not set.",
        ["status.invalid"] = "Invalid start time format. (e.g. 14:00)",
        ["status.endsinvalid"] = "Invalid end time format. (e.g. 15:00)",
        ["status.before"] = "Starts in {0}",
        ["status.running"] = "In progress · elapsed {0}",
        ["status.running.remaining"] = "In progress · elapsed {0} / remaining {1}",
        ["status.ended"] = "Ended · total {0} (ended {1} ago)",
        ["dialog.confirm"] = "Confirm",
        ["dialog.error"] = "Error",
        ["dialog.done"] = "Done",
        ["label.format"] = "Format Settings",
        ["label.format.font"] = "Font",
        ["label.format.size"] = "Size (pt)",
        ["label.format.spacing"] = "Line Spacing",
        ["label.format.margin"] = "Margin",
        ["format.margin.narrow"] = "Narrow (15 mm)",
        ["format.margin.normal"] = "Normal (25 mm)",
        ["format.margin.wide"] = "Wide (38 mm)",
        ["dialog.filter.md"] = "Markdown (*.md)|*.md",
        ["dialog.filter.docx"] = "Word Document (*.docx)|*.docx",
        ["dialog.filter.pdf"] = "PDF (*.pdf)|*.pdf",
        ["dialog.filter.html"] = "HTML (*.html)|*.html",
        ["dialog.filter.all"] = "All files (*.*)|*.*",
        ["status.saving"] = "Saving…",
    };

    private string? _currentPath;
    private bool _suppressMdEvents;
    private bool _markdownDirty;
    private UiLanguage _language = UiLanguage.Ko;
    private readonly DispatcherTimer _statusTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _autoSaveTimer = new() { Interval = TimeSpan.FromMinutes(3) };
    private bool _isTimeTextInternalChange;
    private bool _suppressFormatEvents;
    private DocumentFormatSettings _formatSettings = new();
    private const double AgendaImageMinWidth = 32;
    private const double AgendaImageMinHeight = 24;
    private AgendaImageMeta? _resizingMeta;
    private Image? _resizingImage;
    private Grid? _resizingGrid;
    private Point _resizeAnchorPos;
    private double _resizeAnchorW, _resizeAnchorH;
    private DateTime _lastHitTestTime = DateTime.MinValue;
    private static readonly Regex AgendaImageTagRegex = new(
        "<img\\s+[^>]*src=\"([^\"]+)\"[^>]*?(?:width=\"([0-9]+(?:\\.[0-9]+)?)\")?[^>]*?(?:height=\"([0-9]+(?:\\.[0-9]+)?)\")?[^>]*?>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public MainWindow()
    {
        InitializeComponent();

        if (IsDesignMode)
            return;

        Loaded += (_, _) =>
        {
            LoadLanguagePreference();
            InitFormatComboBoxes();
            ApplyLanguageToUi();
            MainTabs.SelectedIndex = 0;
            SetDefaultDateTimeIfEmpty();
            _statusTimer.Tick += (_, _) => UpdateElapsedStatus();
            _statusTimer.Start();
            UpdateElapsedStatus();
            _autoSaveTimer.Tick += (_, _) => AutoSave();
            _autoSaveTimer.Start();
            this.AddHandler(UIElement.PreviewMouseLeftButtonDownEvent,
                new MouseButtonEventHandler(OnWindowResizeDown), handledEventsToo: true);
            PreviewMouseMove += OnResizeMouseMove;
            PreviewMouseLeftButtonUp += OnResizeMouseUp;
        };
    }

    private void SetDefaultDateTimeIfEmpty()
    {
        if (FldDate.SelectedDate is null)
            FldDate.SelectedDate = DateTime.Today;
        if (string.IsNullOrWhiteSpace(FldStartTime.Text))
            FldStartTime.Text = DateTime.Now.ToString("HH:mm", CultureInfo.CurrentCulture);
        if (string.IsNullOrWhiteSpace(FldEndTime.Text))
            FldEndTime.Text = DateTime.Now.AddHours(1).ToString("HH:mm", CultureInfo.CurrentCulture);
    }

    private MeetingMinuteDocument PullDocumentFromUi()
    {
        return new MeetingMinuteDocument
        {
            Title = FldTitle.Text,
            DateTimeText = BuildDateTimeText(),
            Location = FldLocation.Text,
            Author = FldAuthor.Text,
            Attendees = FldAttendees.Text,
            AgendaAndDiscussion = SerializeAgendaContent(),
            Decisions = FldDecisions.Text,
            ActionItems = FldActions.Text,
            NextMeeting = FldNext.Text,
            Notes = FldNotes.Text
        };
    }

    private void PushDocumentToUi(MeetingMinuteDocument doc)
    {
        FldTitle.Text = doc.Title;
        ApplyDateTimeText(doc.DateTimeText);
        FldLocation.Text = doc.Location;
        FldAuthor.Text = doc.Author;
        FldAttendees.Text = doc.Attendees;
        LoadAgendaContent(doc.AgendaAndDiscussion);
        FldDecisions.Text = doc.Decisions;
        FldActions.Text = doc.ActionItems;
        FldNext.Text = doc.NextMeeting;
        FldNotes.Text = doc.Notes;
    }

    private string GetMarkdownForSave()
    {
        var content = (_markdownDirty && MainTabs.SelectedIndex == 1)
            ? MarkdownMeetingSerializer.StripFormatComment(FldMarkdown.Text)
            : MarkdownMeetingSerializer.ToMarkdown(PullDocumentFromUi());
        return MarkdownMeetingSerializer.BuildFormatComment(_formatSettings) + "\n" + content;
    }

    private void RefreshMarkdownFromForm()
    {
        _suppressMdEvents = true;
        try
        {
            FldMarkdown.Text = MarkdownMeetingSerializer.ToMarkdown(PullDocumentFromUi());
            _markdownDirty = false;
        }
        finally
        {
            _suppressMdEvents = false;
        }
    }

    private void BtnNew_Click(object sender, RoutedEventArgs e)
    {
        if (!ConfirmDiscard())
            return;

        _currentPath = null;
        PushDocumentToUi(new MeetingMinuteDocument());
        SetDefaultDateTimeIfEmpty();
        RefreshMarkdownFromForm();
    }

    private void BtnOpen_Click(object sender, RoutedEventArgs e)
    {
        if (!ConfirmDiscard())
            return;

        var dlg = new OpenFileDialog
        {
            Filter = _language == UiLanguage.En ? "Markdown (*.md)|*.md|All files (*.*)|*.*" : "Markdown (*.md)|*.md|모든 파일 (*.*)|*.*",
            Title = T("dialog.open.title")
        };

        if (dlg.ShowDialog(this) != true)
            return;

        try
        {
            var text = File.ReadAllText(dlg.FileName, Encoding.UTF8);
            // 서식 메타데이터 추출 후 내용에서 제거
            var savedFormat = MarkdownMeetingSerializer.ExtractFormat(text);
            var cleanText = MarkdownMeetingSerializer.StripFormatComment(text);
            var doc = MarkdownMeetingSerializer.FromMarkdown(cleanText);
            _currentPath = dlg.FileName;
            PushDocumentToUi(doc);
            if (savedFormat is not null)
            {
                _formatSettings = savedFormat;
                ApplyFormatSettingsToComboBoxes();
            }
            _suppressMdEvents = true;
            try
            {
                FldMarkdown.Text = cleanText;
                _markdownDirty = false;
            }
            finally
            {
                _suppressMdEvents = false;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"{T("dialog.open.failed")}\n{ex.Message}", T("dialog.error"), MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void BtnSave_Click(object _, RoutedEventArgs __)
    {
        if (string.IsNullOrEmpty(_currentPath))
        {
            await SaveAsInternal();
            return;
        }

        await SaveToPath(_currentPath);
    }

    private async void BtnSaveAs_Click(object _, RoutedEventArgs __)
    {
        await SaveAsInternal();
    }

    private async Task SaveAsInternal()
    {
        var filter = string.Join("|",
            T("dialog.filter.md"),
            T("dialog.filter.docx"),
            T("dialog.filter.pdf"),
            T("dialog.filter.html"),
            T("dialog.filter.all"));

        var dlg = new SaveFileDialog
        {
            Filter = filter,
            DefaultExt = ".md",
            Title = T("dialog.save.title"),
            FileName = BuildDefaultFileName()
        };

        if (dlg.ShowDialog(this) != true)
            return;

        if (await SaveToPath(dlg.FileName))
            _currentPath = dlg.FileName;
    }

    private string BuildDefaultFileName()
    {
        var date = FldDate.SelectedDate ?? DateTime.Now;
        var timeText = FldStartTime.Text.Trim();

        if (!TimeSpan.TryParse(timeText, CultureInfo.CurrentCulture, out var parsedTime)
            && !TimeSpan.TryParse(timeText, CultureInfo.InvariantCulture, out parsedTime))
        {
            parsedTime = DateTime.Now.TimeOfDay;
        }

        var stamp = $"{date:yyyy-MM-dd}-{parsedTime:hh\\-mm}";
        return $"회의록-{stamp}";
    }

    private static string SanitizeFileName(string title)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = title.Trim().Select(c => invalid.Contains(c) ? '_' : c).ToArray();
        var name = new string(chars);
        return string.IsNullOrWhiteSpace(name) ? "회의록" : name;
    }

    private async Task<bool> SaveToPath(string path, bool silent = false)
    {
        try
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".docx" || ext == ".pdf")
            {
                TxtSavingLabel.Visibility = Visibility.Visible;
                PrgSaving.Visibility = Visibility.Visible;
                try
                {
                    var doc = PullDocumentFromUi();
                    var fmt = _formatSettings.Clone();
                    if (ext == ".docx")
                        await Task.Run(() => WordMeetingSerializer.SaveAsDocx(path, doc, fmt));
                    else
                        await Task.Run(() => PdfMeetingSerializer.SaveAsPdf(path, doc, fmt));
                }
                finally
                {
                    TxtSavingLabel.Visibility = Visibility.Collapsed;
                    PrgSaving.Visibility = Visibility.Collapsed;
                }
            }
            else if (ext == ".html" || ext == ".htm")
            {
                var doc = PullDocumentFromUi();
                var fmt = _formatSettings.Clone();
                await Task.Run(() => HtmlMeetingSerializer.SaveAsHtml(path, doc, fmt));
            }
            else
            {
                var md = GetMarkdownForSave();
                File.WriteAllText(path, md, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            }

            _markdownDirty = false;
            if (!silent)
                MessageBox.Show(this, $"{T("dialog.save.success")}\n{path}", T("dialog.done"), MessageBoxButton.OK, MessageBoxImage.Information);
            return true;
        }
        catch (Exception ex)
        {
            if (!silent)
                MessageBox.Show(this, $"{T("dialog.save.failed")}\n{ex.Message}", T("dialog.error"), MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    private async void CmdSave_Executed(object _, System.Windows.Input.ExecutedRoutedEventArgs __)
    {
        if (string.IsNullOrEmpty(_currentPath))
            await SaveAsInternal();
        else
            await SaveToPath(_currentPath);
    }

    private void AutoSave()
    {
        try
        {
            // Auto-save only writes Markdown — Word/PDF are too slow for a background timer
            var path = !string.IsNullOrEmpty(_currentPath) &&
                       string.Equals(Path.GetExtension(_currentPath), ".md", StringComparison.OrdinalIgnoreCase)
                ? _currentPath
                : AutoSavePath();
            var md = GetMarkdownForSave();
            File.WriteAllText(path, md, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        }
        catch
        {
            // 자동 저장 오류는 무시
        }
    }

    private static string AutoSavePath()
    {
        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MeetingMinute");
        Directory.CreateDirectory(root);
        return Path.Combine(root, "autosave.md");
    }

    private bool ConfirmDiscard()
    {
        var doc = PullDocumentFromUi();
        if (!_markdownDirty && IsDocumentVisuallyEmpty(doc))
            return true;

        var r = MessageBox.Show(this, T("dialog.discard"), T("dialog.confirm"),
            MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
        return r == MessageBoxResult.Yes;
    }

    private static bool IsDocumentVisuallyEmpty(MeetingMinuteDocument doc)
    {
        return string.IsNullOrWhiteSpace(doc.Title)
               && string.IsNullOrWhiteSpace(doc.DateTimeText)
               && string.IsNullOrWhiteSpace(doc.Location)
               && string.IsNullOrWhiteSpace(doc.Author)
               && string.IsNullOrWhiteSpace(doc.Attendees)
               && string.IsNullOrWhiteSpace(doc.AgendaAndDiscussion)
               && string.IsNullOrWhiteSpace(doc.Decisions)
               && string.IsNullOrWhiteSpace(doc.ActionItems)
               && string.IsNullOrWhiteSpace(doc.NextMeeting)
               && string.IsNullOrWhiteSpace(doc.Notes);
    }

    private string BuildDateTimeText()
    {
        var dateText = FldDate.SelectedDate?.ToString("yyyy-MM-dd", CultureInfo.CurrentCulture) ?? "";
        var startTimeText = FldStartTime.Text.Trim();
        var endTimeText = FldEndTime.Text.Trim();
        var timeRangeText = BuildTimeRangeText(startTimeText, endTimeText);

        if (string.IsNullOrWhiteSpace(dateText))
            return timeRangeText;
        if (string.IsNullOrWhiteSpace(timeRangeText))
            return dateText;
        return $"{dateText} {timeRangeText}";
    }

    private void ApplyDateTimeText(string? text)
    {
        var raw = text?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(raw))
        {
            FldDate.SelectedDate = null;
            FldStartTime.Text = "";
            FldEndTime.Text = "";
            return;
        }

        var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length > 0 && DateTime.TryParse(parts[0], CultureInfo.CurrentCulture, DateTimeStyles.None, out var parsedDate))
        {
            FldDate.SelectedDate = parsedDate.Date;
            ApplyTimeRangeText(parts.Length > 1 ? parts[1].Trim() : "");
            return;
        }

        if (DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.None, out var parsedDateTime))
        {
            FldDate.SelectedDate = parsedDateTime.Date;
            FldStartTime.Text = parsedDateTime.ToString("HH:mm", CultureInfo.CurrentCulture);
            FldEndTime.Text = parsedDateTime.AddHours(1).ToString("HH:mm", CultureInfo.CurrentCulture);
            return;
        }

        FldDate.SelectedDate = null;
        ApplyTimeRangeText(raw);
        UpdateElapsedStatus();
    }

    private void ApplyTimeRangeText(string timeRangeText)
    {
        var raw = timeRangeText.Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            FldStartTime.Text = "";
            FldEndTime.Text = "";
            return;
        }

        var normalized = raw.Replace("–", "-", StringComparison.Ordinal).Replace("—", "-", StringComparison.Ordinal);
        var tokens = normalized.Split('-', 2, StringSplitOptions.TrimEntries);
        if (tokens.Length == 2)
        {
            FldStartTime.Text = tokens[0];
            FldEndTime.Text = tokens[1];
            return;
        }

        FldStartTime.Text = raw;
        if (TimeSpan.TryParse(raw, CultureInfo.CurrentCulture, out var start)
            || TimeSpan.TryParse(raw, CultureInfo.InvariantCulture, out start))
        {
            FldEndTime.Text = start.Add(TimeSpan.FromHours(1)).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
        }
        else
        {
            FldEndTime.Text = "";
        }
    }

    private static string BuildTimeRangeText(string startTimeText, string endTimeText)
    {
        var start = startTimeText.Trim();
        var end = endTimeText.Trim();

        if (string.IsNullOrWhiteSpace(start))
            return end;
        if (string.IsNullOrWhiteSpace(end))
            return start;
        return $"{start} - {end}";
    }

    private void MeetingTimeFieldChanged(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb)
        {
            FormatTimeFieldInput(tb);

            if (ReferenceEquals(tb, FldStartTime)
                && !string.IsNullOrWhiteSpace(FldStartTime.Text)
                && TryParseTime(FldStartTime.Text, out var start))
            {
                FldEndTime.Text = start.Add(TimeSpan.FromHours(1)).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            }
        }

        UpdateElapsedStatus();
    }

    private void TimeField_PreviewTextInput(object sender, TextCompositionEventArgs e)
    {
        e.Handled = !e.Text.All(char.IsDigit);
    }

    private void TimeField_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (sender is not TextBox tb)
            return;

        if (e.Key == Key.Space)
        {
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Back && tb.SelectionLength == 0 && tb.CaretIndex == 3 && tb.Text.Length >= 3)
        {
            // Make backspace over HH:mm feel natural by deleting the minute's first digit.
            tb.CaretIndex = 2;
        }
    }

    private void TimeField_Pasting(object sender, DataObjectPastingEventArgs e)
    {
        if (sender is not TextBox tb)
            return;

        if (!e.SourceDataObject.GetDataPresent(DataFormats.Text))
        {
            e.CancelCommand();
            return;
        }

        var pasted = e.SourceDataObject.GetData(DataFormats.Text) as string ?? "";
        var digits = new string(pasted.Where(char.IsDigit).Take(4).ToArray());
        var formatted = digits.Length switch
        {
            <= 2 => digits,
            _ => $"{digits[..2]}:{digits[2..]}"
        };

        _isTimeTextInternalChange = true;
        try
        {
            tb.Text = formatted;
            tb.CaretIndex = tb.Text.Length;
        }
        finally
        {
            _isTimeTextInternalChange = false;
        }

        e.CancelCommand();
    }

    private void TimeField_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is not TextBox tb)
            return;

        if (TryParseTime(tb.Text, out var parsed))
        {
            tb.Text = parsed.ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            tb.ClearValue(BorderBrushProperty);
        }
        else if (!string.IsNullOrWhiteSpace(tb.Text))
        {
            tb.BorderBrush = (System.Windows.Media.Brush)FindResource("BrushError");
        }
        else
        {
            tb.ClearValue(BorderBrushProperty);
        }
    }

    private void FormatTimeFieldInput(TextBox tb)
    {
        if (_isTimeTextInternalChange)
            return;

        var digits = new string(tb.Text.Where(char.IsDigit).Take(4).ToArray());
        var formatted = digits.Length switch
        {
            <= 2 => digits,
            _ => $"{digits[..2]}:{digits[2..]}"
        };

        if (tb.Text == formatted)
            return;

        _isTimeTextInternalChange = true;
        try
        {
            tb.Text = formatted;
            tb.CaretIndex = tb.Text.Length;
        }
        finally
        {
            _isTimeTextInternalChange = false;
        }
    }

    private void UpdateElapsedStatus()
    {
        if (FldDate.SelectedDate is null || string.IsNullOrWhiteSpace(FldStartTime.Text))
        {
            TxtElapsedStatus.Text = T("status.notset");
            return;
        }

        if (!TryParseTime(FldStartTime.Text, out var startTime))
        {
            TxtElapsedStatus.Text = T("status.invalid");
            return;
        }

        var start = FldDate.SelectedDate.Value.Date + startTime;
        var now = DateTime.Now;

        var hasEnd = !string.IsNullOrWhiteSpace(FldEndTime.Text);
        var endTime = TimeSpan.Zero;
        var endValid = !hasEnd || TryParseTime(FldEndTime.Text, out endTime);
        var end = hasEnd && endValid ? FldDate.SelectedDate.Value.Date + endTime : DateTime.MinValue;

        if (hasEnd && !endValid)
        {
            TxtElapsedStatus.Text = T("status.endsinvalid");
            return;
        }

        if (now < start)
        {
            TxtElapsedStatus.Text = string.Format(CultureInfo.CurrentCulture, T("status.before"), FormatDuration(start - now));
            return;
        }

        if (hasEnd && endValid && now <= end)
        {
            TxtElapsedStatus.Text = string.Format(
                CultureInfo.CurrentCulture,
                T("status.running.remaining"),
                FormatDuration(now - start),
                FormatDuration(end - now));
            return;
        }

        if (hasEnd && endValid && now > end)
        {
            TxtElapsedStatus.Text = string.Format(
                CultureInfo.CurrentCulture,
                T("status.ended"),
                FormatDuration(end - start),
                FormatDuration(now - end));
            return;
        }

        TxtElapsedStatus.Text = string.Format(CultureInfo.CurrentCulture, T("status.running"), FormatDuration(now - start));
    }

    private static bool TryParseTime(string text, out TimeSpan value)
    {
        var t = text.Trim();
        if (!(TimeSpan.TryParse(t, CultureInfo.CurrentCulture, out value)
              || TimeSpan.TryParse(t, CultureInfo.InvariantCulture, out value)))
            return false;
        return value >= TimeSpan.Zero && value < TimeSpan.FromHours(24);
    }

    private static string FormatDuration(TimeSpan span)
    {
        if (span < TimeSpan.Zero)
            span = span.Negate();
        var totalHours = (int)span.TotalHours;
        return $"{totalHours:00}:{span.Minutes:00}:{span.Seconds:00}";
    }

    private void FldMarkdown_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_suppressMdEvents)
            return;
        _markdownDirty = true;
    }

    private void MainTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (e.Source is not TabControl tc || tc != MainTabs)
            return;

        if (MainTabs.SelectedIndex == 1 && !_markdownDirty)
            RefreshMarkdownFromForm();
    }

    private void BtnAgendaImageAdd_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            Filter = _language == UiLanguage.En
                ? "Image files (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.avif)|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.avif|All files (*.*)|*.*"
                : "이미지 파일 (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.avif)|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.avif|모든 파일 (*.*)|*.*",
            Title = _language == UiLanguage.En ? "Select Agenda Image" : "안건 이미지 선택"
        };

        if (dlg.ShowDialog(this) != true)
            return;

        InsertAgendaImageAtCaret(dlg.FileName, 480, 270);
    }

    private void BtnAgendaImageRemove_Click(object sender, RoutedEventArgs e)
    {
        var container = FindSelectedImageContainer();
        if (container?.Parent is Paragraph paragraph)
            paragraph.Inlines.Remove(container);
    }

    private void InsertAgendaImageAtCaret(string path, double width, double height)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return;

        var caret = FldAgendaRich.CaretPosition;
        if (caret.Paragraph is null)
        {
            var p = new Paragraph();
            FldAgendaRich.Document.Blocks.Add(p);
            caret = p.ContentStart;
        }

        var imageElement = CreateResizableAgendaImageElement(path, width, height);
        var container = new InlineUIContainer(imageElement, caret);
        FldAgendaRich.CaretPosition = container.ElementEnd;
        FldAgendaRich.Focus();
    }

    private void FldAgendaRich_PreviewDragOver(object sender, DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            e.Effects = DragDropEffects.None;
            e.Handled = true;
            return;
        }

        var paths = e.Data.GetData(DataFormats.FileDrop) as string[] ?? Array.Empty<string>();
        e.Effects = paths.Any(IsImageFile) ? DragDropEffects.Copy : DragDropEffects.None;
        e.Handled = true;
    }

    private void FldAgendaRich_Drop(object sender, DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop))
            return;

        var paths = e.Data.GetData(DataFormats.FileDrop) as string[] ?? Array.Empty<string>();
        var imagePaths = paths.Where(IsImageFile).ToArray();
        if (imagePaths.Length == 0)
            return;

        var dropPosition = FldAgendaRich.GetPositionFromPoint(e.GetPosition(FldAgendaRich), true);
        if (dropPosition is not null)
            FldAgendaRich.CaretPosition = dropPosition;

        foreach (var imagePath in imagePaths)
            InsertAgendaImageAtCaret(imagePath, 480, 270);

        e.Handled = true;
    }

    private Grid CreateResizableAgendaImageElement(string path, double width, double height)
    {
        var bitmap = new BitmapImage();
        bitmap.BeginInit();
        bitmap.CacheOption = BitmapCacheOption.OnLoad;
        bitmap.UriSource = new Uri(path, UriKind.Absolute);
        // 고해상도 원본을 그대로 디코딩하면 대형 BGRA 버퍼가 힙에 상주해 GC 일시 정지를 유발한다.
        // 2048px로 제한해도 화면 표시 및 리사이즈에는 충분한 품질이 유지된다.
        bitmap.DecodePixelWidth = 2048;
        bitmap.EndInit();
        bitmap.Freeze();

        var imageMeta = new AgendaImageMeta
        {
            Path = path,
            Width = Math.Max(AgendaImageMinWidth, width),
            Height = Math.Max(AgendaImageMinHeight, height)
        };

        var image = new Image
        {
            Source = bitmap,
            Width = imageMeta.Width,
            Height = imageMeta.Height,
            Stretch = Stretch.Fill,
            IsHitTestVisible = false
        };

        var resizeHandle = new Border
        {
            Width = 14,
            Height = 14,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Background = Brushes.DodgerBlue,
            BorderBrush = Brushes.White,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(2),
            Cursor = Cursors.SizeNWSE
        };

        var grid = new Grid
        {
            Width = imageMeta.Width,
            Height = imageMeta.Height,
            Margin = new Thickness(4),
            Tag = imageMeta,
            Background = Brushes.Transparent
        };
        grid.Children.Add(image);
        grid.Children.Add(resizeHandle);

        // 리사이즈 핸들 식별을 위해 Tag에 메타 저장 (Window 레벨 핸들러에서 참조)
        resizeHandle.Tag = imageMeta;

        grid.MouseRightButtonUp += (_, e) =>
        {
            RemoveImageInlineForElement(grid);
            e.Handled = true;
        };

        return grid;
    }

    private InlineUIContainer? FindSelectedImageContainer()
    {
        return FindAncestorInlineUiContainer(FldAgendaRich.Selection.Start)
            ?? FindAncestorInlineUiContainer(FldAgendaRich.Selection.End);
    }

    private static InlineUIContainer? FindAncestorInlineUiContainer(TextPointer pointer)
    {
        DependencyObject? current = pointer.Parent as DependencyObject;
        while (current is not null)
        {
            if (current is InlineUIContainer container)
                return container;
            current = LogicalTreeHelper.GetParent(current);
        }

        return null;
    }

    private void RemoveImageInlineForElement(DependencyObject element)
    {
        var container = FindAncestorInlineUiContainerFromElement(element);
        if (container?.Parent is Paragraph paragraph)
            paragraph.Inlines.Remove(container);
    }

    private static InlineUIContainer? FindAncestorInlineUiContainerFromElement(DependencyObject? element)
    {
        var current = element;
        while (current is not null)
        {
            if (current is InlineUIContainer container)
                return container;
            current = LogicalTreeHelper.GetParent(current);
        }

        return null;
    }

    private string SerializeAgendaContent()
    {
        var sb = new StringBuilder();
        foreach (var block in FldAgendaRich.Document.Blocks)
        {
            if (block is not Paragraph paragraph)
                continue;

            foreach (var inline in paragraph.Inlines)
            {
                switch (inline)
                {
                    case Run run:
                        sb.Append(run.Text);
                        break;
                    case LineBreak:
                        sb.Append('\n');
                        break;
                    case InlineUIContainer container:
                        if (container.Child is Grid imageGrid && imageGrid.Tag is AgendaImageMeta meta)
                        {
                            var src = meta.Path.Replace("\\", "/", StringComparison.Ordinal);
                            var imgEl = imageGrid.Children.OfType<Image>().FirstOrDefault();
                            // 우선순위: Image.Width → imageGrid.Width → meta.Width
                            var w = (imgEl != null && !double.IsNaN(imgEl.Width) && imgEl.Width >= AgendaImageMinWidth)
                                ? imgEl.Width
                                : (!double.IsNaN(imageGrid.Width) ? imageGrid.Width : meta.Width);
                            var h = (imgEl != null && !double.IsNaN(imgEl.Height) && imgEl.Height >= AgendaImageMinHeight)
                                ? imgEl.Height
                                : (!double.IsNaN(imageGrid.Height) ? imageGrid.Height : meta.Height);
                            sb.Append(CultureInfo.InvariantCulture, $"<img src=\"{src}\" width=\"{Math.Round(w)}\" height=\"{Math.Round(h)}\" alt=\"agenda-image\" />");
                        }
                        break;
                }
            }

            sb.AppendLine();
        }

        return sb.ToString().TrimEnd();
    }

    private void LoadAgendaContent(string? content)
    {
        var doc = new FlowDocument();
        var raw = content ?? "";
        var lines = raw.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        foreach (var line in lines)
        {
            var paragraph = new Paragraph();
            var pos = 0;
            foreach (Match match in AgendaImageTagRegex.Matches(line))
            {
                if (match.Index > pos)
                    paragraph.Inlines.Add(new Run(line[pos..match.Index]));

                var path = match.Groups[1].Value.Replace("/", "\\", StringComparison.Ordinal);
                var width = TryParseImageSize(ExtractImgAttribute(match.Value, "width"), 480);
                var height = TryParseImageSize(ExtractImgAttribute(match.Value, "height"), 270);
                if (File.Exists(path))
                    paragraph.Inlines.Add(new InlineUIContainer(CreateResizableAgendaImageElement(path, width, height)));
                else
                    paragraph.Inlines.Add(new Run(match.Value));
                pos = match.Index + match.Length;
            }

            if (pos < line.Length)
                paragraph.Inlines.Add(new Run(line[pos..]));
            if (paragraph.Inlines.FirstInline is null)
                paragraph.Inlines.Add(new Run(string.Empty));

            doc.Blocks.Add(paragraph);
        }

        if (!doc.Blocks.Any())
            doc.Blocks.Add(new Paragraph(new Run(string.Empty)));
        FldAgendaRich.Document = doc;
    }

    private static string ExtractImgAttribute(string tag, string name)
    {
        var m = Regex.Match(tag, $@"{name}=""([0-9]+(?:\.[0-9]+)?)""", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value : "";
    }

    private static double TryParseImageSize(string raw, double fallback)
    {
        if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var size))
            return size;
        return fallback;
    }

    private static bool IsImageFile(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return false;
        var ext = Path.GetExtension(path);
        return SupportedImageExtensions.Contains(ext);
    }

    private sealed class AgendaImageMeta
    {
        public string Path { get; init; } = "";
        public double Width { get; set; }
        public double Height { get; set; }
    }

    private string T(string key)
    {
        var src = _language == UiLanguage.Ko ? Ko : En;
        return src.TryGetValue(key, out var value) ? value : key;
    }

    private void ApplyLanguageToUi()
    {
        Title = T("window.title");
        MenuSettings.Header = T("menu.settings");
        MenuLanguageKo.Header = T("menu.language.ko");
        MenuLanguageEn.Header = T("menu.language.en");
        MenuLanguageKo.IsChecked = _language == UiLanguage.Ko;
        MenuLanguageEn.IsChecked = _language == UiLanguage.En;

        TxtAppTitle.Text = T("app.title");
        BtnNew.Content = T("button.new");
        BtnOpen.Content = T("button.open");
        BtnSave.Content = T("button.save");
        BtnSaveAs.Content = T("button.saveas");
        TabWrite.Header = T("tab.write");

        LblTitle.Text = T("label.title");
        LblDate.Text = T("label.date");
        LblTimeRange.Text = T("label.timerange");
        LblLocation.Text = T("label.location");
        LblAuthor.Text = T("label.author");
        LblAttendees.Text = T("label.attendees");
        LblAgenda.Text = T("label.agenda");
        BtnAgendaImageAdd.Content = T("button.agendaImage.add");
        BtnAgendaImageRemove.Content = T("button.agendaImage.remove");
        LblDecisions.Text = T("label.decisions");
        LblActions.Text = T("label.actions");
        LblNextMeeting.Text = T("label.next");
        LblNotes.Text = T("label.notes");
        TxtMarkdownHint.Text = T("hint.markdown");
        FldDate.ToolTip = _language == UiLanguage.En ? "Select date from calendar." : "회의 날짜를 달력에서 선택하세요.";
        FldStartTime.ToolTip = _language == UiLanguage.En ? "Start time (e.g. 14:00)" : "시작 시간 (예: 14:00)";
        FldEndTime.ToolTip = _language == UiLanguage.En ? "End time (e.g. 15:00)" : "종료 시간 (예: 15:00)";

        UpdateFormatLabels();
        UpdateElapsedStatus();
    }

    private void UpdateFormatLabels()
    {
        LblFormatSection.Text = T("label.format");
        LblFormatFont.Text = T("label.format.font");
        LblFormatSize.Text = T("label.format.size");
        LblFormatSpacing.Text = T("label.format.spacing");
        LblFormatMargin.Text = T("label.format.margin");
        TxtSavingLabel.Text = T("status.saving");

        if (CmbPageMargin.Items.Count >= 3)
        {
            ((ComboBoxItem)CmbPageMargin.Items[0]).Content = T("format.margin.narrow");
            ((ComboBoxItem)CmbPageMargin.Items[1]).Content = T("format.margin.normal");
            ((ComboBoxItem)CmbPageMargin.Items[2]).Content = T("format.margin.wide");
        }
    }

    private void MenuLanguageKo_Click(object sender, RoutedEventArgs e)
    {
        _language = UiLanguage.Ko;
        ApplyLanguageToUi();
        SaveLanguagePreference();
    }

    private void MenuLanguageEn_Click(object sender, RoutedEventArgs e)
    {
        _language = UiLanguage.En;
        ApplyLanguageToUi();
        SaveLanguagePreference();
    }

    private static string PreferencesPath()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MeetingMinute");
        Directory.CreateDirectory(root);
        return Path.Combine(root, "preferences.json");
    }

    private void LoadLanguagePreference()
    {
        try
        {
            var path = PreferencesPath();
            if (!File.Exists(path))
                return;
            var json = File.ReadAllText(path, Encoding.UTF8);
            var pref = JsonSerializer.Deserialize<UiPreferences>(json);
            if (pref is null) return;
            _language = string.Equals(pref.Language, "en", StringComparison.OrdinalIgnoreCase)
                ? UiLanguage.En : UiLanguage.Ko;
            _formatSettings.FontFamily = pref.FontFamily;
            _formatSettings.BodyFontSizePt = pref.BodyFontSizePt;
            _formatSettings.LineSpacing = pref.LineSpacing;
            _formatSettings.PageMarginMm = pref.PageMarginMm;
        }
        catch
        {
            _language = UiLanguage.Ko;
        }
    }

    private void SaveLanguagePreference()
    {
        var pref = new UiPreferences
        {
            Language = _language == UiLanguage.En ? "en" : "ko",
            FontFamily = _formatSettings.FontFamily,
            BodyFontSizePt = _formatSettings.BodyFontSizePt,
            LineSpacing = _formatSettings.LineSpacing,
            PageMarginMm = _formatSettings.PageMarginMm
        };
        var json = JsonSerializer.Serialize(pref, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(PreferencesPath(), json, Encoding.UTF8);
    }

    private void InitFormatComboBoxes()
    {
        _suppressFormatEvents = true;
        try
        {
            var fonts = new[] { "맑은 고딕", "돋움", "굴림", "Calibri", "Arial", "Times New Roman" };
            foreach (var f in fonts)
                CmbFontFamily.Items.Add(new ComboBoxItem { Content = f, Tag = f });

            var sizes = new[] { 9.0, 10.0, 11.0, 12.0, 13.0, 14.0 };
            foreach (var s in sizes)
                CmbFontSize.Items.Add(new ComboBoxItem { Content = $"{s}pt", Tag = s });

            var spacings = new (double Val, string Label)[]
                { (1.0, "×1.0"), (1.15, "×1.15"), (1.5, "×1.5"), (2.0, "×2.0") };
            foreach (var (val, label) in spacings)
                CmbLineSpacing.Items.Add(new ComboBoxItem { Content = label, Tag = val });

            // 여백 — 레이블은 ApplyLanguageToUi에서 설정
            CmbPageMargin.Items.Add(new ComboBoxItem { Tag = 15.0, Content = "" });
            CmbPageMargin.Items.Add(new ComboBoxItem { Tag = 25.0, Content = "" });
            CmbPageMargin.Items.Add(new ComboBoxItem { Tag = 38.0, Content = "" });

            ApplyFormatSettingsToComboBoxes();
        }
        finally
        {
            _suppressFormatEvents = false;
        }
    }

    private void ApplyFormatSettingsToComboBoxes()
    {
        _suppressFormatEvents = true;
        try
        {
            SelectComboByTag(CmbFontFamily, _formatSettings.FontFamily);
            SelectComboByTag(CmbFontSize, _formatSettings.BodyFontSizePt);
            SelectComboByTag(CmbLineSpacing, _formatSettings.LineSpacing);
            SelectComboByTag(CmbPageMargin, _formatSettings.PageMarginMm);
        }
        finally
        {
            _suppressFormatEvents = false;
        }
    }

    private static void SelectComboByTag(ComboBox combo, string value)
    {
        foreach (ComboBoxItem item in combo.Items)
        {
            if (item.Tag is string s && string.Equals(s, value, StringComparison.Ordinal))
            {
                combo.SelectedItem = item;
                return;
            }
        }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private static void SelectComboByTag(ComboBox combo, double value)
    {
        foreach (ComboBoxItem item in combo.Items)
        {
            if (item.Tag is double d && Math.Abs(d - value) < 0.001)
            {
                combo.SelectedItem = item;
                return;
            }
        }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private void FormatSettingChanged(object _, SelectionChangedEventArgs __)
    {
        if (_suppressFormatEvents) return;
        if (CmbFontFamily.SelectedItem is ComboBoxItem fi && fi.Tag is string font)
            _formatSettings.FontFamily = font;
        if (CmbFontSize.SelectedItem is ComboBoxItem si && si.Tag is double size)
            _formatSettings.BodyFontSizePt = size;
        if (CmbLineSpacing.SelectedItem is ComboBoxItem li && li.Tag is double spacing)
            _formatSettings.LineSpacing = spacing;
        if (CmbPageMargin.SelectedItem is ComboBoxItem mi && mi.Tag is double margin)
            _formatSettings.PageMarginMm = margin;
        SaveLanguagePreference();
    }

    private void OnWindowResizeDown(object sender, MouseButtonEventArgs e)
    {
        // e.OriginalSource는 TextEditor가 Paragraph/FlowDocument로 교체하므로 신뢰할 수 없다.
        // VisualTreeHelper.HitTest로 직접 비주얼 트리를 탐색한다.
        var (handle, meta) = HitTestResizeHandle(e.GetPosition(FldAgendaRich));
        if (handle is null || meta is null) return;

        var grid = VisualTreeHelper.GetParent(handle) as Grid;
        var image = grid?.Children.OfType<Image>().FirstOrDefault();
        if (grid is null || image is null) return;

        _resizingMeta = meta;
        _resizingImage = image;
        _resizingGrid = grid;
        _resizeAnchorPos = e.GetPosition(this);
        _resizeAnchorW = meta.Width;
        _resizeAnchorH = meta.Height;
        e.Handled = true;
    }

    private void OnResizeMouseMove(object sender, MouseEventArgs e)
    {
        if (_resizingMeta is not null)
        {
            if (e.LeftButton != MouseButtonState.Pressed)
            {
                _resizingMeta = null;
                Cursor = null;
                return;
            }
            var pos = e.GetPosition(this);
            _resizingMeta.Width = Math.Max(AgendaImageMinWidth, _resizeAnchorW + pos.X - _resizeAnchorPos.X);
            _resizingMeta.Height = Math.Max(AgendaImageMinHeight, _resizeAnchorH + pos.Y - _resizeAnchorPos.Y);
            _resizingImage!.Width = _resizingMeta.Width;
            _resizingImage!.Height = _resizingMeta.Height;
            _resizingGrid!.Width = _resizingMeta.Width;
            _resizingGrid!.Height = _resizingMeta.Height;
            e.Handled = true;
        }
        else if (FldAgendaRich.IsMouseOver)
        {
            // HitTest는 레이아웃 패스를 유발할 수 있으므로 50ms 이상 지났을 때만 수행한다.
            var now = DateTime.UtcNow;
            if ((now - _lastHitTestTime).TotalMilliseconds >= 50)
            {
                _lastHitTestTime = now;
                var (handle, _) = HitTestResizeHandle(e.GetPosition(FldAgendaRich));
                Cursor = handle is not null ? Cursors.SizeNWSE : null;
            }
        }
        else if (Cursor is not null)
        {
            Cursor = null;
        }
    }

    private void OnResizeMouseUp(object _, MouseButtonEventArgs __)
    {
        _resizingMeta = null;
        Cursor = null;
    }

    private (Border? handle, AgendaImageMeta? meta) HitTestResizeHandle(Point posInRtb)
    {
        var hitResult = VisualTreeHelper.HitTest(FldAgendaRich, posInRtb);
        var current = hitResult?.VisualHit as DependencyObject;
        while (current is not null)
        {
            if (current is Border b && b.Tag is AgendaImageMeta meta)
                return (b, meta);
            current = current is Visual ? VisualTreeHelper.GetParent(current) : null;
        }
        return (null, null);
    }
}


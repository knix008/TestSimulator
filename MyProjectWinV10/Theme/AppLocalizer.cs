using System.Globalization;

namespace MyProject.Theme
{
    public static class AppLocalizer
    {
        public static AppLanguage CurrentLanguage { get; private set; } = AppLanguage.Korean;

        public static CultureInfo CurrentCulture =>
            CurrentLanguage == AppLanguage.Korean
                ? CultureInfo.GetCultureInfo("ko-KR")
                : CultureInfo.GetCultureInfo("en-US");

        public static event EventHandler? LanguageChanged;

        private static readonly Dictionary<(AppLanguage Lang, string Key), string> Strings = new();

        static AppLocalizer()
        {
            Add(AppLanguage.Korean, AppLanguage.English,
                ("Menu.File", "파일(&F)", "File(&F)"),
                ("Menu.Database", "데이터베이스(&D)", "Database(&D)"),
                ("Menu.Edit", "편집(&E)", "Edit(&E)"),
                ("Menu.Task", "작업(&T)", "Task(&T)"),
                ("Menu.View", "보기(&V)", "View(&V)"),
                ("Menu.Report", "보고서(&R)", "Report(&R)"),
                ("Menu.New", "새 프로젝트(&N)", "New Project(&N)"),
                ("Menu.Open", "열기(&O)...", "Open(&O)..."),
                ("Menu.Save", "저장(&S)", "Save(&S)"),
                ("Menu.SaveAs", "다른 이름으로 저장(&A)...", "Save &As..."),
                ("Menu.ProjectSettings", "프로젝트 설정(&S)...", "Project &Settings..."),
                ("Menu.Notes", "메모", "Notes"),
                ("Calendar.Weekly", "주간", "Weekly"),
                ("Calendar.Monthly", "월간", "Monthly"),
                ("Calendar.Yearly", "연간", "Yearly"),
                ("Menu.Preferences", "환경 설정(&P)...", "Preferences(&P)..."),
                ("Menu.ExportMsProject", "Microsoft Project로 내보내기...", "Export to Microsoft Project..."),
                ("Menu.Exit", "종료(&X)", "E&xit"),
                ("Menu.Undo", "실행 취소(&U)", "Undo(&U)"),
                ("Menu.Redo", "다시 실행(&R)", "Redo(&R)"),
                ("Menu.AddTask", "작업 추가(&A)", "Add Task(&A)"),
                ("Menu.AddSubtask", "하위 작업 추가(&S)", "Add Subtask(&S)"),
                ("Menu.DeleteTask", "작업 삭제(&D)", "Delete Task(&D)"),
                ("Menu.Indent", "작업 들여쓰기(&T)", "Indent Task(&T)"),
                ("Menu.Outdent", "작업 내어쓰기(&K)", "Outdent Task(&K)"),
                ("Menu.Link", "작업 연결(&L)", "Link Tasks(&L)"),
                ("Menu.Unlink", "연결 제거(&R)", "Remove Link(&R)"),
                ("Menu.DepType", "의존성 유형(&T)", "Dependency &Type"),
                ("Menu.DepFS", "종료-시작 (FS)", "Finish-to-Start (FS)"),
                ("Menu.DepFF", "종료-종료 (FF)", "Finish-to-Finish (FF)"),
                ("Menu.DepSS", "시작-시작 (SS)", "Start-to-Start (SS)"),
                ("Menu.DepSF", "시작-종료 (SF)", "Start-to-Finish (SF)"),
                ("Menu.TaskProps", "작업 속성(&P)...", "Task &Properties..."),
                ("Menu.ExpandCollapse", "하위 작업 펼치기/접기", "Expand Subtasks"),
                ("Menu.ZoomIn", "확대(&I)", "Zoom &In"),
                ("Menu.ZoomOut", "축소(&O)", "Zoom &Out"),
                ("Menu.Today", "오늘로 이동(&T)", "Go to &Today"),
                ("Menu.PropertiesPanel", "속성 패널(&P)", "Properties &Panel"),
                ("Menu.CalendarView", "캘린더 보기(&V)", "Calendar &View"),
                ("Menu.ShowCriticalPath", "주요 경로 표시(&P)", "Show Critical &Path"),
                ("Menu.CalendarWeekly", "캘린더 주간(&W)", "Calendar &Weekly"),
                ("Menu.CalendarMonthly", "캘린더 월간(&M)", "Calendar &Monthly"),
                ("Menu.CalendarYearly", "캘린더 연간(&Y)", "Calendar &Yearly"),
                ("Menu.ExportExcel", "Excel (.xlsx)로 내보내기...", "Export as E&xcel (.xlsx)..."),
                ("Menu.ExportHtml", "HTML (.html)로 내보내기...", "Export as &HTML (.html)..."),
                ("Menu.ExportWord", "Word (.docx)로 내보내기...", "Export as &Word (.docx)..."),
                ("Menu.ExportMd", "Markdown (.md)로 내보내기...", "Export as &Markdown (.md)..."),
                ("Menu.ExportPdf", "PDF로 내보내기...", "Export as &PDF..."),
                ("Menu.ExportGanttImage", "Gantt 이미지로 내보내기...", "Export Gantt as &Image..."),
                ("GanttExport.OptionsTitle", "Gantt 이미지보내기", "Export Gantt Image"),
                ("GanttExport.TransparentBackground", "투명 배경 사용", "Use transparent background"),
                ("GanttExport.TransparentHint", "그래프 영역과 날짜·요일 헤더는 투명하게 저장됩니다. 오늘·주말 등 텍스트 배경은 유지됩니다.",
                    "The chart area and date/weekday header are saved transparently. Text backgrounds such as today and weekends are kept."),
                ("Menu.Print", "인쇄(&P)...", "Print(&P)..."),
                ("Menu.DbConnection", "연결 설정(&C)...", "Connection Settings(&C)..."),
                ("Menu.DbFetch", "공유 일정 가져오기(&F)...", "Fetch Shared Schedule(&F)..."),
                ("Menu.DbRefresh", "데이터베이스에서 새로 고침", "Refresh from Database"),
                ("Menu.DbAutoRefresh", "데이터베이스 자동 새로 고침", "Auto-refresh from Database"),
                ("Menu.DbSave", "공유 일정 저장(&S)...", "Save to Shared Schedule(&S)..."),
                ("Menu.DbOpen", "공유 일정 열기...", "Open Shared Schedule..."),
                ("Status.Ready", "준비", "Ready"),
                ("Status.Today", "오늘: {0}", "Today: {0}"),
                ("Main.TitleSuffix", "프로젝트 관리", "Project Manager"),
                ("Main.SharedTag", " [공유]", " [Shared]"),
                ("Common.OK", "확인", "OK"),
                ("Common.Cancel", "취소", "Cancel"),
                ("Prefs.Title", "환경 설정", "Preferences"),
                ("Prefs.Language", "언어:", "Language:"),
                ("Prefs.LanguageHint", "언어 변경은 즉시 적용됩니다.", "Language changes apply immediately."),
                ("About.Title", "정보", "About"),
                ("About.Version", "버전 {0}", "Version {0}"),
                ("About.Description", "작업, 의존성, 리소스, 진행률, 차트 메모를 관리하는 Windows Gantt 프로젝트 관리 프로그램입니다.",
                    "Windows Gantt chart project manager for tasks, dependencies, resources, progress, and chart notes."),
                ("Grid.Id", "ID", "ID"),
                ("Grid.TaskName", "작업 이름", "Task Name"),
                ("Grid.Start", "시작", "Start"),
                ("Grid.Days", "일수", "Days"),
                ("Grid.Progress", "진행률", "Progress"),
                ("Grid.Resource", "리소스", "Resource"),
                ("Grid.Alloc", "할당 %", "Alloc %"),
                ("Grid.Deliverable", "산출물", "Deliverable"),
                ("Dep.FS.Name", "종료-시작 (FS)", "Finish-to-Start (FS)"),
                ("Dep.FF.Name", "종료-종료 (FF)", "Finish-to-Finish (FF)"),
                ("Dep.SS.Name", "시작-시작 (SS)", "Start-to-Start (SS)"),
                ("Dep.SF.Name", "시작-종료 (SF)", "Start-to-Finish (SF)"),
                ("Dep.FS.Desc", "선행 작업이 끝난 후 후행 작업이 시작됩니다.", "Successor starts after predecessor finishes."),
                ("Dep.FF.Desc", "선행 작업과 후행 작업이 동시에 끝납니다.", "Successor finishes when predecessor finishes."),
                ("Dep.SS.Desc", "선행 작업과 후행 작업이 동시에 시작됩니다.", "Successor starts when predecessor starts."),
                ("Dep.SF.Desc", "선행 작업이 시작되면 후행 작업이 끝납니다.", "Successor finishes when predecessor starts."),
                ("Props.Title", "속성", "Properties"),
                ("Props.ProjectTitle", "프로젝트 속성", "Project Properties"),
                ("Props.Empty", "작업이나 메모를 선택하여 속성을 편집하거나, 선택을 해제하여 프로젝트 설정을 편집하세요.",
                    "Select a task or note to edit its properties, or clear the selection to edit project settings."),
                ("Props.Project", "프로젝트", "Project"),
                ("Props.Name", "이름:", "Name:"),
                ("Props.Start", "시작:", "Start:"),
                ("ProjectSettings.Title", "프로젝트 설정", "Project Settings"),
                ("ProjectSettings.General", "일반", "General"),
                ("ProjectSettings.Schedule", "일정", "Schedule"),
                ("ProjectSettings.Defaults", "기본값", "Defaults"),
                ("ProjectSettings.ProjectName", "프로젝트 이름:", "Project name:"),
                ("ProjectSettings.ProjectStart", "프로젝트 시작:", "Project start:"),
                ("ProjectSettings.WorkingDaysTitle", "이 프로젝트의 근무일을 선택하세요.", "Select which days count as working days for this project."),
                ("ProjectSettings.EmptyName", "프로젝트 이름을 입력하세요.", "Project name cannot be empty."),
                ("ProjectSettings.NoWorkingDay", "근무일을 하나 이상 선택하세요.", "Select at least one working day."),
                ("Tip.New", "새 빈 프로젝트 만들기", "Create a new empty project"),
                ("Tip.Open", "MyProject 또는 Microsoft Project 파일 열기", "Open a MyProject or Microsoft Project file"),
                ("Tip.Save", "현재 프로젝트 저장", "Save the current project"),
                ("Tip.SaveAs", "다른 이름으로 프로젝트 저장", "Save the current project under a new file name"),
                ("Tip.ProjectSettings", "프로젝트 이름, 일정, 근무일, 의존성 기본값 편집", "Edit project name, schedule, working days, and dependency defaults"),
                ("Tip.Preferences", "언어 등 애플리케이션 환경 설정", "Application preferences such as language"),
                ("Tip.DbAutoRefresh", "공유 일정이 열려 있을 때 몇 초마다 데이터베이스를 확인하고 다른 사용자의 변경을 적용합니다.",
                    "When a shared schedule is open, check the database every few seconds and apply updates made by other users.")
            );
        }

        private static void Add(AppLanguage ko, AppLanguage en, params (string Key, string Ko, string En)[] entries)
        {
            foreach (var (key, koText, enText) in entries)
            {
                Strings[(ko, key)] = koText;
                Strings[(en, key)] = enText;
            }
        }

        public static void Apply(AppLanguage language)
        {
            CurrentLanguage = language;
            var culture = CurrentCulture;
            CultureInfo.DefaultThreadCurrentCulture = culture;
            CultureInfo.DefaultThreadCurrentUICulture = culture;
            Thread.CurrentThread.CurrentCulture = culture;
            Thread.CurrentThread.CurrentUICulture = culture;
            LanguageChanged?.Invoke(null, EventArgs.Empty);
        }

        public static string Get(string key)
        {
            if (Strings.TryGetValue((CurrentLanguage, key), out var text))
                return text;
            if (Strings.TryGetValue((AppLanguage.English, key), out var fallback))
                return fallback;
            return key;
        }

        public static string Format(string key, params object[] args) =>
            string.Format(CurrentCulture, Get(key), args);
    }
}

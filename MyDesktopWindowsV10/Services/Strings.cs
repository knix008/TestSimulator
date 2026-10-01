using System.Globalization;
using MyDesktop.Models;

namespace MyDesktop.Services;

/// <summary>
/// The English text is the key, so a phrase without a translation simply stays English and nothing
/// can go missing.
/// </summary>
public static class Strings
{
    private static UiLanguage _language = UiLanguage.System;

    public static event Action? Changed;

    public static UiLanguage Language
    {
        get => _language;
        set
        {
            if (_language == value)
            {
                return;
            }

            _language = value;
            Changed?.Invoke();
        }
    }

    public static bool UseKorean => Language switch
    {
        UiLanguage.Korean => true,
        UiLanguage.English => false,
        _ => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "ko"
    };

    public static string T(string english)
        => UseKorean && Korean.TryGetValue(english, out var translated) ? translated : english;

    private static readonly Dictionary<string, string> Korean = new(StringComparer.Ordinal)
    {
        // tray
        ["New fence"] = "새 펜스",
        ["New folder portal…"] = "새 폴더 포털…",
        ["Hide all fences"] = "모든 펜스 숨기기",
        ["Lock fences"] = "펜스 잠그기",
        ["Lock all fences"] = "모든 펜스 잠그기",
        ["MyDesktop draws the desktop"] = "MyDesktop이 바탕화면을 그림",
        ["Start with Windows"] = "Windows 시작 시 실행",
        ["Right-drag desktop makes a fence"] = "바탕화면 우클릭 드래그로 펜스 만들기",
        ["Double-click desktop hides fences"] = "바탕화면 더블클릭으로 펜스 숨기기",
        ["Settings…"] = "설정…",
        ["MyDesktop settings…"] = "MyDesktop 설정…",
        ["Show more options"] = "더 많은 옵션 표시",
        ["Exit MyDesktop"] = "MyDesktop 끝내기",
        ["Language"] = "언어",
        ["Follow Windows"] = "Windows 설정 따르기",
        ["English"] = "English",
        ["Korean"] = "한국어",

        // fence menu
        ["Rename fence"] = "펜스 이름 바꾸기",
        ["Roll up"] = "말아 올리기",
        ["Roll down"] = "펼치기",
        ["Sort items by"] = "정렬 기준",
        ["Manual order"] = "직접 정한 순서",
        ["Name"] = "이름",
        ["Type"] = "종류",
        ["Date modified"] = "수정한 날짜",
        ["Icon size"] = "아이콘 크기",
        ["Small"] = "작게",
        ["Medium"] = "보통",
        ["Large"] = "크게",
        ["Huge"] = "아주 크게",
        ["Show labels"] = "이름 표시",
        ["Fence colour"] = "펜스 색",
        ["Accent"] = "강조색",
        ["Transparency"] = "투명도",
        ["Solid"] = "불투명",
        ["Light"] = "살짝",
        ["Heavy"] = "많이",
        ["Ghost"] = "거의 투명",
        ["Open folder in Explorer"] = "탐색기에서 폴더 열기",
        ["Point at another folder…"] = "다른 폴더로 바꾸기…",
        ["Show hidden items"] = "숨김 항목 표시",
        ["Stop mirroring folder"] = "폴더 연결 끊기",
        ["Turn into a folder portal…"] = "폴더 포털로 만들기…",
        ["New fence here"] = "여기에 새 펜스",
        ["Duplicate this fence"] = "이 펜스 복제",
        ["Delete this fence…"] = "이 펜스 삭제…",

        // item menu
        ["Open"] = "열기",
        ["Empty Recycle Bin"] = "휴지통 비우기",
        ["Open file location"] = "파일 위치 열기",
        ["Copy path"] = "경로 복사",
        ["Move to fence"] = "펜스로 옮기기",
        ["Put into fence"] = "펜스에 넣기",
        ["Refresh icon"] = "아이콘 새로 고침",
        ["Remove from fence"] = "펜스에서 빼기",
        ["Delete"] = "삭제",

        // colours
        ["Forest"] = "숲",
        ["Slate"] = "슬레이트",
        ["Ink"] = "먹",
        ["Plum"] = "자두",
        ["Sand"] = "모래",
        ["Deep sea"] = "심해",
        ["Sage"] = "세이지",
        ["Lime"] = "라임",
        ["Coral"] = "코랄",
        ["Sea glass"] = "바다유리",
        ["Marigold"] = "금잔화",
        ["Periwinkle"] = "페리윙클",
        ["Rose"] = "장미",

        // generated names. These are saved into the workspace as plain text, so a fence keeps the
        // name it was born with even after the language changes, exactly as a folder would.
        ["Fence {0}"] = "펜스 {0}",
        ["{0} copy"] = "{0} 복사본",

        // dialogs and window text
        ["Item missing"] = "항목을 찾을 수 없음",
        ["MyDesktop cannot find"] = "다음을 찾을 수 없습니다",
        ["Could not open"] = "열 수 없음",
        ["Delete fence"] = "펜스 삭제",
        ["Delete the fence '{0}'? Its items go back to the desktop; no file is moved or deleted."] =
            "펜스 '{0}'을(를) 삭제할까요? 항목은 바탕화면으로 돌아가며, 파일은 옮기거나 지우지 않습니다.",
        ["Remove the portal '{0}'? The folder itself is left alone."] =
            "포털 '{0}'을(를) 없앨까요? 폴더 자체는 건드리지 않습니다.",
        ["Delete the fence '{0}'? The files it points at are left alone."] =
            "펜스 '{0}'을(를) 삭제할까요? 가리키던 파일은 그대로 둡니다.",
        ["Choose the folder this fence should mirror"] = "이 펜스가 비출 폴더 선택",
        ["Add items to this fence"] = "이 펜스에 항목 추가",
        ["Add a folder to this fence"] = "이 펜스에 폴더 추가",
        ["Shortcuts and links"] = "바로 가기와 링크",
        ["All files"] = "모든 파일",

        // fence window
        ["PORTAL"] = "포털",
        ["Drop shortcuts here"] = "여기에 바로 가기를 놓으세요",
        ["Roll up or down"] = "말아 올리기 / 펼치기",
        ["Fence menu"] = "펜스 메뉴",
        ["FENCE SETTINGS"] = "펜스 설정",
        ["YOUR FENCES"] = "내 펜스",
        ["DESKTOP FENCES"] = "데스크톱 펜스",
        ["New folder portal"] = "새 폴더 포털",
        ["Delete fence "] = "펜스 삭제 ",
        ["Show on desktop"] = "바탕화면에 표시",
        ["OPACITY"] = "불투명도",
        ["ICON SIZE"] = "아이콘 크기",
        ["Rolled up"] = "말아 올림",
        ["Hidden"] = "숨김",
        ["FOLDER PORTAL"] = "폴더 포털",
        ["Choose folder"] = "폴더 선택",
        ["Stop mirroring"] = "연결 끊기",
        ["SORT"] = "정렬",
        ["ITEMS IN THIS FENCE"] = "이 펜스의 항목",
        ["Add items"] = "항목 추가",
        ["Add folder"] = "폴더 추가",
        ["DESKTOP BEHAVIOUR"] = "바탕화면 동작",
        ["GRID"] = "격자",
        ["Start with Windows "] = "Windows 시작 시 실행 ",
        ["Lock every fence"] = "모든 펜스 잠그기",
        ["Hide every fence"] = "모든 펜스 숨기기",
        ["Right-drag on empty desktop draws a new fence"] = "빈 바탕화면에서 우클릭 드래그하면 새 펜스가 그려집니다",
        ["Double-click empty desktop hides and restores every fence"] = "빈 바탕화면을 더블클릭하면 모든 펜스가 숨겨지고 다시 나타납니다",
        ["Snap fences to a grid while dragging"] = "끌 때 격자에 맞추기",
        ["Snap fences to screen edges and to each other"] = "화면 가장자리와 다른 펜스에 붙이기",
        ["Show the system tray icon"] = "시스템 트레이 아이콘 표시",
        ["Without the tray icon, right-click any fence and choose MyDesktop settings to get back here."] =
            "트레이 아이콘을 끄면, 펜스를 우클릭해 MyDesktop 설정을 고르면 여기로 돌아올 수 있습니다.",
        ["ACCENT"] = "강조색",
        ["FENCE COLOUR"] = "펜스 색",
        ["MYDESKTOP FENCES"] = "MYDESKTOP 펜스",
        ["Changes apply immediately and save themselves"] = "변경 사항은 즉시 적용되고 자동 저장됩니다",
        ["A portal fence mirrors a folder, so its contents follow whatever is in that folder."] =
            "포털 펜스는 폴더를 비추므로, 그 폴더의 내용이 그대로 따라옵니다.",
        ["The shell's icon layer is switched off and MyDesktop draws the Recycle Bin and anything not in a fence. "
         + "That is what keeps an item in a fence from also appearing on the wallpaper, while its file stays in the "
         + "Desktop folder where Explorer shows it. Switching this off hands the desktop back to Windows."] =
            "셸의 아이콘 레이어를 끄고, 휴지통과 펜스에 들어 있지 않은 항목을 MyDesktop이 직접 그립니다. "
            + "그래서 펜스에 넣은 항목이 배경화면에 겹쳐 보이지 않으면서도, 파일 자체는 탐색기가 보여 주는 "
            + "바탕 화면 폴더에 그대로 남습니다. 이 설정을 끄면 바탕화면을 다시 Windows에 넘깁니다.",
        ["LANGUAGE"] = "언어"
    };
}

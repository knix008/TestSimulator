using System.Globalization;
using Palisades.Models;

namespace Palisades.Services;

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
        ["Palisades draws the desktop"] = "Palisades가 바탕화면을 그림",
        ["Start with Windows"] = "Windows 시작 시 실행",
        ["Right-drag desktop makes a fence"] = "바탕화면 우클릭 드래그로 펜스 만들기",
        ["Double-click desktop hides fences"] = "바탕화면 더블클릭으로 펜스 숨기기",
        ["Settings…"] = "설정…",
        ["Palisades settings…"] = "Palisades 설정…",
        ["Exit Palisades"] = "Palisades 끝내기",
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

        // dialogs and window text
        ["Item missing"] = "항목을 찾을 수 없음",
        ["Could not open"] = "열 수 없음",
        ["Delete fence"] = "펜스 삭제",
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
        ["ACCENT"] = "강조색",
        ["FENCE COLOUR"] = "펜스 색",
        ["PALISADES DESKTOP FENCES"] = "PALISADES 데스크톱 펜스",
        ["Changes apply immediately and save themselves"] = "변경 사항은 즉시 적용되고 자동 저장됩니다",
        ["A portal fence mirrors a folder, so its contents follow whatever is in that folder."] =
            "포털 펜스는 폴더를 비추므로, 그 폴더의 내용이 그대로 따라옵니다.",
        ["LANGUAGE"] = "언어"
    };
}

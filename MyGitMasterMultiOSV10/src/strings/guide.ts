// Strings for the user's guide window and popups, merged into src/i18n.ts. Keys must exist in both languages.
import type { FeatureStrings } from "./index";

export const guideStrings: FeatureStrings = {
  ko: {
    userGuide: "사용자 설명서",
    guideTitle: "My Git Master 사용자 설명서",
    guideSearch: "설명서 검색",
    guideSearchHint: "찾을 단어를 입력합니다. Enter: 다음 위치, Esc: 지우기",
    guideClear: "검색 지우기",
    guideMatches: "{n}개 항목",
    guideNoMatch: "찾는 내용이 없습니다.",
    guideSwitchLanguage: "설명서 언어 바꾸기 (한국어 / English)",
    guideFontSize: "글자 크기",
    guideContents: "목차",
    guideTop: "맨 위로",
  },
  en: {
    userGuide: "User's Guide",
    guideTitle: "My Git Master User's Guide",
    guideSearch: "Search the guide",
    guideSearchHint: "Type the words to find. Enter: next match, Esc: clear",
    guideClear: "Clear the search",
    guideMatches: "{n} sections",
    guideNoMatch: "Nothing matches.",
    guideSwitchLanguage: "Switch the guide's language (한국어 / English)",
    guideFontSize: "Text size",
    guideContents: "Contents",
    guideTop: "Back to top",
  },
};

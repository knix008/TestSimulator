/**
 * Markets the app can show and the listings offered for each of them.
 *
 * A market is one country's exchange. `suffix` is what Yahoo Finance appends to
 * a ticker, so a listing's full symbol is always `code + suffix`. `index` is the
 * benchmark shown beside the watchlist. Korea and the United States come first
 * because they are the two markets the app opens with.
 */

const MARKET_ROWS = [
  // code, countryKo, countryEn, marketKo, marketEn, currency, suffix, index, indexKo, indexEn
  ["KR", "대한민국", "South Korea", "한국거래소", "Korea Exchange", "KRW", ".KS", "^KS11", "코스피", "KOSPI"],
  ["US", "미국", "United States", "미국 증시", "US Markets", "USD", "", "^GSPC", "S&P 500", "S&P 500"],
  ["JP", "일본", "Japan", "도쿄증권거래소", "Tokyo Stock Exchange", "JPY", ".T", "^N225", "닛케이 225", "Nikkei 225"],
  ["CN", "중국", "China", "상하이증권거래소", "Shanghai Stock Exchange", "CNY", ".SS", "000001.SS", "상하이종합", "SSE Composite"],
  ["HK", "홍콩", "Hong Kong", "홍콩거래소", "Hong Kong Exchange", "HKD", ".HK", "^HSI", "항셍지수", "Hang Seng"],
  ["TW", "대만", "Taiwan", "대만증권거래소", "Taiwan Stock Exchange", "TWD", ".TW", "^TWII", "가권지수", "TAIEX"],
  ["GB", "영국", "United Kingdom", "런던증권거래소", "London Stock Exchange", "GBP", ".L", "^FTSE", "FTSE 100", "FTSE 100"],
  ["DE", "독일", "Germany", "프랑크푸르트증권거래소", "Frankfurt Stock Exchange", "EUR", ".DE", "^GDAXI", "닥스", "DAX"],
  ["FR", "프랑스", "France", "유로넥스트 파리", "Euronext Paris", "EUR", ".PA", "^FCHI", "카크 40", "CAC 40"],
  ["NL", "네덜란드", "Netherlands", "유로넥스트 암스테르담", "Euronext Amsterdam", "EUR", ".AS", "^AEX", "AEX", "AEX"],
  ["CH", "스위스", "Switzerland", "식스 스위스 거래소", "SIX Swiss Exchange", "CHF", ".SW", "^SSMI", "SMI", "SMI"],
  ["CA", "캐나다", "Canada", "토론토증권거래소", "Toronto Stock Exchange", "CAD", ".TO", "^GSPTSE", "S&P/TSX", "S&P/TSX"],
  ["AU", "호주", "Australia", "호주증권거래소", "Australian Securities Exchange", "AUD", ".AX", "^AXJO", "ASX 200", "ASX 200"],
  ["IN", "인도", "India", "인도국립증권거래소", "National Stock Exchange of India", "INR", ".NS", "^NSEI", "니프티 50", "Nifty 50"],
  ["BR", "브라질", "Brazil", "B3 상파울루", "B3 Sao Paulo", "BRL", ".SA", "^BVSP", "보베스파", "Bovespa"],
  ["SG", "싱가포르", "Singapore", "싱가포르거래소", "Singapore Exchange", "SGD", ".SI", "^STI", "STI", "Straits Times"],
];

const LISTING_ROWS = [
  // marketCode, code, nameKo, nameEn
  ["KR", "005930", "삼성전자", "Samsung Electronics"],
  // Preferred shares trade under their own code. Yahoo gives them the parent
  // company's English name, so searching 삼성전자 cannot tell them apart; the
  // catalogue names them properly.
  ["KR", "005935", "삼성전자우", "Samsung Electronics (pref)"],
  ["KR", "000660", "SK하이닉스", "SK hynix"],
  ["KR", "373220", "LG에너지솔루션", "LG Energy Solution"],
  ["KR", "207940", "삼성바이오로직스", "Samsung Biologics"],
  ["KR", "005380", "현대차", "Hyundai Motor"],
  ["KR", "005385", "현대차우", "Hyundai Motor (pref)"],
  ["KR", "000270", "기아", "Kia"],
  ["KR", "035420", "NAVER", "NAVER"],
  ["KR", "035720", "카카오", "Kakao"],
  ["KR", "051910", "LG화학", "LG Chem"],
  ["KR", "051915", "LG화학우", "LG Chem (pref)"],
  ["KR", "005490", "POSCO홀딩스", "POSCO Holdings"],
  ["KR", "068270", "셀트리온", "Celltrion"],
  ["KR", "105560", "KB금융", "KB Financial"],
  ["KR", "055550", "신한지주", "Shinhan Financial"],
  ["KR", "012330", "현대모비스", "Hyundai Mobis"],
  ["KR", "015760", "한국전력", "KEPCO"],
  ["KR", "329180", "HD현대중공업", "HD Hyundai Heavy Industries"],
  ["KR", "009540", "HD한국조선해양", "HD Korea Shipbuilding & Offshore Engineering"],
  ["KR", "010140", "삼성중공업", "Samsung Heavy Industries"],
  ["KR", "042660", "한화오션", "Hanwha Ocean"],
  ["KR", "012450", "한화에어로스페이스", "Hanwha Aerospace"],
  ["KR", "034020", "두산에너빌리티", "Doosan Enerbility"],
  ["KR", "006400", "삼성SDI", "Samsung SDI"],
  ["KR", "066570", "LG전자", "LG Electronics"],
  ["KR", "028260", "삼성물산", "Samsung C&T"],
  ["KR", "018260", "삼성에스디에스", "Samsung SDS"],
  ["KR", "032830", "삼성생명", "Samsung Life Insurance"],
  ["KR", "000810", "삼성화재", "Samsung Fire & Marine Insurance"],
  ["KR", "003550", "LG", "LG Corp"],
  ["KR", "034730", "SK", "SK Inc"],
  ["KR", "017670", "SK텔레콤", "SK Telecom"],
  ["KR", "096770", "SK이노베이션", "SK Innovation"],
  ["KR", "030200", "KT", "KT Corporation"],
  ["KR", "033780", "KT&G", "KT&G"],
  ["KR", "086790", "하나금융지주", "Hana Financial Group"],
  ["KR", "316140", "우리금융지주", "Woori Financial Group"],
  ["KR", "024110", "기업은행", "Industrial Bank of Korea"],
  ["KR", "010130", "고려아연", "Korea Zinc"],
  ["KR", "011170", "롯데케미칼", "Lotte Chemical"],
  ["KR", "004020", "현대제철", "Hyundai Steel"],
  ["KR", "011200", "HMM", "HMM"],
  ["KR", "097950", "CJ제일제당", "CJ Cheiljedang"],
  ["KR", "036570", "엔씨소프트", "NCSoft"],
  ["KR", "251270", "넷마블", "Netmarble"],
  ["KR", "161390", "한국타이어앤테크놀로지", "Hankook Tire & Technology"],
  ["US", "AAPL", "애플", "Apple"],
  ["US", "MSFT", "마이크로소프트", "Microsoft"],
  ["US", "NVDA", "엔비디아", "NVIDIA"],
  ["US", "GOOGL", "알파벳", "Alphabet"],
  ["US", "AMZN", "아마존", "Amazon"],
  ["US", "META", "메타", "Meta Platforms"],
  ["US", "TSLA", "테슬라", "Tesla"],
  ["US", "AVGO", "브로드컴", "Broadcom"],
  ["US", "JPM", "JP모건", "JPMorgan Chase"],
  ["US", "V", "비자", "Visa"],
  ["US", "LLY", "일라이릴리", "Eli Lilly"],
  ["US", "XOM", "엑슨모빌", "Exxon Mobil"],
  ["US", "UNH", "유나이티드헬스", "UnitedHealth"],
  ["US", "COST", "코스트코", "Costco"],
  ["US", "AMD", "AMD", "AMD"],
  ["JP", "7203", "도요타", "Toyota Motor"],
  ["JP", "6758", "소니그룹", "Sony Group"],
  ["JP", "9984", "소프트뱅크그룹", "SoftBank Group"],
  ["JP", "8035", "도쿄일렉트론", "Tokyo Electron"],
  ["JP", "6861", "키엔스", "Keyence"],
  ["JP", "9432", "NTT", "NTT"],
  ["CN", "600519", "구이저우마오타이", "Kweichow Moutai"],
  ["CN", "601398", "공상은행", "ICBC"],
  ["CN", "600036", "초상은행", "China Merchants Bank"],
  ["CN", "601857", "페트로차이나", "PetroChina"],
  ["HK", "0700", "텐센트", "Tencent"],
  ["HK", "9988", "알리바바", "Alibaba"],
  ["HK", "0941", "차이나모바일", "China Mobile"],
  ["HK", "1299", "AIA", "AIA Group"],
  ["HK", "3690", "메이퇀", "Meituan"],
  ["TW", "2330", "TSMC", "TSMC"],
  ["TW", "2317", "혼하이정밀", "Hon Hai Precision"],
  ["TW", "2454", "미디어텍", "MediaTek"],
  ["GB", "SHEL", "쉘", "Shell"],
  ["GB", "AZN", "아스트라제네카", "AstraZeneca"],
  ["GB", "HSBA", "HSBC", "HSBC"],
  ["GB", "ULVR", "유니레버", "Unilever"],
  ["GB", "BP", "BP", "BP"],
  ["DE", "SAP", "SAP", "SAP"],
  ["DE", "SIE", "지멘스", "Siemens"],
  ["DE", "ALV", "알리안츠", "Allianz"],
  ["DE", "BMW", "BMW", "BMW"],
  ["DE", "MBG", "메르세데스벤츠", "Mercedes-Benz"],
  ["FR", "MC", "LVMH", "LVMH"],
  ["FR", "OR", "로레알", "L'Oreal"],
  ["FR", "TTE", "토탈에너지스", "TotalEnergies"],
  ["FR", "AIR", "에어버스", "Airbus"],
  ["NL", "ASML", "ASML", "ASML"],
  ["NL", "INGA", "ING", "ING Groep"],
  ["NL", "HEIA", "하이네켄", "Heineken"],
  ["CH", "NESN", "네슬레", "Nestle"],
  ["CH", "ROG", "로슈", "Roche"],
  ["CH", "NOVN", "노바티스", "Novartis"],
  ["CA", "RY", "로열뱅크오브캐나다", "Royal Bank of Canada"],
  ["CA", "SHOP", "쇼피파이", "Shopify"],
  ["CA", "ENB", "엔브리지", "Enbridge"],
  ["AU", "BHP", "BHP", "BHP Group"],
  ["AU", "CBA", "커먼웰스뱅크", "Commonwealth Bank"],
  ["AU", "CSL", "CSL", "CSL"],
  ["IN", "RELIANCE", "릴라이언스", "Reliance Industries"],
  ["IN", "TCS", "타타컨설턴시", "Tata Consultancy"],
  ["IN", "INFY", "인포시스", "Infosys"],
  ["IN", "HDFCBANK", "HDFC은행", "HDFC Bank"],
  ["BR", "PETR4", "페트로브라스", "Petrobras"],
  ["BR", "VALE3", "발레", "Vale"],
  ["BR", "ITUB4", "이타우우니방쿠", "Itau Unibanco"],
  ["SG", "D05", "DBS", "DBS Group"],
  ["SG", "O39", "OCBC", "OCBC Bank"],
  ["SG", "C6L", "싱가포르항공", "Singapore Airlines"],
];

export const MARKETS = MARKET_ROWS.map(
  ([marketCode, countryKo, countryEn, marketKo, marketEn, currency, suffix, index, indexKo, indexEn]) => ({
    marketCode,
    countryKo,
    countryEn,
    marketKo,
    marketEn,
    currency,
    suffix,
    index,
    indexKo,
    indexEn,
  }),
);

export const LISTINGS = LISTING_ROWS.map(([marketCode, code, nameKo, nameEn]) => ({
  marketCode,
  code,
  symbol: `${code}${findMarket(marketCode)?.suffix ?? ""}`,
  nameKo,
  nameEn,
}));

/**
 * Every currency the rate panel can be asked for. The base and the shown list
 * are both chosen in Settings. Between the two rate sources these all resolve;
 * one that a source omits still arrives from the other.
 */
export const CURRENCY_NAMES = {
  USD: ["미국 달러", "US Dollar"],
  KRW: ["대한민국 원", "Korean Won"],
  EUR: ["유로", "Euro"],
  JPY: ["일본 엔", "Japanese Yen"],
  CNY: ["중국 위안", "Chinese Yuan"],
  HKD: ["홍콩 달러", "Hong Kong Dollar"],
  TWD: ["대만 달러", "Taiwan Dollar"],
  GBP: ["영국 파운드", "British Pound"],
  CHF: ["스위스 프랑", "Swiss Franc"],
  CAD: ["캐나다 달러", "Canadian Dollar"],
  AUD: ["호주 달러", "Australian Dollar"],
  NZD: ["뉴질랜드 달러", "New Zealand Dollar"],
  INR: ["인도 루피", "Indian Rupee"],
  BRL: ["브라질 헤알", "Brazilian Real"],
  SGD: ["싱가포르 달러", "Singapore Dollar"],
  THB: ["태국 바트", "Thai Baht"],
  VND: ["베트남 동", "Vietnamese Dong"],
  IDR: ["인도네시아 루피아", "Indonesian Rupiah"],
  MYR: ["말레이시아 링깃", "Malaysian Ringgit"],
  PHP: ["필리핀 페소", "Philippine Peso"],
  MXN: ["멕시코 페소", "Mexican Peso"],
  ZAR: ["남아프리카 랜드", "South African Rand"],
  TRY: ["튀르키예 리라", "Turkish Lira"],
  SEK: ["스웨덴 크로나", "Swedish Krona"],
  NOK: ["노르웨이 크로네", "Norwegian Krone"],
  DKK: ["덴마크 크로네", "Danish Krone"],
  PLN: ["폴란드 즈워티", "Polish Zloty"],
  CZK: ["체코 코루나", "Czech Koruna"],
  HUF: ["헝가리 포린트", "Hungarian Forint"],
  ILS: ["이스라엘 셰켈", "Israeli Shekel"],
  AED: ["아랍에미리트 디르함", "UAE Dirham"],
  SAR: ["사우디 리얄", "Saudi Riyal"],
};

export const CURRENCIES = Object.keys(CURRENCY_NAMES);

export function findMarket(marketCode) {
  return MARKETS.find((market) => market.marketCode === marketCode) || null;
}

export function marketName(market, language) {
  if (!market) return "";
  return language === "en" ? market.marketEn || market.marketKo : market.marketKo || market.marketEn;
}

export function countryName(market, language) {
  if (!market) return "";
  return language === "en" ? market.countryEn || market.countryKo : market.countryKo || market.countryEn;
}

export function currencyName(code, language) {
  const row = CURRENCY_NAMES[String(code || "").toUpperCase()];
  if (!row) return String(code || "");
  return language === "en" ? row[1] : row[0];
}

export function listingsOf(list, marketCode) {
  return (list || []).filter((entry) => entry.marketCode === marketCode);
}

/** Lower case and without spaces, so "HD 현대" and "HD현대" are the same thing. */
function matchable(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * Listings a query names. Every word in the query must turn up somewhere in a
 * listing - its name in either language, its code or its full symbol - and
 * spaces are ignored on both sides. So "HD 현대" finds HD현대중공업, "현대 차"
 * finds 현대차, and a bare code finds the one listing that carries it.
 */
export function filterListings(list, marketCode, query) {
  const words = String(query || "")
    .trim()
    .split(/\s+/)
    .map(matchable)
    .filter(Boolean);
  return (list || []).filter((entry) => {
    if (marketCode && entry.marketCode !== marketCode) return false;
    if (!words.length) return true;
    const fields = [entry.symbol, entry.code, entry.nameEn, entry.nameKo].map(matchable);
    return words.every((word) => fields.some((field) => field.includes(word)));
  });
}

export function findListing(list, symbol) {
  return (list || []).find((entry) => entry.symbol === symbol) || null;
}

export function listingName(listing, language) {
  if (!listing) return "";
  return language === "en" ? listing.nameEn || listing.nameKo || listing.symbol : listing.nameKo || listing.nameEn || listing.symbol;
}

/** The market a Yahoo symbol belongs to, taken from its suffix. */
export function marketOfSymbol(symbol) {
  const text = String(symbol || "");
  const dot = text.lastIndexOf(".");
  const suffix = dot > 0 ? text.slice(dot) : "";
  return MARKETS.find((market) => market.suffix && market.suffix === suffix) || MARKETS.find((market) => market.marketCode === "US");
}

using System;
using System.Collections.Generic;
using System.Linq;

namespace MyClockWinV10.Models;

public record CityInfo(string City, string Country, string TimeZoneId, string CityEn = "");

public static class CityDatabase
{
    public static readonly IReadOnlyList<CityInfo> Cities = new CityInfo[]
    {
        // 대한민국
        new("서울",            "대한민국",      "Korea Standard Time",                "Seoul"),
        new("부산",            "대한민국",      "Korea Standard Time",                "Busan"),
        new("인천",            "대한민국",      "Korea Standard Time",                "Incheon"),
        new("대구",            "대한민국",      "Korea Standard Time",                "Daegu"),
        new("광주",            "대한민국",      "Korea Standard Time",                "Gwangju"),
        new("대전",            "대한민국",      "Korea Standard Time",                "Daejeon"),
        new("울산",            "대한민국",      "Korea Standard Time",                "Ulsan"),
        new("제주",            "대한민국",      "Korea Standard Time",                "Jeju"),
        // 일본
        new("도쿄",            "일본",          "Tokyo Standard Time",                "Tokyo"),
        new("오사카",          "일본",          "Tokyo Standard Time",                "Osaka"),
        new("나고야",          "일본",          "Tokyo Standard Time",                "Nagoya"),
        new("삿포로",          "일본",          "Tokyo Standard Time",                "Sapporo"),
        new("후쿠오카",        "일본",          "Tokyo Standard Time",                "Fukuoka"),
        new("교토",            "일본",          "Tokyo Standard Time",                "Kyoto"),
        new("히로시마",        "일본",          "Tokyo Standard Time",                "Hiroshima"),
        // 중국
        new("베이징",          "중국",          "China Standard Time",                "Beijing"),
        new("상하이",          "중국",          "China Standard Time",                "Shanghai"),
        new("광저우",          "중국",          "China Standard Time",                "Guangzhou"),
        new("선전",            "중국",          "China Standard Time",                "Shenzhen"),
        new("청두",            "중국",          "China Standard Time",                "Chengdu"),
        new("우한",            "중국",          "China Standard Time",                "Wuhan"),
        new("항저우",          "중국",          "China Standard Time",                "Hangzhou"),
        new("시안",            "중국",          "China Standard Time",                "Xi'an"),
        // 홍콩·마카오·대만
        new("홍콩",            "홍콩",          "China Standard Time",                "Hong Kong"),
        new("마카오",          "마카오",        "China Standard Time",                "Macau"),
        new("타이베이",        "대만",          "Taipei Standard Time",               "Taipei"),
        // 동남아시아
        new("싱가포르",        "싱가포르",      "Singapore Standard Time",            "Singapore"),
        new("방콕",            "태국",          "SE Asia Standard Time",              "Bangkok"),
        new("하노이",          "베트남",        "SE Asia Standard Time",              "Hanoi"),
        new("호치민",          "베트남",        "SE Asia Standard Time",              "Ho Chi Minh City"),
        new("자카르타",        "인도네시아",    "SE Asia Standard Time",              "Jakarta"),
        new("발리",            "인도네시아",    "Malay Peninsula Standard Time",      "Bali"),
        new("마닐라",          "필리핀",        "Singapore Standard Time",            "Manila"),
        new("쿠알라룸푸르",    "말레이시아",    "Singapore Standard Time",            "Kuala Lumpur"),
        new("양곤",            "미얀마",        "Myanmar Standard Time",              "Yangon"),
        new("프놈펜",          "캄보디아",      "SE Asia Standard Time",              "Phnom Penh"),
        // 남아시아
        new("뭄바이",          "인도",          "India Standard Time",                "Mumbai"),
        new("델리",            "인도",          "India Standard Time",                "Delhi"),
        new("콜카타",          "인도",          "India Standard Time",                "Kolkata"),
        new("벵갈루루",        "인도",          "India Standard Time",                "Bengaluru"),
        new("첸나이",          "인도",          "India Standard Time",                "Chennai"),
        new("하이데라바드",    "인도",          "India Standard Time",                "Hyderabad"),
        new("카라치",          "파키스탄",      "Pakistan Standard Time",             "Karachi"),
        new("라호르",          "파키스탄",      "Pakistan Standard Time",             "Lahore"),
        new("다카",            "방글라데시",    "Bangladesh Standard Time",           "Dhaka"),
        new("콜롬보",          "스리랑카",      "Sri Lanka Standard Time",            "Colombo"),
        new("카트만두",        "네팔",          "Nepal Standard Time",                "Kathmandu"),
        // 중앙아시아
        new("알마티",          "카자흐스탄",    "Central Asia Standard Time",         "Almaty"),
        new("타슈켄트",        "우즈베키스탄",  "West Asia Standard Time",            "Tashkent"),
        // 중동
        new("두바이",          "아랍에미리트",  "Arabian Standard Time",              "Dubai"),
        new("아부다비",        "아랍에미리트",  "Arabian Standard Time",              "Abu Dhabi"),
        new("리야드",          "사우디아라비아","Arab Standard Time",                 "Riyadh"),
        new("쿠웨이트",        "쿠웨이트",      "Arab Standard Time",                 "Kuwait"),
        new("도하",            "카타르",        "Arab Standard Time",                 "Doha"),
        new("바그다드",        "이라크",        "Arabic Standard Time",               "Baghdad"),
        new("테헤란",          "이란",          "Iran Standard Time",                 "Tehran"),
        new("텔아비브",        "이스라엘",      "Israel Standard Time",               "Tel Aviv"),
        new("예루살렘",        "이스라엘",      "Israel Standard Time",               "Jerusalem"),
        new("암만",            "요르단",        "Jordan Standard Time",               "Amman"),
        new("베이루트",        "레바논",        "Middle East Standard Time",          "Beirut"),
        // 튀르키예·러시아·유럽 동부
        new("이스탄불",        "튀르키예",      "Turkey Standard Time",               "Istanbul"),
        new("앙카라",          "튀르키예",      "Turkey Standard Time",               "Ankara"),
        new("모스크바",        "러시아",        "Russian Standard Time",              "Moscow"),
        new("상트페테르부르크","러시아",        "Russian Standard Time",              "St. Petersburg"),
        new("노보시비르스크",  "러시아",        "N. Central Asia Standard Time",      "Novosibirsk"),
        new("블라디보스토크",  "러시아",        "Vladivostok Standard Time",          "Vladivostok"),
        new("예카테린부르크",  "러시아",        "Ekaterinburg Standard Time",         "Yekaterinburg"),
        new("키이우",          "우크라이나",    "FLE Standard Time",                  "Kyiv"),
        new("부쿠레슈티",      "루마니아",      "GTB Standard Time",                  "Bucharest"),
        new("아테네",          "그리스",        "GTB Standard Time",                  "Athens"),
        new("소피아",          "불가리아",      "FLE Standard Time",                  "Sofia"),
        new("헬싱키",          "핀란드",        "FLE Standard Time",                  "Helsinki"),
        new("리가",            "라트비아",      "FLE Standard Time",                  "Riga"),
        new("탈린",            "에스토니아",    "FLE Standard Time",                  "Tallinn"),
        new("빌뉴스",          "리투아니아",    "FLE Standard Time",                  "Vilnius"),
        new("바르샤바",        "폴란드",        "Central European Standard Time",     "Warsaw"),
        new("프라하",          "체코",          "Central European Standard Time",     "Prague"),
        new("부다페스트",      "헝가리",        "Central European Standard Time",     "Budapest"),
        new("빈",              "오스트리아",    "W. Europe Standard Time",            "Vienna"),
        new("취리히",          "스위스",        "W. Europe Standard Time",            "Zurich"),
        new("제네바",          "스위스",        "W. Europe Standard Time",            "Geneva"),
        new("베를린",          "독일",          "W. Europe Standard Time",            "Berlin"),
        new("프랑크푸르트",    "독일",          "W. Europe Standard Time",            "Frankfurt"),
        new("뮌헨",            "독일",          "W. Europe Standard Time",            "Munich"),
        new("함부르크",        "독일",          "W. Europe Standard Time",            "Hamburg"),
        new("암스테르담",      "네덜란드",      "W. Europe Standard Time",            "Amsterdam"),
        new("브뤼셀",          "벨기에",        "Romance Standard Time",              "Brussels"),
        new("파리",            "프랑스",        "Romance Standard Time",              "Paris"),
        new("리옹",            "프랑스",        "Romance Standard Time",              "Lyon"),
        new("마드리드",        "스페인",        "Romance Standard Time",              "Madrid"),
        new("바르셀로나",      "스페인",        "Romance Standard Time",              "Barcelona"),
        new("로마",            "이탈리아",      "W. Europe Standard Time",            "Rome"),
        new("밀라노",          "이탈리아",      "W. Europe Standard Time",            "Milan"),
        new("런던",            "영국",          "GMT Standard Time",                  "London"),
        new("맨체스터",        "영국",          "GMT Standard Time",                  "Manchester"),
        new("에든버러",        "영국",          "GMT Standard Time",                  "Edinburgh"),
        new("더블린",          "아일랜드",      "GMT Standard Time",                  "Dublin"),
        new("리스본",          "포르투갈",      "GMT Standard Time",                  "Lisbon"),
        new("스톡홀름",        "스웨덴",        "W. Europe Standard Time",            "Stockholm"),
        new("오슬로",          "노르웨이",      "W. Europe Standard Time",            "Oslo"),
        new("코펜하겐",        "덴마크",        "Romance Standard Time",              "Copenhagen"),
        new("레이캬비크",      "아이슬란드",    "Greenwich Standard Time",            "Reykjavik"),
        // 아프리카
        new("카이로",          "이집트",        "Egypt Standard Time",                "Cairo"),
        new("카사블랑카",      "모로코",        "Morocco Standard Time",              "Casablanca"),
        new("라고스",          "나이지리아",    "W. Central Africa Standard Time",    "Lagos"),
        new("나이로비",        "케냐",          "E. Africa Standard Time",            "Nairobi"),
        new("요하네스버그",    "남아프리카공화국","South Africa Standard Time",        "Johannesburg"),
        new("케이프타운",      "남아프리카공화국","South Africa Standard Time",        "Cape Town"),
        new("아디스아바바",    "에티오피아",    "E. Africa Standard Time",            "Addis Ababa"),
        // 북미
        new("뉴욕",            "미국",          "Eastern Standard Time",              "New York"),
        new("워싱턴 DC",       "미국",          "Eastern Standard Time",              "Washington DC"),
        new("보스턴",          "미국",          "Eastern Standard Time",              "Boston"),
        new("마이애미",        "미국",          "Eastern Standard Time",              "Miami"),
        new("애틀란타",        "미국",          "Eastern Standard Time",              "Atlanta"),
        new("시카고",          "미국",          "Central Standard Time",              "Chicago"),
        new("휴스턴",          "미국",          "Central Standard Time",              "Houston"),
        new("댈러스",          "미국",          "Central Standard Time",              "Dallas"),
        new("덴버",            "미국",          "Mountain Standard Time",             "Denver"),
        new("피닉스",          "미국",          "US Mountain Standard Time",          "Phoenix"),
        new("로스앤젤레스",    "미국",          "Pacific Standard Time",              "Los Angeles"),
        new("샌프란시스코",    "미국",          "Pacific Standard Time",              "San Francisco"),
        new("시애틀",          "미국",          "Pacific Standard Time",              "Seattle"),
        new("라스베이거스",    "미국",          "Pacific Standard Time",              "Las Vegas"),
        new("호놀룰루",        "미국",          "Hawaiian Standard Time",             "Honolulu"),
        new("앵커리지",        "미국",          "Alaskan Standard Time",              "Anchorage"),
        new("토론토",          "캐나다",        "Eastern Standard Time",              "Toronto"),
        new("몬트리올",        "캐나다",        "Eastern Standard Time",              "Montreal"),
        new("밴쿠버",          "캐나다",        "Pacific Standard Time",              "Vancouver"),
        new("캘거리",          "캐나다",        "Mountain Standard Time",             "Calgary"),
        new("멕시코시티",      "멕시코",        "Central Standard Time (Mexico)",     "Mexico City"),
        // 중남미
        new("하바나",          "쿠바",          "Cuba Standard Time",                 "Havana"),
        new("보고타",          "콜롬비아",      "SA Pacific Standard Time",           "Bogotá"),
        new("리마",            "페루",          "SA Pacific Standard Time",           "Lima"),
        new("카라카스",        "베네수엘라",    "Venezuela Standard Time",            "Caracas"),
        new("산티아고",        "칠레",          "Pacific SA Standard Time",           "Santiago"),
        new("부에노스아이레스","아르헨티나",    "Argentina Standard Time",            "Buenos Aires"),
        new("상파울루",        "브라질",        "E. South America Standard Time",     "São Paulo"),
        new("리우데자네이루",  "브라질",        "E. South America Standard Time",     "Rio de Janeiro"),
        new("브라질리아",      "브라질",        "E. South America Standard Time",     "Brasília"),
        // 오세아니아
        new("시드니",          "호주",          "AUS Eastern Standard Time",          "Sydney"),
        new("멜버른",          "호주",          "AUS Eastern Standard Time",          "Melbourne"),
        new("브리즈번",        "호주",          "E. Australia Standard Time",         "Brisbane"),
        new("애들레이드",      "호주",          "Cen. Australia Standard Time",       "Adelaide"),
        new("퍼스",            "호주",          "W. Australia Standard Time",         "Perth"),
        new("오클랜드",        "뉴질랜드",      "New Zealand Standard Time",          "Auckland"),
        new("웰링턴",          "뉴질랜드",      "New Zealand Standard Time",          "Wellington"),
    };

    public static IEnumerable<CityInfo> Search(string query) =>
        string.IsNullOrWhiteSpace(query)
            ? Enumerable.Empty<CityInfo>()
            : Cities
                .Where(c =>
                    c.City.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    c.CityEn.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    c.Country.Contains(query, StringComparison.OrdinalIgnoreCase))
                .Take(10);

    public static IEnumerable<string> SearchCountries(string query) =>
        string.IsNullOrWhiteSpace(query)
            ? Enumerable.Empty<string>()
            : Cities
                .Select(c => c.Country)
                .Distinct()
                .Where(c => c.Contains(query, StringComparison.OrdinalIgnoreCase))
                .OrderBy(c => c)
                .Take(10);
}

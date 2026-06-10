#include <string.h>
#include "city_database.h"

/* IANA timezone IDs are used (not Windows TZ IDs) */
const CityInfo city_db[] = {
    /* 대한민국 */
    { "서울",            "대한민국",      "Asia/Seoul",                        "Seoul"          },
    { "부산",            "대한민국",      "Asia/Seoul",                        "Busan"          },
    { "인천",            "대한민국",      "Asia/Seoul",                        "Incheon"        },
    { "대구",            "대한민국",      "Asia/Seoul",                        "Daegu"          },
    { "광주",            "대한민국",      "Asia/Seoul",                        "Gwangju"        },
    { "대전",            "대한민국",      "Asia/Seoul",                        "Daejeon"        },
    { "울산",            "대한민국",      "Asia/Seoul",                        "Ulsan"          },
    { "제주",            "대한민국",      "Asia/Seoul",                        "Jeju"           },
    { "수원",            "대한민국",      "Asia/Seoul",                        "Suwon"          },
    /* 일본 */
    { "도쿄",            "일본",          "Asia/Tokyo",                        "Tokyo"          },
    { "오사카",          "일본",          "Asia/Tokyo",                        "Osaka"          },
    { "나고야",          "일본",          "Asia/Tokyo",                        "Nagoya"         },
    { "삿포로",          "일본",          "Asia/Tokyo",                        "Sapporo"        },
    { "후쿠오카",        "일본",          "Asia/Tokyo",                        "Fukuoka"        },
    { "교토",            "일본",          "Asia/Tokyo",                        "Kyoto"          },
    { "요코하마",        "일본",          "Asia/Tokyo",                        "Yokohama"       },
    /* 중국 */
    { "베이징",          "중국",          "Asia/Shanghai",                     "Beijing"        },
    { "상하이",          "중국",          "Asia/Shanghai",                     "Shanghai"       },
    { "광저우",          "중국",          "Asia/Shanghai",                     "Guangzhou"      },
    { "선전",            "중국",          "Asia/Shanghai",                     "Shenzhen"       },
    { "청두",            "중국",          "Asia/Shanghai",                     "Chengdu"        },
    { "우한",            "중국",          "Asia/Shanghai",                     "Wuhan"          },
    { "항저우",          "중국",          "Asia/Shanghai",                     "Hangzhou"       },
    /* 홍콩·대만·싱가포르 */
    { "홍콩",            "홍콩",          "Asia/Hong_Kong",                    "Hong Kong"      },
    { "마카오",          "마카오",        "Asia/Macau",                        "Macau"          },
    { "타이베이",        "대만",          "Asia/Taipei",                       "Taipei"         },
    { "싱가포르",        "싱가포르",      "Asia/Singapore",                    "Singapore"      },
    /* 동남아시아 */
    { "방콕",            "태국",          "Asia/Bangkok",                      "Bangkok"        },
    { "하노이",          "베트남",        "Asia/Ho_Chi_Minh",                  "Hanoi"          },
    { "호치민",          "베트남",        "Asia/Ho_Chi_Minh",                  "Ho Chi Minh City"},
    { "자카르타",        "인도네시아",    "Asia/Jakarta",                      "Jakarta"        },
    { "발리",            "인도네시아",    "Asia/Makassar",                     "Bali"           },
    { "마닐라",          "필리핀",        "Asia/Manila",                       "Manila"         },
    { "쿠알라룸푸르",    "말레이시아",    "Asia/Kuala_Lumpur",                 "Kuala Lumpur"   },
    { "양곤",            "미얀마",        "Asia/Yangon",                       "Yangon"         },
    /* 남아시아 */
    { "뭄바이",          "인도",          "Asia/Kolkata",                      "Mumbai"         },
    { "델리",            "인도",          "Asia/Kolkata",                      "Delhi"          },
    { "콜카타",          "인도",          "Asia/Kolkata",                      "Kolkata"        },
    { "벵갈루루",        "인도",          "Asia/Kolkata",                      "Bengaluru"      },
    { "첸나이",          "인도",          "Asia/Kolkata",                      "Chennai"        },
    { "카라치",          "파키스탄",      "Asia/Karachi",                      "Karachi"        },
    { "이슬라마바드",    "파키스탄",      "Asia/Karachi",                      "Islamabad"      },
    { "다카",            "방글라데시",    "Asia/Dhaka",                        "Dhaka"          },
    { "콜롬보",          "스리랑카",      "Asia/Colombo",                      "Colombo"        },
    { "카트만두",        "네팔",          "Asia/Kathmandu",                    "Kathmandu"      },
    /* 중앙아시아·중동 */
    { "알마티",          "카자흐스탄",    "Asia/Almaty",                       "Almaty"         },
    { "타슈켄트",        "우즈베키스탄",  "Asia/Tashkent",                     "Tashkent"       },
    { "두바이",          "아랍에미리트",  "Asia/Dubai",                        "Dubai"          },
    { "아부다비",        "아랍에미리트",  "Asia/Dubai",                        "Abu Dhabi"      },
    { "리야드",          "사우디아라비아","Asia/Riyadh",                       "Riyadh"         },
    { "쿠웨이트",        "쿠웨이트",      "Asia/Kuwait",                       "Kuwait"         },
    { "도하",            "카타르",        "Asia/Qatar",                        "Doha"           },
    { "바그다드",        "이라크",        "Asia/Baghdad",                      "Baghdad"        },
    { "테헤란",          "이란",          "Asia/Tehran",                       "Tehran"         },
    { "텔아비브",        "이스라엘",      "Asia/Jerusalem",                    "Tel Aviv"       },
    { "암만",            "요르단",        "Asia/Amman",                        "Amman"          },
    { "베이루트",        "레바논",        "Asia/Beirut",                       "Beirut"         },
    /* 튀르키예·러시아 */
    { "이스탄불",        "튀르키예",      "Europe/Istanbul",                   "Istanbul"       },
    { "앙카라",          "튀르키예",      "Europe/Istanbul",                   "Ankara"         },
    { "모스크바",        "러시아",        "Europe/Moscow",                     "Moscow"         },
    { "상트페테르부르크","러시아",        "Europe/Moscow",                     "St. Petersburg" },
    { "노보시비르스크",  "러시아",        "Asia/Novosibirsk",                  "Novosibirsk"    },
    { "블라디보스토크",  "러시아",        "Asia/Vladivostok",                  "Vladivostok"    },
    { "예카테린부르크",  "러시아",        "Asia/Yekaterinburg",                "Yekaterinburg"  },
    /* 유럽 */
    { "키이우",          "우크라이나",    "Europe/Kyiv",                       "Kyiv"           },
    { "부쿠레슈티",      "루마니아",      "Europe/Bucharest",                  "Bucharest"      },
    { "아테네",          "그리스",        "Europe/Athens",                     "Athens"         },
    { "소피아",          "불가리아",      "Europe/Sofia",                      "Sofia"          },
    { "헬싱키",          "핀란드",        "Europe/Helsinki",                   "Helsinki"       },
    { "리가",            "라트비아",      "Europe/Riga",                       "Riga"           },
    { "탈린",            "에스토니아",    "Europe/Tallinn",                    "Tallinn"        },
    { "빌뉴스",          "리투아니아",    "Europe/Vilnius",                    "Vilnius"        },
    { "바르샤바",        "폴란드",        "Europe/Warsaw",                     "Warsaw"         },
    { "프라하",          "체코",          "Europe/Prague",                     "Prague"         },
    { "부다페스트",      "헝가리",        "Europe/Budapest",                   "Budapest"       },
    { "빈",              "오스트리아",    "Europe/Vienna",                     "Vienna"         },
    { "취리히",          "스위스",        "Europe/Zurich",                     "Zurich"         },
    { "베를린",          "독일",          "Europe/Berlin",                     "Berlin"         },
    { "프랑크푸르트",    "독일",          "Europe/Berlin",                     "Frankfurt"      },
    { "뮌헨",            "독일",          "Europe/Berlin",                     "Munich"         },
    { "함부르크",        "독일",          "Europe/Berlin",                     "Hamburg"        },
    { "암스테르담",      "네덜란드",      "Europe/Amsterdam",                  "Amsterdam"      },
    { "브뤼셀",          "벨기에",        "Europe/Brussels",                   "Brussels"       },
    { "파리",            "프랑스",        "Europe/Paris",                      "Paris"          },
    { "리옹",            "프랑스",        "Europe/Paris",                      "Lyon"           },
    { "마드리드",        "스페인",        "Europe/Madrid",                     "Madrid"         },
    { "바르셀로나",      "스페인",        "Europe/Madrid",                     "Barcelona"      },
    { "로마",            "이탈리아",      "Europe/Rome",                       "Rome"           },
    { "밀라노",          "이탈리아",      "Europe/Rome",                       "Milan"          },
    { "런던",            "영국",          "Europe/London",                     "London"         },
    { "맨체스터",        "영국",          "Europe/London",                     "Manchester"     },
    { "에든버러",        "영국",          "Europe/London",                     "Edinburgh"      },
    { "더블린",          "아일랜드",      "Europe/Dublin",                     "Dublin"         },
    { "리스본",          "포르투갈",      "Europe/Lisbon",                     "Lisbon"         },
    { "스톡홀름",        "스웨덴",        "Europe/Stockholm",                  "Stockholm"      },
    { "오슬로",          "노르웨이",      "Europe/Oslo",                       "Oslo"           },
    { "코펜하겐",        "덴마크",        "Europe/Copenhagen",                 "Copenhagen"     },
    { "레이캬비크",      "아이슬란드",    "Atlantic/Reykjavik",                "Reykjavik"      },
    /* 아프리카 */
    { "카이로",          "이집트",        "Africa/Cairo",                      "Cairo"          },
    { "카사블랑카",      "모로코",        "Africa/Casablanca",                 "Casablanca"     },
    { "라고스",          "나이지리아",    "Africa/Lagos",                      "Lagos"          },
    { "나이로비",        "케냐",          "Africa/Nairobi",                    "Nairobi"        },
    { "요하네스버그",    "남아프리카공화국","Africa/Johannesburg",             "Johannesburg"   },
    { "케이프타운",      "남아프리카공화국","Africa/Johannesburg",             "Cape Town"      },
    { "아디스아바바",    "에티오피아",    "Africa/Addis_Ababa",                "Addis Ababa"    },
    /* 북미 */
    { "뉴욕",            "미국",          "America/New_York",                  "New York"       },
    { "워싱턴 DC",       "미국",          "America/New_York",                  "Washington DC"  },
    { "보스턴",          "미국",          "America/New_York",                  "Boston"         },
    { "마이애미",        "미국",          "America/New_York",                  "Miami"          },
    { "시카고",          "미국",          "America/Chicago",                   "Chicago"        },
    { "휴스턴",          "미국",          "America/Chicago",                   "Houston"        },
    { "댈러스",          "미국",          "America/Chicago",                   "Dallas"         },
    { "덴버",            "미국",          "America/Denver",                    "Denver"         },
    { "피닉스",          "미국",          "America/Phoenix",                   "Phoenix"        },
    { "로스앤젤레스",    "미국",          "America/Los_Angeles",               "Los Angeles"    },
    { "샌프란시스코",    "미국",          "America/Los_Angeles",               "San Francisco"  },
    { "시애틀",          "미국",          "America/Los_Angeles",               "Seattle"        },
    { "라스베이거스",    "미국",          "America/Los_Angeles",               "Las Vegas"      },
    { "호놀룰루",        "미국",          "Pacific/Honolulu",                  "Honolulu"       },
    { "앵커리지",        "미국",          "America/Anchorage",                 "Anchorage"      },
    { "토론토",          "캐나다",        "America/Toronto",                   "Toronto"        },
    { "몬트리올",        "캐나다",        "America/Toronto",                   "Montreal"       },
    { "밴쿠버",          "캐나다",        "America/Vancouver",                 "Vancouver"      },
    { "캘거리",          "캐나다",        "America/Edmonton",                  "Calgary"        },
    { "멕시코시티",      "멕시코",        "America/Mexico_City",               "Mexico City"    },
    /* 중남미 */
    { "하바나",          "쿠바",          "America/Havana",                    "Havana"         },
    { "보고타",          "콜롬비아",      "America/Bogota",                    "Bogotá"         },
    { "리마",            "페루",          "America/Lima",                      "Lima"           },
    { "카라카스",        "베네수엘라",    "America/Caracas",                   "Caracas"        },
    { "산티아고",        "칠레",          "America/Santiago",                  "Santiago"       },
    { "부에노스아이레스","아르헨티나",    "America/Argentina/Buenos_Aires",    "Buenos Aires"   },
    { "상파울루",        "브라질",        "America/Sao_Paulo",                 "São Paulo"      },
    { "리우데자네이루",  "브라질",        "America/Sao_Paulo",                 "Rio de Janeiro" },
    { "브라질리아",      "브라질",        "America/Sao_Paulo",                 "Brasília"       },
    /* 오세아니아 */
    { "시드니",          "호주",          "Australia/Sydney",                  "Sydney"         },
    { "멜버른",          "호주",          "Australia/Melbourne",               "Melbourne"      },
    { "브리즈번",        "호주",          "Australia/Brisbane",                "Brisbane"       },
    { "애들레이드",      "호주",          "Australia/Adelaide",                "Adelaide"       },
    { "퍼스",            "호주",          "Australia/Perth",                   "Perth"          },
    { "오클랜드",        "뉴질랜드",      "Pacific/Auckland",                  "Auckland"       },
    { "웰링턴",          "뉴질랜드",      "Pacific/Auckland",                  "Wellington"     },
    /* 아제르바이잔·조지아·아르메니아 */
    { "바쿠",            "아제르바이잔",  "Asia/Baku",                         "Baku"           },
    { "트빌리시",        "조지아",        "Asia/Tbilisi",                      "Tbilisi"        },
    { "예레반",          "아르메니아",    "Asia/Yerevan",                      "Yerevan"        },
};

const int city_db_count = (int)(sizeof(city_db) / sizeof(city_db[0]));

GPtrArray *city_search(const char *query, int max_results)
{
    GPtrArray *result = g_ptr_array_new();
    if (!query || !query[0]) return result;

    gchar *q_lower = g_utf8_casefold(query, -1);

    for (int i = 0; i < city_db_count && (int)result->len < max_results; i++) {
        const CityInfo *c = &city_db[i];

        gchar *city_l    = g_utf8_casefold(c->city,    -1);
        gchar *country_l = g_utf8_casefold(c->country, -1);
        gchar *cityen_l  = g_utf8_casefold(c->city_en, -1);

        if (strstr(city_l, q_lower) ||
            strstr(country_l, q_lower) ||
            strstr(cityen_l, q_lower)) {
            g_ptr_array_add(result, (gpointer)c);
        }

        g_free(city_l);
        g_free(country_l);
        g_free(cityen_l);
    }

    g_free(q_lower);
    return result;
}

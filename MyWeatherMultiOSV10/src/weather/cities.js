export const CITIES = [
  city("KR", "대한민국", "South Korea", "서울", "Seoul", 37.5665, 126.978),
  city("KR", "대한민국", "South Korea", "부산", "Busan", 35.1796, 129.0756),
  city("KR", "대한민국", "South Korea", "인천", "Incheon", 37.4563, 126.7052),
  city("KR", "대한민국", "South Korea", "대구", "Daegu", 35.8714, 128.6014),
  city("KR", "대한민국", "South Korea", "대전", "Daejeon", 36.3504, 127.3845),
  city("KR", "대한민국", "South Korea", "광주", "Gwangju", 35.1595, 126.8526),
  city("KR", "대한민국", "South Korea", "제주", "Jeju", 33.4996, 126.5312),
  city("KR", "대한민국", "South Korea", "수원", "Suwon", 37.2636, 127.0286),
  city("KR", "대한민국", "South Korea", "울산", "Ulsan", 35.5384, 129.3114),
  city("JP", "일본", "Japan", "도쿄", "Tokyo", 35.6762, 139.6503),
  city("JP", "일본", "Japan", "오사카", "Osaka", 34.6937, 135.5023),
  city("JP", "일본", "Japan", "교토", "Kyoto", 35.0116, 135.7681),
  city("JP", "일본", "Japan", "삿포로", "Sapporo", 43.0618, 141.3545),
  city("CN", "중국", "China", "베이징", "Beijing", 39.9042, 116.4074),
  city("CN", "중국", "China", "상하이", "Shanghai", 31.2304, 121.4737),
  city("TW", "대만", "Taiwan", "타이베이", "Taipei", 25.033, 121.5654),
  city("US", "미국", "United States", "뉴욕", "New York", 40.7128, -74.006),
  city("US", "미국", "United States", "로스앤젤레스", "Los Angeles", 34.0522, -118.2437),
  city("US", "미국", "United States", "시카고", "Chicago", 41.8781, -87.6298),
  city("US", "미국", "United States", "시애틀", "Seattle", 47.6062, -122.3321),
  city("GB", "영국", "United Kingdom", "런던", "London", 51.5074, -0.1278),
  city("FR", "프랑스", "France", "파리", "Paris", 48.8566, 2.3522),
  city("DE", "독일", "Germany", "베를린", "Berlin", 52.52, 13.405),
  city("IT", "이탈리아", "Italy", "로마", "Rome", 41.9028, 12.4964),
  city("ES", "스페인", "Spain", "마드리드", "Madrid", 40.4168, -3.7038),
  city("AU", "호주", "Australia", "시드니", "Sydney", -33.8688, 151.2093),
  city("CA", "캐나다", "Canada", "토론토", "Toronto", 43.6532, -79.3832),
  city("BR", "브라질", "Brazil", "상파울루", "Sao Paulo", -23.5558, -46.6396),
  city("IN", "인도", "India", "뉴델리", "New Delhi", 28.6139, 77.209),
  city("RU", "러시아", "Russia", "모스크바", "Moscow", 55.7558, 37.6173),
  city("SG", "싱가포르", "Singapore", "싱가포르", "Singapore", 1.3521, 103.8198),
  city("TH", "태국", "Thailand", "방콕", "Bangkok", 13.7563, 100.5018),
  city("VN", "베트남", "Vietnam", "하노이", "Hanoi", 21.0278, 105.8342),
  city("PH", "필리핀", "Philippines", "마닐라", "Manila", 14.5995, 120.9842),
  city("ID", "인도네시아", "Indonesia", "자카르타", "Jakarta", -6.2088, 106.8456),
  city("MY", "말레이시아", "Malaysia", "쿠알라룸푸르", "Kuala Lumpur", 3.139, 101.6869),
  city("AE", "아랍에미리트", "United Arab Emirates", "두바이", "Dubai", 25.2048, 55.2708),
  city("EG", "이집트", "Egypt", "카이로", "Cairo", 30.0444, 31.2357),
  city("ZA", "남아프리카", "South Africa", "요하네스버그", "Johannesburg", -26.2041, 28.0473),
  city("MX", "멕시코", "Mexico", "멕시코시티", "Mexico City", 19.4326, -99.1332),
  city("AR", "아르헨티나", "Argentina", "부에노스아이레스", "Buenos Aires", -34.6037, -58.3816),
  city("TR", "튀르키예", "Turkey", "이스탄불", "Istanbul", 41.0082, 28.9784),
  city("GR", "그리스", "Greece", "아테네", "Athens", 37.9838, 23.7275),
  city("NL", "네덜란드", "Netherlands", "암스테르담", "Amsterdam", 52.3676, 4.9041),
  city("SE", "스웨덴", "Sweden", "스톡홀름", "Stockholm", 59.3293, 18.0686),
  city("NO", "노르웨이", "Norway", "오슬로", "Oslo", 59.9139, 10.7522),
  city("FI", "핀란드", "Finland", "헬싱키", "Helsinki", 60.1699, 24.9384),
  city("CH", "스위스", "Switzerland", "취리히", "Zurich", 47.3769, 8.5417),
  city("NZ", "뉴질랜드", "New Zealand", "오클랜드", "Auckland", -36.8509, 174.7645),
  city("HK", "홍콩", "Hong Kong", "홍콩", "Hong Kong", 22.3193, 114.1694),
];

export function countries() {
  const map = new Map();
  for (const entry of CITIES) {
    if (!map.has(entry.countryCode)) map.set(entry.countryCode, entry);
  }
  return [...map.values()];
}

export function filterCities(list, countryCode, query) {
  const q = String(query || "").trim().toLowerCase();
  return list.filter((entry) => {
    if (countryCode && entry.countryCode !== countryCode) return false;
    if (!q) return true;
    return [entry.cityEn, entry.cityKo, entry.countryEn, entry.countryKo].some((value) =>
      String(value).toLowerCase().includes(q),
    );
  });
}

export function findCity(countryCode, cityEn) {
  return CITIES.find((entry) => entry.countryCode === countryCode && entry.cityEn === cityEn) || null;
}

function city(countryCode, countryKo, countryEn, cityKo, cityEn, lat, lon) {
  return { countryCode, countryKo, countryEn, cityKo, cityEn, lat, lon };
}

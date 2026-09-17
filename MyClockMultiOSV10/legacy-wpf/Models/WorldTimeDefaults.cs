namespace MyClockWinV10.Models;

public static class WorldTimeDefaults
{
    public static IReadOnlyList<WorldTimeCityDto> Cities { get; } =
    [
        new() { City = "서울",         Region = "대한민국",  TimeZoneId = "Korea Standard Time" },
        new() { City = "도쿄",         Region = "일본",      TimeZoneId = "Tokyo Standard Time" },
        new() { City = "베이징",       Region = "중국",      TimeZoneId = "China Standard Time" },
        new() { City = "싱가포르",     Region = "싱가포르",  TimeZoneId = "Singapore Standard Time" },
        new() { City = "두바이",       Region = "UAE",       TimeZoneId = "Arabian Standard Time" },
        new() { City = "모스크바",     Region = "러시아",    TimeZoneId = "Russian Standard Time" },
        new() { City = "파리",         Region = "프랑스",    TimeZoneId = "Romance Standard Time" },
        new() { City = "런던",         Region = "영국",      TimeZoneId = "GMT Standard Time" },
        new() { City = "뉴욕",         Region = "미국 동부", TimeZoneId = "Eastern Standard Time" },
        new() { City = "시카고",       Region = "미국 중부", TimeZoneId = "Central Standard Time" },
        new() { City = "로스앤젤레스", Region = "미국 서부", TimeZoneId = "Pacific Standard Time" },
        new() { City = "시드니",       Region = "호주",      TimeZoneId = "AUS Eastern Standard Time" },
        new() { City = "호놀룰루",     Region = "미국 하와이", TimeZoneId = "Hawaiian Standard Time" },
    ];
}

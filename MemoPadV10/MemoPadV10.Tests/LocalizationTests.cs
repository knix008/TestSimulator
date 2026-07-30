namespace MemoPadV10.Tests;

public class LocalizationTests
{
    [Fact]
    public void Loc_SwitchesBetweenKoreanAndEnglish()
    {
        Loc.Language = AppLanguage.Korean;
        Assert.Equal("새 메모", Loc.T("main.add"));

        Loc.Language = AppLanguage.English;
        Assert.Equal("New memo", Loc.T("main.add"));

        Loc.Language = AppLanguage.Korean;
    }
}

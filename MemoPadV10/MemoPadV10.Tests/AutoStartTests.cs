namespace MemoPadV10.Tests;

public class AutoStartTests
{
    [Fact]
    public void BuildRunCommand_IncludesAutostartArg()
    {
        string command = AutoStart.BuildRunCommand();
        Assert.Contains(AutoStart.StartupArg, command, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("\"", command);
    }

    [Fact]
    public void StartupArg_IsAutostart()
    {
        Assert.Equal("--autostart", AutoStart.StartupArg);
    }

    [Fact]
    public void IsEnabled_DoesNotThrow()
    {
        // 레지스트리/어셈블리 문제가 있어도 예외 없이 false/true만 반환해야 합니다.
        bool _ = AutoStart.IsEnabled();
    }

    [Fact]
    public void SetEnabled_RoundTrip_DoesNotThrow()
    {
        bool before = AutoStart.IsEnabled();
        try
        {
            AutoStart.SetEnabled(true);
            Assert.True(AutoStart.IsEnabled());
            AutoStart.SetEnabled(false);
            Assert.False(AutoStart.IsEnabled());
        }
        finally
        {
            AutoStart.SetEnabled(before);
        }
    }
}

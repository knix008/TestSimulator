namespace MemoPadV10.Tests;

public class ErrorReportTests
{
    [Fact]
    public void Format_IncludesExceptionTypeMessageAndInner()
    {
        Exception inner = new InvalidOperationException("inner-msg");
        Exception outer = new ApplicationException("outer-msg", inner);

        string text = ErrorReport.Format(outer, "UnitTest");

        Assert.Contains("UnitTest", text);
        Assert.Contains("ApplicationException", text);
        Assert.Contains("outer-msg", text);
        Assert.Contains("InvalidOperationException", text);
        Assert.Contains("inner-msg", text);
        Assert.Contains("Inner exception", text);
    }

    [Fact]
    public void Report_WithSuppressUi_DoesNotThrow()
    {
        using var isolation = AppDataIsolation.Begin();
        Assert.True(AppPaths.SuppressUiDialogs);

        ErrorReport.Report(new Exception("suppressed-ui-test"), "UnitTest");
    }

    [Fact]
    public void ErrorDialog_ShowsCopyableDetails()
    {
        using var isolation = AppDataIsolation.Begin();
        // SuppressUiDialogs only affects ErrorReport.Show; dialog itself can still be constructed.
        using ErrorDialog dialog = new("line1\nline2", isTerminating: false);
        Assert.Equal(Loc.T("error.dialog.title"), dialog.Text);
        Assert.Contains(dialog.Controls.OfType<TextBox>(), t => t.Text.Contains("line1"));
        Assert.Contains(dialog.Controls.OfType<Panel>().SelectMany(p => p.Controls.OfType<Button>()),
            b => b.Text == Loc.T("error.dialog.copy"));
    }
}

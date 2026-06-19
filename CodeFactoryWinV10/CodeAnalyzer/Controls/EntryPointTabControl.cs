namespace CodeAnalyzer.Controls;

internal static class EntryPointTabControl
{
    public static NavigationTabControl Create() => new();
}

/// <summary>탭이 많아도 모두 보이도록 여러 줄로 줄바꿈하는 TabControl.</summary>
internal sealed class NavigationTabControl : TabControl
{
    public NavigationTabControl()
    {
        Dock = DockStyle.Fill;
        Multiline = true;
        SizeMode = TabSizeMode.Normal;
        Padding = new Point(6, 4);
    }
}

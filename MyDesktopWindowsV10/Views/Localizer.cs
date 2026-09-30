using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using MyDesktop.Services;

namespace MyDesktop.Views;

/// <summary>
/// Swaps the English text baked into the XAML for whatever the table says, so the markup stays
/// plain English and there is no second copy of every phrase to keep in sync.
/// </summary>
internal static class Localizer
{
    /// <summary>
    /// The English original, remembered on the element itself. Once the text on screen is Korean it
    /// is no longer a key in the table, so without this a switch back to English would have nothing
    /// to look up and the window would stay Korean.
    /// </summary>
    private static readonly DependencyProperty OriginalTextProperty =
        DependencyProperty.RegisterAttached("OriginalText", typeof(string), typeof(Localizer));

    private static readonly DependencyProperty OriginalTipProperty =
        DependencyProperty.RegisterAttached("OriginalTip", typeof(string), typeof(Localizer));

    /// <summary>
    /// Walks a window and translates the text it finds. Only realised visuals are reached, which is
    /// what we want: the text that needs this is the fixed text in the markup.
    /// </summary>
    public static void Apply(DependencyObject node)
    {
        switch (node)
        {
            // Writing to a bound property would replace the binding with a fixed value, and the
            // element would never follow its data again. Those already say what the data says.
            case TextBlock text when text.Inlines.Count == 0 && !IsBound(text, TextBlock.TextProperty):
                Swap(text, OriginalTextProperty, text.Text, translated => text.Text = translated);
                break;

            case ContentControl { Content: string content } control
                when !IsBound(control, ContentControl.ContentProperty):
                Swap(control, OriginalTextProperty, content, translated => control.Content = translated);
                break;
        }

        if (node is FrameworkElement { ToolTip: string tip } element
            && !IsBound(element, FrameworkElement.ToolTipProperty))
        {
            Swap(element, OriginalTipProperty, tip, translated => element.ToolTip = translated);
        }

        var children = VisualTreeHelper.GetChildrenCount(node);
        for (var index = 0; index < children; index++)
        {
            Apply(VisualTreeHelper.GetChild(node, index));
        }
    }

    private static bool IsBound(DependencyObject node, DependencyProperty property)
        => BindingOperations.IsDataBound(node, property);

    /// <summary>
    /// An element is only taken over once there is really something to translate. Text the table has
    /// never heard of is left alone and, more to the point, not remembered: the roll button spends
    /// its life being set to an arrow by the fence, and an element we had remembered would have that
    /// arrow put back to whichever one it happened to be showing the first time we walked past.
    /// </summary>
    private static void Swap(DependencyObject node, DependencyProperty slot, string current, Action<string> apply)
    {
        var known = node.GetValue(slot) as string;
        var original = known ?? current;
        var translated = Strings.T(original);

        if (known is null && translated == original)
        {
            return;
        }

        node.SetValue(slot, original);
        apply(translated);
    }
}

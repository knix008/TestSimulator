namespace MyGitWinV10.App.Controls;

/// <summary>
/// Drops a ComboBox's recent-URL list down as soon as it gets focus (even with nothing typed),
/// and lets the user delete the highlighted entry from that list with the Delete key.
/// </summary>
public static class RecentUrlComboBoxBehavior
{
    public static void Attach(ComboBox comboBox, Func<IReadOnlyList<string>> getRecentUrls, Action<string> removeUrl)
    {
        comboBox.Enter += (_, _) =>
        {
            if (comboBox.Items.Count > 0)
            {
                comboBox.DroppedDown = true;
            }
        };

        comboBox.KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Delete || !comboBox.DroppedDown || comboBox.SelectedIndex < 0)
            {
                return;
            }

            if (comboBox.Items[comboBox.SelectedIndex] is not string url)
            {
                return;
            }

            e.Handled = true;
            e.SuppressKeyPress = true;

            removeUrl(url);
            comboBox.Items.RemoveAt(comboBox.SelectedIndex);
            comboBox.AutoCompleteCustomSource = ToAutoCompleteSource(getRecentUrls());

            if (comboBox.Items.Count > 0)
            {
                comboBox.DroppedDown = true;
            }
        };
    }

    private static AutoCompleteStringCollection ToAutoCompleteSource(IReadOnlyList<string> urls)
    {
        var source = new AutoCompleteStringCollection();
        source.AddRange(urls.ToArray());
        return source;
    }
}

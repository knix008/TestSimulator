namespace MyGitWinV10.App.Controls;

public static class ListViewStyles
{
    public static void ApplyTableStyle(ListView listView)
    {
        listView.View = View.Details;
        listView.FullRowSelect = true;
        listView.GridLines = true;
        listView.HeaderStyle = ColumnHeaderStyle.Nonclickable;
        listView.BorderStyle = BorderStyle.None;
        listView.BackColor = Color.FromArgb(250, 250, 251);
        listView.MultiSelect = false;
        listView.HideSelection = false;
    }
}

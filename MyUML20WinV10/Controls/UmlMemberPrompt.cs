using MyUML20WinV10.Models;

namespace MyUML20WinV10.Controls;

internal static class UmlMemberPrompt
{
    public static (string? name, UmlVisibility visibility) Show(
        IWin32Window owner,
        string title,
        string defaultName,
        UmlVisibility defaultVisibility)
    {
        using var form = new Form
        {
            Text = title,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(380, 168),
            MinimizeBox = false,
            MaximizeBox = false,
            ShowInTaskbar = false,
        };

        var nameLbl = new Label { Text = "이름", Location = new Point(12, 12), AutoSize = true };
        var nameBox = new TextBox
        {
            Location = new Point(12, 32),
            Size = new Size(356, 24),
            Text = defaultName,
        };

        var visLbl = new Label { Text = "가시성", Location = new Point(12, 68), AutoSize = true };
        var visCombo = new ComboBox
        {
            Location = new Point(12, 88),
            Size = new Size(356, 24),
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        visCombo.Items.AddRange(new object[] { "+ Public", "- Private", "# Protected", "~ Package" });
        visCombo.SelectedIndex = defaultVisibility switch
        {
            UmlVisibility.Public => 0,
            UmlVisibility.Private => 1,
            UmlVisibility.Protected => 2,
            UmlVisibility.Package => 3,
            _ => 0,
        };

        var ok = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Location = new Point(212, 128),
            Size = new Size(75, 28),
        };
        var cancel = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Location = new Point(293, 128),
            Size = new Size(75, 28),
        };

        form.Controls.AddRange(new Control[] { nameLbl, nameBox, visLbl, visCombo, ok, cancel });
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        if (form.ShowDialog(owner) != DialogResult.OK)
            return (null, defaultVisibility);

        var vis = visCombo.SelectedIndex switch
        {
            0 => UmlVisibility.Public,
            1 => UmlVisibility.Private,
            2 => UmlVisibility.Protected,
            3 => UmlVisibility.Package,
            _ => defaultVisibility,
        };

        return (nameBox.Text, vis);
    }
}

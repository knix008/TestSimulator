using System.Drawing;

namespace RemoteDesktopWinV10.App;

/// <summary>프로필 저장 시 기존 프로필 목록에서 선택하거나 새 이름을 입력하는 다이얼로그.</summary>
internal sealed class SaveProfileDialog : Form
{
    public string ProfileName { get; private set; } = "";

    public SaveProfileDialog(IReadOnlyList<string> existingNames, string defaultName)
    {
        Text = "프로필 저장";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = false;
        Font = UiTheme.UiFont;
        BackColor = UiTheme.BgApp;
        ForeColor = UiTheme.TextPrimary;
        ClientSize = new Size(440, 210);

        // ── 기존 프로필 목록 ──────────────────────────────────
        var labelList = new Label
        {
            Text = "기존 프로필 (선택하면 이름 칸에 자동 입력됩니다):",
            Location = new Point(12, 12),
            AutoSize = true,
            ForeColor = UiTheme.TextMuted,
        };

        var profileList = new ListBox
        {
            Location = new Point(12, 32),
            Size = new Size(416, 90),
            Font = UiTheme.UiFont,
        };
        UiTheme.StyleListBox(profileList);
        foreach (var name in existingNames)
            profileList.Items.Add(name);

        // ── 저장 이름 입력 ────────────────────────────────────
        var labelName = new Label
        {
            Text = "저장 이름:",
            Location = new Point(12, 134),
            AutoSize = true,
            ForeColor = UiTheme.TextMuted,
        };

        var nameText = new TextBox
        {
            Location = new Point(80, 130),
            Width = 348,
            Text = defaultName,
        };
        UiTheme.StyleTextBox(nameText);

        // ── 버튼 ──────────────────────────────────────────────
        var okBtn = new Button
        {
            Text = "저장",
            Location = new Point(353, 172),
            Width = 75,
            Height = 28,
        };
        var cancelBtn = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Location = new Point(268, 172),
            Width = 75,
            Height = 28,
        };
        UiTheme.StylePrimaryButton(okBtn);
        UiTheme.StyleSecondaryButton(cancelBtn);

        AcceptButton = okBtn;
        CancelButton = cancelBtn;

        // 목록 선택 → 이름 칸 자동 채우기
        profileList.SelectedIndexChanged += (_, _) =>
        {
            if (profileList.SelectedItem is string selected)
                nameText.Text = selected;
        };
        profileList.DoubleClick += (_, _) =>
        {
            if (profileList.SelectedItem is string selected)
            {
                nameText.Text = selected;
                okBtn.PerformClick();
            }
        };

        okBtn.Click += (_, _) =>
        {
            var name = nameText.Text.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                MessageBox.Show(this, "프로필 이름을 입력하세요.", Text,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                nameText.Focus();
                return;
            }
            ProfileName = name;
            DialogResult = DialogResult.OK;
        };

        Controls.AddRange(new Control[]
        {
            labelList, profileList, labelName, nameText, okBtn, cancelBtn,
        });

        ActiveControl = nameText;
    }
}

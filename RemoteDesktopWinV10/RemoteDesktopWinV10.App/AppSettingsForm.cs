namespace RemoteDesktopWinV10.App;

/// <summary>메인 창 메뉴·툴바 표시 옵션(ui.json).</summary>
public partial class AppSettingsForm : Form
{
    public AppSettingsForm()
    {
        InitializeComponent();
        UiTheme.ApplyDialogChrome(this);
        UiTheme.StyleGroupBox(groupMenu);
        UiTheme.StyleLabelMuted(labelHint);
        UiTheme.StyleCheckBox(checkShowViewMenu, UiTheme.BgPanel);
        UiTheme.StyleCheckBox(checkShowDataFolderItem, UiTheme.BgPanel);
        UiTheme.StylePrimaryButton(buttonOk);
        UiTheme.StyleSecondaryButton(buttonCancel);
        var s = UiSettingsStore.Load();
        checkShowViewMenu.Checked = s.ShowViewMenu;
        checkShowDataFolderItem.Checked = s.ShowOpenDataFolderMenuItem;
    }

    private void buttonOk_Click(object sender, EventArgs e)
    {
        try
        {
            var s = UiSettingsStore.Load();
            s.ShowViewMenu = checkShowViewMenu.Checked;
            s.ShowOpenDataFolderMenuItem = checkShowDataFolderItem.Checked;
            UiSettingsStore.Save(s);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                ExceptionMessageFormatter.Format(ex, "설정 파일을 저장하지 못했습니다."),
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        DialogResult = DialogResult.OK;
    }

    private void buttonCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
    }
}

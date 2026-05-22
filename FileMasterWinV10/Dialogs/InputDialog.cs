using FileMasterWinV10.Helpers;

namespace FileMasterWinV10.Dialogs;

public partial class InputDialog : Form
{
    public string InputText => inputBox.Text;

    public InputDialog() : this("입력", "이름:", "")
    {
    }

    public InputDialog(string title, string label, string defaultText = "")
    {
        InitializeComponent();
        Text = title;
        promptLabel.Text = label;
        inputBox.Text = defaultText;

        if (!AppIconHelper.IsDesignMode(this))
        {
            UiTheme.ApplyForm(this);
            UiTheme.StylePrimaryButton(okButton);
            UiTheme.StyleSecondaryButton(cancelButton);
            promptLabel.ForeColor = UiTheme.TextPrimary;
            inputBox.SelectAll();
        }
    }
}

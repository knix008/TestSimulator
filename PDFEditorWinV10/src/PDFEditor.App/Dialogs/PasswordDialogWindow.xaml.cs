using System.Windows;

namespace PDFEditor.App.Dialogs;

public partial class PasswordDialogWindow : Window
{
    public string? EnteredPassword { get; private set; }

    public PasswordDialogWindow(string fileName, bool invalidPassword)
    {
        InitializeComponent();
        MessageTextBlock.Text = $"암호화된 PDF입니다.\n파일: {fileName}";
        if (invalidPassword)
        {
            ErrorTextBlock.Text = "암호가 올바르지 않습니다. 다시 입력해주세요.";
            ErrorTextBlock.Visibility = Visibility.Visible;
        }

        Loaded += (_, _) => PasswordBox.Focus();
    }

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        EnteredPassword = PasswordBox.Password;
        DialogResult = true;
        Close();
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}

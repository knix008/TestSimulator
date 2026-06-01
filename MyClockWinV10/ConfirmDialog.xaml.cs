using System.Windows;
using System.Windows.Input;

namespace MyClockWinV10;

public partial class ConfirmDialog : Window
{
    public bool Confirmed { get; private set; }

    public ConfirmDialog(string title, string message, Window? owner = null)
    {
        Owner = owner;
        InitializeComponent();
        TitleText.Text   = title;
        MessageText.Text = message;
    }

    private void Yes_Click(object sender, RoutedEventArgs e)
    {
        Confirmed    = true;
        DialogResult = true;
    }

    private void No_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
            DragMove();
    }
}

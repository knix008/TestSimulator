namespace MyWorkspace.Win.Forms;

public partial class InputDialogForm : Form
{
    public string InputText => txtInput.Text.Trim();

    public InputDialogForm(string title, string prompt, string? initialText = null)
    {
        InitializeComponent();
        ImeMode = ImeMode.NoControl;
        AppTheme.ApplyStandardDialog(this);
        AppTheme.StyleNameTextBox(txtInput);
        Text = title;
        lblPrompt.Text = prompt;
        if (!string.IsNullOrEmpty(initialText))
            txtInput.Text = initialText;
        Shown += (_, _) => BeginInvoke(() => ImeInputHelper.FocusNameTextBox(txtInput));
        ApplyLocalization();
    }

    private void ApplyLocalization()
    {
        btnOk.Text = Localization.Get(K.ButtonOk);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private void btnOk_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtInput.Text))
        {
            MessageBox.Show(Localization.Get(K.DialogInputRequired), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }
}

namespace MyWorkspace.Win.Forms;



public partial class ErrorDetailForm : Form

{

    private readonly string _details;



    public ErrorDetailForm(string title, string summary, string details)

    {

        InitializeComponent();

        AppTheme.ApplyStandardDialog(this);

        AppTheme.StyleTextBox(txtDetails);
        AppTheme.StyleSecondaryButton(btnCopy);

        txtDetails.BackColor = AppTheme.Background;

        txtDetails.Font = new Font("Consolas", 9F);

        Text = title;

        lblSummary.Text = Localization.TranslateServiceMessage(summary);

        txtDetails.Text = details;

        _details = details;

        ApplyLocalization();

    }



    private void ApplyLocalization()

    {

        btnCopy.Text = Localization.Get(K.ButtonCopy);

        btnClose.Text = Localization.Get(K.ButtonClose);

    }



    public static void Show(IWin32Window? owner, string title, Exception exception)

    {

        Show(

            owner,

            title,

            ExceptionDetailFormatter.GetSummary(exception),

            ExceptionDetailFormatter.Format(exception));

    }



    public static void Show(IWin32Window? owner, string title, string summary, string details)

    {

        using var form = new ErrorDetailForm(title, summary, details);

        form.ShowDialog(owner);

    }



    private void btnCopy_Click(object sender, EventArgs e)

    {

        if (string.IsNullOrEmpty(_details))

            return;



        Clipboard.SetText(_details);

        btnCopy.Text = Localization.Get(K.ButtonCopied);

    }



    private void btnClose_Click(object sender, EventArgs e)

    {

        DialogResult = DialogResult.OK;

        Close();

    }

}


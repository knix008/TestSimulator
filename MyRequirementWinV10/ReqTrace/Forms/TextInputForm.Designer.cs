namespace ReqTrace.Forms;

partial class TextInputForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private Label lblPrompt;
    private TextBox txtValue;
    private Button btnOk;
    private Button btnCancel;

    private void InitializeComponent()
    {
        lblPrompt = new Label();
        txtValue = new TextBox();
        btnOk = new Button();
        btnCancel = new Button();
        SuspendLayout();
        // 
        // lblPrompt
        // 
        lblPrompt.AutoSize = true;
        lblPrompt.Location = new Point(10, 12);
        lblPrompt.Name = "lblPrompt";
        lblPrompt.Size = new Size(38, 15);
        lblPrompt.TabIndex = 0;
        lblPrompt.Text = "Label:";
        // 
        // txtValue
        // 
        txtValue.Location = new Point(10, 34);
        txtValue.Name = "txtValue";
        txtValue.Size = new Size(340, 23);
        txtValue.TabIndex = 1;
        // 
        // btnOk
        // 
        btnOk.DialogResult = DialogResult.OK;
        btnOk.Location = new Point(190, 70);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(75, 25);
        btnOk.TabIndex = 2;
        btnOk.Text = "OK";
        btnOk.UseVisualStyleBackColor = true;
        btnOk.Click += btnOk_Click;
        // 
        // btnCancel
        // 
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Location = new Point(275, 70);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(75, 25);
        btnCancel.TabIndex = 3;
        btnCancel.Text = "Cancel";
        btnCancel.UseVisualStyleBackColor = true;
        // 
        // TextInputForm
        // 
        AcceptButton = btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = btnCancel;
        ClientSize = new Size(360, 110);
        Controls.Add(btnCancel);
        Controls.Add(btnOk);
        Controls.Add(txtValue);
        Controls.Add(lblPrompt);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "TextInputForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "Input";
        ResumeLayout(false);
        PerformLayout();
    }
}

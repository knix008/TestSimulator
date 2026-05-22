namespace FileMasterWinV10.Dialogs;

partial class InputDialog
{
    private System.ComponentModel.IContainer components = null!;

    private TableLayoutPanel layoutPanel;
    private Label promptLabel;
    private TextBox inputBox;
    private FlowLayoutPanel btnFlow;
    private Button okButton;
    private Button cancelButton;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            components?.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        layoutPanel = new TableLayoutPanel();
        promptLabel = new Label();
        inputBox = new TextBox();
        btnFlow = new FlowLayoutPanel();
        okButton = new Button();
        cancelButton = new Button();
        layoutPanel.SuspendLayout();
        btnFlow.SuspendLayout();
        SuspendLayout();
        //
        // layoutPanel
        //
        layoutPanel.ColumnCount = 2;
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        layoutPanel.Controls.Add(promptLabel, 0, 0);
        layoutPanel.Controls.Add(inputBox, 0, 1);
        layoutPanel.Controls.Add(btnFlow, 0, 2);
        layoutPanel.Dock = DockStyle.Fill;
        layoutPanel.Location = new Point(0, 0);
        layoutPanel.Name = "layoutPanel";
        layoutPanel.Padding = new Padding(16);
        layoutPanel.RowCount = 3;
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layoutPanel.Size = new Size(420, 160);
        layoutPanel.TabIndex = 0;
        layoutPanel.SetColumnSpan(promptLabel, 2);
        layoutPanel.SetColumnSpan(inputBox, 2);
        layoutPanel.SetColumnSpan(btnFlow, 2);
        //
        // promptLabel
        //
        promptLabel.AutoSize = true;
        promptLabel.Location = new Point(16, 16);
        promptLabel.Margin = new Padding(0, 0, 12, 8);
        promptLabel.Name = "promptLabel";
        promptLabel.Size = new Size(43, 15);
        promptLabel.TabIndex = 0;
        promptLabel.Text = "이름:";
        //
        // inputBox
        //
        inputBox.Dock = DockStyle.Fill;
        inputBox.Location = new Point(16, 39);
        inputBox.Margin = new Padding(0, 0, 0, 12);
        inputBox.Name = "inputBox";
        inputBox.Size = new Size(388, 23);
        inputBox.TabIndex = 1;
        //
        // btnFlow
        //
        btnFlow.Controls.Add(okButton);
        btnFlow.Controls.Add(cancelButton);
        btnFlow.Dock = DockStyle.Fill;
        btnFlow.FlowDirection = FlowDirection.RightToLeft;
        btnFlow.Location = new Point(16, 74);
        btnFlow.Margin = new Padding(0, 4, 0, 0);
        btnFlow.Name = "btnFlow";
        btnFlow.Size = new Size(388, 70);
        btnFlow.TabIndex = 2;
        //
        // okButton
        //
        okButton.DialogResult = DialogResult.OK;
        okButton.Location = new Point(300, 0);
        okButton.Name = "okButton";
        okButton.Size = new Size(88, 32);
        okButton.TabIndex = 0;
        okButton.Text = "확인";
        okButton.UseVisualStyleBackColor = true;
        //
        // cancelButton
        //
        cancelButton.DialogResult = DialogResult.Cancel;
        cancelButton.Location = new Point(204, 0);
        cancelButton.Margin = new Padding(0, 0, 8, 0);
        cancelButton.Name = "cancelButton";
        cancelButton.Size = new Size(88, 32);
        cancelButton.TabIndex = 1;
        cancelButton.Text = "취소";
        cancelButton.UseVisualStyleBackColor = true;
        //
        // InputDialog
        //
        AcceptButton = okButton;
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        CancelButton = cancelButton;
        ClientSize = new Size(420, 160);
        Controls.Add(layoutPanel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "InputDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "입력";
        layoutPanel.ResumeLayout(false);
        layoutPanel.PerformLayout();
        btnFlow.ResumeLayout(false);
        ResumeLayout(false);
    }
}

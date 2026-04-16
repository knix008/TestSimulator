namespace MemoPadV10;

public partial class MemoPadForm
{
    private System.ComponentModel.IContainer components = null!;
    private Panel topBarPanel = null!;
    private Button addMemoIconButton = null!;
    private Button saveMemoIconButton = null!;
    private Button settingsIconButton = null!;
    private Button listIconButton = null!;
    private Button closeIconButton = null!;
    private RichTextBox memoEditor = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MemoPadForm));
        topBarPanel = new Panel();
        addMemoIconButton = new Button();
        saveMemoIconButton = new Button();
        settingsIconButton = new Button();
        listIconButton = new Button();
        closeIconButton = new Button();
        memoEditor = new RichTextBox();
        topBarPanel.SuspendLayout();
        SuspendLayout();
        // 
        // topBarPanel
        // 
        topBarPanel.BackColor = Color.FromArgb(165, 245, 225, 125);
        topBarPanel.Controls.Add(addMemoIconButton);
        topBarPanel.Controls.Add(saveMemoIconButton);
        topBarPanel.Controls.Add(settingsIconButton);
        topBarPanel.Controls.Add(listIconButton);
        topBarPanel.Controls.Add(closeIconButton);
        topBarPanel.Dock = DockStyle.Top;
        topBarPanel.Location = new Point(0, 0);
        topBarPanel.Name = "topBarPanel";
        topBarPanel.Size = new Size(428, 52);
        topBarPanel.TabIndex = 0;
        topBarPanel.MouseDown += topBarPanel_MouseDown;
        topBarPanel.MouseMove += topBarPanel_MouseMove;
        topBarPanel.MouseUp += topBarPanel_MouseUp;
        // 
        // addMemoIconButton
        // 
        addMemoIconButton.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        addMemoIconButton.FlatAppearance.BorderSize = 0;
        addMemoIconButton.FlatStyle = FlatStyle.Flat;
        addMemoIconButton.Font = new Font("맑은 고딕", 14F, FontStyle.Bold);
        addMemoIconButton.Location = new Point(8, 8);
        addMemoIconButton.Name = "addMemoIconButton";
        addMemoIconButton.Size = new Size(44, 36);
        addMemoIconButton.TabIndex = 0;
        addMemoIconButton.Text = "+";
        addMemoIconButton.UseVisualStyleBackColor = true;
        addMemoIconButton.Click += addMemoIconButton_Click;
        // 
        // saveMemoIconButton
        // 
        saveMemoIconButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        saveMemoIconButton.FlatAppearance.BorderSize = 0;
        saveMemoIconButton.FlatStyle = FlatStyle.Flat;
        saveMemoIconButton.Font = new Font("Segoe UI Symbol", 12F, FontStyle.Bold);
        saveMemoIconButton.Location = new Point(222, 8);
        saveMemoIconButton.Name = "saveMemoIconButton";
        saveMemoIconButton.Size = new Size(44, 36);
        saveMemoIconButton.TabIndex = 1;
        saveMemoIconButton.Text = "💾";
        saveMemoIconButton.UseVisualStyleBackColor = true;
        saveMemoIconButton.Click += saveMemoIconButton_Click;
        // 
        // settingsIconButton
        // 
        settingsIconButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        settingsIconButton.FlatAppearance.BorderSize = 0;
        settingsIconButton.FlatStyle = FlatStyle.Flat;
        settingsIconButton.Font = new Font("Segoe UI Symbol", 12F, FontStyle.Bold);
        settingsIconButton.Location = new Point(272, 8);
        settingsIconButton.Name = "settingsIconButton";
        settingsIconButton.Size = new Size(44, 36);
        settingsIconButton.TabIndex = 2;
        settingsIconButton.Text = "⚙";
        settingsIconButton.UseVisualStyleBackColor = true;
        settingsIconButton.Click += settingsIconButton_Click;
        // 
        // listIconButton
        // 
        listIconButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        listIconButton.FlatAppearance.BorderSize = 0;
        listIconButton.FlatStyle = FlatStyle.Flat;
        listIconButton.Font = new Font("Segoe UI Symbol", 12F, FontStyle.Bold);
        listIconButton.Location = new Point(322, 8);
        listIconButton.Name = "listIconButton";
        listIconButton.Size = new Size(44, 36);
        listIconButton.TabIndex = 3;
        listIconButton.Text = "☰";
        listIconButton.UseVisualStyleBackColor = true;
        listIconButton.Click += listIconButton_Click;
        // 
        // closeIconButton
        // 
        closeIconButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        closeIconButton.FlatAppearance.BorderSize = 0;
        closeIconButton.FlatStyle = FlatStyle.Flat;
        closeIconButton.Font = new Font("맑은 고딕", 12F, FontStyle.Bold);
        closeIconButton.Location = new Point(372, 8);
        closeIconButton.Name = "closeIconButton";
        closeIconButton.Size = new Size(44, 36);
        closeIconButton.TabIndex = 4;
        closeIconButton.Text = "X";
        closeIconButton.UseVisualStyleBackColor = true;
        closeIconButton.Click += closeIconButton_Click;
        // 
        // memoEditor
        // 
        memoEditor.BackColor = Color.FromArgb(248, 225, 140);
        memoEditor.BorderStyle = BorderStyle.None;
        memoEditor.Dock = DockStyle.Fill;
        memoEditor.Font = new Font("맑은 고딕", 12F, FontStyle.Regular, GraphicsUnit.Point, 129);
        memoEditor.Location = new Point(0, 52);
        memoEditor.Name = "memoEditor";
        memoEditor.Size = new Size(428, 354);
        memoEditor.TabIndex = 3;
        memoEditor.Text = "";
        memoEditor.KeyDown += memoEditor_KeyDown;
        // 
        // MemoPadForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(248, 225, 140);
        ClientSize = new Size(428, 406);
        Controls.Add(memoEditor);
        Controls.Add(topBarPanel);
        FormBorderStyle = FormBorderStyle.None;
        Icon = (Icon)resources.GetObject("$this.Icon");
        Name = "MemoPadForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Memo Pad";
        topBarPanel.ResumeLayout(false);
        ResumeLayout(false);
    }
}

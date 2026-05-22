namespace FileMasterWinV10.Controls;

partial class PreviewPanel
{
    private System.ComponentModel.IContainer components = null!;

    private PictureBox pictureBox;
    private RichTextBox textBox;
    private Label infoLabel;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            components?.Dispose();
            pictureBox.Image?.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        pictureBox = new PictureBox();
        textBox = new RichTextBox();
        infoLabel = new Label();
        SuspendLayout();
        //
        // pictureBox
        //
        pictureBox.BackColor = Color.FromArgb(32, 36, 42);
        pictureBox.Dock = DockStyle.Fill;
        pictureBox.Location = new Point(8, 8);
        pictureBox.Name = "pictureBox";
        pictureBox.Size = new Size(384, 284);
        pictureBox.SizeMode = PictureBoxSizeMode.Zoom;
        pictureBox.TabIndex = 0;
        pictureBox.TabStop = false;
        pictureBox.Visible = false;
        //
        // textBox
        //
        textBox.BorderStyle = BorderStyle.None;
        textBox.Dock = DockStyle.Fill;
        textBox.Font = new Font("Cascadia Mono", 9F);
        textBox.Location = new Point(8, 8);
        textBox.Name = "textBox";
        textBox.ReadOnly = true;
        textBox.Size = new Size(384, 284);
        textBox.TabIndex = 1;
        textBox.Visible = false;
        textBox.WordWrap = false;
        //
        // infoLabel
        //
        infoLabel.Dock = DockStyle.Fill;
        infoLabel.Font = new Font("Segoe UI", 9.25F);
        infoLabel.ForeColor = Color.FromArgb(96, 102, 112);
        infoLabel.Location = new Point(8, 8);
        infoLabel.Name = "infoLabel";
        infoLabel.Size = new Size(384, 284);
        infoLabel.TabIndex = 2;
        infoLabel.Text = "파일을 선택하면 미리보기가 표시됩니다.";
        infoLabel.TextAlign = ContentAlignment.MiddleCenter;
        //
        // PreviewPanel
        //
        BackColor = Color.White;
        Controls.Add(infoLabel);
        Controls.Add(textBox);
        Controls.Add(pictureBox);
        Name = "PreviewPanel";
        Padding = new Padding(8);
        Size = new Size(400, 300);
        ResumeLayout(false);
    }
}

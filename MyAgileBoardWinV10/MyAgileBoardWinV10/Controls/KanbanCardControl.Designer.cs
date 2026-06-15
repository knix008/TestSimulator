namespace MyAgileBoardWinV10.Controls;

partial class KanbanCardControl
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        panelCard = new Panel();
        lblTitle = new Label();
        lblPriority = new Label();
        lblAssignee = new Label();
        lblDueDate = new Label();
        lblTags = new Label();
        contextMenuCard = new ContextMenuStrip(components);
        menuEdit = new ToolStripMenuItem();
        menuSep = new ToolStripSeparator();
        menuDelete = new ToolStripMenuItem();
        toolTip = new ToolTip(components);

        panelCard.SuspendLayout();
        SuspendLayout();

        // contextMenuCard
        contextMenuCard.Items.AddRange(new ToolStripItem[]
        {
            menuEdit,
            menuSep,
            menuDelete
        });
        contextMenuCard.Name = "contextMenuCard";
        contextMenuCard.Size = new Size(120, 54);

        // menuEdit
        menuEdit.Name = "menuEdit";
        menuEdit.Text = "편집...";
        menuEdit.Click += new EventHandler(menuEdit_Click);

        // menuDelete
        menuDelete.Name = "menuDelete";
        menuDelete.Text = "삭제";
        menuDelete.ForeColor = Color.Red;
        menuDelete.Click += new EventHandler(menuDelete_Click);

        // lblTitle
        lblTitle.AutoSize = false;
        lblTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitle.Location = new Point(5, 4);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(216, 18);
        lblTitle.Text = string.Empty;
        lblTitle.DoubleClick += new EventHandler(lblTitle_DoubleClick);
        lblTitle.ContextMenuStrip = contextMenuCard;

        // lblPriority
        lblPriority.AutoSize = true;
        lblPriority.Font = new Font("Segoe UI", 7.5F, FontStyle.Bold);
        lblPriority.Location = new Point(5, 24);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(60, 13);
        lblPriority.Text = "Medium";
        lblPriority.ContextMenuStrip = contextMenuCard;

        // lblAssignee
        lblAssignee.AutoSize = true;
        lblAssignee.Font = new Font("Segoe UI", 7.5F);
        lblAssignee.Location = new Point(5, 40);
        lblAssignee.Name = "lblAssignee";
        lblAssignee.Size = new Size(120, 13);
        lblAssignee.ForeColor = Color.DimGray;
        lblAssignee.Visible = false;
        lblAssignee.ContextMenuStrip = contextMenuCard;

        // lblDueDate
        lblDueDate.AutoSize = true;
        lblDueDate.Font = new Font("Segoe UI", 7.5F);
        lblDueDate.Location = new Point(5, 56);
        lblDueDate.Name = "lblDueDate";
        lblDueDate.Size = new Size(100, 13);
        lblDueDate.ForeColor = Color.DimGray;
        lblDueDate.Visible = false;
        lblDueDate.ContextMenuStrip = contextMenuCard;

        // lblTags
        lblTags.AutoSize = false;
        lblTags.Font = new Font("Segoe UI", 7F);
        lblTags.Location = new Point(5, 72);
        lblTags.Name = "lblTags";
        lblTags.Size = new Size(216, 13);
        lblTags.ForeColor = Color.SlateGray;
        lblTags.Visible = false;
        lblTags.ContextMenuStrip = contextMenuCard;

        // panelCard
        panelCard.BackColor = Color.WhiteSmoke;
        panelCard.BorderStyle = BorderStyle.FixedSingle;
        panelCard.Controls.AddRange(new Control[]
        {
            lblTitle,
            lblPriority,
            lblAssignee,
            lblDueDate,
            lblTags
        });
        panelCard.ContextMenuStrip = contextMenuCard;
        panelCard.Cursor = Cursors.Hand;
        panelCard.Dock = DockStyle.Fill;
        panelCard.Name = "panelCard";
        panelCard.Size = new Size(230, 74);
        panelCard.DoubleClick += new EventHandler(panelCard_DoubleClick);

        // KanbanCardControl
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        Controls.Add(panelCard);
        ContextMenuStrip = contextMenuCard;
        Cursor = Cursors.Hand;
        Margin = new Padding(3, 3, 3, 2);
        Name = "KanbanCardControl";
        Size = new Size(230, 74);

        panelCard.ResumeLayout(false);
        panelCard.PerformLayout();
        ResumeLayout(false);
    }

    private Panel panelCard = null!;
    private Label lblTitle = null!;
    private Label lblPriority = null!;
    private Label lblAssignee = null!;
    private Label lblDueDate = null!;
    private Label lblTags = null!;
    private ContextMenuStrip contextMenuCard = null!;
    private ToolStripMenuItem menuEdit = null!;
    private ToolStripSeparator menuSep = null!;
    private ToolStripMenuItem menuDelete = null!;
    private ToolTip toolTip = null!;
}

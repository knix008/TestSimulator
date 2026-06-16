namespace MyAgileBoardWinV10.Controls;

partial class KanbanCardControl
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _titleFont?.Dispose();
            _rotatedCache?.Dispose();
            if (components != null)
                components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        panelCard = new Panel();
        lblTitle = new Label();
        lblDescription = new Label();
        lblPriority = new Label();
        lblAssignee = new Label();
        lblDueDate = new Label();
        lblTags = new Label();
        contextMenuCard = new ContextMenuStrip(components);
        menuEdit = new ToolStripMenuItem();
        menuSep = new ToolStripSeparator();
        menuRotateLeft = new ToolStripMenuItem();
        menuRotateRight = new ToolStripMenuItem();
        menuRotateReset = new ToolStripMenuItem();
        menuSepRotate = new ToolStripSeparator();
        menuBringForward = new ToolStripMenuItem();
        menuBringToFront = new ToolStripMenuItem();
        menuSendBackward = new ToolStripMenuItem();
        menuSendToBack = new ToolStripMenuItem();
        menuSepOrder = new ToolStripSeparator();
        menuDelete = new ToolStripMenuItem();
        toolTip = new ToolTip(components);

        panelCard.SuspendLayout();
        SuspendLayout();

        // contextMenuCard
        contextMenuCard.Items.AddRange(new ToolStripItem[]
        {
            menuEdit,
            menuSep,
            menuRotateLeft,
            menuRotateRight,
            menuRotateReset,
            menuSepRotate,
            menuBringForward,
            menuBringToFront,
            menuSendBackward,
            menuSendToBack,
            menuSepOrder,
            menuDelete
        });
        contextMenuCard.Name = "contextMenuCard";
        contextMenuCard.Size = new Size(200, 240);
        contextMenuCard.Opening += ContextMenuCard_Opening;

        // menuEdit
        menuEdit.Name = "menuEdit";
        menuEdit.Text = "편집...";
        menuEdit.Click += new EventHandler(menuEdit_Click);

        // menuRotateLeft
        menuRotateLeft.Name = "menuRotateLeft";
        menuRotateLeft.Text = "왼쪽으로 회전 (-15°)";
        menuRotateLeft.Click += new EventHandler(menuRotateLeft_Click);

        // menuRotateRight
        menuRotateRight.Name = "menuRotateRight";
        menuRotateRight.Text = "오른쪽으로 회전 (+15°)";
        menuRotateRight.Click += new EventHandler(menuRotateRight_Click);

        // menuRotateReset
        menuRotateReset.Name = "menuRotateReset";
        menuRotateReset.Text = "회전 초기화";
        menuRotateReset.Click += new EventHandler(menuRotateReset_Click);

        // menuBringForward
        menuBringForward.Name = "menuBringForward";
        menuBringForward.Text = "앞으로 보내기";
        menuBringForward.Click += new EventHandler(menuBringForward_Click);

        // menuBringToFront
        menuBringToFront.Name = "menuBringToFront";
        menuBringToFront.Text = "가장 앞으로 보내기";
        menuBringToFront.Click += new EventHandler(menuBringToFront_Click);

        // menuSendBackward
        menuSendBackward.Name = "menuSendBackward";
        menuSendBackward.Text = "뒤로 보내기";
        menuSendBackward.Click += new EventHandler(menuSendBackward_Click);

        // menuSendToBack
        menuSendToBack.Name = "menuSendToBack";
        menuSendToBack.Text = "가장 뒤로 보내기";
        menuSendToBack.Click += new EventHandler(menuSendToBack_Click);

        // menuDelete
        menuDelete.Name = "menuDelete";
        menuDelete.Text = "삭제";
        menuDelete.ForeColor = Color.Red;
        menuDelete.Click += new EventHandler(menuDelete_Click);

        // lblTitle
        lblTitle.AutoSize = false;
        lblTitle.AutoEllipsis = true;
        lblTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTitle.Location = new Point(5, 4);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(216, 18);
        lblTitle.Text = string.Empty;
        lblTitle.BackColor = Color.Transparent;
        lblTitle.ContextMenuStrip = contextMenuCard;

        // lblDescription
        lblDescription.AutoSize = false;
        lblDescription.AutoEllipsis = true;
        lblDescription.Font = new Font("Segoe UI", 7.5F);
        lblDescription.ForeColor = Color.DimGray;
        lblDescription.Location = new Point(5, 22);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(216, 14);
        lblDescription.BackColor = Color.Transparent;
        lblDescription.Visible = false;
        lblDescription.ContextMenuStrip = contextMenuCard;

        // lblPriority
        lblPriority.AutoSize = true;
        lblPriority.BackColor = Color.Transparent;
        lblPriority.Font = new Font("Segoe UI", 7.5F, FontStyle.Bold);
        lblPriority.Location = new Point(5, 24);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(60, 13);
        lblPriority.Text = "Medium";
        lblPriority.ContextMenuStrip = contextMenuCard;

        // lblAssignee
        lblAssignee.AutoSize = true;
        lblAssignee.BackColor = Color.Transparent;
        lblAssignee.Font = new Font("Segoe UI", 7.5F);
        lblAssignee.Location = new Point(5, 40);
        lblAssignee.Name = "lblAssignee";
        lblAssignee.Size = new Size(120, 13);
        lblAssignee.ForeColor = Color.DimGray;
        lblAssignee.Visible = false;
        lblAssignee.ContextMenuStrip = contextMenuCard;

        // lblDueDate
        lblDueDate.AutoSize = true;
        lblDueDate.BackColor = Color.Transparent;
        lblDueDate.Font = new Font("Segoe UI", 7.5F);
        lblDueDate.Location = new Point(5, 56);
        lblDueDate.Name = "lblDueDate";
        lblDueDate.Size = new Size(100, 13);
        lblDueDate.ForeColor = Color.DimGray;
        lblDueDate.Visible = false;
        lblDueDate.ContextMenuStrip = contextMenuCard;

        // lblTags
        lblTags.AutoSize = false;
        lblTags.BackColor = Color.Transparent;
        lblTags.Font = new Font("Segoe UI", 7F);
        lblTags.Location = new Point(5, 72);
        lblTags.Name = "lblTags";
        lblTags.Size = new Size(216, 13);
        lblTags.ForeColor = Color.SlateGray;
        lblTags.Visible = false;
        lblTags.ContextMenuStrip = contextMenuCard;

        // panelCard
        panelCard.BackColor = Color.WhiteSmoke;
        panelCard.BorderStyle = BorderStyle.None;
        panelCard.Controls.AddRange(new Control[]
        {
            lblTitle,
            lblDescription,
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
    private Label lblDescription = null!;
    private Label lblPriority = null!;
    private Label lblAssignee = null!;
    private Label lblDueDate = null!;
    private Label lblTags = null!;
    private ContextMenuStrip contextMenuCard = null!;
    private ToolStripMenuItem menuEdit = null!;
    private ToolStripSeparator menuSep = null!;
    private ToolStripMenuItem menuRotateLeft = null!;
    private ToolStripMenuItem menuRotateRight = null!;
    private ToolStripMenuItem menuRotateReset = null!;
    private ToolStripSeparator menuSepRotate = null!;
    private ToolStripMenuItem menuBringForward = null!;
    private ToolStripMenuItem menuBringToFront = null!;
    private ToolStripMenuItem menuSendBackward = null!;
    private ToolStripMenuItem menuSendToBack = null!;
    private ToolStripSeparator menuSepOrder = null!;
    private ToolStripMenuItem menuDelete = null!;
    private ToolTip toolTip = null!;
}

namespace MyAgileBoardWinV10.Controls;

partial class KanbanColumnControl
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
        panelHeader = new Panel();
        lblColumnName = new Label();
        btnColumnMenu = new Button();
        flowCards = new FlowLayoutPanel();
        btnAddCard = new Button();
        contextMenuColumn = new ContextMenuStrip(components);
        menuAddCardFromMenu = new ToolStripMenuItem();
        menuColumnSettings = new ToolStripMenuItem();
        menuCompletionToggle = new ToolStripMenuItem();
        menuSep = new ToolStripSeparator();
        menuDeleteColumn = new ToolStripMenuItem();

        panelHeader.SuspendLayout();
        SuspendLayout();

        // contextMenuColumn
        contextMenuColumn.Items.AddRange(new ToolStripItem[]
        {
            menuAddCardFromMenu,
            menuColumnSettings,
            menuCompletionToggle,
            menuSep,
            menuDeleteColumn
        });
        contextMenuColumn.Name = "contextMenuColumn";
        contextMenuColumn.Size = new Size(160, 110);

        // menuAddCardFromMenu
        menuAddCardFromMenu.Name = "menuAddCardFromMenu";
        menuAddCardFromMenu.Text = "카드 추가...";
        menuAddCardFromMenu.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        menuAddCardFromMenu.Click += new EventHandler(menuAddCardFromMenu_Click);

        // menuColumnSettings
        menuColumnSettings.Name = "menuColumnSettings";
        menuColumnSettings.Text = "컬럼 설정...";
        menuColumnSettings.Click += new EventHandler(menuColumnSettings_Click);

        // menuCompletionToggle
        menuCompletionToggle.Name = "menuCompletionToggle";
        menuCompletionToggle.Text = "완료 컬럼으로 설정";
        menuCompletionToggle.Click += new EventHandler(menuCompletionToggle_Click);

        // menuDeleteColumn
        menuDeleteColumn.Name = "menuDeleteColumn";
        menuDeleteColumn.Text = "컬럼 삭제";
        menuDeleteColumn.ForeColor = Color.Red;
        menuDeleteColumn.Click += new EventHandler(menuDeleteColumn_Click);

        // lblColumnName
        lblColumnName.AutoSize = false;
        lblColumnName.Cursor = Cursors.SizeAll;
        lblColumnName.Dock = DockStyle.Fill;
        lblColumnName.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
        lblColumnName.ForeColor = Color.White;
        lblColumnName.Name = "lblColumnName";
        lblColumnName.Padding = new Padding(6, 0, 0, 0);
        lblColumnName.Text = "Column";
        lblColumnName.TextAlign = ContentAlignment.MiddleLeft;
        lblColumnName.ContextMenuStrip = contextMenuColumn;
        lblColumnName.MouseDown += new MouseEventHandler(panelHeader_MouseDown);
        lblColumnName.MouseMove += new MouseEventHandler(panelHeader_MouseMove);
        lblColumnName.MouseUp   += new MouseEventHandler(panelHeader_MouseUp);

        // btnColumnMenu
        btnColumnMenu.Dock = DockStyle.Right;
        btnColumnMenu.FlatStyle = FlatStyle.Flat;
        btnColumnMenu.FlatAppearance.BorderSize = 0;
        btnColumnMenu.FlatAppearance.MouseOverBackColor = Color.FromArgb(30, 255, 255, 255);
        btnColumnMenu.Font = new Font("Segoe UI", 14F);
        btnColumnMenu.ForeColor = Color.White;
        btnColumnMenu.Name = "btnColumnMenu";
        btnColumnMenu.Size = new Size(34, 36);
        btnColumnMenu.Text = "⋮";
        btnColumnMenu.UseVisualStyleBackColor = false;
        btnColumnMenu.Click += new EventHandler(btnColumnMenu_Click);

        // panelHeader
        panelHeader.BackColor = Color.SteelBlue;
        panelHeader.Controls.Add(lblColumnName);
        panelHeader.Controls.Add(btnColumnMenu);
        panelHeader.ContextMenuStrip = contextMenuColumn;
        panelHeader.Cursor = Cursors.SizeAll;
        panelHeader.Dock = DockStyle.Top;
        panelHeader.Name = "panelHeader";
        panelHeader.Size = new Size(250, 36);
        panelHeader.MouseDown += new MouseEventHandler(panelHeader_MouseDown);
        panelHeader.MouseMove += new MouseEventHandler(panelHeader_MouseMove);
        panelHeader.MouseUp   += new MouseEventHandler(panelHeader_MouseUp);

        // flowCards
        flowCards.AutoScroll = true;
        flowCards.Dock = DockStyle.Fill;
        flowCards.FlowDirection = FlowDirection.TopDown;
        flowCards.Name = "flowCards";
        flowCards.Padding = new Padding(4, 4, 4, 4);
        flowCards.WrapContents = false;
        flowCards.ContextMenuStrip = contextMenuColumn;

        // btnAddCard
        btnAddCard.BackColor = SystemColors.Control;
        btnAddCard.Dock = DockStyle.Bottom;
        btnAddCard.FlatStyle = FlatStyle.Flat;
        btnAddCard.FlatAppearance.BorderColor = Color.LightGray;
        btnAddCard.Font = new Font("Segoe UI", 8.5F);
        btnAddCard.ForeColor = Color.DimGray;
        btnAddCard.Name = "btnAddCard";
        btnAddCard.Size = new Size(250, 28);
        btnAddCard.Text = "+ 카드 추가";
        btnAddCard.UseVisualStyleBackColor = false;
        btnAddCard.Click += new EventHandler(btnAddCard_Click);

        // KanbanColumnControl
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(245, 246, 248);
        BorderStyle = BorderStyle.FixedSingle;
        Controls.Add(flowCards);
        Controls.Add(panelHeader);
        Controls.Add(btnAddCard);
        ContextMenuStrip = contextMenuColumn;
        MinimumSize = new Size(200, 100);
        Name = "KanbanColumnControl";
        Size = new Size(250, 500);

        panelHeader.ResumeLayout(false);
        ResumeLayout(false);
    }

    private Panel panelHeader = null!;
    private Label lblColumnName = null!;
    private Button btnColumnMenu = null!;
    private FlowLayoutPanel flowCards = null!;
    private Button btnAddCard = null!;
    private ContextMenuStrip contextMenuColumn = null!;
    private ToolStripMenuItem menuAddCardFromMenu = null!;
    private ToolStripMenuItem menuColumnSettings = null!;
    private ToolStripMenuItem menuCompletionToggle = null!;
    private ToolStripSeparator menuSep = null!;
    private ToolStripMenuItem menuDeleteColumn = null!;
}

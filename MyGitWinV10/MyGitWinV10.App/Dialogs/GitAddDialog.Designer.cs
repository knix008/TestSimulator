namespace MyGitWinV10.App.Dialogs
{
    partial class GitAddDialog
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && components is not null)
            {
                components.Dispose();
            }

            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            summaryLabel = new Label();
            pathListView = new ListView();
            pathColumnHeader = new ColumnHeader();
            statusColumnHeader = new ColumnHeader();
            pathListContextMenu = new ContextMenuStrip(components);
            removePathContextMenuItem = new ToolStripMenuItem();
            removeButton = new Button();
            stageButton = new Button();
            cancelButton = new Button();
            pathListContextMenu.SuspendLayout();
            SuspendLayout();
            //
            // summaryLabel
            //
            summaryLabel.AutoSize = true;
            summaryLabel.Location = new Point(20, 16);
            summaryLabel.MaximumSize = new Size(560, 0);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(0, 15);
            summaryLabel.TabIndex = 0;
            //
            // pathListView
            //
            pathListView.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            pathListView.Columns.AddRange(new ColumnHeader[] { pathColumnHeader, statusColumnHeader });
            pathListView.FullRowSelect = true;
            pathListView.GridLines = true;
            pathListView.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            pathListView.HideSelection = false;
            pathListView.MultiSelect = true;
            pathListView.Location = new Point(20, 40);
            pathListView.Name = "pathListView";
            pathListView.Size = new Size(560, 280);
            pathListView.TabIndex = 1;
            pathListView.ContextMenuStrip = pathListContextMenu;
            pathListView.UseCompatibleStateImageBehavior = false;
            pathListView.View = View.Details;
            pathListView.SelectedIndexChanged += PathListView_SelectedIndexChanged;
            pathListView.MouseDown += PathListView_MouseDown;
            //
            // pathListContextMenu
            //
            pathListContextMenu.Items.AddRange(new ToolStripItem[] { removePathContextMenuItem });
            pathListContextMenu.Name = "pathListContextMenu";
            pathListContextMenu.Size = new Size(153, 26);
            pathListContextMenu.Opening += PathListContextMenu_Opening;
            //
            // removePathContextMenuItem
            //
            removePathContextMenuItem.Name = "removePathContextMenuItem";
            removePathContextMenuItem.Size = new Size(152, 22);
            removePathContextMenuItem.Text = "Remove Selected";
            removePathContextMenuItem.Click += RemovePathContextMenuItem_Click;
            //
            // pathColumnHeader
            //
            pathColumnHeader.Text = "Path";
            pathColumnHeader.Width = 470;
            //
            // statusColumnHeader
            //
            statusColumnHeader.Text = "Status";
            statusColumnHeader.TextAlign = HorizontalAlignment.Center;
            statusColumnHeader.Width = 70;
            //
            // removeButton
            //
            removeButton.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            removeButton.FlatStyle = FlatStyle.Flat;
            removeButton.Location = new Point(20, 332);
            removeButton.Name = "removeButton";
            removeButton.Size = new Size(110, 28);
            removeButton.TabIndex = 2;
            removeButton.Text = "Remove Selected";
            removeButton.Click += RemoveButton_Click;
            //
            // stageButton
            //
            stageButton.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            stageButton.BackColor = Color.FromArgb(37, 99, 235);
            stageButton.FlatStyle = FlatStyle.Flat;
            stageButton.ForeColor = Color.White;
            stageButton.Location = new Point(424, 332);
            stageButton.Name = "stageButton";
            stageButton.Size = new Size(75, 28);
            stageButton.TabIndex = 3;
            stageButton.Text = "Stage";
            stageButton.Click += StageButton_Click;
            //
            // cancelButton
            //
            cancelButton.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            cancelButton.DialogResult = DialogResult.Cancel;
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(505, 332);
            cancelButton.Name = "cancelButton";
            cancelButton.Size = new Size(75, 28);
            cancelButton.TabIndex = 4;
            cancelButton.Text = "Cancel";
            cancelButton.Click += CancelButton_Click;
            //
            // GitAddDialog
            //
            AcceptButton = stageButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = cancelButton;
            ClientSize = new Size(600, 380);
            Controls.Add(summaryLabel);
            Controls.Add(pathListView);
            Controls.Add(removeButton);
            Controls.Add(stageButton);
            Controls.Add(cancelButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = false;
            MinimizeBox = false;
            MinimumSize = new Size(480, 320);
            Name = "GitAddDialog";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Git Add";
            pathListContextMenu.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label summaryLabel;
        private ListView pathListView;
        private ColumnHeader pathColumnHeader;
        private ColumnHeader statusColumnHeader;
        private ContextMenuStrip pathListContextMenu;
        private ToolStripMenuItem removePathContextMenuItem;
        private Button removeButton;
        private Button stageButton;
        private Button cancelButton;
    }
}

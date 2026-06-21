namespace MyGitWinV10.App.Dialogs
{
    partial class GitStatusDialog
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
            summaryLabel = new Label();
            statusListView = new ListView();
            pathColumnHeader = new ColumnHeader();
            stagedColumnHeader = new ColumnHeader();
            workTreeColumnHeader = new ColumnHeader();
            closeButton = new Button();
            SuspendLayout();
            //
            // summaryLabel
            //
            summaryLabel.AutoSize = true;
            summaryLabel.Location = new Point(20, 20);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(120, 15);
            summaryLabel.Text = "Working tree clean.";
            //
            // statusListView
            //
            statusListView.Columns.AddRange(new ColumnHeader[] { pathColumnHeader, stagedColumnHeader, workTreeColumnHeader });
            statusListView.FullRowSelect = true;
            statusListView.GridLines = true;
            statusListView.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            statusListView.Location = new Point(20, 44);
            statusListView.Name = "statusListView";
            statusListView.Size = new Size(560, 280);
            statusListView.TabIndex = 0;
            statusListView.UseCompatibleStateImageBehavior = false;
            statusListView.View = View.Details;
            //
            // pathColumnHeader
            //
            pathColumnHeader.Text = "Path";
            pathColumnHeader.Width = 300;
            //
            // stagedColumnHeader
            //
            stagedColumnHeader.Text = "Staged";
            stagedColumnHeader.Width = 120;
            //
            // workTreeColumnHeader
            //
            workTreeColumnHeader.Text = "Work Tree";
            workTreeColumnHeader.Width = 120;
            //
            // closeButton
            //
            closeButton.AutoSize = false;
            closeButton.FlatStyle = FlatStyle.Flat;
            closeButton.Location = new Point(505, 336);
            closeButton.MaximumSize = new Size(75, 28);
            closeButton.MinimumSize = new Size(75, 28);
            closeButton.Name = "closeButton";
            closeButton.Size = new Size(75, 28);
            closeButton.TabIndex = 1;
            closeButton.Text = "Close";
            closeButton.TextAlign = ContentAlignment.MiddleCenter;
            closeButton.Click += CloseButton_Click;
            //
            // GitStatusDialog
            //
            AcceptButton = closeButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = closeButton;
            ClientSize = new Size(600, 380);
            Controls.Add(summaryLabel);
            Controls.Add(statusListView);
            Controls.Add(closeButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "GitStatusDialog";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Git Status";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label summaryLabel;
        private ListView statusListView;
        private ColumnHeader pathColumnHeader;
        private ColumnHeader stagedColumnHeader;
        private ColumnHeader workTreeColumnHeader;
        private Button closeButton;
    }
}

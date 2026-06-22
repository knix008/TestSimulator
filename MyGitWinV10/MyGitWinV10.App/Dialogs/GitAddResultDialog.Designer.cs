namespace MyGitWinV10.App.Dialogs
{
    partial class GitAddResultDialog
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
            addListView = new ListView();
            pathColumnHeader = new ColumnHeader();
            statusColumnHeader = new ColumnHeader();
            closeButton = new Button();
            SuspendLayout();
            //
            // summaryLabel
            //
            summaryLabel.AutoSize = true;
            summaryLabel.Location = new Point(20, 20);
            summaryLabel.Name = "summaryLabel";
            summaryLabel.Size = new Size(120, 15);
            summaryLabel.Text = "0 paths were staged.";
            //
            // addListView
            //
            addListView.Columns.AddRange(new ColumnHeader[] { pathColumnHeader, statusColumnHeader });
            addListView.FullRowSelect = true;
            addListView.GridLines = true;
            addListView.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            addListView.Location = new Point(20, 44);
            addListView.Name = "addListView";
            addListView.Size = new Size(560, 280);
            addListView.TabIndex = 0;
            addListView.UseCompatibleStateImageBehavior = false;
            addListView.View = View.Details;
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
            // GitAddResultDialog
            //
            AcceptButton = closeButton;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            CancelButton = closeButton;
            ClientSize = new Size(600, 380);
            Controls.Add(summaryLabel);
            Controls.Add(addListView);
            Controls.Add(closeButton);
            Font = new Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "GitAddResultDialog";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Git Add Complete";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label summaryLabel;
        private ListView addListView;
        private ColumnHeader pathColumnHeader;
        private ColumnHeader statusColumnHeader;
        private Button closeButton;
    }
}

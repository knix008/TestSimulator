namespace ZipMasterWin01
{
    partial class TitleSectionControl
    {
        private System.ComponentModel.IContainer components = null;

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
            this.layoutTitle = new System.Windows.Forms.TableLayoutPanel();
            this.labelTitle = new System.Windows.Forms.Label();
            this.labelSubtitle = new System.Windows.Forms.Label();
            this.layoutTitle.SuspendLayout();
            this.SuspendLayout();
            //
            // layoutTitle
            //
            this.layoutTitle.AutoSize = true;
            this.layoutTitle.ColumnCount = 1;
            this.layoutTitle.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100F));
            this.layoutTitle.Controls.Add(this.labelTitle, 0, 0);
            this.layoutTitle.Controls.Add(this.labelSubtitle, 0, 1);
            this.layoutTitle.Dock = System.Windows.Forms.DockStyle.Fill;
            this.layoutTitle.Location = new System.Drawing.Point(0, 0);
            this.layoutTitle.Margin = new System.Windows.Forms.Padding(0, 0, 0, 10);
            this.layoutTitle.Name = "layoutTitle";
            this.layoutTitle.RowCount = 2;
            this.layoutTitle.RowStyles.Add(new System.Windows.Forms.RowStyle());
            this.layoutTitle.RowStyles.Add(new System.Windows.Forms.RowStyle());
            this.layoutTitle.Size = new System.Drawing.Size(456, 56);
            this.layoutTitle.TabIndex = 0;
            //
            // labelTitle
            //
            this.labelTitle.AutoSize = true;
            this.labelTitle.Font = new System.Drawing.Font("Segoe UI", 14.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelTitle.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(33)))), ((int)(((byte)(33)))), ((int)(((byte)(33)))));
            this.labelTitle.Location = new System.Drawing.Point(0, 0);
            this.labelTitle.Margin = new System.Windows.Forms.Padding(0, 0, 0, 4);
            this.labelTitle.Name = "labelTitle";
            this.labelTitle.Size = new System.Drawing.Size(102, 25);
            this.labelTitle.TabIndex = 0;
            this.labelTitle.Text = "ZipMaster";
            //
            // labelSubtitle
            //
            this.labelSubtitle.AutoSize = true;
            this.labelSubtitle.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelSubtitle.ForeColor = System.Drawing.SystemColors.GrayText;
            this.labelSubtitle.Location = new System.Drawing.Point(0, 29);
            this.labelSubtitle.Margin = new System.Windows.Forms.Padding(0, 0, 0, 12);
            this.labelSubtitle.Name = "labelSubtitle";
            this.labelSubtitle.Size = new System.Drawing.Size(305, 15);
            this.labelSubtitle.TabIndex = 1;
            this.labelSubtitle.Text = "파일 또는 폴더를 ZIP으로 압축하거나, ZIP을 풀어보세요.";
            //
            // TitleSectionControl
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.Transparent;
            this.Controls.Add(this.layoutTitle);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.Name = "TitleSectionControl";
            this.Size = new System.Drawing.Size(456, 56);
            this.layoutTitle.ResumeLayout(false);
            this.layoutTitle.PerformLayout();
            this.ResumeLayout(false);
        }

        private System.Windows.Forms.TableLayoutPanel layoutTitle;
        private System.Windows.Forms.Label labelTitle;
        private System.Windows.Forms.Label labelSubtitle;
    }
}

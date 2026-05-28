namespace VIXfaceSimulator
{
    partial class VIXfaceSimulator
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            LogTextBox = new TextBox();
            VIXfaceServerLabel = new Label();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.Location = new Point(14, 30);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Both;
            LogTextBox.Size = new Size(1158, 519);
            LogTextBox.TabIndex = 0;
            // 
            // VIXfaceServerLabel
            // 
            VIXfaceServerLabel.AutoSize = true;
            VIXfaceServerLabel.Location = new Point(16, 6);
            VIXfaceServerLabel.Name = "VIXfaceServerLabel";
            VIXfaceServerLabel.Size = new Size(159, 15);
            VIXfaceServerLabel.TabIndex = 1;
            VIXfaceServerLabel.Text = "VIXface 2.0 Simulator Log : ";
            // 
            // VIXfaceSimulator
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            AutoSize = true;
            ClientSize = new Size(1184, 561);
            Controls.Add(VIXfaceServerLabel);
            Controls.Add(LogTextBox);
            MaximizeBox = false;
            MaximumSize = new Size(1200, 600);
            MinimumSize = new Size(1200, 600);
            Name = "VIXfaceSimulator";
            Text = "VIXface 2.0 Simulator";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private TextBox LogTextBox;
        private Label VIXfaceServerLabel;
    }
}

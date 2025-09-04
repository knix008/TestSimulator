namespace VixAirSimulator
{
    partial class VixAirSimulator
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
            VixAirServerLabel = new Label();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.Location = new Point(14, 30);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Both;
            LogTextBox.Size = new Size(758, 399);
            LogTextBox.TabIndex = 0;
            // 
            // VixAirServerLabel
            // 
            VixAirServerLabel.AutoSize = true;
            VixAirServerLabel.Location = new Point(16, 6);
            VixAirServerLabel.Name = "VixAirServerLabel";
            VixAirServerLabel.Size = new Size(129, 15);
            VixAirServerLabel.TabIndex = 1;
            VixAirServerLabel.Text = "VixAir Server Output : ";
            VixAirServerLabel.Click += VixAirServerLabel_Click;
            // 
            // VixAirSimulator
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(784, 441);
            Controls.Add(VixAirServerLabel);
            Controls.Add(LogTextBox);
            MaximizeBox = false;
            MaximumSize = new Size(800, 480);
            MinimumSize = new Size(800, 480);
            Name = "VixAirSimulator";
            Text = "VixAir Simulator";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private TextBox LogTextBox;
        private Label VixAirServerLabel;
    }
}

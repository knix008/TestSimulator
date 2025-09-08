namespace ServerApp01
{
    partial class Server : System.Windows.Forms.Form
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            LogTextBox = new TextBox();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.Location = new Point(13, 7);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Horizontal;
            LogTextBox.Size = new Size(775, 431);
            LogTextBox.TabIndex = 0;
            // 
            // Server
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(800, 450);
            Controls.Add(LogTextBox);
            Name = "Server";
            Text = "Server";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private TextBox LogTextBox;
    }
}

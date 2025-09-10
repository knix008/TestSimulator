namespace TLSServer
{
    partial class TLSServer
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
            ServerLog = new Label();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.Location = new Point(12, 35);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(776, 403);
            LogTextBox.TabIndex = 0;
            // 
            // ServerLog
            // 
            ServerLog.AutoSize = true;
            ServerLog.Location = new Point(16, 9);
            ServerLog.Name = "ServerLog";
            ServerLog.Size = new Size(89, 15);
            ServerLog.TabIndex = 1;
            ServerLog.Text = "Log Messages :";
            // 
            // TLSServer
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(800, 450);
            Controls.Add(ServerLog);
            Controls.Add(LogTextBox);
            Name = "TLSServer";
            Text = "TLS Server";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private TextBox LogTextBox;
        private Label ServerLog;
    }
}

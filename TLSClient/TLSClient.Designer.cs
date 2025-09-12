namespace TLSClient
{
    partial class TLSClient
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
            ConnectButton = new Button();
            SendButton = new Button();
            ServerAddressTextBox = new TextBox();
            MessageTextBox = new TextBox();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.Location = new Point(12, 48);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(760, 390);
            LogTextBox.TabIndex = 0;
            // 
            // ConnectButton
            // 
            ConnectButton.Location = new Point(12, 12);
            ConnectButton.Name = "ConnectButton";
            ConnectButton.Size = new Size(141, 30);
            ConnectButton.TabIndex = 1;
            ConnectButton.Text = "Connect...";
            ConnectButton.UseVisualStyleBackColor = true;
            ConnectButton.Click += ConnectButton_Click;
            // 
            // SendButton
            // 
            SendButton.Location = new Point(382, 12);
            SendButton.Name = "SendButton";
            SendButton.Size = new Size(153, 30);
            SendButton.TabIndex = 2;
            SendButton.Text = "Send...";
            SendButton.UseVisualStyleBackColor = true;
            SendButton.Click += SendButton_Click;
            // 
            // ServerAddressTextBox
            // 
            ServerAddressTextBox.Location = new Point(158, 16);
            ServerAddressTextBox.Name = "ServerAddressTextBox";
            ServerAddressTextBox.Size = new Size(153, 23);
            ServerAddressTextBox.TabIndex = 3;
            ServerAddressTextBox.Text = "localhost";
            // 
            // MessageTextBox
            // 
            MessageTextBox.Location = new Point(541, 15);
            MessageTextBox.Name = "MessageTextBox";
            MessageTextBox.Size = new Size(231, 23);
            MessageTextBox.TabIndex = 4;
            MessageTextBox.Text = "Hello World!!!";
            // 
            // TLSClient
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(784, 461);
            Controls.Add(MessageTextBox);
            Controls.Add(ServerAddressTextBox);
            Controls.Add(SendButton);
            Controls.Add(ConnectButton);
            Controls.Add(LogTextBox);
            MaximizeBox = false;
            Name = "TLSClient";
            Text = "TLSClient";
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private TextBox LogTextBox;
        private Button ConnectButton;
        private Button SendButton;
        private TextBox ServerAddressTextBox;
        private TextBox MessageTextBox;
    }
}

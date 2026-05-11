namespace PCClient
{
    partial class ChatRoomForm
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

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.groupBoxChat = new System.Windows.Forms.GroupBox();
            this.labelStatus = new System.Windows.Forms.Label();
            this.labelCurrentRoom = new System.Windows.Forms.Label();
            this.buttonChangePassword = new System.Windows.Forms.Button();
            this.buttonLeaveRoom = new System.Windows.Forms.Button();
            this.buttonSendFile = new System.Windows.Forms.Button();
            this.buttonSendMessage = new System.Windows.Forms.Button();
            this.textBoxMessage = new System.Windows.Forms.TextBox();
            this.richTextBoxChatHistory = new System.Windows.Forms.RichTextBox();

            this.groupBoxChat.SuspendLayout();
            this.SuspendLayout();

            // 
            // groupBoxChat
            // 
            this.groupBoxChat.BackColor = System.Drawing.Color.FromArgb(248, 249, 250);
            this.groupBoxChat.Controls.Add(this.labelStatus);
            this.groupBoxChat.Controls.Add(this.labelCurrentRoom);
            this.groupBoxChat.Controls.Add(this.buttonChangePassword);
            this.groupBoxChat.Controls.Add(this.buttonLeaveRoom);
            this.groupBoxChat.Controls.Add(this.buttonSendFile);
            this.groupBoxChat.Controls.Add(this.buttonSendMessage);
            this.groupBoxChat.Controls.Add(this.textBoxMessage);
            this.groupBoxChat.Controls.Add(this.richTextBoxChatHistory);
            this.groupBoxChat.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.groupBoxChat.Font = new System.Drawing.Font("맑은 고딕", 10F, System.Drawing.FontStyle.Bold);
            this.groupBoxChat.Location = new System.Drawing.Point(15, 15);
            this.groupBoxChat.Name = "groupBoxChat";
            this.groupBoxChat.Padding = new System.Windows.Forms.Padding(10);
            this.groupBoxChat.Size = new System.Drawing.Size(650, 620);
            this.groupBoxChat.TabIndex = 0;
            this.groupBoxChat.TabStop = false;
            this.groupBoxChat.Text = "💬 채팅";

            // 
            // labelStatus
            // 
            this.labelStatus.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.labelStatus.AutoSize = true;
            this.labelStatus.Font = new System.Drawing.Font("맑은 고딕", 9F, System.Drawing.FontStyle.Bold);
            this.labelStatus.ForeColor = System.Drawing.Color.FromArgb(149, 165, 166);
            this.labelStatus.Location = new System.Drawing.Point(430, 30);
            this.labelStatus.Name = "labelStatus";
            this.labelStatus.Size = new System.Drawing.Size(103, 15);
            this.labelStatus.TabIndex = 0;
            this.labelStatus.Text = "⌛ 연결 중...";

            // 
            // labelCurrentRoom
            // 
            this.labelCurrentRoom.AutoSize = true;
            this.labelCurrentRoom.Font = new System.Drawing.Font("맑은 고딕", 10F, System.Drawing.FontStyle.Bold);
            this.labelCurrentRoom.ForeColor = System.Drawing.Color.FromArgb(52, 73, 94);
            this.labelCurrentRoom.Location = new System.Drawing.Point(20, 30);
            this.labelCurrentRoom.Name = "labelCurrentRoom";
            this.labelCurrentRoom.Size = new System.Drawing.Size(180, 19);
            this.labelCurrentRoom.TabIndex = 1;
            this.labelCurrentRoom.Text = "현재 방: (연결 중...)";

            // 
            // richTextBoxChatHistory
            // 
            this.richTextBoxChatHistory.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.richTextBoxChatHistory.BackColor = System.Drawing.Color.White;
            this.richTextBoxChatHistory.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.richTextBoxChatHistory.Font = new System.Drawing.Font("맑은 고딕", 9.75F);
            this.richTextBoxChatHistory.Location = new System.Drawing.Point(20, 60);
            this.richTextBoxChatHistory.Name = "richTextBoxChatHistory";
            this.richTextBoxChatHistory.ReadOnly = true;
            this.richTextBoxChatHistory.Size = new System.Drawing.Size(610, 480);
            this.richTextBoxChatHistory.TabIndex = 2;
            this.richTextBoxChatHistory.Text = "";

            // 
            // textBoxMessage
            // 
            this.textBoxMessage.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.textBoxMessage.Enabled = false;
            this.textBoxMessage.Font = new System.Drawing.Font("맑은 고딕", 9.75F);
            this.textBoxMessage.Location = new System.Drawing.Point(20, 550);
            this.textBoxMessage.Name = "textBoxMessage";
            this.textBoxMessage.Size = new System.Drawing.Size(430, 25);
            this.textBoxMessage.TabIndex = 3;
            this.textBoxMessage.KeyPress += new System.Windows.Forms.KeyPressEventHandler(this.textBoxMessage_KeyPress);

            // 
            // buttonSendMessage
            // 
            this.buttonSendMessage.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.buttonSendMessage.BackColor = System.Drawing.Color.FromArgb(84, 110, 122);
            this.buttonSendMessage.Enabled = false;
            this.buttonSendMessage.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonSendMessage.Font = new System.Drawing.Font("맑은 고딕", 9.75F, System.Drawing.FontStyle.Bold);
            this.buttonSendMessage.ForeColor = System.Drawing.Color.White;
            this.buttonSendMessage.Location = new System.Drawing.Point(460, 550);
            this.buttonSendMessage.Name = "buttonSendMessage";
            this.buttonSendMessage.Size = new System.Drawing.Size(80, 30);
            this.buttonSendMessage.TabIndex = 4;
            this.buttonSendMessage.Text = "전송";
            this.buttonSendMessage.UseVisualStyleBackColor = false;
            this.buttonSendMessage.Click += new System.EventHandler(this.buttonSendMessage_Click);

            // 
            // buttonSendFile
            // 
            this.buttonSendFile.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.buttonSendFile.BackColor = System.Drawing.Color.FromArgb(189, 195, 199);
            this.buttonSendFile.Enabled = false;
            this.buttonSendFile.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonSendFile.Font = new System.Drawing.Font("맑은 고딕", 9.75F, System.Drawing.FontStyle.Bold);
            this.buttonSendFile.ForeColor = System.Drawing.Color.FromArgb(52, 73, 94);
            this.buttonSendFile.Location = new System.Drawing.Point(550, 550);
            this.buttonSendFile.Name = "buttonSendFile";
            this.buttonSendFile.Size = new System.Drawing.Size(80, 30);
            this.buttonSendFile.TabIndex = 5;
            this.buttonSendFile.Text = "파일📎";
            this.buttonSendFile.UseVisualStyleBackColor = false;
            this.buttonSendFile.Click += new System.EventHandler(this.buttonSendFile_Click);

            // 
            // buttonLeaveRoom
            // 
            this.buttonLeaveRoom.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Right)));
            this.buttonLeaveRoom.BackColor = System.Drawing.Color.FromArgb(231, 76, 60);
            this.buttonLeaveRoom.Enabled = false;
            this.buttonLeaveRoom.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonLeaveRoom.Font = new System.Drawing.Font("맑은 고딕", 9F, System.Drawing.FontStyle.Bold);
            this.buttonLeaveRoom.ForeColor = System.Drawing.Color.White;
            this.buttonLeaveRoom.Location = new System.Drawing.Point(350, 586);
            this.buttonLeaveRoom.Name = "buttonLeaveRoom";
            this.buttonLeaveRoom.Size = new System.Drawing.Size(280, 26);
            this.buttonLeaveRoom.TabIndex = 6;
            this.buttonLeaveRoom.Text = "🔙 방 나가기 (창 닫기)";
            this.buttonLeaveRoom.UseVisualStyleBackColor = false;
            this.buttonLeaveRoom.Click += new System.EventHandler(this.buttonLeaveRoom_Click);

            // 
            // buttonChangePassword
            // 
            this.buttonChangePassword.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left)));
            this.buttonChangePassword.BackColor = System.Drawing.Color.FromArgb(189, 195, 199);
            this.buttonChangePassword.Enabled = false;
            this.buttonChangePassword.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonChangePassword.Font = new System.Drawing.Font("맑은 고딕", 9F, System.Drawing.FontStyle.Bold);
            this.buttonChangePassword.ForeColor = System.Drawing.Color.FromArgb(52, 73, 94);
            this.buttonChangePassword.Location = new System.Drawing.Point(20, 586);
            this.buttonChangePassword.Name = "buttonChangePassword";
            this.buttonChangePassword.Size = new System.Drawing.Size(320, 26);
            this.buttonChangePassword.TabIndex = 7;
            this.buttonChangePassword.Text = "비밀번호 변경 🔑 (방장만 가능)";
            this.buttonChangePassword.UseVisualStyleBackColor = false;
            this.buttonChangePassword.Click += new System.EventHandler(this.buttonChangePassword_Click);

            // 
            // ChatRoomForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(680, 650);
            this.Controls.Add(this.groupBoxChat);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Sizable;
            this.MaximizeBox = true;
            this.MinimumSize = new System.Drawing.Size(500, 500);
            this.Name = "ChatRoomForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "채팅방";
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.ChatRoomForm_FormClosing);
            this.Load += new System.EventHandler(this.ChatRoomForm_Load);
            this.groupBoxChat.ResumeLayout(false);
            this.groupBoxChat.PerformLayout();
            this.ResumeLayout(false);
        }

        #endregion

        private System.Windows.Forms.GroupBox groupBoxChat;
        private System.Windows.Forms.Label labelStatus;
        private System.Windows.Forms.Label labelCurrentRoom;
        private System.Windows.Forms.RichTextBox richTextBoxChatHistory;
        private System.Windows.Forms.TextBox textBoxMessage;
        private System.Windows.Forms.Button buttonSendMessage;
        private System.Windows.Forms.Button buttonSendFile;
        private System.Windows.Forms.Button buttonLeaveRoom;
        private System.Windows.Forms.Button buttonChangePassword;
    }
}

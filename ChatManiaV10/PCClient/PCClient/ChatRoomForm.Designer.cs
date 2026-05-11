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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(ChatRoomForm));
            groupBoxChat = new GroupBox();
            labelStatus = new Label();
            labelCurrentRoom = new Label();
            buttonChangePassword = new Button();
            buttonLeaveRoom = new Button();
            buttonSendFile = new Button();
            buttonSendMessage = new Button();
            textBoxMessage = new TextBox();
            richTextBoxChatHistory = new RichTextBox();
            groupBoxChat.SuspendLayout();
            SuspendLayout();
            // 
            // groupBoxChat
            // 
            groupBoxChat.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            groupBoxChat.BackColor = Color.FromArgb(248, 249, 250);
            groupBoxChat.Controls.Add(labelStatus);
            groupBoxChat.Controls.Add(labelCurrentRoom);
            groupBoxChat.Controls.Add(buttonChangePassword);
            groupBoxChat.Controls.Add(buttonLeaveRoom);
            groupBoxChat.Controls.Add(buttonSendFile);
            groupBoxChat.Controls.Add(buttonSendMessage);
            groupBoxChat.Controls.Add(textBoxMessage);
            groupBoxChat.Controls.Add(richTextBoxChatHistory);
            groupBoxChat.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
            groupBoxChat.Location = new Point(15, 19);
            groupBoxChat.Margin = new Padding(3, 4, 3, 4);
            groupBoxChat.Name = "groupBoxChat";
            groupBoxChat.Padding = new Padding(10, 12, 10, 12);
            groupBoxChat.Size = new Size(650, 775);
            groupBoxChat.TabIndex = 0;
            groupBoxChat.TabStop = false;
            groupBoxChat.Text = "💬 채팅";
            // 
            // labelStatus
            // 
            labelStatus.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            labelStatus.AutoSize = true;
            labelStatus.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            labelStatus.ForeColor = Color.FromArgb(149, 165, 166);
            labelStatus.Location = new Point(430, 38);
            labelStatus.Name = "labelStatus";
            labelStatus.Size = new Size(73, 15);
            labelStatus.TabIndex = 0;
            labelStatus.Text = "⌛ 연결 중...";
            // 
            // labelCurrentRoom
            // 
            labelCurrentRoom.AutoSize = true;
            labelCurrentRoom.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
            labelCurrentRoom.ForeColor = Color.FromArgb(52, 73, 94);
            labelCurrentRoom.Location = new Point(20, 38);
            labelCurrentRoom.Name = "labelCurrentRoom";
            labelCurrentRoom.Size = new Size(134, 19);
            labelCurrentRoom.TabIndex = 1;
            labelCurrentRoom.Text = "현재 방: (연결 중...)";
            // 
            // buttonChangePassword
            // 
            buttonChangePassword.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            buttonChangePassword.BackColor = Color.FromArgb(189, 195, 199);
            buttonChangePassword.Enabled = false;
            buttonChangePassword.FlatStyle = FlatStyle.Flat;
            buttonChangePassword.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            buttonChangePassword.ForeColor = Color.FromArgb(52, 73, 94);
            buttonChangePassword.Location = new Point(20, 732);
            buttonChangePassword.Margin = new Padding(3, 4, 3, 4);
            buttonChangePassword.Name = "buttonChangePassword";
            buttonChangePassword.Size = new Size(320, 32);
            buttonChangePassword.TabIndex = 7;
            buttonChangePassword.Text = "비밀번호 변경 🔑 (방장만 가능)";
            buttonChangePassword.UseVisualStyleBackColor = false;
            buttonChangePassword.Click += buttonChangePassword_Click;
            // 
            // buttonLeaveRoom
            // 
            buttonLeaveRoom.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            buttonLeaveRoom.BackColor = Color.FromArgb(231, 76, 60);
            buttonLeaveRoom.Enabled = false;
            buttonLeaveRoom.FlatStyle = FlatStyle.Flat;
            buttonLeaveRoom.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            buttonLeaveRoom.ForeColor = Color.White;
            buttonLeaveRoom.Location = new Point(350, 732);
            buttonLeaveRoom.Margin = new Padding(3, 4, 3, 4);
            buttonLeaveRoom.Name = "buttonLeaveRoom";
            buttonLeaveRoom.Size = new Size(280, 32);
            buttonLeaveRoom.TabIndex = 6;
            buttonLeaveRoom.Text = "🔙 방 나가기 (창 닫기)";
            buttonLeaveRoom.UseVisualStyleBackColor = false;
            buttonLeaveRoom.Click += buttonLeaveRoom_Click;
            // 
            // buttonSendFile
            // 
            buttonSendFile.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            buttonSendFile.BackColor = Color.FromArgb(189, 195, 199);
            buttonSendFile.Enabled = false;
            buttonSendFile.FlatStyle = FlatStyle.Flat;
            buttonSendFile.Font = new Font("맑은 고딕", 9.75F, FontStyle.Bold);
            buttonSendFile.ForeColor = Color.FromArgb(52, 73, 94);
            buttonSendFile.Location = new Point(550, 688);
            buttonSendFile.Margin = new Padding(3, 4, 3, 4);
            buttonSendFile.Name = "buttonSendFile";
            buttonSendFile.Size = new Size(80, 38);
            buttonSendFile.TabIndex = 5;
            buttonSendFile.Text = "파일📎";
            buttonSendFile.UseVisualStyleBackColor = false;
            buttonSendFile.Click += buttonSendFile_Click;
            // 
            // buttonSendMessage
            // 
            buttonSendMessage.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            buttonSendMessage.BackColor = Color.FromArgb(84, 110, 122);
            buttonSendMessage.Enabled = false;
            buttonSendMessage.FlatStyle = FlatStyle.Flat;
            buttonSendMessage.Font = new Font("맑은 고딕", 9.75F, FontStyle.Bold);
            buttonSendMessage.ForeColor = Color.White;
            buttonSendMessage.Location = new Point(460, 688);
            buttonSendMessage.Margin = new Padding(3, 4, 3, 4);
            buttonSendMessage.Name = "buttonSendMessage";
            buttonSendMessage.Size = new Size(80, 38);
            buttonSendMessage.TabIndex = 4;
            buttonSendMessage.Text = "전송";
            buttonSendMessage.UseVisualStyleBackColor = false;
            buttonSendMessage.Click += buttonSendMessage_Click;
            // 
            // textBoxMessage
            // 
            textBoxMessage.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            textBoxMessage.Enabled = false;
            textBoxMessage.Font = new Font("맑은 고딕", 9.75F);
            textBoxMessage.Location = new Point(20, 688);
            textBoxMessage.Margin = new Padding(3, 4, 3, 4);
            textBoxMessage.Name = "textBoxMessage";
            textBoxMessage.Size = new Size(430, 25);
            textBoxMessage.TabIndex = 3;
            textBoxMessage.KeyPress += textBoxMessage_KeyPress;
            // 
            // richTextBoxChatHistory
            // 
            richTextBoxChatHistory.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            richTextBoxChatHistory.BackColor = Color.White;
            richTextBoxChatHistory.BorderStyle = BorderStyle.FixedSingle;
            richTextBoxChatHistory.Font = new Font("맑은 고딕", 9.75F);
            richTextBoxChatHistory.Location = new Point(20, 75);
            richTextBoxChatHistory.Margin = new Padding(3, 4, 3, 4);
            richTextBoxChatHistory.Name = "richTextBoxChatHistory";
            richTextBoxChatHistory.ReadOnly = true;
            richTextBoxChatHistory.Size = new Size(610, 599);
            richTextBoxChatHistory.TabIndex = 2;
            richTextBoxChatHistory.Text = "";
            // 
            // ChatRoomForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.White;
            ClientSize = new Size(680, 812);
            Controls.Add(groupBoxChat);
            Icon = (Icon)resources.GetObject("$this.Icon");
            Margin = new Padding(3, 4, 3, 4);
            MinimumSize = new Size(500, 615);
            Name = "ChatRoomForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "채팅방";
            FormClosing += ChatRoomForm_FormClosing;
            Load += ChatRoomForm_Load;
            groupBoxChat.ResumeLayout(false);
            groupBoxChat.PerformLayout();
            ResumeLayout(false);
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

namespace PCClient
{
    partial class MainForm
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
            this.groupBoxConnection = new System.Windows.Forms.GroupBox();
            this.textBoxNickname = new System.Windows.Forms.TextBox();
            this.labelNickname = new System.Windows.Forms.Label();
            this.textBoxServerUrl = new System.Windows.Forms.TextBox();
            this.labelServerUrl = new System.Windows.Forms.Label();
            this.buttonConnect = new System.Windows.Forms.Button();
            this.buttonDisconnect = new System.Windows.Forms.Button();
            this.labelStatus = new System.Windows.Forms.Label();

            this.groupBoxRoomManagement = new System.Windows.Forms.GroupBox();
            this.buttonRefreshRooms = new System.Windows.Forms.Button();
            this.listViewRooms = new System.Windows.Forms.ListView();
            this.columnHeaderRoomName = new System.Windows.Forms.ColumnHeader();
            this.columnHeaderRoomId = new System.Windows.Forms.ColumnHeader();
            this.columnHeaderPeers = new System.Windows.Forms.ColumnHeader();
            this.columnHeaderLocked = new System.Windows.Forms.ColumnHeader();
            this.textBoxRoomName = new System.Windows.Forms.TextBox();
            this.labelRoomName = new System.Windows.Forms.Label();
            this.textBoxRoomPassword = new System.Windows.Forms.TextBox();
            this.labelRoomPassword = new System.Windows.Forms.Label();
            this.numericUpDownMaxPeers = new System.Windows.Forms.NumericUpDown();
            this.labelMaxPeers = new System.Windows.Forms.Label();
            this.buttonCreateRoom = new System.Windows.Forms.Button();
            this.buttonJoinRoom = new System.Windows.Forms.Button();
            this.buttonLeaveRoom = new System.Windows.Forms.Button();

            this.groupBoxChat = new System.Windows.Forms.GroupBox();
            this.richTextBoxChatHistory = new System.Windows.Forms.RichTextBox();
            this.textBoxMessage = new System.Windows.Forms.TextBox();
            this.buttonSendMessage = new System.Windows.Forms.Button();
            this.buttonSendFile = new System.Windows.Forms.Button();
            this.buttonChangePassword = new System.Windows.Forms.Button();
            this.labelCurrentRoom = new System.Windows.Forms.Label();

            this.groupBoxConnection.SuspendLayout();
            this.groupBoxRoomManagement.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericUpDownMaxPeers)).BeginInit();
            this.groupBoxChat.SuspendLayout();
            this.SuspendLayout();

            // 
            // groupBoxConnection
            // 
            this.groupBoxConnection.Controls.Add(this.labelStatus);
            this.groupBoxConnection.Controls.Add(this.buttonDisconnect);
            this.groupBoxConnection.Controls.Add(this.buttonConnect);
            this.groupBoxConnection.Controls.Add(this.textBoxServerUrl);
            this.groupBoxConnection.Controls.Add(this.labelServerUrl);
            this.groupBoxConnection.Controls.Add(this.textBoxNickname);
            this.groupBoxConnection.Controls.Add(this.labelNickname);
            this.groupBoxConnection.Location = new System.Drawing.Point(12, 12);
            this.groupBoxConnection.Name = "groupBoxConnection";
            this.groupBoxConnection.Size = new System.Drawing.Size(360, 140);
            this.groupBoxConnection.TabIndex = 0;
            this.groupBoxConnection.TabStop = false;
            this.groupBoxConnection.Text = "서버 연결";

            // 
            // textBoxNickname
            // 
            this.textBoxNickname.Location = new System.Drawing.Point(80, 25);
            this.textBoxNickname.MaxLength = 20;
            this.textBoxNickname.Name = "textBoxNickname";
            this.textBoxNickname.Size = new System.Drawing.Size(260, 23);
            this.textBoxNickname.TabIndex = 0;
            this.textBoxNickname.Text = "C#사용자";

            // 
            // labelNickname
            // 
            this.labelNickname.AutoSize = true;
            this.labelNickname.Location = new System.Drawing.Point(15, 28);
            this.labelNickname.Name = "labelNickname";
            this.labelNickname.Size = new System.Drawing.Size(43, 15);
            this.labelNickname.TabIndex = 1;
            this.labelNickname.Text = "닉네임:";

            // 
            // textBoxServerUrl
            // 
            this.textBoxServerUrl.Location = new System.Drawing.Point(80, 54);
            this.textBoxServerUrl.Name = "textBoxServerUrl";
            this.textBoxServerUrl.Size = new System.Drawing.Size(260, 23);
            this.textBoxServerUrl.TabIndex = 2;
            this.textBoxServerUrl.Text = "ws://localhost:8787";

            // 
            // labelServerUrl
            // 
            this.labelServerUrl.AutoSize = true;
            this.labelServerUrl.Location = new System.Drawing.Point(15, 57);
            this.labelServerUrl.Name = "labelServerUrl";
            this.labelServerUrl.Size = new System.Drawing.Size(59, 15);
            this.labelServerUrl.TabIndex = 3;
            this.labelServerUrl.Text = "서버 주소:";

            // 
            // buttonConnect
            // 
            this.buttonConnect.Location = new System.Drawing.Point(80, 83);
            this.buttonConnect.Name = "buttonConnect";
            this.buttonConnect.Size = new System.Drawing.Size(120, 30);
            this.buttonConnect.TabIndex = 4;
            this.buttonConnect.Text = "연결";
            this.buttonConnect.UseVisualStyleBackColor = true;
            this.buttonConnect.Click += new System.EventHandler(this.buttonConnect_Click);

            // 
            // buttonDisconnect
            // 
            this.buttonDisconnect.Enabled = false;
            this.buttonDisconnect.Location = new System.Drawing.Point(220, 83);
            this.buttonDisconnect.Name = "buttonDisconnect";
            this.buttonDisconnect.Size = new System.Drawing.Size(120, 30);
            this.buttonDisconnect.TabIndex = 5;
            this.buttonDisconnect.Text = "연결 해제";
            this.buttonDisconnect.UseVisualStyleBackColor = true;
            this.buttonDisconnect.Click += new System.EventHandler(this.buttonDisconnect_Click);

            // 
            // labelStatus
            // 
            this.labelStatus.AutoSize = true;
            this.labelStatus.ForeColor = System.Drawing.Color.Red;
            this.labelStatus.Location = new System.Drawing.Point(15, 116);
            this.labelStatus.Name = "labelStatus";
            this.labelStatus.Size = new System.Drawing.Size(91, 15);
            this.labelStatus.TabIndex = 6;
            this.labelStatus.Text = "연결되지 않음";

            // 
            // groupBoxRoomManagement
            // 
            this.groupBoxRoomManagement.Controls.Add(this.buttonLeaveRoom);
            this.groupBoxRoomManagement.Controls.Add(this.buttonJoinRoom);
            this.groupBoxRoomManagement.Controls.Add(this.buttonCreateRoom);
            this.groupBoxRoomManagement.Controls.Add(this.numericUpDownMaxPeers);
            this.groupBoxRoomManagement.Controls.Add(this.labelMaxPeers);
            this.groupBoxRoomManagement.Controls.Add(this.textBoxRoomPassword);
            this.groupBoxRoomManagement.Controls.Add(this.labelRoomPassword);
            this.groupBoxRoomManagement.Controls.Add(this.textBoxRoomName);
            this.groupBoxRoomManagement.Controls.Add(this.labelRoomName);
            this.groupBoxRoomManagement.Controls.Add(this.listViewRooms);
            this.groupBoxRoomManagement.Controls.Add(this.buttonRefreshRooms);
            this.groupBoxRoomManagement.Location = new System.Drawing.Point(12, 158);
            this.groupBoxRoomManagement.Name = "groupBoxRoomManagement";
            this.groupBoxRoomManagement.Size = new System.Drawing.Size(360, 420);
            this.groupBoxRoomManagement.TabIndex = 1;
            this.groupBoxRoomManagement.TabStop = false;
            this.groupBoxRoomManagement.Text = "방 관리";

            // 
            // buttonRefreshRooms
            // 
            this.buttonRefreshRooms.Enabled = false;
            this.buttonRefreshRooms.Location = new System.Drawing.Point(15, 22);
            this.buttonRefreshRooms.Name = "buttonRefreshRooms";
            this.buttonRefreshRooms.Size = new System.Drawing.Size(325, 30);
            this.buttonRefreshRooms.TabIndex = 0;
            this.buttonRefreshRooms.Text = "방 목록 새로고침";
            this.buttonRefreshRooms.UseVisualStyleBackColor = true;
            this.buttonRefreshRooms.Click += new System.EventHandler(this.buttonRefreshRooms_Click);

            // 
            // listViewRooms
            // 
            this.listViewRooms.Columns.AddRange(new System.Windows.Forms.ColumnHeader[] {
            this.columnHeaderRoomName,
            this.columnHeaderRoomId,
            this.columnHeaderPeers,
            this.columnHeaderLocked});
            this.listViewRooms.FullRowSelect = true;
            this.listViewRooms.Location = new System.Drawing.Point(15, 58);
            this.listViewRooms.MultiSelect = false;
            this.listViewRooms.Name = "listViewRooms";
            this.listViewRooms.Size = new System.Drawing.Size(325, 150);
            this.listViewRooms.TabIndex = 1;
            this.listViewRooms.UseCompatibleStateImageBehavior = false;
            this.listViewRooms.View = System.Windows.Forms.View.Details;

            // 
            // columnHeaderRoomName
            // 
            this.columnHeaderRoomName.Text = "방 이름";
            this.columnHeaderRoomName.Width = 120;

            // 
            // columnHeaderRoomId
            // 
            this.columnHeaderRoomId.Text = "방 ID";
            this.columnHeaderRoomId.Width = 80;

            // 
            // columnHeaderPeers
            // 
            this.columnHeaderPeers.Text = "인원";
            this.columnHeaderPeers.Width = 50;

            // 
            // columnHeaderLocked
            // 
            this.columnHeaderLocked.Text = "잠금";
            this.columnHeaderLocked.Width = 50;

            // 
            // textBoxRoomName
            // 
            this.textBoxRoomName.Location = new System.Drawing.Point(100, 220);
            this.textBoxRoomName.Name = "textBoxRoomName";
            this.textBoxRoomName.Size = new System.Drawing.Size(240, 23);
            this.textBoxRoomName.TabIndex = 2;
            this.textBoxRoomName.Text = "새 방";

            // 
            // labelRoomName
            // 
            this.labelRoomName.AutoSize = true;
            this.labelRoomName.Location = new System.Drawing.Point(15, 223);
            this.labelRoomName.Name = "labelRoomName";
            this.labelRoomName.Size = new System.Drawing.Size(47, 15);
            this.labelRoomName.TabIndex = 3;
            this.labelRoomName.Text = "방 이름:";

            // 
            // textBoxRoomPassword
            // 
            this.textBoxRoomPassword.Location = new System.Drawing.Point(100, 249);
            this.textBoxRoomPassword.Name = "textBoxRoomPassword";
            this.textBoxRoomPassword.PasswordChar = '*';
            this.textBoxRoomPassword.Size = new System.Drawing.Size(240, 23);
            this.textBoxRoomPassword.TabIndex = 4;

            // 
            // labelRoomPassword
            // 
            this.labelRoomPassword.AutoSize = true;
            this.labelRoomPassword.Location = new System.Drawing.Point(15, 252);
            this.labelRoomPassword.Name = "labelRoomPassword";
            this.labelRoomPassword.Size = new System.Drawing.Size(79, 15);
            this.labelRoomPassword.TabIndex = 5;
            this.labelRoomPassword.Text = "비밀번호(옵션):";

            // 
            // numericUpDownMaxPeers
            // 
            this.numericUpDownMaxPeers.Location = new System.Drawing.Point(100, 278);
            this.numericUpDownMaxPeers.Maximum = new decimal(new int[] { 20, 0, 0, 0 });
            this.numericUpDownMaxPeers.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
            this.numericUpDownMaxPeers.Name = "numericUpDownMaxPeers";
            this.numericUpDownMaxPeers.Size = new System.Drawing.Size(240, 23);
            this.numericUpDownMaxPeers.TabIndex = 6;
            this.numericUpDownMaxPeers.Value = new decimal(new int[] { 10, 0, 0, 0 });

            // 
            // labelMaxPeers
            // 
            this.labelMaxPeers.AutoSize = true;
            this.labelMaxPeers.Location = new System.Drawing.Point(15, 280);
            this.labelMaxPeers.Name = "labelMaxPeers";
            this.labelMaxPeers.Size = new System.Drawing.Size(59, 15);
            this.labelMaxPeers.TabIndex = 7;
            this.labelMaxPeers.Text = "최대 인원:";

            // 
            // buttonCreateRoom
            // 
            this.buttonCreateRoom.Enabled = false;
            this.buttonCreateRoom.Location = new System.Drawing.Point(15, 310);
            this.buttonCreateRoom.Name = "buttonCreateRoom";
            this.buttonCreateRoom.Size = new System.Drawing.Size(325, 30);
            this.buttonCreateRoom.TabIndex = 8;
            this.buttonCreateRoom.Text = "방 만들기";
            this.buttonCreateRoom.UseVisualStyleBackColor = true;
            this.buttonCreateRoom.Click += new System.EventHandler(this.buttonCreateRoom_Click);

            // 
            // buttonJoinRoom
            // 
            this.buttonJoinRoom.Enabled = false;
            this.buttonJoinRoom.Location = new System.Drawing.Point(15, 346);
            this.buttonJoinRoom.Name = "buttonJoinRoom";
            this.buttonJoinRoom.Size = new System.Drawing.Size(160, 30);
            this.buttonJoinRoom.TabIndex = 9;
            this.buttonJoinRoom.Text = "선택한 방 참가";
            this.buttonJoinRoom.UseVisualStyleBackColor = true;
            this.buttonJoinRoom.Click += new System.EventHandler(this.buttonJoinRoom_Click);

            // 
            // buttonLeaveRoom
            // 
            this.buttonLeaveRoom.Enabled = false;
            this.buttonLeaveRoom.Location = new System.Drawing.Point(180, 346);
            this.buttonLeaveRoom.Name = "buttonLeaveRoom";
            this.buttonLeaveRoom.Size = new System.Drawing.Size(160, 30);
            this.buttonLeaveRoom.TabIndex = 10;
            this.buttonLeaveRoom.Text = "방 나가기";
            this.buttonLeaveRoom.UseVisualStyleBackColor = true;
            this.buttonLeaveRoom.Click += new System.EventHandler(this.buttonLeaveRoom_Click);

            // 
            // groupBoxChat
            // 
            this.groupBoxChat.Controls.Add(this.labelCurrentRoom);
            this.groupBoxChat.Controls.Add(this.buttonChangePassword);
            this.groupBoxChat.Controls.Add(this.buttonSendFile);
            this.groupBoxChat.Controls.Add(this.buttonSendMessage);
            this.groupBoxChat.Controls.Add(this.textBoxMessage);
            this.groupBoxChat.Controls.Add(this.richTextBoxChatHistory);
            this.groupBoxChat.Location = new System.Drawing.Point(378, 12);
            this.groupBoxChat.Name = "groupBoxChat";
            this.groupBoxChat.Size = new System.Drawing.Size(590, 566);
            this.groupBoxChat.TabIndex = 2;
            this.groupBoxChat.TabStop = false;
            this.groupBoxChat.Text = "채팅";

            // 
            // richTextBoxChatHistory
            // 
            this.richTextBoxChatHistory.BackColor = System.Drawing.Color.White;
            this.richTextBoxChatHistory.Location = new System.Drawing.Point(15, 50);
            this.richTextBoxChatHistory.Name = "richTextBoxChatHistory";
            this.richTextBoxChatHistory.ReadOnly = true;
            this.richTextBoxChatHistory.Size = new System.Drawing.Size(560, 440);
            this.richTextBoxChatHistory.TabIndex = 0;
            this.richTextBoxChatHistory.Text = "";

            // 
            // textBoxMessage
            // 
            this.textBoxMessage.Enabled = false;
            this.textBoxMessage.Location = new System.Drawing.Point(15, 500);
            this.textBoxMessage.Name = "textBoxMessage";
            this.textBoxMessage.Size = new System.Drawing.Size(400, 23);
            this.textBoxMessage.TabIndex = 1;
            this.textBoxMessage.KeyPress += new System.Windows.Forms.KeyPressEventHandler(this.textBoxMessage_KeyPress);

            // 
            // buttonSendMessage
            // 
            this.buttonSendMessage.Enabled = false;
            this.buttonSendMessage.Location = new System.Drawing.Point(421, 496);
            this.buttonSendMessage.Name = "buttonSendMessage";
            this.buttonSendMessage.Size = new System.Drawing.Size(80, 30);
            this.buttonSendMessage.TabIndex = 2;
            this.buttonSendMessage.Text = "전송";
            this.buttonSendMessage.UseVisualStyleBackColor = true;
            this.buttonSendMessage.Click += new System.EventHandler(this.buttonSendMessage_Click);

            // 
            // buttonSendFile
            // 
            this.buttonSendFile.Enabled = false;
            this.buttonSendFile.Location = new System.Drawing.Point(507, 496);
            this.buttonSendFile.Name = "buttonSendFile";
            this.buttonSendFile.Size = new System.Drawing.Size(68, 30);
            this.buttonSendFile.TabIndex = 3;
            this.buttonSendFile.Text = "파일📎";
            this.buttonSendFile.UseVisualStyleBackColor = true;
            this.buttonSendFile.Click += new System.EventHandler(this.buttonSendFile_Click);

            // 
            // buttonChangePassword
            // 
            this.buttonChangePassword.Enabled = false;
            this.buttonChangePassword.Location = new System.Drawing.Point(15, 532);
            this.buttonChangePassword.Name = "buttonChangePassword";
            this.buttonChangePassword.Size = new System.Drawing.Size(150, 25);
            this.buttonChangePassword.TabIndex = 4;
            this.buttonChangePassword.Text = "비밀번호 변경 🔑";
            this.buttonChangePassword.UseVisualStyleBackColor = true;
            this.buttonChangePassword.Click += new System.EventHandler(this.buttonChangePassword_Click);

            // 
            // labelCurrentRoom
            // 
            this.labelCurrentRoom.AutoSize = true;
            this.labelCurrentRoom.Font = new System.Drawing.Font("맑은 고딕", 9F, System.Drawing.FontStyle.Bold);
            this.labelCurrentRoom.ForeColor = System.Drawing.Color.Blue;
            this.labelCurrentRoom.Location = new System.Drawing.Point(15, 25);
            this.labelCurrentRoom.Name = "labelCurrentRoom";
            this.labelCurrentRoom.Size = new System.Drawing.Size(150, 15);
            this.labelCurrentRoom.TabIndex = 5;
            this.labelCurrentRoom.Text = "현재 방: (참가하지 않음)";

            // 
            // MainForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(980, 590);
            this.Controls.Add(this.groupBoxChat);
            this.Controls.Add(this.groupBoxRoomManagement);
            this.Controls.Add(this.groupBoxConnection);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.Name = "MainForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "P2P Chat Client (C#)";
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.MainForm_FormClosing);
            this.groupBoxConnection.ResumeLayout(false);
            this.groupBoxConnection.PerformLayout();
            this.groupBoxRoomManagement.ResumeLayout(false);
            this.groupBoxRoomManagement.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericUpDownMaxPeers)).EndInit();
            this.groupBoxChat.ResumeLayout(false);
            this.groupBoxChat.PerformLayout();
            this.ResumeLayout(false);
        }

        #endregion

        private System.Windows.Forms.GroupBox groupBoxConnection;
        private System.Windows.Forms.TextBox textBoxNickname;
        private System.Windows.Forms.Label labelNickname;
        private System.Windows.Forms.TextBox textBoxServerUrl;
        private System.Windows.Forms.Label labelServerUrl;
        private System.Windows.Forms.Button buttonConnect;
        private System.Windows.Forms.Button buttonDisconnect;
        private System.Windows.Forms.Label labelStatus;

        private System.Windows.Forms.GroupBox groupBoxRoomManagement;
        private System.Windows.Forms.Button buttonRefreshRooms;
        private System.Windows.Forms.ListView listViewRooms;
        private System.Windows.Forms.ColumnHeader columnHeaderRoomName;
        private System.Windows.Forms.ColumnHeader columnHeaderRoomId;
        private System.Windows.Forms.ColumnHeader columnHeaderPeers;
        private System.Windows.Forms.ColumnHeader columnHeaderLocked;
        private System.Windows.Forms.TextBox textBoxRoomName;
        private System.Windows.Forms.Label labelRoomName;
        private System.Windows.Forms.TextBox textBoxRoomPassword;
        private System.Windows.Forms.Label labelRoomPassword;
        private System.Windows.Forms.NumericUpDown numericUpDownMaxPeers;
        private System.Windows.Forms.Label labelMaxPeers;
        private System.Windows.Forms.Button buttonCreateRoom;
        private System.Windows.Forms.Button buttonJoinRoom;
        private System.Windows.Forms.Button buttonLeaveRoom;

        private System.Windows.Forms.GroupBox groupBoxChat;
        private System.Windows.Forms.RichTextBox richTextBoxChatHistory;
        private System.Windows.Forms.TextBox textBoxMessage;
        private System.Windows.Forms.Button buttonSendMessage;
        private System.Windows.Forms.Button buttonSendFile;
        private System.Windows.Forms.Button buttonChangePassword;
        private System.Windows.Forms.Label labelCurrentRoom;
    }
}

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
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            groupBoxConnection = new GroupBox();
            labelStatus = new Label();
            buttonDisconnect = new Button();
            buttonConnect = new Button();
            textBoxServerUrl = new TextBox();
            labelServerUrl = new Label();
            textBoxNickname = new TextBox();
            labelNickname = new Label();
            groupBoxRoomManagement = new GroupBox();
            buttonJoinRoom = new Button();
            buttonCreateRoom = new Button();
            numericUpDownMaxPeers = new NumericUpDown();
            labelMaxPeers = new Label();
            textBoxRoomPassword = new TextBox();
            labelRoomPassword = new Label();
            textBoxRoomName = new TextBox();
            labelRoomName = new Label();
            listViewRooms = new ListView();
            columnHeaderRoomName = new ColumnHeader();
            columnHeaderRoomId = new ColumnHeader();
            columnHeaderPeers = new ColumnHeader();
            columnHeaderLocked = new ColumnHeader();
            buttonRefreshRooms = new Button();
            groupBoxConnection.SuspendLayout();
            groupBoxRoomManagement.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)numericUpDownMaxPeers).BeginInit();
            SuspendLayout();
            // 
            // groupBoxConnection
            // 
            groupBoxConnection.BackColor = Color.FromArgb(248, 249, 250);
            groupBoxConnection.Controls.Add(labelStatus);
            groupBoxConnection.Controls.Add(buttonDisconnect);
            groupBoxConnection.Controls.Add(buttonConnect);
            groupBoxConnection.Controls.Add(textBoxServerUrl);
            groupBoxConnection.Controls.Add(labelServerUrl);
            groupBoxConnection.Controls.Add(textBoxNickname);
            groupBoxConnection.Controls.Add(labelNickname);
            groupBoxConnection.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
            groupBoxConnection.Location = new Point(15, 19);
            groupBoxConnection.Margin = new Padding(3, 4, 3, 4);
            groupBoxConnection.Name = "groupBoxConnection";
            groupBoxConnection.Padding = new Padding(10, 12, 10, 12);
            groupBoxConnection.Size = new Size(380, 200);
            groupBoxConnection.TabIndex = 0;
            groupBoxConnection.TabStop = false;
            groupBoxConnection.Text = "🔌 서버 연결";
            // 
            // labelStatus
            // 
            labelStatus.AutoSize = true;
            labelStatus.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            labelStatus.ForeColor = Color.FromArgb(149, 165, 166);
            labelStatus.Location = new Point(20, 175);
            labelStatus.Name = "labelStatus";
            labelStatus.Size = new Size(100, 15);
            labelStatus.TabIndex = 6;
            labelStatus.Text = "❌ 연결되지 않음";
            // 
            // buttonDisconnect
            // 
            buttonDisconnect.BackColor = Color.FromArgb(189, 195, 199);
            buttonDisconnect.Enabled = false;
            buttonDisconnect.FlatStyle = FlatStyle.Flat;
            buttonDisconnect.Font = new Font("맑은 고딕", 9.75F, FontStyle.Bold);
            buttonDisconnect.ForeColor = Color.FromArgb(52, 73, 94);
            buttonDisconnect.Location = new Point(230, 131);
            buttonDisconnect.Margin = new Padding(3, 4, 3, 4);
            buttonDisconnect.Name = "buttonDisconnect";
            buttonDisconnect.Size = new Size(130, 44);
            buttonDisconnect.TabIndex = 5;
            buttonDisconnect.Text = "연결 해제";
            buttonDisconnect.UseVisualStyleBackColor = false;
            buttonDisconnect.Click += buttonDisconnect_Click;
            // 
            // buttonConnect
            // 
            buttonConnect.BackColor = Color.FromArgb(84, 110, 122);
            buttonConnect.FlatStyle = FlatStyle.Flat;
            buttonConnect.Font = new Font("맑은 고딕", 9.75F, FontStyle.Bold);
            buttonConnect.ForeColor = Color.White;
            buttonConnect.Location = new Point(95, 131);
            buttonConnect.Margin = new Padding(3, 4, 3, 4);
            buttonConnect.Name = "buttonConnect";
            buttonConnect.Size = new Size(130, 44);
            buttonConnect.TabIndex = 4;
            buttonConnect.Text = "연결";
            buttonConnect.UseVisualStyleBackColor = false;
            buttonConnect.Click += buttonConnect_Click;
            // 
            // textBoxServerUrl
            // 
            textBoxServerUrl.Font = new Font("맑은 고딕", 9F);
            textBoxServerUrl.Location = new Point(95, 81);
            textBoxServerUrl.Margin = new Padding(3, 4, 3, 4);
            textBoxServerUrl.Name = "textBoxServerUrl";
            textBoxServerUrl.Size = new Size(265, 23);
            textBoxServerUrl.TabIndex = 2;
            textBoxServerUrl.Text = "ws://localhost:8787";
            // 
            // labelServerUrl
            // 
            labelServerUrl.AutoSize = true;
            labelServerUrl.Font = new Font("맑은 고딕", 9F);
            labelServerUrl.Location = new Point(20, 85);
            labelServerUrl.Name = "labelServerUrl";
            labelServerUrl.Size = new Size(62, 15);
            labelServerUrl.TabIndex = 3;
            labelServerUrl.Text = "서버 주소:";
            // 
            // textBoxNickname
            // 
            textBoxNickname.Font = new Font("맑은 고딕", 9F);
            textBoxNickname.Location = new Point(95, 44);
            textBoxNickname.Margin = new Padding(3, 4, 3, 4);
            textBoxNickname.MaxLength = 20;
            textBoxNickname.Name = "textBoxNickname";
            textBoxNickname.Size = new Size(265, 23);
            textBoxNickname.TabIndex = 0;
            textBoxNickname.Text = "C#사용자";
            // 
            // labelNickname
            // 
            labelNickname.AutoSize = true;
            labelNickname.Font = new Font("맑은 고딕", 9F);
            labelNickname.Location = new Point(20, 48);
            labelNickname.Name = "labelNickname";
            labelNickname.Size = new Size(46, 15);
            labelNickname.TabIndex = 1;
            labelNickname.Text = "닉네임:";
            // 
            // groupBoxRoomManagement
            // 
            groupBoxRoomManagement.BackColor = Color.FromArgb(248, 249, 250);
            groupBoxRoomManagement.Controls.Add(buttonJoinRoom);
            groupBoxRoomManagement.Controls.Add(buttonCreateRoom);
            groupBoxRoomManagement.Controls.Add(numericUpDownMaxPeers);
            groupBoxRoomManagement.Controls.Add(labelMaxPeers);
            groupBoxRoomManagement.Controls.Add(textBoxRoomPassword);
            groupBoxRoomManagement.Controls.Add(labelRoomPassword);
            groupBoxRoomManagement.Controls.Add(textBoxRoomName);
            groupBoxRoomManagement.Controls.Add(labelRoomName);
            groupBoxRoomManagement.Controls.Add(listViewRooms);
            groupBoxRoomManagement.Controls.Add(buttonRefreshRooms);
            groupBoxRoomManagement.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
            groupBoxRoomManagement.Location = new Point(15, 231);
            groupBoxRoomManagement.Margin = new Padding(3, 4, 3, 4);
            groupBoxRoomManagement.Name = "groupBoxRoomManagement";
            groupBoxRoomManagement.Padding = new Padding(10, 12, 10, 12);
            groupBoxRoomManagement.Size = new Size(380, 525);
            groupBoxRoomManagement.TabIndex = 1;
            groupBoxRoomManagement.TabStop = false;
            groupBoxRoomManagement.Text = "🏠 방 관리";
            // 
            // buttonJoinRoom
            // 
            buttonJoinRoom.BackColor = Color.FromArgb(84, 110, 122);
            buttonJoinRoom.Enabled = false;
            buttonJoinRoom.FlatStyle = FlatStyle.Flat;
            buttonJoinRoom.Font = new Font("맑은 고딕", 9.75F, FontStyle.Bold);
            buttonJoinRoom.ForeColor = Color.White;
            buttonJoinRoom.Location = new Point(20, 466);
            buttonJoinRoom.Margin = new Padding(3, 4, 3, 4);
            buttonJoinRoom.Name = "buttonJoinRoom";
            buttonJoinRoom.Size = new Size(340, 44);
            buttonJoinRoom.TabIndex = 9;
            buttonJoinRoom.Text = "🚪 선택한 방 참가 (새 창 열기)";
            buttonJoinRoom.UseVisualStyleBackColor = false;
            buttonJoinRoom.Click += buttonJoinRoom_Click;
            // 
            // buttonCreateRoom
            // 
            buttonCreateRoom.BackColor = Color.FromArgb(189, 195, 199);
            buttonCreateRoom.Enabled = false;
            buttonCreateRoom.FlatStyle = FlatStyle.Flat;
            buttonCreateRoom.Font = new Font("맑은 고딕", 9.75F, FontStyle.Bold);
            buttonCreateRoom.ForeColor = Color.FromArgb(52, 73, 94);
            buttonCreateRoom.Location = new Point(20, 412);
            buttonCreateRoom.Margin = new Padding(3, 4, 3, 4);
            buttonCreateRoom.Name = "buttonCreateRoom";
            buttonCreateRoom.Size = new Size(340, 44);
            buttonCreateRoom.TabIndex = 8;
            buttonCreateRoom.Text = "➕ 방 만들기";
            buttonCreateRoom.UseVisualStyleBackColor = false;
            buttonCreateRoom.Click += buttonCreateRoom_Click;
            // 
            // numericUpDownMaxPeers
            // 
            numericUpDownMaxPeers.Font = new Font("맑은 고딕", 9F);
            numericUpDownMaxPeers.Location = new Point(100, 369);
            numericUpDownMaxPeers.Margin = new Padding(3, 4, 3, 4);
            numericUpDownMaxPeers.Maximum = new decimal(new int[] { 20, 0, 0, 0 });
            numericUpDownMaxPeers.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
            numericUpDownMaxPeers.Name = "numericUpDownMaxPeers";
            numericUpDownMaxPeers.Size = new Size(260, 23);
            numericUpDownMaxPeers.TabIndex = 6;
            numericUpDownMaxPeers.Value = new decimal(new int[] { 10, 0, 0, 0 });
            // 
            // labelMaxPeers
            // 
            labelMaxPeers.AutoSize = true;
            labelMaxPeers.Font = new Font("맑은 고딕", 9F);
            labelMaxPeers.Location = new Point(20, 372);
            labelMaxPeers.Name = "labelMaxPeers";
            labelMaxPeers.Size = new Size(62, 15);
            labelMaxPeers.TabIndex = 7;
            labelMaxPeers.Text = "최대 인원:";
            // 
            // textBoxRoomPassword
            // 
            textBoxRoomPassword.Font = new Font("맑은 고딕", 9F);
            textBoxRoomPassword.Location = new Point(100, 331);
            textBoxRoomPassword.Margin = new Padding(3, 4, 3, 4);
            textBoxRoomPassword.Name = "textBoxRoomPassword";
            textBoxRoomPassword.PasswordChar = '*';
            textBoxRoomPassword.Size = new Size(260, 23);
            textBoxRoomPassword.TabIndex = 4;
            // 
            // labelRoomPassword
            // 
            labelRoomPassword.AutoSize = true;
            labelRoomPassword.Font = new Font("맑은 고딕", 9F);
            labelRoomPassword.Location = new Point(20, 335);
            labelRoomPassword.Name = "labelRoomPassword";
            labelRoomPassword.Size = new Size(90, 15);
            labelRoomPassword.TabIndex = 5;
            labelRoomPassword.Text = "비밀번호(옵션):";
            // 
            // textBoxRoomName
            // 
            textBoxRoomName.Font = new Font("맑은 고딕", 9F);
            textBoxRoomName.Location = new Point(100, 294);
            textBoxRoomName.Margin = new Padding(3, 4, 3, 4);
            textBoxRoomName.Name = "textBoxRoomName";
            textBoxRoomName.Size = new Size(260, 23);
            textBoxRoomName.TabIndex = 2;
            textBoxRoomName.Text = "새 방";
            // 
            // labelRoomName
            // 
            labelRoomName.AutoSize = true;
            labelRoomName.Font = new Font("맑은 고딕", 9F);
            labelRoomName.Location = new Point(20, 298);
            labelRoomName.Name = "labelRoomName";
            labelRoomName.Size = new Size(50, 15);
            labelRoomName.TabIndex = 3;
            labelRoomName.Text = "방 이름:";
            // 
            // listViewRooms
            // 
            listViewRooms.BackColor = Color.White;
            listViewRooms.Columns.AddRange(new ColumnHeader[] { columnHeaderRoomName, columnHeaderRoomId, columnHeaderPeers, columnHeaderLocked });
            listViewRooms.Font = new Font("맑은 고딕", 9F);
            listViewRooms.FullRowSelect = true;
            listViewRooms.GridLines = true;
            listViewRooms.Location = new Point(20, 85);
            listViewRooms.Margin = new Padding(3, 4, 3, 4);
            listViewRooms.MultiSelect = false;
            listViewRooms.Name = "listViewRooms";
            listViewRooms.Size = new Size(340, 193);
            listViewRooms.TabIndex = 1;
            listViewRooms.UseCompatibleStateImageBehavior = false;
            listViewRooms.View = View.Details;
            listViewRooms.DoubleClick += listViewRooms_DoubleClick;
            // 
            // columnHeaderRoomName
            // 
            columnHeaderRoomName.Text = "방 이름";
            columnHeaderRoomName.Width = 120;
            // 
            // columnHeaderRoomId
            // 
            columnHeaderRoomId.Text = "방 ID";
            columnHeaderRoomId.Width = 80;
            // 
            // columnHeaderPeers
            // 
            columnHeaderPeers.Text = "인원";
            columnHeaderPeers.Width = 50;
            // 
            // columnHeaderLocked
            // 
            columnHeaderLocked.Text = "잠금";
            columnHeaderLocked.Width = 50;
            // 
            // buttonRefreshRooms
            // 
            buttonRefreshRooms.BackColor = Color.FromArgb(189, 195, 199);
            buttonRefreshRooms.Enabled = false;
            buttonRefreshRooms.FlatStyle = FlatStyle.Flat;
            buttonRefreshRooms.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
            buttonRefreshRooms.ForeColor = Color.FromArgb(52, 73, 94);
            buttonRefreshRooms.Location = new Point(20, 38);
            buttonRefreshRooms.Margin = new Padding(3, 4, 3, 4);
            buttonRefreshRooms.Name = "buttonRefreshRooms";
            buttonRefreshRooms.Size = new Size(340, 40);
            buttonRefreshRooms.TabIndex = 0;
            buttonRefreshRooms.Text = "🔄 방 목록 새로고침";
            buttonRefreshRooms.UseVisualStyleBackColor = false;
            buttonRefreshRooms.Click += buttonRefreshRooms_Click;
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.White;
            ClientSize = new Size(410, 775);
            Controls.Add(groupBoxRoomManagement);
            Controls.Add(groupBoxConnection);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            Icon = (Icon)resources.GetObject("$this.Icon");
            Margin = new Padding(3, 4, 3, 4);
            MaximizeBox = false;
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "P2P Chat Client - 방 목록 💬";
            FormClosing += MainForm_FormClosing;
            groupBoxConnection.ResumeLayout(false);
            groupBoxConnection.PerformLayout();
            groupBoxRoomManagement.ResumeLayout(false);
            groupBoxRoomManagement.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)numericUpDownMaxPeers).EndInit();
            ResumeLayout(false);
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
    }
}

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

            this.groupBoxConnection.SuspendLayout();
            this.groupBoxRoomManagement.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericUpDownMaxPeers)).BeginInit();
            this.SuspendLayout();

            // 
            // groupBoxConnection
            // 
            this.groupBoxConnection.BackColor = System.Drawing.Color.FromArgb(248, 249, 250);
            this.groupBoxConnection.Controls.Add(this.labelStatus);
            this.groupBoxConnection.Controls.Add(this.buttonDisconnect);
            this.groupBoxConnection.Controls.Add(this.buttonConnect);
            this.groupBoxConnection.Controls.Add(this.textBoxServerUrl);
            this.groupBoxConnection.Controls.Add(this.labelServerUrl);
            this.groupBoxConnection.Controls.Add(this.textBoxNickname);
            this.groupBoxConnection.Controls.Add(this.labelNickname);
            this.groupBoxConnection.Font = new System.Drawing.Font("맑은 고딕", 10F, System.Drawing.FontStyle.Bold);
            this.groupBoxConnection.Location = new System.Drawing.Point(15, 15);
            this.groupBoxConnection.Name = "groupBoxConnection";
            this.groupBoxConnection.Padding = new System.Windows.Forms.Padding(10);
            this.groupBoxConnection.Size = new System.Drawing.Size(380, 160);
            this.groupBoxConnection.TabIndex = 0;
            this.groupBoxConnection.TabStop = false;
            this.groupBoxConnection.Text = "🔌 서버 연결";

            // 
            // textBoxNickname
            // 
            this.textBoxNickname.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.textBoxNickname.Location = new System.Drawing.Point(95, 35);
            this.textBoxNickname.MaxLength = 20;
            this.textBoxNickname.Name = "textBoxNickname";
            this.textBoxNickname.Size = new System.Drawing.Size(265, 21);
            this.textBoxNickname.TabIndex = 0;
            this.textBoxNickname.Text = "C#사용자";

            // 
            // labelNickname
            // 
            this.labelNickname.AutoSize = true;
            this.labelNickname.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.labelNickname.Location = new System.Drawing.Point(20, 38);
            this.labelNickname.Name = "labelNickname";
            this.labelNickname.Size = new System.Drawing.Size(43, 15);
            this.labelNickname.TabIndex = 1;
            this.labelNickname.Text = "닉네임:";

            // 
            // textBoxServerUrl
            // 
            this.textBoxServerUrl.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.textBoxServerUrl.Location = new System.Drawing.Point(95, 65);
            this.textBoxServerUrl.Name = "textBoxServerUrl";
            this.textBoxServerUrl.Size = new System.Drawing.Size(265, 21);
            this.textBoxServerUrl.TabIndex = 2;
            this.textBoxServerUrl.Text = "ws://localhost:8787";

            // 
            // labelServerUrl
            // 
            this.labelServerUrl.AutoSize = true;
            this.labelServerUrl.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.labelServerUrl.Location = new System.Drawing.Point(20, 68);
            this.labelServerUrl.Name = "labelServerUrl";
            this.labelServerUrl.Size = new System.Drawing.Size(55, 15);
            this.labelServerUrl.TabIndex = 3;
            this.labelServerUrl.Text = "서버 주소:";

            // 
            // buttonConnect
            // 
            this.buttonConnect.BackColor = System.Drawing.Color.FromArgb(84, 110, 122);
            this.buttonConnect.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonConnect.Font = new System.Drawing.Font("맑은 고딕", 9.75F, System.Drawing.FontStyle.Bold);
            this.buttonConnect.ForeColor = System.Drawing.Color.White;
            this.buttonConnect.Location = new System.Drawing.Point(95, 105);
            this.buttonConnect.Name = "buttonConnect";
            this.buttonConnect.Size = new System.Drawing.Size(130, 35);
            this.buttonConnect.TabIndex = 4;
            this.buttonConnect.Text = "연결";
            this.buttonConnect.UseVisualStyleBackColor = false;
            this.buttonConnect.Click += new System.EventHandler(this.buttonConnect_Click);

            // 
            // buttonDisconnect
            // 
            this.buttonDisconnect.BackColor = System.Drawing.Color.FromArgb(189, 195, 199);
            this.buttonDisconnect.Enabled = false;
            this.buttonDisconnect.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonDisconnect.Font = new System.Drawing.Font("맑은 고딕", 9.75F, System.Drawing.FontStyle.Bold);
            this.buttonDisconnect.ForeColor = System.Drawing.Color.FromArgb(52, 73, 94);
            this.buttonDisconnect.Location = new System.Drawing.Point(230, 105);
            this.buttonDisconnect.Name = "buttonDisconnect";
            this.buttonDisconnect.Size = new System.Drawing.Size(130, 35);
            this.buttonDisconnect.TabIndex = 5;
            this.buttonDisconnect.Text = "연결 해제";
            this.buttonDisconnect.UseVisualStyleBackColor = false;
            this.buttonDisconnect.Click += new System.EventHandler(this.buttonDisconnect_Click);

            // 
            // labelStatus
            // 
            this.labelStatus.AutoSize = true;
            this.labelStatus.Font = new System.Drawing.Font("맑은 고딕", 9F, System.Drawing.FontStyle.Bold);
            this.labelStatus.ForeColor = System.Drawing.Color.FromArgb(149, 165, 166);
            this.labelStatus.Location = new System.Drawing.Point(20, 140);
            this.labelStatus.Name = "labelStatus";
            this.labelStatus.Size = new System.Drawing.Size(103, 15);
            this.labelStatus.TabIndex = 6;
            this.labelStatus.Text = "❌ 연결되지 않음";

            // 
            // groupBoxRoomManagement
            // 
            this.groupBoxRoomManagement.BackColor = System.Drawing.Color.FromArgb(248, 249, 250);
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
            this.groupBoxRoomManagement.Font = new System.Drawing.Font("맑은 고딕", 10F, System.Drawing.FontStyle.Bold);
            this.groupBoxRoomManagement.Location = new System.Drawing.Point(15, 185);
            this.groupBoxRoomManagement.Name = "groupBoxRoomManagement";
            this.groupBoxRoomManagement.Padding = new System.Windows.Forms.Padding(10);
            this.groupBoxRoomManagement.Size = new System.Drawing.Size(380, 420);
            this.groupBoxRoomManagement.TabIndex = 1;
            this.groupBoxRoomManagement.TabStop = false;
            this.groupBoxRoomManagement.Text = "🏠 방 관리";

            // 
            // buttonRefreshRooms
            // 
            this.buttonRefreshRooms.BackColor = System.Drawing.Color.FromArgb(189, 195, 199);
            this.buttonRefreshRooms.Enabled = false;
            this.buttonRefreshRooms.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonRefreshRooms.Font = new System.Drawing.Font("맑은 고딕", 9F, System.Drawing.FontStyle.Bold);
            this.buttonRefreshRooms.ForeColor = System.Drawing.Color.FromArgb(52, 73, 94);
            this.buttonRefreshRooms.Location = new System.Drawing.Point(20, 30);
            this.buttonRefreshRooms.Name = "buttonRefreshRooms";
            this.buttonRefreshRooms.Size = new System.Drawing.Size(340, 32);
            this.buttonRefreshRooms.TabIndex = 0;
            this.buttonRefreshRooms.Text = "🔄 방 목록 새로고침";
            this.buttonRefreshRooms.UseVisualStyleBackColor = false;
            this.buttonRefreshRooms.Click += new System.EventHandler(this.buttonRefreshRooms_Click);

            // 
            // listViewRooms
            // 
            this.listViewRooms.BackColor = System.Drawing.Color.White;
            this.listViewRooms.Columns.AddRange(new System.Windows.Forms.ColumnHeader[] {
            this.columnHeaderRoomName,
            this.columnHeaderRoomId,
            this.columnHeaderPeers,
            this.columnHeaderLocked});
            this.listViewRooms.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.listViewRooms.FullRowSelect = true;
            this.listViewRooms.GridLines = true;
            this.listViewRooms.HideSelection = false;
            this.listViewRooms.Location = new System.Drawing.Point(20, 68);
            this.listViewRooms.MultiSelect = false;
            this.listViewRooms.Name = "listViewRooms";
            this.listViewRooms.Size = new System.Drawing.Size(340, 155);
            this.listViewRooms.TabIndex = 1;
            this.listViewRooms.UseCompatibleStateImageBehavior = false;
            this.listViewRooms.View = System.Windows.Forms.View.Details;
            this.listViewRooms.DoubleClick += new System.EventHandler(this.listViewRooms_DoubleClick);

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
            this.textBoxRoomName.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.textBoxRoomName.Location = new System.Drawing.Point(100, 235);
            this.textBoxRoomName.Name = "textBoxRoomName";
            this.textBoxRoomName.Size = new System.Drawing.Size(260, 21);
            this.textBoxRoomName.TabIndex = 2;
            this.textBoxRoomName.Text = "새 방";

            // 
            // labelRoomName
            // 
            this.labelRoomName.AutoSize = true;
            this.labelRoomName.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.labelRoomName.Location = new System.Drawing.Point(20, 238);
            this.labelRoomName.Name = "labelRoomName";
            this.labelRoomName.Size = new System.Drawing.Size(43, 15);
            this.labelRoomName.TabIndex = 3;
            this.labelRoomName.Text = "방 이름:";

            // 
            // textBoxRoomPassword
            // 
            this.textBoxRoomPassword.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.textBoxRoomPassword.Location = new System.Drawing.Point(100, 265);
            this.textBoxRoomPassword.Name = "textBoxRoomPassword";
            this.textBoxRoomPassword.PasswordChar = '*';
            this.textBoxRoomPassword.Size = new System.Drawing.Size(260, 21);
            this.textBoxRoomPassword.TabIndex = 4;

            // 
            // labelRoomPassword
            // 
            this.labelRoomPassword.AutoSize = true;
            this.labelRoomPassword.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.labelRoomPassword.Location = new System.Drawing.Point(20, 268);
            this.labelRoomPassword.Name = "labelRoomPassword";
            this.labelRoomPassword.Size = new System.Drawing.Size(67, 15);
            this.labelRoomPassword.TabIndex = 5;
            this.labelRoomPassword.Text = "비밀번호(옵션):";

            // 
            // numericUpDownMaxPeers
            // 
            this.numericUpDownMaxPeers.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.numericUpDownMaxPeers.Location = new System.Drawing.Point(100, 295);
            this.numericUpDownMaxPeers.Maximum = new decimal(new int[] { 20, 0, 0, 0 });
            this.numericUpDownMaxPeers.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
            this.numericUpDownMaxPeers.Name = "numericUpDownMaxPeers";
            this.numericUpDownMaxPeers.Size = new System.Drawing.Size(260, 21);
            this.numericUpDownMaxPeers.TabIndex = 6;
            this.numericUpDownMaxPeers.Value = new decimal(new int[] { 10, 0, 0, 0 });

            // 
            // labelMaxPeers
            // 
            this.labelMaxPeers.AutoSize = true;
            this.labelMaxPeers.Font = new System.Drawing.Font("맑은 고딕", 9F);
            this.labelMaxPeers.Location = new System.Drawing.Point(20, 298);
            this.labelMaxPeers.Name = "labelMaxPeers";
            this.labelMaxPeers.Size = new System.Drawing.Size(55, 15);
            this.labelMaxPeers.TabIndex = 7;
            this.labelMaxPeers.Text = "최대 인원:";

            // 
            // buttonCreateRoom
            // 
            this.buttonCreateRoom.BackColor = System.Drawing.Color.FromArgb(189, 195, 199);
            this.buttonCreateRoom.Enabled = false;
            this.buttonCreateRoom.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonCreateRoom.Font = new System.Drawing.Font("맑은 고딕", 9.75F, System.Drawing.FontStyle.Bold);
            this.buttonCreateRoom.ForeColor = System.Drawing.Color.FromArgb(52, 73, 94);
            this.buttonCreateRoom.Location = new System.Drawing.Point(20, 330);
            this.buttonCreateRoom.Name = "buttonCreateRoom";
            this.buttonCreateRoom.Size = new System.Drawing.Size(340, 35);
            this.buttonCreateRoom.TabIndex = 8;
            this.buttonCreateRoom.Text = "➕ 방 만들기";
            this.buttonCreateRoom.UseVisualStyleBackColor = false;
            this.buttonCreateRoom.Click += new System.EventHandler(this.buttonCreateRoom_Click);

            // 
            // buttonJoinRoom
            // 
            this.buttonJoinRoom.BackColor = System.Drawing.Color.FromArgb(84, 110, 122);
            this.buttonJoinRoom.Enabled = false;
            this.buttonJoinRoom.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.buttonJoinRoom.Font = new System.Drawing.Font("맑은 고딕", 9.75F, System.Drawing.FontStyle.Bold);
            this.buttonJoinRoom.ForeColor = System.Drawing.Color.White;
            this.buttonJoinRoom.Location = new System.Drawing.Point(20, 373);
            this.buttonJoinRoom.Name = "buttonJoinRoom";
            this.buttonJoinRoom.Size = new System.Drawing.Size(340, 35);
            this.buttonJoinRoom.TabIndex = 9;
            this.buttonJoinRoom.Text = "🚪 선택한 방 참가 (새 창 열기)";
            this.buttonJoinRoom.UseVisualStyleBackColor = false;
            this.buttonJoinRoom.Click += new System.EventHandler(this.buttonJoinRoom_Click);

            // 
            // MainForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(410, 620);
            this.Controls.Add(this.groupBoxRoomManagement);
            this.Controls.Add(this.groupBoxConnection);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.Name = "MainForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "P2P Chat Client - 방 목록 💬";
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.MainForm_FormClosing);
            this.groupBoxConnection.ResumeLayout(false);
            this.groupBoxConnection.PerformLayout();
            this.groupBoxRoomManagement.ResumeLayout(false);
            this.groupBoxRoomManagement.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numericUpDownMaxPeers)).EndInit();
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
    }
}

namespace VixReaderTest01
{
    partial class Main
    {
        /// <summary>
        /// 필수 디자이너 변수입니다.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// 사용 중인 모든 리소스를 정리합니다.
        /// </summary>

        #region Windows Form 디자이너에서 생성한 코드

        /// <summary>
        /// 디자이너 지원에 필요한 메서드입니다.
        /// 이 메서드의 내용을 코드 편집기로 수정하지 마세요.
        /// </summary>
        private void InitializeComponent()
        {
            this.LogTextBox = new System.Windows.Forms.TextBox();
            this.SerialCheckBox = new System.Windows.Forms.CheckBox();
            this.EthernetCheckBox = new System.Windows.Forms.CheckBox();
            this.DevInfoButton = new System.Windows.Forms.Button();
            this.GetCPUInfoButton = new System.Windows.Forms.Button();
            this.GetMacAddressButton = new System.Windows.Forms.Button();
            this.IntellivixLogo = new System.Windows.Forms.PictureBox();
            ((System.ComponentModel.ISupportInitialize)(this.IntellivixLogo)).BeginInit();
            this.SuspendLayout();
            // 
            // LogTextBox
            // 
            this.LogTextBox.Location = new System.Drawing.Point(12, 12);
            this.LogTextBox.Multiline = true;
            this.LogTextBox.Name = "LogTextBox";
            this.LogTextBox.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
            this.LogTextBox.Size = new System.Drawing.Size(560, 200);
            this.LogTextBox.TabIndex = 0;
            // 
            // SerialCheckBox
            // 
            this.SerialCheckBox.AutoSize = true;
            this.SerialCheckBox.Location = new System.Drawing.Point(12, 230);
            this.SerialCheckBox.Name = "SerialCheckBox";
            this.SerialCheckBox.Size = new System.Drawing.Size(60, 19);
            this.SerialCheckBox.TabIndex = 1;
            this.SerialCheckBox.Text = "Serial";
            this.SerialCheckBox.UseVisualStyleBackColor = true;
            this.SerialCheckBox.CheckedChanged += new System.EventHandler(this.SerialCheckBox_CheckedChanged);
            // 
            // EthernetCheckBox
            // 
            this.EthernetCheckBox.AutoSize = true;
            this.EthernetCheckBox.Location = new System.Drawing.Point(90, 230);
            this.EthernetCheckBox.Name = "EthernetCheckBox";
            this.EthernetCheckBox.Size = new System.Drawing.Size(77, 19);
            this.EthernetCheckBox.TabIndex = 2;
            this.EthernetCheckBox.Text = "Ethernet";
            this.EthernetCheckBox.UseVisualStyleBackColor = true;
            this.EthernetCheckBox.CheckedChanged += new System.EventHandler(this.EthernetCheckBox_CheckedChanged);
            // 
            // DevInfoButton
            // 
            this.DevInfoButton.Location = new System.Drawing.Point(12, 270);
            this.DevInfoButton.Name = "DevInfoButton";
            this.DevInfoButton.Size = new System.Drawing.Size(120, 30);
            this.DevInfoButton.TabIndex = 3;
            this.DevInfoButton.Text = "기본 장치 정보";
            this.DevInfoButton.UseVisualStyleBackColor = true;
            this.DevInfoButton.Click += new System.EventHandler(this.DevInfoButton_Click);
            // 
            // GetCPUInfoButton
            // 
            this.GetCPUInfoButton.Location = new System.Drawing.Point(150, 270);
            this.GetCPUInfoButton.Name = "GetCPUInfoButton";
            this.GetCPUInfoButton.Size = new System.Drawing.Size(120, 30);
            this.GetCPUInfoButton.TabIndex = 4;
            this.GetCPUInfoButton.Text = "CPU 정보";
            this.GetCPUInfoButton.UseVisualStyleBackColor = true;
            this.GetCPUInfoButton.Click += new System.EventHandler(this.GetCPUInfoButton_Click);
            // 
            // GetMacAddressButton
            // 
            this.GetMacAddressButton.Location = new System.Drawing.Point(290, 270);
            this.GetMacAddressButton.Name = "GetMacAddressButton";
            this.GetMacAddressButton.Size = new System.Drawing.Size(120, 30);
            this.GetMacAddressButton.TabIndex = 5;
            this.GetMacAddressButton.Text = "MAC 주소 정보";
            this.GetMacAddressButton.UseVisualStyleBackColor = true;
            this.GetMacAddressButton.Click += new System.EventHandler(this.GetMacAddressButton_Click);
            // 
            // IntellivixLogo
            // 
            this.IntellivixLogo.Location = new System.Drawing.Point(500, 230);
            this.IntellivixLogo.Name = "IntellivixLogo";
            this.IntellivixLogo.Size = new System.Drawing.Size(72, 72);
            this.IntellivixLogo.TabIndex = 6;
            this.IntellivixLogo.TabStop = false;
            this.IntellivixLogo.Click += new System.EventHandler(this.IntellivixLogo_Click);
            // 
            // Main
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(584, 321);
            this.Controls.Add(this.IntellivixLogo);
            this.Controls.Add(this.GetMacAddressButton);
            this.Controls.Add(this.GetCPUInfoButton);
            this.Controls.Add(this.DevInfoButton);
            this.Controls.Add(this.EthernetCheckBox);
            this.Controls.Add(this.SerialCheckBox);
            this.Controls.Add(this.LogTextBox);
            this.Name = "Main";
            this.Text = "VixAir Test Program";
            this.Load += new System.EventHandler(this.Main_Load);
            ((System.ComponentModel.ISupportInitialize)(this.IntellivixLogo)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.TextBox LogTextBox;
        private System.Windows.Forms.CheckBox SerialCheckBox;
        private System.Windows.Forms.CheckBox EthernetCheckBox;
        private System.Windows.Forms.Button DevInfoButton;
        private System.Windows.Forms.Button GetCPUInfoButton;
        private System.Windows.Forms.Button GetMacAddressButton;
        private System.Windows.Forms.PictureBox IntellivixLogo;
    }
}
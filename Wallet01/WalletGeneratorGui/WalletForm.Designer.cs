namespace WalletGeneratorGui;

partial class WalletForm
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
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(WalletForm));
        labelTitle = new Label();
        buttonCreateWallet = new Button();
        buttonUnlockWallet = new Button();
        labelRpcUrl = new Label();
        textBoxRpcUrl = new TextBox();
        buttonQueryBalance = new Button();
        textBoxAddress = new TextBox();
        labelAddress = new Label();
        labelNotice = new Label();
        labelWalletState = new Label();
        labelBalance = new Label();
        buttonCopyAddress = new Button();
        labelWalletList = new Label();
        listBoxWallets = new ListBox();
        labelJsonRpcHeader = new Label();
        numericUpDownRpcPort = new NumericUpDown();
        buttonJsonRpcToggle = new Button();
        labelJsonRpcStatus = new Label();
        ((System.ComponentModel.ISupportInitialize)numericUpDownRpcPort).BeginInit();
        SuspendLayout();
        // 
        // labelTitle
        // 
        labelTitle.AutoSize = true;
        labelTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold, GraphicsUnit.Point, 129);
        labelTitle.Location = new Point(24, 20);
        labelTitle.Name = "labelTitle";
        labelTitle.Size = new Size(412, 25);
        labelTitle.TabIndex = 0;
        labelTitle.Text = "Blockchain Wallet (Mnemonic + Multi Wallet)";
        // 
        // buttonCreateWallet
        // 
        buttonCreateWallet.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        buttonCreateWallet.Location = new Point(24, 72);
        buttonCreateWallet.Name = "buttonCreateWallet";
        buttonCreateWallet.Size = new Size(156, 34);
        buttonCreateWallet.TabIndex = 3;
        buttonCreateWallet.Text = "새 지갑 생성";
        buttonCreateWallet.UseVisualStyleBackColor = true;
        buttonCreateWallet.Click += buttonCreateWallet_Click;
        // 
        // buttonUnlockWallet
        // 
        buttonUnlockWallet.Font = new Font("Segoe UI", 10F);
        buttonUnlockWallet.Location = new Point(196, 72);
        buttonUnlockWallet.Name = "buttonUnlockWallet";
        buttonUnlockWallet.Size = new Size(156, 34);
        buttonUnlockWallet.TabIndex = 4;
        buttonUnlockWallet.Text = "지갑 불러오기";
        buttonUnlockWallet.UseVisualStyleBackColor = true;
        buttonUnlockWallet.Click += buttonUnlockWallet_Click;
        // 
        // labelRpcUrl
        // 
        labelRpcUrl.AutoSize = true;
        labelRpcUrl.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelRpcUrl.Location = new Point(24, 124);
        labelRpcUrl.Name = "labelRpcUrl";
        labelRpcUrl.Size = new Size(66, 19);
        labelRpcUrl.TabIndex = 5;
        labelRpcUrl.Text = "RPC URL";
        // 
        // textBoxRpcUrl
        // 
        textBoxRpcUrl.Font = new Font("Consolas", 10F);
        textBoxRpcUrl.Location = new Point(24, 150);
        textBoxRpcUrl.Name = "textBoxRpcUrl";
        textBoxRpcUrl.Size = new Size(600, 23);
        textBoxRpcUrl.TabIndex = 6;
        textBoxRpcUrl.Text = "https://eth.drpc.org";
        // 
        // buttonQueryBalance
        // 
        buttonQueryBalance.Location = new Point(640, 147);
        buttonQueryBalance.Name = "buttonQueryBalance";
        buttonQueryBalance.Size = new Size(148, 32);
        buttonQueryBalance.TabIndex = 7;
        buttonQueryBalance.Text = "자산 상태 조회";
        buttonQueryBalance.UseVisualStyleBackColor = true;
        buttonQueryBalance.Click += buttonQueryBalance_Click;
        // 
        // textBoxAddress
        // 
        textBoxAddress.Font = new Font("Consolas", 10F);
        textBoxAddress.Location = new Point(24, 215);
        textBoxAddress.Name = "textBoxAddress";
        textBoxAddress.ReadOnly = true;
        textBoxAddress.ScrollBars = ScrollBars.Horizontal;
        textBoxAddress.Size = new Size(600, 23);
        textBoxAddress.TabIndex = 8;
        // 
        // labelAddress
        // 
        labelAddress.AutoSize = true;
        labelAddress.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelAddress.Location = new Point(24, 189);
        labelAddress.Name = "labelAddress";
        labelAddress.Size = new Size(63, 19);
        labelAddress.TabIndex = 9;
        labelAddress.Text = "Address";
        // 
        // labelNotice
        // 
        labelNotice.AutoSize = true;
        labelNotice.Font = new Font("Segoe UI", 9F, FontStyle.Italic);
        labelNotice.ForeColor = Color.Firebrick;
        labelNotice.Location = new Point(24, 255);
        labelNotice.Name = "labelNotice";
        labelNotice.Size = new Size(479, 15);
        labelNotice.TabIndex = 10;
        labelNotice.Text = "Private Key / Mnemonic은 메인 화면에 표시되지 않으며 불러오기 팝업에서만 입력합니다.";
        // 
        // labelWalletState
        // 
        labelWalletState.AutoSize = true;
        labelWalletState.Font = new Font("Segoe UI", 10F);
        labelWalletState.Location = new Point(24, 352);
        labelWalletState.Name = "labelWalletState";
        labelWalletState.Size = new Size(72, 19);
        labelWalletState.TabIndex = 11;
        labelWalletState.Text = "지갑 상태:";
        // 
        // labelBalance
        // 
        labelBalance.AutoSize = true;
        labelBalance.Font = new Font("Segoe UI", 10F);
        labelBalance.Location = new Point(24, 378);
        labelBalance.Name = "labelBalance";
        labelBalance.Size = new Size(72, 19);
        labelBalance.TabIndex = 12;
        labelBalance.Text = "자산 상태:";
        // 
        // buttonCopyAddress
        // 
        buttonCopyAddress.Location = new Point(640, 213);
        buttonCopyAddress.Name = "buttonCopyAddress";
        buttonCopyAddress.Size = new Size(148, 32);
        buttonCopyAddress.TabIndex = 13;
        buttonCopyAddress.Text = "주소 복사";
        buttonCopyAddress.UseVisualStyleBackColor = true;
        buttonCopyAddress.Click += buttonCopyAddress_Click;
        // 
        // labelWalletList
        // 
        labelWalletList.AutoSize = true;
        labelWalletList.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelWalletList.Location = new Point(882, 72);
        labelWalletList.Name = "labelWalletList";
        labelWalletList.Size = new Size(69, 19);
        labelWalletList.TabIndex = 14;
        labelWalletList.Text = "지갑 목록";
        // 
        // listBoxWallets
        // 
        listBoxWallets.Font = new Font("Consolas", 9F);
        listBoxWallets.FormattingEnabled = true;
        listBoxWallets.Location = new Point(886, 98);
        listBoxWallets.Name = "listBoxWallets";
        listBoxWallets.Size = new Size(176, 200);
        listBoxWallets.TabIndex = 15;
        listBoxWallets.SelectedIndexChanged += listBoxWallets_SelectedIndexChanged;
        // 
        // labelJsonRpcHeader
        // 
        labelJsonRpcHeader.AutoSize = true;
        labelJsonRpcHeader.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelJsonRpcHeader.Location = new Point(24, 278);
        labelJsonRpcHeader.Name = "labelJsonRpcHeader";
        labelJsonRpcHeader.Size = new Size(323, 19);
        labelJsonRpcHeader.TabIndex = 16;
        labelJsonRpcHeader.Text = "다른 앱용 JSON-RPC 2.0 (web3.js HttpProvider)";
        // 
        // numericUpDownRpcPort
        // 
        numericUpDownRpcPort.Location = new Point(24, 304);
        numericUpDownRpcPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
        numericUpDownRpcPort.Minimum = new decimal(new int[] { 1024, 0, 0, 0 });
        numericUpDownRpcPort.Name = "numericUpDownRpcPort";
        numericUpDownRpcPort.Size = new Size(80, 23);
        numericUpDownRpcPort.TabIndex = 17;
        numericUpDownRpcPort.Value = new decimal(new int[] { 8547, 0, 0, 0 });
        // 
        // buttonJsonRpcToggle
        // 
        buttonJsonRpcToggle.Font = new Font("Segoe UI", 10F);
        buttonJsonRpcToggle.Location = new Point(120, 301);
        buttonJsonRpcToggle.Name = "buttonJsonRpcToggle";
        buttonJsonRpcToggle.Size = new Size(200, 32);
        buttonJsonRpcToggle.TabIndex = 18;
        buttonJsonRpcToggle.Text = "로컬 JSON-RPC 시작";
        buttonJsonRpcToggle.UseVisualStyleBackColor = true;
        buttonJsonRpcToggle.Click += buttonJsonRpcToggle_Click;
        // 
        // labelJsonRpcStatus
        // 
        labelJsonRpcStatus.Font = new Font("Segoe UI", 9F);
        labelJsonRpcStatus.Location = new Point(330, 304);
        labelJsonRpcStatus.Name = "labelJsonRpcStatus";
        labelJsonRpcStatus.Size = new Size(520, 28);
        labelJsonRpcStatus.TabIndex = 19;
        labelJsonRpcStatus.Text = "중지됨";
        // 
        // WalletForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1080, 460);
        Controls.Add(labelJsonRpcStatus);
        Controls.Add(buttonJsonRpcToggle);
        Controls.Add(numericUpDownRpcPort);
        Controls.Add(labelJsonRpcHeader);
        Controls.Add(listBoxWallets);
        Controls.Add(labelWalletList);
        Controls.Add(labelBalance);
        Controls.Add(labelWalletState);
        Controls.Add(buttonCopyAddress);
        Controls.Add(labelNotice);
        Controls.Add(labelAddress);
        Controls.Add(buttonQueryBalance);
        Controls.Add(textBoxRpcUrl);
        Controls.Add(labelRpcUrl);
        Controls.Add(buttonUnlockWallet);
        Controls.Add(buttonCreateWallet);
        Controls.Add(textBoxAddress);
        Controls.Add(labelTitle);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        Icon = (Icon)resources.GetObject("$this.Icon");
        MaximizeBox = false;
        Name = "WalletForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Blockchain Wallet";
        Load += WalletForm_Load;
        ((System.ComponentModel.ISupportInitialize)numericUpDownRpcPort).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private Label labelTitle;
    private Button buttonCreateWallet;
    private Button buttonUnlockWallet;
    private Label labelRpcUrl;
    private TextBox textBoxRpcUrl;
    private Button buttonQueryBalance;
    private TextBox textBoxAddress;
    private Label labelAddress;
    private Label labelNotice;
    private Label labelWalletState;
    private Label labelBalance;
    private Button buttonCopyAddress;
    private Label labelWalletList;
    private ListBox listBoxWallets;
    private Label labelJsonRpcHeader;
    private NumericUpDown numericUpDownRpcPort;
    private Button buttonJsonRpcToggle;
    private Label labelJsonRpcStatus;
}

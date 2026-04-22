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
        MaximizeBox = false;
        Name = "WalletForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Blockchain Wallet";
        labelTitle.AutoSize = true;
        labelTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold, GraphicsUnit.Point, 129);
        labelTitle.Location = new Point(24, 20);
        labelTitle.Name = "labelTitle";
        labelTitle.Size = new Size(502, 32);
        labelTitle.TabIndex = 0;
        labelTitle.Text = "Blockchain Wallet (Mnemonic + Multi Wallet)";
        buttonCreateWallet.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        buttonCreateWallet.Location = new Point(24, 72);
        buttonCreateWallet.Name = "buttonCreateWallet";
        buttonCreateWallet.Size = new Size(156, 34);
        buttonCreateWallet.TabIndex = 3;
        buttonCreateWallet.Text = "새 지갑 생성";
        buttonCreateWallet.UseVisualStyleBackColor = true;
        buttonCreateWallet.Click += buttonCreateWallet_Click;
        buttonUnlockWallet.Font = new Font("Segoe UI", 10F);
        buttonUnlockWallet.Location = new Point(196, 72);
        buttonUnlockWallet.Name = "buttonUnlockWallet";
        buttonUnlockWallet.Size = new Size(156, 34);
        buttonUnlockWallet.TabIndex = 4;
        buttonUnlockWallet.Text = "지갑 불러오기";
        buttonUnlockWallet.UseVisualStyleBackColor = true;
        buttonUnlockWallet.Click += buttonUnlockWallet_Click;
        labelRpcUrl.AutoSize = true;
        labelRpcUrl.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelRpcUrl.Location = new Point(24, 124);
        labelRpcUrl.Name = "labelRpcUrl";
        labelRpcUrl.Size = new Size(72, 23);
        labelRpcUrl.TabIndex = 5;
        labelRpcUrl.Text = "RPC URL";
        textBoxRpcUrl.Font = new Font("Consolas", 10F);
        textBoxRpcUrl.Location = new Point(24, 150);
        textBoxRpcUrl.Name = "textBoxRpcUrl";
        textBoxRpcUrl.Size = new Size(600, 27);
        textBoxRpcUrl.TabIndex = 6;
        textBoxRpcUrl.Text = "https://eth.drpc.org";
        buttonQueryBalance.Location = new Point(640, 147);
        buttonQueryBalance.Name = "buttonQueryBalance";
        buttonQueryBalance.Size = new Size(148, 32);
        buttonQueryBalance.TabIndex = 7;
        buttonQueryBalance.Text = "자산 상태 조회";
        buttonQueryBalance.UseVisualStyleBackColor = true;
        buttonQueryBalance.Click += buttonQueryBalance_Click;
        textBoxAddress.Font = new Font("Consolas", 10F);
        textBoxAddress.Location = new Point(24, 215);
        textBoxAddress.Name = "textBoxAddress";
        textBoxAddress.ReadOnly = true;
        textBoxAddress.ScrollBars = ScrollBars.Horizontal;
        textBoxAddress.Size = new Size(600, 27);
        textBoxAddress.TabIndex = 8;
        labelAddress.AutoSize = true;
        labelAddress.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelAddress.Location = new Point(24, 189);
        labelAddress.Name = "labelAddress";
        labelAddress.Size = new Size(73, 23);
        labelAddress.TabIndex = 9;
        labelAddress.Text = "Address";
        labelNotice.AutoSize = true;
        labelNotice.Font = new Font("Segoe UI", 9F, FontStyle.Italic);
        labelNotice.ForeColor = Color.Firebrick;
        labelNotice.Location = new Point(24, 255);
        labelNotice.Name = "labelNotice";
        labelNotice.Size = new Size(513, 20);
        labelNotice.TabIndex = 10;
        labelNotice.Text = "Private Key / Mnemonic은 메인 화면에 표시되지 않으며 불러오기 팝업에서만 입력합니다.";
        labelWalletState.AutoSize = true;
        labelWalletState.Font = new Font("Segoe UI", 10F);
        labelWalletState.Location = new Point(24, 352);
        labelWalletState.Name = "labelWalletState";
        labelWalletState.Size = new Size(81, 23);
        labelWalletState.TabIndex = 11;
        labelWalletState.Text = "지갑 상태:";
        labelBalance.AutoSize = true;
        labelBalance.Font = new Font("Segoe UI", 10F);
        labelBalance.Location = new Point(24, 378);
        labelBalance.Name = "labelBalance";
        labelBalance.Size = new Size(81, 23);
        labelBalance.TabIndex = 12;
        labelBalance.Text = "자산 상태:";
        buttonCopyAddress.Location = new Point(640, 213);
        buttonCopyAddress.Name = "buttonCopyAddress";
        buttonCopyAddress.Size = new Size(148, 32);
        buttonCopyAddress.TabIndex = 13;
        buttonCopyAddress.Text = "주소 복사";
        buttonCopyAddress.UseVisualStyleBackColor = true;
        buttonCopyAddress.Click += buttonCopyAddress_Click;
        labelWalletList.AutoSize = true;
        labelWalletList.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelWalletList.Location = new Point(882, 72);
        labelWalletList.Name = "labelWalletList";
        labelWalletList.Size = new Size(81, 23);
        labelWalletList.TabIndex = 14;
        labelWalletList.Text = "지갑 목록";
        listBoxWallets.Font = new Font("Consolas", 9F);
        listBoxWallets.FormattingEnabled = true;
        listBoxWallets.ItemHeight = 18;
        listBoxWallets.Location = new Point(886, 98);
        listBoxWallets.Name = "listBoxWallets";
        listBoxWallets.Size = new Size(176, 210);
        listBoxWallets.TabIndex = 15;
        listBoxWallets.SelectedIndexChanged += listBoxWallets_SelectedIndexChanged;
        labelJsonRpcHeader.AutoSize = true;
        labelJsonRpcHeader.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        labelJsonRpcHeader.Location = new Point(24, 278);
        labelJsonRpcHeader.Name = "labelJsonRpcHeader";
        labelJsonRpcHeader.Size = new Size(420, 23);
        labelJsonRpcHeader.TabIndex = 16;
        labelJsonRpcHeader.Text = "다른 앱용 JSON-RPC 2.0 (web3.js HttpProvider)";
        numericUpDownRpcPort.Location = new Point(24, 304);
        numericUpDownRpcPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
        numericUpDownRpcPort.Minimum = new decimal(new int[] { 1024, 0, 0, 0 });
        numericUpDownRpcPort.Name = "numericUpDownRpcPort";
        numericUpDownRpcPort.Size = new Size(80, 27);
        numericUpDownRpcPort.TabIndex = 17;
        numericUpDownRpcPort.Value = new decimal(new int[] { 8547, 0, 0, 0 });
        buttonJsonRpcToggle.Font = new Font("Segoe UI", 10F);
        buttonJsonRpcToggle.Location = new Point(120, 301);
        buttonJsonRpcToggle.Name = "buttonJsonRpcToggle";
        buttonJsonRpcToggle.Size = new Size(200, 32);
        buttonJsonRpcToggle.TabIndex = 18;
        buttonJsonRpcToggle.Text = "로컬 JSON-RPC 시작";
        buttonJsonRpcToggle.UseVisualStyleBackColor = true;
        buttonJsonRpcToggle.Click += buttonJsonRpcToggle_Click;
        labelJsonRpcStatus.AutoSize = false;
        labelJsonRpcStatus.Font = new Font("Segoe UI", 9F);
        labelJsonRpcStatus.Location = new Point(330, 304);
        labelJsonRpcStatus.Name = "labelJsonRpcStatus";
        labelJsonRpcStatus.Size = new Size(520, 28);
        labelJsonRpcStatus.TabIndex = 19;
        labelJsonRpcStatus.Text = "중지됨";
        Load += WalletForm_Load;
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

using Nethereum.HdWallet;
using Nethereum.Web3;
using Nethereum.Hex.HexConvertors.Extensions;
using NBitcoin;
using System;

namespace EthereumWallet01
{
    public partial class Main : Form
    {
        private Nethereum.HdWallet.Wallet? wallet;  // 타입을 명확히 지정
        private string? privateKey;  // nullable로 변경
        private string? publicAddress;  // nullable로 변경
        private Button btnCreateWallet = null!;  // null 허용하지 않음을 명시
        private Button btnGetBalance = null!;  // btnGetBalance를 선언 및 null 허용하지 않음을 명시

        public Main()
        {
            InitializeComponent();
        }

        private void Log(string message)
        {
            if (LogTextBox.InvokeRequired)
            {
                LogTextBox.Invoke(new Action(() => Log(message)));
                return;
            }

            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
            LogTextBox.ScrollToCaret();
        }

        private void CreateWallet()
        {
            try
            {
                Log("지갑 생성을 시작합니다...");

                // Wordlist.English.GetWords() → Wordlist.English
                var wallet = new Nethereum.HdWallet.Wallet(NBitcoin.Wordlist.English, WordCount.Twelve);
                var words = wallet.Words;

                this.wallet = wallet;
                privateKey = wallet.GetPrivateKey(0).ToHex();
                publicAddress = wallet.GetAccount(0).Address;

                Log($"새 지갑이 생성되었습니다.");
                Log($"지갑 주소: {publicAddress}");
                Log($"시드 구문: {string.Join(" ", words)}");
                Log("※ 시드 구문은 안전한 곳에 보관하세요!");

                MessageBox.Show($"지갑이 생성되었습니다!\n\n주소: {publicAddress}\n\n" +
                              $"시드 구문: {string.Join(" ", words)}\n\n" +
                              "※ 시드 구문은 안전한 곳에 보관하세요!",
                              "지갑 생성 성공",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Log($"오류 발생: {ex.Message}");
                MessageBox.Show($"지갑 생성 중 오류가 발생했습니다: {ex.Message}",
                              "오류",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
            }
        }

        private void btnCreateWallet_Click(object? sender, EventArgs e)  // sender를 nullable로 변경
        {
            CreateWallet();
        }

        private void InitializeComponent()
        {
            btnCreateWallet = new Button();
            LogTextBox = new TextBox();
            btnGetBalance = new Button();  // 버튼 초기화
            SuspendLayout();
            // 
            // btnCreateWallet
            // 
            btnCreateWallet.Location = new Point(12, 12);
            btnCreateWallet.Name = "btnCreateWallet";
            btnCreateWallet.Size = new Size(200, 30);
            btnCreateWallet.TabIndex = 0;
            btnCreateWallet.Text = "새 이더리움 지갑 생성";
            btnCreateWallet.Click += btnCreateWallet_Click;
            // 
            // LogTextBox
            // 
            LogTextBox.Location = new Point(13, 50);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(759, 379);
            LogTextBox.TabIndex = 1;
            // 
            // btnGetBalance
            // 
            btnGetBalance.Location = new Point(220, 12);
            btnGetBalance.Name = "btnGetBalance";
            btnGetBalance.Size = new Size(200, 30);
            btnGetBalance.TabIndex = 2;
            btnGetBalance.Text = "잔액 확인";
            btnGetBalance.UseVisualStyleBackColor = true;
            btnGetBalance.Click += btnGetBalance_Click;
            // 
            // Main
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(784, 441);
            Controls.Add(btnGetBalance);  // 새 버튼 추가
            Controls.Add(LogTextBox);
            Controls.Add(btnCreateWallet);
            Name = "Main";
            Text = "EthereumWallet";
            ResumeLayout(false);
            PerformLayout();
        }
        private TextBox LogTextBox;

        private void button1_Click(object sender, EventArgs e)
        {

        }

        private async void btnGetBalance_Click(object? sender, EventArgs e)
        {
            try
            {
                if (publicAddress == null)
                {
                    MessageBox.Show("먼저 지갑을 생성하거나 불러와주세요.", 
                                  "주의", 
                                  MessageBoxButtons.OK, 
                                  MessageBoxIcon.Warning);
                    return;
                }

                Log("잔액 확인을 시작합니다...");
                
                // Sepolia Ethereum 메인넷 접속 (Infura 사용)
                var web3 = new Web3("https://sepolia.infura.io/v3/135887a7cd1544ee9c68a3d6fc24d10e");
                
                // 잔액 조회 (Wei 단위)
                var balanceWei = await web3.Eth.GetBalance.SendRequestAsync(publicAddress);
                
                // Wei를 ETH로 변환 (1 ETH = 10^18 Wei)
                var balanceEth = Web3.Convert.FromWei(balanceWei);
                
                Log($"지갑 주소: {publicAddress}");
                Log($"현재 잔액: {balanceEth} ETH");
                
                MessageBox.Show($"현재 잔액: {balanceEth} ETH",
                              "잔액 조회 완료",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Log($"오류 발생: {ex.Message}");
                MessageBox.Show($"잔액 확인 중 오류가 발생했습니다: {ex.Message}",
                              "오류",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
            }
        }
    }
}

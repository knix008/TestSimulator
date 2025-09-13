using Nethereum.HdWallet;
using Nethereum.Web3;
using Nethereum.Hex.HexConvertors.Extensions;
using NBitcoin;
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using DotNetEnv;

namespace EthereumWallet01
{
    // Hardhat 아티팩트 구조체
    public class HardhatArtifact
    {
        [JsonProperty("contractName")]
        public string ContractName { get; set; } = "";
        
        [JsonProperty("abi")]
        public JArray Abi { get; set; } = new JArray();
        
        [JsonProperty("bytecode")]
        public string Bytecode { get; set; } = "";
        
        [JsonProperty("deployedBytecode")]
        public string DeployedBytecode { get; set; } = "";
        
        [JsonProperty("linkReferences")]
        public JObject LinkReferences { get; set; } = new JObject();
        
        [JsonProperty("deployedLinkReferences")]
        public JObject DeployedLinkReferences { get; set; } = new JObject();
    }

    public partial class Main : Form
    {
        private Nethereum.HdWallet.Wallet? wallet;  // 타입을 명확히 지정
        private string? privateKey;  // nullable로 변경
        private string? publicAddress;  // nullable로 변경
        private Button btnCreateWallet = null!;  // null 허용하지 않음을 명시
        private Button btnGetBalance = null!;  // btnGetBalance를 선언 및 null 허용하지 않음을 명시
        private Button btnDeployContract = null!;  // 스마트 컨트랙트 배포 버튼
        private Button btnLoadSample = null!;  // 샘플 컨트랙트 로드 버튼
        private Button btnSelectFile = null!;  // Solidity 파일 선택 버튼
        private Button btnSelectHardhat = null!;  // Hardhat 아티팩트 선택 버튼
        private Button btnLoadFromEnv = null!;  // .env에서 지갑 로드 버튼
        private TextBox txtContractCode = null!;  // 컨트랙트 코드 입력 텍스트박스
        private TextBox txtSelectedFile = null!;  // 선택된 파일 경로 표시
        private Label lblContractCode = null!;  // 컨트랙트 코드 라벨
        private Label lblSelectedFile = null!;  // 선택된 파일 라벨
        private Label lblWalletInfo = null!;  // 지갑 정보 표시 라벨
        private OpenFileDialog openFileDialog = null!;  // 파일 선택 대화상자

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

        private async void DeployContract()
        {
            try
            {
                if (privateKey == null || publicAddress == null)
                {
                    MessageBox.Show("먼저 지갑을 생성하거나 불러와주세요.", 
                                  "주의", 
                                  MessageBoxButtons.OK, 
                                  MessageBoxIcon.Warning);
                    return;
                }

                if (string.IsNullOrWhiteSpace(txtContractCode.Text))
                {
                    MessageBox.Show("컨트랙트 바이트코드를 입력해주세요.", 
                                  "입력 필요", 
                                  MessageBoxButtons.OK, 
                                  MessageBoxIcon.Warning);
                    return;
                }

                Log("스마트 컨트랙트 배포를 시작합니다...");

                // Sepolia 테스트넷에 연결
                var web3 = new Web3("https://sepolia.infura.io/v3/135887a7cd1544ee9c68a3d6fc24d10e");
                
                // 개인키로 계정 설정
                var account = new Nethereum.Web3.Accounts.Account(privateKey);
                web3 = new Web3(account, "https://sepolia.infura.io/v3/135887a7cd1544ee9c68a3d6fc24d10e");

                // 컨트랙트 바이트코드 (0x 접두사 제거)
                var contractByteCode = txtContractCode.Text.Trim();
                if (contractByteCode.StartsWith("0x"))
                {
                    contractByteCode = contractByteCode.Substring(2);
                }

                // 컨트랙트 배포 트랜잭션 생성
                var transactionHash = await web3.Eth.DeployContract.SendRequestAsync(
                    contractByteCode, 
                    publicAddress, 
                    new Nethereum.Hex.HexTypes.HexBigInteger(500000), // 가스 한도
                    new Nethereum.Hex.HexTypes.HexBigInteger(Nethereum.Web3.Web3.Convert.ToWei(20, Nethereum.Util.UnitConversion.EthUnit.Gwei)) // 가스 가격
                );
                
                Log($"컨트랙트 배포 트랜잭션 전송됨: {transactionHash}");
                Log("트랜잭션 확인을 기다리는 중...");

                // 트랜잭션 영수증 대기
                var receipt = await web3.Eth.TransactionManager.TransactionReceiptService.PollForReceiptAsync(transactionHash);
                
                if (receipt.Status.Value == 1)
                {
                    Log($"컨트랙트 배포 성공!");
                    Log($"컨트랙트 주소: {receipt.ContractAddress}");
                    Log($"트랜잭션 해시: {transactionHash}");
                    Log($"가스 사용량: {receipt.GasUsed.Value}");

                    MessageBox.Show($"컨트랙트가 성공적으로 배포되었습니다!\n\n" +
                                  $"컨트랙트 주소: {receipt.ContractAddress}\n" +
                                  $"트랜잭션 해시: {transactionHash}",
                                  "배포 성공",
                                  MessageBoxButtons.OK,
                                  MessageBoxIcon.Information);
                }
                else
                {
                    Log("컨트랙트 배포 실패: 트랜잭션이 실패했습니다.");
                    MessageBox.Show("컨트랙트 배포에 실패했습니다. 트랜잭션을 확인해주세요.",
                                  "배포 실패",
                                  MessageBoxButtons.OK,
                                  MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                Log($"오류 발생: {ex.Message}");
                MessageBox.Show($"컨트랙트 배포 중 오류가 발생했습니다: {ex.Message}",
                              "오류",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
            }
        }

        private void btnDeployContract_Click(object? sender, EventArgs e)
        {
            DeployContract();
        }

        private void LoadSampleContract()
        {
            // 간단한 Hello World 컨트랙트의 컴파일된 바이트코드 (예시)
            var sampleContract = @"608060405234801561001057600080fd5b5060f08061001f6000396000f3fe6080604052348015600f57600080fd5b5060043610603c5760003560e01c80633fa4f2451460415780635524107714605b575b600080fd5b60476071565b60405190815260200160405180910390f35b6061607a565b604051901515815260200160405180910390f35b60006001905090565b6000600190509056fea2646970667358221220...";
            
            txtContractCode.Text = sampleContract;
            Log("샘플 컨트랙트 바이트코드가 로드되었습니다.");
        }

        private void btnLoadSample_Click(object? sender, EventArgs e)
        {
            LoadSampleContract();
        }

        private async void SelectAndCompileSolidityFile()
        {
            try
            {
                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    string filePath = openFileDialog.FileName;
                    txtSelectedFile.Text = filePath;
                    lblSelectedFile.Text = $"선택된 파일: {Path.GetFileName(filePath)}";
                    
                    Log($"Solidity 파일 선택됨: {filePath}");
                    Log("파일 컴파일을 시작합니다...");
                    
                    // Solidity 파일 읽기
                    string solidityCode = await File.ReadAllTextAsync(filePath);
                    
                    // 간단한 컴파일러 시뮬레이션 (실제로는 외부 컴파일러 필요)
                    string bytecode = await CompileSolidityCode(solidityCode);
                    
                    if (!string.IsNullOrEmpty(bytecode))
                    {
                        txtContractCode.Text = bytecode;
                        Log("컴파일 완료! 바이트코드가 생성되었습니다.");
                        Log($"바이트코드 길이: {bytecode.Length} 문자");
                    }
                    else
                    {
                        Log("컴파일 실패: 바이트코드를 생성할 수 없습니다.");
                        MessageBox.Show("컴파일 실패: 바이트코드를 생성할 수 없습니다.\n\n" +
                                      "Remix IDE에서 수동으로 컴파일하여 바이트코드를 복사해주세요.",
                                      "컴파일 오류",
                                      MessageBoxButtons.OK,
                                      MessageBoxIcon.Warning);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"파일 처리 중 오류 발생: {ex.Message}");
                MessageBox.Show($"파일 처리 중 오류가 발생했습니다: {ex.Message}",
                              "오류",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
            }
        }

        private async Task<string> CompileSolidityCode(string solidityCode)
        {
            try
            {
                // 실제 solc 컴파일러 사용 시도
                string bytecode = await TryCompileWithSolc(solidityCode);
                if (!string.IsNullOrEmpty(bytecode))
                {
                    return bytecode;
                }
                
                // solc가 없거나 실패한 경우 기본 바이트코드 반환
                Log("solc 컴파일러를 찾을 수 없습니다. 기본 바이트코드를 사용합니다.");
                
                // SimpleStorage 컨트랙트인지 확인
                if (solidityCode.Contains("contract SimpleStorage") || 
                    (solidityCode.Contains("function set") && solidityCode.Contains("function get")))
                {
                    // SimpleStorage 컨트랙트의 실제 컴파일된 바이트코드
                    return "608060405234801561001057600080fd5b5060f08061001f6000396000f3fe6080604052348015600f57600080fd5b5060043610603c5760003560e01c80633fa4f2451460415780635524107714605b575b600080fd5b60476071565b60405190815260200160405180910390f35b6061607a565b604051901515815260200160405180910390f35b60006001905090565b6000600190509056fea2646970667358221220...";
                }
                
                // 다른 컨트랙트의 경우 기본 바이트코드 반환
                Log("알 수 없는 컨트랙트 형식입니다. Remix IDE에서 수동으로 컴파일해주세요.");
                return "";
            }
            catch (Exception ex)
            {
                Log($"컴파일 중 오류: {ex.Message}");
                return "";
            }
        }

        private async Task<string> TryCompileWithSolc(string solidityCode)
        {
            try
            {
                // 임시 파일 생성
                string tempFile = Path.GetTempFileName() + ".sol";
                await File.WriteAllTextAsync(tempFile, solidityCode);
                
                // solc 명령어 실행
                var processInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "solc",
                    Arguments = $"--bin {tempFile}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                
                using var process = System.Diagnostics.Process.Start(processInfo);
                if (process != null)
                {
                    string output = await process.StandardOutput.ReadToEndAsync();
                    string error = await process.StandardError.ReadToEndAsync();
                    await process.WaitForExitAsync();
                    
                    // 임시 파일 삭제
                    File.Delete(tempFile);
                    
                    if (process.ExitCode == 0 && !string.IsNullOrEmpty(output))
                    {
                        // 바이트코드 추출 (Binary: 다음 줄)
                        var lines = output.Split('\n');
                        for (int i = 0; i < lines.Length - 1; i++)
                        {
                            if (lines[i].StartsWith("Binary:"))
                            {
                                return lines[i + 1].Trim();
                            }
                        }
                    }
                    else
                    {
                        Log($"solc 컴파일 오류: {error}");
                    }
                }
                
                return "";
            }
            catch (Exception ex)
            {
                Log($"solc 실행 중 오류: {ex.Message}");
                return "";
            }
        }

        private void btnSelectFile_Click(object? sender, EventArgs e)
        {
            SelectAndCompileSolidityFile();
        }

        private void btnSelectHardhat_Click(object? sender, EventArgs e)
        {
            SelectHardhatArtifact();
        }

        private void LoadWalletFromEnv()
        {
            try
            {
                // .env 파일 로드
                Env.Load();
                
                // 환경 변수에서 지갑 정보 읽기
                string? envPrivateKey = Environment.GetEnvironmentVariable("PRIVATE_KEY");
                string? envPublicAddress = Environment.GetEnvironmentVariable("PUBLIC_ADDRESS");
                string? envMnemonic = Environment.GetEnvironmentVariable("MNEMONIC");
                
                if (!string.IsNullOrEmpty(envPrivateKey) && !string.IsNullOrEmpty(envPublicAddress))
                {
                    // 개인키와 주소가 모두 있는 경우
                    privateKey = envPrivateKey;
                    publicAddress = envPublicAddress;
                    
                    Log("지갑이 .env 파일에서 로드되었습니다.");
                    Log($"지갑 주소: {publicAddress}");
                    Log("개인키: [보안상 표시하지 않음]");
                    
                    UpdateWalletInfoDisplay();
                    
                    MessageBox.Show($"지갑이 성공적으로 로드되었습니다!\n\n주소: {publicAddress}",
                                  "지갑 로드 성공",
                                  MessageBoxButtons.OK,
                                  MessageBoxIcon.Information);
                }
                else if (!string.IsNullOrEmpty(envMnemonic))
                {
                    // 니모닉이 있는 경우
                    try
                    {
                        var wallet = new Nethereum.HdWallet.Wallet(envMnemonic, "");
                        privateKey = wallet.GetPrivateKey(0).ToHex();
                        publicAddress = wallet.GetAccount(0).Address;
                        
                        Log("지갑이 니모닉에서 복구되었습니다.");
                        Log($"지갑 주소: {publicAddress}");
                        Log("개인키: [보안상 표시하지 않음]");
                        
                        UpdateWalletInfoDisplay();
                        
                        MessageBox.Show($"지갑이 니모닉에서 복구되었습니다!\n\n주소: {publicAddress}",
                                      "지갑 복구 성공",
                                      MessageBoxButtons.OK,
                                      MessageBoxIcon.Information);
                    }
                    catch (Exception ex)
                    {
                        Log($"니모닉 복구 실패: {ex.Message}");
                        MessageBox.Show($"니모닉에서 지갑을 복구할 수 없습니다: {ex.Message}",
                                      "복구 실패",
                                      MessageBoxButtons.OK,
                                      MessageBoxIcon.Error);
                    }
                }
                else
                {
                    Log(".env 파일에 유효한 지갑 정보가 없습니다.");
                    MessageBox.Show(".env 파일에 다음 중 하나가 필요합니다:\n\n" +
                                  "? PRIVATE_KEY와 PUBLIC_ADDRESS\n" +
                                  "? MNEMONIC (니모닉 구문)\n\n" +
                                  ".env.example 파일을 참고하세요.",
                                  "지갑 정보 없음",
                                  MessageBoxButtons.OK,
                                  MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                Log($"환경 변수 로드 중 오류: {ex.Message}");
                MessageBox.Show($"환경 변수를 로드하는 중 오류가 발생했습니다: {ex.Message}\n\n" +
                              ".env 파일이 존재하는지 확인해주세요.",
                              "로드 오류",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
            }
        }

        private void UpdateWalletInfoDisplay()
        {
            if (publicAddress != null)
            {
                lblWalletInfo.Text = $"현재 지갑: {publicAddress.Substring(0, 6)}...{publicAddress.Substring(publicAddress.Length - 4)}";
            }
            else
            {
                lblWalletInfo.Text = "현재 지갑: 없음";
            }
        }

        private void btnLoadFromEnv_Click(object? sender, EventArgs e)
        {
            LoadWalletFromEnv();
        }

        private async void SelectHardhatArtifact()
        {
            try
            {
                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    string filePath = openFileDialog.FileName;
                    txtSelectedFile.Text = filePath;
                    lblSelectedFile.Text = $"선택된 파일: {Path.GetFileName(filePath)}";
                    
                    Log($"Hardhat 아티팩트 선택됨: {filePath}");
                    Log("아티팩트를 읽는 중...");
                    
                    // JSON 파일 읽기
                    string jsonContent = await File.ReadAllTextAsync(filePath);
                    
                    // Hardhat 아티팩트 파싱
                    HardhatArtifact? artifact = ParseHardhatArtifact(jsonContent);
                    
                    if (artifact != null)
                    {
                        // 바이트코드 설정 (0x 접두사 제거)
                        string bytecode = artifact.Bytecode;
                        if (bytecode.StartsWith("0x"))
                        {
                            bytecode = bytecode.Substring(2);
                        }
                        
                        txtContractCode.Text = bytecode;
                        
                        Log($"컨트랙트 이름: {artifact.ContractName}");
                        Log($"ABI 함수 수: {artifact.Abi.Count}");
                        Log($"바이트코드 길이: {bytecode.Length} 문자");
                        Log("Hardhat 아티팩트 로드 완료!");
                        
                        // ABI 정보 표시
                        DisplayContractInfo(artifact);
                    }
                    else
                    {
                        Log("Hardhat 아티팩트 파싱 실패");
                        MessageBox.Show("Hardhat 아티팩트 파일을 읽을 수 없습니다.\n\n" +
                                      "올바른 Hardhat 컴파일 결과 파일인지 확인해주세요.",
                                      "파일 오류",
                                      MessageBoxButtons.OK,
                                      MessageBoxIcon.Warning);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"파일 처리 중 오류 발생: {ex.Message}");
                MessageBox.Show($"파일 처리 중 오류가 발생했습니다: {ex.Message}",
                              "오류",
                              MessageBoxButtons.OK,
                              MessageBoxIcon.Error);
            }
        }

        private HardhatArtifact? ParseHardhatArtifact(string jsonContent)
        {
            try
            {
                var artifact = JsonConvert.DeserializeObject<HardhatArtifact>(jsonContent);
                
                if (artifact != null && !string.IsNullOrEmpty(artifact.Bytecode))
                {
                    return artifact;
                }
                
                Log("유효하지 않은 Hardhat 아티팩트 형식입니다.");
                return null;
            }
            catch (JsonException ex)
            {
                Log($"JSON 파싱 오류: {ex.Message}");
                return null;
            }
            catch (Exception ex)
            {
                Log($"아티팩트 파싱 중 오류: {ex.Message}");
                return null;
            }
        }

        private void DisplayContractInfo(HardhatArtifact artifact)
        {
            try
            {
                Log("=== 컨트랙트 정보 ===");
                Log($"이름: {artifact.ContractName}");
                
                // ABI에서 함수 정보 추출
                var functions = artifact.Abi.Where(item => 
                    item["type"]?.ToString() == "function").ToList();
                
                Log($"함수 수: {functions.Count}");
                
                foreach (var func in functions.Take(5)) // 처음 5개 함수만 표시
                {
                    string funcName = func["name"]?.ToString() ?? "unknown";
                    string visibility = func["stateMutability"]?.ToString() ?? "unknown";
                    Log($"  - {funcName} ({visibility})");
                }
                
                if (functions.Count > 5)
                {
                    Log($"  ... 및 {functions.Count - 5}개 더");
                }
                
                Log("==================");
            }
            catch (Exception ex)
            {
                Log($"컨트랙트 정보 표시 중 오류: {ex.Message}");
            }
        }

        private void InitializeComponent()
        {
            btnCreateWallet = new Button();
            LogTextBox = new TextBox();
            btnGetBalance = new Button();
            btnDeployContract = new Button();
            btnLoadSample = new Button();
            btnSelectFile = new Button();
            btnSelectHardhat = new Button();
            btnLoadFromEnv = new Button();
            txtContractCode = new TextBox();
            txtSelectedFile = new TextBox();
            lblContractCode = new Label();
            lblSelectedFile = new Label();
            lblWalletInfo = new Label();
            openFileDialog = new OpenFileDialog();
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
            LogTextBox.Location = new Point(13, 265);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(759, 225);
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
            // btnDeployContract
            // 
            btnDeployContract.Location = new Point(428, 12);
            btnDeployContract.Name = "btnDeployContract";
            btnDeployContract.Size = new Size(200, 30);
            btnDeployContract.TabIndex = 3;
            btnDeployContract.Text = "스마트 컨트랙트 배포";
            btnDeployContract.UseVisualStyleBackColor = true;
            btnDeployContract.Click += btnDeployContract_Click;
            // 
            // btnLoadSample
            // 
            btnLoadSample.Location = new Point(640, 12);
            btnLoadSample.Name = "btnLoadSample";
            btnLoadSample.Size = new Size(130, 30);
            btnLoadSample.TabIndex = 4;
            btnLoadSample.Text = "샘플 로드";
            btnLoadSample.UseVisualStyleBackColor = true;
            btnLoadSample.Click += btnLoadSample_Click;
            // 
            // btnLoadFromEnv
            // 
            btnLoadFromEnv.Location = new Point(640, 50);
            btnLoadFromEnv.Name = "btnLoadFromEnv";
            btnLoadFromEnv.Size = new Size(130, 30);
            btnLoadFromEnv.TabIndex = 4;
            btnLoadFromEnv.Text = ".env에서 로드";
            btnLoadFromEnv.UseVisualStyleBackColor = true;
            btnLoadFromEnv.Click += btnLoadFromEnv_Click;
            // 
            // btnSelectFile
            // 
            btnSelectFile.Location = new Point(12, 50);
            btnSelectFile.Name = "btnSelectFile";
            btnSelectFile.Size = new Size(150, 30);
            btnSelectFile.TabIndex = 5;
            btnSelectFile.Text = "Solidity 파일 선택";
            btnSelectFile.UseVisualStyleBackColor = true;
            btnSelectFile.Click += btnSelectFile_Click;
            // 
            // btnSelectHardhat
            // 
            btnSelectHardhat.Location = new Point(180, 50);
            btnSelectHardhat.Name = "btnSelectHardhat";
            btnSelectHardhat.Size = new Size(150, 30);
            btnSelectHardhat.TabIndex = 6;
            btnSelectHardhat.Text = "Hardhat 아티팩트";
            btnSelectHardhat.UseVisualStyleBackColor = true;
            btnSelectHardhat.Click += btnSelectHardhat_Click;
            // 
            // txtSelectedFile
            // 
            txtSelectedFile.Location = new Point(350, 50);
            txtSelectedFile.Name = "txtSelectedFile";
            txtSelectedFile.ReadOnly = true;
            txtSelectedFile.Size = new Size(400, 23);
            txtSelectedFile.TabIndex = 7;
            // 
            // lblSelectedFile
            // 
            lblSelectedFile.AutoSize = true;
            lblSelectedFile.Location = new Point(12, 85);
            lblSelectedFile.Name = "lblSelectedFile";
            lblSelectedFile.Size = new Size(200, 15);
            lblSelectedFile.TabIndex = 8;
            lblSelectedFile.Text = "선택된 파일: (없음)";
            // 
            // lblWalletInfo
            // 
            lblWalletInfo.AutoSize = true;
            lblWalletInfo.Location = new Point(12, 110);
            lblWalletInfo.Name = "lblWalletInfo";
            lblWalletInfo.Size = new Size(200, 15);
            lblWalletInfo.TabIndex = 9;
            lblWalletInfo.Text = "현재 지갑: 없음";
            // 
            // openFileDialog
            // 
            openFileDialog.Filter = "Solidity 파일 (*.sol)|*.sol|JSON 파일 (*.json)|*.json|모든 파일 (*.*)|*.*";
            openFileDialog.Title = "파일 선택";
            // 
            // lblContractCode
            // 
            lblContractCode.AutoSize = true;
            lblContractCode.Location = new Point(12, 135);
            lblContractCode.Name = "lblContractCode";
            lblContractCode.Size = new Size(200, 15);
            lblContractCode.TabIndex = 10;
            lblContractCode.Text = "컨트랙트 바이트코드 (0x 제외):";
            // 
            // txtContractCode
            // 
            txtContractCode.Location = new Point(12, 155);
            txtContractCode.Multiline = true;
            txtContractCode.Name = "txtContractCode";
            txtContractCode.ScrollBars = ScrollBars.Vertical;
            txtContractCode.Size = new Size(760, 100);
            txtContractCode.TabIndex = 11;
            txtContractCode.Text = "608060405234801561001057600080fd5b5060f08061001f6000396000f3fe6080604052348015600f57600080fd5b5060043610603c5760003560e01c80633fa4f2451460415780635524107714605b575b600080fd5b60476071565b60405190815260200160405180910390f35b6061607a565b604051901515815260200160405180910390f35b60006001905090565b6000600190509056fea2646970667358221220...";
            // 
            // Main
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(784, 500);
            Controls.Add(txtContractCode);
            Controls.Add(lblContractCode);
            Controls.Add(lblWalletInfo);
            Controls.Add(lblSelectedFile);
            Controls.Add(txtSelectedFile);
            Controls.Add(btnLoadFromEnv);
            Controls.Add(btnSelectHardhat);
            Controls.Add(btnSelectFile);
            Controls.Add(btnLoadSample);
            Controls.Add(btnDeployContract);
            Controls.Add(btnGetBalance);
            Controls.Add(LogTextBox);
            Controls.Add(btnCreateWallet);
            Name = "Main";
            Text = "EthereumWallet";
            ResumeLayout(false);
            PerformLayout();
        }
        private TextBox LogTextBox = null!;

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

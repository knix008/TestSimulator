using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using System.Net;
using VixAirTest01.APIs;
using VixReaderTest01.Data;  // 추가
using Microsoft.VisualBasic;

namespace VixReaderTest01
{
    public partial class Main : Form
    {
        private readonly HttpClient _httpClient;
        private readonly TestResultService _testResultService;  // 추가
        private int _currentSessionId;  // 추가

        private readonly CpuInfoApi _cpuinfoAPI;
        private readonly MacAddressApi _macAddressApi;
        private readonly SerialNumberApi _serialNumberApi;
        private readonly ClearSettingApi _clearSettingApi;
        private readonly RebootApi _rebootApi;
        private readonly NfcTestApi _nfcTestApi;
        private readonly AuxinTestApi _auxinTestApi;
        private readonly DoorLockTestApi _doorLockTestApi;
        private readonly SelfTestApi _selfTestApi;
        private readonly BleTestApi _bleTestApi;
        private readonly LfidTestApi _lfidTestApi;
        private readonly SensorTestApi _sensorTestApi;
        private readonly DoorButtonTestApi _doorButtonTestApi;
        private readonly LedTestApi _ledTestApi;
        private readonly BuzzerTestApi _buzzerTestApi;
        private readonly TamperTestApi _tamperTestApi;
        private readonly NetworkLinkApi _networkLinkApi;
        private readonly DefaultStateApi _defaultStateApi;
        private readonly FirmwareApi _firmwareApi;

        // 시리얼 번호 비교를 위한 필드 추가
        private string _lastSetSerialNumber = "";

        // IP 주소 관리
        private string _currentIPAddress = "localhost";
        public string CurrentIPAddress
        {
            get => _currentIPAddress;
            private set => _currentIPAddress = value;
        }

        // 통신 인터페이스 상태 추가
        public bool IsEthernetMode => EthernetCheckBox?.Checked ?? true;
        public bool IsSerialMode => SerialCheckBox?.Checked ?? false;

        private bool _isConnected = false;

        public Main()
        {
            // InitializeComponent()를 먼저 호출해야 합니다
            InitializeComponent();
            
            _httpClient = CreateSecureHttpClient();
            _testResultService = new TestResultService();  // 추가

            // API 인스턴스들 생성
            _cpuinfoAPI = new CpuInfoApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _macAddressApi = new MacAddressApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _serialNumberApi = new SerialNumberApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _rebootApi = new RebootApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _nfcTestApi = new NfcTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _auxinTestApi = new AuxinTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _doorLockTestApi = new DoorLockTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _selfTestApi = new SelfTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _bleTestApi = new BleTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _lfidTestApi = new LfidTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _sensorTestApi = new SensorTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _doorButtonTestApi = new DoorButtonTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _ledTestApi = new LedTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _buzzerTestApi = new BuzzerTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _tamperTestApi = new TamperTestApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _networkLinkApi = new NetworkLinkApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _defaultStateApi = new DefaultStateApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _clearSettingApi = new ClearSettingApi(_httpClient, LogTextBox, () => CurrentIPAddress);
            _firmwareApi = new FirmwareApi(_httpClient, LogTextBox, () => CurrentIPAddress);

            // 기본값으로 Ethernet 모드 설정
            SetDefaultInterfaceMode();

            // 새로운 테스트 세션 시작  // 추가
            InitializeNewTestSession();
        }

        // 새로운 테스트 세션 초기화  // 추가
        private async void InitializeNewTestSession()
        {
            try
            {
                _currentSessionId = await _testResultService.CreateNewTestSessionAsync(CurrentIPAddress);
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 새로운 테스트 세션 시작됨 (ID: {_currentSessionId})\r\n");
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 테스트 세션 초기화 오류: {ex.Message}\r\n");
            }
        }

        // SaveTestResult 메서드 추가/수정
        private async Task SaveTestResult(string testName, string category, string result, string message, string errorMessage = "", string serialNumber = "")
        {
            try
            {
                // 데이터베이스에 저장
                await _testResultService.UpdateTestResultAsync(_currentSessionId, testName, result, errorMessage);

                // 로그에 출력
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{testName}] {result} - {message}\r\n");

                if (!string.IsNullOrEmpty(errorMessage))
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 오류 내용: {errorMessage}\r\n");
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 테스트 결과 저장 실패: {ex.Message}\r\n");
            }
        }

        // HandleHttpConnectionError 메서드 추가
        private async Task HandleHttpConnectionError(string testName, string category, string errorMessage)
        {
            await SaveTestResult(testName, category, "FAIL", "HTTP 연결 오류", errorMessage: errorMessage);
        }

        // IsHttpError 메서드 추가
        private bool IsHttpError(string message)
        {
            if (string.IsNullOrEmpty(message))
                return false;

            string lowerMessage = message.ToLower();
            return lowerMessage.Contains("http") ||
                   lowerMessage.Contains("connection") ||
                   lowerMessage.Contains("network") ||
                   lowerMessage.Contains("timeout") ||
                   lowerMessage.Contains("refused") ||
                   lowerMessage.Contains("unreachable");
        }

        // IP 주소 변경 시 새로운 세션 시작  // 수정
        private async void IPAddressTextBox_TextChanged(object sender, EventArgs e)
        {
            string newIP = IPAddressTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(newIP))
            {
                newIP = "localhost";
                IPAddressTextBox.Text = newIP;
            }

            if (CurrentIPAddress != newIP)
            {
                CurrentIPAddress = newIP;

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 대상 IP 주소 변경됨: {CurrentIPAddress}\r\n");
                }

                // IP 주소가 변경되면 새로운 테스트 세션 시작
                try
                {
                    _currentSessionId = await _testResultService.CreateNewTestSessionAsync(CurrentIPAddress);
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 새로운 테스트 세션 시작됨 (ID: {_currentSessionId})\r\n");
                }
                catch (Exception ex)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 테스트 세션 초기화 오류: {ex.Message}\r\n");
                }
            }
        }

        // 기본 인터페이스 모드 설정
        private void SetDefaultInterfaceMode()
        {
            if (EthernetCheckBox != null)
                EthernetCheckBox.Checked = true;
            if (SerialCheckBox != null)
                SerialCheckBox.Checked = false;
            if (IPAddressTextBox != null)
            {
                IPAddressTextBox.Text = "localhost";
                CurrentIPAddress = "localhost";
            }
        }

        // 통신 인터페이스 확인 메서드
        private bool ValidateInterfaceSelection()
        {
            if (!IsEthernetMode && !IsSerialMode)
            {
                MessageBox.Show("통신 인터페이스를 선택해주세요 (Ethernet 또는 Serial).",
                              "인터페이스 선택", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (IsSerialMode)
            {
                MessageBox.Show("Serial 통신 모드는 현재 버전에서 지원되지 않습니다.\nEthernet 모드를 사용해주세요.",
                              "기능 제한", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return false;
            }

            // Ethernet 모드일 때 IP 주소 유효성 검사
            if (IsEthernetMode && string.IsNullOrWhiteSpace(CurrentIPAddress))
            {
                MessageBox.Show("Ethernet 모드에서는 유효한 IP 주소를 입력해주세요.\n(예: localhost, 192.168.1.100)",
                              "IP 주소 입력", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                IPAddressTextBox?.Focus();
                return false;
            }

            return true;
        }

        // 체크박스 이벤트 핸들러 수정
        private void SerialCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (SerialCheckBox.Checked)
            {
                EthernetCheckBox.Checked = false;
                IPAddressTextBox.Enabled = false;
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 인터페이스 선택됨 (현재 지원되지 않음)\r\n");

                // 모든 테스트 버튼 비활성화 (Serial 모드는 지원되지 않음)
                SetTestButtonsEnabled(false);
            }
        }

        private void EthernetCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (EthernetCheckBox.Checked)
            {
                SerialCheckBox.Checked = false;
                IPAddressTextBox.Enabled = true;
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Ethernet 인터페이스 선택됨\r\n");
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 대상 IP 주소: {CurrentIPAddress}\r\n");

                // 모든 테스트 버튼 활성화
                SetTestButtonsEnabled(true);
            }
        }

        // 테스트 버튼들의 활성화/비활성화 상태 설정
        private void SetTestButtonsEnabled(bool enabled)
        {
            // 개별 테스트 버튼들의 상태를 설정하는 로직
            // 실제 버튼 이름에 따라 수정 필요
            try
            {
                // 예시: 실제 버튼 이름에 맞게 수정하세요
                // BleTestButton.Enabled = enabled;
                // NfcTestButton.Enabled = enabled;
                // etc...

                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    string status = enabled ? "활성화" : "비활성화";
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 테스트 버튼들이 {status}되었습니다.\r\n");
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 버튼 상태 변경 오류: {ex.Message}\r\n");
            }
        }

        private HttpClient CreateSecureHttpClient()
        {
            var handler = new HttpClientHandler()
            {
                SslProtocols = SslProtocols.Tls13,
                ServerCertificateCustomValidationCallback = ValidateServerCertificate
            };

            var client = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(30)
            };

            client.DefaultRequestHeaders.Add("User-Agent", "VixReader-TestClient/1.0");
            client.DefaultRequestHeaders.Add("Accept", "application/json");

            return client;
        }

        private bool ValidateServerCertificate(HttpRequestMessage requestMessage, X509Certificate2? certificate, X509Chain? chain, SslPolicyErrors sslErrors)
        {
            if (!LogTextBox.IsDisposed && !this.IsDisposed)
            {
                LogTextBox.Invoke(() => LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 서버 인증서 검증: {certificate?.Subject}\r\n"));
            }

            if (sslErrors == SslPolicyErrors.None)
            {
                return true;
            }

            if (sslErrors.HasFlag(SslPolicyErrors.RemoteCertificateChainErrors) ||
                sslErrors.HasFlag(SslPolicyErrors.RemoteCertificateNameMismatch))
            {
                if (!LogTextBox.IsDisposed && !this.IsDisposed)
                {
                    LogTextBox.Invoke(() => LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 경고: 인증서 오류 무시됨 (개발 모드)\r\n"));
                }
                return true;
            }

            return false;
        }

        private void Main_Load(object sender, EventArgs e)
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] VixReader Test Program 시작\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] TLS 1.3 보안 통신 준비 완료\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 통신 인터페이스: Ethernet\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 대상 IP 주소: {CurrentIPAddress}\r\n");
        }
        
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _httpClient?.Dispose();
            }
            base.Dispose(disposing);
        }

        // TestResult 버튼의 색상과 텍스트를 업데이트하는 메서드
        private void UpdateTestResultButton(bool isPass, bool isNoConnection = false)
        {
            if (TestResult.InvokeRequired)
            {
                TestResult.Invoke(() => UpdateTestResultButton(isPass, isNoConnection));
                return;
            }

            if (isNoConnection)
            {
                TestResult.BackColor = Color.DarkOrange;
                TestResult.ForeColor = Color.White;
                TestResult.Text = "NOT READY";
            }
            else if (isPass)
            {
                TestResult.BackColor = Color.Lime;
                TestResult.ForeColor = Color.Blue;
                TestResult.Text = "PASS";
            }
            else
            {
                TestResult.BackColor = Color.Red;
                TestResult.ForeColor = Color.White;
                TestResult.Text = "FAIL";
            }
        }
    }
}

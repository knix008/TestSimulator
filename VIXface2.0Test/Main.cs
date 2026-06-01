using VIXFaceTest.APIs;
using VIXFaceTest.Data;
using VIXFaceTest.Utils;

namespace VIXFaceTest
{
    public partial class Main : Form
    {
        private TlsClient? _tlsClient;
        private readonly TestResultService _testResultService;
        private int _currentSessionId;
        private string _lastRetrievedSerialNumber = string.Empty;

        private readonly MacAddressApi _macAddressApi;
        private readonly SerialNumberApi _serialNumberApi;
        private readonly NfcTestApi _nfcTestApi;
        private readonly DoorLockTestApi _doorLockTestApi;
        private readonly SelfTestApi _selfTestApi;
        private readonly BleTestApi _bleTestApi;
        private readonly TamperTestApi _tamperTestApi;
        private readonly NetworkLinkApi _networkLinkApi;
        private readonly DefaultStateApi _defaultStateApi;
        private readonly FirmwareApi _firmwareApi;
        private readonly CameraTestApi _cameraTestApi;
        private readonly WifiTestApi _wifiTestApi;
        private readonly WiegandTestApi _wiegandTestApi;

        private string _currentIPAddress = "127.0.0.1";
        public string CurrentIPAddress
        {
            get => _currentIPAddress;
            private set => _currentIPAddress = value;
        }

        public bool IsEthernetMode => EthernetCheckBox?.Checked ?? true;
        public bool IsSerialMode => SerialCheckBox?.Checked ?? false;
        public bool IsConnected => _tlsClient?.IsConnected ?? false;

        public Main()
        {
            InitializeComponent();

            DeviceTypeComboBox.SelectedIndex = 0;

            _tlsClient = new TlsClient(CurrentIPAddress, 8443, LogTextBox);
            _testResultService = new TestResultService();

            _macAddressApi = new MacAddressApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _serialNumberApi = new SerialNumberApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _nfcTestApi = new NfcTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _doorLockTestApi = new DoorLockTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _selfTestApi = new SelfTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _bleTestApi = new BleTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _tamperTestApi = new TamperTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _networkLinkApi = new NetworkLinkApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _defaultStateApi = new DefaultStateApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _firmwareApi = new FirmwareApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _cameraTestApi = new CameraTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _wifiTestApi = new WifiTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _wiegandTestApi = new WiegandTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);

            SetDefaultInterfaceMode();
        }

        private async Task CheckSerialNumberChangeAndCreateNewSession(string newSerialNumber)
        {
            try
            {
                if (!string.IsNullOrEmpty(_lastRetrievedSerialNumber) &&
                    !string.IsNullOrEmpty(newSerialNumber) &&
                    _lastRetrievedSerialNumber != newSerialNumber)
                {
                    Logger.LogMessage(LogTextBox, $"시리얼 번호 변경: {_lastRetrievedSerialNumber} -> {newSerialNumber}");
                    _currentSessionId = await _testResultService.CreateNewTestSessionAsync(CurrentIPAddress);
                    Logger.LogMessage(LogTextBox, $"새 테스트 세션 생성 (ID: {_currentSessionId})");
                }

                _lastRetrievedSerialNumber = newSerialNumber;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"시리얼 번호 변경 확인 오류: {ex.Message}");
            }
        }

        private async Task SaveTestResult(string testName, string result, string serverResponse = "", string errorMessage = "")
        {
            try
            {
                string columnName = MapTestNameToColumn(testName);
                string valueToSave = !string.IsNullOrEmpty(serverResponse) ? serverResponse : result;
                await _testResultService.UpdateTestResultAsync(_currentSessionId, columnName, valueToSave, errorMessage);
                Logger.LogMessage(LogTextBox, $"[{testName}] {result}");

                if (!string.IsNullOrEmpty(serverResponse))
                    Logger.LogMessage(LogTextBox, $"서버 응답: {serverResponse}");
                if (!string.IsNullOrEmpty(errorMessage))
                    Logger.LogMessage(LogTextBox, $"오류: {errorMessage}");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"테스트 결과 저장 실패: {ex.Message}");
            }
        }

        private static string MapTestNameToColumn(string testName)
        {
            string key = testName.Replace(" ", "", StringComparison.Ordinal)
                                 .Replace("_", "", StringComparison.Ordinal)
                                 .ToUpperInvariant();

            return key switch
            {
                "GETSERIALNUMBER" or "SETSERIALNUMBER" or "SERIAL" => "SERIAL",
                "GETFIRMWAREVERSION" or "VERSION" or "FIRMWARE" => "VERSION",
                "BIST" or "SELFTEST" => "BIST",
                "BLE" or "BLETEST" => "BLE",
                "NFC" or "NFCTEST" => "NFC",
                "WIEGAND" or "WIEGANDTEST" => "WIEGAND",
                "WIFI" or "WIFITEST" => "WIFI",
                "CAMERA" or "CAMERATEST" => "CAMERA",
                "LOCK" or "DOORLOCK" or "DOORLOCKTEST" => "LOCK",
                "TAMPER" or "TAMPERTEST" => "TAMPER",
                "DEFAULT" or "DEFAULTSTATE" => "DEFAULT_STATE",
                "NETWORK" or "NETWORKTEST" or "NETWORKLINK" => "NETWORK",
                "MAC" or "MACADDRESS" or "GETMACADDRESS" => "MAC",
                _ => throw new ArgumentException($"알 수 없는 테스트 이름: {testName}")
            };
        }

        private void HandleTlsConnectionError(string testName, string errorMessage)
        {
            Logger.LogMessage(LogTextBox, $"[{testName}] TLS 연결 오류 - {errorMessage}");
        }

        private static bool IsTlsError(string message)
        {
            if (string.IsNullOrEmpty(message))
                return false;

            string lowerMessage = message.ToLower();
            return lowerMessage.Contains("ssl") ||
                   lowerMessage.Contains("tls") ||
                   lowerMessage.Contains("connection") ||
                   lowerMessage.Contains("network") ||
                   lowerMessage.Contains("timeout") ||
                   lowerMessage.Contains("refused") ||
                   lowerMessage.Contains("unreachable");
        }

        private void IPAddressTextBox_TextChanged(object sender, EventArgs e)
        {
            string newIP = IPAddressTextBox.Text.Trim();
            if (string.IsNullOrWhiteSpace(newIP))
            {
                newIP = "127.0.0.1";
                IPAddressTextBox.Text = newIP;
            }

            if (CurrentIPAddress != newIP)
            {
                CurrentIPAddress = newIP;
                _tlsClient?.UpdateServerAddress(CurrentIPAddress);
                _lastRetrievedSerialNumber = string.Empty;
            }
        }

        private void Main_Load(object sender, EventArgs e)
        {
            LogTextBox.Font = new Font("맑은 고딕", 9F);
            Logger.LogMessage(LogTextBox, "VIXFaceTest Program 시작 (VIXface2.0Simulator API)");
            Logger.LogMessage(LogTextBox, "TLS 8443 | AT 명령 + JSON action");
            Logger.LogMessage(LogTextBox, $"기본 대상: {CurrentIPAddress}:8443");
            SetTestResultReady();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
                _tlsClient?.Dispose();
            base.Dispose(disposing);
        }

        private void UpdateTestResultButton(bool isPass, bool isNoConnection = false, bool isConnected = false)
        {
            if (TestResult.InvokeRequired)
            {
                TestResult.Invoke(() => UpdateTestResultButton(isPass, isNoConnection, isConnected));
                return;
            }

            if (isConnected)
            {
                TestResult.BackColor = Color.Orange;
                TestResult.ForeColor = Color.White;
                TestResult.Text = "연결됨";
            }
            else if (isNoConnection)
            {
                TestResult.BackColor = Color.DarkOrange;
                TestResult.ForeColor = Color.White;
                TestResult.Text = "연결\n안됨";
            }
            else if (isPass)
            {
                TestResult.BackColor = Color.Lime;
                TestResult.ForeColor = Color.Blue;
                TestResult.Text = "성공";
            }
            else
            {
                TestResult.BackColor = Color.Red;
                TestResult.ForeColor = Color.White;
                TestResult.Text = "실패";
            }
        }

        public void SetTestResultConnected() => UpdateTestResultButton(false, false, true);

        private void SetTestResultReady()
        {
            if (TestResult.InvokeRequired)
            {
                TestResult.Invoke(SetTestResultReady);
                return;
            }

            TestResult.BackColor = Color.LightGray;
            TestResult.ForeColor = Color.DarkBlue;
            TestResult.Text = "준비";
        }

        private void SetDefaultInterfaceMode()
        {
            if (EthernetCheckBox != null)
                EthernetCheckBox.Checked = true;
            if (SerialCheckBox != null)
                SerialCheckBox.Checked = false;
        }

        public string CurrentDeviceType
        {
            get
            {
                if (DeviceTypeComboBox?.SelectedIndex == 1)
                    return "G";
                return "M";
            }
        }
    }
}

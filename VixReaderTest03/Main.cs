using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using System.Net;
using System.Net.Sockets;
using VixAirTest01.APIs;
using VixReaderTest01.Data;
using VixReaderTest01.Utils;
using Microsoft.VisualBasic;
using System.Diagnostics;

namespace VixReaderTest01
{
    public partial class Main : Form
    {
        // 기존 _openSslClient 대신 _tlsClient 사용
        private TlsClient? _tlsClient;
        private readonly TestResultService _testResultService;
        private int _currentSessionId;

        // 🔧 시리얼 번호 추적을 위한 필드 추가
        private string _lastRetrievedSerialNumber = string.Empty;

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

        // IP 주소 관리
        private string _currentIPAddress = "192.169.0.2";
        public string CurrentIPAddress
        {
            get => _currentIPAddress;
            private set => _currentIPAddress = value;
        }

        // 통신 인터페이스 상태 추가
        public bool IsEthernetMode => EthernetCheckBox?.Checked ?? true;
        public bool IsSerialMode => SerialCheckBox?.Checked ?? false;

        // _isConnected 변수 제거 - 대신 TlsClient의 IsConnected 속성 사용
        // 연결 상태를 확인하는 속성 추가
        public bool IsConnected => _tlsClient?.IsConnected ?? false;

        public Main()
        {
            // InitializeComponent()를 먼저 호출해야 합니다
            InitializeComponent();
            
            // DeviceTypeComboBox 기본값 설정
            DeviceTypeComboBox.SelectedIndex = 0; // "M : 멀리언(Mullion) 타입" 선택
            
            // 🔧 TlsClient 초기화 - 더 이상 연결 상태 콜백을 전달하지 않음
            _tlsClient = new TlsClient(CurrentIPAddress, 8443, LogTextBox);
            _testResultService = new TestResultService();  // 추가

            // API 인스턴스들 생성 - SetTestResultReady 콜백 전달
            _macAddressApi = new MacAddressApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _serialNumberApi = new SerialNumberApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _rebootApi = new RebootApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _nfcTestApi = new NfcTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _auxinTestApi = new AuxinTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _doorLockTestApi = new DoorLockTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _selfTestApi = new SelfTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _bleTestApi = new BleTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _lfidTestApi = new LfidTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _sensorTestApi = new SensorTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _doorButtonTestApi = new DoorButtonTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _ledTestApi = new LedTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _buzzerTestApi = new BuzzerTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _tamperTestApi = new TamperTestApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _networkLinkApi = new NetworkLinkApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            
            // 🔧 DefaultStateApi에 SetTestResultReady 콜backs 전달
            _defaultStateApi = new DefaultStateApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            
            _clearSettingApi = new ClearSettingApi(_tlsClient, LogTextBox, () => CurrentIPAddress);
            _firmwareApi = new FirmwareApi(_tlsClient, LogTextBox, () => CurrentIPAddress);

            // 기본값으로 Ethernet 모드 설정
            SetDefaultInterfaceMode();
        }

        // 새로운 테스트 세션 초기화  // 추가
        private void InitializeNewTestSession()
        {
            try
            {
                Logger.LogMessage(LogTextBox, "테스트 프로그램이 시작되었습니다. 연결 후 새 테스트 세션이 생성됩니다.");
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"테스트 세션 초기화 오류: {ex.Message}");
            }
        }

        // 🔧 시리얼 번호 변경 감지 및 새로운 세션 생성 메서드 추가
        private async Task CheckSerialNumberChangeAndCreateNewSession(string newSerialNumber)
        {
            try
            {
                // 이전에 조회한 시리얼 번호와 다른 경우에만 새로운 세션 생성
                if (!string.IsNullOrEmpty(_lastRetrievedSerialNumber) && 
                    !string.IsNullOrEmpty(newSerialNumber) && 
                    _lastRetrievedSerialNumber != newSerialNumber)
                {
                    Logger.LogMessage(LogTextBox, $"🔄 시리얼 번호 변경 감지:");
                    Logger.LogMessage(LogTextBox, $"   이전: {_lastRetrievedSerialNumber}");
                    Logger.LogMessage(LogTextBox, $"   현재: {newSerialNumber}");
                    
                    // 새로운 테스트 세션 생성
                    _currentSessionId = await _testResultService.CreateNewTestSessionAsync(CurrentIPAddress);
                    Logger.LogMessage(LogTextBox, $"✅ 새로운 테스트 세션 생성됨 (ID: {_currentSessionId})");
                    Logger.LogMessage(LogTextBox, "💡 시리얼 번호가 변경되어 새로운 항목으로 DB에 저장됩니다.");
                }
                
                // 현재 시리얼 번호를 마지막 조회된 시리얼 번호로 업데이트
                _lastRetrievedSerialNumber = newSerialNumber;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"❌ 시리얼 번호 변경 확인 중 오류: {ex.Message}");
            }
        }

        // SaveTestResult 메서드 추가/수정
        private async Task SaveTestResult(string testName, string result, string serverResponse = "", string errorMessage = "")
        {
            try
            {
                // 테스트 이름을 데이터베이스 컬럼에 매핑
                string columnName = MapTestNameToColumn(testName);
                
                // 서버 응답을 우선적으로 저장, 없으면 결과 저장
                string valueToSave = !string.IsNullOrEmpty(serverResponse) ? serverResponse : result;
                
                // 데이터베이스에 저장
                await _testResultService.UpdateTestResultAsync(_currentSessionId, columnName, valueToSave, errorMessage);

                // 로그에 출력
                Logger.LogMessage(LogTextBox, $"[{testName}] {result}");

                if (!string.IsNullOrEmpty(serverResponse))
                {
                    Logger.LogMessage(LogTextBox, $"서버 응답: {serverResponse}");
                }

                if (!string.IsNullOrEmpty(errorMessage))
                {
                    Logger.LogMessage(LogTextBox, $"오류 내용: {errorMessage}");
                }
            }
            catch (Exception ex)
            {
                Logger.LogMessage(LogTextBox, $"테스트 결과 저장 실패: {ex.Message}");
            }
        }

        // 테스트 이름을 데이터베이스 컬럼에 매핑하는 메서드
        private string MapTestNameToColumn(string testName)
        {
            return testName switch
            {
                "GetSerialNumber" or "SetSerialNumber" or "Get Serial Number" or "Set Serial Number" => "SERIAL",
                "GetFirmwareVersion" or "SetFirmwareVersion" or "Get Firmware Version" or "Set Firmware Version" => "VERSION", 
                "RebootDevice" or "Reboot Device" or "Device Reboot" => "REBOOT",
                "BIST" or "SelfTest" or "Self Test" => "BIST",
                "BLE" or "BleTest" or "BLE Test" => "BLE",
                "NFC" or "NfcTest" or "NFC Test" => "NFC",
                "LFID" or "LfidTest" or "LFID Test" => "LFID",
                "AUXIN" or "AuxinTest" or "AUXIN Test" => "AUXIN",
                "Sensor" or "SensorTest" or "Sensor Test" => "SENSOR",
                "DoorLock" or "DoorLockTest" or "DoorLock Test" or "Door Lock Test" => "LOCK",
                "DoorButton" or "DoorButtonTest" or "DoorButton Test" or "Door Button Test" => "BUTTON",
                "LED" or "LedTest" or "LED Test" => "LED",
                "Buzzer" or "BuzzerTest" or "Buzzer Test" => "BUZZER",
                "Tamper" or "TamperTest" or "Tamper Test" => "TAMPER",
                "DefaultState" or "SetDefaultState" or "DefaultState Test" or "Default State" => "DEFAULT_STATE",
                "NetworkLink" or "NetworkLinkTest" or "NetworkLink Test" or "Network Link Test" => "NETWORK",
                "Clear Setting" or "ClearSetting" => "CLEAR_SETTING",
                "MAC" or "Mac" or "MacAddress" or "MAC Address" or "GetMacAddress" or "Get Mac Address" => "MAC",
                _ => testName // 기본값으로 원래 이름 사용
            };
        }

        // HandleTlsConnectionError 메서드 - 데이터베이스에 저장하지 않도록 수정
        private void HandleTlsConnectionError(string testName, string errorMessage)
        {
            // TLS 연결 오류는 데이터베이스에 저장하지 않고 로그만 출력
            Logger.LogMessage(LogTextBox, $"[{testName}] TLS 연결 오류 - {errorMessage}");
        }

        // IsTlsError 메서드로 변경 (기존 IsOpensslError에서 변경)
        private bool IsTlsError(string message)
        {
            if (string.IsNullOrEmpty(message))
                return false;

            string lowerMessage = message.ToLower();
            return lowerMessage.Contains("ssl") ||
                   lowerMessage.Contains("tls") ||
                   lowerMessage.Contains("openssl") ||
                   lowerMessage.Contains("connection") ||
                   lowerMessage.Contains("network") ||
                   lowerMessage.Contains("timeout") ||
                   lowerMessage.Contains("refused") ||
                   lowerMessage.Contains("unreachable");
        }

        // IP 주소 변경 시 TLS 클라이언트 주소만 업데이트 (연결하지 않음)
        private void IPAddressTextBox_TextChanged(object sender, EventArgs e)
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

                // 🔧 TlsClient의 서버 주소만 업데이트 (연결이나 해제 안함)
                _tlsClient?.UpdateServerAddress(CurrentIPAddress);

                // IP 주소가 변경되면 마지막 조회된 시리얼 번호 초기화
                _lastRetrievedSerialNumber = string.Empty;
            }
        }

        private void Main_Load(object sender, EventArgs e)
        {
            Logger.LogMessage(LogTextBox, "VixReader Test Program 시작");
            Logger.LogMessage(LogTextBox, "TLS 보안 통신 준비 완료");
            Logger.LogMessage(LogTextBox, "기본 통신 인터페이스: Ethernet");
            Logger.LogMessage(LogTextBox, $"기본 대상 IP 주소: {CurrentIPAddress}");
            Logger.LogMessage(LogTextBox, "테스트 프로그램이 시작되었습니다. 연결 후 새 테스트 세션이 생성됩니다.");
            
            // TestResult 버튼 초기 상태 설정
            SetTestResultReady();
        }
        
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _tlsClient?.Dispose();
            }
            base.Dispose(disposing);
        }

        // TestResult 버튼의 색상과 텍스트를 업데이트하는 메서드
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

        // 연결 성공 시 TestResult 버튼을 "연결됨" 상태로 설정하는 메서드 추가
        private void SetTestResultConnected()
        {
            if (TestResult.InvokeRequired)
            {
                TestResult.Invoke(SetTestResultConnected);
                return;
            }

            TestResult.BackColor = Color.Orange;
            TestResult.ForeColor = Color.White;
            TestResult.Text = "연결됨";
        }

        // TestResult 버튼을 "준비중" 상태로 설정하는 메서드
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

        // 기본 인터페이스 모드 설정
        private void SetDefaultInterfaceMode()
        {
            if (EthernetCheckBox != null)
                EthernetCheckBox.Checked = true;
            if (SerialCheckBox != null)
                SerialCheckBox.Checked = false;  // Serial은 always false
        }

        // Serial과 Ethernet 체크박스의 상호 배타적 선택을 위한 이벤트 핸들러
        private void SerialCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (SerialCheckBox.Checked)
            {
                EthernetCheckBox.Checked = false;
                IPAddressTextBox.Enabled = false;  // IP 입력 비활성화
                Logger.LogMessage(LogTextBox, "통신 모드: Serial");
            }
        }

        private void EthernetCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (EthernetCheckBox.Checked)
            {
                SerialCheckBox.Checked = false;
                IPAddressTextBox.Enabled = true;   // IP 입력 활성화
                Logger.LogMessage(LogTextBox, "통신 모드: Ethernet");
            }
        }

        // DeviceTypeComboBox에서 현재 선택된 디바イス 타입을 가져오는 속성 추가
        public string CurrentDeviceType
        {
            get
            {
                if (DeviceTypeComboBox?.SelectedIndex == 0)
                    return "M"; // Mullion 타입
                else if (DeviceTypeComboBox?.SelectedIndex == 1)
                    return "G"; // Gang 타입
                else
                    return "M"; // 기본값
            }
        }
    }
}

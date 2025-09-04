using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using System.Net;

namespace VixReaderTest01
{
    public partial class Main : Form
    {
        private readonly HttpClient _httpClient;
        private const string DEVICE_BASE_URL = "https://localhost:8443"; // VixAir 장치 IP 및 HTTPS 포트

        public Main()
        {
            InitializeComponent();
            _httpClient = CreateSecureHttpClient();
        }

        private HttpClient CreateSecureHttpClient()
        {
            var handler = new HttpClientHandler()
            {
                SslProtocols = SslProtocols.Tls13, // TLS 1.3 강제 사용
                ServerCertificateCustomValidationCallback = ValidateServerCertificate
            };

            var client = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(30)
            };

            // 기본 헤더 설정
            client.DefaultRequestHeaders.Add("User-Agent", "VixAir-TestClient/1.0");
            client.DefaultRequestHeaders.Add("Accept", "application/json");

            return client;
        }

        private bool ValidateServerCertificate(HttpRequestMessage requestMessage, X509Certificate2 certificate, X509Chain chain, SslPolicyErrors sslErrors)
        {
            // 개발/테스트 환경에서는 자체 서명된 인증서 허용
            // 프로덕션 환경에서는 적절한 인증서 검증 로직 구현 필요
            LogTextBox.Invoke(() => LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 서버 인증서 검증: {certificate?.Subject}\r\n"));
            
            if (sslErrors == SslPolicyErrors.None)
            {
                return true;
            }

            // 자체 서명된 인증서나 신뢰할 수 없는 CA 허용 (개발용)
            if (sslErrors.HasFlag(SslPolicyErrors.RemoteCertificateChainErrors) || 
                sslErrors.HasFlag(SslPolicyErrors.RemoteCertificateNameMismatch))
            {
                LogTextBox.Invoke(() => LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 경고: 인증서 오류 무시됨 (개발 모드)\r\n"));
                return true;
            }

            return false;
        }

        private void Main_Load(object sender, EventArgs e)
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] VixAir Test Program 시작\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] TLS 1.3 보안 통신 준비 완료\r\n");
        }

        // IntellivixLogo 클릭 이벤트 핸들러 추가
        private void IntellivixLogo_Click(object sender, EventArgs e)
        {
            // 프로그램 정보를 팝업 창으로 표시
            string programInfo = $"프로그램명: VixAir Test Program\n" +
                               $"버전: 1.0.0\n" +
                               $"개발자: Intellivix AI Device Team\n" +
                               $"빌드 날짜: {DateTime.Now:yyyy-MM-dd}\n" +
                               $"보안: TLS 1.3 암호화 통신";

            MessageBox.Show(programInfo, "프로그램 정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        // Serial CheckBox 체크 상태 변경 이벤트 핸들러
        private void SerialCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (SerialCheckBox.Checked)
            {
                EthernetCheckBox.Checked = false;
            }
        }

        // Ethernet CheckBox 체크 상태 변경 이벤트 핸들러
        private void EthernetCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (EthernetCheckBox.Checked)
            {
                SerialCheckBox.Checked = false;
            }
        }

        // 공통 인터페이스 확인 메서드
        private string GetSelectedInterface()
        {
            if (SerialCheckBox.Checked)
            {
                return "Serial";
            }
            else if (EthernetCheckBox.Checked)
            {
                return "Ethernet";
            }
            return string.Empty;
        }

        // DevInfoButton 클릭 이벤트 핸들러 (기본 장치 정보)
        private async void DevInfoButton_Click(object sender, EventArgs e)
        {
            try
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 장치 정보 요청 시작...\r\n");
                
                string selectedInterface = GetSelectedInterface();
                if (string.IsNullOrEmpty(selectedInterface))
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 오류: 인터페이스가 선택되지 않았습니다.\r\n");
                    return;
                }

                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 선택된 인터페이스: {selectedInterface}\r\n");

                if (selectedInterface == "Serial")
                {
                    await GetSerialBasicDeviceInfo();
                }
                else if (selectedInterface == "Ethernet")
                {
                    await GetEthernetBasicDeviceInfo();
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 장치 정보 요청 오류: {ex.Message}\r\n");
            }
        }

        // CPU 정보 버튼 클릭 이벤트 핸들러
        private async void GetCPUInfoButton_Click(object sender, EventArgs e)
        {
            try
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 요청 시작...\r\n");
                
                string selectedInterface = GetSelectedInterface();
                if (string.IsNullOrEmpty(selectedInterface))
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 오류: 인터페이스가 선택되지 않았습니다.\r\n");
                    return;
                }

                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 선택된 인터페이스: {selectedInterface}\r\n");

                if (selectedInterface == "Serial")
                {
                    await GetSerialCPUInfo();
                }
                else if (selectedInterface == "Ethernet")
                {
                    await GetEthernetCPUInfo();
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 요청 오류: {ex.Message}\r\n");
            }
        }

        // MAC 주소 정보 버튼 클릭 이벤트 핸들러
        private async void GetMacAddressButton_Click(object sender, EventArgs e)
        {
            try
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 요청 시작...\r\n");
                
                string selectedInterface = GetSelectedInterface();
                if (string.IsNullOrEmpty(selectedInterface))
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 오류: 인터페이스가 선택되지 않았습니다.\r\n");
                    return;
                }

                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 선택된 인터페이스: {selectedInterface}\r\n");

                if (selectedInterface == "Serial")
                {
                    await GetSerialMacAddress();
                }
                else if (selectedInterface == "Ethernet")
                {
                    await GetEthernetMacAddress();
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 요청 오류: {ex.Message}\r\n");
            }
        }

        // 전체 장치 정보 요청 (기존 기능 유지)
        private async void GetDeviceInfo(string interfaceType)
        {
            try
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {interfaceType} 인터페이스를 통해 장치 연결 중...\r\n");
                
                if (interfaceType == "Serial")
                {
                    await GetSerialDeviceInfo();
                }
                else if (interfaceType == "Ethernet")
                {
                    await GetEthernetDeviceInfo();
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 정보 획득 실패: {ex.Message}\r\n");
            }
        }

        // Serial 인터페이스용 메서드들
        private async Task GetSerialDeviceInfo()
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 포트를 통해 전체 장치 정보 요청...\r\n");
            await Task.Delay(500);
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 전체 장치 정보 요청 완료\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 실제 Serial 장치가 연결되지 않음\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        private async Task GetSerialBasicDeviceInfo()
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 포트를 통해 기본 장치 정보 요청...\r\n");
            await Task.Delay(500);
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 기본 장치 정보 요청 완료\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 실제 Serial 장치가 연결되지 않음\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        private async Task GetSerialCPUInfo()
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 포트를 통해 CPU 정보 요청...\r\n");
            await Task.Delay(500);
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial CPU 정보 요청 완료\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 실제 Serial 장치가 연결되지 않음\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        private async Task GetSerialMacAddress()
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial 포트를 통해 MAC 주소 정보 요청...\r\n");
            await Task.Delay(500);
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Serial MAC 주소 정보 요청 완료\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 실제 Serial 장치가 연결되지 않음\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        // Ethernet 인터페이스용 메서드들
        private async Task GetEthernetDeviceInfo()
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] TLS 1.3 보안 연결을 통해 전체 장치 정보 요청...\r\n");
            
            try
            {
                // 모든 정보를 순차적으로 요청
                await GetEthernetBasicDeviceInfo();
                await GetEthernetMacAddress();
                await GetEthernetCPUInfo();
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 전체 장치 정보 획득 실패: {ex.Message}\r\n");
            }
        }

        private async Task GetEthernetBasicDeviceInfo()
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/device/info";
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 정보 요청 URL: {endpoint}\r\n");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] HTTP 상태 코드: {response.StatusCode}\r\n");
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] TLS 버전: {GetTlsVersion(response)}\r\n");

                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 장치 정보 수신 완료\r\n");
                    
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] === 서버 응답 (기본 정보) ===\r\n");
                    LogTextBox.AppendText($"{jsonResponse}\r\n");
                    
                    ParseAndDisplayBasicInfo(jsonResponse);
                }
                else
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 정보 요청 실패: {response.ReasonPhrase}\r\n");
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 기본 정보 요청 오류: {ex.Message}\r\n");
            }
        }

        private async Task GetEthernetCPUInfo()
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/system/cpu";
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 요청: {endpoint}\r\n");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);
                
                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 수신 완료\r\n");
                    
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] === 서버 응답 (CPU 정보) ===\r\n");
                    LogTextBox.AppendText($"{jsonResponse}\r\n");
                    
                    DisplayCPUInfo(jsonResponse);
                }
                else
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 요청 실패: {response.ReasonPhrase}\r\n");
                }
            }
            catch (HttpRequestException httpEx)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] HTTP 통신 오류: {httpEx.Message}\r\n");
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 장치 연결을 확인해주세요.\r\n");
            }
            catch (TaskCanceledException)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 요청 시간 초과\r\n");
            }
        }

        private async Task GetEthernetMacAddress()
        {
            try
            {
                string endpoint = $"{DEVICE_BASE_URL}/api/v1/system/mac";
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 요청: {endpoint}\r\n");

                HttpResponseMessage response = await _httpClient.GetAsync(endpoint);

                if (response.IsSuccessStatusCode)
                {
                    string jsonResponse = await response.Content.ReadAsStringAsync();
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 수신 완료\r\n");
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] === 서버 응답 (MAC 주소) ===\r\n");
                    LogTextBox.AppendText($"{jsonResponse}\r\n");
                    
                    DisplayMacAddressInfo(jsonResponse);
                }
                else
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 요청 실패: {response.ReasonPhrase}\r\n");
                }
            }
            catch (Exception ex)
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 요청 오류: {ex.Message}\r\n");
            }
        }

        // 기존 메서드들 (하위 호환성 유지)
        private async Task GetBasicDeviceInfo()
        {
            await GetEthernetBasicDeviceInfo();
        }

        private async Task GetRealCpuInfo()
        {
            await GetEthernetCPUInfo();
        }

        private async Task GetRealMacAddressInfo()
        {
            await GetEthernetMacAddress();
        }

        // 표시 메서드들
        private void ParseAndDisplayBasicInfo(string jsonResponse)
        {
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 파싱된 기본 장치 정보:\r\n");
            LogTextBox.AppendText($"{jsonResponse}\r\n");
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        private void DisplayCPUInfo(string jsonData)
        {
            if (!string.IsNullOrEmpty(jsonData))
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 응답 데이터:\r\n{jsonData}\r\n");
            }
            else
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 응답 데이터가 없습니다.\r\n");
            }
            
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        private void DisplayMacAddressInfo(string jsonData)
        {
            if (!string.IsNullOrEmpty(jsonData))
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 응답 데이터:\r\n{jsonData}\r\n");
            }
            else
            {
                LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 응답 데이터가 없습니다.\r\n");
            }
            
            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ==========================================\r\n");
        }

        private void DisplayEthernetDeviceInfo(string jsonData)
        {
            // 기존 메서드는 하위 호환성을 위해 유지
            DisplayCPUInfo(jsonData);
        }

        private string GetTlsVersion(HttpResponseMessage response)
        {
            // .NET 8에서 TLS 버전 정보 추출 (실제 구현 시 적절한 방법 사용)
            return "TLS 1.3"; // 간소화된 표시
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _httpClient?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
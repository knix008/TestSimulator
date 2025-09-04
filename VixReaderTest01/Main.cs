using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using System.Net;
using VixAirTest01.APIs; // 올바른 네임스페이스로 수정

namespace VixReaderTest01
{
    public partial class Main : Form
    {
        private readonly HttpClient _httpClient;
        private readonly CpuInfoApi _cpuInfoApi;
        private readonly MacAddressApi _macAddressApi;
        private readonly SerialNumberApi _serialNumberApi;

        public Main()
        {
            InitializeComponent();
            _httpClient = CreateSecureHttpClient();
            
            // API 클래스 인스턴스 생성
            _cpuInfoApi = new CpuInfoApi(_httpClient, LogTextBox);
            _macAddressApi = new MacAddressApi(_httpClient, LogTextBox);
            _serialNumberApi = new SerialNumberApi(_httpClient, LogTextBox);
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

        // Null 허용 매개변수로 수정
        private bool ValidateServerCertificate(HttpRequestMessage requestMessage, X509Certificate2? certificate, X509Chain? chain, SslPolicyErrors sslErrors)
        {
            // 개발/테스트 환경에서는 자체 서명된 인증서 허용
            // 프로덕션 환경에서는 적절한 인증서 검증 로직 구현 필요
            
            // LogTextBox가 dispose되었는지 확인
            if (!LogTextBox.IsDisposed && !this.IsDisposed)
            {
                LogTextBox.Invoke(() => LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 서버 인증서 검증: {certificate?.Subject}\r\n"));
            }
            
            if (sslErrors == SslPolicyErrors.None)
            {
                return true;
            }

            // 자체 서명된 인증서나 신뢰할 수 없는 CA 허용 (개발용)
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

        // CPU Info 버튼 클릭 이벤트 핸들러
        private async void GetCPUInfo_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 요청 시작...\r\n");
                }
                await _cpuInfoApi.GetCpuInfoAsync();
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] CPU 정보 요청 오류: {ex.Message}\r\n");
                }
            }
        }

        // MAC Address 버튼 클릭 이벤트 핸들러
        private async void GetMacAddress_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 요청 시작...\r\n");
                }
                await _macAddressApi.GetMacAddressInfoAsync();
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MAC 주소 정보 요청 오류: {ex.Message}\r\n");
                }
            }
        }

        // Get Serial Number 버튼 클릭 이벤트 핸들러
        private async void GetSerialNumber_Click(object sender, EventArgs e)
        {
            try
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 조회 시작...\r\n");
                }
                await _serialNumberApi.GetSerialNumberAsync();
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 조회 오류: {ex.Message}\r\n");
                }
            }
        }

        // Set Serial Number 버튼 클릭 이벤트 핸들러
        private async void SetSerialNumber_Click(object sender, EventArgs e)
        {
            try
            {
                // 간단한 입력 다이얼로그 대안
                using (var form = new Form())
                {
                    form.Text = "시리얼 번호 설정";
                    form.Size = new Size(300, 150);
                    form.StartPosition = FormStartPosition.CenterParent;
                    
                    var label = new Label() { Text = "시리얼 번호:", Location = new Point(10, 10) };
                    var textBox = new TextBox() { Location = new Point(10, 35), Width = 250 };
                    var okButton = new Button() { Text = "확인", Location = new Point(10, 70), DialogResult = DialogResult.OK };
                    var cancelButton = new Button() { Text = "취소", Location = new Point(100, 70), DialogResult = DialogResult.Cancel };
                    
                    form.Controls.AddRange(new Control[] { label, textBox, okButton, cancelButton });
                    form.AcceptButton = okButton;
                    form.CancelButton = cancelButton;
                    
                    if (form.ShowDialog() == DialogResult.OK && !string.IsNullOrWhiteSpace(textBox.Text))
                    {
                        if (!LogTextBox.IsDisposed)
                        {
                            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 설정 시작...\r\n");
                        }
                        await _serialNumberApi.SetSerialNumberAsync(textBox.Text);
                    }
                    else
                    {
                        if (!LogTextBox.IsDisposed)
                        {
                            LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 설정이 취소되었습니다.\r\n");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                if (!LogTextBox.IsDisposed)
                {
                    LogTextBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] 시리얼 번호 설정 오류: {ex.Message}\r\n");
                }
            }
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

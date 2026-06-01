using System.Text.Json;
using VIXFaceTest.Utils;

namespace VIXFaceTest.APIs
{
    public class MacAddressApi
    {
        private readonly TlsClient _tlsClient;
        private readonly TextBox _logTextBox;

        public MacAddressApi(TlsClient tlsClient, TextBox logTextBox, Func<string> getIPAddress)
        {
            _tlsClient = tlsClient;
            _logTextBox = logTextBox;
        }

        public async Task<string> GetMacAddressInfoAsync()
        {
            try
            {
                Logger.LogMessage(_logTextBox, "MAC 주소 조회 시작");
                Logger.LogMessage(_logTextBox, "getMacAddress JSON 요청 전송");
                string response = await _tlsClient.SendJsonRequestAsync(new { action = "getMacAddress" });

                using var doc = JsonDocument.Parse(response);
                var root = doc.RootElement;

                if (!root.TryGetProperty("status", out var statusElement) ||
                    !string.Equals(statusElement.GetString(), "OK", StringComparison.OrdinalIgnoreCase))
                {
                    string error = root.TryGetProperty("error", out var err) ? err.GetString() ?? "FAIL" : "FAIL";
                    Logger.LogMessage(_logTextBox, $"MAC 주소 조회 실패: {error}");
                    return "FAIL";
                }

                if (!root.TryGetProperty("data", out var data))
                {
                    Logger.LogMessage(_logTextBox, "MAC 주소 응답에 data 필드가 없습니다.");
                    return "FAIL";
                }

                string mac = data.TryGetProperty("MacAddress", out var macElement)
                    ? macElement.GetString() ?? string.Empty
                    : string.Empty;

                Logger.LogMessage(_logTextBox, "=== MAC 주소 정보 ===");
                Logger.LogMessage(_logTextBox, $"MAC: {mac}");

                if (data.TryGetProperty("NetworkInterfaces", out var interfaces) &&
                    interfaces.ValueKind == JsonValueKind.Array)
                {
                    foreach (var ni in interfaces.EnumerateArray())
                    {
                        string name = ni.TryGetProperty("Name", out var n) ? n.GetString() ?? "" : "";
                        string type = ni.TryGetProperty("Type", out var t) ? t.GetString() ?? "" : "";
                        string niMac = ni.TryGetProperty("MacAddress", out var m) ? m.GetString() ?? "" : "";
                        Logger.LogMessage(_logTextBox, $"  - {name} ({type}): {niMac}");
                    }
                }

                Logger.LogMessage(_logTextBox, "==========================================");
                return string.IsNullOrWhiteSpace(mac) ? "FAIL" : mac;
            }
            catch (Exception ex)
            {
                Logger.LogMessage(_logTextBox, $"MAC 주소 요청 실패: {ex.Message}");
                return "FAIL";
            }
        }
    }
}

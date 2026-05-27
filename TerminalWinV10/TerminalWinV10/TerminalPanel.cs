using System;
using System.Drawing;
using System.Windows.Forms;

namespace TerminalWinV10
{
    public sealed class TerminalPanel : UserControl
    {
        private readonly RichTextBox _terminal;
        private readonly TerminalSession _session = new();
        private bool _isLocalSession;

        public TerminalConnectionSettings Settings { get; } = new();

        public TerminalPanel()
        {
            // 마지막 줄이 탭/테두리에 가려지는 현상을 줄이기 위한 하단 여백
            Padding = new Padding(0, 0, 0, 6);

            _terminal = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Black,
                ForeColor = Color.White,
                Font = new Font("Consolas", 10f),
                ReadOnly = true,
                HideSelection = false,
                WordWrap = false,
                BorderStyle = BorderStyle.None
            };
            _terminal.KeyDown += Terminal_KeyDown;
            _terminal.KeyPress += Terminal_KeyPress;

            _session.OutputReceived += OnSessionOutput;
            _session.StatusChanged += OnSessionStatus;

            Controls.Add(_terminal);
        }

        public bool IsConnected => _session.IsConnected;

        public void Connect(TerminalConnectionSettings settings)
        {
            var s = settings.Clone();
            CopySettings(s);
            _isLocalSession = s.ConnectionType == ConnectionTypes.Local;
            _session.Connect(s);
            _terminal.ReadOnly = false;
            _terminal.Focus();
        }

        public void Disconnect()
        {
            if (_session.IsConnected)
                _session.Disconnect();
            _isLocalSession = false;
            if (!_terminal.IsDisposed)
                _terminal.ReadOnly = true;
                _terminal.Clear(); // 터미널 화면 초기화
        }

        public void ApplySettings(TerminalConnectionSettings settings) => CopySettings(settings.Clone());

        private void CopySettings(TerminalConnectionSettings s)
        {
            Settings.ConnectionType = s.ConnectionType;
            Settings.SerialPort = s.SerialPort;
            Settings.Baud = s.Baud;
            Settings.Ip = s.Ip;
            Settings.TcpPort = s.TcpPort;
            Settings.UseSsl = s.UseSsl;
            Settings.LocalShell = s.LocalShell;
        }

        public string GetTabTitle()
        {
            if (_session.IsConnected)
            {
                return Settings.ConnectionType switch
                {
                    ConnectionTypes.Serial => $"Serial {Settings.SerialPort}",
                    ConnectionTypes.TcpIp => $"TCP {Settings.Ip}:{Settings.TcpPort}",
                    ConnectionTypes.Local => $"Local {LocalShellResolver.GetDisplayName(LocalShellResolver.Resolve(Settings.LocalShell))}",
                    _ => "Terminal"
                };
            }

            return Settings.ConnectionType switch
            {
                ConnectionTypes.Serial => "Serial",
                ConnectionTypes.TcpIp => "TCP/IP",
                ConnectionTypes.Local => "Local",
                _ => "Terminal"
            };
        }

        private void Terminal_KeyDown(object? sender, KeyEventArgs e)
        {
            if (!_session.IsConnected)
                return;

            if (e.Control && e.KeyCode == Keys.C)
                return;

            if (e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                e.Handled = true;
                _session.SendInput(_isLocalSession ? "\r\n" : Environment.NewLine);
                return;
            }

            if (e.KeyCode == Keys.Back)
            {
                e.SuppressKeyPress = true;
                e.Handled = true;
                _session.SendInput(_isLocalSession ? "\b" : "\b");
                return;
            }

            if (e.KeyCode == Keys.Tab)
            {
                e.SuppressKeyPress = true;
                e.Handled = true;
                _session.SendInput("\t");
                return;
            }

            if (e.Control && e.KeyCode == Keys.V)
            {
                var paste = Clipboard.GetText();
                if (!string.IsNullOrEmpty(paste))
                {
                    e.SuppressKeyPress = true;
                    e.Handled = true;
                    _session.SendInput(paste);
                }
                return;
            }

            if (e.KeyCode == Keys.Delete)
            {
                e.SuppressKeyPress = true;
                e.Handled = true;
                _session.SendInput("\u001b[3~");
            }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (_session.IsConnected)
            {
                var key = keyData & Keys.KeyCode;
                if (key is Keys.Up or Keys.Down or Keys.Left or Keys.Right)
                {
                    string seq = key switch
                    {
                        Keys.Up => "\u001b[A",
                        Keys.Down => "\u001b[B",
                        Keys.Right => "\u001b[C",
                        Keys.Left => "\u001b[D",
                        _ => ""
                    };
                    if (seq.Length > 0)
                    {
                        _session.SendInput(seq);
                        return true;
                    }
                }
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void Terminal_KeyPress(object? sender, KeyPressEventArgs e)
        {
            if (!_session.IsConnected || char.IsControl(e.KeyChar))
                return;

            e.Handled = true;
            _session.SendInput(e.KeyChar.ToString());
        }

        private void OnSessionOutput(string text) => AppendOutput(text);
        private void OnSessionStatus(string text) => AppendOutput(text + Environment.NewLine);

        private void AppendOutput(string text)
        {
            if (IsDisposed || !IsHandleCreated)
                return;

            if (InvokeRequired)
            {
                try
                {
                    BeginInvoke(new Action<string>(AppendOutput), text);
                }
                catch (InvalidOperationException)
                {
                    /* control disposed while marshaling */
                }
                return;
            }

            if (_terminal.IsDisposed)
                return;

            if (string.IsNullOrEmpty(text))
                return;

            // ConPTY는 프롬프트/입력 에코/진행률 등을 \r 로 같은 줄에 덮어써서 출력합니다.
            // RichTextBox는 이를 콘솔처럼 처리하지 못하므로, \r 을 "현재 줄 지우기"로 해석합니다.
            if (text.IndexOf('\r') >= 0)
            {
                ApplyCarriageReturnOutput(text);
                return;
            }

            text = TerminalTextNormalizer.Normalize(text);
            if (!string.IsNullOrEmpty(text))
                _terminal.AppendText(text);

            _terminal.SelectionStart = _terminal.TextLength;
            _terminal.SelectionLength = 0;
            _terminal.ScrollToCaret();
        }

        private void ApplyCarriageReturnOutput(string raw)
        {
            // UI thread only
            for (int i = 0; i < raw.Length; i++)
            {
                var ch = raw[i];
                if (ch == '\r')
                {
                    ClearCurrentLine();
                    continue;
                }

                // Normalize handles ANSI/backspace/tab; keep \n
                var normalized = TerminalTextNormalizer.Normalize(ch.ToString());
                if (normalized.Length > 0)
                    _terminal.AppendText(normalized);
            }
        }

        private void ClearCurrentLine()
        {
            // Remove text from last '\n' to end (simulate carriage return overwrite).
            var t = _terminal.Text;
            int lastNl = t.LastIndexOf('\n');
            int start = lastNl >= 0 ? lastNl + 1 : 0;
            if (start < t.Length)
                _terminal.Select(start, t.Length - start);
            else
                _terminal.Select(t.Length, 0);
            _terminal.SelectedText = string.Empty;
            _terminal.SelectionStart = _terminal.TextLength;
            _terminal.SelectionLength = 0;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _session.OutputReceived -= OnSessionOutput;
                _session.StatusChanged -= OnSessionStatus;
                Disconnect();
                _session.Dispose();
                _terminal.KeyDown -= Terminal_KeyDown;
                _terminal.KeyPress -= Terminal_KeyPress;
                _terminal.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}

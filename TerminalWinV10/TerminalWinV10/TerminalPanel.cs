using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace TerminalWinV10
{
    public sealed class TerminalPanel : UserControl
    {
        private readonly RichTextBox _terminal;
        private readonly TerminalSession _session = new();
        private readonly System.Collections.Generic.List<string> _lines = new();
        private readonly StringBuilder _currentLine = new();
        private string _renderedText = string.Empty;
        private bool _isLocalSession;
        private string _pendingEscapeSequence = string.Empty;
        private int _cursorColumn;

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
                BorderStyle = BorderStyle.None,
                ShortcutsEnabled = false,
                DetectUrls = false,
                ImeMode = ImeMode.Disable
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
            _terminal.ReadOnly = true;
            _terminal.Focus();
        }

        public void Disconnect()
        {
            if (_session.IsConnected)
                _session.Disconnect();
            _isLocalSession = false;
            if (!_terminal.IsDisposed)
            {
                _terminal.ReadOnly = true;
                _terminal.Clear(); // 터미널 화면 초기화
            }
            _lines.Clear();
            _currentLine.Clear();
            _renderedText = string.Empty;
            _cursorColumn = 0;
            _pendingEscapeSequence = string.Empty;
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
            {
                e.SuppressKeyPress = true;
                e.Handled = true;
                _session.SendInput("\u0003");
                return;
            }

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
            AppendTerminalText(text);
            RenderTerminal();
        }

        private void AppendTerminalText(string raw)
        {
            var text = (_pendingEscapeSequence + raw).Replace("\r\n", "\n");
            _pendingEscapeSequence = string.Empty;
            var plain = new StringBuilder(text.Length);

            void FlushPlain()
            {
                if (plain.Length == 0)
                    return;

                AppendPlainText(plain.ToString());
                plain.Clear();
            }

            for (int i = 0; i < text.Length; i++)
            {
                if (text[i] == '\u001b')
                {
                    FlushPlain();
                    if (!TryConsumeEscapeSequence(text, ref i))
                        _pendingEscapeSequence = text.Substring(i);
                    if (_pendingEscapeSequence.Length > 0)
                        break;
                    continue;
                }

                plain.Append(text[i]);
            }

            FlushPlain();
        }

        private bool TryConsumeEscapeSequence(string text, ref int index)
        {
            if (index + 1 >= text.Length)
                return false;

            var next = text[index + 1];
            if (next == '[')
            {
                for (int end = index + 2; end < text.Length; end++)
                {
                    var final = text[end];
                    if (final >= '@' && final <= '~')
                    {
                        HandleCsiSequence(text.Substring(index, end - index + 1));
                        index = end;
                        return true;
                    }
                }
                return false;
            }

            if (next == ']')
            {
                for (int end = index + 2; end < text.Length; end++)
                {
                    if (text[end] == '\a')
                    {
                        index = end;
                        return true;
                    }
                    if (text[end] == '\u001b' && end + 1 < text.Length && text[end + 1] == '\\')
                    {
                        index = end + 1;
                        return true;
                    }
                }
                return false;
            }

            index++;
            return true;
        }

        private void HandleCsiSequence(string sequence)
        {
            var final = sequence[sequence.Length - 1];
            if (final == 'J' && (sequence.Contains("2") || sequence.Contains("3")))
            {
                ClearBuffer();
                return;
            }

            if (final == 'K')
            {
                ClearCurrentLine();
                return;
            }

            var parameter = GetFirstCsiParameter(sequence, defaultValue: 1);
            if (final == 'G')
            {
                _cursorColumn = Math.Max(0, parameter - 1);
                return;
            }

            if (final == 'C')
            {
                _cursorColumn += Math.Max(1, parameter);
                return;
            }

            if (final == 'D')
            {
                _cursorColumn = Math.Max(0, _cursorColumn - Math.Max(1, parameter));
                return;
            }

            if (final == 'H' || final == 'f')
            {
                var (row, column) = GetCursorPosition(sequence);
                if (row <= 1 && column <= 1)
                {
                    _cursorColumn = 0;
                    return;
                }

                _cursorColumn = Math.Max(0, column - 1);
            }
        }

        private static (int Row, int Column) GetCursorPosition(string sequence)
        {
            var start = sequence.IndexOf('[');
            if (start < 0 || start + 1 >= sequence.Length)
                return (1, 1);

            var parameterText = sequence.Substring(start + 1, sequence.Length - start - 2);
            if (string.IsNullOrEmpty(parameterText))
                return (1, 1);

            var parts = parameterText.Split(';');
            var row = parts.Length > 0 && int.TryParse(parts[0], out var parsedRow) ? parsedRow : 1;
            var column = parts.Length > 1 && int.TryParse(parts[1], out var parsedColumn) ? parsedColumn : 1;
            return (row, column);
        }

        private static int GetFirstCsiParameter(string sequence, int defaultValue)
        {
            var start = sequence.IndexOf('[');
            if (start < 0 || start + 1 >= sequence.Length)
                return defaultValue;

            var end = sequence.Length - 1;
            var parameterText = sequence.Substring(start + 1, end - start - 1);
            if (parameterText.Length == 0)
                return defaultValue;

            var semicolon = parameterText.IndexOf(';');
            if (semicolon >= 0)
                parameterText = parameterText.Substring(0, semicolon);

            parameterText = parameterText.TrimStart('?');
            return int.TryParse(parameterText, out var value) ? value : defaultValue;
        }

        private void AppendPlainText(string text)
        {
            for (int i = 0; i < text.Length; i++)
            {
                var ch = text[i];
                if (ch == '\a' || ch == '\0')
                    continue;

                if (ch == '\r')
                {
                    _cursorColumn = 0;
                    continue;
                }

                if (ch == '\b')
                {
                    RemovePreviousCharacter();
                    continue;
                }

                if (ch == '\t')
                {
                    PutCharacter(' ');
                    PutCharacter(' ');
                    PutCharacter(' ');
                    PutCharacter(' ');
                    continue;
                }

                PutCharacter(ch);
            }
        }

        private void RemovePreviousCharacter()
        {
            if (_cursorColumn == 0)
                return;

            _cursorColumn--;
            if (_cursorColumn < _currentLine.Length)
                _currentLine.Remove(_cursorColumn, 1);
        }

        private void ClearCurrentLine()
        {
            if (_cursorColumn < _currentLine.Length)
                _currentLine.Remove(_cursorColumn, _currentLine.Length - _cursorColumn);
        }

        private void PutCharacter(char ch)
        {
            if (ch == '\n')
            {
                _lines.Add(_currentLine.ToString());
                _currentLine.Clear();
                _cursorColumn = 0;
                return;
            }

            while (_currentLine.Length < _cursorColumn)
                _currentLine.Append(' ');

            if (_cursorColumn < _currentLine.Length)
                _currentLine[_cursorColumn] = ch;
            else
                _currentLine.Append(ch);

            _cursorColumn++;
        }

        private void ClearBuffer()
        {
            _lines.Clear();
            _currentLine.Clear();
            _renderedText = string.Empty;
            _cursorColumn = 0;
            if (!_terminal.IsDisposed)
                _terminal.Clear();
        }

        private void RenderTerminal()
        {
            var sb = new StringBuilder();
            for (int i = 0; i < _lines.Count; i++)
            {
                sb.Append(_lines[i]);
                sb.Append('\n');
            }
            sb.Append(_currentLine);

            var rendered = sb.ToString();
            if (_renderedText != rendered)
                UpdateRenderedText(rendered);

            _terminal.SelectionStart = _terminal.TextLength;
            _terminal.SelectionLength = 0;
            _terminal.ScrollToCaret();
        }

        private void UpdateRenderedText(string rendered)
        {
            var prefixLength = GetCommonPrefixLength(_renderedText, rendered);
            var oldSuffixLength = _renderedText.Length - prefixLength;
            var newSuffix = rendered.Substring(prefixLength);

            SuspendRedraw();
            try
            {
                _terminal.Select(prefixLength, oldSuffixLength);
                _terminal.SelectedText = newSuffix;
                _renderedText = rendered;
            }
            finally
            {
                ResumeRedraw();
            }
        }

        private static int GetCommonPrefixLength(string a, string b)
        {
            var length = Math.Min(a.Length, b.Length);
            var i = 0;
            while (i < length && a[i] == b[i])
                i++;
            return i;
        }

        private void SuspendRedraw()
        {
            if (_terminal.IsHandleCreated)
                SendMessage(_terminal.Handle, WmSetRedraw, IntPtr.Zero, IntPtr.Zero);
        }

        private void ResumeRedraw()
        {
            if (!_terminal.IsHandleCreated)
                return;

            SendMessage(_terminal.Handle, WmSetRedraw, new IntPtr(1), IntPtr.Zero);
            _terminal.Invalidate();
        }

        private const int WmSetRedraw = 0x000B;

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

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

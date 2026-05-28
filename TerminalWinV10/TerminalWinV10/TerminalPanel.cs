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
        private readonly System.Collections.Generic.List<StringBuilder> _screenLines = new();
        private readonly StringBuilder _queuedOutput = new();
        private readonly Timer _renderTimer;
        private string _renderedText = string.Empty;
        private bool _isLocalSession;
        private string _pendingEscapeSequence = string.Empty;
        private bool _pendingCarriageReturn;
        private bool _clearLineBeforeNextPrintable;
        private int _cursorRow;
        private int _cursorColumn;
        private int _lastRenderedCaretIndex = -1;
        private int _lastRenderedCursorRow = -1;
        private bool _wrapPending;
        private int _terminalColumns = 80;
        private int _terminalRows = 24;

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
            _terminal.SizeChanged += Terminal_SizeChanged;

            _renderTimer = new Timer { Interval = 16 };
            _renderTimer.Tick += RenderTimer_Tick;

            _session.OutputReceived += OnSessionOutput;
            _session.StatusChanged += OnSessionStatus;

            Controls.Add(_terminal);
            UpdateTerminalSize(notifySession: false);
        }

        public bool IsConnected => _session.IsConnected;

        public void Connect(TerminalConnectionSettings settings)
        {
            var s = settings.Clone();
            CopySettings(s);
            _isLocalSession = s.ConnectionType == ConnectionTypes.Local;
            UpdateTerminalSize(notifySession: false);
            _session.ResizeTerminal(_terminalColumns, _terminalRows);
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
            _screenLines.Clear();
            _queuedOutput.Clear();
            _renderTimer.Stop();
            _renderedText = string.Empty;
            _cursorRow = 0;
            _cursorColumn = 0;
            _lastRenderedCaretIndex = -1;
            _lastRenderedCursorRow = -1;
            _wrapPending = false;
            _pendingEscapeSequence = string.Empty;
            _pendingCarriageReturn = false;
            _clearLineBeforeNextPrintable = false;
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
                _session.SendInput(_isLocalSession ? "\r" : Environment.NewLine);
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

        private void Terminal_SizeChanged(object? sender, EventArgs e) => UpdateTerminalSize(notifySession: true);

        private void UpdateTerminalSize(bool notifySession)
        {
            if (_terminal.ClientSize.Width <= 0 || _terminal.ClientSize.Height <= 0)
                return;

            var flags = TextFormatFlags.NoPadding | TextFormatFlags.NoClipping;
            var charSize = TextRenderer.MeasureText("W", _terminal.Font, Size.Empty, flags);
            var charWidth = Math.Max(1, charSize.Width);
            var charHeight = Math.Max(1, _terminal.Font.Height);
            var columns = Math.Max(1, _terminal.ClientSize.Width / charWidth);
            var rows = Math.Max(1, _terminal.ClientSize.Height / charHeight);

            if (columns == _terminalColumns && rows == _terminalRows)
                return;

            _terminalColumns = columns;
            _terminalRows = rows;

            if (_isLocalSession)
                NormalizeCursorRow();

            if (notifySession)
                _session.ResizeTerminal(_terminalColumns, _terminalRows);
        }

        private void OnSessionOutput(string text) => QueueOutput(text);
        private void OnSessionStatus(string text) => QueueOutput(text + Environment.NewLine);

        private void QueueOutput(string text)
        {
            if (IsDisposed || !IsHandleCreated)
                return;

            if (InvokeRequired)
            {
                try
                {
                    BeginInvoke(new Action<string>(QueueOutput), text);
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

            _queuedOutput.Append(text);
            if (!_renderTimer.Enabled)
                _renderTimer.Start();
        }

        private void RenderTimer_Tick(object? sender, EventArgs e)
        {
            _renderTimer.Stop();
            if (_queuedOutput.Length == 0 || _terminal.IsDisposed)
                return;

            var text = _queuedOutput.ToString();
            _queuedOutput.Clear();

            // ConPTY는 프롬프트/입력 에코/진행률 등을 \r 로 같은 줄에 덮어써서 출력합니다.
            // RichTextBox는 이를 콘솔처럼 처리하지 못하므로, \r 을 "현재 줄 지우기"로 해석합니다.
            AppendTerminalText(text);
            RenderTerminal();

            if (_queuedOutput.Length > 0)
                _renderTimer.Start();
        }

        private void AppendTerminalText(string raw)
        {
            var text = _pendingEscapeSequence + raw;
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
                    PreparePendingCarriageReturnForEscape();
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
            if (final == 'J')
            {
                ClearScreen(parameter: GetFirstCsiParameter(sequence, defaultValue: 0));
                return;
            }

            if (final == 'K')
            {
                ClearLine(parameter: GetFirstCsiParameter(sequence, defaultValue: 0));
                return;
            }

            var parameter = GetFirstCsiParameter(sequence, defaultValue: 1);
            if (final == 'X')
            {
                EraseCharacters(Math.Max(1, parameter));
                return;
            }

            if (final == 'A')
            {
                _cursorRow = Math.Max(0, _cursorRow - Math.Max(1, parameter));
                _wrapPending = false;
                return;
            }

            if (final == 'B')
            {
                _cursorRow += Math.Max(1, parameter);
                NormalizeCursorRow();
                _wrapPending = false;
                return;
            }

            if (final == 'E')
            {
                _cursorRow += Math.Max(1, parameter);
                _cursorColumn = 0;
                NormalizeCursorRow();
                _wrapPending = false;
                return;
            }

            if (final == 'F')
            {
                _cursorRow = Math.Max(0, _cursorRow - Math.Max(1, parameter));
                _cursorColumn = 0;
                _wrapPending = false;
                return;
            }

            if (final == 'd')
            {
                _cursorRow = Math.Max(0, parameter - 1);
                NormalizeCursorRow();
                _wrapPending = false;
                return;
            }

            if (final == 'S')
            {
                ScrollUp(Math.Max(1, parameter));
                _wrapPending = false;
                return;
            }

            if (final == 'T')
            {
                ScrollDown(Math.Max(1, parameter));
                _wrapPending = false;
                return;
            }

            if (final == 'G')
            {
                _cursorColumn = Math.Max(0, parameter - 1);
                _wrapPending = false;
                return;
            }

            if (final == 'C')
            {
                _cursorColumn += Math.Max(1, parameter);
                _wrapPending = false;
                return;
            }

            if (final == 'D')
            {
                _cursorColumn = Math.Max(0, _cursorColumn - Math.Max(1, parameter));
                _wrapPending = false;
                return;
            }

            if (final == 'H' || final == 'f')
            {
                var (row, column) = GetCursorPosition(sequence);
                _cursorRow = Math.Max(0, row - 1);
                _cursorColumn = Math.Max(0, column - 1);
                NormalizeCursorRow();
                _wrapPending = false;
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

                if (_pendingCarriageReturn)
                {
                    _pendingCarriageReturn = false;
                    if (ch == '\n')
                    {
                        PutCharacter('\n');
                        continue;
                    }

                    ClearLine(parameter: 2);
                    _cursorColumn = 0;
                }

                if (ch == '\a' || ch == '\0')
                    continue;

                if (ch == '\r')
                {
                    _wrapPending = false;
                    _pendingCarriageReturn = true;
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

        private void PreparePendingCarriageReturnForEscape()
        {
            if (!_pendingCarriageReturn)
                return;

            _pendingCarriageReturn = false;
            _cursorColumn = 0;
            _wrapPending = false;
            _clearLineBeforeNextPrintable = true;
        }

        private void RemovePreviousCharacter()
        {
            if (_cursorColumn == 0)
                return;

            _wrapPending = false;
            _cursorColumn--;
            var line = GetCurrentLine();
            if (_cursorColumn < line.Length)
                line.Remove(_cursorColumn, 1);
        }

        private void ClearLine(int parameter)
        {
            var line = GetCurrentLine();
            switch (parameter)
            {
                case 1:
                    var end = Math.Min(_cursorColumn, line.Length - 1);
                    for (int i = 0; i <= end; i++)
                        line[i] = ' ';
                    break;
                case 2:
                    line.Clear();
                    break;
                default:
                    if (_cursorColumn < line.Length)
                        line.Remove(_cursorColumn, line.Length - _cursorColumn);
                    break;
            }
            _wrapPending = false;
            _clearLineBeforeNextPrintable = false;
        }

        private void ClearScreen(int parameter)
        {
            switch (parameter)
            {
                case 1:
                    ClearLinesBeforeCursor();
                    ClearLine(parameter: 1);
                    break;
                case 2:
                case 3:
                    ClearDisplayPreservingCursor();
                    break;
                default:
                    ClearLine(parameter: 0);
                    ClearLinesAfterCursor();
                    break;
            }
            _wrapPending = false;
        }

        private void ClearLinesBeforeCursor()
        {
            var end = Math.Min(_cursorRow, _screenLines.Count);
            for (int i = 0; i < end; i++)
                _screenLines[i].Clear();
        }

        private void ClearLinesAfterCursor()
        {
            for (int i = _cursorRow + 1; i < _screenLines.Count; i++)
                _screenLines[i].Clear();
        }

        private void ClearDisplayPreservingCursor()
        {
            _screenLines.Clear();
            _wrapPending = false;
            EnsureLine(_cursorRow);
        }

        private void EraseCharacters(int count)
        {
            var line = GetCurrentLine();
            var end = Math.Min(line.Length, _cursorColumn + count);
            for (int i = _cursorColumn; i < end; i++)
                line[i] = ' ';
            _wrapPending = false;
        }

        private void PutCharacter(char ch)
        {
            if (ch == '\n')
            {
                _cursorRow++;
                _cursorColumn = 0;
                _wrapPending = false;
                _clearLineBeforeNextPrintable = false;
                NormalizeCursorRow();
                return;
            }

            if (_clearLineBeforeNextPrintable)
            {
                ClearLine(parameter: 2);
                _cursorColumn = 0;
            }

            if (_wrapPending)
            {
                _cursorRow++;
                _cursorColumn = 0;
                _wrapPending = false;
                NormalizeCursorRow();
            }

            var line = GetCurrentLine();
            while (line.Length < _cursorColumn)
                line.Append(' ');

            if (_cursorColumn < line.Length)
                line[_cursorColumn] = ch;
            else
                line.Append(ch);

            _cursorColumn++;
            if (_cursorColumn >= _terminalColumns)
                _wrapPending = true;
        }

        private StringBuilder GetCurrentLine()
        {
            EnsureLine(_cursorRow);
            return _screenLines[_cursorRow];
        }

        private void EnsureLine(int row)
        {
            while (_screenLines.Count <= row)
                _screenLines.Add(new StringBuilder());
        }

        private void NormalizeCursorRow()
        {
            if (_isLocalSession)
            {
                while (_cursorRow >= _terminalRows)
                {
                    ScrollUp(1);
                    _cursorRow--;
                }
            }

            EnsureLine(_cursorRow);
        }

        private void ScrollUp(int count)
        {
            for (int i = 0; i < count; i++)
            {
                if (_screenLines.Count > 0)
                    _screenLines.RemoveAt(0);
                _screenLines.Add(new StringBuilder());
            }
        }

        private void ScrollDown(int count)
        {
            for (int i = 0; i < count; i++)
            {
                _screenLines.Insert(0, new StringBuilder());
                if (_isLocalSession && _screenLines.Count > _terminalRows)
                    _screenLines.RemoveAt(_screenLines.Count - 1);
            }
        }

        private void ClearBuffer()
        {
            _screenLines.Clear();
            _cursorRow = 0;
            _cursorColumn = 0;
            _lastRenderedCaretIndex = -1;
            _lastRenderedCursorRow = -1;
            _wrapPending = false;
            _pendingCarriageReturn = false;
            _clearLineBeforeNextPrintable = false;
        }

        private void RenderTerminal()
        {
            var sb = new StringBuilder();
            for (int i = 0; i < _screenLines.Count; i++)
            {
                sb.Append(_screenLines[i].ToString().TrimEnd());
                if (i < _screenLines.Count - 1)
                    sb.Append('\n');
            }

            var rendered = sb.ToString();
            var textChanged = _renderedText != rendered;
            var caretIndex = Math.Min(GetCursorTextIndex(), rendered.Length);
            var cursorRowChanged = _lastRenderedCursorRow != _cursorRow;
            var caretChanged = _lastRenderedCaretIndex != caretIndex || _terminal.SelectionLength != 0;

            if (!textChanged && !caretChanged)
                return;

            SuspendRedraw();
            try
            {
                if (textChanged)
                    UpdateRenderedText(rendered);

                caretIndex = Math.Min(caretIndex, _terminal.TextLength);
                var shouldMoveCaret = cursorRowChanged || IsTextIndexOutsideVisibleText(caretIndex);
                if (shouldMoveCaret && (_terminal.SelectionStart != caretIndex || _terminal.SelectionLength != 0))
                {
                    _terminal.SelectionStart = caretIndex;
                    _terminal.SelectionLength = 0;
                    _terminal.ScrollToCaret();
                }
                _lastRenderedCaretIndex = caretIndex;
                _lastRenderedCursorRow = _cursorRow;
            }
            finally
            {
                ResumeRedraw();
            }
        }

        private int GetCursorTextIndex()
        {
            if (_screenLines.Count == 0)
                return 0;

            var row = Math.Min(_cursorRow, _screenLines.Count - 1);
            var index = 0;
            for (int i = 0; i < row; i++)
                index += _screenLines[i].ToString().TrimEnd().Length + 1;

            var currentLineLength = _screenLines[row].ToString().TrimEnd().Length;
            return index + Math.Min(_cursorColumn, currentLineLength);
        }

        private bool IsTextIndexOutsideVisibleText(int index)
        {
            if (_terminal.TextLength == 0)
                return false;

            var firstVisibleChar = _terminal.GetCharIndexFromPosition(new Point(0, 0));
            var lastVisibleChar = _terminal.GetCharIndexFromPosition(new Point(
                Math.Max(0, _terminal.ClientSize.Width - 1),
                Math.Max(0, _terminal.ClientSize.Height - 1)));

            return index < firstVisibleChar || index > lastVisibleChar;
        }

        private void UpdateRenderedText(string rendered)
        {
            var prefixLength = GetCommonPrefixLength(_renderedText, rendered);
            var oldSuffixLength = _renderedText.Length - prefixLength;
            var newSuffix = rendered.Substring(prefixLength);

            _terminal.Select(prefixLength, oldSuffixLength);
            _terminal.SelectedText = newSuffix;
            _renderedText = rendered;
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
                _renderTimer.Tick -= RenderTimer_Tick;
                _renderTimer.Dispose();
                _terminal.SizeChanged -= Terminal_SizeChanged;
                _terminal.KeyDown -= Terminal_KeyDown;
                _terminal.KeyPress -= Terminal_KeyPress;
                _terminal.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}

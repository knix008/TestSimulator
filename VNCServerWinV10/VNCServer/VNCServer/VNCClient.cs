using System.Diagnostics;
using System.Net;
using System.Drawing;
using System.Drawing.Imaging;
using System.Net.Sockets;
using System.Text;
using VNCServer.Settings;

namespace VNCServer.VNCServer;

public class VNCClient
{
    private TcpClient _tcpClient;
    private NetworkStream _stream;
    private ServerSettings _settings;
    private readonly AdaptiveFrameRateController _frameRateController;
    private Thread? _clientThread;
    private bool _isConnected;
    private Rectangle _screenBounds;
    private byte[]? _sendBuffer;       // reused across frames to avoid per-frame GC
    private byte[]? _prevBuffer;       // previous frame for GDI dirty detection
    private DxgiCapture? _dxgi;        // null when DXGI is unavailable → falls back to GDI

    public event EventHandler<string>? Disconnected;
    public event EventHandler<int>? FrameRateChanged;

    public string ClientAddress { get; }
    public int CurrentFrameRate => _frameRateController.CurrentFps;

    public VNCClient(TcpClient tcpClient, ServerSettings settings)
    {
        _tcpClient = tcpClient;
        ClientAddress = ((IPEndPoint)tcpClient.Client.RemoteEndPoint!).Address.ToString();
        _stream = tcpClient.GetStream();
        _settings = settings;
        _frameRateController = new AdaptiveFrameRateController(settings);
        _screenBounds = ScreenCapture.GetScreenBounds();
        ScreenCapture.SetImageQuality(settings.ImageQuality);

        // Try DXGI Desktop Duplication for faster capture; fall back to GDI on failure
        var dxgi = new DxgiCapture();
        if (dxgi.TryInitialize())
            _dxgi = dxgi;
        else
            dxgi.Dispose();
    }

    public void UpdateSettings(ServerSettings settings)
    {
        _settings = settings;
        _frameRateController.ApplySettings(settings);
        ScreenCapture.SetImageQuality(settings.ImageQuality);
    }

    public void Start()
    {
        _isConnected = true;
        _clientThread = new Thread(HandleClient)
        {
            IsBackground = true
        };
        _clientThread.Start();
    }

    public void Disconnect()
    {
        _isConnected = false;
        try
        {
            _stream?.Close();
            _tcpClient?.Close();
        }
        catch { }

        _dxgi?.Dispose();
        _dxgi = null;
    }

    private void HandleClient()
    {
        try
        {
            SendProtocolVersion();

            if (!Authenticate())
            {
                Disconnect();
                return;
            }

            SendServerInit();

            while (_isConnected && IsSocketAlive())
            {
                if (_stream.DataAvailable)
                {
                    int messageType = _stream.ReadByte();
                    if (messageType == -1) break; // graceful close

                    HandleClientMessage((byte)messageType);
                }
                else
                {
                    Thread.Sleep(1);
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Client error: {ex.Message}");
        }
        finally
        {
            Disconnect();
            Disconnected?.Invoke(this, ClientAddress);
        }
    }

    private bool IsSocketAlive()
    {
        try
        {
            var socket = _tcpClient.Client;
            // Poll returns true if readable; Available == 0 on a readable closed socket means EOF/reset
            return !(socket.Poll(0, SelectMode.SelectRead) && socket.Available == 0);
        }
        catch
        {
            return false;
        }
    }

    private void SendProtocolVersion()
    {
        string version = "RFB 003.008\n";
        byte[] versionBytes = Encoding.ASCII.GetBytes(version);
        _stream.Write(versionBytes, 0, versionBytes.Length);
    }

    private bool Authenticate()
    {
        // Read client version
        byte[] clientVersion = new byte[12];
        _stream.Read(clientVersion, 0, 12);

        if (_settings.RequirePassword && !string.IsNullOrEmpty(_settings.Password))
        {
            // VNC Authentication (security type 2)
            _stream.WriteByte(1); // Number of security types
            _stream.WriteByte(2); // VNC Authentication

            // Read client's chosen security type
            int securityType = _stream.ReadByte();

            if (securityType == 2)
            {
                // Send challenge (simplified - in production use proper DES encryption)
                byte[] challenge = new byte[16];
                new Random().NextBytes(challenge);
                _stream.Write(challenge, 0, challenge.Length);

                // Read response
                byte[] response = new byte[16];
                _stream.Read(response, 0, 16);

                // For simplicity, accept any response (in production, validate properly)
                // Security result: 0 = OK
                byte[] result = new byte[4] { 0, 0, 0, 0 };
                _stream.Write(result, 0, 4);

                return true;
            }
        }
        else
        {
            // No authentication
            _stream.WriteByte(1); // Number of security types
            _stream.WriteByte(1); // No authentication

            // Read client's chosen security type
            _stream.ReadByte();

            // Security result: 0 = OK
            byte[] result = new byte[4] { 0, 0, 0, 0 };
            _stream.Write(result, 0, 4);

            return true;
        }

        return false;
    }

    private void SendServerInit()
    {
        // Read ClientInit
        _stream.ReadByte();

        // Framebuffer width (2 bytes)
        _stream.WriteByte((byte)((_screenBounds.Width >> 8) & 0xFF));
        _stream.WriteByte((byte)(_screenBounds.Width & 0xFF));

        // Framebuffer height (2 bytes)
        _stream.WriteByte((byte)((_screenBounds.Height >> 8) & 0xFF));
        _stream.WriteByte((byte)(_screenBounds.Height & 0xFF));

        // Pixel format (16 bytes)
        _stream.WriteByte(32); // bits-per-pixel
        _stream.WriteByte(24); // depth
        _stream.WriteByte(0);  // big-endian flag
        _stream.WriteByte(1);  // true-color flag
        _stream.WriteByte(0); _stream.WriteByte(255); // red-max
        _stream.WriteByte(0); _stream.WriteByte(255); // green-max
        _stream.WriteByte(0); _stream.WriteByte(255); // blue-max
        _stream.WriteByte(16); // red-shift
        _stream.WriteByte(8);  // green-shift
        _stream.WriteByte(0);  // blue-shift
        _stream.WriteByte(0); _stream.WriteByte(0); _stream.WriteByte(0); // padding

        // Desktop name
        byte[] nameBytes = Encoding.ASCII.GetBytes("VNC Server");
        byte[] nameLength = BitConverter.GetBytes(nameBytes.Length);
        if (BitConverter.IsLittleEndian)
            Array.Reverse(nameLength);
        _stream.Write(nameLength, 0, 4);
        _stream.Write(nameBytes, 0, nameBytes.Length);
    }

    private void HandleClientMessage(byte messageType)
    {
        switch (messageType)
        {
            case 0: // SetPixelFormat
                byte[] pixelFormat = new byte[19];
                _stream.Read(pixelFormat, 0, 19);
                break;

            case 2: // SetEncodings
                _stream.ReadByte(); // padding
                byte[] numEncodings = new byte[2];
                _stream.Read(numEncodings, 0, 2);
                int count = (numEncodings[0] << 8) | numEncodings[1];
                byte[] encodings = new byte[count * 4];
                _stream.Read(encodings, 0, encodings.Length);
                break;

            case 3: // FramebufferUpdateRequest
                HandleFramebufferUpdateRequest();
                break;

            case 4: // KeyEvent
                HandleKeyEvent();
                break;

            case 5: // PointerEvent
                HandlePointerEvent();
                break;

            case 6: // ClientCutText
                HandleClientCutText();
                break;
        }
    }

    private void HandleFramebufferUpdateRequest()
    {
        byte[] request = new byte[9];
        _stream.Read(request, 0, 9);

        // request[0]: incremental flag — 0=full update required, 1=skip if unchanged
        bool incremental = request[0] != 0;

        _frameRateController.WaitForNextFrameSlot();
        SendFramebufferUpdate(incremental);
    }

    private void SendFramebufferUpdate(bool incremental = true)
    {
        var stopwatch = Stopwatch.StartNew();

        // GDI 캡처
        using Bitmap screenshot = ScreenCapture.CaptureScreen(_screenBounds);
        int width  = screenshot.Width;
        int height = screenshot.Height;
        int pixelDataSize = width * height * 4;

        if (_sendBuffer == null || _sendBuffer.Length < pixelDataSize)
            _sendBuffer = new byte[pixelDataSize];
        if (_prevBuffer == null || _prevBuffer.Length < pixelDataSize)
            _prevBuffer = new byte[pixelDataSize];

        BitmapData bmpData = screenshot.LockBits(
            new Rectangle(0, 0, width, height),
            ImageLockMode.ReadOnly,
            PixelFormat.Format32bppArgb);
        try
        {
            int stride = bmpData.Stride;
            if (stride == width * 4)
            {
                System.Runtime.InteropServices.Marshal.Copy(
                    bmpData.Scan0, _sendBuffer, 0, pixelDataSize);
            }
            else
            {
                for (int row = 0; row < height; row++)
                    System.Runtime.InteropServices.Marshal.Copy(
                        bmpData.Scan0 + row * stride, _sendBuffer, row * width * 4, width * 4);
            }
        }
        finally
        {
            screenshot.UnlockBits(bmpData);
        }

        bool changed = !incremental || HasFrameChanged(_sendBuffer, _prevBuffer, pixelDataSize);

        if (changed)
        {
            Buffer.BlockCopy(_sendBuffer, 0, _prevBuffer, 0, pixelDataSize);

            // 전체 프레임 전송
            _stream.WriteByte(0); // FramebufferUpdate
            _stream.WriteByte(0); // padding
            _stream.WriteByte(0); // num rects high
            _stream.WriteByte(1); // num rects low (1 rectangle)
            WriteUInt16(0); WriteUInt16(0);
            WriteUInt16((ushort)width);
            WriteUInt16((ushort)height);
            WriteInt32(0); // Raw encoding
            _stream.Write(_sendBuffer, 0, pixelDataSize);
        }
        else
        {
            // 변화 없음 — 클라이언트 교착 방지를 위해 0-rect 응답 전송
            _stream.WriteByte(0); // FramebufferUpdate
            _stream.WriteByte(0); // padding
            _stream.WriteByte(0); // num rects high = 0
            _stream.WriteByte(0); // num rects low  = 0
        }

        _stream.Flush();

        stopwatch.Stop();
        var previousFps = _frameRateController.CurrentFps;
        _frameRateController.RecordFrame(stopwatch.ElapsedMilliseconds, changed ? pixelDataSize : 0);

        if (_frameRateController.CurrentFps != previousFps)
            FrameRateChanged?.Invoke(this, _frameRateController.CurrentFps);
    }

    private static bool HasFrameChanged(byte[] current, byte[] previous, int length)
    {
        // Compare as 64-bit chunks for speed (8x fewer comparisons than byte-by-byte)
        int longCount = length / 8;
        var currentSpan  = System.Runtime.InteropServices.MemoryMarshal.Cast<byte, long>(
            current.AsSpan(0, longCount * 8));
        var previousSpan = System.Runtime.InteropServices.MemoryMarshal.Cast<byte, long>(
            previous.AsSpan(0, longCount * 8));

        for (int i = 0; i < currentSpan.Length; i++)
        {
            if (currentSpan[i] != previousSpan[i])
                return true;
        }
        return false;
    }

    private void HandleKeyEvent()
    {
        byte[] keyEvent = new byte[7];
        _stream.Read(keyEvent, 0, 7);

        if (!_settings.AllowKeyboardControl) return;

        bool down = keyEvent[0] != 0;
        uint keysym = (uint)((keyEvent[3] << 24) | (keyEvent[4] << 16) | 
                            (keyEvent[5] << 8) | keyEvent[6]);

        // Map VNC keysym to Windows virtual key code (simplified)
        byte vkCode = MapKeysymToVirtualKey(keysym);
        if (vkCode != 0)
        {
            InputSimulator.SendKey(vkCode, !down);
        }
    }

    private void HandlePointerEvent()
    {
        byte[] pointerEvent = new byte[5];
        _stream.Read(pointerEvent, 0, 5);

        if (!_settings.AllowMouseControl) return;

        byte buttonMask = pointerEvent[0];
        int x = (pointerEvent[1] << 8) | pointerEvent[2];
        int y = (pointerEvent[3] << 8) | pointerEvent[4];

        InputSimulator.MoveMouse(x, y);

        if ((buttonMask & 0x01) != 0)
            InputSimulator.MouseLeftDown();
        else
            InputSimulator.MouseLeftUp();

        if ((buttonMask & 0x02) != 0)
            InputSimulator.MouseMiddleClick();

        if ((buttonMask & 0x04) != 0)
            InputSimulator.MouseRightDown();
        else
            InputSimulator.MouseRightUp();

        if ((buttonMask & 0x08) != 0)
            InputSimulator.MouseWheel(120);
        else if ((buttonMask & 0x10) != 0)
            InputSimulator.MouseWheel(-120);
    }

    private void HandleClientCutText()
    {
        byte[] padding = new byte[3];
        _stream.Read(padding, 0, 3);

        byte[] lengthBytes = new byte[4];
        _stream.Read(lengthBytes, 0, 4);
        int length = (lengthBytes[0] << 24) | (lengthBytes[1] << 16) | 
                     (lengthBytes[2] << 8) | lengthBytes[3];

        byte[] text = new byte[length];
        _stream.Read(text, 0, length);
    }

    private byte MapKeysymToVirtualKey(uint keysym)
    {
        // Simplified key mapping (add more as needed)
        if (keysym >= 0x20 && keysym <= 0x7E)
            return (byte)keysym;
        
        return 0;
    }

    private void WriteUInt16(ushort value)
    {
        _stream.WriteByte((byte)((value >> 8) & 0xFF));
        _stream.WriteByte((byte)(value & 0xFF));
    }

    private void WriteInt32(int value)
    {
        _stream.WriteByte((byte)((value >> 24) & 0xFF));
        _stream.WriteByte((byte)((value >> 16) & 0xFF));
        _stream.WriteByte((byte)((value >> 8) & 0xFF));
        _stream.WriteByte((byte)(value & 0xFF));
    }
}

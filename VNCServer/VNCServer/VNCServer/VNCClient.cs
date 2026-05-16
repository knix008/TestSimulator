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
    private Thread? _clientThread;
    private bool _isConnected;
    private Rectangle _screenBounds;

    public event EventHandler<string>? Disconnected;

    public VNCClient(TcpClient tcpClient, ServerSettings settings)
    {
        _tcpClient = tcpClient;
        _stream = tcpClient.GetStream();
        _settings = settings;
        _screenBounds = ScreenCapture.GetScreenBounds();
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
    }

    private void HandleClient()
    {
        try
        {
            // Send RFB Protocol Version
            SendProtocolVersion();

            // Authenticate
            if (!Authenticate())
            {
                Disconnect();
                return;
            }

            // Send Server Init
            SendServerInit();

            // Main loop
            while (_isConnected && _tcpClient.Connected)
            {
                if (_stream.DataAvailable)
                {
                    int messageType = _stream.ReadByte();
                    if (messageType == -1) break;

                    HandleClientMessage((byte)messageType);
                }
                else
                {
                    Thread.Sleep(10);
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
            Disconnected?.Invoke(this, "Client disconnected");
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

        bool incremental = request[0] != 0;
        
        // incremental 여부와 관계없이 화면 업데이트 전송
        SendFramebufferUpdate();
    }

    private void SendFramebufferUpdate()
    {
        try
        {
            using (Bitmap screenshot = ScreenCapture.CaptureScreen(_screenBounds))
            {
                // Message type
                _stream.WriteByte(0);

                // Padding
                _stream.WriteByte(0);

                // Number of rectangles
                _stream.WriteByte(0);
                _stream.WriteByte(1);

                // Rectangle: x, y, width, height
                WriteUInt16(0);
                WriteUInt16(0);
                WriteUInt16((ushort)_screenBounds.Width);
                WriteUInt16((ushort)_screenBounds.Height);

                // Encoding type (0 = Raw)
                WriteInt32(0);

                // Send pixel data (Raw encoding)
                BitmapData bmpData = screenshot.LockBits(
                    new Rectangle(0, 0, screenshot.Width, screenshot.Height),
                    ImageLockMode.ReadOnly,
                    PixelFormat.Format32bppArgb);

                try
                {
                    int stride = bmpData.Stride;
                    int bytes = Math.Abs(stride) * screenshot.Height;
                    byte[] rgbValues = new byte[bytes];
                    
                    System.Runtime.InteropServices.Marshal.Copy(
                        bmpData.Scan0, rgbValues, 0, bytes);

                    // Convert BGRA to RGB
                    byte[] rgbData = new byte[screenshot.Width * screenshot.Height * 4];
                    for (int i = 0; i < screenshot.Height; i++)
                    {
                        for (int j = 0; j < screenshot.Width; j++)
                        {
                            int srcIndex = i * stride + j * 4;
                            int dstIndex = (i * screenshot.Width + j) * 4;
                            
                            rgbData[dstIndex] = rgbValues[srcIndex];     // B
                            rgbData[dstIndex + 1] = rgbValues[srcIndex + 1]; // G
                            rgbData[dstIndex + 2] = rgbValues[srcIndex + 2]; // R
                            rgbData[dstIndex + 3] = 0; // Padding
                        }
                    }

                    _stream.Write(rgbData, 0, rgbData.Length);
                }
                finally
                {
                    screenshot.UnlockBits(bmpData);
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error sending framebuffer: {ex.Message}");
        }
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

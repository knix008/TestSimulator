using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

/// <summary>
/// Windows Desktop Duplication API (DXGI) 기반 화면 캡처.
/// GDI BitBlt 대비 CPU 사용량이 낮고 레이턴시가 짧습니다.
/// </summary>
public sealed class DxgiCapture : IDisposable
{
    #region COM/P-Invoke definitions

    [DllImport("d3d11.dll")]
    private static extern int D3D11CreateDevice(
        IntPtr pAdapter, int DriverType, IntPtr Software, uint Flags,
        IntPtr pFeatureLevels, uint FeatureLevels, uint SDKVersion,
        out IntPtr ppDevice, out int pFeatureLevel, out IntPtr ppImmediateContext);

    [DllImport("dxgi.dll")]
    private static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr ppFactory);

    private static readonly Guid IID_IDXGIFactory1   = new("770aae78-f26f-4dba-a829-253c83d1b387");
    private static readonly Guid IID_IDXGIOutput1    = new("00cddea8-939b-4b83-a340-a685226666cc");
    private static readonly Guid IID_IDXGIDevice     = new("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
    private static readonly Guid IID_ID3D11Texture2D = new("6f15aaf2-d208-4e89-9ab4-489535d34f9c");

    // DXGI_FORMAT
    private const int DXGI_FORMAT_B8G8R8A8_UNORM = 87;

    // D3D11 usage
    private const int D3D11_USAGE_STAGING   = 3;
    private const int D3D11_CPU_ACCESS_READ = 0x20000;

    // D3D_DRIVER_TYPE_HARDWARE
    private const int D3D_DRIVER_TYPE_HARDWARE = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct DXGI_OUTDUPL_DESC
    {
        public DXGI_MODE_DESC ModeDesc;
        public int Rotation;
        public int DesktopImageInSystemMemory;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DXGI_MODE_DESC
    {
        public uint Width, Height;
        public DXGI_RATIONAL RefreshRate;
        public int Format, ScanlineOrdering, Scaling;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DXGI_RATIONAL { public uint Numerator, Denominator; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DXGI_OUTDUPL_FRAME_INFO
    {
        public long LastPresentTime, LastMouseUpdateTime;
        public uint AccumulatedFrames, RectsCoalesced, ProtectedContentMaskedOut;
        public DXGI_OUTDUPL_POINTER_POSITION PointerPosition;
        public uint TotalMetadataBufferSize, PointerShapeBufferSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DXGI_OUTDUPL_POINTER_POSITION
    {
        public int X, Y;
        public int Visible;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct D3D11_TEXTURE2D_DESC
    {
        public uint Width, Height, MipLevels, ArraySize;
        public int Format, SampleDescCount, SampleDescQuality;
        public int Usage, BindFlags, CPUAccessFlags, MiscFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct D3D11_MAPPED_SUBRESOURCE
    {
        public IntPtr pData;
        public uint RowPitch, DepthPitch;
    }

    // vtable slot indices for the interfaces we use
    // IDXGIFactory1: 3=EnumAdapters, 4=MakeWindowAssociation, 5=GetWindowAssociation, 6=CreateSwapChain, 7=CreateSoftwareAdapter, 8=EnumAdapters1, 9=IsCurrent
    // IDXGIAdapter:  vtable[7] = EnumOutputs
    // IDXGIOutput1:  vtable[21] = DuplicateOutput
    // IDXGIOutputDuplication: vtable[7]=GetDesc, vtable[8]=AcquireNextFrame, vtable[9]=GetFrameDirtyRects, vtable[10]=GetFrameMoveRects, vtable[11]=GetFramePointerShape, vtable[12]=MapDesktopSurface, vtable[13]=UnMapDesktopSurface, vtable[14]=ReleaseFrame
    // ID3D11Device: vtable[5]=CreateTexture2D
    // ID3D11DeviceContext: vtable[47]=CopyResource, vtable[14]=Map, vtable[15]=Unmap

    private delegate int GetDxgiAdapter(IntPtr self, out IntPtr ppAdapter);  // IDXGIDevice::GetAdapter
    private delegate int EnumOutputs(IntPtr self, uint index, out IntPtr ppOutput);
    private delegate int QueryInterface(IntPtr self, ref Guid riid, out IntPtr ppv);
    private delegate uint Release(IntPtr self);
    private delegate int DuplicateOutput(IntPtr self, IntPtr pDevice, out IntPtr ppOutputDuplication);
    private delegate int AcquireNextFrame(IntPtr self, uint timeoutMs, out DXGI_OUTDUPL_FRAME_INFO frameInfo, out IntPtr ppDesktopResource);
    private delegate int ReleaseFrame(IntPtr self);
    private delegate int CreateTexture2D(IntPtr self, ref D3D11_TEXTURE2D_DESC pDesc, IntPtr pInitialData, out IntPtr ppTexture2D);
    private delegate void CopyResource(IntPtr self, IntPtr pDstResource, IntPtr pSrcResource);
    private delegate int Map(IntPtr self, IntPtr pResource, uint subresource, int mapType, uint flags, out D3D11_MAPPED_SUBRESOURCE pMappedResource);
    private delegate void Unmap(IntPtr self, IntPtr pResource, uint subresource);

    #endregion

    private IntPtr _device;
    private IntPtr _context;
    private IntPtr _duplication;
    private IntPtr _stagingTexture;
    private int _width;
    private int _height;
    private bool _disposed;
    private bool _initialized;

    private static T GetVTableDelegate<T>(IntPtr comObject, int slotIndex) where T : Delegate
    {
        IntPtr vtable = Marshal.ReadIntPtr(comObject);
        IntPtr funcPtr = Marshal.ReadIntPtr(vtable, slotIndex * IntPtr.Size);
        return Marshal.GetDelegateForFunctionPointer<T>(funcPtr);
    }

    public bool TryInitialize(int monitorIndex = 0)
    {
        try
        {
            int hr = D3D11CreateDevice(IntPtr.Zero, D3D_DRIVER_TYPE_HARDWARE, IntPtr.Zero, 0,
                IntPtr.Zero, 0, 7, out _device, out _, out _context);
            if (hr < 0) return false;

            // Get IDXGIDevice from ID3D11Device
            var qi = GetVTableDelegate<QueryInterface>(_device, 0);
            var iidDxgiDevice = IID_IDXGIDevice;
            if (qi(_device, ref iidDxgiDevice, out IntPtr dxgiDevice) < 0) return false;

            // IDXGIDevice::GetAdapter (vtable[7]) — no index, returns the device's adapter
            var getAdapter = GetVTableDelegate<GetDxgiAdapter>(dxgiDevice, 7);
            if (getAdapter(dxgiDevice, out IntPtr adapter) < 0)
            {
                GetVTableDelegate<Release>(dxgiDevice, 2)(dxgiDevice);
                return false;
            }
            GetVTableDelegate<Release>(dxgiDevice, 2)(dxgiDevice);

            // Enumerate output
            var enumOutputs = GetVTableDelegate<EnumOutputs>(adapter, 7);
            if (enumOutputs(adapter, (uint)monitorIndex, out IntPtr output) < 0)
            {
                GetVTableDelegate<Release>(adapter, 2)(adapter);
                return false;
            }
            GetVTableDelegate<Release>(adapter, 2)(adapter);

            // QI to IDXGIOutput1
            var qiOutput = GetVTableDelegate<QueryInterface>(output, 0);
            var iidOutput1 = IID_IDXGIOutput1;
            if (qiOutput(output, ref iidOutput1, out IntPtr output1) < 0)
            {
                GetVTableDelegate<Release>(output, 2)(output);
                return false;
            }
            GetVTableDelegate<Release>(output, 2)(output);

            // DuplicateOutput is at vtable slot 22 for IDXGIOutput1
            // IDXGIOutput1 layout: IUnknown(0-2) + IDXGIObject(3-6) + IDXGIOutput(7-18) + IDXGIOutput1(19=GetDisplayModeList1, 20=FindClosestMatchingMode1, 21=GetDisplaySurfaceData1, 22=DuplicateOutput)
            var dupOutput = GetVTableDelegate<DuplicateOutput>(output1, 22);
            hr = dupOutput(output1, _device, out _duplication);
            GetVTableDelegate<Release>(output1, 2)(output1);
            if (hr < 0) return false;

            // Read dimensions from duplication desc (vtable[7])
            // We'll detect size on first frame instead
            var screen = System.Windows.Forms.Screen.AllScreens[monitorIndex];
            _width  = screen.Bounds.Width;
            _height = screen.Bounds.Height;

            // Create staging texture for CPU readback
            if (!CreateStagingTexture()) return false;

            _initialized = true;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private bool CreateStagingTexture()
    {
        var desc = new D3D11_TEXTURE2D_DESC
        {
            Width           = (uint)_width,
            Height          = (uint)_height,
            MipLevels       = 1,
            ArraySize       = 1,
            Format          = DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDescCount = 1,
            Usage           = D3D11_USAGE_STAGING,
            CPUAccessFlags  = D3D11_CPU_ACCESS_READ,
        };

        var createTex = GetVTableDelegate<CreateTexture2D>(_device, 5);
        return createTex(_device, ref desc, IntPtr.Zero, out _stagingTexture) >= 0;
    }

    /// <summary>
    /// 화면 캡처를 byte[] (BGRA, row-major)로 반환합니다.
    /// null이면 이 프레임에 변경이 없거나 타임아웃입니다.
    /// </summary>
    public bool TryCaptureFrame(byte[] buffer, int timeoutMs = 17)
    {
        if (!_initialized || buffer.Length < _width * _height * 4)
            return false;

        var acquire = GetVTableDelegate<AcquireNextFrame>(_duplication, 8);
        int hr = acquire(_duplication, (uint)timeoutMs, out _, out IntPtr desktopResource);

        // DXGI_ERROR_WAIT_TIMEOUT = 0x887A0027 → no new frame, not an error
        if (hr == unchecked((int)0x887A0027)) return false;
        if (hr < 0) return false;

        try
        {
            // Copy GPU surface → staging texture
            var copyRes = GetVTableDelegate<CopyResource>(_context, 47);
            copyRes(_context, _stagingTexture, desktopResource);
        }
        finally
        {
            GetVTableDelegate<Release>(desktopResource, 2)(desktopResource);
            GetVTableDelegate<ReleaseFrame>(_duplication, 14)(_duplication);
        }

        // Map staging texture to CPU
        var map = GetVTableDelegate<Map>(_context, 14);
        if (map(_context, _stagingTexture, 0, 1 /*D3D11_MAP_READ*/, 0, out var mapped) < 0)
            return false;

        try
        {
            int rowPitch = (int)mapped.RowPitch;
            int rowBytes = _width * 4;
            if (rowPitch == rowBytes)
            {
                Marshal.Copy(mapped.pData, buffer, 0, _height * rowBytes);
            }
            else
            {
                for (int row = 0; row < _height; row++)
                    Marshal.Copy(mapped.pData + row * rowPitch, buffer, row * rowBytes, rowBytes);
            }
        }
        finally
        {
            GetVTableDelegate<Unmap>(_context, 15)(_context, _stagingTexture, 0);
        }

        return true;
    }

    /// <summary>
    /// 화면에 새 프레임이 있으면 true를 반환합니다. 픽셀 데이터는 수집하지 않습니다.
    /// incremental 전송에서 변화 감지 전용으로 사용합니다.
    /// </summary>
    public bool HasNewFrame(int timeoutMs = 17)
    {
        if (!_initialized) return false;

        var acquire = GetVTableDelegate<AcquireNextFrame>(_duplication, 8);
        int hr = acquire(_duplication, (uint)timeoutMs, out _, out IntPtr desktopResource);

        if (hr == unchecked((int)0x887A0027)) return false; // DXGI_ERROR_WAIT_TIMEOUT
        if (hr < 0) return false;

        // 픽셀 데이터 불필요 — 즉시 릴리즈
        GetVTableDelegate<Release>(desktopResource, 2)(desktopResource);
        GetVTableDelegate<ReleaseFrame>(_duplication, 14)(_duplication);
        return true;
    }

    public int Width  => _width;
    public int Height => _height;
    public bool IsInitialized => _initialized;

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        if (_stagingTexture != IntPtr.Zero) GetVTableDelegate<Release>(_stagingTexture, 2)(_stagingTexture);
        if (_duplication    != IntPtr.Zero) GetVTableDelegate<Release>(_duplication, 2)(_duplication);
        if (_context        != IntPtr.Zero) GetVTableDelegate<Release>(_context, 2)(_context);
        if (_device         != IntPtr.Zero) GetVTableDelegate<Release>(_device, 2)(_device);
    }
}

using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using WinRT;

namespace ScreenCaptureMaster
{
    internal static class WindowsGraphicsCaptureHelper
    {
        [ComImport]
        [Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IGraphicsCaptureItemInterop
        {
            int CreateForWindow(IntPtr window, in Guid iid, out IntPtr result);
            int CreateForMonitor(IntPtr monitor, in Guid iid, out IntPtr result);
        }

        [ComImport]
        [Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IDirect3DDxgiInterfaceAccess
        {
            IntPtr GetInterface(in Guid iid);
        }

        [DllImport("d3d11.dll")]
        private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

        [DllImport("api-ms-win-core-winrt-l1-1-0.dll")]
        private static extern int RoGetActivationFactory(IntPtr activatableClassId, in Guid iid, out IntPtr factory);

        [DllImport("api-ms-win-core-winrt-string-l1-1-0.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int WindowsCreateString(
            [MarshalAs(UnmanagedType.LPWStr)] string sourceString,
            int length,
            out IntPtr hstring);

        [DllImport("api-ms-win-core-winrt-string-l1-1-0.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int WindowsDeleteString(IntPtr hstring);

        public static bool IsSupported => GraphicsCaptureSession.IsSupported();

        public static Bitmap CaptureWindow(IntPtr windowHandle)
        {
            if (windowHandle == IntPtr.Zero)
                throw new ArgumentException("Invalid window handle.", nameof(windowHandle));

            if (!IsSupported)
                throw new NotSupportedException("Windows Graphics Capture is not supported on this system.");

            GraphicsCaptureItem item = CreateCaptureItemForWindow(windowHandle);

            D3D11.D3D11CreateDevice(
                null,
                DriverType.Hardware,
                DeviceCreationFlags.BgraSupport,
                null,
                out ID3D11Device d3dDevice).CheckError();

            using (d3dDevice)
            using (var dxgiDevice = d3dDevice.QueryInterface<IDXGIDevice>())
            {
                int hr = CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.NativePointer, out IntPtr devicePtr);
                Marshal.ThrowExceptionForHR(hr);

                IDirect3DDevice captureDevice = MarshalInterface<IDirect3DDevice>.FromAbi(devicePtr);
                Marshal.Release(devicePtr);

                var frameSize = item.Size;
                var frameArrived = new AutoResetEvent(false);

                using (var framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
                    captureDevice,
                    DirectXPixelFormat.B8G8R8A8UIntNormalized,
                    1,
                    frameSize))
                using (var session = framePool.CreateCaptureSession(item))
                {
                    session.IsCursorCaptureEnabled = false;
                    session.StartCapture();

                    Direct3D11CaptureFrame capturedFrame = null;
                    framePool.FrameArrived += (s, e) =>
                    {
                        capturedFrame = s.TryGetNextFrame();
                        frameArrived.Set();
                    };

                    if (!frameArrived.WaitOne(1000))
                        throw new TimeoutException("Timed out waiting for Windows Graphics Capture frame.");

                    using (capturedFrame)
                    {
                        return CopyFrameToBitmap(d3dDevice, capturedFrame);
                    }
                }
            }
        }

        private static GraphicsCaptureItem CreateCaptureItemForWindow(IntPtr windowHandle)
        {
            IntPtr hString;
            int hr = WindowsCreateString("Windows.Graphics.Capture.GraphicsCaptureItem", "Windows.Graphics.Capture.GraphicsCaptureItem".Length, out hString);
            Marshal.ThrowExceptionForHR(hr);

            try
            {
                Guid interopIid = typeof(IGraphicsCaptureItemInterop).GUID;
                hr = RoGetActivationFactory(hString, in interopIid, out IntPtr factoryPtr);
                Marshal.ThrowExceptionForHR(hr);

                try
                {
                    var interop = (IGraphicsCaptureItemInterop)Marshal.GetObjectForIUnknown(factoryPtr);
                    Guid iid = typeof(GraphicsCaptureItem).GUID;
                    hr = interop.CreateForWindow(windowHandle, in iid, out IntPtr itemPtr);
                    Marshal.ThrowExceptionForHR(hr);

                    try
                    {
                        return MarshalInterface<GraphicsCaptureItem>.FromAbi(itemPtr);
                    }
                    finally
                    {
                        Marshal.Release(itemPtr);
                    }
                }
                finally
                {
                    Marshal.Release(factoryPtr);
                }
            }
            finally
            {
                WindowsDeleteString(hString);
            }
        }

        private static Bitmap CopyFrameToBitmap(ID3D11Device device, Direct3D11CaptureFrame frame)
        {
            var access = (IDirect3DDxgiInterfaceAccess)frame.Surface;
            Guid textureGuid = typeof(ID3D11Texture2D).GUID;
            IntPtr texturePtr = access.GetInterface(in textureGuid);
            var sourceTexture = new ID3D11Texture2D(texturePtr);

            try
            {
                Texture2DDescription srcDesc = sourceTexture.Description;
                var stagingDesc = new Texture2DDescription
                {
                    Width = srcDesc.Width,
                    Height = srcDesc.Height,
                    ArraySize = 1,
                    MipLevels = 1,
                    Format = srcDesc.Format,
                    SampleDescription = new SampleDescription(1, 0),
                    Usage = ResourceUsage.Staging,
                    BindFlags = BindFlags.None,
                    CPUAccessFlags = CpuAccessFlags.Read,
                    MiscFlags = ResourceOptionFlags.None
                };

                using (var staging = device.CreateTexture2D(stagingDesc))
                {
                    using (var context = device.ImmediateContext)
                    {
                        context.CopyResource(staging, sourceTexture);
                        MappedSubresource mapped = context.Map(staging, 0, MapMode.Read, Vortice.Direct3D11.MapFlags.None);

                        try
                        {
                            var bitmap = new Bitmap((int)srcDesc.Width, (int)srcDesc.Height, PixelFormat.Format32bppArgb);
                            var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
                            BitmapData data = bitmap.LockBits(rect, ImageLockMode.WriteOnly, bitmap.PixelFormat);
                            try
                            {
                                int srcStride = (int)mapped.RowPitch;
                                int dstStride = data.Stride;
                                int copyBytesPerRow = Math.Min(srcStride, dstStride);
                                for (int y = 0; y < bitmap.Height; y++)
                                {
                                    IntPtr srcRow = IntPtr.Add(mapped.DataPointer, y * srcStride);
                                    IntPtr dstRow = IntPtr.Add(data.Scan0, y * dstStride);
                                    byte[] row = new byte[copyBytesPerRow];
                                    Marshal.Copy(srcRow, row, 0, copyBytesPerRow);
                                    Marshal.Copy(row, 0, dstRow, copyBytesPerRow);
                                }
                            }
                            finally
                            {
                                bitmap.UnlockBits(data);
                            }

                            return bitmap;
                        }
                        finally
                        {
                            context.Unmap(staging, 0);
                        }
                    }
                }
            }
            finally
            {
                sourceTexture.Dispose();
            }
        }
    }
}

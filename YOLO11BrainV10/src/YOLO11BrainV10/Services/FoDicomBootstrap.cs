using FellowOakDicom;
using FellowOakDicom.Imaging;

namespace YOLO11BrainV10.Services;

/// <summary>Registers WinForms/System.Drawing image rendering for DICOM slices (fo-dicom 5).</summary>
internal static class FoDicomBootstrap
{
    private static readonly object Gate = new();
    private static bool _configured;

    public static void EnsureConfigured()
    {
        lock (Gate)
        {
            if (_configured)
                return;

            new DicomSetupBuilder()
                .RegisterServices(s => s.AddFellowOakDicom().AddImageManager<WinFormsImageManager>())
                .Build();
            _configured = true;
        }
    }
}

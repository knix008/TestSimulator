using System.Drawing;
using System.Drawing.Imaging;

namespace VNCServer.VNCServer;

/// <summary>
/// 화면 녹화 기능을 제공하는 클래스
/// </summary>
public class ScreenRecorder
{
    private bool _isRecording;
    private Thread? _recordingThread;
    private string _outputPath = string.Empty;
    private int _frameRate = 30;
    private int _quality = 75;
    private List<string> _frameFiles = new List<string>();
    private string _tempDirectory = string.Empty;
    private int _frameCount = 0;
    private DateTime _recordingStartTime;

    public event EventHandler<string>? RecordingStarted;
    public event EventHandler<RecordingStats>? RecordingProgress;
    public event EventHandler<string>? RecordingStopped;
    public event EventHandler<string>? RecordingError;

    public class RecordingStats
    {
        public int FrameCount { get; set; }
        public TimeSpan Duration { get; set; }
        public long TotalSize { get; set; }
        public double AverageFps { get; set; }
    }

    public bool IsRecording => _isRecording;
    public int FrameRate
    {
        get => _frameRate;
        set => _frameRate = Math.Clamp(value, 1, 60);
    }
    public int Quality
    {
        get => _quality;
        set => _quality = Math.Clamp(value, 1, 100);
    }

    /// <summary>
    /// 녹화 시작
    /// </summary>
    public void StartRecording(string outputPath, int frameRate = 30, int quality = 75)
    {
        if (_isRecording)
        {
            throw new InvalidOperationException("Recording is already in progress");
        }

        _outputPath = outputPath;
        _frameRate = frameRate;
        _quality = quality;
        _frameCount = 0;
        _frameFiles.Clear();

        // 임시 디렉토리 생성
        _tempDirectory = Path.Combine(Path.GetTempPath(), $"VNCRecording_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDirectory);

        _isRecording = true;
        _recordingStartTime = DateTime.Now;

        _recordingThread = new Thread(RecordingLoop)
        {
            IsBackground = true,
            Name = "ScreenRecordingThread"
        };
        _recordingThread.Start();

        RecordingStarted?.Invoke(this, outputPath);
    }

    /// <summary>
    /// 녹화 중지
    /// </summary>
    public void StopRecording()
    {
        if (!_isRecording)
        {
            return;
        }

        _isRecording = false;
        _recordingThread?.Join(5000);

        try
        {
            // 모든 프레임을 비디오로 변환
            CompileFramesToVideo();

            RecordingStopped?.Invoke(this, _outputPath);
        }
        catch (Exception ex)
        {
            RecordingError?.Invoke(this, $"Failed to compile video: {ex.Message}");
        }
        finally
        {
            // 임시 파일 정리
            CleanupTempFiles();
        }
    }

    private void RecordingLoop()
    {
        int frameInterval = 1000 / _frameRate; // ms
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        long nextFrameTime = 0;

        while (_isRecording)
        {
            try
            {
                var currentTime = stopwatch.ElapsedMilliseconds;
                if (currentTime >= nextFrameTime)
                {
                    CaptureFrame();
                    nextFrameTime += frameInterval;

                    // 진행 상황 업데이트
                    if (_frameCount % (_frameRate * 5) == 0) // 5초마다 업데이트
                    {
                        UpdateProgress();
                    }
                }

                // 다음 프레임까지 대기
                var sleepTime = (int)(nextFrameTime - currentTime);
                if (sleepTime > 0)
                {
                    Thread.Sleep(Math.Min(sleepTime, frameInterval));
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Recording frame error: {ex.Message}");
            }
        }
    }

    private void CaptureFrame()
    {
        using (var bitmap = ScreenCapture.CaptureScreen())
        {
            string framePath = Path.Combine(_tempDirectory, $"frame_{_frameCount:D8}.jpg");
            
            var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(
                System.Drawing.Imaging.Encoder.Quality, (long)_quality);

            var jpegEncoder = GetEncoder(ImageFormat.Jpeg);
            if (jpegEncoder != null)
            {
                bitmap.Save(framePath, jpegEncoder, encoderParams);
            }
            else
            {
                bitmap.Save(framePath, ImageFormat.Jpeg);
            }

            _frameFiles.Add(framePath);
            _frameCount++;
        }
    }

    private void UpdateProgress()
    {
        var duration = DateTime.Now - _recordingStartTime;
        long totalSize = 0;

        foreach (var file in _frameFiles)
        {
            if (File.Exists(file))
            {
                totalSize += new FileInfo(file).Length;
            }
        }

        var stats = new RecordingStats
        {
            FrameCount = _frameCount,
            Duration = duration,
            TotalSize = totalSize,
            AverageFps = duration.TotalSeconds > 0 ? _frameCount / duration.TotalSeconds : 0
        };

        RecordingProgress?.Invoke(this, stats);
    }

    private void CompileFramesToVideo()
    {
        // 프레임들을 이미지 시퀀스로 저장 (AVI 또는 MP4 변환은 외부 라이브러리 필요)
        // 현재는 ZIP으로 묶어서 저장
        
        string directory = Path.GetDirectoryName(_outputPath) ?? "";
        string filenameWithoutExt = Path.GetFileNameWithoutExtension(_outputPath);
        string zipPath = Path.Combine(directory, $"{filenameWithoutExt}_frames.zip");

        if (File.Exists(zipPath))
        {
            File.Delete(zipPath);
        }

        System.IO.Compression.ZipFile.CreateFromDirectory(_tempDirectory, zipPath);

        // 메타데이터 파일 생성
        var duration = DateTime.Now - _recordingStartTime;
        string metadataPath = Path.Combine(directory, $"{filenameWithoutExt}_metadata.txt");
        
        File.WriteAllText(metadataPath, 
            $"Recording Metadata\n" +
            $"==================\n" +
            $"Frames: {_frameCount}\n" +
            $"Frame Rate: {_frameRate} fps\n" +
            $"Duration: {duration}\n" +
            $"Quality: {_quality}\n" +
            $"Start Time: {_recordingStartTime}\n" +
            $"End Time: {DateTime.Now}\n" +
            $"Frames Archive: {zipPath}\n" +
            $"\n" +
            $"Note: To convert to video, use FFmpeg:\n" +
            $"ffmpeg -framerate {_frameRate} -i frame_%08d.jpg -c:v libx264 -pix_fmt yuv420p output.mp4\n");
    }

    private void CleanupTempFiles()
    {
        try
        {
            if (Directory.Exists(_tempDirectory))
            {
                Directory.Delete(_tempDirectory, true);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Cleanup error: {ex.Message}");
        }
    }

    private ImageCodecInfo? GetEncoder(ImageFormat format)
    {
        var codecs = ImageCodecInfo.GetImageEncoders();
        foreach (var codec in codecs)
        {
            if (codec.FormatID == format.Guid)
            {
                return codec;
            }
        }
        return null;
    }

    /// <summary>
    /// 녹화 일시 정지 (향후 구현)
    /// </summary>
    public void PauseRecording()
    {
        // TODO: 일시 정지 기능 구현
    }

    /// <summary>
    /// 녹화 재개 (향후 구현)
    /// </summary>
    public void ResumeRecording()
    {
        // TODO: 재개 기능 구현
    }

    /// <summary>
    /// 현재 녹화 통계 가져오기
    /// </summary>
    public RecordingStats? GetCurrentStats()
    {
        if (!_isRecording)
            return null;

        var duration = DateTime.Now - _recordingStartTime;
        long totalSize = 0;

        foreach (var file in _frameFiles)
        {
            if (File.Exists(file))
            {
                totalSize += new FileInfo(file).Length;
            }
        }

        return new RecordingStats
        {
            FrameCount = _frameCount,
            Duration = duration,
            TotalSize = totalSize,
            AverageFps = duration.TotalSeconds > 0 ? _frameCount / duration.TotalSeconds : 0
        };
    }
}

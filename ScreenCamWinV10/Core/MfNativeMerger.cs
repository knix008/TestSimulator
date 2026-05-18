using System.Runtime.InteropServices;
using Vortice.MediaFoundation;

namespace ScreenCamWin.Core;

/// <summary>Muxes H.264 MP4 (video-only) + WAV PCM into MP4 with AAC via Media Foundation.</summary>
internal static class MfNativeMerger
{
    const int MinWavBytes = 2048;
    const int MF_E_NOTACCEPTING = unchecked((int)0xC00D36B5);

    public static void Merge(
        string videoPath,
        string audioPath,
        string outputPath,
        IProgress<MergeProgress>? progress,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(videoPath))
            throw new FileNotFoundException("영상 파일을 찾을 수 없습니다.", videoPath);

        byte[] pcm = WavFileHelper.ReadPcmData(audioPath);
        if (pcm.Length < MinWavBytes)
            throw new InvalidOperationException(
                $"오디오 파일이 비어 있거나 너무 짧습니다 ({pcm.Length} bytes).");

        string? outDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outDir))
            Directory.CreateDirectory(outDir);

        string tempOut = outputPath + ".merging";
        if (File.Exists(tempOut)) File.Delete(tempOut);

        MediaFactory.MFStartup();
        try
        {
            progress?.Report(new MergeProgress(35, "MP4 합치는 중…", "0%"));
            MergeCore(videoPath, pcm, tempOut, progress, cancellationToken);
        }
        finally
        {
            MediaFactory.MFShutdown();
        }

        progress?.Report(new MergeProgress(98, "최종 파일 저장 중…", "100%"));

        if (File.Exists(outputPath))
            File.Delete(outputPath);
        File.Move(tempOut, outputPath);

        progress?.Report(new MergeProgress(100, "완료", "100%"));
    }

    static void MergeCore(
        string videoPath,
        byte[] pcm,
        string outputPath,
        IProgress<MergeProgress>? progress,
        CancellationToken cancellationToken)
    {
        using var reader = MediaFactory.MFCreateSourceReaderFromURL(videoPath, null);
        reader.SetStreamSelection(SourceReaderIndex.AllStreams, false);
        reader.SetStreamSelection(SourceReaderIndex.FirstVideoStream, true);

        using var writer = MediaFactory.MFCreateSinkWriterFromURL(outputPath, null, null);

        using var nativeOut = reader.GetNativeMediaType(SourceReaderIndex.FirstVideoStream, 0);
        int videoOutIndex = writer.AddStream(nativeOut);

        using var currentIn = reader.GetCurrentMediaType(SourceReaderIndex.FirstVideoStream);
        writer.SetInputMediaType(videoOutIndex, currentIn, null);

        int audioOutIndex = AddAacStream(writer);

        writer.BeginWriting();

        int videoSamples = 0;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            IMFSample sample = reader.ReadSample(
                SourceReaderIndex.FirstVideoStream,
                SourceReaderControlFlag.None,
                out _,
                out SourceReaderFlag flags,
                out _);

            if ((flags & SourceReaderFlag.EndOfStream) != 0)
                break;

            WriteSampleWithRetry(writer, videoOutIndex, sample);
            sample.Dispose();
            videoSamples++;

            if (videoSamples % 10 == 0)
                progress?.Report(new MergeProgress(40, "영상 스트림 복사 중…", $"{videoSamples} frames"));
        }

        if (videoSamples == 0)
            throw new InvalidDataException("MP4에 영상 샘플이 없습니다.");

        WritePcmAudio(writer, audioOutIndex, pcm, progress, cancellationToken);

        writer.Finalize();
    }

    static int AddAacStream(IMFSinkWriter writer)
    {
        ushort blockAlign = (ushort)(MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8);
        uint avgBytes = (uint)(MicrophoneCapture.SampleRate * blockAlign);

        using var audioOut = MediaFactory.MFCreateMediaType();
        audioOut.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Audio);
        audioOut.Set(MediaTypeAttributeKeys.Subtype, MfAudioGuids.Aac);
        audioOut.Set(MediaTypeAttributeKeys.AudioNumChannels, (uint)MicrophoneCapture.Channels);
        audioOut.Set(MediaTypeAttributeKeys.AudioSamplesPerSecond, (uint)MicrophoneCapture.SampleRate);
        audioOut.Set(MediaTypeAttributeKeys.AudioBitsPerSample, (uint)MicrophoneCapture.BitsPerSample);
        audioOut.Set(MediaTypeAttributeKeys.AvgBitrate, 192_000u);

        int audioOutIndex = writer.AddStream(audioOut);

        using var audioIn = MediaFactory.MFCreateMediaType();
        audioIn.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Audio);
        audioIn.Set(MediaTypeAttributeKeys.Subtype, MfAudioGuids.Pcm);
        audioIn.Set(MediaTypeAttributeKeys.AudioNumChannels, (uint)MicrophoneCapture.Channels);
        audioIn.Set(MediaTypeAttributeKeys.AudioSamplesPerSecond, (uint)MicrophoneCapture.SampleRate);
        audioIn.Set(MediaTypeAttributeKeys.AudioBitsPerSample, (uint)MicrophoneCapture.BitsPerSample);
        audioIn.Set(MediaTypeAttributeKeys.AudioBlockAlignment, blockAlign);
        audioIn.Set(MediaTypeAttributeKeys.AudioAvgBytesPerSecond, avgBytes);

        writer.SetInputMediaType(audioOutIndex, audioIn, null);
        return audioOutIndex;
    }

    static void WritePcmAudio(
        IMFSinkWriter writer,
        int audioStreamIndex,
        byte[] pcm,
        IProgress<MergeProgress>? progress,
        CancellationToken cancellationToken)
    {
        int blockAlign = MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8;
        int chunkSamples = Math.Max(blockAlign, MicrophoneCapture.SampleRate / 10);
        chunkSamples -= chunkSamples % blockAlign;
        int chunkBytes = chunkSamples * blockAlign;

        long samplePosition = 0;
        int offset = 0;

        while (offset < pcm.Length)
        {
            cancellationToken.ThrowIfCancellationRequested();

            int count = Math.Min(chunkBytes, pcm.Length - offset);
            count -= count % blockAlign;
            if (count <= 0) break;

            int samples = count / blockAlign;
            long time     = samplePosition * 10_000_000L / MicrophoneCapture.SampleRate;
            long duration = samples * 10_000_000L / MicrophoneCapture.SampleRate;

            using var buffer = MediaFactory.MFCreateMemoryBuffer(count);
            buffer.Lock(out IntPtr pData, out _, out _);
            try
            {
                Marshal.Copy(pcm, offset, pData, count);
            }
            finally
            {
                buffer.Unlock();
            }
            buffer.CurrentLength = count;

            using var sample = MediaFactory.MFCreateSample();
            sample.AddBuffer(buffer);
            sample.SampleTime     = time;
            sample.SampleDuration = duration;

            WriteSampleWithRetry(writer, audioStreamIndex, sample);

            samplePosition += samples;
            offset         += count;

            if (offset % (chunkBytes * 20) == 0)
            {
                int pct = 55 + (int)(offset * 40.0 / pcm.Length);
                progress?.Report(new MergeProgress(pct, "오디오 인코딩 중…", $"{offset * 100 / pcm.Length}%"));
            }
        }
    }

    static void WriteSampleWithRetry(IMFSinkWriter writer, int streamIndex, IMFSample sample)
    {
        for (int attempt = 0; attempt < 60; attempt++)
        {
            try
            {
                writer.WriteSample(streamIndex, sample);
                return;
            }
            catch (COMException ex) when (ex.HResult == MF_E_NOTACCEPTING)
            {
                Thread.Sleep(10);
            }
        }
    }
}

file static class MfAudioGuids
{
    public static readonly Guid Aac = new("000000FF-0000-0010-8000-00AA00389B71");
    public static readonly Guid Pcm = new("00000001-0000-0010-8000-00AA00389B71");
}

namespace ScreenCamWin.Core;

internal static class AviNativeMerger
{
    const int MinWavBytes = 2048;

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

        var source = AviVideoReader.Open(videoPath);
        if (source.Strf.Length == 0)
            throw new InvalidDataException("AVI 영상 포맷 정보를 읽을 수 없습니다.");

        int fps = source.Fps > 0 ? source.Fps : 30;
        int bytesPerFrame = Math.Max(
            MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8,
            MicrophoneCapture.SampleRate * MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8 / fps);

        string? outDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outDir))
            Directory.CreateDirectory(outDir);

        string tempOut = outputPath + ".merging";
        if (File.Exists(tempOut)) File.Delete(tempOut);

        progress?.Report(new MergeProgress(35, "AVI 합치는 중…", "0%"));

        using (var avi = new AviContainer(tempOut, source.Width, source.Height, fps, withAudio: true))
        {
            avi.WriteFileHeader(source.Handler, source.Strf);

            int total = source.Frames.Count;
            int pcmOffset = 0;

            for (int i = 0; i < total; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                avi.WriteVideoFrame(source.Frames[i], isKeyFrame: true);

                int take = Math.Min(bytesPerFrame, pcm.Length - pcmOffset);
                if (take > 0)
                {
                    var block = new byte[take];
                    Buffer.BlockCopy(pcm, pcmOffset, block, 0, take);
                    avi.WriteAudioFrame(block);
                    pcmOffset += take;
                }

                if (i % 5 == 0 || i == total - 1)
                {
                    int pct = 35 + (int)((i + 1) * 62.0 / total);
                    progress?.Report(new MergeProgress(pct, "AVI 합치는 중…", $"{(i + 1) * 100 / total}%"));
                }
            }

            avi.FinalizeFile();
        }

        progress?.Report(new MergeProgress(98, "최종 파일 저장 중…", "100%"));

        if (File.Exists(outputPath))
            File.Delete(outputPath);
        File.Move(tempOut, outputPath);

        progress?.Report(new MergeProgress(100, "완료", "100%"));
    }
}

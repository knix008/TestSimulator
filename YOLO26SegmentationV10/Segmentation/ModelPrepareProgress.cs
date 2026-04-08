namespace YOLO26SegmentationV10.Segmentation
{
    internal enum ModelPreparePhase
    {
        Checking,
        Downloading,
        Converting,
        Done,
    }

    /// <summary>다운로드·변환 UI(ProgressBar)용 진행 상태.</summary>
    internal readonly struct ModelPrepareProgress
    {
        public ModelPrepareProgress(ModelPreparePhase phase, int? percent, string detail = null)
        {
            Phase = phase;
            Percent = percent;
            Detail = detail ?? string.Empty;
        }

        public ModelPreparePhase Phase { get; }
        /// <summary>0~100. null이면 용량을 알 수 없어 무한 진행(Marquee)으로 표시.</summary>
        public int? Percent { get; }
        public string Detail { get; }
    }
}

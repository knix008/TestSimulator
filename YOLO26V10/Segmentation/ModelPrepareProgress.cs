namespace YOLO26V10.Segmentation
{
    internal enum ModelPreparePhase
    {
        Checking,
        Downloading,
        Converting,
        Done,
    }

    /// <summary>?ㅼ슫濡쒕뱶쨌蹂??UI(ProgressBar)??吏꾪뻾 ?곹깭.</summary>
    internal readonly struct ModelPrepareProgress
    {
        public ModelPrepareProgress(ModelPreparePhase phase, int? percent, string detail = null)
        {
            Phase = phase;
            Percent = percent;
            Detail = detail ?? string.Empty;
        }

        public ModelPreparePhase Phase { get; }
        /// <summary>0~100. null?대㈃ ?⑸웾???????놁뼱 臾댄븳 吏꾪뻾(Marquee)?쇰줈 ?쒖떆.</summary>
        public int? Percent { get; }
        public string Detail { get; }
    }
}


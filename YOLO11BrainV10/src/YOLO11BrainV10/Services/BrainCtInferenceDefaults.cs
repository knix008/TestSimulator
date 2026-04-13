namespace YOLO11BrainV10.Services;

/// <summary>권장 추론 설정 (Ultralytics YOLO·brain-tumor.yaml 기준).</summary>
internal static class BrainCtInferenceDefaults
{
    /// <summary>YOLO predict 기본과 동일한 최소 신뢰도.</summary>
    internal const double RecommendedMinConfidence = 0.25;

    /// <summary>Ultralytics brain-tumor 데이터셋 names 순서.</summary>
    internal const string RecommendedClassLabelsComma = "negative,positive";
}

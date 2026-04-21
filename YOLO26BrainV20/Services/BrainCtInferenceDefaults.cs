namespace YOLO26BrainV20.Services;

/// <summary>권장 추론 설정 (단일 클래스 출혈 세그 모델).</summary>
internal static class BrainCtInferenceDefaults
{
    /// <summary>YOLO predict 기본과 동일한 최소 신뢰도.</summary>
    internal const double RecommendedMinConfidence = 0.25;

    /// <summary>단일 클래스 세그 모델용 표시 이름. 학습 data.yaml의 names와 순서가 같아야 합니다.</summary>
    internal const string RecommendedClassLabelsComma = "hemorrhage";

    /// <summary>저장소 models 폴더 아래 기본 세그 ONNX 파일명(없으면 이전 파이프라인 산출물 이름을 순서대로 시도).</summary>
    internal const string DefaultSegmentationOnnxFileName = "brain_ct_yolo26v20_seg.onnx";

    internal static readonly string[] DefaultSegmentationOnnxFallbacks =
    {
        "hemorrhage_seg.onnx",
        "hemorrhage.onnx",
        DefaultSegmentationOnnxFileName,
        "hemorrhage_yolo26_seg.onnx",
        "brain_ct_yolo26n_seg.onnx",
    };
}

namespace YOLO26BrainV20.Services;

/// <summary>권장 추론 설정.</summary>
internal static class BrainCtInferenceDefaults
{
    /// <summary>YOLO predict 기본과 동일한 최소 신뢰도.</summary>
    internal const double RecommendedMinConfidence = 0.25;

    /// <summary>선택 UI용 클래스 이름(쉼표). 비우면 ONNX 출력 채널로만 추론하고 표시는 class_0 형식.</summary>
    internal const string RecommendedClassLabelsComma = "";

    /// <summary>저장소 models 폴더 아래 기본 세그 ONNX 파일명(없으면 이전 파이프라인 산출물 이름을 순서대로 시도).</summary>
    internal const string DefaultSegmentationOnnxFileName = "brain_ct_yolo26v20_seg.onnx";

    internal static readonly string[] DefaultSegmentationOnnxFallbacks =
    {
        DefaultSegmentationOnnxFileName,
        "brain_ct_yolo26n_seg.onnx",
    };
}

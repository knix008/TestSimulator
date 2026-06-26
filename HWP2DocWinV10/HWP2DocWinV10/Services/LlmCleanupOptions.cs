namespace HWP2DocWinV10.Services;

internal readonly record struct LlmCleanupOptions(
    bool FastMode = true,
    LlmProcessingTargets Targets = LlmProcessingTargets.Tables);

namespace ReqTrace.Forms;

internal readonly record struct ProgressDialogResult<T>(T Value, TimeSpan Elapsed);

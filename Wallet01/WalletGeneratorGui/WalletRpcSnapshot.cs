namespace WalletGeneratorGui;

/// <summary>UI 스레드에서만 스냅샷을 만들고, 서버 스레드에서는 이 값만 사용합니다.</summary>
public sealed record WalletRpcSnapshot(string RpcUrl, string? Address, string? PrivateKey);

using MyWorkspace.Core.Entities;

namespace MyWorkspace.Core.Models;

public sealed class LoginResult
{
    public bool Success { get; init; }
    public string Message { get; init; } = string.Empty;
    public User? User { get; init; }

    public static LoginResult Ok(User user) => new() { Success = true, User = user };

    public static LoginResult Fail(string message) => new() { Success = false, Message = message };
}

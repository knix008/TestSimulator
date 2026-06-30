using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Entities;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.User;
    public string? Email { get; set; }
    public bool NotifyOnPageUpdate { get; set; }
    public bool NotifyOnWorkspaceChange { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

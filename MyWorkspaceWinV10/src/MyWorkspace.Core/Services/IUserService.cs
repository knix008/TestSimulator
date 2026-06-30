using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Services;

public interface IUserService
{
    IReadOnlyList<User> GetAllUsers();
    User? GetById(int id);
    User? GetByUsername(string username);
    User CreateUser(string username, string password, UserRole role);
    void UpdateUser(int id, string username, UserRole role, string? newPassword);
    void UpdateOwnProfile(int userId, string username);
    void UpdateNotificationSettings(int userId, string? email, bool notifyOnPageUpdate, bool notifyOnWorkspaceChange);
    void DeleteUser(int id);
}

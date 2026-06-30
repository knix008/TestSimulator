using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IAuthService
{
    LoginResult Login(string username, string password);
    bool ChangePassword(int userId, string currentPassword, string newPassword);
}

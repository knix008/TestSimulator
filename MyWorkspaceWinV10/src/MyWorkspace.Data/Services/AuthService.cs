using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Security;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class AuthService : IAuthService
{
    private readonly AppDbContext _db;

    public AuthService(AppDbContext db) => _db = db;

    public LoginResult Login(string username, string password)
    {
        var normalized = username.Trim();
        if (string.IsNullOrEmpty(normalized))
            return LoginResult.Fail("사용자 ID를 입력하세요.");

        if (string.IsNullOrEmpty(password))
            return LoginResult.Fail("비밀번호를 입력하세요.");

        var user = _db.Users.AsNoTracking()
            .FirstOrDefault(u => u.Username == normalized);

        if (user == null || !PasswordHasher.Verify(password, user.PasswordHash))
            return LoginResult.Fail("ID 또는 비밀번호가 올바르지 않습니다.");

        return LoginResult.Ok(user);
    }

    public bool ChangePassword(int userId, string currentPassword, string newPassword)
    {
        var user = _db.Users.FirstOrDefault(u => u.Id == userId);
        if (user == null || !PasswordHasher.Verify(currentPassword, user.PasswordHash))
            return false;

        if (string.IsNullOrWhiteSpace(newPassword))
            return false;

        user.PasswordHash = PasswordHasher.Hash(newPassword);
        user.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
        return true;
    }
}

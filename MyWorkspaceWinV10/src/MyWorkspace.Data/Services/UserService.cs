using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Security;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class UserService : IUserService
{
    private readonly AppDbContext _db;

    public UserService(AppDbContext db) => _db = db;

    public IReadOnlyList<User> GetAllUsers() =>
        _db.Users.AsNoTracking().OrderBy(u => u.Username).ToList();

    public User? GetById(int id) =>
        _db.Users.AsNoTracking().FirstOrDefault(u => u.Id == id);

    public User? GetByUsername(string username) =>
        _db.Users.AsNoTracking().FirstOrDefault(u => u.Username == username.Trim());

    public User CreateUser(string username, string password, UserRole role)
    {
        var normalized = username.Trim();
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("사용자 ID를 입력하세요.");

        if (string.IsNullOrEmpty(password))
            throw new InvalidOperationException("비밀번호를 입력하세요.");

        if (_db.Users.Any(u => u.Username == normalized))
            throw new InvalidOperationException("이미 존재하는 사용자 ID입니다.");

        var now = DateTime.UtcNow;
        var user = new User
        {
            Username = normalized,
            PasswordHash = PasswordHasher.Hash(password),
            Role = role,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Users.Add(user);
        _db.SaveChanges();
        return user;
    }

    public void UpdateUser(int id, string username, UserRole role, string? newPassword)
    {
        var user = _db.Users.FirstOrDefault(u => u.Id == id)
            ?? throw new InvalidOperationException("사용자를 찾을 수 없습니다.");

        var normalized = username.Trim();
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("사용자 ID를 입력하세요.");

        if (_db.Users.Any(u => u.Id != id && u.Username == normalized))
            throw new InvalidOperationException("이미 존재하는 사용자 ID입니다.");

        user.Username = normalized;
        user.Role = role;
        user.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(newPassword))
            user.PasswordHash = PasswordHasher.Hash(newPassword);

        _db.SaveChanges();
    }

    public void UpdateOwnProfile(int userId, string username)
    {
        var user = _db.Users.FirstOrDefault(u => u.Id == userId)
            ?? throw new InvalidOperationException("사용자를 찾을 수 없습니다.");

        var normalized = username.Trim();
        if (string.IsNullOrEmpty(normalized))
            throw new InvalidOperationException("사용자 ID를 입력하세요.");

        if (_db.Users.Any(u => u.Id != userId && u.Username == normalized))
            throw new InvalidOperationException("이미 존재하는 사용자 ID입니다.");

        user.Username = normalized;
        user.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    public void UpdateNotificationSettings(int userId, string? email, bool notifyOnPageUpdate, bool notifyOnWorkspaceChange)
    {
        var user = _db.Users.FirstOrDefault(u => u.Id == userId)
            ?? throw new InvalidOperationException("사용자를 찾을 수 없습니다.");

        user.Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        user.NotifyOnPageUpdate = notifyOnPageUpdate;
        user.NotifyOnWorkspaceChange = notifyOnWorkspaceChange;
        user.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    public void DeleteUser(int id)
    {
        var user = _db.Users.FirstOrDefault(u => u.Id == id);
        if (user == null)
            return;

        if (user.Role == UserRole.Admin && _db.Users.Count(u => u.Role == UserRole.Admin) <= 1)
            throw new InvalidOperationException("마지막 관리자 계정은 삭제할 수 없습니다.");

        _db.Users.Remove(user);
        _db.SaveChanges();
    }
}

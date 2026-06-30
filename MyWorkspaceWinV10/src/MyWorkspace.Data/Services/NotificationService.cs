using System.Net;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class NotificationService : INotificationService
{
    private readonly AppDbContext _db;
    private readonly EmailSettings _emailSettings;

    public NotificationService(AppDbContext db, EmailSettings emailSettings)
    {
        _db = db;
        _emailSettings = emailSettings.Clone();
    }

    public bool IsEmailConfigured => _emailSettings.IsConfigured;

    public void NotifyPageUpdated(User actor, Page page, string summary) =>
        SendWorkspaceNotification(
            actor,
            page.WorkspaceId,
            notifyPageUpdate: true,
            notifyWorkspaceChange: false,
            $"Page 수정: {page.Title}",
            summary);

    public void NotifyPageCreated(User actor, Page page) =>
        SendWorkspaceNotification(
            actor,
            page.WorkspaceId,
            notifyPageUpdate: true,
            notifyWorkspaceChange: false,
            $"새 Page: {page.Title}",
            $"{actor.Username}님이 Page \"{page.Title}\"을(를) 생성했습니다.");

    public void NotifyPageDeleted(User actor, int workspaceId, string pageTitle) =>
        SendWorkspaceNotification(
            actor,
            workspaceId,
            notifyPageUpdate: true,
            notifyWorkspaceChange: false,
            $"Page 삭제: {pageTitle}",
            $"{actor.Username}님이 Page \"{pageTitle}\"을(를) 삭제했습니다.");

    public void NotifyWorkspaceRenamed(User actor, Workspace workspace, string previousName) =>
        SendWorkspaceNotification(
            actor,
            workspace.Id,
            notifyPageUpdate: false,
            notifyWorkspaceChange: true,
            $"Workspace 이름 변경: {workspace.Name}",
            $"{actor.Username}님이 Workspace 이름을 \"{previousName}\"에서 \"{workspace.Name}\"(으)로 변경했습니다.");

    public void NotifyWorkspaceMemberAdded(User actor, int workspaceId, string workspaceName, User member) =>
        SendWorkspaceNotification(
            actor,
            workspaceId,
            notifyPageUpdate: false,
            notifyWorkspaceChange: true,
            $"멤버 추가: {workspaceName}",
            $"{actor.Username}님이 {member.Username}님을 Workspace \"{workspaceName}\"에 추가했습니다.");

    public void NotifyWorkspaceMemberRemoved(User actor, int workspaceId, string workspaceName, User member) =>
        SendWorkspaceNotification(
            actor,
            workspaceId,
            notifyPageUpdate: false,
            notifyWorkspaceChange: true,
            $"멤버 제거: {workspaceName}",
            $"{actor.Username}님이 {member.Username}님을 Workspace \"{workspaceName}\"에서 제거했습니다.");

    private void SendWorkspaceNotification(
        User actor,
        int workspaceId,
        bool notifyPageUpdate,
        bool notifyWorkspaceChange,
        string subject,
        string body)
    {
        if (!_emailSettings.IsConfigured)
            return;

        var recipients = GetRecipients(workspaceId, actor.Id, notifyPageUpdate, notifyWorkspaceChange);
        if (recipients.Count == 0)
            return;

        foreach (var recipient in recipients)
            SendEmail(recipient, subject, body);
    }

    private List<string> GetRecipients(
        int workspaceId,
        int actorUserId,
        bool notifyPageUpdate,
        bool notifyWorkspaceChange)
    {
        var workspace = _db.Workspaces.AsNoTracking().FirstOrDefault(w => w.Id == workspaceId);
        if (workspace == null)
            return [];

        var memberUserIds = _db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId)
            .Select(m => m.UserId)
            .ToHashSet();
        memberUserIds.Add(workspace.OwnerId);

        var users = _db.Users.AsNoTracking()
            .Where(u => memberUserIds.Contains(u.Id) && u.Id != actorUserId)
            .ToList();

        return users
            .Where(u => !string.IsNullOrWhiteSpace(u.Email))
            .Where(u => (notifyPageUpdate && u.NotifyOnPageUpdate) || (notifyWorkspaceChange && u.NotifyOnWorkspaceChange))
            .Select(u => u.Email!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private void SendEmail(string toAddress, string subject, string body)
    {
        try
        {
            using var message = new MailMessage
            {
                From = new MailAddress(_emailSettings.FromAddress, _emailSettings.FromDisplayName),
                Subject = $"[MyWorkspace] {subject}",
                Body = body,
                IsBodyHtml = false
            };
            message.To.Add(toAddress);

            using var client = new SmtpClient(_emailSettings.SmtpHost, _emailSettings.Port)
            {
                EnableSsl = _emailSettings.EnableSsl
            };

            if (!string.IsNullOrWhiteSpace(_emailSettings.Username))
                client.Credentials = new NetworkCredential(_emailSettings.Username, _emailSettings.Password);

            client.Send(message);
        }
        catch
        {
            // Email is optional — failures must not block application operations.
        }
    }
}

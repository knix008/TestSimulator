using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data;

public sealed class AppServices : IDisposable
{
    public AppServices(DatabaseSettings settings, EmailSettings emailSettings)
    {
        Settings = settings.Clone();
        EmailSettings = emailSettings.Clone();
        var options = DatabaseContextFactory.CreateOptions(Settings);

        Db = new AppDbContext(options);
        DbInitializer.Initialize(Db);

        Auth = new Services.AuthService(Db);
        Users = new Services.UserService(Db);
        UserNotifications = new Services.UserNotificationService(Db);
        Notifications = new Services.NotificationService(Db, EmailSettings, UserNotifications);
        Workspaces = new Services.WorkspaceService(Db, Notifications);
        PageChangeLogs = new Services.PageChangeLogService(Db, Workspaces);
        PageVersions = new Services.PageVersionService(Db, Workspaces, PageChangeLogs);
        PageAssets = new Services.PageAssetService(Db, Workspaces);
        Pages = new Services.PageService(Db, Workspaces, PageVersions, PageChangeLogs, Notifications);
        PageComments = new Services.PageCommentService(Db, Workspaces, Pages);
        WorkspaceArchives = new Services.WorkspaceArchiveService(Db, Workspaces, Pages);
    }

    public DatabaseSettings Settings { get; }
    public EmailSettings EmailSettings { get; }
    public AppDbContext Db { get; }
    public IAuthService Auth { get; }
    public IUserService Users { get; }
    public IUserNotificationService UserNotifications { get; }
    public INotificationService Notifications { get; }
    public IWorkspaceService Workspaces { get; }
    public IPageService Pages { get; }
    public IPageVersionService PageVersions { get; }
    public IPageChangeLogService PageChangeLogs { get; }
    public IPageAssetService PageAssets { get; }
    public IPageCommentService PageComments { get; }
    public IWorkspaceArchiveService WorkspaceArchives { get; }

    public void Dispose() => Db.Dispose();
}

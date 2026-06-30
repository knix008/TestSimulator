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
        Notifications = new Services.NotificationService(Db, EmailSettings);
        Workspaces = new Services.WorkspaceService(Db, Notifications);
        PageVersions = new Services.PageVersionService(Db, Workspaces);
        Pages = new Services.PageService(Db, Workspaces, PageVersions, Notifications);
    }

    public DatabaseSettings Settings { get; }
    public EmailSettings EmailSettings { get; }
    public AppDbContext Db { get; }
    public IAuthService Auth { get; }
    public IUserService Users { get; }
    public INotificationService Notifications { get; }
    public IWorkspaceService Workspaces { get; }
    public IPageService Pages { get; }
    public IPageVersionService PageVersions { get; }

    public void Dispose() => Db.Dispose();
}

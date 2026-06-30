using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win;

internal static class LocalizationDisplay
{
    public static string FormatUserRole(UserRole role) =>
        Localization.Get(role == UserRole.Admin ? K.RoleAdmin : K.RoleUser);

    public static string FormatWorkspaceMemberRole(WorkspaceMemberRole role) =>
        Localization.Get(role == WorkspaceMemberRole.Editor ? K.MemberRoleEditor : K.MemberRoleViewer);

    public static string DatabaseProvider(DatabaseProviderType provider) =>
        DatabaseSettings.GetProviderDisplayName(provider);
}

internal sealed class RoleListItem
{
    public RoleListItem(UserRole role) => Role = role;

    public UserRole Role { get; }
    public string DisplayName => LocalizationDisplay.FormatUserRole(Role);

    public override string ToString() => DisplayName;
}

internal sealed class MemberRoleListItem
{
    public MemberRoleListItem(WorkspaceMemberRole role) => Role = role;

    public WorkspaceMemberRole Role { get; }
    public string DisplayName => LocalizationDisplay.FormatWorkspaceMemberRole(Role);

    public override string ToString() => DisplayName;
}

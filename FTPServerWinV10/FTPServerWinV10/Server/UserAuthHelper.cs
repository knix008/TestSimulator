namespace FTPServerWinV10.Server
{
    public static class UserAuthHelper
    {
        public static bool TryAuthenticate(
            string username,
            string? password,
            bool allowAnonymous,
            IReadOnlyList<UserEntry> users,
            out SessionPermissions permissions)
        {
            permissions = SessionPermissions.DenyAll;
            if (string.IsNullOrWhiteSpace(username))
                return false;

            if (allowAnonymous &&
                username.Equals("anonymous", StringComparison.OrdinalIgnoreCase))
            {
                permissions = SessionPermissions.Anonymous;
                return true;
            }

            var user = users.FirstOrDefault(u =>
                u.Username.Equals(username, StringComparison.OrdinalIgnoreCase));
            if (user == null || user.Password != (password ?? ""))
                return false;

            permissions = new SessionPermissions(user.CanRead, user.CanWrite);
            return permissions.CanRead || permissions.CanWrite;
        }
    }
}

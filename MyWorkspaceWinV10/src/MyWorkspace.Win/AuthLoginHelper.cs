using MyWorkspace.Core.Entities;
using MyWorkspace.Win.Forms;

namespace MyWorkspace.Win;

internal static class AuthLoginHelper
{
    public static bool TryLogin(IWin32Window? owner, string username, string password, out User? user, out string errorMessage)
    {
        user = null;
        errorMessage = string.Empty;

        if (!AppConfig.TryBootstrapForStartup(out var bootstrapError))
        {
            AppConfig.TryInitialize(out var initError);
            var details = !string.IsNullOrWhiteSpace(initError) ? initError
                : !string.IsNullOrWhiteSpace(bootstrapError) ? bootstrapError
                : Localization.Get(K.DbConnectionFailedGeneric);

            if (owner != null)
            {
                var summary = details.Split('\n', '\r')[0];
                var message = $"{Localization.TranslateServiceMessage(summary)}\n\n{Localization.Get(K.DbConnectionRequiresAdmin)}";
                ErrorDetailForm.Show(owner, Localization.Get(K.DbConnectionError), message, details);
            }

            errorMessage = Localization.TranslateServiceMessage(details.Split('\n', '\r')[0]);
            return false;
        }

        if (AppConfig.IsDatabaseConnectionDisabled || AppConfig.Services == null)
        {
            errorMessage = Localization.Get(K.DbConnectionDisconnectedLogin);
            return false;
        }

        try
        {
            var result = AppConfig.Services.Auth.Login(username, password);
            if (!result.Success)
            {
                errorMessage = Localization.TranslateServiceMessage(result.Message);
                return false;
            }

            user = AppConfig.Services.Users.GetById(result.User!.Id) ?? result.User;
            return true;
        }
        catch (Exception ex)
        {
            if (owner != null)
                ErrorDetailForm.Show(owner, Localization.Get(K.LoginError), ex);

            errorMessage = Localization.TranslateServiceMessage(ex.Message);
            return false;
        }
    }
}

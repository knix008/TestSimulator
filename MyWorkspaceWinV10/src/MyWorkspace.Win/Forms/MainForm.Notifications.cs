namespace MyWorkspace.Win.Forms;

using MyWorkspace.Core.Models;

public partial class MainForm
{
    private const string NavNotificationsId = "notifications";

    private NotificationsPopupForm? _notificationsPopup;
    private System.Windows.Forms.Timer? _notificationRefreshTimer;

    private void InitializeNotificationsNav()
    {
        navRail.AddBottomCustom(NavNotificationsId, "bell_off", K.TipMenuNotifications, OnNotificationsNavClick);

        _notificationRefreshTimer = new System.Windows.Forms.Timer(components) { Interval = 60_000 };
        _notificationRefreshTimer.Tick += (_, _) => RefreshNotificationBadge();

        _notificationsPopup = new NotificationsPopupForm();
        _notificationsPopup.MarkAllReadRequested += (_, _) => MarkAllNotificationsRead();
        _notificationsPopup.DeleteAllRequested += (_, _) => DeleteAllNotifications();
        _notificationsPopup.NotificationSelected += (_, item) => OnNotificationSelected(item);
        _notificationsPopup.NotificationMarkReadRequested += (_, item) => MarkNotificationRead(item);
        _notificationsPopup.NotificationDeleteRequested += (_, item) => DeleteNotification(item);
        _notificationsPopup.FormClosed += (_, _) => ExitEditorOverlay();
        _notificationsPopup.VisibleChanged += (_, _) =>
        {
            if (!_notificationsPopup!.Visible)
                ExitEditorOverlay();
        };
    }

    private void OnNotificationsNavClick(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (_notificationsPopup != null && _notificationsPopup.Visible)
        {
            _notificationsPopup.Hide();
            return;
        }

        ShowNotificationsPopup();
    }

    private void ShowNotificationsPopup()
    {
        if (!SessionContext.IsLoggedIn || _notificationsPopup == null)
            return;

        var button = navRail.GetBottomButton(NavNotificationsId);
        if (button == null)
            return;

        RefreshNotificationsPopup();
        _notificationsPopup.ApplyLocalization();
        _notificationsPopup.ApplyTheme();

        EnterEditorOverlay();
        var anchor = button.PointToScreen(new Point(button.Width, 0));
        _notificationsPopup.ShowAt(anchor, button.Height);
    }

    private void RefreshNotificationsPopup()
    {
        if (!SessionContext.IsLoggedIn || _notificationsPopup == null)
            return;

        var items = AppConfig.Services.UserNotifications.GetRecent(SessionContext.CurrentUser);
        _notificationsPopup.SetNotifications(items);
    }

    private void OnNotificationSelected(UserNotificationListItem item)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        MarkNotificationRead(item, refreshPopup: false);
        _notificationsPopup?.Hide();

        if (item.PageId is int pageId)
        {
            try
            {
                if (AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId) != null)
                    _ = OpenPageTabAsync(pageId);
            }
            catch
            {
                // Ignore navigation failures for deleted pages.
            }
        }
    }

    private void MarkNotificationRead(UserNotificationListItem item, bool refreshPopup = true)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        AppConfig.Services.UserNotifications.MarkRead(SessionContext.CurrentUser, item.Id);
        RefreshNotificationBadge();

        if (refreshPopup && _notificationsPopup != null && _notificationsPopup.Visible)
            RefreshNotificationsPopup();
    }

    private void DeleteNotification(UserNotificationListItem item)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        AppConfig.Services.UserNotifications.Delete(SessionContext.CurrentUser, item.Id);
        RefreshNotificationBadge();

        if (_notificationsPopup != null && _notificationsPopup.Visible)
            RefreshNotificationsPopup();
    }

    private void MarkAllNotificationsRead()
    {
        if (!SessionContext.IsLoggedIn)
            return;

        AppConfig.Services.UserNotifications.MarkAllRead(SessionContext.CurrentUser);
        RefreshNotificationBadge();

        if (_notificationsPopup != null && _notificationsPopup.Visible)
            RefreshNotificationsPopup();
    }

    private void DeleteAllNotifications()
    {
        if (!SessionContext.IsLoggedIn)
            return;

        var confirmed = MessageBox.Show(
            Localization.Get(K.NotificationsConfirmDeleteAll),
            Localization.Get(K.Confirm),
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question) == DialogResult.Yes;
        if (!confirmed)
            return;

        AppConfig.Services.UserNotifications.DeleteAll(SessionContext.CurrentUser);
        RefreshNotificationBadge();

        if (_notificationsPopup != null && _notificationsPopup.Visible)
            RefreshNotificationsPopup();
    }

    private void RefreshNotificationBadge()
    {
        if (!SessionContext.IsLoggedIn)
        {
            navRail.SetBottomBadge(NavNotificationsId, 0);
            return;
        }

        try
        {
            var unread = AppConfig.Services.UserNotifications.GetUnreadCount(SessionContext.CurrentUser);
            navRail.SetBottomBadge(NavNotificationsId, unread);
        }
        catch
        {
            navRail.SetBottomBadge(NavNotificationsId, 0);
        }
    }

    private void UpdateNotificationsForLoginState(bool loggedIn)
    {
        navRail.SetBottomCustomVisible(NavNotificationsId, loggedIn);
        if (loggedIn)
        {
            RefreshNotificationBadge();
            _notificationRefreshTimer?.Start();
            return;
        }

        _notificationRefreshTimer?.Stop();
        navRail.SetBottomBadge(NavNotificationsId, 0);
        _notificationsPopup?.Hide();
    }
}

#include "connection_dialog.h"
#include <string.h>

/* ------------------------------------------------------------------ columns */
enum {
    COL_NAME = 0,
    COL_HOST,
    COL_PORT,
    COL_PROFILE,
    N_COLS
};

struct _VncConnectionDialog {
    GtkDialog     parent;

    /* Left side: profile list */
    GtkWidget    *profile_view;
    GtkListStore *profile_store;

    /* Right side: fields */
    GtkWidget    *entry_name;
    GtkWidget    *entry_host;
    GtkWidget    *spin_port;
    GtkWidget    *entry_password;
    GtkWidget    *check_save_pass;
    GtkWidget    *check_view_only;
    GtkWidget    *check_shared;
    GtkWidget    *combo_scale;

    /* Buttons */
    GtkWidget    *btn_save;
    GtkWidget    *btn_delete;
    GtkWidget    *btn_new;
    GtkWidget    *btn_connect;

    GList        *profiles;
    VncProfile   *current;
};

G_DEFINE_TYPE(VncConnectionDialog, vnc_connection_dialog, GTK_TYPE_DIALOG)

/* ------------------------------------------------------------------ helpers */

static void load_profiles_into_store(VncConnectionDialog *self) {
    gtk_list_store_clear(self->profile_store);
    for (GList *l = self->profiles; l; l = l->next) {
        VncProfile *p = l->data;
        GtkTreeIter it;
        gtk_list_store_append(self->profile_store, &it);
        gtk_list_store_set(self->profile_store, &it,
            COL_NAME, p->name,
            COL_HOST, p->host,
            COL_PORT, p->port,
            COL_PROFILE, p,
            -1);
    }
}

static void show_message(VncConnectionDialog *self,
                         GtkMessageType       type,
                         const gchar         *message) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self), GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        type, GTK_BUTTONS_CLOSE, "%s", message);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static void fields_from_profile(VncConnectionDialog *self, VncProfile *p) {
    if (!p) return;
    gtk_entry_set_text(GTK_ENTRY(self->entry_name), p->name);
    gtk_entry_set_text(GTK_ENTRY(self->entry_host), p->host);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(self->spin_port), (gdouble)p->port);
    gtk_entry_set_text(GTK_ENTRY(self->entry_password), p->password);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_save_pass), p->save_password);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_view_only), p->view_only);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_shared),    p->shared);
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_scale), (gint)p->scale_mode);
}

static void clear_fields(VncConnectionDialog *self) {
    gtk_entry_set_text(GTK_ENTRY(self->entry_name), "");
    gtk_entry_set_text(GTK_ENTRY(self->entry_host), "");
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(self->spin_port), VNC_DEFAULT_PORT);
    gtk_entry_set_text(GTK_ENTRY(self->entry_password), "");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_save_pass), FALSE);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_view_only), FALSE);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_shared), TRUE);
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_scale), (gint)VNC_SCALE_FIT);
}

static void fields_to_profile(VncConnectionDialog *self, VncProfile *p) {
    g_strlcpy(p->name,     gtk_entry_get_text(GTK_ENTRY(self->entry_name)),     PROFILE_MAX_NAME);
    g_strlcpy(p->host,     gtk_entry_get_text(GTK_ENTRY(self->entry_host)),     PROFILE_MAX_HOST);
    g_strlcpy(p->password, gtk_entry_get_text(GTK_ENTRY(self->entry_password)), PROFILE_MAX_PASS);
    p->port        = (gint)gtk_spin_button_get_value(GTK_SPIN_BUTTON(self->spin_port));
    p->save_password = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(self->check_save_pass));
    p->view_only   = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(self->check_view_only));
    p->shared      = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(self->check_shared));
    p->scale_mode  = (VncScaleMode)gtk_combo_box_get_active(GTK_COMBO_BOX(self->combo_scale));
}

static gboolean text_has_value(const gchar *text) {
    if (!text) return FALSE;
    while (g_ascii_isspace(*text)) text++;
    return *text != '\0';
}

static void ensure_profile_name(VncConnectionDialog *self, VncProfile *p) {
    if (p->name[0] != '\0') return;

    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    gint port = (gint)gtk_spin_button_get_value(GTK_SPIN_BUTTON(self->spin_port));
    g_snprintf(p->name, PROFILE_MAX_NAME, "%s:%d",
               (host && host[0] != '\0') ? host : "VNC Profile", port);
}

static VncProfile *find_duplicate_name(VncConnectionDialog *self,
                                       const gchar         *name,
                                       VncProfile          *exclude) {
    for (GList *l = self->profiles; l; l = l->next) {
        VncProfile *p = l->data;
        if (p != exclude && g_strcmp0(p->name, name) == 0)
            return p;
    }
    return NULL;
}

static gboolean save_current_profile(VncConnectionDialog *self) {
    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    VncProfile tmp = {0};

    if (!text_has_value(host)) {
        show_message(self, GTK_MESSAGE_WARNING, "Host is required before saving a profile.");
        return FALSE;
    }

    fields_to_profile(self, &tmp);
    ensure_profile_name(self, &tmp);

    if (find_duplicate_name(self, tmp.name, self->current)) {
        show_message(self, GTK_MESSAGE_WARNING, "A profile with the same name already exists.");
        return FALSE;
    }

    if (!self->current) {
        self->current = profile_new("");
        self->profiles = g_list_append(self->profiles, self->current);
    }
    memcpy(self->current, &tmp, sizeof(VncProfile));

    profile_save_all(self->profiles);
    load_profiles_into_store(self);
    show_message(self, GTK_MESSAGE_INFO, "Profile saved.");
    return TRUE;
}

static void select_profile(VncConnectionDialog *self, VncProfile *profile) {
    GtkTreeModel *model = GTK_TREE_MODEL(self->profile_store);
    GtkTreeIter iter;
    gboolean valid = gtk_tree_model_get_iter_first(model, &iter);

    while (valid) {
        VncProfile *p = NULL;
        gtk_tree_model_get(model, &iter, COL_PROFILE, &p, -1);
        if (p == profile) {
            gtk_tree_selection_select_iter(
                gtk_tree_view_get_selection(GTK_TREE_VIEW(self->profile_view)), &iter);
            return;
        }
        valid = gtk_tree_model_iter_next(model, &iter);
    }
}

static void update_action_sensitivity(VncConnectionDialog *self) {
    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    gboolean has_host = text_has_value(host);
    gtk_widget_set_sensitive(self->btn_save, has_host);
    gtk_widget_set_sensitive(self->btn_connect, has_host);
    gtk_widget_set_sensitive(self->btn_delete, self->current != NULL);
}

/* ------------------------------------------------------------------ callbacks */

static void on_profile_selection_changed(GtkTreeSelection *sel, gpointer ud) {
    VncConnectionDialog *self = VNC_CONNECTION_DIALOG(ud);
    GtkTreeModel *model;
    GtkTreeIter   iter;
    if (!gtk_tree_selection_get_selected(sel, &model, &iter)) {
        self->current = NULL;
        update_action_sensitivity(self);
        return;
    }
    gtk_tree_model_get(model, &iter, COL_PROFILE, &self->current, -1);
    if (self->current) fields_from_profile(self, self->current);
    update_action_sensitivity(self);
}

static void on_btn_new(GtkButton *btn, gpointer ud) {
    (void)btn;
    VncConnectionDialog *self = VNC_CONNECTION_DIALOG(ud);
    gint i = 1;
    gchar name[PROFILE_MAX_NAME];
    do {
        if (i == 1)
            g_strlcpy(name, "New Profile", sizeof(name));
        else
            g_snprintf(name, sizeof(name), "New Profile %d", i);
        i++;
    } while (profile_find(self->profiles, name));

    VncProfile *p = profile_new(name);
    self->profiles = g_list_append(self->profiles, p);
    load_profiles_into_store(self);
    self->current = p;
    fields_from_profile(self, p);

    /* Select the new entry */
    select_profile(self, p);
    update_action_sensitivity(self);
}

static void on_btn_save(GtkButton *btn, gpointer ud) {
    (void)btn;
    VncConnectionDialog *self = VNC_CONNECTION_DIALOG(ud);
    VncProfile *saved = self->current;
    if (save_current_profile(self))
        select_profile(self, saved ? saved : self->current);
}

static void on_btn_delete(GtkButton *btn, gpointer ud) {
    (void)btn;
    VncConnectionDialog *self = VNC_CONNECTION_DIALOG(ud);
    if (!self->current) return;
    GtkWidget *confirm = gtk_message_dialog_new(
        GTK_WINDOW(self), GTK_DIALOG_MODAL,
        GTK_MESSAGE_QUESTION, GTK_BUTTONS_YES_NO,
        "Delete profile '%s'?", self->current->name);
    if (gtk_dialog_run(GTK_DIALOG(confirm)) == GTK_RESPONSE_YES) {
        self->profiles = g_list_remove(self->profiles, self->current);
        profile_free(self->current);
        self->current = NULL;
        profile_save_all(self->profiles);
        load_profiles_into_store(self);
        clear_fields(self);
        update_action_sensitivity(self);
    }
    gtk_widget_destroy(confirm);
}

static void on_field_changed(GtkWidget *widget, gpointer ud) {
    (void)widget;
    update_action_sensitivity(VNC_CONNECTION_DIALOG(ud));
}

/* ------------------------------------------------------------------ GObject */

static void vnc_connection_dialog_finalize(GObject *obj) {
    VncConnectionDialog *self = VNC_CONNECTION_DIALOG(obj);
    g_list_free_full(self->profiles, (GDestroyNotify)profile_free);
    G_OBJECT_CLASS(vnc_connection_dialog_parent_class)->finalize(obj);
}

static void vnc_connection_dialog_class_init(VncConnectionDialogClass *klass) {
    G_OBJECT_CLASS(klass)->finalize = vnc_connection_dialog_finalize;
}

static void vnc_connection_dialog_init(VncConnectionDialog *self) {
    self->profiles = profile_load_all();

    gtk_window_set_title(GTK_WINDOW(self), "VNC Connection");
    gtk_window_set_default_size(GTK_WINDOW(self), 640, 400);
    gtk_dialog_add_button(GTK_DIALOG(self), "_Cancel", GTK_RESPONSE_CANCEL);
    self->btn_connect = gtk_dialog_add_button(GTK_DIALOG(self), "_Connect", GTK_RESPONSE_ACCEPT);
    gtk_widget_set_sensitive(self->btn_connect, FALSE);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(self));
    gtk_container_set_border_width(GTK_CONTAINER(content), 8);

    GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_box_pack_start(GTK_BOX(content), hbox, TRUE, TRUE, 0);

    /* --- left: profile list + new/delete buttons --- */
    GtkWidget *vbox_left = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_box_pack_start(GTK_BOX(hbox), vbox_left, FALSE, FALSE, 0);

    GtkWidget *lbl = gtk_label_new("<b>Profiles</b>");
    gtk_label_set_use_markup(GTK_LABEL(lbl), TRUE);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(vbox_left), lbl, FALSE, FALSE, 0);

    self->profile_store = gtk_list_store_new(N_COLS,
        G_TYPE_STRING, G_TYPE_STRING, G_TYPE_INT, G_TYPE_POINTER);
    self->profile_view  = gtk_tree_view_new_with_model(GTK_TREE_MODEL(self->profile_store));
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(self->profile_view), FALSE);
    GtkCellRenderer *r = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(self->profile_view),
        gtk_tree_view_column_new_with_attributes("Name", r, "text", COL_NAME, NULL));

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
        GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(scroll), GTK_SHADOW_IN);
    gtk_widget_set_size_request(scroll, 160, -1);
    gtk_container_add(GTK_CONTAINER(scroll), self->profile_view);
    gtk_box_pack_start(GTK_BOX(vbox_left), scroll, TRUE, TRUE, 0);

    GtkWidget *hbtn = gtk_button_box_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_button_box_set_layout(GTK_BUTTON_BOX(hbtn), GTK_BUTTONBOX_START);
    gtk_box_set_spacing(GTK_BOX(hbtn), 4);
    self->btn_new    = gtk_button_new_with_label("New");
    self->btn_delete = gtk_button_new_with_label("Delete");
    self->btn_save   = gtk_button_new_with_label("Save");
    gtk_widget_set_sensitive(self->btn_delete, FALSE);
    gtk_container_add(GTK_CONTAINER(hbtn), self->btn_new);
    gtk_container_add(GTK_CONTAINER(hbtn), self->btn_save);
    gtk_container_add(GTK_CONTAINER(hbtn), self->btn_delete);
    gtk_box_pack_start(GTK_BOX(vbox_left), hbtn, FALSE, FALSE, 0);

    /* --- right: connection fields --- */
    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 6);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_widget_set_hexpand(grid, TRUE);
    gtk_box_pack_start(GTK_BOX(hbox), grid, TRUE, TRUE, 0);

    gint row = 0;
#define ADD_ROW(label_text, widget) do { \
    GtkWidget *_l = gtk_label_new(label_text); \
    gtk_widget_set_halign(_l, GTK_ALIGN_END); \
    gtk_grid_attach(GTK_GRID(grid), _l, 0, row, 1, 1); \
    gtk_widget_set_hexpand(widget, TRUE); \
    gtk_grid_attach(GTK_GRID(grid), widget, 1, row, 1, 1); \
    row++; \
} while(0)

    self->entry_name     = gtk_entry_new();
    self->entry_host     = gtk_entry_new();
    self->spin_port      = gtk_spin_button_new_with_range(1, 65535, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(self->spin_port), VNC_DEFAULT_PORT);
    self->entry_password = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(self->entry_password), FALSE);
    self->check_save_pass = gtk_check_button_new_with_label("Save password");
    self->check_view_only = gtk_check_button_new_with_label("View only");
    self->check_shared    = gtk_check_button_new_with_label("Shared desktop");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(self->check_shared), TRUE);

    self->combo_scale = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_scale), "None (1:1)");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_scale), "Fit to window");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_scale), "Fill window");
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_scale), 1);

    ADD_ROW("Profile name:", self->entry_name);
    ADD_ROW("Host:",         self->entry_host);
    ADD_ROW("Port:",         self->spin_port);
    ADD_ROW("Password:",     self->entry_password);
    ADD_ROW("",              self->check_save_pass);
    ADD_ROW("",              self->check_view_only);
    ADD_ROW("",              self->check_shared);
    ADD_ROW("Scale mode:",   self->combo_scale);
#undef ADD_ROW

    /* Connect signals */
    g_signal_connect(gtk_tree_view_get_selection(GTK_TREE_VIEW(self->profile_view)),
        "changed", G_CALLBACK(on_profile_selection_changed), self);
    g_signal_connect(self->btn_new,    "clicked", G_CALLBACK(on_btn_new),    self);
    g_signal_connect(self->btn_save,   "clicked", G_CALLBACK(on_btn_save),   self);
    g_signal_connect(self->btn_delete, "clicked", G_CALLBACK(on_btn_delete), self);
    g_signal_connect(self->entry_name,      "changed",       G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->entry_host,      "changed",       G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->spin_port,       "value-changed", G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->entry_password,  "changed",       G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->check_save_pass, "toggled",       G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->check_view_only, "toggled",       G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->check_shared,    "toggled",       G_CALLBACK(on_field_changed), self);
    g_signal_connect(self->combo_scale,     "changed",       G_CALLBACK(on_field_changed), self);

    load_profiles_into_store(self);
    update_action_sensitivity(self);
    gtk_widget_show_all(content);
}

/* ------------------------------------------------------------------ public */

GtkWidget *vnc_connection_dialog_new(GtkWindow *parent) {
    return GTK_WIDGET(g_object_new(VNC_TYPE_CONNECTION_DIALOG,
        "transient-for", parent,
        "modal",         TRUE,
        "use-header-bar", FALSE,
        NULL));
}

VncProfile *vnc_connection_dialog_run(VncConnectionDialog *self) {
    gint response = gtk_dialog_run(GTK_DIALOG(self));
    if (response != GTK_RESPONSE_ACCEPT) return NULL;

    VncProfile *profile = self->current ? profile_copy(self->current) : profile_new("");

    /* Flush field edits into current profile */
    fields_to_profile(self, profile);
    ensure_profile_name(self, profile);
    if (!text_has_value(profile->host)) {
        profile_free(profile);
        return NULL;
    }

    return profile;
}

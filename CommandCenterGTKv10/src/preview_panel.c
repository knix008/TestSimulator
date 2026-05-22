#include "preview_panel.h"

#include "file_entry.h"

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <string.h>

typedef struct {
    GtkWidget *stack;
    GtkWidget *image;
    GtkWidget *text_view;
    GtkWidget *info_label;
} PreviewData;

static gboolean is_image_ext(const char *ext) {
    static const char *exts[] = {
        ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".ico",
        ".tiff", ".tif", ".webp", ".svg", NULL
    };
    for (int i = 0; exts[i]; i++)
        if (g_ascii_strcasecmp(ext, exts[i]) == 0) return TRUE;
    return FALSE;
}

/* GtkTextBuffer requires valid UTF-8; sanitize file bytes before insert. */
static gchar *prepare_text_for_buffer(const gchar *data, gsize len) {
    gchar *copy = g_malloc(len + 1);
    memcpy(copy, data, len);
    copy[len] = '\0';
    for (gsize i = 0; i < len; i++) {
        if (copy[i] == '\0')
            copy[i] = ' ';
    }
    return g_utf8_make_valid(copy, len);
}

static gboolean is_text_ext(const char *ext) {
    static const char *exts[] = {
        ".txt", ".c", ".h", ".cpp", ".cs", ".json", ".xml", ".html", ".htm",
        ".css", ".js", ".md", ".log", ".ini", ".cfg", ".yaml", ".yml", ".py",
        ".java", ".sh", ".bat", ".sql", ".csv", ".toml", ".gitignore", NULL
    };
    for (int i = 0; exts[i]; i++)
        if (g_ascii_strcasecmp(ext, exts[i]) == 0) return TRUE;
    return FALSE;
}

GtkWidget *preview_panel_new(void) {
    PreviewData *pd = g_new0(PreviewData, 1);

    pd->stack = gtk_stack_new();
    gtk_widget_set_margin_start(pd->stack, 8);
    gtk_widget_set_margin_end(pd->stack, 8);
    gtk_widget_set_margin_top(pd->stack, 8);
    gtk_widget_set_margin_bottom(pd->stack, 8);

    pd->image = gtk_image_new();
    gtk_stack_add_named(GTK_STACK(pd->stack), pd->image, "image");

    pd->text_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(pd->text_view), FALSE);
    gtk_text_view_set_monospace(GTK_TEXT_VIEW(pd->text_view), TRUE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(pd->text_view), GTK_WRAP_NONE);
    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(scroll), pd->text_view);
    gtk_stack_add_named(GTK_STACK(pd->stack), scroll, "text");

    pd->info_label = gtk_label_new("파일을 선택하면 미리보기가 표시됩니다.");
    gtk_label_set_justify(GTK_LABEL(pd->info_label), GTK_JUSTIFY_CENTER);
    gtk_label_set_line_wrap(GTK_LABEL(pd->info_label), TRUE);
    gtk_stack_add_named(GTK_STACK(pd->stack), pd->info_label, "info");

    gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "info");
    g_object_set_data_full(G_OBJECT(pd->stack), "preview-data", pd, g_free);
    return pd->stack;
}

void preview_panel_clear(GtkWidget *panel) {
    PreviewData *pd = g_object_get_data(G_OBJECT(panel), "preview-data");
    if (!pd) return;
    gtk_image_clear(GTK_IMAGE(pd->image));
    GtkTextBuffer *buf = gtk_text_view_get_buffer(GTK_TEXT_VIEW(pd->text_view));
    gtk_text_buffer_set_text(buf, "", -1);
    gtk_label_set_text(GTK_LABEL(pd->info_label), "파일을 선택하면 미리보기가 표시됩니다.");
    gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "info");
}

void preview_panel_show_file(GtkWidget *panel, const char *path) {
    PreviewData *pd = g_object_get_data(G_OBJECT(panel), "preview-data");
    if (!pd || !path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        preview_panel_clear(panel);
        return;
    }

    if (g_file_test(path, G_FILE_TEST_IS_DIR)) {
        preview_panel_clear(panel);
        return;
    }

    const char *ext = strrchr(path, '.');
    if (!ext) ext = "";

    if (is_image_ext(ext)) {
        GError *err = NULL;
        GdkPixbuf *pixbuf = gdk_pixbuf_new_from_file(path, &err);
        if (!pixbuf) {
            gtk_label_set_text(GTK_LABEL(pd->info_label), "이미지를 불러올 수 없습니다.");
            gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "info");
            g_clear_error(&err);
            return;
        }
        GdkPixbuf *scaled = gdk_pixbuf_scale_simple(pixbuf,
            gdk_pixbuf_get_width(pixbuf), gdk_pixbuf_get_height(pixbuf),
            GDK_INTERP_BILINEAR);
        g_object_unref(pixbuf);
        gtk_image_set_from_pixbuf(GTK_IMAGE(pd->image), scaled);
        g_object_unref(scaled);
        gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "image");
        return;
    }

    if (is_text_ext(ext)) {
        GError *err = NULL;
        gchar *contents = NULL;
        gsize len = 0;
        if (!g_file_get_contents(path, &contents, &len, &err)) {
            gtk_label_set_text(GTK_LABEL(pd->info_label), err ? err->message : "읽기 실패");
            g_clear_error(&err);
            gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "info");
            return;
        }
        if (len > 2 * 1024 * 1024) {
            char *msg = g_strdup_printf("파일이 너무 큽니다 (%s).\n미리보기는 최대 2MB까지 지원합니다.",
                                        file_entry_format_size((int64_t)len));
            gtk_label_set_text(GTK_LABEL(pd->info_label), msg);
            g_free(msg);
            g_free(contents);
            gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "info");
            return;
        }
        gchar *utf8 = prepare_text_for_buffer(contents, len);
        g_free(contents);
        GtkTextBuffer *buf = gtk_text_view_get_buffer(GTK_TEXT_VIEW(pd->text_view));
        gtk_text_buffer_set_text(buf, utf8, -1);
        g_free(utf8);
        gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "text");
        return;
    }

    GFileInfo *info = g_file_query_info(
        g_file_new_for_path(path),
        G_FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME ","
        G_FILE_ATTRIBUTE_STANDARD_SIZE ","
        G_FILE_ATTRIBUTE_TIME_MODIFIED,
        G_FILE_QUERY_INFO_NONE, NULL, NULL);

    if (info) {
        const char *display = g_file_info_get_display_name(info);
        goffset size = g_file_info_get_size(info);
        guint64 mod = g_file_info_get_attribute_uint64(
            info, G_FILE_ATTRIBUTE_TIME_MODIFIED);
        char *mod_str = g_strdup_printf("%llu", (unsigned long long)mod);
        char *size_str = file_entry_format_size(size);
        char *text = g_strdup_printf(
            "%s\n\n종류: %s\n크기: %s\n수정: %s",
            display ? display : path,
            ext[0] ? ext + 1 : "파일",
            size_str, mod_str ? mod_str : "");
        gtk_label_set_text(GTK_LABEL(pd->info_label), text);
        g_free(text);
        g_free(size_str);
        g_free(mod_str);
        g_object_unref(info);
    }
    gtk_stack_set_visible_child_name(GTK_STACK(pd->stack), "info");
}

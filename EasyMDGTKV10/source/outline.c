/**
 * EasyMD GTK
 * outline.c - GtkTreeView adapter.
 *
 * Heading parsing lives in mdcore. This file only translates the parsed
 * MDHeading[] into a GtkTreeStore hierarchy and renders an icon next to
 * each heading title.
 */
#include "outline.h"

#include "mdcore.h"
#include "utils.h"

/* Pick the shared EasyMD heading icon path (resources/hN.svg) for outline rows. */
static gchar *icon_path_for_level(int level) {
    return utils_heading_icon_path(level);
}

static void outline_icon_cell_data_func(GtkTreeViewColumn *col,
                                        GtkCellRenderer   *renderer,
                                        GtkTreeModel      *model,
                                        GtkTreeIter       *iter,
                                        gpointer           user_data) {
    (void)col;
    (void)user_data;
    gchar *path = NULL;
    gtk_tree_model_get(model, iter, OUTLINE_COL_ICON, &path, -1);
    if (path) {
        GdkPixbuf *pb = gdk_pixbuf_new_from_file_at_scale(
            path, 22, 22, TRUE, NULL);
        g_object_set(renderer, "pixbuf", pb, NULL);
        if (pb) g_object_unref(pb);
        g_free(path);
    } else {
        g_object_set(renderer, "pixbuf", NULL, NULL);
    }
}

void outline_init(GtkTreeView *tv) {
    g_return_if_fail(tv);

    GtkTreeStore *store = gtk_tree_store_new(OUTLINE_N_COLS,
                                             G_TYPE_STRING,  /* title */
                                             G_TYPE_INT,     /* line  */
                                             G_TYPE_INT,     /* level */
                                             G_TYPE_STRING); /* icon  */
    gtk_tree_view_set_model(tv, GTK_TREE_MODEL(store));
    g_object_unref(store);

    /* One column with two cell renderers: [icon] [title]. */
    GtkTreeViewColumn *col = gtk_tree_view_column_new();
    gtk_tree_view_column_set_title(col, "문서 구조");
    gtk_tree_view_column_set_expand(col, TRUE);

    GtkCellRenderer *icon_r = gtk_cell_renderer_pixbuf_new();
    gtk_tree_view_column_pack_start(col, icon_r, FALSE);
    gtk_tree_view_column_set_cell_data_func(col, icon_r,
        outline_icon_cell_data_func, NULL, NULL);

    GtkCellRenderer *text_r = gtk_cell_renderer_text_new();
    g_object_set(text_r, "ypad", 6, "xpad", 10, "font", "Sans Bold 11", NULL);
    gtk_tree_view_column_pack_start(col, text_r, TRUE);
    gtk_tree_view_column_add_attribute(col, text_r, "text", OUTLINE_COL_TITLE);

    gtk_tree_view_append_column(tv, col);
    gtk_tree_view_set_headers_visible(tv, FALSE);
    gtk_tree_view_set_enable_tree_lines(tv, TRUE);
    gtk_tree_view_set_show_expanders(tv, TRUE);

    // Modern look: alternating row colors
    gtk_widget_set_name(GTK_WIDGET(tv), "outline-treeview");
    GtkStyleContext *context = gtk_widget_get_style_context(GTK_WIDGET(tv));
    gtk_style_context_add_class(context, "data-table");
}

void outline_update(GtkTreeView *tv, const char *markdown) {
    g_return_if_fail(tv);
    GtkTreeStore *store = GTK_TREE_STORE(gtk_tree_view_get_model(tv));
    g_return_if_fail(store);

    gtk_tree_store_clear(store);

    int        count = 0;
    MDHeading *list  = mdcore_parse_outline(markdown, &count);
    if (!list || count <= 0) return;

    /* parent_iter[level] holds the most recent heading at `level`. */
    GtkTreeIter parent_iter[7];
    gboolean    parent_valid[7] = { FALSE };

    for (int i = 0; i < count; i++) {
        const MDHeading *h = &list[i];

        /* Find nearest shallower heading as parent. */
        GtkTreeIter *parent = NULL;
        for (int p = h->level - 1; p >= 1; p--) {
            if (parent_valid[p]) { parent = &parent_iter[p]; break; }
        }

        GtkTreeIter cur;
        gtk_tree_store_append(store, &cur, parent);
        gchar *icon_path = icon_path_for_level(h->level);
        gtk_tree_store_set(store, &cur,
                           OUTLINE_COL_TITLE, h->title,
                           OUTLINE_COL_LINE,  h->line,
                           OUTLINE_COL_LEVEL, h->level,
                           OUTLINE_COL_ICON,  icon_path,
                           -1);
        g_free(icon_path);

        parent_iter [h->level] = cur;
        parent_valid[h->level] = TRUE;
        for (int j = h->level + 1; j < 7; j++) parent_valid[j] = FALSE;
    }

    mdcore_free_outline(list, count);
    gtk_tree_view_expand_all(tv);
}

int outline_get_line_at(GtkTreeView *tv, GtkTreeIter *iter) {
    g_return_val_if_fail(tv && iter, -1);
    GtkTreeModel *m = gtk_tree_view_get_model(tv);
    int line = -1;
    gtk_tree_model_get(m, iter, OUTLINE_COL_LINE, &line, -1);
    return line;
}

/**
 * EasyMD GTK
 * fileio.c - GTK file chooser dialogs + raw I/O wrappers.
 */
#define _POSIX_C_SOURCE 200809L

#include "fileio.h"
#include "fileio_core.h"
#include "mdcore.h"

#include <glib/gstdio.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>
#include <zlib.h>

/* =====================================================================
 * GtkFileChooserDialog helpers
 * ===================================================================== */

static GtkWidget *fc_create_dialog(GtkWindow *parent,
                                   const gchar *title,
                                   GtkFileChooserAction action,
                                   const gchar *accept_label) {
    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        title, parent, action,
        "취소",   GTK_RESPONSE_CANCEL,
        accept_label, GTK_RESPONSE_ACCEPT,
        NULL);

    gtk_window_set_default_size(GTK_WINDOW(dlg), 720, 520);
    gtk_dialog_set_default_response(GTK_DIALOG(dlg), GTK_RESPONSE_ACCEPT);

    if (action == GTK_FILE_CHOOSER_ACTION_SAVE)
        gtk_file_chooser_set_do_overwrite_confirmation(
            GTK_FILE_CHOOSER(dlg), TRUE);

    GtkWidget *accept = gtk_dialog_get_widget_for_response(
        GTK_DIALOG(dlg), GTK_RESPONSE_ACCEPT);
    if (accept)
        gtk_style_context_add_class(
            gtk_widget_get_style_context(accept), "suggested-action");

    return dlg;
}

static void fc_set_folder(GtkFileChooser *chooser, const gchar *dir) {
    if (dir && *dir)
        gtk_file_chooser_set_current_folder(chooser, dir);
    else
        gtk_file_chooser_set_current_folder(chooser, g_get_home_dir());
}

static void fc_set_filename(GtkFileChooser *chooser, const gchar *name) {
    if (name && *name)
        gtk_file_chooser_set_current_name(chooser, name);
}

static void fc_add_markdown_filter(GtkFileChooser *chooser) {
    GtkFileFilter *md = gtk_file_filter_new();
    gtk_file_filter_set_name(md, "Markdown 파일 (*.md)");
    gtk_file_filter_add_pattern(md, "*.md");
    gtk_file_filter_add_mime_type(md, "text/markdown");
    gtk_file_chooser_add_filter(chooser, md);

    GtkFileFilter *all = gtk_file_filter_new();
    gtk_file_filter_set_name(all, "모든 파일");
    gtk_file_filter_add_pattern(all, "*");
    gtk_file_chooser_add_filter(chooser, all);

    gtk_file_chooser_set_filter(chooser, md);
}

static void fc_add_all_files_filter(GtkFileChooser *chooser) {
    GtkFileFilter *all = gtk_file_filter_new();
    gtk_file_filter_set_name(all, "모든 파일");
    gtk_file_filter_add_pattern(all, "*");
    gtk_file_chooser_add_filter(chooser, all);
    gtk_file_chooser_set_filter(chooser, all);
}

static gchar *fc_ensure_md_extension(const gchar *path) {
    if (!path || !*path)
        return NULL;

    const gchar *dot = strrchr(path, '.');
    const gchar *slash = strrchr(path, G_DIR_SEPARATOR);
    if (dot && (!slash || dot > slash))
        return g_strdup(path);

    return g_strconcat(path, ".md", NULL);
}

/* =====================================================================
 * Public API
 * ===================================================================== */

gboolean fileio_open_dialog(GtkWindow *parent, gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    GtkWidget *dlg = fc_create_dialog(
        parent, "Markdown 파일 열기", GTK_FILE_CHOOSER_ACTION_OPEN, "열기");
    fc_add_markdown_filter(GTK_FILE_CHOOSER(dlg));
    fc_set_folder(GTK_FILE_CHOOSER(dlg), g_get_home_dir());

    gboolean ok = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        gchar *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (path && g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
            *out_path = path;
            ok = TRUE;
        } else {
            g_free(path);
        }
    }

    gtk_widget_destroy(dlg);
    return ok;
}

gboolean fileio_save_dialog(GtkWindow *parent,
                            const gchar *current_path,
                            gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    gchar *start_dir = NULL;
    gchar *start_name = NULL;

    if (current_path && *current_path) {
        start_dir  = g_path_get_dirname(current_path);
        start_name = g_path_get_basename(current_path);
    } else {
        start_dir  = g_strdup(g_get_home_dir());
        start_name = g_strdup("untitled.md");
    }

    GtkWidget *dlg = fc_create_dialog(
        parent, "Markdown 파일 저장", GTK_FILE_CHOOSER_ACTION_SAVE, "저장");
    fc_add_markdown_filter(GTK_FILE_CHOOSER(dlg));
    fc_set_folder(GTK_FILE_CHOOSER(dlg), start_dir);
    fc_set_filename(GTK_FILE_CHOOSER(dlg), start_name);

    gboolean ok = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        gchar *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (path) {
            *out_path = fc_ensure_md_extension(path);
            g_free(path);
            ok = (*out_path != NULL);
        }
    }

    gtk_widget_destroy(dlg);
    g_free(start_dir);
    g_free(start_name);
    return ok;
}

gboolean fileio_save_as_dialog(GtkWindow *parent,
                               const gchar *title,
                               const gchar *default_name,
                               const gchar *start_dir,
                               gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    GtkWidget *dlg = fc_create_dialog(
        parent, title, GTK_FILE_CHOOSER_ACTION_SAVE, "저장");
    fc_add_all_files_filter(GTK_FILE_CHOOSER(dlg));
    fc_set_folder(GTK_FILE_CHOOSER(dlg),
                  (start_dir && *start_dir) ? start_dir : g_get_home_dir());
    fc_set_filename(GTK_FILE_CHOOSER(dlg), default_name);

    gboolean ok = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        gchar *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (path) {
            *out_path = path;
            ok = TRUE;
        }
    }

    gtk_widget_destroy(dlg);
    return ok;
}

/* =====================================================================
 * HTML export
 * ===================================================================== */

/* HTML document wrapper: split into head and tail to avoid printf escaping. */
static const gchar HTML_HEAD[] =
    "<!DOCTYPE html>\n"
    "<html lang=\"ko\">\n"
    "<head>\n"
    "<meta charset=\"UTF-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
    "<title>EasyMD Export</title>\n"
    "<style>\n"
    "  body { font-family: 'Noto Sans', sans-serif; max-width: 860px;"
    "         margin: 2em auto; padding: 0 1.5em; color: #1e1e2e;"
    "         background: #ffffff; line-height: 1.7; }\n"
    "  h1,h2,h3,h4,h5,h6 { color: #2a2a6a; margin-top: 1.4em; }\n"
    "  h1 { border-bottom: 2px solid #4444bb; padding-bottom: 0.3em; }\n"
    "  h2 { border-bottom: 1px solid #d0d0e8; padding-bottom: 0.2em; }\n"
    "  a  { color: #4444bb; }\n"
    "  pre { background: #f4f4f8; padding: 1em; border-radius: 6px;"
    "        overflow-x: auto; border: 1px solid #ddd; }\n"
    "  code { background: #f0f0f8; padding: 0.15em 0.4em;"
    "         border-radius: 3px; font-size: 0.9em; }\n"
    "  pre code { background: transparent; padding: 0; }\n"
    "  blockquote { border-left: 4px solid #9999cc; margin-left: 0;"
    "               padding-left: 1em; color: #555; }\n"
    "  table { border-collapse: collapse; width: 100%; }\n"
    "  th,td { border: 1px solid #ccc; padding: 8px 12px; }\n"
    "  th { background: #eeeef8; font-weight: bold; }\n"
    "  tr:nth-child(even) { background: #f8f8ff; }\n"
    "  img { max-width: 100%; }\n"
    "  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }\n"
    "</style>\n"
    "</head>\n"
    "<body>\n";

static const gchar HTML_TAIL[] = "</body>\n</html>\n";

gboolean fileio_export_html(const gchar *path, const gchar *markdown,
                            GError **error) {
    char  *body = mdcore_to_html(markdown ? markdown : "");
    gchar *html = g_strconcat(HTML_HEAD, body ? body : "", HTML_TAIL, NULL);
    free(body);

    gboolean ok = fileio_core_write(path, html, error);
    g_free(html);
    return ok;
}

/* =====================================================================
 * Word export (.docx — Office Open XML ZIP package)
 * ===================================================================== */

static const gchar DOCX_CONTENT_TYPES[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n"
    "  <Default Extension=\"rels\""
    " ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n"
    "  <Default Extension=\"xml\" ContentType=\"application/xml\"/>\n"
    "  <Default Extension=\"htm\" ContentType=\"text/html\"/>\n"
    "  <Override PartName=\"/word/document.xml\""
    " ContentType=\"application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document.main+xml\"/>\n"
    "</Types>\n";

static const gchar DOCX_ROOT_RELS[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n"
    "  <Relationship Id=\"rId1\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\""
    " Target=\"word/document.xml\"/>\n"
    "</Relationships>\n";

static const gchar DOCX_DOCUMENT_RELS[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n"
    "  <Relationship Id=\"rId1\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk\""
    " Target=\"afchunk.htm\"/>\n"
    "</Relationships>\n";

static const gchar DOCX_DOCUMENT_XML[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<w:document"
    " xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\""
    " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\n"
    "  <w:body>\n"
    "    <w:altChunk r:id=\"rId1\"/>\n"
    "    <w:sectPr>\n"
    "      <w:pgSz w:w=\"12240\" w:h=\"15840\"/>\n"
    "      <w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/>\n"
    "    </w:sectPr>\n"
    "  </w:body>\n"
    "</w:document>\n";

/* Minimal ZIP writer (store only) — no external zip binary required. */
typedef struct {
    GByteArray *local;
    GByteArray *central;
    guint32     entries;
} DocxZip;

static void docx_zip_put16(GByteArray *buf, guint16 v) {
    guint8 b[2] = { (guint8)(v & 0xff), (guint8)((v >> 8) & 0xff) };
    g_byte_array_append(buf, b, 2);
}

static void docx_zip_put32(GByteArray *buf, guint32 v) {
    guint8 b[4] = {
        (guint8)(v & 0xff),
        (guint8)((v >> 8) & 0xff),
        (guint8)((v >> 16) & 0xff),
        (guint8)((v >> 24) & 0xff)
    };
    g_byte_array_append(buf, b, 4);
}

static guint32 docx_zip_crc32(const guchar *data, gsize len) {
    return (guint32)crc32(0L, data, (uInt)len);
}

static gboolean docx_zip_add(DocxZip *zip,
                            const gchar *name,
                            const gchar *data,
                            gsize len,
                            GError **error) {
    (void)error;
    if (!name || !*name) return FALSE;

    gsize name_len = strlen(name);
    if (name_len > 0xffff || len > 0xffffffffU)
        return FALSE;

    guint32 crc    = docx_zip_crc32((const guchar *)data, len);
    guint32 offset = zip->local->len;

    docx_zip_put32(zip->local, 0x04034b50U);
    docx_zip_put16(zip->local, 20);
    docx_zip_put16(zip->local, 0);
    docx_zip_put16(zip->local, 0);
    docx_zip_put16(zip->local, 0);
    docx_zip_put16(zip->local, 0);
    docx_zip_put32(zip->local, crc);
    docx_zip_put32(zip->local, (guint32)len);
    docx_zip_put32(zip->local, (guint32)len);
    docx_zip_put16(zip->local, (guint16)name_len);
    docx_zip_put16(zip->local, 0);
    g_byte_array_append(zip->local, (const guchar *)name, (guint)name_len);
    if (len > 0)
        g_byte_array_append(zip->local, (const guchar *)data, (guint)len);

    docx_zip_put32(zip->central, 0x02014b50U);
    docx_zip_put16(zip->central, 20);
    docx_zip_put16(zip->central, 20);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put32(zip->central, crc);
    docx_zip_put32(zip->central, (guint32)len);
    docx_zip_put32(zip->central, (guint32)len);
    docx_zip_put16(zip->central, (guint16)name_len);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put32(zip->central, 0);
    docx_zip_put32(zip->central, offset);
    g_byte_array_append(zip->central, (const guchar *)name, (guint)name_len);

    zip->entries++;
    return TRUE;
}

static void docx_zip_free(DocxZip *zip) {
    if (!zip) return;
    if (zip->local)   g_byte_array_unref(zip->local);
    if (zip->central) g_byte_array_unref(zip->central);
    zip->local = zip->central = NULL;
}

static gboolean docx_ensure_parent_dir(const gchar *path, GError **error) {
    gchar *dir = g_path_get_dirname(path);
    if (g_file_test(dir, G_FILE_TEST_IS_DIR)) {
        g_free(dir);
        return TRUE;
    }
    if (g_mkdir_with_parents(dir, 0755) == 0 || errno == EEXIST) {
        g_free(dir);
        return TRUE;
    }
    g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                "출력 폴더를 만들 수 없습니다: %s", dir);
    g_free(dir);
    return FALSE;
}

static gboolean docx_zip_write_file(DocxZip *zip,
                                    const gchar *outpath,
                                    GError **error) {
    GByteArray *out = g_byte_array_new();
    guint32     cd_offset = zip->local->len;

    g_byte_array_append(out, zip->local->data, zip->local->len);
    g_byte_array_append(out, zip->central->data, zip->central->len);

    docx_zip_put32(out, 0x06054b50U);
    docx_zip_put16(out, 0);
    docx_zip_put16(out, 0);
    docx_zip_put16(out, (guint16)zip->entries);
    docx_zip_put16(out, (guint16)zip->entries);
    docx_zip_put32(out, zip->central->len);
    docx_zip_put32(out, cd_offset);
    docx_zip_put16(out, 0);

    gboolean ok = g_file_set_contents(outpath,
                                      (const gchar *)out->data,
                                      (gssize)out->len,
                                      error);
    g_byte_array_unref(out);
    return ok;
}

gboolean fileio_export_word(const gchar *path, const gchar *markdown,
                            GError **error) {
    if (!docx_ensure_parent_dir(path, error))
        return FALSE;

    char *body = mdcore_to_html(markdown ? markdown : "");
    gchar *html = g_strconcat(HTML_HEAD, body ? body : "", HTML_TAIL, NULL);
    free(body);

    gsize html_len = html ? strlen(html) : 0;

    DocxZip zip = {
        g_byte_array_new(),
        g_byte_array_new(),
        0
    };

    gboolean ok =
        docx_zip_add(&zip, "[Content_Types].xml",
                     DOCX_CONTENT_TYPES, strlen(DOCX_CONTENT_TYPES), error) &&
        docx_zip_add(&zip, "_rels/.rels",
                     DOCX_ROOT_RELS, strlen(DOCX_ROOT_RELS), error) &&
        docx_zip_add(&zip, "word/document.xml",
                     DOCX_DOCUMENT_XML, strlen(DOCX_DOCUMENT_XML), error) &&
        docx_zip_add(&zip, "word/_rels/document.xml.rels",
                     DOCX_DOCUMENT_RELS, strlen(DOCX_DOCUMENT_RELS), error) &&
        docx_zip_add(&zip, "word/afchunk.htm", html, html_len, error);

    g_free(html);

    if (ok)
        ok = docx_zip_write_file(&zip, path, error);
    else if (error && !*error)
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "DOCX 패키지를 구성하지 못했습니다.");

    docx_zip_free(&zip);
    return ok;
}

/* =====================================================================
 * Raw I/O (thin wrappers around fileio_core)
 * ===================================================================== */

gchar *fileio_read_file(const gchar *path, GError **error) {
    return fileio_core_read(path, error);
}

gboolean fileio_write_file(const gchar *path,
                           const gchar *content,
                           GError **error) {
    return fileio_core_write(path, content, error);
}

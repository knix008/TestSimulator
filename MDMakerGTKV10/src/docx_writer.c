#include "docx_writer.h"

#include <cmark.h>
#include <zip.h>
#include <string.h>

/* ── unit helpers (no <math.h>) ─────────────────────────────────────── */
static int pt2hp(double pt)             { return (int)(pt * 2.0 + 0.5); }
static int in2tw(double in_)            { return (int)(in_ * 1440.0 + 0.5); }
static int lh2line(double lh)           { return (int)(lh * 240.0 + 0.5); }
static int em2tw(double em, double pt)  { return (int)(em * pt * 20.0 + 0.5); }

/* ── XML entity escaping ────────────────────────────────────────────── */
static void xml_esc(GString *s, const char *t)
{
    if (!t) return;
    for (; *t; t++) {
        switch (*t) {
        case '&': g_string_append(s, "&amp;");  break;
        case '<': g_string_append(s, "&lt;");   break;
        case '>': g_string_append(s, "&gt;");   break;
        case '"': g_string_append(s, "&quot;"); break;
        default:  g_string_append_c(s, *t);     break;
        }
    }
}

/* ── CSS font family → first Word-usable font name ──────────────────── */
static char *first_font(const char *css)
{
    if (!css || !*css) return g_strdup("Calibri");
    char *copy = g_strstrip(g_strdup(css));
    /* strip surrounding quotes */
    if (*copy == '\'' || *copy == '"') {
        char q = *copy;
        char *e = strchr(copy + 1, q);
        if (e) { *e = '\0'; char *r = g_strdup(copy + 1); g_free(copy); return r; }
    }
    /* take up to first comma */
    char *comma = strchr(copy, ',');
    if (comma) { *comma = '\0'; g_strstrip(copy); }
    /* map CSS generics */
    if (!strcmp(copy, "sans-serif"))  { g_free(copy); return g_strdup("Calibri"); }
    if (!strcmp(copy, "serif"))       { g_free(copy); return g_strdup("Times New Roman"); }
    if (!strcmp(copy, "monospace"))   { g_free(copy); return g_strdup("Courier New"); }
    return copy;
}

/* ── render context ─────────────────────────────────────────────────── */
typedef struct {
    GString  *body;
    double    font_pt;
    int       list_depth;
    gboolean  list_ordered[9];
} RCtx;

/* forward declaration */
static void render_blocks(RCtx *c, cmark_node *node);

/* ── inline run ─────────────────────────────────────────────────────── */
static void emit_run(RCtx *c, const char *text,
                     gboolean bold, gboolean italic, gboolean code)
{
    if (!text || !*text) return;
    int csz = pt2hp(c->font_pt * 0.88);
    g_string_append(c->body, "<w:r>");
    if (bold || italic || code) {
        g_string_append(c->body, "<w:rPr>");
        if (bold)   g_string_append(c->body, "<w:b/><w:bCs/>");
        if (italic) g_string_append(c->body, "<w:i/><w:iCs/>");
        if (code)   g_string_append_printf(c->body,
            "<w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\" w:cs=\"Courier New\"/>"
            "<w:sz w:val=\"%d\"/><w:szCs w:val=\"%d\"/>", csz, csz);
        g_string_append(c->body, "</w:rPr>");
    }
    g_string_append(c->body, "<w:t xml:space=\"preserve\">");
    xml_esc(c->body, text);
    g_string_append(c->body, "</w:t></w:r>\n");
}

/* ── inline tree walk ───────────────────────────────────────────────── */
static void render_inline(RCtx *c, cmark_node *node,
                          gboolean bold, gboolean italic, gboolean code)
{
    for (cmark_node *n = cmark_node_first_child(node); n; n = cmark_node_next(n)) {
        switch (cmark_node_get_type(n)) {
        case CMARK_NODE_TEXT:
            emit_run(c, cmark_node_get_literal(n), bold, italic, code);
            break;
        case CMARK_NODE_CODE:
            emit_run(c, cmark_node_get_literal(n), bold, italic, TRUE);
            break;
        case CMARK_NODE_SOFTBREAK:
            emit_run(c, " ", bold, italic, code);
            break;
        case CMARK_NODE_LINEBREAK:
            g_string_append(c->body, "<w:r><w:br/></w:r>\n");
            break;
        case CMARK_NODE_STRONG:
            render_inline(c, n, TRUE, italic, code);
            break;
        case CMARK_NODE_EMPH:
            render_inline(c, n, bold, TRUE, code);
            break;
        default:
            render_inline(c, n, bold, italic, code);
            break;
        }
    }
}

/* ── paragraph (normal or list item) ────────────────────────────────── */
static void emit_para(RCtx *c, cmark_node *node)
{
    if (c->list_depth > 0) {
        int ilvl  = c->list_depth - 1;
        int numId = c->list_ordered[ilvl] ? 2 : 1;
        g_string_append_printf(c->body,
            "<w:p><w:pPr>"
            "<w:pStyle w:val=\"ListParagraph\"/>"
            "<w:numPr>"
            "<w:ilvl w:val=\"%d\"/>"
            "<w:numId w:val=\"%d\"/>"
            "</w:numPr>"
            "</w:pPr>",
            ilvl, numId);
    } else {
        g_string_append(c->body, "<w:p>");
    }
    render_inline(c, node, FALSE, FALSE, FALSE);
    g_string_append(c->body, "</w:p>\n");
}

/* ── block tree walk ────────────────────────────────────────────────── */
static void render_blocks(RCtx *c, cmark_node *node)
{
    for (cmark_node *n = cmark_node_first_child(node); n; n = cmark_node_next(n)) {
        switch (cmark_node_get_type(n)) {

        case CMARK_NODE_PARAGRAPH:
            emit_para(c, n);
            break;

        case CMARK_NODE_HEADING: {
            int lvl = cmark_node_get_heading_level(n);
            g_string_append_printf(c->body,
                "<w:p><w:pPr><w:pStyle w:val=\"Heading%d\"/></w:pPr>", lvl);
            render_inline(c, n, FALSE, FALSE, FALSE);
            g_string_append(c->body, "</w:p>\n");
            break;
        }

        case CMARK_NODE_CODE_BLOCK: {
            const char *lit = cmark_node_get_literal(n);
            int csz = pt2hp(c->font_pt * 0.88);
            char **lines = g_strsplit(lit ? lit : "", "\n", -1);
            for (int i = 0; lines[i]; i++) {
                if (!lines[i + 1] && *lines[i] == '\0') break;
                g_string_append_printf(c->body,
                    "<w:p><w:pPr><w:pStyle w:val=\"CodeBlock\"/></w:pPr>"
                    "<w:r><w:rPr>"
                    "<w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\" w:cs=\"Courier New\"/>"
                    "<w:sz w:val=\"%d\"/><w:szCs w:val=\"%d\"/>"
                    "</w:rPr><w:t xml:space=\"preserve\">", csz, csz);
                xml_esc(c->body, lines[i]);
                g_string_append(c->body, "</w:t></w:r></w:p>\n");
            }
            g_strfreev(lines);
            break;
        }

        case CMARK_NODE_LIST: {
            int depth = c->list_depth;
            if (depth < 9) {
                c->list_ordered[depth] =
                    (cmark_node_get_list_type(n) == CMARK_ORDERED_LIST);
                c->list_depth++;
                render_blocks(c, n);
                c->list_depth--;
            }
            break;
        }

        case CMARK_NODE_ITEM:
            render_blocks(c, n);
            break;

        case CMARK_NODE_BLOCK_QUOTE: {
            for (cmark_node *qn = cmark_node_first_child(n); qn; qn = cmark_node_next(qn)) {
                if (cmark_node_get_type(qn) == CMARK_NODE_PARAGRAPH) {
                    g_string_append(c->body,
                        "<w:p><w:pPr><w:pStyle w:val=\"BlockQuote\"/></w:pPr>");
                    render_inline(c, qn, FALSE, TRUE, FALSE);
                    g_string_append(c->body, "</w:p>\n");
                }
            }
            break;
        }

        case CMARK_NODE_THEMATIC_BREAK:
            g_string_append(c->body,
                "<w:p><w:pPr>"
                "<w:pBdr>"
                "<w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"AAAAAA\"/>"
                "</w:pBdr>"
                "</w:pPr></w:p>\n");
            break;

        default:
            render_blocks(c, n);
            break;
        }
    }
}

/* ── [Content_Types].xml ────────────────────────────────────────────── */
static const char CONTENT_TYPES[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
    "<Default Extension=\"rels\""
    " ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
    "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
    "<Override PartName=\"/word/document.xml\""
    " ContentType=\"application/vnd.openxmlformats-officedocument"
    ".wordprocessingml.document.main+xml\"/>"
    "<Override PartName=\"/word/styles.xml\""
    " ContentType=\"application/vnd.openxmlformats-officedocument"
    ".wordprocessingml.styles+xml\"/>"
    "<Override PartName=\"/word/numbering.xml\""
    " ContentType=\"application/vnd.openxmlformats-officedocument"
    ".wordprocessingml.numbering+xml\"/>"
    "</Types>";

/* ── _rels/.rels ─────────────────────────────────────────────────────── */
static const char PKG_RELS[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    "<Relationship Id=\"rId1\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\""
    " Target=\"word/document.xml\"/>"
    "</Relationships>";

/* ── word/_rels/document.xml.rels ────────────────────────────────────── */
static const char DOC_RELS[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    "<Relationship Id=\"rId1\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\""
    " Target=\"styles.xml\"/>"
    "<Relationship Id=\"rId2\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering\""
    " Target=\"numbering.xml\"/>"
    "</Relationships>";

/* ── word/numbering.xml ─────────────────────────────────────────────── */
/* numId 1 = bullet list, numId 2 = ordered list (3 levels each) */
static const char NUMBERING_XML[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    "<w:numbering xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
    /* abstract 0: bullet */
    "<w:abstractNum w:abstractNumId=\"0\">"
    "<w:multiLevelType w:val=\"multilevel\"/>"
    "<w:lvl w:ilvl=\"0\"><w:start w:val=\"1\"/><w:numFmt w:val=\"bullet\"/>"
    "<w:lvlText w:val=\"\xE2\x80\xA2\"/><w:lvlJc w:val=\"left\"/>"
    "<w:pPr><w:ind w:left=\"720\" w:hanging=\"360\"/></w:pPr></w:lvl>"
    "<w:lvl w:ilvl=\"1\"><w:start w:val=\"1\"/><w:numFmt w:val=\"bullet\"/>"
    "<w:lvlText w:val=\"\xE2\x97\xA6\"/><w:lvlJc w:val=\"left\"/>"
    "<w:pPr><w:ind w:left=\"1440\" w:hanging=\"360\"/></w:pPr></w:lvl>"
    "<w:lvl w:ilvl=\"2\"><w:start w:val=\"1\"/><w:numFmt w:val=\"bullet\"/>"
    "<w:lvlText w:val=\"\xE2\x96\xAA\"/><w:lvlJc w:val=\"left\"/>"
    "<w:pPr><w:ind w:left=\"2160\" w:hanging=\"360\"/></w:pPr></w:lvl>"
    "</w:abstractNum>"
    /* abstract 1: ordered */
    "<w:abstractNum w:abstractNumId=\"1\">"
    "<w:multiLevelType w:val=\"multilevel\"/>"
    "<w:lvl w:ilvl=\"0\"><w:start w:val=\"1\"/><w:numFmt w:val=\"decimal\"/>"
    "<w:lvlText w:val=\"%1.\"/><w:lvlJc w:val=\"left\"/>"
    "<w:pPr><w:ind w:left=\"720\" w:hanging=\"360\"/></w:pPr></w:lvl>"
    "<w:lvl w:ilvl=\"1\"><w:start w:val=\"1\"/><w:numFmt w:val=\"lowerLetter\"/>"
    "<w:lvlText w:val=\"%2.\"/><w:lvlJc w:val=\"left\"/>"
    "<w:pPr><w:ind w:left=\"1440\" w:hanging=\"360\"/></w:pPr></w:lvl>"
    "<w:lvl w:ilvl=\"2\"><w:start w:val=\"1\"/><w:numFmt w:val=\"lowerRoman\"/>"
    "<w:lvlText w:val=\"%3.\"/><w:lvlJc w:val=\"left\"/>"
    "<w:pPr><w:ind w:left=\"2160\" w:hanging=\"360\"/></w:pPr></w:lvl>"
    "</w:abstractNum>"
    "<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num>"
    "<w:num w:numId=\"2\"><w:abstractNumId w:val=\"1\"/></w:num>"
    "</w:numbering>";

/* ── word/styles.xml ────────────────────────────────────────────────── */
static char *make_styles(const AppSettings *s, const char *ff)
{
    double pt  = s->font_size_pt;
    int    sz  = pt2hp(pt);
    int    lh  = lh2line(s->line_height);
    int    spa = em2tw(s->paragraph_spacing_em, pt);

    /* heading scale: H1=2.0, H2=1.5, H3=1.2, H4-6=1.0 */
    static const double HSCALE[] = {0, 2.0, 1.5, 1.2, 1.0, 1.0, 1.0};

    GString *sb = g_string_new(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">");

    /* Normal */
    g_string_append_printf(sb,
        "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\">"
        "<w:name w:val=\"Normal\"/>"
        "<w:pPr><w:spacing w:after=\"%d\" w:line=\"%d\" w:lineRule=\"auto\"/></w:pPr>"
        "<w:rPr>"
        "<w:rFonts w:ascii=\"%s\" w:hAnsi=\"%s\" w:cs=\"%s\"/>"
        "<w:sz w:val=\"%d\"/><w:szCs w:val=\"%d\"/>"
        "</w:rPr></w:style>",
        spa, lh, ff, ff, ff, sz, sz);

    /* Headings 1–6 */
    for (int h = 1; h <= 6; h++) {
        int hsz = pt2hp(pt * HSCALE[h]);
        g_string_append_printf(sb,
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading%d\">"
            "<w:name w:val=\"heading %d\"/>"
            "<w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/>"
            "<w:pPr><w:spacing w:before=\"%d\" w:after=\"%d\""
            " w:line=\"240\" w:lineRule=\"auto\"/></w:pPr>"
            "<w:rPr>"
            "<w:rFonts w:ascii=\"%s\" w:hAnsi=\"%s\" w:cs=\"%s\"/>"
            "<w:b/><w:bCs/>"
            "<w:sz w:val=\"%d\"/><w:szCs w:val=\"%d\"/>"
            "</w:rPr></w:style>",
            h, h,
            pt2hp(pt * HSCALE[h]),   /* before */
            pt2hp(pt * HSCALE[h] * 0.25), /* after */
            ff, ff, ff,
            hsz, hsz);
    }

    /* ListParagraph */
    g_string_append_printf(sb,
        "<w:style w:type=\"paragraph\" w:styleId=\"ListParagraph\">"
        "<w:name w:val=\"List Paragraph\"/>"
        "<w:basedOn w:val=\"Normal\"/>"
        "<w:pPr><w:ind w:left=\"720\"/></w:pPr>"
        "</w:style>");

    /* CodeBlock */
    int csz = pt2hp(pt * 0.88);
    g_string_append_printf(sb,
        "<w:style w:type=\"paragraph\" w:styleId=\"CodeBlock\">"
        "<w:name w:val=\"Code Block\"/>"
        "<w:basedOn w:val=\"Normal\"/>"
        "<w:pPr>"
        "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F5F5F5\"/>"
        "<w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>"
        "</w:pPr>"
        "<w:rPr>"
        "<w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\" w:cs=\"Courier New\"/>"
        "<w:sz w:val=\"%d\"/><w:szCs w:val=\"%d\"/>"
        "</w:rPr></w:style>",
        csz, csz);

    /* BlockQuote */
    g_string_append_printf(sb,
        "<w:style w:type=\"paragraph\" w:styleId=\"BlockQuote\">"
        "<w:name w:val=\"Block Quote\"/>"
        "<w:basedOn w:val=\"Normal\"/>"
        "<w:pPr>"
        "<w:ind w:left=\"720\"/>"
        "<w:pBdr>"
        "<w:left w:val=\"single\" w:sz=\"12\" w:space=\"12\" w:color=\"CCCCCC\"/>"
        "</w:pBdr>"
        "</w:pPr>"
        "<w:rPr><w:i/><w:iCs/><w:color w:val=\"555555\"/></w:rPr>"
        "</w:style>");

    g_string_append(sb, "</w:styles>");
    return g_string_free(sb, FALSE);
}

/* ── word/document.xml ──────────────────────────────────────────────── */
static char *make_document(const char *body, const AppSettings *s)
{
    int mt = in2tw(s->margin_vertical_inch);
    int ml = in2tw(s->margin_horizontal_inch);
    return g_strdup_printf(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
        "<w:body>"
        "%s"
        "<w:sectPr>"
        "<w:pgSz w:w=\"12240\" w:h=\"15840\"/>"
        "<w:pgMar w:top=\"%d\" w:right=\"%d\" w:bottom=\"%d\" w:left=\"%d\""
        " w:header=\"720\" w:footer=\"720\" w:gutter=\"0\"/>"
        "</w:sectPr>"
        "</w:body></w:document>",
        body, mt, ml, mt, ml);
}

/* ── zip helper ─────────────────────────────────────────────────────── */
static gboolean zip_add_buf(zip_t *za, const char *name,
                             const void *data, size_t len)
{
    zip_source_t *src = zip_source_buffer(za, data, (zip_uint64_t)len, 0);
    if (!src) return FALSE;
    if (zip_file_add(za, name, src, ZIP_FL_OVERWRITE) < 0) {
        zip_source_free(src);
        return FALSE;
    }
    return TRUE;
}

/* ── public API ─────────────────────────────────────────────────────── */
gboolean docx_write(const char *markdown, const char *output_path,
                    const AppSettings *settings, GError **error)
{
    /* fallback settings */
    static const AppSettings DEF = {
        .font_family            = NULL,
        .font_size_pt           = 11.0,
        .line_height            = 1.15,
        .paragraph_spacing_em   = 0.4,
        .margin_vertical_inch   = 1.0,
        .margin_horizontal_inch = 1.25,
    };
    const AppSettings *s = settings ? settings : &DEF;

    /* ── render body ────────────────────────────────────────────────── */
    RCtx ctx = {0};
    ctx.body    = g_string_new(NULL);
    ctx.font_pt = s->font_size_pt;

    cmark_node *doc = cmark_parse_document(
        markdown ? markdown : "",
        markdown ? strlen(markdown) : 0,
        CMARK_OPT_DEFAULT);
    render_blocks(&ctx, doc);
    cmark_node_free(doc);

    char *body_xml = g_string_free(ctx.body, FALSE);

    /* ── build XML parts ────────────────────────────────────────────── */
    char *ff       = first_font(s->font_family);
    char *doc_xml  = make_document(body_xml, s);
    char *sty_xml  = make_styles(s, ff);
    g_free(body_xml);
    g_free(ff);

    /* ── package as ZIP (.docx) ─────────────────────────────────────── */
    int zip_err = 0;
    zip_t *za = zip_open(output_path, ZIP_CREATE | ZIP_TRUNCATE, &zip_err);
    if (!za) {
        zip_error_t ze;
        zip_error_init_with_code(&ze, zip_err);
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "ZIP 열기 실패: %s", zip_error_strerror(&ze));
        zip_error_fini(&ze);
        g_free(doc_xml); g_free(sty_xml);
        return FALSE;
    }

    gboolean ok =
        zip_add_buf(za, "[Content_Types].xml",          CONTENT_TYPES, sizeof(CONTENT_TYPES) - 1) &&
        zip_add_buf(za, "_rels/.rels",                  PKG_RELS,      sizeof(PKG_RELS) - 1)      &&
        zip_add_buf(za, "word/_rels/document.xml.rels", DOC_RELS,      sizeof(DOC_RELS) - 1)      &&
        zip_add_buf(za, "word/numbering.xml",           NUMBERING_XML, sizeof(NUMBERING_XML) - 1) &&
        zip_add_buf(za, "word/document.xml",            doc_xml,       strlen(doc_xml))            &&
        zip_add_buf(za, "word/styles.xml",              sty_xml,       strlen(sty_xml));

    if (!ok) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "ZIP 파일 추가 실패: %s", zip_strerror(za));
        zip_discard(za);
        g_free(doc_xml); g_free(sty_xml);
        return FALSE;
    }

    if (zip_close(za) < 0) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "ZIP 닫기 실패");
        g_free(doc_xml); g_free(sty_xml);
        return FALSE;
    }

    g_free(doc_xml);
    g_free(sty_xml);
    return TRUE;
}

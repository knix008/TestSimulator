#include "file_ops_conflict.h"

void file_ops_conflict_reset(FileOpsConflictState *state) {
    if (!state)
        return;
    state->apply_to_all = FALSE;
    state->apply_all_result = FILE_OPS_CONFLICT_OVERWRITE;
}

FileOpsConflictResult file_ops_conflict_ask(GtkWindow *parent,
                                            FileOpsConflictState *state,
                                            const char *name,
                                            const char *dest_path,
                                            gboolean dest_is_dir,
                                            gboolean is_move) {
    if (state && state->apply_to_all)
        return state->apply_all_result;

    const char *kind = dest_is_dir ? "폴더" : "파일";
    char *msg = g_strdup_printf(
        "대상에 같은 이름의 %s이(가) 이미 있습니다.\n\n"
        "  %s\n\n"
        "경로:\n  %s\n\n"
        "덮어쓰시겠습니까?",
        kind, name, dest_path);

    GtkWidget *dlg = gtk_message_dialog_new(
        parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        GTK_MESSAGE_QUESTION,
        GTK_BUTTONS_NONE,
        "%s",
        msg);
    g_free(msg);

    gtk_window_set_title(GTK_WINDOW(dlg), is_move ? "이동 — 파일 충돌" : "복사 — 파일 충돌");

    gtk_dialog_add_button(GTK_DIALOG(dlg), "_덮어쓰기", GTK_RESPONSE_ACCEPT);
    gtk_dialog_add_button(GTK_DIALOG(dlg), "_건너뛰기", GTK_RESPONSE_NO);
    gtk_dialog_add_button(GTK_DIALOG(dlg), "_취소", GTK_RESPONSE_CANCEL);
    gtk_dialog_set_default_response(GTK_DIALOG(dlg), GTK_RESPONSE_CANCEL);

    GtkWidget *apply_cb = gtk_check_button_new_with_mnemonic(
        "이후 _항목에도 동일하게 적용");
    gtk_widget_set_margin_start(apply_cb, 12);
    gtk_widget_set_margin_end(apply_cb, 12);
    gtk_widget_set_margin_bottom(apply_cb, 8);
    gtk_widget_show(apply_cb);
    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    gtk_container_add(GTK_CONTAINER(content), apply_cb);

    gint response = gtk_dialog_run(GTK_DIALOG(dlg));
    gboolean apply_all = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(apply_cb));
    gtk_widget_destroy(dlg);

    FileOpsConflictResult result;
    switch (response) {
    case GTK_RESPONSE_ACCEPT:
        result = FILE_OPS_CONFLICT_OVERWRITE;
        break;
    case GTK_RESPONSE_NO:
        result = FILE_OPS_CONFLICT_SKIP;
        break;
    default:
        result = FILE_OPS_CONFLICT_CANCEL;
        break;
    }

    if (state && apply_all && result != FILE_OPS_CONFLICT_CANCEL) {
        state->apply_to_all = TRUE;
        state->apply_all_result = result;
    }

    return result;
}

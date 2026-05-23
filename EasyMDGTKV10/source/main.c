/**
 * EasyMD GTK v1.0
 * Main Application Entry Point
 *
 * GTK3 + WebKit2 + libcmark 기반 마크다운 편집기.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <glib.h>

#include "ui.h"
#include "utils.h"

#define APP_VERSION "1.0.0"
#define APP_NAME    "EasyMD GTK"

/* In environments without working GPU acceleration (typical inside a VMware /
 * VirtualBox / headless VM), WebKit2GTK still tries the EGL/DRI2 path and
 * spills a wall of "libEGL warning: ..." / "MESA: ZINK: failed to choose
 * pdev" / "VMware: No 3D enabled" messages before silently falling back to
 * software rendering.
 *
 * We pre-set a few well-known WebKit / Mesa env vars to:
 *   1) skip the GPU probe entirely (so the warnings don't appear), and
 *   2) force pure software rendering for the WebView.
 *
 * Each var is only set if NOT already in the environment, so users can
 * override us by exporting their own value (e.g. EASYMD_FORCE_GL=1 to
 * keep the GPU path when running on a real desktop). */
static void easymd_quiet_software_rendering(void) {
    if (g_getenv("EASYMD_FORCE_GL")) return;

    /* Tell WebKit2GTK to skip its accelerated compositing pipeline. */
    g_setenv("WEBKIT_DISABLE_COMPOSITING_MODE", "1", FALSE);
    /* Newer WebKit (2.42+) uses a DMA-BUF renderer that also probes EGL. */
    g_setenv("WEBKIT_DISABLE_DMABUF_RENDERER",  "1", FALSE);
    /* Make Mesa's GL stack stay on llvmpipe (software) without retrying GPU. */
    g_setenv("LIBGL_ALWAYS_SOFTWARE",           "1", FALSE);
    /* Avoid the ZINK Vulkan→GL backend, which is what spams "failed to
     * choose pdev" inside VMware guests. */
    g_setenv("MESA_LOADER_DRIVER_OVERRIDE",     "swrast", FALSE);
}

/* Search for example/example.md relative to the executable and cwd.
 * Returns a newly-allocated path string, or NULL if not found. */
static gchar *find_example_doc(const char *argv0) {
    /* 1. Current working directory (matches "make run" from project root). */
    if (g_file_test("example/example.md", G_FILE_TEST_IS_REGULAR))
        return g_strdup("example/example.md");

    /* 2. Beside the executable (covers installed / out-of-tree builds). */
    gchar *resolved = argv0 ? g_find_program_in_path(argv0) : NULL;
    gchar *exe_dir  = g_path_get_dirname(resolved ? resolved : (argv0 ? argv0 : "."));
    gchar *path     = g_build_filename(exe_dir, "example", "example.md", NULL);
    g_free(exe_dir);
    g_free(resolved);

    if (g_file_test(path, G_FILE_TEST_IS_REGULAR))
        return path;

    g_free(path);
    return NULL;
}

static void print_usage(const char *prog) {
    printf("%s v%s\n", APP_NAME, APP_VERSION);
    printf("Usage: %s [OPTIONS] [FILE.md]\n\n", prog);
    printf("Options:\n");
    printf("  -h, --help       Show this help message\n");
    printf("  -v, --version    Show version information\n");
    printf("\n");
    printf("Examples:\n");
    printf("  %s                       Launch GUI\n", prog);
    printf("  %s README.md             Open README.md on launch\n", prog);
    printf("\n");
}

static void print_version(void) {
    printf("%s v%s\n", APP_NAME, APP_VERSION);
    printf("Built: %s %s\n", __DATE__, __TIME__);
}

int main(int argc, char *argv[]) {
    /* Must run before gtk_init / WebKit creation so the env vars take effect. */
    easymd_quiet_software_rendering();

    const char *file_arg = NULL;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return EXIT_SUCCESS;
        }
        if (strcmp(argv[i], "-v") == 0 || strcmp(argv[i], "--version") == 0) {
            print_version();
            return EXIT_SUCCESS;
        }
        if (argv[i][0] == '-') {
            fprintf(stderr, "Unknown option: %s\n", argv[i]);
            print_usage(argv[0]);
            return EXIT_FAILURE;
        }
        file_arg = argv[i];
    }

    utils_log_info("Starting %s v%s", APP_NAME, APP_VERSION);

    UIContext *ctx = ui_init(argc, argv);
    if (!ctx) {
        fprintf(stderr, "Error: Failed to initialise UI\n");
        return EXIT_FAILURE;
    }

    ui_show(ctx);

    if (file_arg) {
        utils_log_info("Loading file from CLI: %s", file_arg);
        ui_load_file(ctx, file_arg);
    } else {
        gchar *example = find_example_doc(argv[0]);
        if (example) {
            utils_log_info("Loading default example: %s", example);
            ui_load_file(ctx, example);
            g_free(example);
        }
    }

    ui_run(ctx);

    utils_log_info("Shutting down...");
    ui_cleanup(ctx);
    utils_log_info("Application terminated successfully");
    return EXIT_SUCCESS;
}

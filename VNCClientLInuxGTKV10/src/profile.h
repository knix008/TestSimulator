#pragma once

#include <glib.h>
#include "vnc_types.h"

#define PROFILE_MAX_NAME 256
#define PROFILE_MAX_HOST 256
#define PROFILE_MAX_PASS 256

typedef struct {
    gchar       name[PROFILE_MAX_NAME];
    gchar       host[PROFILE_MAX_HOST];
    gint        port;
    gboolean    save_password;
    gchar       password[PROFILE_MAX_PASS];
    gboolean    view_only;
    gboolean    shared;
    VncScaleMode scale_mode;
} VncProfile;

/* Load all profiles from disk. Returns GList of VncProfile* (caller frees). */
GList   *profile_load_all(void);

/* Save all profiles to disk. */
void     profile_save_all(GList *profiles);

/* Allocate a new profile with sensible defaults. */
VncProfile *profile_new(const gchar *name);

/* Deep-copy a profile. */
VncProfile *profile_copy(const VncProfile *src);

/* Free a profile. */
void     profile_free(VncProfile *profile);

/* Find a profile by name (returns first match, no transfer). */
VncProfile *profile_find(GList *profiles, const gchar *name);

/* Return the config directory path (caller must free). */
gchar   *profile_config_dir(void);

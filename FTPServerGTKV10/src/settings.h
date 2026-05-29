#pragma once

#include <stdbool.h>
#include <stddef.h>

#define SETTINGS_VERSION  2
#define MAX_FOLDERS       64
#define MAX_USERS         256
#define MAX_PATH_LEN      4096
#define MAX_NAME_LEN      256

typedef struct {
    char virtual_name[MAX_NAME_LEN];
    char physical_path[MAX_PATH_LEN];
} SharedFolderEntry;

typedef struct {
    char username[MAX_NAME_LEN];
    char password[MAX_NAME_LEN];
    bool can_read;
    bool can_write;
} UserEntry;

typedef struct {
    bool enable_ftp;
    bool enable_ftps;
    bool enable_sftp;
    int  ftp_port;
    int  ftps_port;
    int  sftp_port;
} ProtocolSettings;

typedef struct {
    int               settings_version;
    SharedFolderEntry folders[MAX_FOLDERS];
    int               folder_count;
    char              cert_path[MAX_PATH_LEN];
    char              cert_password[MAX_NAME_LEN];
    char              sftp_host_key_path[MAX_PATH_LEN];
    bool              allow_anonymous;
    UserEntry         users[MAX_USERS];
    int               user_count;
    int               buffer_size_kb;
    int               max_threads;
    ProtocolSettings  protocols;
} ServerSettings;

void   settings_init(ServerSettings *s);
bool   settings_save(const ServerSettings *s, const char *path);
bool   settings_load(ServerSettings *s, const char *path);

char  *settings_get_config_dir(void);   /* caller must g_free() */
char  *settings_get_default_path(void); /* caller must g_free() */

bool   settings_save_profile(const ServerSettings *s, const char *name);
bool   settings_load_profile(ServerSettings *s, const char *name);
bool   settings_delete_profile(const char *name);
char **settings_list_profiles(int *count); /* caller must settings_free_profiles() */
void   settings_free_profiles(char **profiles, int count);

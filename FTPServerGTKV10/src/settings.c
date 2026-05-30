#include "settings.h"
#include "platform.h"
#include <json-c/json.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <dirent.h>

void settings_init(ServerSettings *s) {
    memset(s, 0, sizeof(*s));
    s->settings_version     = SETTINGS_VERSION;
    s->buffer_size_kb       = 64;
    s->max_threads          = 10;
    s->protocols.enable_ftp = true;
    s->protocols.ftp_port   = 21;
    s->protocols.ftps_port  = 990;
    s->protocols.sftp_port  = 22;
}

/* ---- helpers ----------------------------------------------------------- */

static json_object *folder_to_json(const SharedFolderEntry *f) {
    json_object *o = json_object_new_object();
    json_object_object_add(o, "VirtualName",  json_object_new_string(f->virtual_name));
    json_object_object_add(o, "PhysicalPath", json_object_new_string(f->physical_path));
    return o;
}

static json_object *user_to_json(const UserEntry *u) {
    json_object *o = json_object_new_object();
    json_object_object_add(o, "Username", json_object_new_string(u->username));
    json_object_object_add(o, "Password", json_object_new_string(u->password));
    json_object_object_add(o, "CanRead",  json_object_new_boolean(u->can_read));
    json_object_object_add(o, "CanWrite", json_object_new_boolean(u->can_write));
    return o;
}

static json_object *protocols_to_json(const ProtocolSettings *p) {
    json_object *o = json_object_new_object();
    json_object_object_add(o, "EnableFtp",  json_object_new_boolean(p->enable_ftp));
    json_object_object_add(o, "EnableFtps", json_object_new_boolean(p->enable_ftps));
    json_object_object_add(o, "EnableSftp", json_object_new_boolean(p->enable_sftp));
    json_object_object_add(o, "FtpPort",    json_object_new_int(p->ftp_port));
    json_object_object_add(o, "FtpsPort",   json_object_new_int(p->ftps_port));
    json_object_object_add(o, "SftpPort",   json_object_new_int(p->sftp_port));
    return o;
}

/* ---- public functions -------------------------------------------------- */

bool settings_save(const ServerSettings *s, const char *path) {
    json_object *root = json_object_new_object();
    json_object_object_add(root, "SettingsVersion", json_object_new_int(s->settings_version));

    json_object *folders = json_object_new_array();
    for (int i = 0; i < s->folder_count; i++)
        json_object_array_add(folders, folder_to_json(&s->folders[i]));
    json_object_object_add(root, "SharedFolders", folders);

    json_object_object_add(root, "CertPath",        json_object_new_string(s->cert_path));
    json_object_object_add(root, "CertPassword",    json_object_new_string(s->cert_password));
    json_object_object_add(root, "SftpHostKeyPath", json_object_new_string(s->sftp_host_key_path));
    json_object_object_add(root, "AllowAnonymous",  json_object_new_boolean(s->allow_anonymous));

    json_object *users = json_object_new_array();
    for (int i = 0; i < s->user_count; i++)
        json_object_array_add(users, user_to_json(&s->users[i]));
    json_object_object_add(root, "Users", users);

    json_object_object_add(root, "BufferSizeKb", json_object_new_int(s->buffer_size_kb));
    json_object_object_add(root, "MaxThreads",   json_object_new_int(s->max_threads));
    json_object_object_add(root, "Protocols",    protocols_to_json(&s->protocols));

    int rc = json_object_to_file_ext(path, root,
                 JSON_C_TO_STRING_PRETTY | JSON_C_TO_STRING_NOSLASHESCAPE);
    json_object_put(root);
    return rc == 0;
}

static const char *jstr(json_object *o, const char *key) {
    json_object *v = NULL;
    if (!json_object_object_get_ex(o, key, &v)) return "";
    return json_object_get_string(v);
}
static int jint(json_object *o, const char *key, int def) {
    json_object *v = NULL;
    if (!json_object_object_get_ex(o, key, &v)) return def;
    return json_object_get_int(v);
}
static bool jbool(json_object *o, const char *key, bool def) {
    json_object *v = NULL;
    if (!json_object_object_get_ex(o, key, &v)) return def;
    return json_object_get_boolean(v);
}

bool settings_load(ServerSettings *s, const char *path) {
    json_object *root = json_object_from_file(path);
    if (!root) return false;

    settings_init(s);
    s->settings_version = jint(root, "SettingsVersion", SETTINGS_VERSION);

    json_object *folders = NULL;
    if (json_object_object_get_ex(root, "SharedFolders", &folders)) {
        int n = (int)json_object_array_length(folders);
        s->folder_count = n < MAX_FOLDERS ? n : MAX_FOLDERS;
        for (int i = 0; i < s->folder_count; i++) {
            json_object *f = json_object_array_get_idx(folders, i);
            str_copy(s->folders[i].virtual_name,  jstr(f, "VirtualName"),  MAX_NAME_LEN);
            str_copy(s->folders[i].physical_path, jstr(f, "PhysicalPath"), MAX_PATH_LEN);
        }
    }

    str_copy(s->cert_path,           jstr(root, "CertPath"),        MAX_PATH_LEN);
    str_copy(s->cert_password,       jstr(root, "CertPassword"),    MAX_NAME_LEN);
    str_copy(s->sftp_host_key_path,  jstr(root, "SftpHostKeyPath"), MAX_PATH_LEN);
    s->allow_anonymous = jbool(root, "AllowAnonymous", false);
    s->buffer_size_kb  = jint(root, "BufferSizeKb", 64);
    s->max_threads     = jint(root, "MaxThreads", 1);

    json_object *users = NULL;
    if (json_object_object_get_ex(root, "Users", &users)) {
        int n = (int)json_object_array_length(users);
        s->user_count = n < MAX_USERS ? n : MAX_USERS;
        for (int i = 0; i < s->user_count; i++) {
            json_object *u = json_object_array_get_idx(users, i);
            str_copy(s->users[i].username, jstr(u, "Username"), MAX_NAME_LEN);
            str_copy(s->users[i].password, jstr(u, "Password"), MAX_NAME_LEN);
            s->users[i].can_read  = jbool(u, "CanRead",  true);
            s->users[i].can_write = jbool(u, "CanWrite", false);
        }
    }

    json_object *proto = NULL;
    if (json_object_object_get_ex(root, "Protocols", &proto)) {
        s->protocols.enable_ftp  = jbool(proto, "EnableFtp",  true);
        s->protocols.enable_ftps = jbool(proto, "EnableFtps", false);
        s->protocols.enable_sftp = jbool(proto, "EnableSftp", false);
        s->protocols.ftp_port    = jint(proto, "FtpPort",  21);
        s->protocols.ftps_port   = jint(proto, "FtpsPort", 990);
        s->protocols.sftp_port   = jint(proto, "SftpPort", 22);
    }

    json_object_put(root);
    return true;
}

char *settings_get_config_dir(void) {
    char *base = get_config_dir();
    char *result = path_join(base, "FTPServerGTK");
    free(base);
    return result;
}

char *settings_get_default_path(void) {
    char *dir    = settings_get_config_dir();
    char *result = path_join(dir, "settings.json");
    free(dir);
    return result;
}

/* ---- profile management ----------------------------------------------- */

static char *profile_path(const char *name) {
    char *dir     = settings_get_config_dir();
    char *profdir = path_join(dir, "profiles");
    free(dir);
    make_dirs(profdir, 0700);
    char *fname = malloc(strlen(name) + 6);
    sprintf(fname, "%s.json", name);
    char *result = path_join(profdir, fname);
    free(profdir);
    free(fname);
    return result;
}

bool settings_save_profile(const ServerSettings *s, const char *name) {
    char *path = profile_path(name);
    bool ok = settings_save(s, path);
    free(path);
    return ok;
}

bool settings_load_profile(ServerSettings *s, const char *name) {
    char *path = profile_path(name);
    bool ok = settings_load(s, path);
    free(path);
    return ok;
}

bool settings_delete_profile(const char *name) {
    char *path = profile_path(name);
    int rc = remove(path);
    free(path);
    return rc == 0;
}

char **settings_list_profiles(int *count) {
    char *dir   = settings_get_config_dir();
    char *pdir  = path_join(dir, "profiles");
    free(dir);

    DIR *d = opendir(pdir);
    free(pdir);
    if (!d) { *count = 0; return NULL; }

    int cap = 8, n = 0;
    char **arr = malloc(cap * sizeof(char *));

    struct dirent *ent;
    while ((ent = readdir(d))) {
        size_t len = strlen(ent->d_name);
        if (len <= 5 || strcmp(ent->d_name + len - 5, ".json") != 0) continue;
        if (n == cap) { cap *= 2; arr = realloc(arr, cap * sizeof(char *)); }
        arr[n++] = strndup(ent->d_name, len - 5);
    }
    closedir(d);

    *count = n;
    return arr;
}

void settings_free_profiles(char **profiles, int count) {
    for (int i = 0; i < count; i++) free(profiles[i]);
    free(profiles);
}

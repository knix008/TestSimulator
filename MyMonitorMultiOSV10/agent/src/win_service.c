#ifdef _WIN32

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include "mmon_platform.h"

#include <stdio.h>
#include <string.h>
#include <windows.h>

#define SVC_NAME  "MyMonitorAgent"
#define SVC_DISP  "MyMonitor Windows Agent"
#define SVC_DESC  "Collects CPU, RAM, Disk, Load and Network metrics for MyMonitor."

static SERVICE_STATUS_HANDLE g_status_handle;
static SERVICE_STATUS g_status;
static void (*g_worker)(void);

static void report(DWORD state, DWORD exit_code, DWORD wait_hint) {
    static DWORD checkpoint = 1;
    g_status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    g_status.dwCurrentState = state;
    g_status.dwWin32ExitCode = exit_code;
    g_status.dwWaitHint = wait_hint;
    g_status.dwControlsAccepted = (state == SERVICE_START_PENDING) ? 0 : SERVICE_ACCEPT_STOP;
    g_status.dwCheckPoint = (state == SERVICE_RUNNING || state == SERVICE_STOPPED) ? 0 : checkpoint++;
    if (g_status_handle) {
        SetServiceStatus(g_status_handle, &g_status);
    }
}

static void WINAPI svc_ctrl(DWORD code) {
    if (code == SERVICE_CONTROL_STOP) {
        report(SERVICE_STOP_PENDING, NO_ERROR, 3000);
        mmon_request_stop();
    }
}

static void WINAPI svc_main(DWORD argc, LPSTR *argv) {
    (void)argc;
    (void)argv;
    g_status_handle = RegisterServiceCtrlHandlerA(SVC_NAME, svc_ctrl);
    if (!g_status_handle) {
        return;
    }
    report(SERVICE_START_PENDING, NO_ERROR, 2000);
    report(SERVICE_RUNNING, NO_ERROR, 0);
    if (g_worker) {
        g_worker();
    }
    report(SERVICE_STOPPED, NO_ERROR, 0);
}

int mmon_win_service_install(const char *bin, const char *args) {
    SC_HANDLE scm;
    SC_HANDLE svc;
    char cmd[MAX_PATH * 2];
    SERVICE_DESCRIPTIONA desc;

    if (!bin || !bin[0]) {
        return -1;
    }
    if (args && args[0]) {
        _snprintf(cmd, sizeof(cmd), "\"%s\" %s", bin, args);
    } else {
        _snprintf(cmd, sizeof(cmd), "\"%s\" --service run --listen 0.0.0.0:9510", bin);
    }
    cmd[sizeof(cmd) - 1] = '\0';

    scm = OpenSCManagerA(NULL, NULL, SC_MANAGER_CREATE_SERVICE);
    if (!scm) {
        fprintf(stderr, "OpenSCManager failed (%lu). Run as Administrator.\n", GetLastError());
        return -1;
    }
    svc = CreateServiceA(
        scm, SVC_NAME, SVC_DISP, SERVICE_ALL_ACCESS, SERVICE_WIN32_OWN_PROCESS,
        SERVICE_AUTO_START, SERVICE_ERROR_NORMAL, cmd, NULL, NULL, NULL, NULL, NULL);
    if (!svc) {
        DWORD err = GetLastError();
        CloseServiceHandle(scm);
        if (err == ERROR_SERVICE_EXISTS) {
            fprintf(stderr, "service already installed\n");
            return 0;
        }
        fprintf(stderr, "CreateService failed (%lu)\n", err);
        return -1;
    }
    desc.lpDescription = SVC_DESC;
    ChangeServiceConfig2A(svc, SERVICE_CONFIG_DESCRIPTION, &desc);
    CloseServiceHandle(svc);
    CloseServiceHandle(scm);
    fprintf(stdout, "installed Windows service '%s'\n", SVC_NAME);
    fprintf(stdout, "start:  sc start %s\n", SVC_NAME);
    fprintf(stdout, "stop:   sc stop %s\n", SVC_NAME);
    return 0;
}

int mmon_win_service_uninstall(void) {
    SC_HANDLE scm = OpenSCManagerA(NULL, NULL, SC_MANAGER_CONNECT);
    SC_HANDLE svc;
    SERVICE_STATUS st;
    if (!scm) {
        fprintf(stderr, "OpenSCManager failed (%lu). Run as Administrator.\n", GetLastError());
        return -1;
    }
    svc = OpenServiceA(scm, SVC_NAME, SERVICE_STOP | DELETE);
    if (!svc) {
        fprintf(stderr, "OpenService failed (%lu)\n", GetLastError());
        CloseServiceHandle(scm);
        return -1;
    }
    ControlService(svc, SERVICE_CONTROL_STOP, &st);
    if (!DeleteService(svc)) {
        fprintf(stderr, "DeleteService failed (%lu)\n", GetLastError());
        CloseServiceHandle(svc);
        CloseServiceHandle(scm);
        return -1;
    }
    CloseServiceHandle(svc);
    CloseServiceHandle(scm);
    fprintf(stdout, "removed Windows service '%s'\n", SVC_NAME);
    return 0;
}

int mmon_win_service_run(void (*worker)(void)) {
    SERVICE_TABLE_ENTRYA table[] = {
        { SVC_NAME, svc_main },
        { NULL, NULL }
    };
    g_worker = worker;
    if (!StartServiceCtrlDispatcherA(table)) {
        fprintf(stderr, "StartServiceCtrlDispatcher failed (%lu)\n", GetLastError());
        return -1;
    }
    return 0;
}

#endif

#include "platform.h"
#include <stdio.h>
#include <stdlib.h>

#ifdef _WIN32

// Windows-specific implementations
int clock_gettime(int clk_id, struct timespec* ts) {
    if (!ts) return -1;
    
    // Validate clock ID
    if (clk_id != CLOCK_REALTIME && clk_id != CLOCK_MONOTONIC) {
        return -1; // Invalid clock ID
    }
    
    LARGE_INTEGER frequency, counter;
    
    if (!QueryPerformanceFrequency(&frequency)) {
        return -1;
    }
    
    if (!QueryPerformanceCounter(&counter)) {
        return -1;
    }
    
    ts->tv_sec = (time_t)(counter.QuadPart / frequency.QuadPart);
    ts->tv_nsec = (long)(((counter.QuadPart % frequency.QuadPart) * 1000000000) / frequency.QuadPart);
    
    return 0;
}

int nanosleep(const struct timespec* req, struct timespec* rem) {
    (void)rem; // Unused parameter
    
    DWORD ms = (DWORD)(req->tv_sec * 1000 + req->tv_nsec / 1000000);
    Sleep(ms);
    return 0;
}

int platform_mutex_init(mutex_t* mutex) {
    if (!mutex) return -1;
    InitializeCriticalSection(mutex);
    return 0;
}

int platform_mutex_destroy(mutex_t* mutex) {
    if (!mutex) return -1;
    DeleteCriticalSection(mutex);
    return 0;
}

int platform_mutex_lock(mutex_t* mutex) {
    if (!mutex) return -1;
    EnterCriticalSection(mutex);
    return 0;
}

int platform_mutex_unlock(mutex_t* mutex) {
    if (!mutex) return -1;
    LeaveCriticalSection(mutex);
    return 0;
}

int platform_cond_init(cond_t* cond) {
    if (!cond) return -1;
    InitializeConditionVariable(cond);
    return 0;
}

int platform_cond_destroy(cond_t* cond) {
    if (!cond) return -1;
    // Windows condition variables don't need explicit cleanup
    (void)cond;
    return 0;
}

int platform_cond_wait(cond_t* cond, mutex_t* mutex) {
    if (!cond || !mutex) return -1;
    return SleepConditionVariableCS(cond, mutex, INFINITE) ? 0 : -1;
}

int platform_cond_timedwait(cond_t* cond, mutex_t* mutex, const struct timespec* abstime) {
    if (!cond || !mutex || !abstime) return -1;
    struct timespec now;
    clock_gettime(CLOCK_REALTIME, &now);
    
    DWORD timeout_ms = 0;
    if (abstime->tv_sec > now.tv_sec || 
        (abstime->tv_sec == now.tv_sec && abstime->tv_nsec > now.tv_nsec)) {
        timeout_ms = (DWORD)((abstime->tv_sec - now.tv_sec) * 1000 + 
                            (abstime->tv_nsec - now.tv_nsec) / 1000000);
    }
    
    return SleepConditionVariableCS(cond, mutex, timeout_ms) ? 0 : -1;
}

int platform_cond_signal(cond_t* cond) {
    if (!cond) return -1;
    WakeConditionVariable(cond);
    return 0;
}

int platform_cond_broadcast(cond_t* cond) {
    if (!cond) return -1;
    WakeAllConditionVariable(cond);
    return 0;
}

int platform_thread_create(thread_t* thread, void* (*start_routine)(void*), void* arg) {
    if (!thread || !start_routine) return -1;
    *thread = (HANDLE)_beginthreadex(NULL, 0, (unsigned int (__stdcall *)(void*))start_routine, arg, 0, NULL);
    return (*thread != NULL) ? 0 : -1;
}

int platform_thread_join(thread_t thread, void** retval) {
    (void)retval; // Windows doesn't support return values the same way
    DWORD result = WaitForSingleObject(thread, INFINITE);
    CloseHandle(thread);
    return (result == WAIT_OBJECT_0) ? 0 : -1;
}

void platform_sleep_ms(uint32_t ms) {
    Sleep(ms);
}

void platform_sleep_until(struct timespec target_time) {
    struct timespec current_time;
    clock_gettime(CLOCK_MONOTONIC, &current_time);
    
    if (target_time.tv_sec > current_time.tv_sec || 
        (target_time.tv_sec == current_time.tv_sec && target_time.tv_nsec > current_time.tv_nsec)) {
        
        uint32_t sleep_ms = (uint32_t)((target_time.tv_sec - current_time.tv_sec) * 1000 + 
                                      (target_time.tv_nsec - current_time.tv_nsec) / 1000000);
        Sleep(sleep_ms);
    }
}

#else

// Unix/Linux pthread implementations
int platform_mutex_init(mutex_t* mutex) {
    if (!mutex) return -1;
    return pthread_mutex_init(mutex, NULL);
}

int platform_mutex_destroy(mutex_t* mutex) {
    if (!mutex) return -1;
    return pthread_mutex_destroy(mutex);
}

int platform_mutex_lock(mutex_t* mutex) {
    if (!mutex) return -1;
    return pthread_mutex_lock(mutex);
}

int platform_mutex_unlock(mutex_t* mutex) {
    if (!mutex) return -1;
    return pthread_mutex_unlock(mutex);
}

int platform_cond_init(cond_t* cond) {
    if (!cond) return -1;
    return pthread_cond_init(cond, NULL);
}

int platform_cond_destroy(cond_t* cond) {
    if (!cond) return -1;
    return pthread_cond_destroy(cond);
}

int platform_cond_wait(cond_t* cond, mutex_t* mutex) {
    if (!cond || !mutex) return -1;
    return pthread_cond_wait(cond, mutex);
}

int platform_cond_timedwait(cond_t* cond, mutex_t* mutex, const struct timespec* abstime) {
    if (!cond || !mutex || !abstime) return -1;
    return pthread_cond_timedwait(cond, mutex, abstime);
}

int platform_cond_signal(cond_t* cond) {
    if (!cond) return -1;
    return pthread_cond_signal(cond);
}

int platform_cond_broadcast(cond_t* cond) {
    if (!cond) return -1;
    return pthread_cond_broadcast(cond);
}

int platform_thread_create(thread_t* thread, void* (*start_routine)(void*), void* arg) {
    if (!thread || !start_routine) return -1;
    return pthread_create(thread, NULL, start_routine, arg);
}

int platform_thread_join(thread_t thread, void** retval) {
    return pthread_join(thread, retval);
}

void platform_sleep_ms(uint32_t ms) {
    struct timespec ts;
    ts.tv_sec = ms / 1000;
    ts.tv_nsec = (ms % 1000) * 1000000;
    nanosleep(&ts, NULL);
}

void platform_sleep_until(struct timespec target_time) {
    struct timespec current_time;
    clock_gettime(CLOCK_MONOTONIC, &current_time);
    
    if (target_time.tv_sec > current_time.tv_sec || 
        (target_time.tv_sec == current_time.tv_sec && target_time.tv_nsec > current_time.tv_nsec)) {
        
        struct timespec sleep_time;
        sleep_time.tv_sec = target_time.tv_sec - current_time.tv_sec;
        sleep_time.tv_nsec = target_time.tv_nsec - current_time.tv_nsec;
        
        if (sleep_time.tv_nsec < 0) {
            sleep_time.tv_sec--;
            sleep_time.tv_nsec += 1000000000;
        }
        
        nanosleep(&sleep_time, NULL);
    }
}

#endif

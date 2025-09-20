#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <time.h>

#ifdef __cplusplus
extern "C" {
#endif

// Platform-specific threading abstraction
#ifdef _WIN32
    #include <windows.h>
    #include <process.h>
    
    typedef HANDLE thread_t;
    typedef CRITICAL_SECTION mutex_t;
    typedef CONDITION_VARIABLE cond_t;
    
    #define THREAD_FUNC_RETURN unsigned int __stdcall
    #define THREAD_FUNC_PARAM void*
    
    // Windows doesn't have clock_gettime by default
    #ifndef CLOCK_REALTIME
        #define CLOCK_REALTIME 0
        #define CLOCK_MONOTONIC 1
    #endif
    
    int clock_gettime(int clk_id, struct timespec* ts);
    int nanosleep(const struct timespec* req, struct timespec* rem);
    
#else
    #include <pthread.h>
    #include <unistd.h>
    
    typedef pthread_t thread_t;
    typedef pthread_mutex_t mutex_t;
    typedef pthread_cond_t cond_t;
    
    #define THREAD_FUNC_RETURN void*
    #define THREAD_FUNC_PARAM void*
#endif

// Platform-abstracted threading functions
int platform_mutex_init(mutex_t* mutex);
int platform_mutex_destroy(mutex_t* mutex);
int platform_mutex_lock(mutex_t* mutex);
int platform_mutex_unlock(mutex_t* mutex);

int platform_cond_init(cond_t* cond);
int platform_cond_destroy(cond_t* cond);
int platform_cond_wait(cond_t* cond, mutex_t* mutex);
int platform_cond_timedwait(cond_t* cond, mutex_t* mutex, const struct timespec* abstime);
int platform_cond_signal(cond_t* cond);
int platform_cond_broadcast(cond_t* cond);

int platform_thread_create(thread_t* thread, void* (*start_routine)(void*), void* arg);
int platform_thread_join(thread_t thread, void** retval);

// Platform-specific sleep functions
void platform_sleep_ms(uint32_t ms);
void platform_sleep_until(struct timespec target_time);

#ifdef __cplusplus
}
#endif

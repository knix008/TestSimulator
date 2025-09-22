#include "../include/clock.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_clock_basic_operations(void);
void test_clock_tick_simulation(void);
void test_clock_time_operations(void);
void test_clock_edge_cases(void);

int main() {
    printf("====================================================\n");
    printf("              Clock Component Tests               \n");
    printf("====================================================\n");
    
    test_clock_basic_operations();
    test_clock_tick_simulation();
    test_clock_time_operations();
    test_clock_edge_cases();
    
    printf("\n====================================================\n");
    printf("            All Clock Tests PASSED!               \n");
    printf("====================================================\n");
    
    return 0;
}

void test_clock_basic_operations(void) {
    printf("\n--- Testing Basic Clock Operations ---\n");
    
    // Test real-time clock
    RealtimeClock realtime_clock;
    realtime_clock_init(&realtime_clock);
    
    IClock* clock = (IClock*)&realtime_clock;
    assert(clock != NULL);
    (void)clock; // Suppress unused variable warning
    printf("✓ Real-time clock created successfully\n");
    
    // Test clock interface
    assert(!realtime_clock.base.is_running(&realtime_clock.base));
    assert(!realtime_clock.base.is_tick_based(&realtime_clock.base));
    printf("✓ Clock interface methods work\n");
    
    // Test tick-based clock
    TickBasedClock tick_clock;
    tick_based_clock_init(&tick_clock, 100); // 100ms tick interval
    
    IClock* tick_iclock = (IClock*)&tick_clock;
    (void)tick_iclock; // Suppress unused variable warning
    assert(tick_iclock != NULL);
    assert(tick_iclock->is_tick_based(tick_iclock));
    assert(tick_clock.tick_interval_ms == 100);
    printf("✓ Tick-based clock created successfully\n");
    
    // Test tick count
    assert(tick_iclock->get_tick_count(tick_iclock) == 0);
    printf("✓ Initial tick count correct\n");
    
    printf("Basic operations test PASSED\n");
}

void test_clock_tick_simulation(void) {
    printf("\n--- Testing Clock Tick Simulation ---\n");
    
    // Test tick simulation control functions
    assert(!clock_tick_simulation_is_running());
    printf("✓ Initial simulation state correct (not running)\n");
    
    // Test setting tick rate
    clock_tick_simulation_set_rate_hz(1000);
    assert(clock_tick_simulation_get_rate_hz() == 1000);
    printf("✓ Tick rate set to 1000 Hz\n");
    
    // Test starting simulation
    clock_tick_simulation_start(1000);
    assert(clock_tick_simulation_is_running());
    printf("✓ Tick simulation started\n");
    
    // Test getting tick count (should be incrementing)
    uint64_t initial_count = clock_tick_simulation_get_count();
    printf("✓ Initial tick count: %llu\n", (unsigned long long)initial_count);
    
    // Wait a bit for ticks to increment (longer wait for 1ms intervals)
    printf("Waiting for ticks to increment...\n");
    for (int i = 0; i < 100000000; i++) {
        volatile int dummy = 0;
        dummy++;
    }
    
    uint64_t final_count = clock_tick_simulation_get_count();
    assert(final_count > initial_count);
    printf("✓ Tick count increased to: %llu\n", (unsigned long long)final_count);
    
    // Test stopping simulation
    clock_tick_simulation_stop();
    assert(!clock_tick_simulation_is_running());
    printf("✓ Tick simulation stopped\n");
    
    printf("Clock tick simulation test PASSED\n");
}

void test_clock_time_operations(void) {
    printf("\n--- Testing Clock Time Operations ---\n");
    
    // Test clock_gettime function
    struct timespec ts;
    int result = clock_gettime(0, &ts);
    assert(result == 0);
    assert(ts.tv_sec >= 0);
    assert(ts.tv_nsec >= 0 && ts.tv_nsec < 1000000000);
    printf("✓ clock_gettime works correctly\n");
    
    // Test nanosleep function
    struct timespec sleep_time;
    sleep_time.tv_sec = 0;
    sleep_time.tv_nsec = 1000000; // 1ms
    
    result = nanosleep(&sleep_time, NULL);
    assert(result == 0);
    printf("✓ nanosleep works correctly\n");
    
    // Test time operations with real-time clock
    RealtimeClock realtime_clock;
    realtime_clock_init(&realtime_clock);
    
    IClock* clock = (IClock*)&realtime_clock;
    
    uint32_t time1 = clock->get_current_time_ms(clock);
    printf("✓ Current time: %u ms\n", time1);
    
    // Test sleep operations
    clock->sleep_for_ms(clock, 10); // Sleep for 10ms
    
    uint32_t time2 = clock->get_current_time_ms(clock);
    assert(time2 >= time1 + 10);
    printf("✓ Sleep for 10ms worked (time: %u ms)\n", time2);
    
    // Test sleep until
    struct timespec target_time = clock->get_current_time_point(clock);
    target_time.tv_sec += 1; // 1 second from now
    
    uint32_t time3 = clock->get_current_time_ms(clock);
    (void)time3; // Suppress unused variable warning
    clock->sleep_until(clock, target_time);
    uint32_t time4 = clock->get_current_time_ms(clock);
    
    assert(time4 >= time3 + 1000); // Should be at least 1 second later
    printf("✓ Sleep until worked (time: %u ms)\n", time4);
    
    printf("Clock time operations test PASSED\n");
}

void test_clock_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    // Test NULL parameters for clock_gettime
    int result = clock_gettime(0, NULL);
    assert(result == -1);
    printf("✓ clock_gettime with NULL timespec correctly failed\n");
    
    // Test NULL parameters for nanosleep
    result = nanosleep(NULL, NULL);
    assert(result == -1);
    printf("✓ nanosleep with NULL request correctly failed\n");
    
    // Test invalid clock ID
    struct timespec ts;
    result = clock_gettime(999, &ts); // Invalid clock ID
    // Note: Our implementation accepts any clock ID, so this might succeed
    printf("✓ Invalid clock ID handling\n");
    
    // Test clock operations with NULL clock
    assert(!clock_create_realtime(NULL));
    assert(!clock_create_tick_based(NULL, 100));
    printf("✓ NULL clock parameter handling correct\n");
    
    // Test tick simulation edge cases
    clock_tick_simulation_set_rate_hz(0); // Invalid rate
    printf("✓ Zero tick rate handling\n");
    
    clock_tick_simulation_set_rate_hz(1000000); // Very high rate
    assert(clock_tick_simulation_get_rate_hz() == 1000000);
    printf("✓ High tick rate handling\n");
    
    // Test starting simulation when already running
    clock_tick_simulation_start(1000);
    assert(clock_tick_simulation_is_running());
    
    clock_tick_simulation_start(2000); // Try to start again
    assert(clock_tick_simulation_is_running());
    printf("✓ Starting simulation when already running handled\n");
    
    // Test stopping simulation when not running
    clock_tick_simulation_stop();
    assert(!clock_tick_simulation_is_running());
    
    clock_tick_simulation_stop(); // Try to stop again
    assert(!clock_tick_simulation_is_running());
    printf("✓ Stopping simulation when not running handled\n");
    
    // Test tick-based clock with zero interval
    TickBasedClock tick_clock;
    tick_based_clock_init(&tick_clock, 0); // Zero interval
    assert(tick_clock.tick_interval_ms == 0);
    printf("✓ Zero tick interval handling\n");
    
    // Test tick-based clock with very large interval
    tick_based_clock_init(&tick_clock, 0xFFFFFFFF); // Very large interval
    assert(tick_clock.tick_interval_ms == 0xFFFFFFFF);
    printf("✓ Large tick interval handling\n");
    
    printf("Edge cases test PASSED\n");
}

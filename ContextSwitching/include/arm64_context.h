#ifndef ARM64_CONTEXT_H
#define ARM64_CONTEXT_H

#include <stdint.h>

// ARM64 레지스터 집합 구조체
typedef struct arm64_context {
    uint64_t x[31];   // x0~x30 (일반 목적 레지스터)
    uint64_t sp;      // 스택 포인터
    uint64_t pc;      // 프로그램 카운터
    uint64_t pstate;  // 프로그램 상태 레지스터
} arm64_context_t;

#ifdef __cplusplus
extern "C" {
#endif

// 컨텍스트 저장/복원 함수 (어셈블리 구현)
void arm64_save_context(arm64_context_t* ctx);
void arm64_restore_context(const arm64_context_t* ctx);

#ifdef __cplusplus
}
#endif

#endif // ARM64_CONTEXT_H

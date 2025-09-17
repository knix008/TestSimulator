#include "arm64_context.h"

// 어셈블리 함수 선언
typedef void (*context_func_t)(arm64_context_t*);

// C++에서 사용할 수 있도록 래퍼 함수 제공
extern "C" void arm64_save_context(arm64_context_t* ctx);
extern "C" void arm64_restore_context(const arm64_context_t* ctx);

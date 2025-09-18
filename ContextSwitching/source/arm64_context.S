// ARM64 context switch assembly implementation (pseudo, for reference)
// 실제 ARM64 환경에서는 .S 파일로 작성해야 하며, 아래 코드는 예시입니다.
// 이 파일은 빌드 대상이 ARM64가 아닐 경우 dummy로 남겨둡니다.

	.text
	.global arm64_save_context
	.global arm64_restore_context

// void arm64_save_context(arm64_context_t* ctx)
// x0: ctx 포인터
arm64_save_context:
    // x1~x30 저장
    stp x1, x2,   [x0, #0]
    stp x3, x4,   [x0, #16]
    stp x5, x6,   [x0, #32]
    stp x7, x8,   [x0, #48]
    stp x9, x10,  [x0, #64]
    stp x11, x12, [x0, #80]
    stp x13, x14, [x0, #96]
    stp x15, x16, [x0, #112]
    stp x17, x18, [x0, #128]
    stp x19, x20, [x0, #144]
    stp x21, x22, [x0, #160]
    stp x23, x24, [x0, #176]
    stp x25, x26, [x0, #192]
    stp x27, x28, [x0, #208]
    stp x29, x30, [x0, #224]
    // x0(x0는 ctx 포인터)
    str x0, [x0, #240] // x[30]에 x0 저장 (실제 x0는 함수 인자)
    // sp 저장
    mov x1, sp
    str x1, [x0, #248]
    // pc 저장 (현재 함수의 return 주소)
    adr x2, .
    str x2, [x0, #256]
    // pstate 저장
    mrs x3, nzcv
    str x3, [x0, #264]
    ret

// void arm64_restore_context(const arm64_context_t* ctx)
// x0: ctx 포인터
arm64_restore_context:
    // x1~x30 복원
    ldp x1, x2,   [x0, #0]
    ldp x3, x4,   [x0, #16]
    ldp x5, x6,   [x0, #32]
    ldp x7, x8,   [x0, #48]
    ldp x9, x10,  [x0, #64]
    ldp x11, x12, [x0, #80]
    ldp x13, x14, [x0, #96]
    ldp x15, x16, [x0, #112]
    ldp x17, x18, [x0, #128]
    ldp x19, x20, [x0, #144]
    ldp x21, x22, [x0, #160]
    ldp x23, x24, [x0, #176]
    ldp x25, x26, [x0, #192]
    ldp x27, x28, [x0, #208]
    ldp x29, x30, [x0, #224]
    // x0(x0는 ctx 포인터)
    ldr x1, [x0, #240] // x[30]에 저장된 x0를 x1에 복원(참고)
    // sp 복원
    ldr x2, [x0, #248]
    mov sp, x2
    // pc 복원
    ldr x3, [x0, #256]
    // pstate 복원
    ldr x4, [x0, #264]
    msr nzcv, x4
    br x3 // pc로 분기
    ret

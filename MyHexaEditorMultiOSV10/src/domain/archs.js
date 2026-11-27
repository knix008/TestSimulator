// The disassembler's architectures (crates/hexcore/src/disasm.rs archs()): id and display name. One list for the
// disassembler window, the settings window and settings repair; a unit test checks it against the core.
export const DISASM_ARCHS = [
  ['x86-64', 'x86-64'], ['x86-32', 'x86 (32)'], ['x86-16', 'x86 (16)'],
  ['arm64', 'ARM64'], ['arm32', 'ARM (A32)'], ['thumb', 'Thumb'],
  ['mips32be', 'MIPS32 BE'], ['mips32le', 'MIPS32 LE'], ['mips64be', 'MIPS64 BE'], ['mips64le', 'MIPS64 LE'],
  ['riscv32', 'RISC-V RV32GC'], ['riscv64', 'RISC-V RV64GC'],
  ['ppc32', 'PowerPC 32'], ['ppc64', 'PowerPC 64'], ['ppc64le', 'PowerPC 64 LE'],
  ['sh4', 'SuperH SH-4'], ['sh4be', 'SuperH SH-4 BE'],
  ['6502', 'MOS 6502'], ['avr', 'Atmel AVR'], ['msp430', 'TI MSP430'], ['z80', 'Zilog Z80'], ['8080', 'Intel 8080'],
];
export const DISASM_ARCH_IDS = DISASM_ARCHS.map(([id]) => id);

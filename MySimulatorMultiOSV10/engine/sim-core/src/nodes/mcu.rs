//! A small 8-bit microcontroller for the digital logic node (the Proteus way of
//! simulating firmware with the circuit): 16 registers r0–r15, Z and C flags,
//! 256 bytes of RAM, a call stack, one output port and one input port of up to
//! eight pins each. One instruction runs per cycle of its clock.
//!
//! Instructions (`r` a register, `k` a number 0–255 or 'c' or 0b…/0x…, `L` a label):
//! ldi r, k · mov r, r · add/sub/and/or/xor r, r|k · inc/dec/com/lsl/lsr/rol/ror r ·
//! cp r, r|k · jmp/jz/jnz/jc/jnc/call L · ret · out r (port ← r) · in r (r ← pins) ·
//! sbi b / cbi b / tgl b (set, clear, toggle output bit b) · sbis b / sbic b (skip the
//! next instruction if input bit b is set / clear) · sts a, r / lds r, a (RAM) ·
//! delay k|r (wait k cycles) · nop · halt.

use std::collections::HashMap;

#[derive(Clone, Copy, Debug)]
enum Arg {
    Reg(usize),
    Imm(u8),
}

#[derive(Clone, Debug)]
enum Ins {
    Ldi(usize, u8),
    Mov(usize, usize),
    Alu(&'static str, usize, Arg),
    Unary(&'static str, usize),
    Cp(usize, Arg),
    Jump(&'static str, usize),
    Call(usize),
    Ret,
    Out(usize),
    In(usize),
    Bit(&'static str, u8),
    Skip(bool, u8),
    Sts(u8, usize),
    Lds(usize, u8),
    Delay(Arg),
    Nop,
    Halt,
}

#[derive(Clone, Debug)]
pub struct Cpu {
    prog: Vec<Ins>,
    pub r: [u8; 16],
    ram: [u8; 256],
    stack: Vec<usize>,
    pub pc: usize,
    z: bool,
    c: bool,
    pub port: u8,
    wait: u32,
    pub halted: bool,
    pub executed: u64,
}

fn number(t: &str) -> Result<u8, String> {
    let t = t.trim();
    let v: i64 = if let Some(h) = t.strip_prefix("0x") {
        i64::from_str_radix(h, 16).map_err(|_| format!("\"{t}\" is not a number"))?
    } else if let Some(b) = t.strip_prefix("0b") {
        i64::from_str_radix(b, 2).map_err(|_| format!("\"{t}\" is not a number"))?
    } else if t.len() == 3 && t.starts_with('\'') && t.ends_with('\'') {
        t.as_bytes()[1] as i64
    } else {
        t.parse::<i64>().map_err(|_| format!("\"{t}\" is not a number"))?
    };
    if !(-128..=255).contains(&v) {
        return Err(format!("{v} does not fit in a byte"));
    }
    Ok(v as u8)
}

fn reg(t: &str) -> Result<usize, String> {
    let t = t.trim().to_ascii_lowercase();
    let n = t.strip_prefix('r').and_then(|n| n.parse::<usize>().ok()).filter(|n| *n < 16);
    n.ok_or_else(|| format!("\"{t}\" is not a register (r0 … r15)"))
}

fn arg(t: &str) -> Result<Arg, String> {
    if t.trim().to_ascii_lowercase().starts_with('r') {
        reg(t).map(Arg::Reg)
    } else {
        number(t).map(Arg::Imm)
    }
}

impl Cpu {
    /// Assembles the program text.
    pub fn assemble(text: &str) -> Result<Cpu, String> {
        // Labels first.
        let mut labels: HashMap<String, usize> = HashMap::new();
        let mut lines: Vec<(usize, String)> = Vec::new();
        for (no, raw) in text.lines().enumerate() {
            let mut line = raw.split(';').next().unwrap().trim().to_string();
            while let Some(colon) = line.find(':') {
                let label = line[..colon].trim().to_ascii_lowercase();
                if label.is_empty() || !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                    break;
                }
                labels.insert(label, lines.len());
                line = line[colon + 1..].trim().to_string();
            }
            if !line.is_empty() {
                lines.push((no, line));
            }
        }
        let mut prog = Vec::new();
        for (no, line) in &lines {
            let err = |e: String| format!("program line {}: {e}", no + 1);
            let (op, rest) = match line.split_once(char::is_whitespace) {
                Some((o, r)) => (o.to_ascii_lowercase(), r.trim().to_string()),
                None => (line.to_ascii_lowercase(), String::new()),
            };
            let a: Vec<String> = rest.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            let need = |n: usize| if a.len() == n { Ok(()) } else { Err(err(format!("{op} takes {n} operand{}", if n == 1 { "" } else { "s" }))) };
            let label = |t: &str| labels.get(&t.to_ascii_lowercase()).copied().ok_or_else(|| err(format!("no label \"{t}\"")));
            let ins = match op.as_str() {
                "ldi" => {
                    need(2)?;
                    Ins::Ldi(reg(&a[0]).map_err(err)?, number(&a[1]).map_err(err)?)
                }
                "mov" => {
                    need(2)?;
                    Ins::Mov(reg(&a[0]).map_err(err)?, reg(&a[1]).map_err(err)?)
                }
                "add" | "sub" | "and" | "or" | "xor" => {
                    need(2)?;
                    let name: &'static str = match op.as_str() {
                        "add" => "add",
                        "sub" => "sub",
                        "and" => "and",
                        "or" => "or",
                        _ => "xor",
                    };
                    Ins::Alu(name, reg(&a[0]).map_err(err)?, arg(&a[1]).map_err(err)?)
                }
                "inc" | "dec" | "com" | "lsl" | "lsr" | "rol" | "ror" | "clr" => {
                    need(1)?;
                    let name: &'static str = match op.as_str() {
                        "inc" => "inc",
                        "dec" => "dec",
                        "com" => "com",
                        "lsl" => "lsl",
                        "lsr" => "lsr",
                        "rol" => "rol",
                        "ror" => "ror",
                        _ => "clr",
                    };
                    Ins::Unary(name, reg(&a[0]).map_err(err)?)
                }
                "cp" | "cpi" => {
                    need(2)?;
                    Ins::Cp(reg(&a[0]).map_err(err)?, arg(&a[1]).map_err(err)?)
                }
                "jmp" | "rjmp" | "jz" | "breq" | "jnz" | "brne" | "jc" | "brcs" | "jnc" | "brcc" => {
                    need(1)?;
                    let kind: &'static str = match op.as_str() {
                        "jmp" | "rjmp" => "jmp",
                        "jz" | "breq" => "jz",
                        "jnz" | "brne" => "jnz",
                        "jc" | "brcs" => "jc",
                        _ => "jnc",
                    };
                    Ins::Jump(kind, label(&a[0])?)
                }
                "call" | "rcall" => {
                    need(1)?;
                    Ins::Call(label(&a[0])?)
                }
                "ret" => Ins::Ret,
                "out" => {
                    need(1)?;
                    Ins::Out(reg(&a[0]).map_err(err)?)
                }
                "in" => {
                    need(1)?;
                    Ins::In(reg(&a[0]).map_err(err)?)
                }
                "sbi" | "cbi" | "tgl" => {
                    need(1)?;
                    let b = number(&a[0]).map_err(err)?;
                    if b > 7 {
                        return Err(err("bits are 0 … 7".into()));
                    }
                    Ins::Bit(match op.as_str() {
                        "sbi" => "set",
                        "cbi" => "clear",
                        _ => "toggle",
                    }, b)
                }
                "sbis" | "sbic" => {
                    need(1)?;
                    let b = number(&a[0]).map_err(err)?;
                    if b > 7 {
                        return Err(err("bits are 0 … 7".into()));
                    }
                    Ins::Skip(op == "sbis", b)
                }
                "sts" => {
                    need(2)?;
                    Ins::Sts(number(&a[0]).map_err(err)?, reg(&a[1]).map_err(err)?)
                }
                "lds" => {
                    need(2)?;
                    Ins::Lds(reg(&a[0]).map_err(err)?, number(&a[1]).map_err(err)?)
                }
                "delay" | "wait" => {
                    need(1)?;
                    Ins::Delay(arg(&a[0]).map_err(err)?)
                }
                "nop" => Ins::Nop,
                "halt" | "sleep" => Ins::Halt,
                other => return Err(err(format!("unknown instruction \"{other}\""))),
            };
            prog.push(ins);
        }
        if prog.is_empty() {
            return Err("the program is empty".into());
        }
        Ok(Cpu { prog, r: [0; 16], ram: [0; 256], stack: Vec::new(), pc: 0, z: false, c: false, port: 0, wait: 0, halted: false, executed: 0 })
    }

    /// One clock cycle with the input pins `pins`; returns the output port.
    pub fn cycle(&mut self, pins: u8) -> Result<u8, String> {
        if self.halted {
            return Ok(self.port);
        }
        if self.wait > 0 {
            self.wait -= 1;
            return Ok(self.port);
        }
        let ins = self.prog.get(self.pc).cloned().ok_or("the program ran off its end (add jmp or halt)")?;
        self.pc += 1;
        self.executed += 1;
        let val = |cpu: &Cpu, a: Arg| match a {
            Arg::Reg(r) => cpu.r[r],
            Arg::Imm(k) => k,
        };
        match ins {
            Ins::Ldi(r, k) => self.r[r] = k,
            Ins::Mov(d, s) => self.r[d] = self.r[s],
            Ins::Alu(op, d, a) => {
                let (x, y) = (self.r[d], val(self, a));
                let (res, carry) = match op {
                    "add" => x.overflowing_add(y),
                    "sub" => x.overflowing_sub(y),
                    "and" => (x & y, self.c),
                    "or" => (x | y, self.c),
                    _ => (x ^ y, self.c),
                };
                self.r[d] = res;
                self.c = carry;
                self.z = res == 0;
            }
            Ins::Unary(op, d) => {
                let x = self.r[d];
                let (res, carry) = match op {
                    "inc" => (x.wrapping_add(1), self.c),
                    "dec" => (x.wrapping_sub(1), self.c),
                    "com" => (!x, true),
                    "lsl" => (x << 1, x & 0x80 != 0),
                    "lsr" => (x >> 1, x & 1 != 0),
                    "rol" => ((x << 1) | self.c as u8, x & 0x80 != 0),
                    "ror" => ((x >> 1) | ((self.c as u8) << 7), x & 1 != 0),
                    _ => (0, self.c),
                };
                self.r[d] = res;
                self.c = carry;
                self.z = res == 0;
            }
            Ins::Cp(d, a) => {
                let (res, carry) = self.r[d].overflowing_sub(val(self, a));
                self.z = res == 0;
                self.c = carry;
            }
            Ins::Jump(kind, to) => {
                let take = match kind {
                    "jmp" => true,
                    "jz" => self.z,
                    "jnz" => !self.z,
                    "jc" => self.c,
                    _ => !self.c,
                };
                if take {
                    self.pc = to;
                }
            }
            Ins::Call(to) => {
                if self.stack.len() >= 64 {
                    return Err("stack overflow (64 calls deep)".into());
                }
                self.stack.push(self.pc);
                self.pc = to;
            }
            Ins::Ret => self.pc = self.stack.pop().ok_or("ret without call")?,
            Ins::Out(r) => self.port = self.r[r],
            Ins::In(r) => self.r[r] = pins,
            Ins::Bit(op, b) => {
                let m = 1u8 << b;
                self.port = match op {
                    "set" => self.port | m,
                    "clear" => self.port & !m,
                    _ => self.port ^ m,
                }
            }
            Ins::Skip(if_set, b) => {
                if ((pins >> b) & 1 == 1) == if_set {
                    self.pc += 1;
                }
            }
            Ins::Sts(a, r) => self.ram[a as usize] = self.r[r],
            Ins::Lds(r, a) => self.r[r] = self.ram[a as usize],
            Ins::Delay(a) => self.wait = (val(self, a) as u32).saturating_sub(1),
            Ins::Nop => {}
            Ins::Halt => self.halted = true,
        }
        Ok(self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_loops_and_calls() {
        // r1 = 3 + 4 by a loop; a subroutine doubles it; the result goes out.
        let mut cpu = Cpu::assemble("ldi r1, 3\nldi r2, 4\nloop: inc r1\ndec r2\njnz loop\ncall double\nout r1\nhalt\ndouble: lsl r1\nret").unwrap();
        for _ in 0..50 {
            cpu.cycle(0).unwrap();
        }
        assert_eq!(cpu.port, 14);
        assert!(cpu.halted);
    }
}

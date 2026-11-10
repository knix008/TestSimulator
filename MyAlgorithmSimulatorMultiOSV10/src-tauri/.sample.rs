use std::io::Read;
fn read_all() -> String { let mut s = String::new(); std::io::stdin().read_to_string(&mut s).ok(); s }
fn ints(s: &str) -> Vec<i64> { s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect() }
fn main() { let mut a = ints(&read_all()); for i in 0..a.len().saturating_sub(1) { let mut swapped = false; for j in 0..a.len() - 1 - i { if a[j] > a[j + 1] { a.swap(j, j + 1); swapped = true; } } if !swapped { break; } } for (i, v) in a.iter().enumerate() { if i > 0 { print!(" "); } print!("{v}"); } println!(); }

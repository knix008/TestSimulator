// Rust — enums, pattern matching, iterators, Result
use std::collections::HashMap;

#[derive(Debug)]
enum Token { Word(String), Number(i64) }

fn tokenize(input: &str) -> Vec<Token> {
    input.split_whitespace().map(|s| match s.parse::<i64>() {
        Ok(n) => Token::Number(n),
        Err(_) => Token::Word(s.to_string()),
    }).collect()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for t in tokenize("one 1 two 2 two 3") {
        let key = match t { Token::Word(_) => "word", Token::Number(_) => "number" };
        *counts.entry(key).or_default() += 1;
    }
    println!("{counts:?}");
    Ok(())
}

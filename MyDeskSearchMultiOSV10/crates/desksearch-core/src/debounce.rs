use std::time::{Duration, Instant};

/// Fires once after `delay` has elapsed since the latest `push`.
#[derive(Clone, Debug)]
pub struct Debouncer {
    delay: Duration,
    deadline: Option<Instant>,
}

impl Debouncer {
    pub fn new(delay: Duration) -> Self {
        Self {
            delay,
            deadline: None,
        }
    }

    pub fn push(&mut self, now: Instant) {
        self.deadline = Some(now + self.delay);
    }

    pub fn ready(&mut self, now: Instant) -> bool {
        match self.deadline {
            Some(deadline) if now >= deadline => {
                self.deadline = None;
                true
            }
            _ => false,
        }
    }

    pub fn pending(&self) -> bool {
        self.deadline.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn later_input_resets_the_deadline() {
        let start = Instant::now();
        let mut debounce = Debouncer::new(Duration::from_millis(300));
        debounce.push(start);
        assert!(!debounce.ready(start + Duration::from_millis(200)));
        debounce.push(start + Duration::from_millis(200));
        assert!(!debounce.ready(start + Duration::from_millis(400)));
        assert!(debounce.ready(start + Duration::from_millis(500)));
        assert!(!debounce.ready(start + Duration::from_millis(800)));
    }
}

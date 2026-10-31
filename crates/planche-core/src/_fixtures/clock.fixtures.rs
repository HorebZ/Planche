use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use crate::sync::Clock;

#[derive(Default)]
pub(crate) struct FakeClock {
    start: Option<(SystemTime, Instant)>,
    /// How long the Mac slept: the wall clock moved, the monotonic clock did not.
    pub(crate) slept: Mutex<Duration>,
    /// Time awake: both clocks moved.
    pub(crate) awake: Mutex<Duration>,
}

impl FakeClock {
    pub(crate) fn new() -> Self {
        Self {
            start: Some((SystemTime::now(), Instant::now())),
            ..Self::default()
        }
    }
}

impl Clock for FakeClock {
    fn wall(&self) -> SystemTime {
        self.start.unwrap().0 + *self.slept.lock().unwrap() + *self.awake.lock().unwrap()
    }

    fn mono(&self) -> Instant {
        self.start.unwrap().1 + *self.awake.lock().unwrap()
    }
}

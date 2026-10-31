use super::*;

#[test]
fn next_interval_cases() {
    let hour = Duration::from_secs(3600);
    let secs = |s| Some(Duration::from_secs(s));
    let cases = [
        (
            "5 min with a healthy quota",
            SyncInterval::FiveMinutes,
            4,
            4900,
            hour,
            secs(300),
        ),
        (
            "1 min at cost 5",
            SyncInterval::OneMinute,
            5,
            4900,
            hour,
            secs(60),
        ),
        // 20 points every 60 s is 1200 per hour, over the 1000 budget.
        (
            "1 min at cost 20",
            SyncInterval::OneMinute,
            20,
            4900,
            hour,
            secs(72),
        ),
        (
            "15 min at cost 20",
            SyncInterval::FifteenMinutes,
            20,
            4900,
            hour,
            secs(900),
        ),
        ("manual", SyncInterval::Manual, 4, 4900, hour, None),
        (
            "nearly spent quota",
            SyncInterval::OneMinute,
            4,
            100,
            Duration::from_secs(1200),
            secs(1200),
        ),
        (
            "nearly spent, reset sooner than the setting",
            SyncInterval::FiveMinutes,
            4,
            100,
            Duration::from_secs(30),
            secs(300),
        ),
    ];

    for (name, setting, cost, remaining, reset_in, expected) in cases {
        assert_eq!(
            next_interval(setting, cost, remaining, reset_in),
            expected,
            "{name}"
        );
    }
}

#[test]
fn sync_interval_round_trips_through_kv_values() {
    for value in ["1m", "5m", "15m", "manual"] {
        assert_eq!(value.parse::<SyncInterval>().unwrap().as_str(), value);
    }

    assert!("2m".parse::<SyncInterval>().is_err());
}

//! Shared date-conversion helpers (Howard Hinnant's civil_from_days algorithm).

/// Convert a day count (days since 1970-01-01, signed) into `(year, month, day)`.
///
/// This is Howard Hinnant's `civil_from_days` algorithm.
pub fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Convert epoch seconds (UTC) to `"YYYY-MM-DD"`.
pub fn epoch_secs_to_date(secs: u64) -> Option<String> {
    let days = (secs / 86400) as i64;
    let (y, m, d) = civil_from_days(days);
    Some(format!("{:04}-{:02}-{:02}", y, m, d))
}

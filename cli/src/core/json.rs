// ─────────────────────────────────────────────────────────────────────────────
// json.rs — tiny accessors for the API's response Values. Amounts/prices cross
// the boundary as UI decimal STRINGS; these forgive absence so call sites can
// render or compute without a match at every field. str_field → "" when absent,
// f64_field → 0.0 when absent or unparseable.
// ─────────────────────────────────────────────────────────────────────────────

use serde_json::Value;

/// String field, borrowing from the Value. Absent or non-string → "".
pub fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

/// Numeric field parsed from its UI string. Absent or unparseable → 0.0.
pub fn f64_field(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(|x| x.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0)
}

use flash_sdk::pool_config::Side;

// Test color/format functions (replicated locally to avoid binary dep)
fn format_usd(value: f64) -> String {
    let abs = value.abs();
    let sign = if value < 0.0 { "-" } else { "" };
    if abs >= 1_000_000.0 {
        format!("{sign}${:.2}M", abs / 1_000_000.0)
    } else if abs >= 1_000.0 {
        let whole = abs as u64;
        let frac = ((abs - whole as f64) * 100.0).round() as u64;
        let with_commas = format_with_commas(whole);
        format!("{sign}${with_commas}.{frac:02}")
    } else {
        format!("{sign}${:.2}", abs)
    }
}

fn format_price(value: f64) -> String {
    if value >= 1000.0 {
        let whole = value as u64;
        let frac = ((value - whole as f64) * 100.0).round() as u64;
        let with_commas = format_with_commas(whole);
        format!("${with_commas}.{frac:02}")
    } else if value >= 1.0 {
        format!("${:.2}", value)
    } else if value >= 0.01 {
        format!("${:.4}", value)
    } else {
        format!("${:.6}", value)
    }
}

fn format_with_commas(n: u64) -> String {
    let s = n.to_string();
    let mut result = String::new();
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push(',');
        }
        result.push(ch);
    }
    result.chars().rev().collect()
}

#[test]
fn test_format_usd_small() {
    assert_eq!(format_usd(0.50), "$0.50");
    assert_eq!(format_usd(99.99), "$99.99");
    assert_eq!(format_usd(0.0), "$0.00");
}

#[test]
fn test_format_usd_thousands() {
    assert_eq!(format_usd(1000.0), "$1,000.00");
    assert_eq!(format_usd(12345.67), "$12,345.67");
    assert_eq!(format_usd(999999.99), "$999,999.99");
}

#[test]
fn test_format_usd_millions() {
    assert_eq!(format_usd(1_000_000.0), "$1.00M");
    assert_eq!(format_usd(5_500_000.0), "$5.50M");
}

#[test]
fn test_format_usd_negative() {
    assert_eq!(format_usd(-50.0), "-$50.00");
    assert_eq!(format_usd(-1234.56), "-$1,234.56");
}

#[test]
fn test_format_price_crypto() {
    assert_eq!(format_price(90.42), "$90.42");
    assert_eq!(format_price(2200.50), "$2,200.50");
    assert_eq!(format_price(71000.0), "$71,000.00");
}

#[test]
fn test_format_price_small() {
    assert_eq!(format_price(0.05), "$0.0500");
    assert_eq!(format_price(0.001), "$0.001000");
}

#[test]
fn test_format_with_commas() {
    assert_eq!(format_with_commas(0), "0");
    assert_eq!(format_with_commas(999), "999");
    assert_eq!(format_with_commas(1000), "1,000");
    assert_eq!(format_with_commas(1000000), "1,000,000");
    assert_eq!(format_with_commas(123456789), "123,456,789");
}

#[test]
fn test_json_output_is_valid() {
    // Simulate JSON output for positions
    let json = serde_json::to_string_pretty(&serde_json::json!([
        {
            "market": "SOL/USDC",
            "side": "Long",
            "sizeUsd": 1000.0,
            "pnlUsd": 45.20,
        }
    ]))
    .unwrap();

    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(parsed.is_array());
    assert_eq!(parsed[0]["market"], "SOL/USDC");
    assert_eq!(parsed[0]["pnlUsd"], 45.20);
}

#[test]
fn test_json_settings_output() {
    let settings = vec![
        ("active_key".to_string(), "default".to_string()),
        ("cluster".to_string(), "mainnet-beta".to_string()),
    ];
    let obj: serde_json::Map<String, serde_json::Value> = settings
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();
    let json = serde_json::to_string_pretty(&serde_json::Value::Object(obj)).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed["active_key"], "default");
    assert_eq!(parsed["cluster"], "mainnet-beta");
}

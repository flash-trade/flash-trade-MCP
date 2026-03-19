use colored::Colorize;

pub fn color_pnl(value: f64) -> String {
    let formatted = format_usd(value);
    if value > 0.0 {
        format!("+{}", formatted).green().to_string()
    } else if value < 0.0 {
        formatted.red().to_string()
    } else {
        formatted
    }
}

pub fn color_pnl_percent(value: f64) -> String {
    let formatted = format!("{:.2}%", value);
    if value > 0.0 {
        format!("+{formatted}").green().to_string()
    } else if value < 0.0 {
        formatted.red().to_string()
    } else {
        formatted
    }
}

pub fn color_side(side: &str) -> String {
    match side.to_lowercase().as_str() {
        "long" => "Long".green().to_string(),
        "short" => "Short".red().to_string(),
        _ => side.to_string(),
    }
}

pub fn color_leverage(leverage: f64) -> String {
    let formatted = format!("{:.1}x", leverage);
    if leverage > 10.0 {
        formatted.yellow().to_string()
    } else {
        formatted
    }
}

pub fn format_usd(value: f64) -> String {
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

pub fn format_price(value: f64) -> String {
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

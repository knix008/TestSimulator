//! What flows along the links: a dataset of tables (named columns), grids
//! (a value per cell of an x × y raster) and scalars (named results).

/// One column. Numeric columns keep `values`; a text column (labels, class
/// names) keeps `labels` and NaN values of the same length.
#[derive(Clone, Debug, Default)]
pub struct Column {
    pub name: String,
    pub unit: String,
    pub values: Vec<f64>,
    pub labels: Option<Vec<String>>,
}

impl Column {
    pub fn new(name: &str, unit: &str, values: Vec<f64>) -> Self {
        Column { name: name.to_string(), unit: unit.to_string(), values, labels: None }
    }

    pub fn text(name: &str, labels: Vec<String>) -> Self {
        Column { name: name.to_string(), unit: String::new(), values: vec![f64::NAN; labels.len()], labels: Some(labels) }
    }

    pub fn is_text(&self) -> bool {
        self.labels.is_some()
    }

    pub fn len(&self) -> usize {
        self.values.len()
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }
}

/// A table: columns of equal length. `x` is the index of the column used as
/// the abscissa (time, frequency …) when there is one.
#[derive(Clone, Debug, Default)]
pub struct Table {
    pub name: String,
    pub columns: Vec<Column>,
    pub x: Option<usize>,
}

impl Table {
    pub fn new(name: &str) -> Self {
        Table { name: name.to_string(), columns: Vec::new(), x: None }
    }

    pub fn with_x(mut self, column: Column) -> Self {
        self.x = Some(self.columns.len());
        self.columns.push(column);
        self
    }

    pub fn push(&mut self, column: Column) -> &mut Self {
        self.columns.push(column);
        self
    }

    pub fn rows(&self) -> usize {
        self.columns.iter().map(|c| c.len()).max().unwrap_or(0)
    }

    /// The column called `name` (exact, then case-insensitive).
    pub fn find(&self, name: &str) -> Option<usize> {
        let name = name.trim();
        self.columns
            .iter()
            .position(|c| c.name == name)
            .or_else(|| self.columns.iter().position(|c| c.name.eq_ignore_ascii_case(name)))
    }

    pub fn column(&self, name: &str) -> Result<&Column, String> {
        self.find(name).map(|i| &self.columns[i]).ok_or_else(|| {
            let names: Vec<&str> = self.columns.iter().map(|c| c.name.as_str()).collect();
            format!("no column \"{name}\" (columns: {})", names.join(", "))
        })
    }

    pub fn x_column(&self) -> Option<&Column> {
        self.x.and_then(|i| self.columns.get(i))
    }

    /// Numeric columns that are not the x column.
    pub fn value_columns(&self) -> Vec<usize> {
        (0..self.columns.len()).filter(|&i| Some(i) != self.x && !self.columns[i].is_text()).collect()
    }

    /// The column named `name`, or (empty name) the first numeric column after x.
    pub fn pick(&self, name: &str) -> Result<&Column, String> {
        if name.trim().is_empty() {
            let i = *self.value_columns().first().ok_or_else(|| format!("table \"{}\" has no numeric column", self.name))?;
            Ok(&self.columns[i])
        } else {
            self.column(name)
        }
    }

    /// The x column named `name`, or the table's x column, or the row index.
    pub fn pick_x(&self, name: &str) -> Column {
        if !name.trim().is_empty() {
            if let Ok(c) = self.column(name) {
                return c.clone();
            }
        }
        if let Some(c) = self.x_column() {
            return c.clone();
        }
        Column::new("index", "", (0..self.rows()).map(|i| i as f64).collect())
    }
}

/// A raster: z[j * nx + i] at (x[i], y[j]).
#[derive(Clone, Debug, Default)]
pub struct Grid {
    pub name: String,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub z: Vec<f64>,
    pub x_label: String,
    pub y_label: String,
    pub z_label: String,
    /// Optional names for the rows/columns (a correlation matrix).
    pub x_names: Option<Vec<String>>,
    pub y_names: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct Scalar {
    pub name: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Clone, Debug, Default)]
pub struct Dataset {
    pub tables: Vec<Table>,
    pub grids: Vec<Grid>,
    pub scalars: Vec<Scalar>,
    /// Free text shown with the result (a fitted formula, the output of a tool).
    pub text: String,
}

impl Dataset {
    pub fn table(table: Table) -> Self {
        Dataset { tables: vec![table], ..Default::default() }
    }

    pub fn scalar(&mut self, name: &str, value: f64, unit: &str) -> &mut Self {
        self.scalars.push(Scalar { name: name.to_string(), value, unit: unit.to_string() });
        self
    }

    pub fn get_scalar(&self, name: &str) -> Option<f64> {
        self.scalars.iter().find(|s| s.name == name || s.name.eq_ignore_ascii_case(name)).map(|s| s.value)
    }

    /// The table called `name`, or (empty) the first one.
    pub fn pick_table(&self, name: &str) -> Result<&Table, String> {
        if name.trim().is_empty() {
            return self.tables.first().ok_or_else(|| "the input has no table".to_string());
        }
        if let Ok(index) = name.trim().parse::<usize>() {
            if let Some(t) = self.tables.get(index) {
                return Ok(t);
            }
        }
        self.tables
            .iter()
            .find(|t| t.name == name.trim() || t.name.eq_ignore_ascii_case(name.trim()))
            .ok_or_else(|| {
                let names: Vec<&str> = self.tables.iter().map(|t| t.name.as_str()).collect();
                format!("no table \"{name}\" (tables: {})", names.join(", "))
            })
    }
}

// ───────────────────────── CSV

fn split_line(line: &str, delimiter: char) -> Vec<String> {
    // Quoted fields ("a, b") keep their delimiters; "" is an escaped quote.
    let mut out = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if quoted {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    quoted = false;
                }
            } else {
                field.push(ch);
            }
        } else if ch == '"' {
            quoted = true;
        } else if ch == delimiter || (delimiter == ' ' && ch == '\t') {
            if delimiter == ' ' && field.is_empty() {
                continue;
            }
            out.push(std::mem::take(&mut field));
        } else {
            field.push(ch);
        }
    }
    if !(delimiter == ' ' && field.is_empty()) {
        out.push(field);
    }
    out.into_iter().map(|f| f.trim().to_string()).collect()
}

fn parse_cell(text: &str, decimal_comma: bool) -> Option<f64> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    let owned;
    let t = if decimal_comma {
        owned = t.replace(',', ".");
        owned.as_str()
    } else {
        t
    };
    match t.to_ascii_lowercase().as_str() {
        "nan" => return Some(f64::NAN),
        "inf" | "+inf" | "infinity" => return Some(f64::INFINITY),
        "-inf" | "-infinity" => return Some(f64::NEG_INFINITY),
        _ => {}
    }
    t.parse::<f64>().ok()
}

/// Reads CSV/TSV/space separated text. The first row is a header when any of
/// its cells is not a number. Columns where most cells are not numbers become
/// text columns. Lines starting with `#` are comments.
pub fn parse_csv(text: &str, name: &str) -> Result<Table, String> {
    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim_end_matches('\r'))
        .filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
        .collect();
    if lines.is_empty() {
        return Err("the CSV text is empty".into());
    }
    let first = lines[0];
    let delimiter = if first.contains('\t') {
        '\t'
    } else if first.contains(';') {
        ';'
    } else if first.contains(',') {
        ','
    } else {
        ' '
    };
    let decimal_comma = delimiter == ';' || (delimiter == '\t' && lines.iter().take(5).any(|l| l.contains(',')));
    let rows: Vec<Vec<String>> = lines.iter().map(|l| split_line(l, delimiter)).collect();
    let header_row = rows[0].iter().any(|c| parse_cell(c, decimal_comma).is_none());
    let width = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let names: Vec<String> = (0..width)
        .map(|i| {
            if header_row {
                rows[0].get(i).cloned().filter(|s| !s.is_empty()).unwrap_or_else(|| format!("c{}", i + 1))
            } else {
                format!("c{}", i + 1)
            }
        })
        .collect();
    let body = if header_row { &rows[1..] } else { &rows[..] };
    let mut table = Table::new(name);
    for (i, column_name) in names.iter().enumerate() {
        let cells: Vec<&str> = body.iter().map(|r| r.get(i).map(|s| s.as_str()).unwrap_or("")).collect();
        let parsed: Vec<Option<f64>> = cells.iter().map(|c| parse_cell(c, decimal_comma)).collect();
        let numeric = parsed.iter().filter(|v| v.is_some()).count();
        let nonempty = cells.iter().filter(|c| !c.is_empty()).count();
        // Unit in brackets in the header: "t (s)" or "t [s]".
        let (base, unit) = split_unit(column_name);
        if nonempty > 0 && numeric * 2 < nonempty {
            let mut col = Column::text(&base, cells.iter().map(|c| c.to_string()).collect());
            col.unit = unit;
            table.push(col);
        } else {
            table.push(Column::new(&base, &unit, parsed.into_iter().map(|v| v.unwrap_or(f64::NAN)).collect()));
        }
    }
    if let Some(first_numeric) = table.columns.iter().position(|c| !c.is_text()) {
        let c = &table.columns[first_numeric];
        let n = c.values.len();
        // The first numeric column is the x axis when it increases monotonically.
        if n > 1 && c.values.windows(2).all(|w| w[1] > w[0]) && table.value_columns_count() > 1 {
            table.x = Some(first_numeric);
        }
    }
    Ok(table)
}

impl Table {
    fn value_columns_count(&self) -> usize {
        self.columns.iter().filter(|c| !c.is_text()).count()
    }
}

fn split_unit(name: &str) -> (String, String) {
    let name = name.trim();
    for (open, close) in [('(', ')'), ('[', ']')] {
        if name.ends_with(close) {
            if let Some(at) = name.rfind(open) {
                let base = name[..at].trim();
                if !base.is_empty() {
                    return (base.to_string(), name[at + 1..name.len() - 1].trim().to_string());
                }
            }
        }
    }
    (name.to_string(), String::new())
}

pub fn format_number(v: f64) -> String {
    if v.is_nan() {
        return String::new();
    }
    if v.is_infinite() {
        return if v > 0.0 { "inf".into() } else { "-inf".into() };
    }
    if v == v.trunc() && v.abs() < 1e15 {
        return format!("{}", v as i64);
    }
    let s = format!("{:.10e}", v);
    // Shortest round-tripping form.
    let plain = format!("{}", v);
    if plain.len() <= s.len() {
        plain
    } else {
        s
    }
}

fn csv_field(text: &str) -> String {
    if text.contains(',') || text.contains('"') || text.contains('\n') {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text.to_string()
    }
}

/// The table as CSV with a header row ("name (unit)").
pub fn table_csv(table: &Table) -> String {
    table_csv_with(table, true)
}

/// The table as CSV; `units` false writes bare column names (what scripts index by: data['t']).
pub fn table_csv_with(table: &Table, units: bool) -> String {
    let mut out = String::new();
    let head: Vec<String> = table
        .columns
        .iter()
        .map(|c| csv_field(&if c.unit.is_empty() || !units { c.name.clone() } else { format!("{} ({})", c.name, c.unit) }))
        .collect();
    out.push_str(&head.join(","));
    out.push('\n');
    for row in 0..table.rows() {
        let cells: Vec<String> = table
            .columns
            .iter()
            .map(|c| match &c.labels {
                Some(labels) => csv_field(labels.get(row).map(|s| s.as_str()).unwrap_or("")),
                None => c.values.get(row).map(|v| format_number(*v)).unwrap_or_default(),
            })
            .collect();
        out.push_str(&cells.join(","));
        out.push('\n');
    }
    out
}

// ───────────────────────── small numeric helpers shared by the nodes

pub fn finite(values: &[f64]) -> Vec<f64> {
    values.iter().copied().filter(|v| v.is_finite()).collect()
}

pub fn mean(values: &[f64]) -> f64 {
    let v = finite(values);
    if v.is_empty() {
        return f64::NAN;
    }
    v.iter().sum::<f64>() / v.len() as f64
}

/// Sample standard deviation (n − 1).
pub fn std_dev(values: &[f64]) -> f64 {
    let v = finite(values);
    if v.len() < 2 {
        return if v.len() == 1 { 0.0 } else { f64::NAN };
    }
    let m = v.iter().sum::<f64>() / v.len() as f64;
    (v.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / (v.len() - 1) as f64).sqrt()
}

pub fn rms(values: &[f64]) -> f64 {
    let v = finite(values);
    if v.is_empty() {
        return f64::NAN;
    }
    (v.iter().map(|x| x * x).sum::<f64>() / v.len() as f64).sqrt()
}

/// Quantile of sorted finite values (linear interpolation, type 7).
pub fn quantile_sorted(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    let pos = q.clamp(0.0, 1.0) * (sorted.len() - 1) as f64;
    let lo = pos.floor() as usize;
    let hi = pos.ceil() as usize;
    sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo as f64)
}

pub fn sorted_finite(values: &[f64]) -> Vec<f64> {
    let mut v = finite(values);
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    v
}

pub fn quantile(values: &[f64], q: f64) -> f64 {
    quantile_sorted(&sorted_finite(values), q)
}

/// Linear interpolation of (xs, ys) at x (xs increasing; clamped at the ends).
pub fn interp(xs: &[f64], ys: &[f64], x: f64) -> f64 {
    let n = xs.len().min(ys.len());
    if n == 0 {
        return f64::NAN;
    }
    if n == 1 || x <= xs[0] {
        return ys[0];
    }
    if x >= xs[n - 1] {
        return ys[n - 1];
    }
    // Binary search for the interval.
    let (mut lo, mut hi) = (0usize, n - 1);
    while hi - lo > 1 {
        let mid = (lo + hi) / 2;
        if xs[mid] <= x {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let span = xs[hi] - xs[lo];
    if span <= 0.0 {
        return ys[lo];
    }
    ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / span
}

/// Sample rate from an increasing time column: 1 / median step.
pub fn sample_rate(x: &[f64]) -> Option<f64> {
    if x.len() < 2 {
        return None;
    }
    let mut steps: Vec<f64> = x.windows(2).map(|w| w[1] - w[0]).filter(|d| d.is_finite() && *d > 0.0).collect();
    if steps.is_empty() {
        return None;
    }
    steps.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let dt = steps[steps.len() / 2];
    Some(1.0 / dt)
}

/// Aggregates a column: max, min, mean, last, first, rms, std, sum, absmax, p5 … p95, range, count.
pub fn aggregate(values: &[f64], how: &str) -> Result<f64, String> {
    let v = finite(values);
    let how = how.trim().to_ascii_lowercase();
    if v.is_empty() && how != "count" {
        return Ok(f64::NAN);
    }
    Ok(match how.as_str() {
        "max" => v.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
        "min" => v.iter().cloned().fold(f64::INFINITY, f64::min),
        "absmax" => v.iter().map(|x| x.abs()).fold(0.0, f64::max),
        "mean" | "avg" => mean(&v),
        "last" => *v.last().unwrap(),
        "first" => v[0],
        "rms" => rms(&v),
        "std" => std_dev(&v),
        "sum" => v.iter().sum(),
        "range" | "peak2peak" => v.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - v.iter().cloned().fold(f64::INFINITY, f64::min),
        "median" => quantile(&v, 0.5),
        "count" => v.len() as f64,
        other => {
            if let Some(p) = other.strip_prefix('p') {
                let q: f64 = p.parse().map_err(|_| format!("unknown aggregate \"{other}\""))?;
                quantile(&v, q / 100.0)
            } else {
                return Err(format!("unknown aggregate \"{other}\" (max, min, mean, last, first, rms, std, sum, absmax, range, median, count, p5 … p95)"));
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_header_units_and_text() {
        let t = parse_csv("t (s),y [V],name\n0,1,a\n1,2,b\n2,3,c\n", "data").unwrap();
        assert_eq!(t.columns.len(), 3);
        assert_eq!(t.columns[0].name, "t");
        assert_eq!(t.columns[0].unit, "s");
        assert_eq!(t.columns[1].unit, "V");
        assert!(t.columns[2].is_text());
        assert_eq!(t.x, Some(0));
        let back = table_csv(&t);
        assert!(back.starts_with("t (s),y (V),name\n0,1,a"));
    }

    #[test]
    fn csv_semicolon_decimal_comma() {
        let t = parse_csv("a;b\n1,5;2\n3;4,25\n", "x").unwrap();
        assert_eq!(t.columns[0].values, vec![1.5, 3.0]);
        assert_eq!(t.columns[1].values, vec![2.0, 4.25]);
    }

    #[test]
    fn aggregates() {
        let v = [1.0, 2.0, 3.0, 4.0, f64::NAN];
        assert_eq!(aggregate(&v, "max").unwrap(), 4.0);
        assert_eq!(aggregate(&v, "mean").unwrap(), 2.5);
        assert_eq!(aggregate(&v, "p50").unwrap(), 2.5);
        assert!(aggregate(&v, "bogus").is_err());
        assert_eq!(interp(&[0.0, 1.0, 2.0], &[0.0, 10.0, 20.0], 1.5), 15.0);
    }
}

/// A number with `digits` significant digits, without trailing zeros (like printf %g).
pub fn g(v: f64, digits: usize) -> String {
    if !v.is_finite() {
        return format!("{v}");
    }
    if v == 0.0 {
        return "0".into();
    }
    let exp = v.abs().log10().floor() as i32;
    if exp < -4 || exp >= digits as i32 {
        let s = format!("{:.*e}", digits.saturating_sub(1), v);
        let (mant, e) = s.split_once('e').unwrap_or((&s, "0"));
        let mant = if mant.contains('.') { mant.trim_end_matches('0').trim_end_matches('.') } else { mant };
        format!("{mant}e{e}")
    } else {
        let decimals = (digits as i32 - 1 - exp).max(0) as usize;
        let s = format!("{:.*}", decimals, v);
        if s.contains('.') { s.trim_end_matches('0').trim_end_matches('.').to_string() } else { s }
    }
}

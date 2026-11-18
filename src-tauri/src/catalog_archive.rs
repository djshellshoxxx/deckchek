//! Selected native setup aggregates and their complete catalog dependencies.
//! Archive values never pass through the CRUD projections or JavaScript numbers.
use crate::{backup, db};
use rusqlite::{params, params_from_iter, types::ValueRef, Connection, TransactionBehavior};
use serde::{
    de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor},
    ser::SerializeMap,
    Deserialize, Deserializer, Serialize, Serializer,
};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fmt;
use std::io::Write;
use tauri::AppHandle;

const FORMAT: &str = "deckchek-native-setup-catalog";
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_ROWS: usize = 10_000;
const MAX_DEPTH: usize = 24;
const MAX_DIAGNOSTICS: usize = 100;
const TABLE_COUNT: usize = 10;
const MANUFACTURER: usize = 0;
const VENUE: usize = 1;
const PRODUCT: usize = 2;
const BOOTH: usize = 3;
const POSITION: usize = 4;
const SUPPORT: usize = 5;
const ASSET: usize = 6;
const SNAPSHOT: usize = 7;
const SETUP: usize = 8;
const COMPONENT: usize = 9;

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Text,
    Integer,
    Real,
}
#[derive(Clone, Copy)]
struct Column {
    name: &'static str,
    kind: Kind,
    nullable: bool,
    parent: Option<usize>,
}
struct Table {
    name: &'static str,
    columns: &'static [Column],
}
const fn column(name: &'static str, kind: Kind, nullable: bool, parent: Option<usize>) -> Column {
    Column {
        name,
        kind,
        nullable,
        parent,
    }
}
macro_rules! text {
    ($name:literal) => {
        column($name, Kind::Text, false, None)
    };
}
macro_rules! optional {
    ($name:literal) => {
        column($name, Kind::Text, true, None)
    };
}
macro_rules! real {
    ($name:literal) => {
        column($name, Kind::Real, true, None)
    };
}
macro_rules! reference {
    ($name:literal, $table:ident, $nullable:literal) => {
        column($name, Kind::Text, $nullable, Some($table))
    };
}
// Fixed storage columns in dependency insertion order. Future schema additions are
// refused by the shared authoritative schema guard before these projections run.
const TABLES: [Table; TABLE_COUNT] = [
    Table {
        name: "manufacturer",
        columns: &[
            text!("id"),
            text!("name"),
            optional!("website"),
            optional!("notes"),
            text!("created_at"),
            text!("updated_at"),
        ],
    },
    Table {
        name: "venue",
        columns: &[
            text!("id"),
            text!("name"),
            optional!("venue_type"),
            optional!("city"),
            optional!("region"),
            optional!("country"),
            optional!("notes"),
            text!("created_at"),
            text!("updated_at"),
        ],
    },
    Table {
        name: "product",
        columns: &[
            text!("id"),
            reference!("manufacturer_id", MANUFACTURER, true),
            text!("category"),
            text!("model"),
            optional!("variant"),
            optional!("revision"),
            column("release_year", Kind::Integer, true, None),
            column("discontinued_year", Kind::Integer, true, None),
            optional!("region"),
            optional!("description"),
            optional!("source_url"),
            text!("created_at"),
            text!("updated_at"),
        ],
    },
    Table {
        name: "booth",
        columns: &[
            text!("id"),
            reference!("venue_id", VENUE, false),
            text!("name"),
            optional!("indoor_outdoor"),
            optional!("floor_type"),
            optional!("stage_type"),
            optional!("notes"),
        ],
    },
    Table {
        name: "deck_position",
        columns: &[
            text!("id"),
            reference!("booth_id", BOOTH, false),
            text!("name"),
            optional!("orientation"),
            real!("distance_to_monitor_m"),
            real!("distance_to_sub_m"),
            real!("height_m"),
            optional!("notes"),
        ],
    },
    Table {
        name: "support_configuration",
        columns: &[
            text!("id"),
            reference!("deck_position_id", POSITION, true),
            text!("name"),
            optional!("description"),
            text!("structure_json"),
            real!("approximate_mass_kg"),
            optional!("coupled_state"),
            optional!("notes"),
        ],
    },
    Table {
        name: "asset",
        columns: &[
            text!("id"),
            reference!("product_id", PRODUCT, true),
            text!("nickname"),
            optional!("serial_number"),
            optional!("purchase_date"),
            optional!("installed_date"),
            optional!("retired_date"),
            optional!("firmware"),
            optional!("condition"),
            optional!("notes"),
            column("is_deleted", Kind::Integer, false, None),
            text!("created_at"),
            text!("updated_at"),
            real!("rated_life_hours"),
            reference!("deck_position_id", POSITION, true),
            optional!("public_notes"),
        ],
    },
    Table {
        name: "asset_settings_snapshot",
        columns: &[
            text!("id"),
            reference!("asset_id", ASSET, false),
            text!("captured_at"),
            real!("tracking_force_g"),
            real!("anti_skate"),
            real!("arm_height"),
            real!("pitch_range"),
            optional!("brake_setting"),
            optional!("torque_setting"),
            optional!("cartridge_alignment"),
            real!("input_gain"),
            optional!("firmware"),
            optional!("custom_json"),
        ],
    },
    Table {
        name: "setup",
        columns: &[
            text!("id"),
            text!("name"),
            optional!("profile"),
            reference!("venue_id", VENUE, true),
            reference!("booth_id", BOOTH, true),
            reference!("deck_position_id", POSITION, true),
            reference!("support_configuration_id", SUPPORT, true),
            optional!("notes"),
            text!("created_at"),
        ],
    },
    Table {
        name: "setup_component",
        columns: &[
            text!("id"),
            reference!("setup_id", SETUP, false),
            text!("role"),
            reference!("asset_id", ASSET, false),
            optional!("position"),
            reference!("settings_snapshot_id", SNAPSHOT, true),
        ],
    },
];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
enum Cell {
    Null,
    Text(String),
    Integer(i64),
    Real(f64),
}
impl Cell {
    fn text(&self) -> Option<&str> {
        if let Self::Text(value) = self {
            Some(value)
        } else {
            None
        }
    }
    fn sql(&self) -> rusqlite::types::Value {
        use rusqlite::types::Value;
        match self {
            Self::Null => Value::Null,
            Self::Text(v) => Value::Text(v.clone()),
            Self::Integer(v) => Value::Integer(*v),
            Self::Real(v) => Value::Real(*v),
        }
    }
}
struct CellSeed(Column);
impl<'de> DeserializeSeed<'de> for CellSeed {
    type Value = Cell;
    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Cell, D::Error> {
        struct CellVisitor(Column);
        impl<'de> Visitor<'de> for CellVisitor {
            type Value = Cell;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                write!(f, "the declared SQLite column type")
            }
            fn visit_unit<E: de::Error>(self) -> Result<Cell, E> {
                if self.0.nullable {
                    Ok(Cell::Null)
                } else {
                    Err(E::custom("a required column is null"))
                }
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Cell, E> {
                if self.0.kind == Kind::Text {
                    Ok(Cell::Text(v.to_owned()))
                } else {
                    Err(E::custom("text in a numeric column"))
                }
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Cell, E> {
                match self.0.kind {
                    Kind::Integer => Ok(Cell::Integer(v)),
                    Kind::Real if (v as f64) as i128 == i128::from(v) => Ok(Cell::Real(v as f64)),
                    _ => Err(E::custom(
                        "integer does not exactly fit the declared column type",
                    )),
                }
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Cell, E> {
                self.visit_i64(
                    i64::try_from(v)
                        .map_err(|_| E::custom("integer exceeds SQLite signed 64-bit range"))?,
                )
            }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Cell, E> {
                if self.0.kind == Kind::Real && v.is_finite() {
                    Ok(Cell::Real(v))
                } else {
                    Err(E::custom("non-finite or non-real numeric column"))
                }
            }
        }
        deserializer.deserialize_any(CellVisitor(self.0))
    }
}

#[derive(Clone, Debug, PartialEq)]
struct Record {
    table: usize,
    cells: Vec<Cell>,
}
impl Record {
    fn id(&self) -> &str {
        self.cells[0].text().expect("validated text ID")
    }
    fn field(&self, name: &str) -> &Cell {
        &self.cells[TABLES[self.table]
            .columns
            .iter()
            .position(|c| c.name == name)
            .expect("fixed column")]
    }
    fn text(&self, name: &str) -> Option<&str> {
        self.field(name).text()
    }
}
impl Serialize for Record {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.cells.len()))?;
        for (column, value) in TABLES[self.table].columns.iter().zip(&self.cells) {
            map.serialize_entry(column.name, value)?;
        }
        map.end()
    }
}
struct RecordSeed(usize);
impl<'de> DeserializeSeed<'de> for RecordSeed {
    type Value = Record;
    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Record, D::Error> {
        struct RecordVisitor(usize);
        impl<'de> Visitor<'de> for RecordVisitor {
            type Value = Record;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                write!(f, "a complete fixed catalog row")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Record, M::Error> {
                let columns = TABLES[self.0].columns;
                let mut cells = vec![None; columns.len()];
                while let Some(key) = map.next_key::<String>()? {
                    let index = columns
                        .iter()
                        .position(|c| c.name == key)
                        .ok_or_else(|| de::Error::custom("unknown row column"))?;
                    if cells[index].is_some() {
                        return Err(de::Error::custom("duplicate row column"));
                    }
                    cells[index] = Some(map.next_value_seed(CellSeed(columns[index]))?);
                }
                if cells.iter().any(Option::is_none) {
                    return Err(de::Error::custom(
                        "missing row column; optional SQL values must be explicit null",
                    ));
                }
                Ok(Record {
                    table: self.0,
                    cells: cells.into_iter().map(Option::unwrap).collect(),
                })
            }
        }
        deserializer.deserialize_map(RecordVisitor(self.0))
    }
}

#[derive(Clone, Debug, PartialEq)]
struct CatalogTables(Vec<Vec<Record>>);
impl Serialize for CatalogTables {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(TABLE_COUNT))?;
        for (table, rows) in TABLES.iter().zip(&self.0) {
            map.serialize_entry(table.name, rows)?;
        }
        map.end()
    }
}
impl<'de> Deserialize<'de> for CatalogTables {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct RowsSeed<'a> {
            table: usize,
            total: &'a mut usize,
        }
        impl<'de> DeserializeSeed<'de> for RowsSeed<'_> {
            type Value = Vec<Record>;
            fn deserialize<D: Deserializer<'de>>(
                self,
                deserializer: D,
            ) -> Result<Self::Value, D::Error> {
                struct RowsVisitor<'a>(RowsSeed<'a>);
                impl<'de> Visitor<'de> for RowsVisitor<'_> {
                    type Value = Vec<Record>;
                    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                        write!(f, "a bounded row array")
                    }
                    fn visit_seq<A: SeqAccess<'de>>(
                        self,
                        mut seq: A,
                    ) -> Result<Self::Value, A::Error> {
                        struct CountedRecord<'a> {
                            table: usize,
                            total: &'a mut usize,
                        }
                        impl<'de> DeserializeSeed<'de> for CountedRecord<'_> {
                            type Value = Record;
                            fn deserialize<D: Deserializer<'de>>(
                                self,
                                d: D,
                            ) -> Result<Record, D::Error> {
                                if *self.total >= MAX_ROWS {
                                    return Err(de::Error::custom("catalog exceeds 10,000 rows"));
                                }
                                *self.total += 1;
                                RecordSeed(self.table).deserialize(d)
                            }
                        }
                        let mut rows = Vec::new();
                        while let Some(row) = seq.next_element_seed(CountedRecord {
                            table: self.0.table,
                            total: self.0.total,
                        })? {
                            rows.push(row);
                        }
                        Ok(rows)
                    }
                }
                deserializer.deserialize_seq(RowsVisitor(self))
            }
        }
        struct TablesVisitor;
        impl<'de> Visitor<'de> for TablesVisitor {
            type Value = CatalogTables;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                write!(f, "all ten fixed native catalog tables")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut rows = vec![Vec::new(); TABLE_COUNT];
                let mut seen = [false; TABLE_COUNT];
                let mut total = 0;
                while let Some(key) = map.next_key::<String>()? {
                    let table = TABLES
                        .iter()
                        .position(|t| t.name == key)
                        .ok_or_else(|| de::Error::custom("unknown catalog table"))?;
                    if seen[table] {
                        return Err(de::Error::custom("duplicate catalog table"));
                    }
                    seen[table] = true;
                    rows[table] = map.next_value_seed(RowsSeed {
                        table,
                        total: &mut total,
                    })?;
                }
                if seen.contains(&false) {
                    return Err(de::Error::custom("all ten catalog arrays are required"));
                }
                Ok(CatalogTables(rows))
            }
        }
        deserializer.deserialize_map(TablesVisitor)
    }
}
fn deserialize_ids<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<String>, D::Error> {
    struct IdsVisitor;
    impl<'de> Visitor<'de> for IdsVisitor {
        type Value = Vec<String>;
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            write!(f, "one to 10,000 selected setup IDs")
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Vec<String>, A::Error> {
            let mut ids = Vec::new();
            while let Some(id) = seq.next_element::<String>()? {
                if ids.len() >= MAX_ROWS {
                    return Err(de::Error::custom("too many selected setup IDs"));
                }
                ids.push(id);
            }
            Ok(ids)
        }
    }
    deserializer.deserialize_seq(IdsVisitor)
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Archive {
    format: String,
    format_version: u32,
    exported_at: String,
    #[serde(deserialize_with = "deserialize_ids")]
    setup_ids: Vec<String>,
    tables: CatalogTables,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveError {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview: Option<Box<Preview>>,
}
impl ArchiveError {
    fn invalid(message: impl AsRef<str>) -> Self {
        Self {
            code: "NATIVE_CATALOG_INVALID",
            message: short(message.as_ref()),
            preview: None,
        }
    }
    fn storage(error: impl fmt::Display) -> Self {
        Self {
            code: "NATIVE_CATALOG_STORAGE",
            message: short(&format!("Catalog operation failed: {error}")),
            preview: None,
        }
    }
}
impl fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.message)
    }
}
fn short(value: &str) -> String {
    value.chars().take(240).collect()
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    tables: BTreeMap<String, usize>,
    total: usize,
}
fn counts(tables: &CatalogTables) -> Counts {
    Counts {
        tables: TABLES
            .iter()
            .enumerate()
            .map(|(i, t)| (t.name.to_owned(), tables.0[i].len()))
            .collect(),
        total: tables.0.iter().map(Vec::len).sum(),
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    table: &'static str,
    id: String,
    reason: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyReuse {
    table: &'static str,
    id: String,
    source_created_at: String,
    source_updated_at: String,
    destination_created_at: String,
    destination_updated_at: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    counts: Counts,
    to_import: usize,
    already_present: usize,
    reused_dependencies: usize,
    can_import: bool,
    conflict_count: usize,
    conflicts: Vec<Diagnostic>,
    dependency_reuses: Vec<DependencyReuse>,
    warning_count: usize,
    warnings: Vec<Diagnostic>,
}
impl Preview {
    fn diagnostic(&mut self, row: &Record, reason: &str, conflict: bool) {
        let (count, records) = if conflict {
            (&mut self.conflict_count, &mut self.conflicts)
        } else {
            (&mut self.warning_count, &mut self.warnings)
        };
        *count += 1;
        if records.len() < MAX_DIAGNOSTICS {
            records.push(Diagnostic {
                table: TABLES[row.table].name,
                id: short(row.id()),
                reason: short(reason),
            });
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exported {
    text: String,
    counts: Counts,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    inserted: usize,
    already_present: usize,
    reused_dependencies: usize,
    counts: Counts,
}
#[derive(Debug, Serialize)]
pub struct SetupChoice {
    id: String,
    name: String,
}

fn utc_stamp(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() != 24
        || [4, 7].iter().any(|&i| b[i] != b'-')
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'.'
        || b[23] != b'Z'
    {
        return false;
    }
    if b.iter()
        .enumerate()
        .any(|(i, c)| ![4, 7, 10, 13, 16, 19, 23].contains(&i) && !c.is_ascii_digit())
    {
        return false;
    }
    let n = |a: usize, z: usize| {
        b[a..z]
            .iter()
            .fold(0u32, |v, c| v * 10 + u32::from(c - b'0'))
    };
    let y = n(0, 4);
    let m = n(5, 7);
    let d = n(8, 10);
    let days = match m {
        4 | 6 | 9 | 11 => 30,
        2 if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) => 29,
        2 => 28,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    d > 0 && d <= days && n(11, 13) < 24 && n(14, 16) < 60 && n(17, 19) < 60
}
fn bound_json(text: &str) -> Result<(), ArchiveError> {
    if text.len() > MAX_BYTES {
        return Err(ArchiveError::invalid(
            "Catalog files are limited to 32 MiB.",
        ));
    }
    let mut quoted = false;
    let mut escaped = false;
    let mut depth = 0usize;
    for b in text.bytes() {
        if quoted {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                quoted = false;
            }
        } else if b == b'"' {
            quoted = true;
        } else if b == b'{' || b == b'[' {
            depth += 1;
            if depth > MAX_DEPTH {
                return Err(ArchiveError::invalid("Catalog JSON exceeds depth 24."));
            }
        } else if b == b'}' || b == b']' {
            depth = depth.saturating_sub(1);
        }
    }
    Ok(())
}
fn parse_archive(text: &str) -> Result<Archive, ArchiveError> {
    bound_json(text)?;
    let archive: Archive = serde_json::from_str(text)
        .map_err(|e| ArchiveError::invalid(format!("Invalid native catalog JSON: {e}")))?;
    if archive.format != FORMAT || archive.format_version != 1 {
        return Err(ArchiveError::invalid(
            "Unsupported native setup catalog format or version.",
        ));
    }
    if !utc_stamp(&archive.exported_at) {
        return Err(ArchiveError::invalid(
            "exportedAt must be a canonical UTC timestamp with milliseconds.",
        ));
    }
    validate_graph(&archive)?;
    Ok(archive)
}
type Index<'a> = Vec<BTreeMap<&'a str, &'a Record>>;
fn indexes(archive: &Archive) -> Result<Index<'_>, ArchiveError> {
    let mut index = vec![BTreeMap::new(); TABLE_COUNT];
    for (table, rows) in archive.tables.0.iter().enumerate() {
        for (at, row) in rows.iter().enumerate() {
            if row.id().is_empty() || index[table].insert(row.id(), row).is_some() {
                return Err(ArchiveError::invalid(format!(
                    "{}.rows[{at}] has an empty or duplicate ID.",
                    TABLES[table].name
                )));
            }
        }
    }
    Ok(index)
}
fn validate_graph(archive: &Archive) -> Result<(), ArchiveError> {
    if archive.setup_ids.is_empty()
        || archive.setup_ids.len() > MAX_ROWS
        || archive.setup_ids.iter().any(String::is_empty)
    {
        return Err(ArchiveError::invalid(
            "Select one to 10,000 nonempty setup IDs.",
        ));
    }
    if archive.setup_ids.iter().collect::<BTreeSet<_>>().len() != archive.setup_ids.len() {
        return Err(ArchiveError::invalid("Selected setup IDs must be unique."));
    }
    if counts(&archive.tables).total > MAX_ROWS {
        return Err(ArchiveError::invalid("Catalog exceeds 10,000 rows."));
    }
    let index = indexes(archive)?;
    let mut components: BTreeMap<&str, Vec<&Record>> = BTreeMap::new();
    for row in &archive.tables.0[COMPONENT] {
        components
            .entry(row.text("setup_id").expect("required parent"))
            .or_default()
            .push(row);
    }
    let mut queue: VecDeque<_> = archive
        .setup_ids
        .iter()
        .map(|id| (SETUP, id.as_str()))
        .collect();
    let mut reached = BTreeSet::new();
    while let Some((table, id)) = queue.pop_front() {
        if !reached.insert((table, id)) {
            continue;
        }
        let row = index[table].get(id).ok_or_else(|| {
            ArchiveError::invalid(
                "The incoming catalog is missing a selected setup or referenced parent.",
            )
        })?;
        for (column, value) in TABLES[table].columns.iter().zip(&row.cells) {
            if let (Some(parent), Some(id)) = (column.parent, value.text()) {
                queue.push_back((parent, id));
            }
        }
        if table == SETUP {
            for child in components.get(id).into_iter().flatten() {
                queue.push_back((COMPONENT, child.id()));
            }
        }
    }
    if reached.len() != counts(&archive.tables).total {
        return Err(ArchiveError::invalid(
            "The file includes rows outside the selected setups' complete dependency graph.",
        ));
    }
    // SQLite owns NOCASE semantics. Use its actual constraint instead of a Unicode
    // lowercase approximation; this temporary connection never writes the target.
    let names = Connection::open_in_memory().map_err(ArchiveError::storage)?;
    names
        .execute_batch("CREATE TABLE names(name TEXT NOT NULL COLLATE NOCASE UNIQUE);")
        .map_err(ArchiveError::storage)?;
    for row in &archive.tables.0[MANUFACTURER] {
        names
            .execute(
                "INSERT INTO names(name) VALUES(?1)",
                [row.text("name").expect("required name")],
            )
            .map_err(|_| {
                ArchiveError::invalid("Incoming manufacturer names collide under SQLite NOCASE.")
            })?;
    }
    Ok(())
}

fn validate_database(conn: &Connection) -> Result<(), ArchiveError> {
    conn.pragma_update(None, "trusted_schema", "OFF")
        .map_err(ArchiveError::storage)?;
    backup::validate_catalog_schema(conn).map_err(ArchiveError::storage)?;
    let enabled: bool = conn
        .pragma_query_value(None, "foreign_keys", |row| row.get(0))
        .map_err(ArchiveError::storage)?;
    if !enabled {
        return Err(ArchiveError::invalid(
            "Catalog operations require foreign-key enforcement.",
        ));
    }
    let mut check = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(ArchiveError::storage)?;
    if check
        .query([])
        .map_err(ArchiveError::storage)?
        .next()
        .map_err(ArchiveError::storage)?
        .is_some()
    {
        return Err(ArchiveError::invalid("The current database has dangling foreign-key references. No catalog records were written."));
    }
    Ok(())
}
fn projection(table: usize) -> String {
    TABLES[table]
        .columns
        .iter()
        .map(|c| c.name)
        .collect::<Vec<_>>()
        .join(",")
}
fn read_record(
    row: &rusqlite::Row<'_>,
    table: usize,
    bytes: &mut usize,
) -> Result<Record, ArchiveError> {
    let mut cells = Vec::new();
    for (i, column) in TABLES[table].columns.iter().enumerate() {
        let value = row.get_ref(i).map_err(ArchiveError::storage)?;
        let cell = match value {
            ValueRef::Null if column.nullable => Cell::Null,
            ValueRef::Text(v) if column.kind == Kind::Text => {
                *bytes = bytes
                    .checked_add(v.len())
                    .ok_or_else(|| ArchiveError::invalid("Catalog text exceeds its limit."))?;
                if *bytes > MAX_BYTES {
                    return Err(ArchiveError::invalid(
                        "Included catalog values exceed 32 MiB.",
                    ));
                }
                Cell::Text(
                    std::str::from_utf8(v)
                        .map_err(|_| {
                            ArchiveError::invalid("A catalog TEXT value is not valid UTF-8.")
                        })?
                        .to_owned(),
                )
            }
            ValueRef::Integer(v) if column.kind == Kind::Integer => Cell::Integer(v),
            ValueRef::Integer(v)
                if column.kind == Kind::Real && (v as f64) as i128 == i128::from(v) =>
            {
                Cell::Real(v as f64)
            }
            ValueRef::Real(v) if column.kind == Kind::Real && v.is_finite() => Cell::Real(v),
            _ => {
                return Err(ArchiveError::invalid(format!(
                    "{}.{} has an unsupported SQLite value type.",
                    TABLES[table].name, column.name
                )))
            }
        };
        cells.push(cell);
    }
    let record = Record { table, cells };
    if record.id().is_empty() {
        return Err(ArchiveError::invalid("A catalog record has an empty ID."));
    }
    Ok(record)
}
fn read_one(
    conn: &Connection,
    table: usize,
    id: &str,
    bytes: &mut usize,
) -> Result<Option<Record>, ArchiveError> {
    let sql = format!(
        "SELECT {} FROM {} WHERE id=?1",
        projection(table),
        TABLES[table].name
    );
    let mut statement = conn.prepare(&sql).map_err(ArchiveError::storage)?;
    let mut rows = statement.query([id]).map_err(ArchiveError::storage)?;
    rows.next()
        .map_err(ArchiveError::storage)?
        .map(|row| read_record(row, table, bytes))
        .transpose()
}
fn queue_id(
    table: usize,
    id: &str,
    queued: &mut BTreeSet<(usize, String)>,
    queue: &mut VecDeque<(usize, String)>,
) -> Result<(), ArchiveError> {
    let key = (table, id.to_owned());
    if queued.insert(key.clone()) {
        if queued.len() > MAX_ROWS {
            return Err(ArchiveError::invalid(
                "Selected setup graph exceeds 10,000 rows.",
            ));
        }
        queue.push_back(key);
    }
    Ok(())
}
fn collect_archive(conn: &Connection, mut setup_ids: Vec<String>) -> Result<Archive, ArchiveError> {
    if setup_ids.is_empty()
        || setup_ids.len() > MAX_ROWS
        || setup_ids.iter().any(String::is_empty)
        || setup_ids
            .iter()
            .try_fold(0usize, |sum, id| sum.checked_add(id.len()))
            .is_none_or(|sum| sum > MAX_BYTES)
    {
        return Err(ArchiveError::invalid(
            "Select one to 10,000 valid saved setup IDs, within 32 MiB.",
        ));
    }
    setup_ids.sort();
    if setup_ids.windows(2).any(|v| v[0] == v[1]) {
        return Err(ArchiveError::invalid("Selected setup IDs must be unique."));
    }
    let mut queued = BTreeSet::new();
    let mut queue = VecDeque::new();
    for id in &setup_ids {
        queue_id(SETUP, id, &mut queued, &mut queue)?;
    }
    let mut tables = CatalogTables(vec![Vec::new(); TABLE_COUNT]);
    let mut bytes = 0;
    while let Some((table, id)) = queue.pop_front() {
        let row = read_one(conn, table, &id, &mut bytes)?.ok_or_else(|| {
            ArchiveError::invalid("A selected setup or catalog dependency does not exist.")
        })?;
        for (column, value) in TABLES[table].columns.iter().zip(&row.cells) {
            if let (Some(parent), Some(id)) = (column.parent, value.text()) {
                queue_id(parent, id, &mut queued, &mut queue)?;
            }
        }
        if table == SETUP {
            let mut st = conn
                .prepare("SELECT id FROM setup_component WHERE setup_id=?1 ORDER BY id")
                .map_err(ArchiveError::storage)?;
            let mut children = st.query([&id]).map_err(ArchiveError::storage)?;
            while let Some(child) = children.next().map_err(ArchiveError::storage)? {
                let id: String = child.get(0).map_err(ArchiveError::storage)?;
                queue_id(COMPONENT, &id, &mut queued, &mut queue)?;
            }
        }
        tables.0[table].push(row);
    }
    for rows in &mut tables.0 {
        rows.sort_by(|a, b| a.id().cmp(b.id()));
    }
    let archive = Archive {
        format: FORMAT.to_owned(),
        format_version: 1,
        exported_at: db::now_iso(conn).map_err(ArchiveError::storage)?,
        setup_ids,
        tables,
    };
    validate_graph(&archive)?;
    Ok(archive)
}
struct BoundedJson(Vec<u8>);
impl Write for BoundedJson {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > MAX_BYTES.saturating_sub(self.0.len()) {
            return Err(std::io::Error::other("Catalog JSON exceeds 32 MiB."));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
fn serialize_archive(archive: &Archive) -> Result<String, ArchiveError> {
    let mut writer = BoundedJson(Vec::new());
    serde_json::to_writer(&mut writer, archive).map_err(ArchiveError::storage)?;
    String::from_utf8(writer.0).map_err(ArchiveError::storage)
}
fn export_archive(conn: &mut Connection, setup_ids: Vec<String>) -> Result<Exported, ArchiveError> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ArchiveError::storage)?;
    validate_database(&tx)?;
    let archive = collect_archive(&tx, setup_ids)?;
    let result = Exported {
        text: serialize_archive(&archive)?,
        counts: counts(&archive.tables),
    };
    tx.commit().map_err(ArchiveError::storage)?;
    Ok(result)
}

fn same_dependency(source: &Record, target: &Record) -> bool {
    matches!(source.table, MANUFACTURER | PRODUCT)
        && source
            .cells
            .iter()
            .zip(&target.cells)
            .zip(TABLES[source.table].columns)
            .all(|((a, b), column)| matches!(column.name, "created_at" | "updated_at") || a == b)
}
struct ImportPlan {
    preview: Preview,
    missing: Vec<(usize, usize)>,
}
fn compare_destination(conn: &Connection, archive: &Archive) -> Result<ImportPlan, ArchiveError> {
    let index = indexes(archive)?;
    let mut preview = Preview {
        counts: counts(&archive.tables),
        to_import: 0,
        already_present: 0,
        reused_dependencies: 0,
        can_import: false,
        conflict_count: 0,
        conflicts: Vec::new(),
        dependency_reuses: Vec::new(),
        warning_count: 0,
        warnings: Vec::new(),
    };
    let mut missing = Vec::new();
    let mut bytes = 0;
    let mut exact_setups = BTreeSet::new();
    let mut existing_setups = BTreeMap::new();
    let mut exact_components: BTreeMap<&str, usize> = BTreeMap::new();
    for (table, rows) in archive.tables.0.iter().enumerate() {
        for (at, source) in rows.iter().enumerate() {
            let target = read_one(conn, table, source.id(), &mut bytes)?;
            match &target {
                None => {
                    preview.to_import += 1;
                    missing.push((table, at));
                }
                Some(target) if target == source => {
                    preview.already_present += 1;
                    if table == COMPONENT {
                        *exact_components
                            .entry(source.text("setup_id").unwrap())
                            .or_default() += 1;
                    }
                }
                Some(target) if same_dependency(source, target) => {
                    preview.reused_dependencies += 1;
                    if preview.dependency_reuses.len() < MAX_DIAGNOSTICS {
                        preview.dependency_reuses.push(DependencyReuse {
                            table: TABLES[table].name,
                            id: short(source.id()),
                            source_created_at: short(source.text("created_at").unwrap()),
                            source_updated_at: short(source.text("updated_at").unwrap()),
                            destination_created_at: short(target.text("created_at").unwrap()),
                            destination_updated_at: short(target.text("updated_at").unwrap()),
                        });
                    }
                }
                Some(_) => {
                    preview.diagnostic(source, "The existing ID has different saved values.", true)
                }
            }
            if table == MANUFACTURER {
                let mut st = conn
                    .prepare("SELECT id FROM manufacturer WHERE name=?1 COLLATE NOCASE AND id<>?2")
                    .map_err(ArchiveError::storage)?;
                if st
                    .query(params![source.text("name"), source.id()])
                    .map_err(ArchiveError::storage)?
                    .next()
                    .map_err(ArchiveError::storage)?
                    .is_some()
                {
                    preview.diagnostic(
                        source,
                        "The manufacturer name belongs to another ID under SQLite NOCASE.",
                        true,
                    );
                }
            }
            if table == SETUP && target.is_some() {
                existing_setups.insert(source.id(), target.as_ref() == Some(source));
            }
        }
    }
    for setup in &archive.tables.0[SETUP] {
        if let Some(row_exact) = existing_setups.get(setup.id()) {
            let expected = archive.tables.0[COMPONENT]
                .iter()
                .filter(|row| row.text("setup_id") == Some(setup.id()))
                .count();
            let target_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM setup_component WHERE setup_id=?1",
                    [setup.id()],
                    |row| row.get(0),
                )
                .map_err(ArchiveError::storage)?;
            // Every incoming component was compared by its globally unique ID and
            // every column above. Equal counts then exclude extra target members.
            let matches = target_count == expected as i64
                && exact_components.get(setup.id()).copied().unwrap_or(0) == expected;
            if !matches {
                preview.diagnostic(
                    setup,
                    "The existing setup has a different complete component set.",
                    true,
                );
            } else if *row_exact {
                exact_setups.insert(setup.id());
            }
        }
    }
    for row in &archive.tables.0[COMPONENT] {
        if let Some(snapshot) = row.text("settings_snapshot_id") {
            if index[SNAPSHOT][snapshot].text("asset_id") != row.text("asset_id")
                && !exact_setups.contains(row.text("setup_id").unwrap())
            {
                preview.diagnostic(
                    row,
                    "A new component association cannot use another asset's settings snapshot.",
                    true,
                );
            }
        }
    }
    for setup in &archive.tables.0[SETUP] {
        if let Some(support) = setup.text("support_configuration_id") {
            if let Some(position) = index[SUPPORT][support].text("deck_position_id") {
                if setup.text("deck_position_id") != Some(position)
                    && !exact_setups.contains(setup.id())
                {
                    preview.diagnostic(setup, "A new setup association cannot use support bound to a different deck position.", true);
                }
            }
        }
        let position = setup.text("deck_position_id").map(|id| index[POSITION][id]);
        let booth = setup.text("booth_id").map(|id| index[BOOTH][id]);
        if let (Some(position), Some(booth)) = (position, booth) {
            if position.text("booth_id") != Some(booth.id()) {
                preview.diagnostic(setup, "Saved setup booth and deck-position context disagree; the recorded nullable context is preserved.", false);
            }
        }
        if let Some(venue) = setup.text("venue_id") {
            let position_booth = position
                .and_then(|p| p.text("booth_id"))
                .map(|id| index[BOOTH][id]);
            if booth.is_some_and(|b| b.text("venue_id") != Some(venue))
                || position_booth.is_some_and(|b| b.text("venue_id") != Some(venue))
            {
                preview.diagnostic(setup, "Saved setup venue and placement context disagree; no location is inferred or rewritten.", false);
            }
        }
    }
    preview.can_import = preview.conflict_count == 0;
    Ok(ImportPlan { preview, missing })
}
fn preview_archive(conn: &mut Connection, text: &str) -> Result<Preview, ArchiveError> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ArchiveError::storage)?;
    validate_database(&tx)?;
    let archive = parse_archive(text)?;
    let preview = compare_destination(&tx, &archive)?.preview;
    tx.commit().map_err(ArchiveError::storage)?;
    Ok(preview)
}
fn insert_record(conn: &Connection, row: &Record) -> Result<(), ArchiveError> {
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        TABLES[row.table].name,
        projection(row.table),
        vec!["?"; row.cells.len()].join(",")
    );
    let values: Vec<_> = row.cells.iter().map(Cell::sql).collect();
    conn.execute(&sql, params_from_iter(&values))
        .map_err(ArchiveError::storage)?;
    Ok(())
}
fn import_archive_with(
    conn: &mut Connection,
    text: &str,
    mut after_insert: impl FnMut(&Connection, usize) -> Result<(), ArchiveError>,
) -> Result<Imported, ArchiveError> {
    // Parsing, current destination comparison and every insert share this write
    // transaction. A UI preview is never an authority for a later import.
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ArchiveError::storage)?;
    validate_database(&tx)?;
    let archive = parse_archive(text)?;
    let plan = compare_destination(&tx, &archive)?;
    if !plan.preview.can_import {
        return Err(ArchiveError {
            code: "NATIVE_CATALOG_CONFLICT",
            message: "Conflicting saved values block the entire native catalog import.".into(),
            preview: Some(Box::new(plan.preview)),
        });
    }
    for (done, &(table, at)) in plan.missing.iter().enumerate() {
        insert_record(&tx, &archive.tables.0[table][at])?;
        after_insert(&tx, done + 1)?;
    }
    let result = Imported {
        inserted: plan.missing.len(),
        already_present: plan.preview.already_present,
        reused_dependencies: plan.preview.reused_dependencies,
        counts: plan.preview.counts,
    };
    tx.commit().map_err(ArchiveError::storage)?;
    Ok(result)
}
fn import_archive(conn: &mut Connection, text: &str) -> Result<Imported, ArchiveError> {
    import_archive_with(conn, text, |_, _| Ok(()))
}
fn list_setups(conn: &mut Connection) -> Result<Vec<SetupChoice>, ArchiveError> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ArchiveError::storage)?;
    validate_database(&tx)?;
    let mut out = Vec::new();
    let mut bytes = 0;
    {
        let sql = format!("SELECT {} FROM setup ORDER BY id", projection(SETUP));
        let mut st = tx.prepare(&sql).map_err(ArchiveError::storage)?;
        let mut rows = st.query([]).map_err(ArchiveError::storage)?;
        while let Some(row) = rows.next().map_err(ArchiveError::storage)? {
            if out.len() >= MAX_ROWS {
                return Err(ArchiveError::invalid(
                    "Setup selection exceeds 10,000 saved setups.",
                ));
            }
            let row = read_record(row, SETUP, &mut bytes)?;
            out.push(SetupChoice {
                id: row.id().to_owned(),
                name: row.text("name").unwrap().to_owned(),
            });
        }
    }
    tx.commit().map_err(ArchiveError::storage)?;
    Ok(out)
}

#[tauri::command]
pub async fn catalog_archive_setups(app: AppHandle) -> Result<Vec<SetupChoice>, ArchiveError> {
    db::off_main(move || {
        let path = db::database_path(&app).map_err(ArchiveError::storage)?;
        let mut conn = db::open_database(&path).map_err(ArchiveError::storage)?;
        list_setups(&mut conn)
    })
    .await
    .map_err(ArchiveError::storage)?
}
#[tauri::command]
pub async fn catalog_archive_export(
    app: AppHandle,
    setup_ids: Vec<String>,
) -> Result<Exported, ArchiveError> {
    db::off_main(move || {
        let path = db::database_path(&app).map_err(ArchiveError::storage)?;
        let mut conn = db::open_database(&path).map_err(ArchiveError::storage)?;
        export_archive(&mut conn, setup_ids)
    })
    .await
    .map_err(ArchiveError::storage)?
}
#[tauri::command]
pub async fn catalog_archive_preview(
    app: AppHandle,
    text: String,
) -> Result<Preview, ArchiveError> {
    db::off_main(move || {
        let path = db::database_path(&app).map_err(ArchiveError::storage)?;
        let mut conn = db::open_database(&path).map_err(ArchiveError::storage)?;
        preview_archive(&mut conn, &text)
    })
    .await
    .map_err(ArchiveError::storage)?
}
#[tauri::command]
pub async fn catalog_archive_import(
    app: AppHandle,
    text: String,
) -> Result<Imported, ArchiveError> {
    db::off_main(move || {
        let path = db::database_path(&app).map_err(ArchiveError::storage)?;
        let mut conn = db::open_database(&path).map_err(ArchiveError::storage)?;
        import_archive(&mut conn, &text)
    })
    .await
    .map_err(ArchiveError::storage)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::types::Value as Sql;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../tests/contracts/native-setup-catalog.json");
    const SEED: &str = include_str!("../../database/seed.sql");
    fn fresh(seed: bool) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;")
            .unwrap();
        db::apply_migrations(&conn).unwrap();
        if seed {
            conn.execute_batch(SEED).unwrap();
        }
        conn
    }
    fn fixture() -> Archive {
        parse_archive(FIXTURE).unwrap()
    }
    fn text(archive: &Archive) -> String {
        serialize_archive(archive).unwrap()
    }
    fn populate(conn: &Connection, json: &str) {
        // Fixture setup deliberately uses generic JSON columns and independent
        // SQL binding, not the archive's typed reader or insert_record function.
        let fixture: Value = serde_json::from_str(json).unwrap();
        for table in [
            "manufacturer",
            "venue",
            "product",
            "booth",
            "deck_position",
            "support_configuration",
            "asset",
            "asset_settings_snapshot",
            "setup",
            "setup_component",
        ] {
            for record in fixture["tables"][table].as_array().unwrap() {
                let object = record.as_object().unwrap();
                let exists: bool = conn
                    .query_row(
                        &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
                        [record["id"].as_str().unwrap()],
                        |r| r.get(0),
                    )
                    .unwrap();
                if exists {
                    assert!(matches!(table, "manufacturer" | "product"));
                    continue;
                }
                let columns: Vec<_> = object.keys().map(String::as_str).collect();
                let values: Vec<_> = object
                    .values()
                    .map(|value| match value {
                        Value::Null => Sql::Null,
                        Value::String(v) => Sql::Text(v.clone()),
                        Value::Number(v) if v.is_i64() => Sql::Integer(v.as_i64().unwrap()),
                        Value::Number(v) => Sql::Real(v.as_f64().unwrap()),
                        _ => panic!("fixture column is not a scalar"),
                    })
                    .collect();
                let sql = format!(
                    "INSERT INTO {table} ({}) VALUES ({})",
                    columns.join(","),
                    vec!["?"; columns.len()].join(",")
                );
                conn.execute(&sql, params_from_iter(values)).unwrap();
            }
        }
    }
    fn source() -> Connection {
        let conn = fresh(false);
        populate(&conn, FIXTURE);
        conn
    }
    fn raw_row(conn: &Connection, table: &str, id: &str) -> Vec<String> {
        conn.query_row(&format!("SELECT * FROM {table} WHERE id=?1"), [id], |row| {
            (0..row.as_ref().column_count())
                .map(|i| row.get_ref(i).map(|value| format!("{value:?}")))
                .collect()
        })
        .unwrap()
    }
    fn dump(conn: &Connection) -> BTreeMap<String, Vec<Vec<String>>> {
        let mut statement = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,7)<>'sqlite_' ORDER BY name").unwrap();
        let names: Vec<String> = statement
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        names
            .into_iter()
            .map(|name| {
                let mut statement = conn
                    .prepare(&format!(
                        "SELECT * FROM \"{}\" ORDER BY rowid",
                        name.replace('"', "\"\"")
                    ))
                    .unwrap();
                let count = statement.column_count();
                let rows = statement
                    .query_map([], |row| {
                        (0..count)
                            .map(|i| row.get_ref(i).map(|value| format!("{value:?}")))
                            .collect::<rusqlite::Result<Vec<_>>>()
                    })
                    .unwrap()
                    .collect::<rusqlite::Result<Vec<_>>>()
                    .unwrap();
                (name, rows)
            })
            .collect()
    }
    fn set(archive: &mut Archive, table: usize, at: usize, key: &str, value: Cell) {
        let index = TABLES[table]
            .columns
            .iter()
            .position(|c| c.name == key)
            .unwrap();
        archive.tables.0[table][at].cells[index] = value;
    }
    fn changed(cell: &Cell, kind: Kind) -> Cell {
        match cell {
            Cell::Text(value) => Cell::Text(format!("{value} changed")),
            Cell::Integer(value) => Cell::Integer(value + 1),
            Cell::Real(value) => Cell::Real(value + 0.125),
            Cell::Null => match kind {
                Kind::Text => Cell::Text(String::new()),
                Kind::Integer => Cell::Integer(1),
                Kind::Real => Cell::Real(1.5),
            },
        }
    }

    #[test]
    fn fixed_contract_covers_every_current_column_and_preserves_independent_sql_values() {
        let mut source = source();
        for table in &TABLES {
            let mut st = source
                .prepare(&format!("PRAGMA table_info({})", table.name))
                .unwrap();
            let actual: Vec<String> = st
                .query_map([], |r| r.get(1))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            assert_eq!(
                actual,
                table.columns.iter().map(|c| c.name).collect::<Vec<_>>(),
                "{} complete columns",
                table.name
            );
        }
        source.execute("INSERT INTO venue(id,name,created_at,updated_at) VALUES('unselected','Unrelated','old','old')", []).unwrap();
        source.execute("INSERT INTO product_spec(id,product_id,key,provenance_type) VALUES('spec-excluded','product-big','private','TEST')", []).unwrap();
        let exported =
            export_archive(&mut source, vec!["setup-b".into(), "setup-a".into()]).unwrap();
        assert_eq!(exported.counts.total, 16);
        assert!(!exported.text.contains("unselected"));
        assert!(!exported.text.contains("spec-excluded"));
        let mut target = fresh(false);
        target.execute("INSERT INTO venue(id,name,created_at,updated_at) VALUES('target-only','Retain','local','local')", []).unwrap();
        let before = dump(&target);
        let changes = target.total_changes();
        let preview = preview_archive(&mut target, &exported.text).unwrap();
        assert!(preview.can_import);
        assert_eq!(preview.to_import, 16);
        assert_eq!(target.total_changes(), changes);
        assert_eq!(dump(&target), before);
        assert_eq!(
            import_archive(&mut target, &exported.text)
                .unwrap()
                .inserted,
            16
        );
        let fixture = fixture();
        for (table, rows) in fixture.tables.0.iter().enumerate() {
            for row in rows {
                assert_eq!(
                    raw_row(&source, TABLES[table].name, row.id()),
                    raw_row(&target, TABLES[table].name, row.id()),
                    "{} {} all SQL columns",
                    TABLES[table].name,
                    row.id()
                );
            }
        }
        let after = dump(&target);
        for (table, rows) in &before {
            if !TABLES.iter().any(|t| t.name == table) {
                assert_eq!(&after[table], rows, "unrelated {table}");
            }
        }
        assert_eq!(
            raw_row(&target, "venue", "target-only")[1],
            "Text([82, 101, 116, 97, 105, 110])"
        );
        let saved = dump(&target);
        let changes = target.total_changes();
        let retry = import_archive(&mut target, &exported.text).unwrap();
        assert_eq!(
            (
                retry.inserted,
                retry.already_present,
                retry.reused_dependencies
            ),
            (0, 16, 0)
        );
        assert_eq!(dump(&target), saved);
        assert_eq!(target.total_changes(), changes);
        let again = export_archive(&mut target, vec!["setup-a".into(), "setup-b".into()]).unwrap();
        let first = parse_archive(&exported.text).unwrap();
        let second = parse_archive(&again.text).unwrap();
        assert_eq!(first.tables, second.tables);
        assert_eq!(first.setup_ids, second.setup_ids);
    }

    #[test]
    fn independently_seeded_installations_reuse_only_dependency_timestamps_and_retry_without_writes(
    ) {
        let mut source = fresh(true);
        populate(&source, FIXTURE);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let mut target = fresh(true);
        let id = "00000000-0000-4000-8000-000000000001";
        let source_time: String = source
            .query_row(
                "SELECT created_at FROM manufacturer WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        let target_time: String = target
            .query_row(
                "SELECT created_at FROM manufacturer WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert_ne!(
            source_time, target_time,
            "two real seed executions must have distinct CURRENT_TIMESTAMP values"
        );
        let maker = raw_row(&target, "manufacturer", id);
        let product_id = "10000000-0000-4000-8000-000000000001";
        let product = raw_row(&target, "product", product_id);
        let exported =
            export_archive(&mut source, vec!["setup-a".into(), "setup-b".into()]).unwrap();
        let preview = preview_archive(&mut target, &exported.text).unwrap();
        assert_eq!(
            (
                preview.to_import,
                preview.already_present,
                preview.reused_dependencies
            ),
            (14, 0, 2)
        );
        assert_eq!(preview.dependency_reuses.len(), 2);
        assert_eq!(preview.dependency_reuses[0].source_created_at, source_time);
        assert_eq!(
            preview.dependency_reuses[0].destination_created_at,
            target_time
        );
        let before = dump(&target);
        let result = import_archive(&mut target, &exported.text).unwrap();
        assert_eq!((result.inserted, result.reused_dependencies), (14, 2));
        assert_eq!(raw_row(&target, "manufacturer", id), maker);
        assert_eq!(raw_row(&target, "product", product_id), product);
        let after = dump(&target);
        for (table, rows) in before {
            if !TABLES.iter().any(|t| t.name == table) {
                assert_eq!(after[&table], rows, "unrelated seeded {table}");
            }
        }
        for row in &fixture().tables.0[ASSET] {
            assert_eq!(
                raw_row(&source, "asset", row.id()),
                raw_row(&target, "asset", row.id())
            );
        }
        let snapshot = dump(&target);
        let changes = target.total_changes();
        let retry = import_archive(&mut target, &exported.text).unwrap();
        assert_eq!(
            (
                retry.inserted,
                retry.already_present,
                retry.reused_dependencies
            ),
            (0, 14, 2)
        );
        assert_eq!(target.total_changes(), changes);
        assert_eq!(dump(&target), snapshot);
    }

    #[test]
    fn all_non_timestamp_dependency_values_and_all_leaf_values_remain_strict_conflicts() {
        let original = fixture();
        let mut target = source();
        let before = dump(&target);
        for (table, rows) in original.tables.0.iter().enumerate() {
            for (at, row) in rows.iter().enumerate() {
                for (column, value) in TABLES[table].columns.iter().zip(&row.cells).skip(1) {
                    if column.parent.is_some()
                        || (matches!(table, MANUFACTURER | PRODUCT)
                            && matches!(column.name, "created_at" | "updated_at"))
                    {
                        continue;
                    }
                    let mut candidate = original.clone();
                    set(
                        &mut candidate,
                        table,
                        at,
                        column.name,
                        changed(value, column.kind),
                    );
                    let failure = import_archive(&mut target, &text(&candidate)).unwrap_err();
                    assert_eq!(
                        failure.code, "NATIVE_CATALOG_CONFLICT",
                        "{}.{}",
                        TABLES[table].name, column.name
                    );
                    assert_eq!(
                        dump(&target),
                        before,
                        "{}.{} changed destination",
                        TABLES[table].name,
                        column.name
                    );
                }
            }
        }
        let mut candidate = original.clone();
        let mut other = candidate.tables.0[MANUFACTURER][0].clone();
        other.cells[0] = Cell::Text("another-manufacturer".into());
        other.cells[1] = Cell::Text("Another maker".into());
        candidate.tables.0[MANUFACTURER].push(other);
        set(
            &mut candidate,
            PRODUCT,
            0,
            "manufacturer_id",
            Cell::Text("another-manufacturer".into()),
        );
        assert_eq!(
            import_archive(&mut target, &text(&candidate))
                .unwrap_err()
                .code,
            "NATIVE_CATALOG_CONFLICT"
        );
        assert_eq!(dump(&target), before);
    }

    #[test]
    fn every_declared_foreign_key_requires_its_incoming_parent_even_if_destination_has_it() {
        let original = fixture();
        let mut target = source();
        let before = dump(&target);
        for (table, rows) in original.tables.0.iter().enumerate() {
            for (at, row) in rows.iter().enumerate() {
                for (column, value) in TABLES[table].columns.iter().zip(&row.cells) {
                    if column.parent.is_none() || matches!(value, Cell::Null) {
                        continue;
                    }
                    let mut candidate = original.clone();
                    set(
                        &mut candidate,
                        table,
                        at,
                        column.name,
                        Cell::Text("missing-parent".into()),
                    );
                    assert!(
                        import_archive(&mut target, &text(&candidate)).is_err(),
                        "{}.{} missing parent",
                        TABLES[table].name,
                        column.name
                    );
                    assert_eq!(dump(&target), before);
                }
            }
        }
        for table in 0..TABLE_COUNT {
            let mut candidate = original.clone();
            candidate.tables.0[table].remove(0);
            assert!(
                preview_archive(&mut target, &text(&candidate)).is_err(),
                "{} missing incoming record is not concealed by target",
                TABLES[table].name
            );
        }
    }

    #[test]
    fn duplicate_ids_missing_roots_and_unreachable_rows_are_refused_without_writes() {
        let original = fixture();
        let mut target = fresh(false);
        let before = dump(&target);
        for table in 0..TABLE_COUNT {
            let mut candidate = original.clone();
            let duplicate = candidate.tables.0[table][0].clone();
            candidate.tables.0[table].push(duplicate);
            assert!(
                import_archive(&mut target, &text(&candidate)).is_err(),
                "duplicate {}",
                TABLES[table].name
            );
        }
        for ids in [
            vec![],
            vec!["missing".into()],
            vec!["setup-a".into()],
            vec!["setup-a".into(), "setup-a".into()],
            vec![String::new()],
        ] {
            let mut candidate = original.clone();
            candidate.setup_ids = ids;
            assert!(import_archive(&mut target, &text(&candidate)).is_err());
        }
        let mut candidate = original.clone();
        let mut venue = candidate.tables.0[VENUE][0].clone();
        venue.cells[0] = Cell::Text("injected".into());
        candidate.tables.0[VENUE].push(venue);
        assert!(import_archive(&mut target, &text(&candidate)).is_err());
        assert_eq!(dump(&target), before);
    }

    #[test]
    fn manufacturer_name_collisions_use_actual_sqlite_nocase_and_never_rebind_ids() {
        let mut target = fresh(false);
        target.execute("INSERT INTO manufacturer(id,name,created_at,updated_at) VALUES('different-id','TECHNICS','local','local')", []).unwrap();
        let before = dump(&target);
        let result = preview_archive(&mut target, FIXTURE).unwrap();
        assert!(!result.can_import);
        assert!(result.conflicts.iter().any(|d| d.reason.contains("NOCASE")));
        assert!(import_archive(&mut target, FIXTURE).is_err());
        assert_eq!(dump(&target), before);
        let mut candidate = fixture();
        let mut manufacturer = candidate.tables.0[MANUFACTURER][0].clone();
        manufacturer.cells[0] = Cell::Text("incoming-other".into());
        manufacturer.cells[1] = Cell::Text("TECHNICS".into());
        candidate.tables.0[MANUFACTURER].push(manufacturer);
        set(
            &mut candidate,
            PRODUCT,
            1,
            "manufacturer_id",
            Cell::Text("incoming-other".into()),
        );
        assert!(parse_archive(&text(&candidate))
            .unwrap_err()
            .message
            .contains("NOCASE"));
    }

    #[test]
    fn existing_setups_require_their_complete_owned_component_set() {
        for change in ["extra", "missing", "moved", "changed"] {
            let mut target = source();
            match change {
                "extra" => {
                    target.execute("INSERT INTO setup_component(id,setup_id,role,asset_id) VALUES('target-extra','setup-a','deck','asset-b')", []).unwrap();
                }
                "missing" => {
                    target
                        .execute("DELETE FROM setup_component WHERE id='component-a'", [])
                        .unwrap();
                }
                "moved" => {
                    target
                        .execute(
                            "UPDATE setup_component SET setup_id='setup-b' WHERE id='component-a'",
                            [],
                        )
                        .unwrap();
                }
                _ => {
                    target
                        .execute(
                            "UPDATE setup_component SET position='changed' WHERE id='component-a'",
                            [],
                        )
                        .unwrap();
                }
            }
            let before = dump(&target);
            let preview = preview_archive(&mut target, FIXTURE).unwrap();
            assert!(!preview.can_import, "{change}");
            assert!(
                preview
                    .conflicts
                    .iter()
                    .any(|row| row.reason.contains("complete component set")),
                "{change}"
            );
            assert!(import_archive(&mut target, FIXTURE).is_err());
            assert_eq!(dump(&target), before);
        }
    }

    #[test]
    fn new_snapshot_and_support_associations_refuse_mismatch_but_exact_legacy_aggregates_are_no_write(
    ) {
        for snapshot in [true, false] {
            let mut legacy = fixture();
            if snapshot {
                set(
                    &mut legacy,
                    COMPONENT,
                    0,
                    "asset_id",
                    Cell::Text("asset-b".into()),
                );
            } else {
                set(&mut legacy, SETUP, 0, "deck_position_id", Cell::Null);
            }
            let raw = text(&legacy);
            let mut fresh_target = fresh(false);
            let before = dump(&fresh_target);
            assert!(!preview_archive(&mut fresh_target, &raw).unwrap().can_import);
            assert_eq!(
                import_archive(&mut fresh_target, &raw).unwrap_err().code,
                "NATIVE_CATALOG_CONFLICT"
            );
            assert_eq!(dump(&fresh_target), before);
            let mut existing = fresh(false);
            populate(&existing, &raw);
            let before = dump(&existing);
            let changes = existing.total_changes();
            let same = import_archive(&mut existing, &raw).unwrap();
            assert_eq!(same.inserted, 0);
            assert_eq!(same.already_present, 16);
            assert_eq!(existing.total_changes(), changes);
            assert_eq!(dump(&existing), before);
            let exported =
                export_archive(&mut existing, vec!["setup-a".into(), "setup-b".into()]).unwrap();
            assert!(
                !preview_archive(&mut fresh_target, &exported.text)
                    .unwrap()
                    .can_import
            );
        }
    }

    #[test]
    fn nullable_or_contradictory_location_context_is_preserved_and_disclosed_without_new_policy() {
        let mut source = fixture();
        let mut other = source.tables.0[VENUE][0].clone();
        other.cells[0] = Cell::Text("another-venue".into());
        source.tables.0[VENUE].push(other);
        set(
            &mut source,
            SETUP,
            0,
            "venue_id",
            Cell::Text("another-venue".into()),
        );
        let mut target = fresh(false);
        let raw = text(&source);
        let preview = preview_archive(&mut target, &raw).unwrap();
        assert!(preview.can_import);
        assert!(preview.warning_count > 0);
        import_archive(&mut target, &raw).unwrap();
        let context: (Option<String>, Option<String>, Option<String>) = target
            .query_row(
                "SELECT venue_id,booth_id,deck_position_id FROM setup WHERE id='setup-b'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(context, (Some("venue-a".into()), None, None));
        assert_eq!(
            target
                .query_row("SELECT venue_id FROM setup WHERE id='setup-a'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "another-venue"
        );
    }

    #[test]
    fn stale_preview_is_revalidated_and_a_late_insert_failure_rolls_back_every_table() {
        let mut target = fresh(false);
        assert!(preview_archive(&mut target, FIXTURE).unwrap().can_import);
        target.execute("INSERT INTO manufacturer(id,name,website,created_at,updated_at) VALUES('00000000-0000-4000-8000-000000000001','Technics','changed','now','now')", []).unwrap();
        let before = dump(&target);
        assert_eq!(
            import_archive(&mut target, FIXTURE).unwrap_err().code,
            "NATIVE_CATALOG_CONFLICT"
        );
        assert_eq!(dump(&target), before);
        let mut target = fresh(false);
        let before = dump(&target);
        let mut reached = 0;
        let result = import_archive_with(&mut target, FIXTURE, |conn, inserted| {
            reached = inserted;
            if inserted == 15 {
                conn.execute("INSERT INTO setup_component(id,setup_id,role,asset_id) VALUES('forced-late-failure','missing-setup','deck','asset-b')", []).map_err(ArchiveError::storage)?;
            }
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(reached, 15);
        assert_eq!(dump(&target), before);
        assert_eq!(import_archive(&mut target, FIXTURE).unwrap().inserted, 16);
    }

    #[test]
    fn strict_json_refuses_unknown_duplicate_and_missing_fields_at_every_fixed_layer() {
        let original = text(&fixture());
        let mut target = fresh(false);
        let before = dump(&target);
        let mut bad = vec![
            original.replacen(
                "\"formatVersion\":1",
                "\"formatVersion\":1,\"formatVersion\":1",
                1,
            ),
            original.replacen(
                "\"manufacturer\":[",
                "\"manufacturer\":[],\"manufacturer\":[",
                1,
            ),
            original.replacen("\"id\":", "\"id\":\"duplicate\",\"id\":", 1),
            original.replacen("\"format\":", "\"unexpected\":1,\"format\":", 1),
            original.replacen("\"tables\":{", "\"tables\":{\"unexpected\":[],", 1),
            original.replacen("\"id\":", "\"unexpected\":null,\"id\":", 1),
        ];
        for key in [
            "format",
            "formatVersion",
            "exportedAt",
            "setupIds",
            "tables",
        ] {
            let mut value: Value = serde_json::from_str(&original).unwrap();
            value.as_object_mut().unwrap().remove(key);
            bad.push(value.to_string());
        }
        for table in &TABLES {
            let mut value: Value = serde_json::from_str(&original).unwrap();
            value["tables"].as_object_mut().unwrap().remove(table.name);
            bad.push(value.to_string());
            for column in table.columns {
                let mut value: Value = serde_json::from_str(&original).unwrap();
                value["tables"][table.name][0]
                    .as_object_mut()
                    .unwrap()
                    .remove(column.name);
                bad.push(value.to_string());
            }
        }
        for input in bad {
            assert!(import_archive(&mut target, &input).is_err());
            assert_eq!(dump(&target), before);
        }
    }

    #[test]
    fn invalid_scalars_canonical_envelope_and_types_are_refused_with_bounded_diagnostics() {
        let original = text(&fixture());
        for (key, value) in [
            ("format", Value::String("deckchek-catalog".into())),
            ("formatVersion", Value::from(2)),
            ("formatVersion", Value::from(-1)),
            (
                "exportedAt",
                Value::String("2026-02-30T00:00:00.000Z".into()),
            ),
            ("exportedAt", Value::String("2026-11-18T00:00:00Z".into())),
        ] {
            let mut candidate: Value = serde_json::from_str(&original).unwrap();
            candidate[key] = value;
            assert!(parse_archive(&candidate.to_string()).is_err());
        }
        for value in [
            Value::Bool(true),
            Value::String("1".into()),
            Value::from(1.5),
            Value::Null,
            serde_json::json!({}),
            serde_json::json!([]),
        ] {
            let mut candidate: Value = serde_json::from_str(&original).unwrap();
            candidate["tables"]["asset"][0]["is_deleted"] = value;
            assert!(parse_archive(&candidate.to_string()).is_err());
        }
        for number in [
            "9223372036854775808",
            "-9223372036854775809",
            "9007199254740993.0",
            "1e400",
            "NaN",
            "Infinity",
        ] {
            let candidate = original.replacen("9007199254740993", number, 1);
            assert!(parse_archive(&candidate).is_err(), "{number}");
        }
        let candidate = format!("{{\"{}\":1}}", "a".repeat(100_000));
        let error = parse_archive(&candidate).unwrap_err();
        assert!(error.message.chars().count() <= 240);
        assert!(utc_stamp("2000-02-29T23:59:59.999Z"));
        assert!(!utc_stamp("1900-02-29T23:59:59.999Z"));
        assert!(!utc_stamp("2026-11-18T24:00:00.000Z"));
    }

    #[test]
    fn literal_text_large_integers_and_legitimate_replacement_characters_survive_native_round_trip()
    {
        let mut original = fixture();
        set(
            &mut original,
            ASSET,
            1,
            "notes",
            Cell::Text("literal \u{fffd} text".into()),
        );
        let mut target = fresh(false);
        import_archive(&mut target, &text(&original)).unwrap();
        let integer: i64 = target
            .query_row(
                "SELECT release_year FROM product WHERE id='product-big'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(integer, 9_007_199_254_740_993);
        let exported = export_archive(&mut target, original.setup_ids.clone()).unwrap();
        assert!(exported.text.contains("9007199254740993"));
        let result = parse_archive(&exported.text).unwrap();
        assert_eq!(
            result.tables.0[SUPPORT][0].field("structure_json"),
            original.tables.0[SUPPORT][0].field("structure_json")
        );
        assert_eq!(
            result.tables.0[SNAPSHOT][0].field("custom_json"),
            original.tables.0[SNAPSHOT][0].field("custom_json")
        );
        assert_eq!(
            target
                .query_row("SELECT notes FROM asset WHERE id='asset-b'", [], |r| r
                    .get::<_, String>(
                    0
                ))
                .unwrap(),
            "literal \u{fffd} text"
        );
    }

    #[test]
    fn invalid_utf8_blobs_nonfinite_or_incompatible_sql_values_refuse_export_and_target_comparison()
    {
        for sql in [
            "UPDATE asset SET notes=CAST(X'80' AS TEXT) WHERE id='asset-b'",
            "UPDATE asset SET notes=X'6162' WHERE id='asset-b'",
            "UPDATE product SET release_year=1.5 WHERE id='product-big'",
            "UPDATE asset SET rated_life_hours='not a number' WHERE id='asset-b'",
            "UPDATE deck_position SET height_m=1e999 WHERE id='position-a'",
        ] {
            let mut target = source();
            target.execute(sql, []).unwrap();
            let before = dump(&target);
            assert!(
                export_archive(&mut target, vec!["setup-a".into(), "setup-b".into()]).is_err(),
                "{sql}"
            );
            assert!(preview_archive(&mut target, FIXTURE).is_err(), "{sql}");
            assert!(import_archive(&mut target, FIXTURE).is_err(), "{sql}");
            assert_eq!(dump(&target), before);
        }
    }

    #[test]
    fn schema_drift_and_preexisting_foreign_key_damage_are_refused_before_archive_writes() {
        for schema in ["ALTER TABLE asset ADD COLUMN extra_archive_value TEXT", "CREATE TRIGGER archive_extra AFTER INSERT ON asset BEGIN UPDATE venue SET notes='changed'; END", "CREATE INDEX archive_extra ON asset(nickname)"] {
            let mut target = fresh(false); target.execute_batch(schema).unwrap(); let before = dump(&target);
            assert!(preview_archive(&mut target, FIXTURE).is_err()); assert!(import_archive(&mut target, FIXTURE).is_err()); assert_eq!(dump(&target), before);
        }
        let mut target = fresh(false);
        target.execute_batch("PRAGMA foreign_keys=OFF; INSERT INTO asset(id,product_id,nickname,created_at,updated_at) VALUES('orphan','product-big','Dangling','old','old'); PRAGMA foreign_keys=ON;").unwrap();
        let before = dump(&target);
        assert!(import_archive(&mut target, FIXTURE)
            .unwrap_err()
            .message
            .contains("dangling"));
        assert_eq!(dump(&target), before);
        let mut target = fresh(false);
        target.execute_batch("PRAGMA foreign_keys=OFF;").unwrap();
        assert!(import_archive(&mut target, FIXTURE).is_err());
    }

    #[test]
    fn exact_byte_row_and_depth_limits_refuse_oversized_files_without_partial_output() {
        let mut candidate = fixture();
        set(&mut candidate, ASSET, 1, "notes", Cell::Text(String::new()));
        let overhead = text(&candidate).len();
        set(
            &mut candidate,
            ASSET,
            1,
            "notes",
            Cell::Text("x".repeat(MAX_BYTES - overhead)),
        );
        let exact = text(&candidate);
        assert_eq!(exact.len(), MAX_BYTES);
        assert!(parse_archive(&exact).is_ok());
        drop(exact);
        set(
            &mut candidate,
            ASSET,
            1,
            "notes",
            Cell::Text("x".repeat(MAX_BYTES - overhead + 1)),
        );
        assert!(serialize_archive(&candidate).is_err());
        drop(candidate);
        assert!(parse_archive(&" ".repeat(MAX_BYTES + 1)).is_err());
        let mut candidate = fixture();
        for i in 16..MAX_ROWS {
            let mut row = candidate.tables.0[COMPONENT][0].clone();
            row.cells[0] = Cell::Text(format!("extra-{i}"));
            candidate.tables.0[COMPONENT].push(row);
        }
        assert_eq!(
            counts(&parse_archive(&text(&candidate)).unwrap().tables).total,
            MAX_ROWS
        );
        let mut row = candidate.tables.0[COMPONENT][0].clone();
        row.cells[0] = Cell::Text("one-too-many".into());
        candidate.tables.0[COMPONENT].push(row);
        assert!(parse_archive(&text(&candidate)).is_err());
        assert!(bound_json(&format!("{}0{}", "[".repeat(24), "]".repeat(24))).is_ok());
        assert!(bound_json(&format!("{}0{}", "[".repeat(25), "]".repeat(25))).is_err());
        assert!(
            bound_json(&serde_json::to_string(&"[".repeat(1000)).unwrap()).is_ok(),
            "opaque string braces do not become nesting"
        );
    }

    #[test]
    fn export_and_setup_selection_are_read_only_and_reject_missing_duplicate_or_empty_roots() {
        let mut source = source();
        let before = dump(&source);
        let changes = source.total_changes();
        let setups = list_setups(&mut source).unwrap();
        assert_eq!(setups.len(), 2);
        assert_eq!(setups[0].id, "setup-a");
        for ids in [
            vec![],
            vec!["missing".into()],
            vec!["setup-a".into(), "setup-a".into()],
            vec![String::new()],
        ] {
            assert!(export_archive(&mut source, ids).is_err());
        }
        let one = export_archive(&mut source, vec!["setup-b".into()]).unwrap();
        assert_eq!(one.counts.tables["setup"], 1);
        assert_eq!(one.counts.tables["setup_component"], 1);
        assert_eq!(one.counts.tables["asset_settings_snapshot"], 0);
        assert_eq!(dump(&source), before);
        assert_eq!(source.total_changes(), changes);
    }

    #[test]
    fn diagnostic_arrays_are_bounded_while_every_conflict_still_blocks_the_import() {
        let mut input = fixture();
        for i in 0..150 {
            let mut component = input.tables.0[COMPONENT][0].clone();
            component.cells[0] = Cell::Text(format!("diagnostic-{i}"));
            input.tables.0[COMPONENT].push(component);
        }
        let mut target = fresh(false);
        populate(&target, &text(&input));
        target
            .execute("UPDATE setup_component SET role='different'", [])
            .unwrap();
        let before = dump(&target);
        let preview = preview_archive(&mut target, &text(&input)).unwrap();
        assert!(preview.conflict_count > 100);
        assert_eq!(preview.conflicts.len(), 100);
        assert!(!preview.can_import);
        assert!(import_archive(&mut target, &text(&input)).is_err());
        assert_eq!(dump(&target), before);
    }
}

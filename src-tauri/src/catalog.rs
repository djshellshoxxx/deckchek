//! Catalog CRUD (manufacturer, product, asset, setup, venue, support description).
//!
//! All SQL is parameterized. Table and column names come exclusively from the
//! static [`EntitySpec`] whitelists below, never from caller input.

use rusqlite::{params_from_iter, types::Value as Sql, Connection};
use serde_json::{json, Map, Value};
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

const SEED_SQL: &str = include_str!("../../database/seed.sql");
const SEED_MARKER_VERSION: i64 = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Entity {
    Manufacturer,
    Product,
    Asset,
    Setup,
    Venue,
    SupportConfiguration,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Text,
    Int,
    Real,
}

struct Col {
    key: &'static str,
    col: &'static str,
    kind: Kind,
    required: bool,
}

const fn c(key: &'static str, col: &'static str, kind: Kind, required: bool) -> Col {
    Col {
        key,
        col,
        kind,
        required,
    }
}

struct EntitySpec {
    table: &'static str,
    cols: &'static [Col],
    search: &'static [&'static str],
    order: &'static str,
    has_created: bool,
    has_updated: bool,
    soft_delete: bool,
}

use Kind::{Int, Real, Text};

static MANUFACTURER: EntitySpec = EntitySpec {
    table: "manufacturer",
    cols: &[
        c("name", "name", Text, true),
        c("website", "website", Text, false),
        c("notes", "notes", Text, false),
    ],
    search: &["name"],
    order: "name COLLATE NOCASE",
    has_created: true,
    has_updated: true,
    soft_delete: false,
};

static PRODUCT: EntitySpec = EntitySpec {
    table: "product",
    cols: &[
        c("manufacturerId", "manufacturer_id", Text, false),
        c("category", "category", Text, true),
        c("model", "model", Text, true),
        c("variant", "variant", Text, false),
        c("revision", "revision", Text, false),
        c("releaseYear", "release_year", Int, false),
        c("discontinuedYear", "discontinued_year", Int, false),
        c("region", "region", Text, false),
        c("description", "description", Text, false),
        c("sourceUrl", "source_url", Text, false),
    ],
    search: &["model", "variant", "description"],
    order: "category, model COLLATE NOCASE",
    has_created: true,
    has_updated: true,
    soft_delete: false,
};

static ASSET: EntitySpec = EntitySpec {
    table: "asset",
    cols: &[
        c("productId", "product_id", Text, false),
        c("nickname", "nickname", Text, true),
        c("serialNumber", "serial_number", Text, false),
        c("purchaseDate", "purchase_date", Text, false),
        c("installedDate", "installed_date", Text, false),
        c("retiredDate", "retired_date", Text, false),
        c("firmware", "firmware", Text, false),
        c("condition", "condition", Text, false),
        c("notes", "notes", Text, false),
    ],
    search: &["nickname", "serial_number"],
    order: "nickname COLLATE NOCASE",
    has_created: true,
    has_updated: true,
    soft_delete: true,
};

static SETUP: EntitySpec = EntitySpec {
    table: "setup",
    cols: &[
        c("name", "name", Text, true),
        c("profile", "profile", Text, false),
        c("venueId", "venue_id", Text, false),
        c("boothId", "booth_id", Text, false),
        c("deckPositionId", "deck_position_id", Text, false),
        c(
            "supportConfigurationId",
            "support_configuration_id",
            Text,
            false,
        ),
        c("notes", "notes", Text, false),
    ],
    search: &["name"],
    order: "name COLLATE NOCASE",
    has_created: true,
    has_updated: false,
    soft_delete: false,
};

static VENUE: EntitySpec = EntitySpec {
    table: "venue",
    cols: &[
        c("name", "name", Text, true),
        c("venueType", "venue_type", Text, false),
        c("city", "city", Text, false),
        c("region", "region", Text, false),
        c("country", "country", Text, false),
        c("notes", "notes", Text, false),
    ],
    search: &["name", "city"],
    order: "name COLLATE NOCASE",
    has_created: true,
    has_updated: true,
    soft_delete: false,
};

static SUPPORT_CONFIGURATION: EntitySpec = EntitySpec {
    table: "support_configuration",
    cols: &[
        c("deckPositionId", "deck_position_id", Text, false),
        c("name", "name", Text, true),
        c("description", "description", Text, false),
        c("structureJson", "structure_json", Text, true),
        c("approximateMassKg", "approximate_mass_kg", Real, false),
        c("coupledState", "coupled_state", Text, false),
        c("notes", "notes", Text, false),
    ],
    search: &["name", "description", "coupled_state", "notes"],
    order: "name COLLATE NOCASE",
    has_created: false,
    has_updated: false,
    soft_delete: false,
};

static COMPONENT_COLS: &[Col] = &[
    c("role", "role", Text, true),
    c("assetId", "asset_id", Text, true),
    c("position", "position", Text, false),
    c("settingsSnapshotId", "settings_snapshot_id", Text, false),
];

impl Entity {
    pub fn parse(s: &str) -> Result<Entity, String> {
        match s {
            "manufacturer" => Ok(Entity::Manufacturer),
            "product" => Ok(Entity::Product),
            "asset" => Ok(Entity::Asset),
            "setup" => Ok(Entity::Setup),
            "venue" => Ok(Entity::Venue),
            "supportConfiguration" => Ok(Entity::SupportConfiguration),
            other => Err(format!("unknown catalog entity: {other}")),
        }
    }

    fn spec(self) -> &'static EntitySpec {
        match self {
            Entity::Manufacturer => &MANUFACTURER,
            Entity::Product => &PRODUCT,
            Entity::Asset => &ASSET,
            Entity::Setup => &SETUP,
            Entity::Venue => &VENUE,
            Entity::SupportConfiguration => &SUPPORT_CONFIGURATION,
        }
    }
}

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn to_sql(col: &Col, v: Option<&Value>) -> Result<Sql, String> {
    match v {
        None | Some(Value::Null) => {
            if col.required {
                Err(format!("field '{}' is required", col.key))
            } else {
                Ok(Sql::Null)
            }
        }
        Some(Value::String(s)) if col.kind == Text => {
            if col.required && s.trim().is_empty() {
                Err(format!("field '{}' is required", col.key))
            } else {
                Ok(Sql::Text(s.clone()))
            }
        }
        Some(Value::Number(n)) if col.kind == Int => n
            .as_i64()
            .map(Sql::Integer)
            .ok_or_else(|| format!("field '{}' must be an integer", col.key)),
        Some(Value::Number(n)) if col.kind == Real => n
            .as_f64()
            .map(Sql::Real)
            .ok_or_else(|| format!("field '{}' must be a number", col.key)),
        Some(_) => Err(format!("field '{}' has the wrong type", col.key)),
    }
}

fn from_sql(v: Sql) -> Value {
    match v {
        Sql::Null => Value::Null,
        Sql::Integer(i) => json!(i),
        Sql::Real(f) => json!(f),
        Sql::Text(s) => json!(s),
        Sql::Blob(_) => Value::Null,
    }
}

fn select_list(spec: &EntitySpec) -> String {
    let mut cols = vec!["id".to_string()];
    cols.extend(spec.cols.iter().map(|c| c.col.to_string()));
    if spec.has_created {
        cols.push("created_at".into());
    }
    if spec.has_updated {
        cols.push("updated_at".into());
    }
    cols.join(", ")
}

fn row_to_json(spec: &EntitySpec, row: &rusqlite::Row) -> rusqlite::Result<Value> {
    let mut m = Map::new();
    m.insert(
        "id".into(),
        from_sql(crate::db::owned_value(row.get_ref(0)?)),
    );
    for (i, col) in spec.cols.iter().enumerate() {
        m.insert(
            col.key.into(),
            from_sql(crate::db::owned_value(row.get_ref(i + 1)?)),
        );
    }
    let n = spec.cols.len();
    if spec.has_created {
        m.insert(
            "createdAt".into(),
            from_sql(crate::db::owned_value(row.get_ref(n + 1)?)),
        );
    }
    if spec.has_updated {
        m.insert(
            "updatedAt".into(),
            from_sql(crate::db::owned_value(
                row.get_ref(n + 1 + usize::from(spec.has_created))?,
            )),
        );
    }
    Ok(Value::Object(m))
}

fn like_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// List records. `filter` may contain `search` (substring match over the
/// entity's searchable columns) and equality filters on any record key
/// (e.g. `{"manufacturerId": "..."}`). Unknown keys are rejected.
pub fn list(
    conn: &Connection,
    entity: Entity,
    filter: Option<&Value>,
) -> Result<Vec<Value>, String> {
    let spec = entity.spec();
    let mut wheres: Vec<String> = Vec::new();
    let mut binds: Vec<Sql> = Vec::new();
    if spec.soft_delete {
        wheres.push("is_deleted = 0".into());
    }
    if let Some(f) = filter {
        let obj = match f {
            Value::Null => None,
            Value::Object(o) => Some(o),
            _ => return Err("filter must be an object".into()),
        };
        for (k, v) in obj.into_iter().flatten() {
            if v.is_null() {
                continue;
            }
            if k == "search" {
                let s = v.as_str().ok_or("search must be a string")?;
                if s.is_empty() {
                    continue;
                }
                let parts: Vec<String> = spec
                    .search
                    .iter()
                    .map(|c| format!("{c} LIKE ? ESCAPE '\\'"))
                    .collect();
                wheres.push(format!("({})", parts.join(" OR ")));
                for _ in spec.search {
                    binds.push(Sql::Text(format!("%{}%", like_escape(s))));
                }
            } else if let Some(col) = spec.cols.iter().find(|c| c.key == k) {
                wheres.push(format!("{} = ?", col.col));
                binds.push(to_sql(
                    &Col {
                        required: false,
                        ..*col
                    },
                    Some(v),
                )?);
            } else {
                return Err(format!("unknown filter key: {k}"));
            }
        }
    }
    let mut sql = format!("SELECT {} FROM {}", select_list(spec), spec.table);
    if !wheres.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&wheres.join(" AND "));
    }
    sql.push_str(&format!(" ORDER BY {}, id", spec.order));
    let mut stmt = conn.prepare(&sql).map_err(err)?;
    let rows = stmt
        .query_map(params_from_iter(binds.iter()), |r| row_to_json(spec, r))
        .map_err(err)?;
    let mut out = rows.collect::<rusqlite::Result<Vec<_>>>().map_err(err)?;
    if entity == Entity::Setup {
        for rec in &mut out {
            let id = rec["id"].as_str().unwrap_or_default().to_string();
            rec["components"] = Value::Array(list_components(conn, &id)?);
        }
    }
    Ok(out)
}

fn list_components(conn: &Connection, setup_id: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, role, asset_id, position, settings_snapshot_id FROM setup_component WHERE setup_id = ?1 ORDER BY role, id")
        .map_err(err)?;
    let rows = stmt
        .query_map([setup_id], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "role": r.get::<_, String>(1)?,
                "assetId": r.get::<_, String>(2)?,
                "position": r.get::<_, Option<String>>(3)?,
                "settingsSnapshotId": r.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(err)
}

pub fn get(conn: &Connection, entity: Entity, id: &str) -> Result<Option<Value>, String> {
    let spec = entity.spec();
    let sql = format!(
        "SELECT {} FROM {} WHERE id = ?1",
        select_list(spec),
        spec.table
    );
    let mut rec = match conn.query_row(&sql, [id], |r| row_to_json(spec, r)) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(err(e)),
    };
    if entity == Entity::Setup {
        rec["components"] = Value::Array(list_components(conn, id)?);
    }
    Ok(Some(rec))
}

/// Only descriptive metadata is writable here. Historical structure bytes and
/// a legacy position binding are never reconstructed from this editor's fields.
fn upsert_support(
    conn: &mut Connection,
    id: &str,
    obj: &Map<String, Value>,
) -> Result<Value, String> {
    if id.trim().is_empty() || id.chars().count() > 128 {
        return Err("Support id must be a non-empty string of at most 128 characters.".into());
    }
    let tx = conn.transaction().map_err(err)?;
    let previous = get(&tx, Entity::SupportConfiguration, id)?;
    for (key, default) in [
        ("deckPositionId", Value::Null),
        ("structureJson", json!("[]")),
    ] {
        let kept = previous
            .as_ref()
            .and_then(|p| p.get(key))
            .unwrap_or(&default);
        if obj.get(key).is_some_and(|value| value != kept) {
            return Err(format!(
                "Support {key} is read-only; existing data was kept."
            ));
        }
    }
    let mut values = Map::new();
    for (key, limit, required) in [
        ("name", 200, true),
        ("description", 5000, false),
        ("coupledState", 200, false),
        ("notes", 5000, false),
    ] {
        let value = obj
            .get(key)
            .or_else(|| previous.as_ref().and_then(|p| p.get(key)));
        let text = match value {
            None | Some(Value::Null) => "",
            Some(Value::String(s)) => s.trim(),
            _ => return Err(format!("Support {key} must be text.")),
        };
        if required && text.is_empty() {
            return Err(format!("Support {key} is required."));
        }
        if text.chars().count() > limit {
            return Err(format!("Support {key} must be at most {limit} characters."));
        }
        values.insert(
            key.into(),
            if text.is_empty() {
                Value::Null
            } else {
                json!(text)
            },
        );
    }
    let mass = obj
        .get("approximateMassKg")
        .or_else(|| previous.as_ref().and_then(|p| p.get("approximateMassKg")))
        .unwrap_or(&Value::Null);
    if !mass.is_null()
        && !mass
            .as_f64()
            .is_some_and(|number| number.is_finite() && number >= 0.0)
    {
        return Err("Support approximateMassKg must be a finite nonnegative number.".into());
    }
    values.insert("approximateMassKg".into(), mass.clone());
    let mut binds = vec![Sql::Text(id.to_string())];
    for key in [
        "name",
        "description",
        "approximateMassKg",
        "coupledState",
        "notes",
    ] {
        let col = SUPPORT_CONFIGURATION
            .cols
            .iter()
            .find(|col| col.key == key)
            .expect("static support column");
        binds.push(to_sql(col, values.get(key))?);
    }
    tx.execute("INSERT INTO support_configuration(id,name,description,approximate_mass_kg,coupled_state,notes) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,approximate_mass_kg=excluded.approximate_mass_kg,coupled_state=excluded.coupled_state,notes=excluded.notes", params_from_iter(binds.iter())).map_err(err)?;
    tx.commit().map_err(err)?;
    get(conn, Entity::SupportConfiguration, id)?
        .ok_or_else(|| "support vanished after upsert".into())
}

fn validate_setup_context(
    conn: &Connection,
    id: &str,
    obj: &Map<String, Value>,
) -> Result<(), String> {
    let previous = get(conn, Entity::Setup, id)?;
    if let Some(old) = &previous {
        if obj.get("venueId").unwrap_or(&Value::Null) != &old["venueId"] {
            let support = match old["supportConfigurationId"].as_str() {
                Some(id) => get(conn, Entity::SupportConfiguration, id)?,
                None => None,
            };
            if !old["boothId"].is_null()
                || !old["deckPositionId"].is_null()
                || support
                    .as_ref()
                    .is_some_and(|support| !support["deckPositionId"].is_null())
            {
                return Err("Cannot change the venue of a setup with a saved booth, deck position or position-bound support. Keep its original venue.".into());
            }
        }
    }
    if let Some(components) = obj.get("components") {
        for component in components.as_array().ok_or("components must be an array")? {
            let fields = component.as_object().ok_or("component must be an object")?;
            let Some(snapshot_id) = fields.get("settingsSnapshotId").and_then(Value::as_str) else {
                continue;
            };
            let old = previous
                .as_ref()
                .and_then(|record| record["components"].as_array())
                .and_then(|rows| {
                    rows.iter()
                        .find(|row| row["id"].as_str().is_some() && row["id"] == component["id"])
                });
            // Preserve an unchanged legacy association. New/changed associations must match the snapshot's actual owner.
            if old.is_some_and(|old| {
                old["assetId"] == component["assetId"] && old["settingsSnapshotId"] == snapshot_id
            }) {
                continue;
            }
            let owner: String = conn
                .query_row(
                    "SELECT asset_id FROM asset_settings_snapshot WHERE id=?1",
                    [snapshot_id],
                    |row| row.get(0),
                )
                .map_err(|error| match error {
                    rusqlite::Error::QueryReturnedNoRows => {
                        "The selected settings snapshot does not exist.".to_string()
                    }
                    other => err(other),
                })?;
            if component["assetId"].as_str() != Some(owner.as_str()) {
                return Err(
                    "The selected settings snapshot belongs to a different component asset.".into(),
                );
            }
        }
    }
    let Some(support_id) = obj.get("supportConfigurationId").and_then(Value::as_str) else {
        return Ok(());
    };
    let support = get(conn, Entity::SupportConfiguration, support_id)?
        .ok_or("The selected support description does not exist.")?;
    let position = obj.get("deckPositionId").unwrap_or(&Value::Null);
    let unchanged = previous.as_ref().is_some_and(|old| {
        old["supportConfigurationId"] == support_id && &old["deckPositionId"] == position
    });
    if !support["deckPositionId"].is_null() && &support["deckPositionId"] != position && !unchanged
    {
        return Err("The selected support belongs to a different deck position.".into());
    }
    Ok(())
}

/// Insert or fully replace a record by id. A missing id is generated.
/// Returns the stored record. Setup records may carry `components`.
pub fn upsert(conn: &mut Connection, entity: Entity, record: &Value) -> Result<Value, String> {
    let spec = entity.spec();
    let obj = record.as_object().ok_or("record must be an object")?;
    let id = match obj.get("id") {
        None | Some(Value::Null) => new_id(),
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        _ => return Err("id must be a non-empty string".into()),
    };
    if entity == Entity::SupportConfiguration {
        return upsert_support(conn, &id, obj);
    }
    let mut values: Vec<Sql> = Vec::new();
    for col in spec.cols {
        values.push(to_sql(col, obj.get(col.key))?);
    }
    let now = now_iso(conn)?;

    let mut names = vec!["id".to_string()];
    names.extend(spec.cols.iter().map(|c| c.col.to_string()));
    if spec.has_created {
        names.push("created_at".into());
    }
    if spec.has_updated {
        names.push("updated_at".into());
    }
    let mut binds = vec![Sql::Text(id.clone())];
    binds.extend(values);
    if spec.has_created {
        binds.push(Sql::Text(now.clone()));
    }
    if spec.has_updated {
        binds.push(Sql::Text(now));
    }
    let placeholders = vec!["?"; names.len()].join(", ");
    let mut sets: Vec<String> = spec
        .cols
        .iter()
        .map(|c| format!("{0} = excluded.{0}", c.col))
        .collect();
    if spec.has_updated {
        sets.push("updated_at = excluded.updated_at".into());
    }
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}",
        spec.table,
        names.join(", "),
        placeholders,
        sets.join(", ")
    );

    let tx = conn.transaction().map_err(err)?;
    if entity == Entity::Setup {
        validate_setup_context(&tx, &id, obj)?;
    }
    tx.execute(&sql, params_from_iter(binds.iter()))
        .map_err(err)?;
    if spec.soft_delete {
        // Saving an asset un-deletes it.
        tx.execute(
            &format!("UPDATE {} SET is_deleted = 0 WHERE id = ?1", spec.table),
            [&id],
        )
        .map_err(err)?;
    }
    if entity == Entity::Setup {
        if let Some(comps) = obj.get("components") {
            let arr = comps.as_array().ok_or("components must be an array")?;
            tx.execute("DELETE FROM setup_component WHERE setup_id = ?1", [&id])
                .map_err(err)?;
            for comp in arr {
                let cobj = comp.as_object().ok_or("component must be an object")?;
                let cid = match cobj.get("id") {
                    Some(Value::String(s)) if !s.is_empty() => s.clone(),
                    _ => new_id(),
                };
                let mut cb = vec![Sql::Text(cid), Sql::Text(id.clone())];
                for col in COMPONENT_COLS {
                    cb.push(to_sql(col, cobj.get(col.key))?);
                }
                tx.execute(
                    "INSERT INTO setup_component (id, setup_id, role, asset_id, position, settings_snapshot_id) VALUES (?, ?, ?, ?, ?, ?)",
                    params_from_iter(cb.iter()),
                )
                .map_err(err)?;
            }
        }
    }
    tx.commit().map_err(err)?;
    get(conn, entity, &id)?.ok_or_else(|| "record vanished after upsert".to_string())
}

/// Delete by id. Assets are soft-deleted (is_deleted=1) because setups and
/// history reference them. Returns whether a record was affected.
pub fn delete(conn: &Connection, entity: Entity, id: &str) -> Result<bool, String> {
    let spec = entity.spec();
    let tx = conn.unchecked_transaction().map_err(err)?;
    if entity == Entity::SupportConfiguration {
        let assigned: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM setup WHERE support_configuration_id=?1)",
                [id],
                |row| row.get(0),
            )
            .map_err(err)?;
        if assigned {
            return Err(
                "This support description is assigned to a setup and cannot be removed.".into(),
            );
        }
    }
    let n = match entity {
        // A retired asset leaves the fleet, so it also gives up its deck position (FS-23).
        Entity::Asset => tx.execute("UPDATE asset SET is_deleted = 1, deck_position_id = NULL WHERE id = ?1 AND is_deleted = 0", [id]),
        _ if spec.soft_delete => tx.execute(&format!("UPDATE {} SET is_deleted = 1 WHERE id = ?1 AND is_deleted = 0", spec.table), [id]),
        _ => {
            // FS-23 reminder templates belong to the product: remove them with it, in the same transaction, so a
            // product still referenced elsewhere keeps its templates when the delete fails.
            if matches!(entity, Entity::Product) {
                tx.execute("DELETE FROM maintenance_reminder WHERE product_id = ?1 AND asset_id IS NULL", [id]).map_err(err)?;
            }
            tx.execute(&format!("DELETE FROM {} WHERE id = ?1", spec.table), [id])
        }
    }
    .map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(n > 0)
}

/// Load the starter catalog once, if the catalog is empty and it has not been
/// loaded before (so a user who deletes everything is not re-seeded).
pub fn seed_if_empty(conn: &Connection) -> Result<bool, String> {
    let done: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schema_migration WHERE version = ?1",
            [SEED_MARKER_VERSION],
            |r| r.get(0),
        )
        .map_err(err)?;
    if done > 0 {
        return Ok(false);
    }
    let existing: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM manufacturer) + (SELECT COUNT(*) FROM product)",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    if existing == 0 {
        conn.execute_batch(&format!("BEGIN;\n{SEED_SQL}\nCOMMIT;"))
            .map_err(|e| {
                let _ = conn.execute_batch("ROLLBACK;");
                format!("seed failed: {e}")
            })?;
    }
    conn.execute(
        "INSERT OR IGNORE INTO schema_migration(version, applied_at, app_version) VALUES (?1, CURRENT_TIMESTAMP, 'seed')",
        [SEED_MARKER_VERSION],
    )
    .map_err(err)?;
    Ok(existing == 0)
}

fn with_db<T>(
    app: &AppHandle,
    f: impl FnOnce(&mut Connection) -> Result<T, String>,
) -> Result<T, String> {
    let path = database_path(app)?;
    let mut conn = open_database(&path)?;
    f(&mut conn)
}

#[tauri::command]
pub async fn catalog_list(
    app: AppHandle,
    entity: String,
    filter: Option<Value>,
) -> Result<Vec<Value>, String> {
    crate::db::off_main(move || {
        let e = Entity::parse(&entity)?;
        with_db(&app, |c| list(c, e, filter.as_ref()))
    })
    .await?
}

#[tauri::command]
pub async fn catalog_upsert(
    app: AppHandle,
    entity: String,
    record: Value,
) -> Result<Value, String> {
    crate::db::off_main(move || {
        let e = Entity::parse(&entity)?;
        with_db(&app, |c| upsert(c, e, &record))
    })
    .await?
}

#[tauri::command]
pub async fn catalog_delete(app: AppHandle, entity: String, id: String) -> Result<bool, String> {
    crate::db::off_main(move || {
        let e = Entity::parse(&entity)?;
        with_db(&app, |c| delete(c, e, &id))
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    #[test]
    fn crud_round_trip_per_entity() {
        let mut c = mem();
        let m = upsert(
            &mut c,
            Entity::Manufacturer,
            &json!({"name": "Acme", "website": "https://acme.test"}),
        )
        .unwrap();
        let mid = m["id"].as_str().unwrap().to_string();
        assert_eq!(m["name"], "Acme");

        let p = upsert(&mut c, Entity::Product, &json!({"manufacturerId": mid, "category": "TURNTABLE", "model": "T1", "releaseYear": 2020})).unwrap();
        assert_eq!(p["releaseYear"], 2020);
        let pid = p["id"].as_str().unwrap().to_string();

        let a = upsert(
            &mut c,
            Entity::Asset,
            &json!({"productId": pid, "nickname": "Deck L", "serialNumber": "S1"}),
        )
        .unwrap();
        let aid = a["id"].as_str().unwrap().to_string();

        let v = upsert(
            &mut c,
            Entity::Venue,
            &json!({"name": "Club", "city": "Berlin"}),
        )
        .unwrap();
        let vid = v["id"].as_str().unwrap().to_string();

        let s = upsert(
            &mut c,
            Entity::Setup,
            &json!({
                "name": "Home", "venueId": vid,
                "components": [{"role": "turntable", "assetId": aid, "position": "left"}]
            }),
        )
        .unwrap();
        let sid = s["id"].as_str().unwrap().to_string();
        assert_eq!(s["components"].as_array().unwrap().len(), 1);
        assert_eq!(s["components"][0]["position"], "left");

        // update by id: replace components, keep created_at
        let s2 = upsert(
            &mut c,
            Entity::Setup,
            &json!({"id": sid, "name": "Home 2", "components": []}),
        )
        .unwrap();
        assert_eq!(s2["name"], "Home 2");
        assert_eq!(s2["createdAt"], s["createdAt"]);
        assert_eq!(s2["components"].as_array().unwrap().len(), 0);

        // update + filter + search
        let a2 = upsert(
            &mut c,
            Entity::Asset,
            &json!({"id": aid, "productId": pid, "nickname": "Deck R"}),
        )
        .unwrap();
        assert_eq!(a2["nickname"], "Deck R");
        assert_eq!(a2["serialNumber"], Value::Null);
        assert_eq!(
            list(&c, Entity::Asset, Some(&json!({"search": "deck"})))
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list(&c, Entity::Asset, Some(&json!({"productId": "nope"})))
                .unwrap()
                .len(),
            0
        );
        assert_eq!(
            list(&c, Entity::Product, Some(&json!({"manufacturerId": mid})))
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list(&c, Entity::Venue, Some(&json!({"search": "100%"})))
                .unwrap()
                .len(),
            0
        );

        // deletes
        assert!(delete(&c, Entity::Setup, &sid).unwrap());
        assert!(delete(&c, Entity::Asset, &aid).unwrap());
        assert_eq!(list(&c, Entity::Asset, None).unwrap().len(), 0);
        assert!(delete(&c, Entity::Venue, &vid).unwrap());
        // FK protects referenced rows
        assert!(delete(&c, Entity::Manufacturer, &mid).is_err());
        // soft-deleted asset still references the product
        assert!(delete(&c, Entity::Product, &pid).is_err());
        c.execute("DELETE FROM asset", []).unwrap();
        assert!(delete(&c, Entity::Product, &pid).unwrap());
        assert!(delete(&c, Entity::Manufacturer, &mid).unwrap());
        assert!(!delete(&c, Entity::Manufacturer, &mid).unwrap());
    }

    #[test]
    fn regression_text_that_is_not_utf8_lists_without_panicking() {
        // A restored or hand-edited database can hold TEXT that is not UTF-8; rusqlite's Value
        // conversion panics on it (found by the backup_restore fuzz target).
        let mut c = mem();
        let m = upsert(&mut c, Entity::Manufacturer, &json!({"name": "Acme"})).unwrap();
        c.execute(
            "UPDATE manufacturer SET name = CAST(X'41FF42' AS TEXT) WHERE id = ?1",
            [m["id"].as_str().unwrap()],
        )
        .unwrap();
        let rows = list(&c, Entity::Manufacturer, None).unwrap();
        assert_eq!(rows[0]["name"], "A\u{FFFD}B");
        assert_eq!(
            get(&c, Entity::Manufacturer, m["id"].as_str().unwrap())
                .unwrap()
                .unwrap()["name"],
            "A\u{FFFD}B"
        );
    }

    #[test]
    fn rejects_unknown_entity_and_bad_input() {
        let mut c = mem();
        assert!(Entity::parse("sqlite_master").is_err());
        assert!(Entity::parse("manufacturer; DROP TABLE product").is_err());
        assert!(upsert(&mut c, Entity::Venue, &json!({})).is_err());
        assert!(upsert(&mut c, Entity::Venue, &json!({"name": 5})).is_err());
        assert!(list(&c, Entity::Venue, Some(&json!({"id; DROP TABLE venue": 1}))).is_err());
        // injection-looking values are just data
        let v = upsert(
            &mut c,
            Entity::Venue,
            &json!({"name": "x'); DROP TABLE venue;--"}),
        )
        .unwrap();
        assert_eq!(
            list(&c, Entity::Venue, Some(&json!({"search": "DROP"})))
                .unwrap()
                .len(),
            1
        );
        assert_eq!(v["name"], "x'); DROP TABLE venue;--");
    }

    #[test]
    fn seed_loads_once() {
        let c = mem();
        assert!(seed_if_empty(&c).unwrap());
        assert!(list(&c, Entity::Manufacturer, None).unwrap().len() >= 8);
        assert!(
            list(&c, Entity::Product, Some(&json!({"search": "PLX"})))
                .unwrap()
                .len()
                == 1
        );
        assert!(!seed_if_empty(&c).unwrap());
        c.execute("DELETE FROM dvs_media_profile", []).unwrap();
        c.execute("DELETE FROM product_spec", []).unwrap();
        c.execute("DELETE FROM product", []).unwrap();
        c.execute("DELETE FROM manufacturer", []).unwrap();
        assert!(!seed_if_empty(&c).unwrap());
        assert_eq!(list(&c, Entity::Manufacturer, None).unwrap().len(), 0);
    }

    /// FS-23 product reminder templates (maintenance_reminder rows with a product and no asset) reference the
    /// product; deleting the product removes them in the same transaction instead of failing on the FK.
    #[test]
    fn regression_product_delete_removes_its_reminder_templates() {
        let mut c = mem();
        let p = upsert(
            &mut c,
            Entity::Product,
            &json!({"category": "TURNTABLE", "model": "T1"}),
        )
        .unwrap();
        let pid = p["id"].as_str().unwrap().to_string();
        let templates = |c: &Connection| -> i64 {
            c.query_row("SELECT COUNT(*) FROM maintenance_reminder WHERE product_id=?1 AND asset_id IS NULL", [&pid], |r| r.get(0)).unwrap()
        };
        c.execute("INSERT INTO maintenance_reminder(id,product_id,title,basis,interval_value,created_at) VALUES('tpl',?1,'Clean','days',90,'2026-01-01')", [&pid]).unwrap();
        // Still in use by an asset: the delete fails and the template survives (nothing half-done).
        let a = upsert(
            &mut c,
            Entity::Asset,
            &json!({"productId": pid, "nickname": "Deck"}),
        )
        .unwrap();
        assert!(delete(&c, Entity::Product, &pid).is_err());
        assert_eq!(
            templates(&c),
            1,
            "a failed product delete rolls back the template removal"
        );
        c.execute("DELETE FROM asset WHERE id=?1", [a["id"].as_str().unwrap()])
            .unwrap();
        assert!(delete(&c, Entity::Product, &pid).unwrap());
        assert_eq!(templates(&c), 0);
        assert_eq!(list(&c, Entity::Product, None).unwrap().len(), 0);
    }

    /// FS-23: a soft-deleted asset leaves the fleet, so it must not keep occupying its deck position.
    #[test]
    fn regression_asset_soft_delete_clears_deck_position() {
        let mut c = mem();
        c.execute_batch("INSERT INTO venue(id,name,created_at,updated_at) VALUES('v','Club','2026-01-01','2026-01-01');
            INSERT INTO booth(id,venue_id,name) VALUES('b','v','Booth');
            INSERT INTO deck_position(id,booth_id,name) VALUES('p','b','Left');").unwrap();
        let a = upsert(&mut c, Entity::Asset, &json!({"nickname": "Deck"})).unwrap();
        let aid = a["id"].as_str().unwrap().to_string();
        c.execute("UPDATE asset SET deck_position_id='p' WHERE id=?1", [&aid])
            .unwrap();
        assert!(delete(&c, Entity::Asset, &aid).unwrap());
        let (deleted, position): (i64, Option<String>) = c
            .query_row(
                "SELECT is_deleted, deck_position_id FROM asset WHERE id=?1",
                [&aid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((deleted, position), (1, None));
        assert!(
            !delete(&c, Entity::Asset, &aid).unwrap(),
            "a second delete is a no-op"
        );
    }

    #[test]
    fn seed_skipped_when_catalog_has_data() {
        let mut c = mem();
        upsert(&mut c, Entity::Manufacturer, &json!({"name": "Mine"})).unwrap();
        assert!(!seed_if_empty(&c).unwrap());
        assert_eq!(list(&c, Entity::Manufacturer, None).unwrap().len(), 1);
    }

    fn support_contract() -> Value {
        serde_json::from_str(include_str!(
            "../../tests/contracts/support-configurations.json"
        ))
        .unwrap()
    }

    fn support_context(c: &mut Connection) -> Value {
        let contract = support_contract();
        c.execute_batch("INSERT INTO venue(id,name,created_at,updated_at) VALUES('venue-a','Club','2026-01-01','2026-01-01');
            INSERT INTO booth(id,venue_id,name) VALUES('booth-a','venue-a','Booth');
            INSERT INTO deck_position(id,booth_id,name) VALUES('position-a','booth-a','Left'),('position-b','booth-a','Right');
            INSERT INTO asset(id,nickname,created_at,updated_at) VALUES('asset-a','Deck','2026-01-01','2026-01-01');
            INSERT INTO asset_settings_snapshot(id,asset_id,captured_at,custom_json) VALUES('settings-a','asset-a','2026-01-01','{}');").unwrap();
        let legacy = &contract["legacy"];
        c.execute("INSERT INTO support_configuration(id,deck_position_id,name,description,structure_json,approximate_mass_kg,coupled_state,notes) VALUES('support-legacy','position-a',?1,?2,?3,6,'decoupled',NULL)",
            [legacy["name"].as_str().unwrap(), legacy["description"].as_str().unwrap(), legacy["structureJson"].as_str().unwrap()]).unwrap();
        upsert(c, Entity::Setup, &contract["setup"]).unwrap();
        contract
    }

    #[test]
    fn support_descriptions_round_trip_without_fabricated_timestamps() {
        let mut c = mem();
        let entity = Entity::parse("supportConfiguration").unwrap();
        let contract = support_contract();
        let saved = upsert(&mut c, entity, &contract["input"]).unwrap();
        let mut expected = contract["input"].clone();
        expected["deckPositionId"] = Value::Null;
        expected["structureJson"] = json!("[]");
        assert_eq!(saved, expected);
        assert!(saved.get("createdAt").is_none());
        assert!(saved.get("updatedAt").is_none());
        assert_eq!(
            list(&c, entity, Some(&json!({"search":"isolation"}))).unwrap(),
            vec![expected]
        );
        assert!(delete(&c, entity, "support-new").unwrap());
        assert!(list(&c, entity, None).unwrap().is_empty());
    }

    #[test]
    fn support_metadata_edit_preserves_legacy_structure_bytes_and_position() {
        let mut c = mem();
        let contract = support_context(&mut c);
        let entity = Entity::parse("supportConfiguration").unwrap();
        let saved = upsert(&mut c, entity, &json!({"id":"support-legacy","name":"Renamed","description":"Rechecked","approximateMassKg":6,"coupledState":"decoupled","notes":"Kept"})).unwrap();
        assert_eq!(saved["structureJson"], contract["legacy"]["structureJson"]);
        assert_eq!(saved["deckPositionId"], "position-a");
        let mut changed = saved.clone();
        changed["structureJson"] = json!("[]");
        assert!(upsert(&mut c, entity, &changed)
            .unwrap_err()
            .contains("read-only"));
        changed = saved.clone();
        changed["deckPositionId"] = Value::Null;
        assert!(upsert(&mut c, entity, &changed)
            .unwrap_err()
            .contains("read-only"));
        assert_eq!(get(&c, entity, "support-legacy").unwrap().unwrap(), saved);
        assert_eq!(
            upsert(&mut c, entity, &saved).unwrap(),
            saved,
            "a full record can round-trip its unchanged read-only fields"
        );
    }

    #[test]
    fn setup_support_assignment_is_validated_without_rewriting_legacy_bindings() {
        let mut c = mem();
        let contract = support_context(&mut c);
        let entity = Entity::parse("supportConfiguration").unwrap();
        upsert(&mut c, entity, &contract["input"]).unwrap();
        let mut setup = get(&c, Entity::Setup, "setup-a").unwrap().unwrap();
        setup["supportConfigurationId"] = json!("support-new");
        let saved = upsert(&mut c, Entity::Setup, &setup).unwrap();
        assert_eq!(saved["components"][0]["settingsSnapshotId"], "settings-a");
        assert_eq!(saved["boothId"], "booth-a");
        assert_eq!(saved["deckPositionId"], "position-a");
        setup["id"] = json!("setup-b");
        setup["deckPositionId"] = json!("position-b");
        setup["components"] = json!([]);
        upsert(&mut c, Entity::Setup, &setup).unwrap();
        setup["supportConfigurationId"] = json!("missing");
        assert!(upsert(&mut c, Entity::Setup, &setup)
            .unwrap_err()
            .contains("support"));
        setup["supportConfigurationId"] = json!("support-legacy");
        assert!(upsert(&mut c, Entity::Setup, &setup)
            .unwrap_err()
            .contains("position"));
        assert_eq!(
            get(&c, Entity::Setup, "setup-b").unwrap().unwrap()["supportConfigurationId"],
            "support-new"
        );
        c.execute("UPDATE setup SET support_configuration_id='support-legacy', deck_position_id='position-b' WHERE id='setup-a'", []).unwrap();
        let mut legacy = get(&c, Entity::Setup, "setup-a").unwrap().unwrap();
        legacy["name"] = json!("Legacy rename");
        let kept = upsert(&mut c, Entity::Setup, &legacy).unwrap();
        assert_eq!(kept["supportConfigurationId"], "support-legacy");
        assert_eq!(kept["deckPositionId"], "position-b");
        assert_eq!(kept["components"][0]["settingsSnapshotId"], "settings-a");
        legacy["deckPositionId"] = Value::Null;
        assert!(upsert(&mut c, Entity::Setup, &legacy)
            .unwrap_err()
            .contains("position"));
        assert!(delete(&c, entity, "support-legacy").is_err());
        assert!(get(&c, entity, "support-legacy").unwrap().is_some());
    }

    #[test]
    fn invalid_support_descriptions_do_not_mutate_storage() {
        let mut c = mem();
        let entity = Entity::parse("supportConfiguration").unwrap();
        for invalid in [
            json!({"name":" "}),
            json!({"name":"A","approximateMassKg":-1}),
            json!({"name":"A","notes":{}}),
            json!({"name":"A","description":"x".repeat(5001)}),
            json!({"name":"A","deckPositionId":"position-a"}),
            json!({"name":"A","structureJson":"{}"}),
        ] {
            assert!(upsert(&mut c, entity, &invalid).is_err(), "{invalid}");
        }
        assert!(list(&c, entity, None).unwrap().is_empty());
    }

    #[test]
    fn old_entity_timestamps_keep_their_existing_shape_and_creation_time() {
        let mut c = mem();
        for (entity, mut input) in [
            (Entity::Manufacturer, json!({"id":"old-m","name":"Maker"})),
            (
                Entity::Product,
                json!({"id":"old-p","category":"TURNTABLE","model":"Deck"}),
            ),
            (Entity::Asset, json!({"id":"old-a","nickname":"Asset"})),
            (Entity::Setup, json!({"id":"old-s","name":"Setup"})),
            (Entity::Venue, json!({"id":"old-v","name":"Venue"})),
        ] {
            let first = upsert(&mut c, entity, &input).unwrap();
            assert!(first["createdAt"].is_string());
            assert_eq!(first.get("updatedAt").is_some(), entity != Entity::Setup);
            c.execute(
                &format!(
                    "UPDATE {} SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?1",
                    entity.spec().table
                ),
                [first["id"].as_str().unwrap()],
            )
            .unwrap();
            input["notes"] = json!("Edited");
            let updated = upsert(&mut c, entity, &input).unwrap();
            assert_eq!(updated["createdAt"], "2000-01-01T00:00:00.000Z");
            assert_eq!(
                get(&c, entity, first["id"].as_str().unwrap())
                    .unwrap()
                    .unwrap(),
                updated
            );
        }
    }

    #[test]
    fn support_correction_component_snapshots_follow_asset_ownership() {
        let mut c = mem();
        support_context(&mut c);
        c.execute_batch("INSERT INTO asset(id,nickname,created_at,updated_at) VALUES('asset-b','Replacement','t','t');
            INSERT INTO asset_settings_snapshot(id,asset_id,captured_at) VALUES('settings-b','asset-b','t');").unwrap();
        let original = get(&c, Entity::Setup, "setup-a").unwrap().unwrap();
        let mut changed = original.clone();
        changed["components"][0]["assetId"] = json!("asset-b");
        assert!(upsert(&mut c, Entity::Setup, &changed)
            .unwrap_err()
            .contains("snapshot"));
        assert_eq!(
            get(&c, Entity::Setup, "setup-a").unwrap().unwrap(),
            original
        );
        changed["components"][0]["settingsSnapshotId"] = Value::Null;
        let saved = upsert(&mut c, Entity::Setup, &changed).unwrap();
        assert_eq!(saved["components"][0]["assetId"], "asset-b");
        assert!(saved["components"][0]["settingsSnapshotId"].is_null());
        assert_eq!(
            c.query_row(
                "SELECT asset_id FROM asset_settings_snapshot WHERE id='settings-a'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "asset-a"
        );
        changed["components"][0]["settingsSnapshotId"] = json!("settings-b");
        upsert(&mut c, Entity::Setup, &changed).unwrap();
        changed["id"] = json!("new-setup");
        changed["components"][0]["id"] = json!("new-component");
        changed["components"][0]["settingsSnapshotId"] = json!("settings-a");
        assert!(upsert(&mut c, Entity::Setup, &changed)
            .unwrap_err()
            .contains("snapshot"));
        assert!(get(&c, Entity::Setup, "new-setup").unwrap().is_none());
        // An existing legacy association is not silently rewritten by an ordinary metadata edit.
        c.execute(
            "UPDATE setup_component SET settings_snapshot_id='settings-a' WHERE id='component-a'",
            [],
        )
        .unwrap();
        let mut legacy = get(&c, Entity::Setup, "setup-a").unwrap().unwrap();
        legacy["name"] = json!("Legacy metadata edit");
        let kept = upsert(&mut c, Entity::Setup, &legacy).unwrap();
        assert_eq!(kept["components"][0]["assetId"], "asset-b");
        assert_eq!(kept["components"][0]["settingsSnapshotId"], "settings-a");
    }

    #[test]
    fn support_correction_bound_setup_venue_changes_preserve_original_context() {
        let mut c = mem();
        let contract = support_context(&mut c);
        upsert(
            &mut c,
            Entity::Venue,
            &json!({"id":"venue-b","name":"Other venue"}),
        )
        .unwrap();
        let original = get(&c, Entity::Setup, "setup-a").unwrap().unwrap();
        for venue in [json!("venue-b"), Value::Null] {
            let mut changed = original.clone();
            changed["venueId"] = venue;
            assert!(upsert(&mut c, Entity::Setup, &changed)
                .unwrap_err()
                .contains("venue"));
            changed["boothId"] = Value::Null;
            changed["deckPositionId"] = Value::Null;
            changed["supportConfigurationId"] = Value::Null;
            assert!(upsert(&mut c, Entity::Setup, &changed)
                .unwrap_err()
                .contains("venue"));
            assert_eq!(
                get(&c, Entity::Setup, "setup-a").unwrap().unwrap(),
                original
            );
        }
        c.execute(
            "UPDATE setup SET booth_id=NULL,deck_position_id=NULL WHERE id='setup-a'",
            [],
        )
        .unwrap();
        let mut legacy = get(&c, Entity::Setup, "setup-a").unwrap().unwrap();
        legacy["venueId"] = json!("venue-b");
        assert!(upsert(&mut c, Entity::Setup, &legacy)
            .unwrap_err()
            .contains("venue"));
        upsert(
            &mut c,
            Entity::parse("supportConfiguration").unwrap(),
            &contract["input"],
        )
        .unwrap();
        let mut unbound = upsert(&mut c, Entity::Setup, &json!({"id":"unbound","name":"Reusable","venueId":"venue-a","supportConfigurationId":"support-new","components":[]})).unwrap();
        unbound["venueId"] = json!("venue-b");
        assert_eq!(
            upsert(&mut c, Entity::Setup, &unbound).unwrap()["venueId"],
            "venue-b"
        );
    }
}

//! Catalog CRUD (manufacturer, product, asset, setup, venue).
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
    Col { key, col, kind, required }
}

struct EntitySpec {
    table: &'static str,
    cols: &'static [Col],
    search: &'static [&'static str],
    order: &'static str,
    has_updated: bool,
    soft_delete: bool,
}

use Kind::{Int, Real, Text};

static MANUFACTURER: EntitySpec = EntitySpec {
    table: "manufacturer",
    cols: &[c("name", "name", Text, true), c("website", "website", Text, false), c("notes", "notes", Text, false)],
    search: &["name"],
    order: "name COLLATE NOCASE",
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
        c("supportConfigurationId", "support_configuration_id", Text, false),
        c("notes", "notes", Text, false),
    ],
    search: &["name"],
    order: "name COLLATE NOCASE",
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
    has_updated: true,
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
    cols.push("created_at".into());
    if spec.has_updated {
        cols.push("updated_at".into());
    }
    cols.join(", ")
}

fn row_to_json(spec: &EntitySpec, row: &rusqlite::Row) -> rusqlite::Result<Value> {
    let mut m = Map::new();
    m.insert("id".into(), from_sql(row.get::<_, Sql>(0)?));
    for (i, col) in spec.cols.iter().enumerate() {
        m.insert(col.key.into(), from_sql(row.get::<_, Sql>(i + 1)?));
    }
    let n = spec.cols.len();
    m.insert("createdAt".into(), from_sql(row.get::<_, Sql>(n + 1)?));
    if spec.has_updated {
        m.insert("updatedAt".into(), from_sql(row.get::<_, Sql>(n + 2)?));
    }
    Ok(Value::Object(m))
}

fn like_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

/// List records. `filter` may contain `search` (substring match over the
/// entity's searchable columns) and equality filters on any record key
/// (e.g. `{"manufacturerId": "..."}`). Unknown keys are rejected.
pub fn list(conn: &Connection, entity: Entity, filter: Option<&Value>) -> Result<Vec<Value>, String> {
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
                let parts: Vec<String> = spec.search.iter().map(|c| format!("{c} LIKE ? ESCAPE '\\'")).collect();
                wheres.push(format!("({})", parts.join(" OR ")));
                for _ in spec.search {
                    binds.push(Sql::Text(format!("%{}%", like_escape(s))));
                }
            } else if let Some(col) = spec.cols.iter().find(|c| c.key == k) {
                wheres.push(format!("{} = ?", col.col));
                binds.push(to_sql(&Col { required: false, ..*col }, Some(v))?);
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
    let sql = format!("SELECT {} FROM {} WHERE id = ?1", select_list(spec), spec.table);
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
    let mut values: Vec<Sql> = Vec::new();
    for col in spec.cols {
        values.push(to_sql(col, obj.get(col.key))?);
    }
    let now = now_iso(conn)?;

    let mut names = vec!["id".to_string()];
    names.extend(spec.cols.iter().map(|c| c.col.to_string()));
    names.push("created_at".into());
    if spec.has_updated {
        names.push("updated_at".into());
    }
    let mut binds = vec![Sql::Text(id.clone())];
    binds.extend(values);
    binds.push(Sql::Text(now.clone()));
    if spec.has_updated {
        binds.push(Sql::Text(now));
    }
    let placeholders = vec!["?"; names.len()].join(", ");
    let mut sets: Vec<String> = spec.cols.iter().map(|c| format!("{0} = excluded.{0}", c.col)).collect();
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
    tx.execute(&sql, params_from_iter(binds.iter())).map_err(err)?;
    if spec.soft_delete {
        // Saving an asset un-deletes it.
        tx.execute(&format!("UPDATE {} SET is_deleted = 0 WHERE id = ?1", spec.table), [&id]).map_err(err)?;
    }
    if entity == Entity::Setup {
        if let Some(comps) = obj.get("components") {
            let arr = comps.as_array().ok_or("components must be an array")?;
            tx.execute("DELETE FROM setup_component WHERE setup_id = ?1", [&id]).map_err(err)?;
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
    let n = if spec.soft_delete {
        conn.execute(&format!("UPDATE {} SET is_deleted = 1 WHERE id = ?1 AND is_deleted = 0", spec.table), [id])
    } else {
        conn.execute(&format!("DELETE FROM {} WHERE id = ?1", spec.table), [id])
    }
    .map_err(err)?;
    Ok(n > 0)
}

/// Load the starter catalog once, if the catalog is empty and it has not been
/// loaded before (so a user who deletes everything is not re-seeded).
pub fn seed_if_empty(conn: &Connection) -> Result<bool, String> {
    let done: i64 = conn
        .query_row("SELECT COUNT(*) FROM schema_migration WHERE version = ?1", [SEED_MARKER_VERSION], |r| r.get(0))
        .map_err(err)?;
    if done > 0 {
        return Ok(false);
    }
    let existing: i64 = conn
        .query_row("SELECT (SELECT COUNT(*) FROM manufacturer) + (SELECT COUNT(*) FROM product)", [], |r| r.get(0))
        .map_err(err)?;
    if existing == 0 {
        conn.execute_batch(&format!("BEGIN;\n{SEED_SQL}\nCOMMIT;")).map_err(|e| {
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

fn with_db<T>(app: &AppHandle, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
    let path = database_path(app)?;
    let mut conn = open_database(&path)?;
    f(&mut conn)
}

#[tauri::command]
pub fn catalog_list(app: AppHandle, entity: String, filter: Option<Value>) -> Result<Vec<Value>, String> {
    let e = Entity::parse(&entity)?;
    with_db(&app, |c| list(c, e, filter.as_ref()))
}

#[tauri::command]
pub fn catalog_upsert(app: AppHandle, entity: String, record: Value) -> Result<Value, String> {
    let e = Entity::parse(&entity)?;
    with_db(&app, |c| upsert(c, e, &record))
}

#[tauri::command]
pub fn catalog_delete(app: AppHandle, entity: String, id: String) -> Result<bool, String> {
    let e = Entity::parse(&entity)?;
    with_db(&app, |c| delete(c, e, &id))
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
        let m = upsert(&mut c, Entity::Manufacturer, &json!({"name": "Acme", "website": "https://acme.test"})).unwrap();
        let mid = m["id"].as_str().unwrap().to_string();
        assert_eq!(m["name"], "Acme");

        let p = upsert(&mut c, Entity::Product, &json!({"manufacturerId": mid, "category": "TURNTABLE", "model": "T1", "releaseYear": 2020})).unwrap();
        assert_eq!(p["releaseYear"], 2020);
        let pid = p["id"].as_str().unwrap().to_string();

        let a = upsert(&mut c, Entity::Asset, &json!({"productId": pid, "nickname": "Deck L", "serialNumber": "S1"})).unwrap();
        let aid = a["id"].as_str().unwrap().to_string();

        let v = upsert(&mut c, Entity::Venue, &json!({"name": "Club", "city": "Berlin"})).unwrap();
        let vid = v["id"].as_str().unwrap().to_string();

        let s = upsert(&mut c, Entity::Setup, &json!({
            "name": "Home", "venueId": vid,
            "components": [{"role": "turntable", "assetId": aid, "position": "left"}]
        })).unwrap();
        let sid = s["id"].as_str().unwrap().to_string();
        assert_eq!(s["components"].as_array().unwrap().len(), 1);
        assert_eq!(s["components"][0]["position"], "left");

        // update by id: replace components, keep created_at
        let s2 = upsert(&mut c, Entity::Setup, &json!({"id": sid, "name": "Home 2", "components": []})).unwrap();
        assert_eq!(s2["name"], "Home 2");
        assert_eq!(s2["createdAt"], s["createdAt"]);
        assert_eq!(s2["components"].as_array().unwrap().len(), 0);

        // update + filter + search
        let a2 = upsert(&mut c, Entity::Asset, &json!({"id": aid, "productId": pid, "nickname": "Deck R"})).unwrap();
        assert_eq!(a2["nickname"], "Deck R");
        assert_eq!(a2["serialNumber"], Value::Null);
        assert_eq!(list(&c, Entity::Asset, Some(&json!({"search": "deck"}))).unwrap().len(), 1);
        assert_eq!(list(&c, Entity::Asset, Some(&json!({"productId": "nope"}))).unwrap().len(), 0);
        assert_eq!(list(&c, Entity::Product, Some(&json!({"manufacturerId": mid}))).unwrap().len(), 1);
        assert_eq!(list(&c, Entity::Venue, Some(&json!({"search": "100%"}))).unwrap().len(), 0);

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
    fn rejects_unknown_entity_and_bad_input() {
        let mut c = mem();
        assert!(Entity::parse("sqlite_master").is_err());
        assert!(Entity::parse("manufacturer; DROP TABLE product").is_err());
        assert!(upsert(&mut c, Entity::Venue, &json!({})).is_err());
        assert!(upsert(&mut c, Entity::Venue, &json!({"name": 5})).is_err());
        assert!(list(&c, Entity::Venue, Some(&json!({"id; DROP TABLE venue": 1}))).is_err());
        // injection-looking values are just data
        let v = upsert(&mut c, Entity::Venue, &json!({"name": "x'); DROP TABLE venue;--"})).unwrap();
        assert_eq!(list(&c, Entity::Venue, Some(&json!({"search": "DROP"}))).unwrap().len(), 1);
        assert_eq!(v["name"], "x'); DROP TABLE venue;--");
    }

    #[test]
    fn seed_loads_once() {
        let c = mem();
        assert!(seed_if_empty(&c).unwrap());
        assert!(list(&c, Entity::Manufacturer, None).unwrap().len() >= 8);
        assert!(list(&c, Entity::Product, Some(&json!({"search": "PLX"}))).unwrap().len() == 1);
        assert!(!seed_if_empty(&c).unwrap());
        c.execute("DELETE FROM dvs_media_profile", []).unwrap();
        c.execute("DELETE FROM product_spec", []).unwrap();
        c.execute("DELETE FROM product", []).unwrap();
        c.execute("DELETE FROM manufacturer", []).unwrap();
        assert!(!seed_if_empty(&c).unwrap());
        assert_eq!(list(&c, Entity::Manufacturer, None).unwrap().len(), 0);
    }

    #[test]
    fn seed_skipped_when_catalog_has_data() {
        let mut c = mem();
        upsert(&mut c, Entity::Manufacturer, &json!({"name": "Mine"})).unwrap();
        assert!(!seed_if_empty(&c).unwrap());
        assert_eq!(list(&c, Entity::Manufacturer, None).unwrap().len(), 1);
    }
}

//! FS-23 persistence adapter. SQL owns references and atomic mutations; the
//! pure frontend fleet policy owns health, due-state display and CSV filtering.
use crate::db::{database_path, new_id, now_iso, open_database};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;

fn err(error: rusqlite::Error) -> String {
    error.to_string()
}
fn text(value: &str, field: &str, max: usize) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > max || value.chars().any(|c| c == '\0') {
        return Err(format!("invalid {field}"));
    }
    Ok(())
}
fn asset_exists(conn: &Connection, id: &str) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM asset WHERE id=?1 AND is_deleted=0)",
            [id],
            |r| r.get(0),
        )
        .map_err(err)?;
    if exists {
        Ok(())
    } else {
        Err("asset not found".into())
    }
}
fn timestamp_valid(conn: &Connection, value: &str) -> Result<bool, String> {
    if !crate::usage::valid_timestamp(value) {
        return Ok(false);
    }
    conn.query_row("SELECT date(?1)=substr(?1,1,10)", [value], |row| row.get(0))
        .map_err(err)
}
fn hours(conn: &Connection, asset: &str, until: Option<&str>) -> Result<f64, String> {
    conn.query_row("SELECT COALESCE(SUM(hours),0) FROM asset_usage WHERE asset_id=?1 AND confirmed=1 AND (?2 IS NULL OR julianday(started_at)<=julianday(?2))", params![asset,until], |r| r.get(0)).map_err(err)
}

/// Confirmed ledger hours whose entire recorded span starts at/after completion.
/// A straddling entry has no measured within-entry time distribution; return
/// unknown until the user splits/reviews it rather than inventing runtime.
fn hours_since_completion(
    conn: &Connection,
    asset: &str,
    completed: &str,
) -> Result<Option<f64>, String> {
    let mut query = conn.prepare("SELECT hours,(julianday(?2)-julianday(started_at))*24.0 FROM asset_usage WHERE asset_id=?1 AND confirmed=1").map_err(err)?;
    let entries = query
        .query_map(params![asset, completed], |row| {
            Ok((row.get::<_, f64>(0)?, row.get::<_, Option<f64>>(1)?))
        })
        .map_err(err)?;
    let mut total = 0.0;
    for entry in entries {
        let (hours, elapsed) = entry.map_err(err)?;
        let Some(elapsed) = elapsed else {
            return Ok(None);
        };
        if elapsed <= 0.0 {
            total += hours;
        } else if elapsed < hours - 0.000001 {
            return Ok(None);
        }
    }
    Ok(Some(total))
}

pub fn snapshot(conn: &Connection) -> Result<Value, String> {
    let mut query = conn.prepare("SELECT a.id,a.nickname,a.serial_number,a.installed_date,a.created_at,p.model,p.category,a.deck_position_id,d.name,d.booth_id,b.name,b.venue_id,v.name FROM asset a LEFT JOIN product p ON p.id=a.product_id LEFT JOIN deck_position d ON d.id=a.deck_position_id LEFT JOIN booth b ON b.id=d.booth_id LEFT JOIN venue v ON v.id=b.venue_id WHERE a.is_deleted=0 ORDER BY a.nickname COLLATE NOCASE,a.id").map_err(err)?;
    let assets = query.query_map([], |r| Ok(json!({"assetId":r.get::<_,String>(0)?,"nickname":r.get::<_,String>(1)?,"serialNumber":r.get::<_,Option<String>>(2)?,"installedDate":r.get::<_,Option<String>>(3)?,"createdAt":r.get::<_,String>(4)?,"productName":r.get::<_,Option<String>>(5)?,"category":r.get::<_,Option<String>>(6)?,"deckPositionId":r.get::<_,Option<String>>(7)?,"position":r.get::<_,Option<String>>(8)?,"boothId":r.get::<_,Option<String>>(9)?,"booth":r.get::<_,Option<String>>(10)?,"venueId":r.get::<_,Option<String>>(11)?,"venue":r.get::<_,Option<String>>(12)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let mut rows = Vec::with_capacity(assets.len());
    for mut asset in assets {
        let id = asset["assetId"].as_str().unwrap().to_string();
        let mut tests = conn.prepare("SELECT test_id,status,created_at,id FROM (SELECT test_id,status,created_at,id,ROW_NUMBER() OVER(PARTITION BY test_id ORDER BY julianday(created_at) DESC,id DESC) AS rank FROM device_test_result WHERE asset_id=?1) WHERE rank=1 ORDER BY test_id").map_err(err)?;
        let results = tests.query_map([&id], |r| Ok(json!({"testId":r.get::<_,String>(0)?,"status":r.get::<_,String>(1)?,"createdAt":r.get::<_,String>(2)?,"id":r.get::<_,String>(3)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
        asset["lastResults"] = json!(results);
        let last_session: Option<String> = conn.query_row(
            "SELECT MAX(COALESCE(ended_at,started_at)) FROM session WHERE status='completed' AND (CASE WHEN json_valid(config_snapshot_json) THEN COALESCE(json_extract(config_snapshot_json,'$.assetId'),json_extract(config_snapshot_json,'$.deviceId')) ELSE NULL END=?1 OR setup_id IN (SELECT setup_id FROM setup_component WHERE asset_id=?1))",
            [&id], |row| row.get(0)).map_err(err)?;
        asset["lastSessionAt"] = json!(last_session);
        asset["hoursTotal"] = json!(hours(conn, &id, None)?);
        asset["reminders"] = json!(reminders(conn, Some(&id))?);
        rows.push(asset);
    }
    let mut booths = conn
        .prepare("SELECT id,venue_id,name FROM booth ORDER BY name COLLATE NOCASE,id")
        .map_err(err)?;
    let booths = booths.query_map([],|r| Ok(json!({"id":r.get::<_,String>(0)?,"venueId":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let mut positions = conn
        .prepare("SELECT id,booth_id,name FROM deck_position ORDER BY name COLLATE NOCASE,id")
        .map_err(err)?;
    let positions = positions.query_map([],|r| Ok(json!({"id":r.get::<_,String>(0)?,"boothId":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let venues = crate::catalog::list(conn, crate::catalog::Entity::Venue, None)?;
    Ok(json!({"rows":rows,"venues":venues,"booths":booths,"positions":positions}))
}

pub fn reminders(conn: &Connection, asset: Option<&str>) -> Result<Vec<Value>, String> {
    let mut query = conn.prepare("SELECT r.id,r.asset_id,r.product_id,r.title,r.basis,r.interval_value,r.warn_before,r.enabled,r.snoozed_until,r.created_at,(SELECT event_at FROM maintenance_event e WHERE e.reminder_id=r.id ORDER BY julianday(event_at) DESC,e.id DESC LIMIT 1),(SELECT hours_at_event FROM maintenance_event e WHERE e.reminder_id=r.id ORDER BY julianday(event_at) DESC,e.id DESC LIMIT 1) FROM maintenance_reminder r WHERE (?1 IS NULL OR r.asset_id=?1) ORDER BY r.title,r.id").map_err(err)?;
    let mut rows = query.query_map([asset], |r| Ok(json!({"id":r.get::<_,String>(0)?,"assetId":r.get::<_,Option<String>>(1)?,"productId":r.get::<_,Option<String>>(2)?,"title":r.get::<_,String>(3)?,"basis":r.get::<_,String>(4)?,"intervalValue":r.get::<_,f64>(5)?,"warnBefore":r.get::<_,f64>(6)?,"enabled":r.get::<_,bool>(7)?,"snoozedUntil":r.get::<_,Option<String>>(8)?,"createdAt":r.get::<_,String>(9)?,"lastDoneAt":r.get::<_,Option<String>>(10)?,"hoursAtLastEvent":r.get::<_,Option<f64>>(11)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    for row in &mut rows {
        if let (Some(asset), Some(completed)) =
            (row["assetId"].as_str(), row["lastDoneAt"].as_str())
        {
            row["hoursSinceCompletion"] = json!(hours_since_completion(conn, asset, completed)?);
        }
    }
    Ok(rows)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReminderInput {
    pub id: Option<String>,
    pub asset_id: String,
    pub title: String,
    pub basis: String,
    pub interval_value: f64,
    pub warn_before: Option<f64>,
}
pub fn save_reminder(conn: &Connection, input: &ReminderInput) -> Result<String, String> {
    asset_exists(conn, &input.asset_id)?;
    text(&input.title, "title", 200)?;
    let warning = input.warn_before.unwrap_or(14.0);
    if !matches!(input.basis.as_str(), "days" | "hours")
        || !input.interval_value.is_finite()
        || input.interval_value <= 0.0
        || input.interval_value > 1_000_000.0
        || !warning.is_finite()
        || warning < 0.0
        || warning > 1_000_000.0
    {
        return Err("invalid reminder interval".into());
    }
    if input.basis == "days" && input.interval_value.fract() != 0.0 {
        return Err("days interval must be a whole calendar day".into());
    }
    let id = input.id.clone().unwrap_or_else(new_id);
    let owner: Option<String> = conn
        .query_row(
            "SELECT asset_id FROM maintenance_reminder WHERE id=?1",
            [&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    if owner
        .as_deref()
        .is_some_and(|owner| owner != input.asset_id)
    {
        return Err("reminder belongs to another asset".into());
    }
    conn.execute("INSERT INTO maintenance_reminder(id,asset_id,title,basis,interval_value,warn_before,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET title=excluded.title,basis=excluded.basis,interval_value=excluded.interval_value,warn_before=excluded.warn_before",params![id,input.asset_id,input.title.trim(),input.basis,input.interval_value,warning,now_iso(conn)?]).map_err(err)?;
    Ok(id)
}

pub fn snooze(conn: &Connection, id: &str, until: &str) -> Result<(), String> {
    if !timestamp_valid(conn, until)? {
        return Err("snooze requires a UTC timestamp".into());
    }
    if conn
        .execute(
            "UPDATE maintenance_reminder SET snoozed_until=?2 WHERE id=?1",
            params![id, until],
        )
        .map_err(err)?
        == 0
    {
        return Err("reminder not found".into());
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaintenanceInput {
    pub asset_id: String,
    pub event_type: String,
    pub event_at: String,
    pub description: Option<String>,
    pub reminder_id: Option<String>,
}
pub fn log_maintenance(conn: &Connection, input: &MaintenanceInput) -> Result<String, String> {
    asset_exists(conn, &input.asset_id)?;
    if !matches!(
        input.event_type.as_str(),
        "clean" | "lubricate" | "calibrate" | "repair" | "replace_part" | "inspect" | "other"
    ) || !timestamp_valid(conn, &input.event_at)?
    {
        return Err("invalid maintenance event".into());
    }
    if input
        .description
        .as_ref()
        .is_some_and(|v| v.chars().count() > 2000)
    {
        return Err("description is too long".into());
    }
    if let Some(reminder) = &input.reminder_id {
        let belongs: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM maintenance_reminder WHERE id=?1 AND asset_id=?2)",
                params![reminder, input.asset_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !belongs {
            return Err("reminder does not belong to asset".into());
        }
    }
    let id = new_id();
    let tracked = hours(conn, &input.asset_id, Some(&input.event_at))?;
    conn.execute("INSERT INTO maintenance_event(id,asset_id,event_type,event_at,description,reminder_id,hours_at_event,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![id,input.asset_id,input.event_type,input.event_at,input.description,input.reminder_id,tracked,now_iso(conn)?]).map_err(err)?;
    Ok(id)
}

pub fn maintenance_events(conn: &Connection, asset: &str) -> Result<Vec<Value>, String> {
    asset_exists(conn, asset)?;
    let mut query=conn.prepare("SELECT id,event_type,event_at,description,reminder_id,hours_at_event FROM maintenance_event WHERE asset_id=?1 ORDER BY julianday(event_at) DESC,id DESC LIMIT 1000").map_err(err)?;
    let rows = query.query_map([asset],|r|Ok(json!({"id":r.get::<_,String>(0)?,"eventType":r.get::<_,String>(1)?,"eventAt":r.get::<_,String>(2)?,"description":r.get::<_,Option<String>>(3)?,"reminderId":r.get::<_,Option<String>>(4)?,"hoursAtEvent":r.get::<_,Option<f64>>(5)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    Ok(rows)
}

pub fn place(conn: &mut Connection, asset: &str, position: Option<&str>) -> Result<(), String> {
    asset_exists(conn, asset)?;
    if let Some(id) = position {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM deck_position WHERE id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !exists {
            return Err("position not found".into());
        }
    }
    let tx = conn.transaction().map_err(err)?;
    tx.execute(
        "UPDATE asset SET deck_position_id=?2,updated_at=?3 WHERE id=?1",
        params![asset, position, now_iso(&tx)?],
    )
    .map_err(err)?;
    let description = position
        .map(|id| format!("Moved to position {id}"))
        .unwrap_or_else(|| "Moved to Unplaced".into());
    log_maintenance(
        &tx,
        &MaintenanceInput {
            asset_id: asset.into(),
            event_type: "other".into(),
            event_at: now_iso(&tx)?,
            description: Some(description),
            reminder_id: None,
        },
    )?;
    tx.commit().map_err(err)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationInput {
    pub id: Option<String>,
    pub parent_id: String,
    pub name: String,
}
pub fn save_location(
    conn: &Connection,
    kind: &str,
    input: &LocationInput,
) -> Result<String, String> {
    text(&input.name, "location name", 200)?;
    let id = input.id.clone().unwrap_or_else(new_id);
    let sql=match kind{
        "booth"=>"INSERT INTO booth(id,venue_id,name) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET venue_id=excluded.venue_id,name=excluded.name",
        "position"=>"INSERT INTO deck_position(id,booth_id,name) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET booth_id=excluded.booth_id,name=excluded.name",
        _=>return Err("unknown location kind".into()),
    };
    conn.execute(sql, params![id, input.parent_id, input.name.trim()])
        .map_err(err)?;
    Ok(id)
}

pub fn delete_location(conn: &mut Connection, kind: &str, id: &str) -> Result<(), String> {
    let (count_sql, delete_sql) = match kind {
        "venue" => ("SELECT COUNT(*) FROM asset a JOIN deck_position d ON d.id=a.deck_position_id JOIN booth b ON b.id=d.booth_id WHERE b.venue_id=?1", "DELETE FROM venue WHERE id=?1"),
        "booth" => ("SELECT COUNT(*) FROM asset a JOIN deck_position d ON d.id=a.deck_position_id WHERE d.booth_id=?1", "DELETE FROM booth WHERE id=?1"),
        "position" => ("SELECT COUNT(*) FROM asset WHERE deck_position_id=?1", "DELETE FROM deck_position WHERE id=?1"),
        _ => return Err("unknown location kind".into()),
    };
    let tx = conn.transaction().map_err(err)?;
    let placed: i64 = tx
        .query_row(count_sql, [id], |row| row.get(0))
        .map_err(err)?;
    if placed > 0 {
        return Err(format!(
            "move or unplace {placed} assets before deleting this location"
        ));
    }
    tx.execute(delete_sql, [id])
        .map_err(|_| "location is still referenced by a setup or diagnostic record".to_string())?;
    tx.commit().map_err(err)
}

#[tauri::command]
pub fn fleet_snapshot(app: AppHandle) -> Result<Value, String> {
    let conn = open_database(&database_path(&app)?)?;
    snapshot(&conn)
}
#[tauri::command]
pub fn fleet_place_asset(
    app: AppHandle,
    asset_id: String,
    deck_position_id: Option<String>,
) -> Result<(), String> {
    let mut conn = open_database(&database_path(&app)?)?;
    place(&mut conn, &asset_id, deck_position_id.as_deref())
}
#[tauri::command]
pub fn reminder_upsert(app: AppHandle, input: ReminderInput) -> Result<String, String> {
    let conn = open_database(&database_path(&app)?)?;
    save_reminder(&conn, &input)
}
#[tauri::command]
pub fn reminder_snooze(app: AppHandle, id: String, until_iso: String) -> Result<(), String> {
    let conn = open_database(&database_path(&app)?)?;
    snooze(&conn, &id, &until_iso)
}
#[tauri::command]
pub fn maintenance_log(app: AppHandle, input: MaintenanceInput) -> Result<String, String> {
    let conn = open_database(&database_path(&app)?)?;
    log_maintenance(&conn, &input)
}
#[tauri::command]
pub fn maintenance_list(app: AppHandle, asset_id: String) -> Result<Vec<Value>, String> {
    let conn = open_database(&database_path(&app)?)?;
    maintenance_events(&conn, &asset_id)
}
#[tauri::command]
pub fn booth_upsert(app: AppHandle, input: LocationInput) -> Result<String, String> {
    let conn = open_database(&database_path(&app)?)?;
    save_location(&conn, "booth", &input)
}
#[tauri::command]
pub fn position_upsert(app: AppHandle, input: LocationInput) -> Result<String, String> {
    let conn = open_database(&database_path(&app)?)?;
    save_location(&conn, "position", &input)
}
#[tauri::command]
pub fn fleet_location_delete(app: AppHandle, kind: String, id: String) -> Result<(), String> {
    let mut conn = open_database(&database_path(&app)?)?;
    delete_location(&mut conn, &kind, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::apply_migrations(&conn).unwrap();
        conn.execute_batch("INSERT INTO asset(id,nickname,created_at,updated_at) VALUES('unit','Deck','2026-01-01','2026-01-01'),('other','Other','2026-01-01','2026-01-01');
            INSERT INTO venue(id,name,created_at,updated_at) VALUES('venue','Club','2026-01-01','2026-01-01');
            INSERT INTO booth(id,venue_id,name) VALUES('booth','venue','Booth');
            INSERT INTO deck_position(id,booth_id,name) VALUES('position','booth','Left');
            INSERT INTO device_profile(id,json,loaded_at) VALUES('profile','{}','2026-01-01');").unwrap();
        conn
    }
    fn reminder(asset: &str) -> ReminderInput {
        ReminderInput {
            id: None,
            asset_id: asset.into(),
            title: "Clean".into(),
            basis: "days".into(),
            interval_value: 90.0,
            warn_before: Some(14.0),
        }
    }

    #[test]
    fn snapshot_keeps_untested_units_and_selects_latest_result_for_each_test() {
        let conn = database();
        conn.execute_batch("INSERT INTO device_test_result(id,asset_id,profile_id,test_id,status,created_at) VALUES('old','unit','profile','a','fail','2026-10-01'),('new','unit','profile','a','pass','2026-10-02'),('unknown','unit','profile','b','unknown','2026-10-02');
            INSERT INTO asset_usage(id,asset_id,kind,started_at,hours,source,confirmed,created_at) VALUES('confirmed','unit','play','2026-10-01T00:00:00Z',2.5,'manual',1,'2026-10-01'),('proposal','unit','play','2026-10-01T00:00:00Z',8,'deckchek',0,'2026-10-01');").unwrap();
        let view = snapshot(&conn).unwrap();
        assert_eq!(view["rows"].as_array().unwrap().len(), 2);
        let unit = view["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["assetId"] == "unit")
            .unwrap();
        assert_eq!(unit["hoursTotal"], 2.5);
        assert_eq!(unit["lastResults"].as_array().unwrap().len(), 2);
        assert_eq!(unit["lastResults"][0]["status"], "pass");
        let other = view["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["assetId"] == "other")
            .unwrap();
        assert!(other["lastResults"].as_array().unwrap().is_empty());
    }

    #[test]
    fn placement_validates_references_and_records_the_move_atomically() {
        let mut conn = database();
        assert!(place(&mut conn, "unit", Some("missing")).is_err());
        assert!(place(&mut conn, "missing", Some("position")).is_err());
        place(&mut conn, "unit", Some("position")).unwrap();
        let row = snapshot(&conn).unwrap()["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["assetId"] == "unit")
            .unwrap()
            .clone();
        assert_eq!(row["venue"], "Club");
        assert_eq!(row["position"], "Left");
        assert_eq!(maintenance_events(&conn, "unit").unwrap().len(), 1);
        place(&mut conn, "unit", None).unwrap();
        assert_eq!(maintenance_events(&conn, "unit").unwrap().len(), 2);
    }

    #[test]
    fn reminder_ownership_and_intervals_are_checked_before_writes() {
        let conn = database();
        let id = save_reminder(&conn, &reminder("unit")).unwrap();
        let mut foreign = reminder("other");
        foreign.id = Some(id.clone());
        assert!(save_reminder(&conn, &foreign).is_err());
        for value in [0.0, -1.0, f64::NAN, f64::INFINITY, 1.5] {
            let mut invalid = reminder("unit");
            invalid.interval_value = value;
            assert!(save_reminder(&conn, &invalid).is_err());
        }
        assert!(snooze(&conn, &id, "tomorrow").is_err());
        snooze(&conn, &id, "2026-10-23T00:00:00Z").unwrap();
        assert_eq!(
            reminders(&conn, Some("unit")).unwrap()[0]["snoozedUntil"],
            "2026-10-23T00:00:00Z"
        );
        assert_eq!(reminders(&conn, None).unwrap().len(), 1);
    }

    #[test]
    fn completing_maintenance_links_the_right_unit_and_snapshots_historical_hours() {
        let conn = database();
        let id = save_reminder(&conn, &reminder("unit")).unwrap();
        conn.execute_batch("INSERT INTO asset_usage(id,asset_id,kind,started_at,hours,source,confirmed,created_at) VALUES('past','unit','play','2026-10-01T00:00:00Z',2,'manual',1,'2026-10-01'),('future','unit','play','2026-10-30T00:00:00Z',5,'manual',1,'2026-10-30');").unwrap();
        let mut event = MaintenanceInput {
            asset_id: "unit".into(),
            event_type: "clean".into(),
            event_at: "2026-10-22T00:00:00Z".into(),
            description: Some("Faders cleaned".into()),
            reminder_id: Some(id),
        };
        log_maintenance(&conn, &event).unwrap();
        assert_eq!(
            maintenance_events(&conn, "unit").unwrap()[0]["hoursAtEvent"],
            2.0
        );
        event.asset_id = "other".into();
        assert!(log_maintenance(&conn, &event).is_err());
        assert!(reminders(&conn, Some("unit")).unwrap()[0]["lastDoneAt"].is_string());
    }

    #[test]
    fn location_mutations_use_foreign_keys_and_parameterized_names() {
        let conn = database();
        let booth = save_location(
            &conn,
            "booth",
            &LocationInput {
                id: None,
                parent_id: "venue".into(),
                name: "x'); DROP TABLE asset;--".into(),
            },
        )
        .unwrap();
        let position = save_location(
            &conn,
            "position",
            &LocationInput {
                id: None,
                parent_id: booth,
                name: "Right".into(),
            },
        )
        .unwrap();
        assert!(!position.is_empty());
        assert!(save_location(
            &conn,
            "position",
            &LocationInput {
                id: None,
                parent_id: "missing".into(),
                name: "Right".into()
            }
        )
        .is_err());
        assert!(save_location(
            &conn,
            "asset",
            &LocationInput {
                id: None,
                parent_id: "venue".into(),
                name: "No".into()
            }
        )
        .is_err());
        assert_eq!(
            snapshot(&conn).unwrap()["rows"].as_array().unwrap().len(),
            2
        );
    }

    #[test]
    fn occupied_locations_and_referenced_setups_cannot_be_deleted() {
        let mut conn = database();
        place(&mut conn, "unit", Some("position")).unwrap();
        for kind in ["venue", "booth", "position"] {
            let id = match kind {
                "venue" => "venue",
                "booth" => "booth",
                _ => "position",
            };
            assert!(delete_location(&mut conn, kind, id)
                .unwrap_err()
                .contains("move or unplace"));
        }
        place(&mut conn, "unit", None).unwrap();
        conn.execute_batch("INSERT INTO setup(id,name,venue_id,created_at) VALUES('setup','Chain','venue','2026-10-22');").unwrap();
        assert!(delete_location(&mut conn, "venue", "venue").is_err());
        conn.execute("DELETE FROM setup WHERE id='setup'", [])
            .unwrap();
        delete_location(&mut conn, "venue", "venue").unwrap();
        assert_eq!(
            snapshot(&conn).unwrap()["rows"].as_array().unwrap().len(),
            2
        );
        assert!(snapshot(&conn).unwrap()["positions"]
            .as_array()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn impossible_calendar_dates_are_rejected_without_recording_events() {
        let conn = database();
        let input = MaintenanceInput {
            asset_id: "unit".into(),
            event_type: "clean".into(),
            event_at: "2026-02-31T12:00:00Z".into(),
            description: None,
            reminder_id: None,
        };
        assert!(log_maintenance(&conn, &input).is_err());
        assert!(maintenance_events(&conn, "unit").unwrap().is_empty());
    }

    #[test]
    fn generic_sessions_supply_test_dates_without_inventing_device_results() {
        let conn = database();
        conn.execute("INSERT INTO session(id,session_type,started_at,ended_at,app_version,schema_version,status,config_snapshot_json) VALUES('generic','diagnostic','2026-10-21T12:00:00Z','2026-10-21T12:01:00Z','0.0.8',1,'completed',?1)", [r#"{"assetId":"unit"}"#]).unwrap();
        let snapshot = snapshot(&conn).unwrap();
        let row = snapshot["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["assetId"] == "unit")
            .unwrap();
        assert_eq!(row["lastSessionAt"], "2026-10-21T12:01:00Z");
        assert!(row["lastResults"].as_array().unwrap().is_empty());
        let other = snapshot["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["assetId"] == "other")
            .unwrap();
        assert!(other["lastSessionAt"].is_null());
    }

    #[test]
    fn backfilled_pre_maintenance_usage_does_not_advance_an_hours_reminder() {
        let conn = database();
        let mut input = reminder("unit");
        input.basis = "hours".into();
        let id = save_reminder(&conn, &input).unwrap();
        conn.execute_batch("INSERT INTO asset_usage(id,asset_id,kind,started_at,hours,source,confirmed,created_at) VALUES('initial','unit','play','2026-01-01T00:00:00Z',2,'manual',1,'2026-01-01');").unwrap();
        log_maintenance(
            &conn,
            &MaintenanceInput {
                asset_id: "unit".into(),
                event_type: "inspect".into(),
                event_at: "2026-01-10T00:00:00Z".into(),
                description: None,
                reminder_id: Some(id),
            },
        )
        .unwrap();
        conn.execute_batch("INSERT INTO asset_usage(id,asset_id,kind,started_at,hours,source,confirmed,created_at) VALUES('backfill','unit','play','2026-01-03T00:00:00Z',10,'import',1,'2026-10-22'),('ends-at-boundary','unit','play','2026-01-09T22:00:00Z',2,'manual',1,'2026-10-22');").unwrap();
        assert_eq!(
            reminders(&conn, Some("unit")).unwrap()[0]["hoursSinceCompletion"],
            0.0
        );
        conn.execute_batch("INSERT INTO asset_usage(id,asset_id,kind,started_at,hours,source,confirmed,created_at) VALUES('after','unit','play','2026-01-11T00:00:00Z',3,'manual',1,'2026-10-22');").unwrap();
        assert_eq!(
            reminders(&conn, Some("unit")).unwrap()[0]["hoursSinceCompletion"],
            3.0
        );
    }

    #[test]
    fn usage_spanning_maintenance_returns_unknown_instead_of_assumed_runtime() {
        let conn = database();
        conn.execute_batch("INSERT INTO asset_usage(id,asset_id,kind,started_at,hours,source,confirmed,created_at) VALUES('straddles','unit','play','2026-01-09T23:00:00Z',2,'manual',1,'2026-01-10');").unwrap();
        assert_eq!(
            hours_since_completion(&conn, "unit", "2026-01-10T00:00:00Z").unwrap(),
            None
        );
        conn.execute(
            "UPDATE asset_usage SET confirmed=0 WHERE id='straddles'",
            [],
        )
        .unwrap();
        assert_eq!(
            hours_since_completion(&conn, "unit", "2026-01-10T00:00:00Z").unwrap(),
            Some(0.0)
        );
    }
}

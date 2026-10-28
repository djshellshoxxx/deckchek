//! FS-23 persistence adapter. SQL owns references and atomic mutations; the
//! pure frontend fleet policy owns health, due-state display and CSV filtering.
use crate::db::{database_path, new_id, now_iso, open_database};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
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
/// Ids are opaque tokens: 1..=128 printable ASCII characters without whitespace. Checked before any SQL
/// so an oversized or control-character id never reaches the database or an error message.
pub fn valid_id(value: &str, field: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 128 || !value.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(format!("invalid {field}"));
    }
    Ok(())
}
fn valid_opt_id(value: Option<&str>, field: &str) -> Result<(), String> {
    value.map_or(Ok(()), |v| valid_id(v, field))
}
fn asset_exists(conn: &Connection, id: &str) -> Result<(), String> {
    valid_id(id, "asset id")?;
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

#[cfg(test)]
fn hours_since_completion(
    conn: &Connection,
    asset: &str,
    completed: &str,
) -> Result<Option<f64>, String> {
    let completed: Option<f64> = conn.query_row("SELECT julianday(?1)", [completed], |r| r.get(0)).map_err(err)?;
    let usage = confirmed_usage(conn, Some(asset))?;
    Ok(since_completion(usage.get(asset).map_or(&[][..], Vec::as_slice), completed))
}

/// Confirmed ledger entries as (hours, julianday(started_at)) per asset, in one pass.
fn confirmed_usage(conn: &Connection, asset: Option<&str>) -> Result<HashMap<String, Vec<(f64, Option<f64>)>>, String> {
    let mut query = conn.prepare("SELECT asset_id,hours,julianday(started_at) FROM asset_usage WHERE confirmed=1 AND (?1 IS NULL OR asset_id=?1)").map_err(err)?;
    let mut usage: HashMap<String, Vec<(f64, Option<f64>)>> = HashMap::new();
    for row in query.query_map([asset], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?, r.get::<_, Option<f64>>(2)?))).map_err(err)? {
        let (asset, hours, started) = row.map_err(err)?;
        usage.entry(asset).or_default().push((hours, started));
    }
    Ok(usage)
}

/// Confirmed ledger hours whose entire recorded span starts at/after completion.
/// A straddling entry has no measured within-entry time distribution; return
/// unknown until the user splits/reviews it rather than inventing runtime.
fn since_completion(entries: &[(f64, Option<f64>)], completed: Option<f64>) -> Option<f64> {
    let mut total = 0.0;
    for &(hours, started) in entries {
        let elapsed = (completed? - started?) * 24.0;
        if elapsed <= 0.0 {
            total += hours;
        } else if elapsed < hours - 0.000001 {
            return None;
        }
    }
    Some(total)
}

/// Titles of a device profile's tests, read from the synced profile JSON. Unknown profile or test -> no entry.
fn profile_test_titles(conn: &Connection, profile_id: &str) -> HashMap<String, String> {
    let json: Option<String> = conn.query_row("SELECT json FROM device_profile WHERE id=?1", [profile_id], |r| r.get(0)).optional().ok().flatten();
    let Some(value) = json.and_then(|j| serde_json::from_str::<Value>(&j).ok()) else { return HashMap::new() };
    value["tests"].as_array().map(|tests| {
        tests.iter().filter_map(|t| Some((t["id"].as_str()?.to_string(), t["title"].as_str()?.chars().take(200).collect::<String>()))).collect()
    }).unwrap_or_default()
}

/// One pass over each table (never a query per asset), so a fleet of thousands stays interactive.
pub fn snapshot(conn: &Connection) -> Result<Value, String> {
    let mut query = conn.prepare("SELECT a.id,a.nickname,a.serial_number,a.installed_date,a.created_at,p.model,p.category,a.deck_position_id,d.name,d.booth_id,b.name,b.venue_id,v.name,a.product_id FROM asset a LEFT JOIN product p ON p.id=a.product_id LEFT JOIN deck_position d ON d.id=a.deck_position_id LEFT JOIN booth b ON b.id=d.booth_id LEFT JOIN venue v ON v.id=b.venue_id WHERE a.is_deleted=0 ORDER BY a.nickname COLLATE NOCASE,a.id").map_err(err)?;
    let mut assets = query.query_map([], |r| Ok(json!({"assetId":r.get::<_,String>(0)?,"nickname":r.get::<_,String>(1)?,"serialNumber":r.get::<_,Option<String>>(2)?,"installedDate":r.get::<_,Option<String>>(3)?,"createdAt":r.get::<_,String>(4)?,"productName":r.get::<_,Option<String>>(5)?,"category":r.get::<_,Option<String>>(6)?,"deckPositionId":r.get::<_,Option<String>>(7)?,"position":r.get::<_,Option<String>>(8)?,"boothId":r.get::<_,Option<String>>(9)?,"booth":r.get::<_,Option<String>>(10)?,"venueId":r.get::<_,Option<String>>(11)?,"venue":r.get::<_,Option<String>>(12)?,"productId":r.get::<_,Option<String>>(13)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;

    // Latest result per (asset, test), whichever profile recorded it.
    let mut results: HashMap<String, Vec<Value>> = HashMap::new();
    {
        let mut titles: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut tests = conn.prepare("SELECT asset_id,test_id,status,created_at,id,profile_id FROM (SELECT asset_id,test_id,status,created_at,id,profile_id,ROW_NUMBER() OVER(PARTITION BY asset_id,test_id ORDER BY julianday(created_at) DESC,id DESC) AS rank FROM device_test_result) WHERE rank=1 ORDER BY asset_id,test_id").map_err(err)?;
        let rows = tests.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?, r.get::<_,String>(3)?, r.get::<_,String>(4)?, r.get::<_,String>(5)?))).map_err(err)?;
        for row in rows {
            let (asset, test, status, created, id, profile) = row.map_err(err)?;
            let mut item = json!({"testId":test,"status":status,"createdAt":created,"id":id});
            if status == "fail" {
                let name = titles.entry(profile.clone()).or_insert_with(|| profile_test_titles(conn, &profile)).get(&test).cloned();
                if let Some(name) = name { item["name"] = json!(name); }
            }
            results.entry(asset).or_default().push(item);
        }
    }
    // Newest completed session per asset: sessions that name the asset in their snapshot, or ran on a setup that uses it.
    let mut sessions: HashMap<String, String> = HashMap::new();
    {
        let mut keep = |asset: String, at: Option<String>| { if let Some(at) = at { let e = sessions.entry(asset).or_default(); if *e < at { *e = at; } } };
        let mut direct = conn.prepare("SELECT COALESCE(json_extract(config_snapshot_json,'$.assetId'),json_extract(config_snapshot_json,'$.deviceId')) AS asset,MAX(COALESCE(ended_at,started_at)) FROM session WHERE status='completed' AND json_valid(config_snapshot_json) GROUP BY asset").map_err(err)?;
        for row in direct.query_map([], |r| Ok((r.get::<_,Option<String>>(0)?, r.get::<_,Option<String>>(1)?))).map_err(err)? {
            let (asset, at) = row.map_err(err)?;
            if let Some(asset) = asset { keep(asset, at); }
        }
        let mut via_setup = conn.prepare("SELECT sc.asset_id,MAX(COALESCE(s.ended_at,s.started_at)) FROM setup_component sc JOIN session s ON s.setup_id=sc.setup_id WHERE s.status='completed' GROUP BY sc.asset_id").map_err(err)?;
        for row in via_setup.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,Option<String>>(1)?))).map_err(err)? {
            let (asset, at) = row.map_err(err)?;
            keep(asset, at);
        }
    }
    let mut hours_by_asset: HashMap<String, f64> = HashMap::new();
    {
        let mut q = conn.prepare("SELECT asset_id,COALESCE(SUM(hours),0) FROM asset_usage WHERE confirmed=1 GROUP BY asset_id").map_err(err)?;
        for row in q.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,f64>(1)?))).map_err(err)? {
            let (asset, total) = row.map_err(err)?;
            hours_by_asset.insert(asset, total);
        }
    }
    let mut reminders_by_asset: HashMap<String, Vec<Value>> = HashMap::new();
    let mut templates: Vec<Value> = Vec::new();
    for reminder in reminders(conn, None)? {
        match reminder["assetId"].as_str().map(str::to_string) {
            Some(asset) => reminders_by_asset.entry(asset).or_default().push(reminder),
            None => templates.push(reminder),
        }
    }
    for asset in &mut assets {
        let id = asset["assetId"].as_str().unwrap_or_default().to_string();
        asset["lastResults"] = json!(results.remove(&id).unwrap_or_default());
        asset["lastSessionAt"] = json!(sessions.get(&id));
        asset["hoursTotal"] = json!(hours_by_asset.get(&id).copied().unwrap_or(0.0));
        asset["reminders"] = json!(reminders_by_asset.remove(&id).unwrap_or_default());
    }
    let rows = assets;
    let mut booths = conn
        .prepare("SELECT id,venue_id,name FROM booth ORDER BY name COLLATE NOCASE,id")
        .map_err(err)?;
    let booths = booths.query_map([],|r| Ok(json!({"id":r.get::<_,String>(0)?,"venueId":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let mut positions = conn
        .prepare("SELECT id,booth_id,name FROM deck_position ORDER BY name COLLATE NOCASE,id")
        .map_err(err)?;
    let positions = positions.query_map([],|r| Ok(json!({"id":r.get::<_,String>(0)?,"boothId":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let venues = crate::catalog::list(conn, crate::catalog::Entity::Venue, None)?;
    let products = crate::catalog::list(conn, crate::catalog::Entity::Product, None)?;
    Ok(
        json!({"rows":rows,"venues":venues,"booths":booths,"positions":positions,"products":products,"templates":templates}),
    )
}

const REMINDERS_SQL: &str = "SELECT id,asset_id,product_id,title,basis,interval_value,warn_before,enabled,snoozed_until,created_at FROM maintenance_reminder WHERE (?1 IS NULL OR asset_id=?1) ORDER BY title,id";
/// Latest completion per reminder in one window pass over the event log (completion events always belong to
/// the reminder's asset, so the asset filter can use idx_maint_asset_time).
const LATEST_COMPLETIONS_SQL: &str = "SELECT reminder_id,event_at,hours_at_event,julianday(event_at) FROM (SELECT reminder_id,event_at,hours_at_event,ROW_NUMBER() OVER(PARTITION BY reminder_id ORDER BY julianday(event_at) DESC,id DESC) AS rank FROM maintenance_event WHERE reminder_id IS NOT NULL AND (?1 IS NULL OR asset_id=?1)) WHERE rank=1";

/// Reminders with their latest completion and tracked hours since it. A fixed number of passes (reminders,
/// completions, ledger), never a query per reminder, so the overview stays fast as the event log grows.
pub fn reminders(conn: &Connection, asset: Option<&str>) -> Result<Vec<Value>, String> {
    let mut completions: HashMap<String, (String, Option<f64>, Option<f64>)> = HashMap::new();
    {
        let mut query = conn.prepare(LATEST_COMPLETIONS_SQL).map_err(err)?;
        for row in query.query_map([asset], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<f64>>(2)?, r.get::<_, Option<f64>>(3)?))).map_err(err)? {
            let (reminder, at, hours, julian) = row.map_err(err)?;
            completions.insert(reminder, (at, hours, julian));
        }
    }
    let usage = if completions.is_empty() { HashMap::new() } else { confirmed_usage(conn, asset)? };
    let mut query = conn.prepare(REMINDERS_SQL).map_err(err)?;
    let mut rows = query.query_map([asset], |r| Ok(json!({"id":r.get::<_,String>(0)?,"assetId":r.get::<_,Option<String>>(1)?,"productId":r.get::<_,Option<String>>(2)?,"title":r.get::<_,String>(3)?,"basis":r.get::<_,String>(4)?,"intervalValue":r.get::<_,f64>(5)?,"warnBefore":r.get::<_,f64>(6)?,"enabled":r.get::<_,bool>(7)?,"snoozedUntil":r.get::<_,Option<String>>(8)?,"createdAt":r.get::<_,String>(9)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    for row in &mut rows {
        let latest = row["id"].as_str().and_then(|id| completions.get(id));
        row["lastDoneAt"] = json!(latest.map(|c| &c.0));
        row["hoursAtLastEvent"] = json!(latest.and_then(|c| c.1));
        if let (Some(asset), Some(&(_, _, completed))) = (row["assetId"].as_str(), latest) {
            let entries = usage.get(asset).map_or(&[][..], Vec::as_slice);
            row["hoursSinceCompletion"] = json!(since_completion(entries, completed));
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
fn validate_policy(title: &str, basis: &str, interval: f64, warning: f64) -> Result<(), String> {
    text(title, "title", 200)?;
    if !matches!(basis, "days" | "hours")
        || !interval.is_finite()
        || interval <= 0.0
        || interval > 1_000_000.0
        || !warning.is_finite()
        || warning < 0.0
        || warning > 1_000_000.0
    {
        return Err("invalid reminder interval".into());
    }
    if basis == "days" && interval.fract() != 0.0 {
        return Err("days interval must be a whole calendar day".into());
    }
    Ok(())
}
pub fn save_reminder(conn: &Connection, input: &ReminderInput) -> Result<String, String> {
    valid_opt_id(input.id.as_deref(), "reminder id")?;
    asset_exists(conn, &input.asset_id)?;
    let warning = input.warn_before.unwrap_or(14.0);
    validate_policy(&input.title, &input.basis, input.interval_value, warning)?;
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
    let changed = conn.execute("INSERT INTO maintenance_reminder(id,asset_id,title,basis,interval_value,warn_before,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET title=excluded.title,basis=excluded.basis,interval_value=excluded.interval_value,warn_before=excluded.warn_before WHERE maintenance_reminder.asset_id=excluded.asset_id",params![id,input.asset_id,input.title.trim(),input.basis,input.interval_value,warning,now_iso(conn)?]).map_err(err)?;
    if changed == 0 {
        return Err("reminder identity belongs to another target".into());
    }
    Ok(id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateInput {
    pub id: Option<String>,
    pub product_id: String,
    pub title: String,
    pub basis: String,
    pub interval_value: f64,
    pub warn_before: Option<f64>,
}
pub fn save_template(conn: &Connection, input: &TemplateInput) -> Result<String, String> {
    valid_opt_id(input.id.as_deref(), "template id")?;
    valid_id(&input.product_id, "product id")?;
    let warning = input.warn_before.unwrap_or(14.0);
    validate_policy(&input.title, &input.basis, input.interval_value, warning)?;
    let id = input.id.clone().unwrap_or_else(new_id);
    let previous: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT asset_id,product_id FROM maintenance_reminder WHERE id=?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    if previous.is_some_and(|(asset, product)| {
        asset.is_some() || product.as_deref() != Some(input.product_id.as_str())
    }) {
        return Err("template identity belongs to another target".into());
    }
    let changed = conn.execute("INSERT INTO maintenance_reminder(id,product_id,title,basis,interval_value,warn_before,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET title=excluded.title,basis=excluded.basis,interval_value=excluded.interval_value,warn_before=excluded.warn_before WHERE maintenance_reminder.asset_id IS NULL AND maintenance_reminder.product_id=excluded.product_id",params![id,input.product_id,input.title.trim(),input.basis,input.interval_value,warning,now_iso(conn)?]).map_err(err)?;
    if changed == 0 {
        return Err("template identity belongs to another target".into());
    }
    Ok(id)
}
pub fn apply_template(conn: &Connection, template: &str, asset: &str) -> Result<String, String> {
    valid_id(template, "template id")?;
    asset_exists(conn, asset)?;
    let row:(String,String,f64,f64)=conn.query_row("SELECT r.title,r.basis,r.interval_value,r.warn_before FROM maintenance_reminder r JOIN asset a ON a.product_id=r.product_id WHERE r.id=?1 AND r.asset_id IS NULL AND r.enabled=1 AND a.id=?2",params![template,asset],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).map_err(|_|"template is unavailable or belongs to a different product".to_string())?;
    let identity = serde_json::to_vec(&[template, asset]).map_err(|error| error.to_string())?;
    save_reminder(
        conn,
        &ReminderInput {
            id: Some(format!(
                "template:{}",
                crate::canonical::sha256_hex(&identity)
            )),
            asset_id: asset.into(),
            title: row.0,
            basis: row.1,
            interval_value: row.2,
            warn_before: Some(row.3),
        },
    )
}

pub fn snooze(conn: &Connection, id: &str, until: &str) -> Result<(), String> {
    valid_id(id, "reminder id")?;
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

/// Delete an asset reminder or a product template. Logged maintenance stays in the history; its link to
/// the deleted reminder is cleared (maintenance_event.reminder_id has no ON DELETE action).
pub fn delete_reminder(conn: &Connection, id: &str) -> Result<(), String> {
    valid_id(id, "reminder id")?;
    let tx = conn.unchecked_transaction().map_err(err)?;
    tx.execute("UPDATE maintenance_event SET reminder_id=NULL WHERE reminder_id=?1", [id]).map_err(err)?;
    if tx.execute("DELETE FROM maintenance_reminder WHERE id=?1", [id]).map_err(err)? == 0 {
        return Err("reminder not found".into());
    }
    tx.commit().map_err(err)
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
    valid_opt_id(input.reminder_id.as_deref(), "reminder id")?;
    asset_exists(conn, &input.asset_id)?;
    if !matches!(
        input.event_type.as_str(),
        "clean" | "lubricate" | "calibrate" | "repair" | "replace_part" | "inspect" | "other"
    ) || !timestamp_valid(conn, &input.event_at)?
    {
        return Err("invalid maintenance event".into());
    }
    if input.reminder_id.is_some() {
        // A completion dated after today would reset its reminder and hide it until that date (spec §7).
        // One calendar day of slack: the UI dates events by the user's local calendar day.
        let future: bool = conn
            .query_row("SELECT julianday(?1) >= julianday(date('now','+2 days'))", [&input.event_at], |r| r.get(0))
            .map_err(err)?;
        if future {
            return Err("maintenance completion date is in the future".into());
        }
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

#[cfg(test)]
pub fn maintenance_events(conn: &Connection, asset: &str) -> Result<Vec<Value>, String> {
    maintenance_filtered(conn, Some(asset), None, None, None)
}
pub fn maintenance_filtered(
    conn: &Connection,
    asset: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
    event_type: Option<&str>,
) -> Result<Vec<Value>, String> {
    if let Some(asset) = asset {
        asset_exists(conn, asset)?;
    }
    for value in [from, to].into_iter().flatten() {
        if value.len() != 10 || !timestamp_valid(conn, &format!("{value}T00:00:00Z"))? {
            return Err("maintenance filters require UTC calendar dates".into());
        }
    }
    if from.zip(to).is_some_and(|(from, to)| from > to) {
        return Err("maintenance date range is reversed".into());
    }
    if event_type.is_some_and(|kind| {
        !matches!(
            kind,
            "clean" | "lubricate" | "calibrate" | "repair" | "replace_part" | "inspect" | "other"
        )
    }) {
        return Err("unknown maintenance event type".into());
    }
    let mut query=conn.prepare("SELECT e.id,e.event_type,e.event_at,e.description,e.reminder_id,e.hours_at_event,e.asset_id,a.nickname FROM maintenance_event e JOIN asset a ON a.id=e.asset_id WHERE (?1 IS NULL OR e.asset_id=?1) AND (?2 IS NULL OR julianday(e.event_at)>=julianday(?2)) AND (?3 IS NULL OR julianday(e.event_at)<julianday(?3)+1) AND (?4 IS NULL OR e.event_type=?4) ORDER BY julianday(e.event_at) DESC,e.id DESC LIMIT 1000").map_err(err)?;
    let rows = query.query_map(params![asset,from,to,event_type],|r|Ok(json!({"id":r.get::<_,String>(0)?,"eventType":r.get::<_,String>(1)?,"eventAt":r.get::<_,String>(2)?,"description":r.get::<_,Option<String>>(3)?,"reminderId":r.get::<_,Option<String>>(4)?,"hoursAtEvent":r.get::<_,Option<f64>>(5)?,"assetId":r.get::<_,String>(6)?,"assetName":r.get::<_,String>(7)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    Ok(rows)
}

pub fn place(conn: &mut Connection, asset: &str, position: Option<&str>) -> Result<(), String> {
    asset_exists(conn, asset)?;
    valid_opt_id(position, "position id")?;
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
    place_in_transaction(&tx, asset, position)?;
    tx.commit().map_err(err)
}

/// "Venue / Booth / Position" for a position id; "Unplaced" for none or a position that no longer exists.
fn location_label(conn: &Connection, position: Option<&str>) -> Result<String, String> {
    let Some(id) = position else { return Ok("Unplaced".into()) };
    let label: Option<String> = conn
        .query_row("SELECT COALESCE(v.name,'?') || ' / ' || b.name || ' / ' || d.name FROM deck_position d JOIN booth b ON b.id=d.booth_id LEFT JOIN venue v ON v.id=b.venue_id WHERE d.id=?1", [id], |r| r.get(0))
        .optional()
        .map_err(err)?;
    Ok(label.unwrap_or_else(|| "Unplaced".into()))
}

fn place_in_transaction(tx: &Connection, asset: &str, position: Option<&str>) -> Result<(), String> {
    let previous: Option<String> = tx.query_row("SELECT deck_position_id FROM asset WHERE id=?1", [asset], |r| r.get(0)).map_err(err)?;
    if previous.as_deref() == position {
        return Ok(()); // not a move: no update and no "Moved from A to A" event
    }
    tx.execute(
        "UPDATE asset SET deck_position_id=?2,updated_at=?3 WHERE id=?1",
        params![asset, position, now_iso(&tx)?],
    )
    .map_err(err)?;
    let description = format!("Moved from {} to {}", location_label(tx, previous.as_deref())?, location_label(tx, position)?);
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
    Ok(())
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
    valid_opt_id(input.id.as_deref(), "location id")?;
    valid_id(&input.parent_id, "parent id")?;
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

/// Explicitly supplied by the user; a null position means Unplaced.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationMove {
    pub deck_position_id: Option<String>,
}

pub fn delete_location(conn: &mut Connection, kind: &str, id: &str, move_to: Option<&LocationMove>) -> Result<(), String> {
    valid_id(id, "location id")?;
    valid_opt_id(move_to.and_then(|m| m.deck_position_id.as_deref()), "destination id")?;
    let (scope, delete_sql) = match kind {
        "venue" => ("b.venue_id=?1", "DELETE FROM venue WHERE id=?1"),
        "booth" => ("d.booth_id=?1", "DELETE FROM booth WHERE id=?1"),
        "position" => ("d.id=?1", "DELETE FROM deck_position WHERE id=?1"),
        _ => return Err("unknown location kind".into()),
    };
    let tx = conn.transaction().map_err(err)?;
    let assets = {
        let mut query = tx.prepare(&format!("SELECT a.id FROM asset a JOIN deck_position d ON d.id=a.deck_position_id JOIN booth b ON b.id=d.booth_id WHERE a.is_deleted=0 AND {scope}")).map_err(err)?;
        let rows = query.query_map([id], |row| row.get::<_,String>(0)).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
        rows
    };
    // Assets deleted in Equipment keep their old placement; release them silently (they are not shown in the
    // fleet and have no move history to record) so they never block deleting the location.
    tx.execute(&format!("UPDATE asset SET deck_position_id=NULL,updated_at=?2 WHERE is_deleted=1 AND deck_position_id IN (SELECT d.id FROM deck_position d JOIN booth b ON b.id=d.booth_id WHERE {scope})"), params![id, now_iso(&tx)?]).map_err(err)?;
    if let Some(target) = move_to {
        if let Some(position) = &target.deck_position_id {
            let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM deck_position WHERE id=?1)", [position], |r|r.get(0)).map_err(err)?;
            if !exists { return Err("destination position not found".into()); }
            let inside: bool = tx.query_row(&format!("SELECT EXISTS(SELECT 1 FROM deck_position d JOIN booth b ON b.id=d.booth_id WHERE {scope} AND d.id=?2)"), params![id,position], |r|r.get(0)).map_err(err)?;
            if inside { return Err("destination must be outside the location being deleted".into()); }
        }
        for asset in &assets {
            place_in_transaction(&tx, asset, target.deck_position_id.as_deref())?;
        }
    } else if !assets.is_empty() {
        return Err(format!("move or unplace {} assets before deleting this location", assets.len()));
    }
    let deleted = tx.execute(delete_sql, [id])
        .map_err(|_| "location is still referenced by a setup or diagnostic record; no assets were moved".to_string())?;
    if deleted != 1 { return Err("location not found".into()); }
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
pub fn reminder_template_upsert(app: AppHandle, input: TemplateInput) -> Result<String, String> {
    let conn = open_database(&database_path(&app)?)?;
    save_template(&conn, &input)
}
#[tauri::command]
pub fn reminder_apply_template(
    app: AppHandle,
    template_id: String,
    asset_id: String,
) -> Result<String, String> {
    let conn = open_database(&database_path(&app)?)?;
    apply_template(&conn, &template_id, &asset_id)
}
// Registration belongs in lib.rs's [FS-23] handlers block (`fleet::reminder_delete`); until then it is unused.
#[allow(dead_code)]
#[tauri::command]
pub fn reminder_delete(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_database(&database_path(&app)?)?;
    delete_reminder(&conn, &id)
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
pub fn maintenance_list(
    app: AppHandle,
    asset_id: Option<String>,
    from: Option<String>,
    to: Option<String>,
    event_type: Option<String>,
) -> Result<Vec<Value>, String> {
    let conn = open_database(&database_path(&app)?)?;
    maintenance_filtered(
        &conn,
        asset_id.as_deref(),
        from.as_deref(),
        to.as_deref(),
        event_type.as_deref(),
    )
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
pub fn fleet_location_delete(app: AppHandle, kind: String, id: String, move_to: Option<LocationMove>) -> Result<(), String> {
    let mut conn = open_database(&database_path(&app)?)?;
    delete_location(&mut conn, &kind, &id, move_to.as_ref())
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
    fn location_delete_moves_assets_atomically_and_rejects_its_own_subtree() {
        for kind in ["venue", "booth", "position"] {
            let mut conn = database();
            place(&mut conn, "unit", Some("position")).unwrap();
            conn.execute_batch("INSERT INTO venue(id,name,created_at,updated_at) VALUES('destination','Other club','2026-01-01','2026-01-01'); INSERT INTO booth(id,venue_id,name) VALUES('destination-booth','destination','Other booth'); INSERT INTO deck_position(id,booth_id,name) VALUES('destination-position','destination-booth','Right');").unwrap();
            let id = match kind { "venue" => "venue", "booth" => "booth", _ => "position" };
            let target = LocationMove { deck_position_id: Some("position".into()) };
            assert!(delete_location(&mut conn, kind, id, Some(&target)).unwrap_err().contains("outside"));
            let target = LocationMove { deck_position_id: Some("missing".into()) };
            assert!(delete_location(&mut conn, kind, id, Some(&target)).unwrap_err().contains("not found"));
            let target = LocationMove { deck_position_id: Some("destination-position".into()) };
            conn.execute_batch("INSERT INTO setup(id,name,deck_position_id,created_at) VALUES('setup','Saved chain','position','2026-01-01');").unwrap();
            let before: i64 = conn.query_row("SELECT COUNT(*) FROM maintenance_event", [], |r|r.get(0)).unwrap();
            assert!(delete_location(&mut conn, kind, id, Some(&target)).is_err());
            assert_eq!(conn.query_row("SELECT deck_position_id FROM asset WHERE id='unit'", [], |r|r.get::<_,String>(0)).unwrap(), "position");
            assert_eq!(conn.query_row("SELECT COUNT(*) FROM maintenance_event", [], |r|r.get::<_,i64>(0)).unwrap(), before);
            conn.execute("DELETE FROM setup WHERE id='setup'", []).unwrap();
            delete_location(&mut conn, kind, id, Some(&target)).unwrap();
            assert_eq!(conn.query_row("SELECT deck_position_id FROM asset WHERE id='unit'", [], |r|r.get::<_,String>(0)).unwrap(), "destination-position");
            assert_eq!(conn.query_row("SELECT COUNT(*) FROM asset", [], |r|r.get::<_,i64>(0)).unwrap(), 2);
            assert_eq!(conn.query_row("SELECT COUNT(*) FROM maintenance_event", [], |r|r.get::<_,i64>(0)).unwrap(), before + 1);
        }
        let mut conn = database();
        place(&mut conn, "unit", Some("position")).unwrap();
        delete_location(&mut conn, "venue", "venue", Some(&LocationMove { deck_position_id: None })).unwrap();
        assert_eq!(conn.query_row("SELECT deck_position_id FROM asset WHERE id='unit'", [], |r|r.get::<_,Option<String>>(0)).unwrap(), None);
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
            assert!(delete_location(&mut conn, kind, id, None)
                .unwrap_err()
                .contains("move or unplace"));
        }
        place(&mut conn, "unit", None).unwrap();
        conn.execute_batch("INSERT INTO setup(id,name,venue_id,created_at) VALUES('setup','Chain','venue','2026-10-22');").unwrap();
        assert!(delete_location(&mut conn, "venue", "venue", None).is_err());
        conn.execute("DELETE FROM setup WHERE id='setup'", [])
            .unwrap();
        delete_location(&mut conn, "venue", "venue", None).unwrap();
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

    #[test]
    fn product_reminder_templates_apply_idempotently_and_reject_wrong_products() {
        let conn = database();
        conn.execute_batch("INSERT INTO product(id,category,model,created_at,updated_at) VALUES('model','turntable','Reference','2026-01-01','2026-01-01');UPDATE asset SET product_id='model' WHERE id='unit';").unwrap();
        let input = TemplateInput {
            id: None,
            product_id: "model".into(),
            title: "Inspect stylus".into(),
            basis: "hours".into(),
            interval_value: 300.0,
            warn_before: Some(20.0),
        };
        let template = save_template(&conn, &input).unwrap();
        let first = apply_template(&conn, &template, "unit").unwrap();
        assert_eq!(apply_template(&conn, &template, "unit").unwrap(), first);
        assert_eq!(reminders(&conn, Some("unit")).unwrap().len(), 1);
        assert!(apply_template(&conn, &template, "other").is_err());
        let view = snapshot(&conn).unwrap();
        assert_eq!(view["templates"].as_array().unwrap().len(), 1);
        assert_eq!(
            view["rows"]
                .as_array()
                .unwrap()
                .iter()
                .find(|row| row["assetId"] == "unit")
                .unwrap()["productId"],
            "model"
        );
        let mut takeover = ReminderInput {
            id: Some(template),
            asset_id: "unit".into(),
            title: "Hijack".into(),
            basis: "days".into(),
            interval_value: 90.0,
            warn_before: None,
        };
        assert!(save_reminder(&conn, &takeover).is_err());
        takeover.id = None;
        assert!(save_reminder(&conn, &takeover).is_ok());
    }

    #[test]
    fn maintenance_history_filters_utc_dates_and_event_types_before_limiting() {
        let conn = database();
        for (date, kind) in [
            ("2026-01-01", "clean"),
            ("2026-01-02", "repair"),
            ("2026-01-03", "clean"),
        ] {
            log_maintenance(
                &conn,
                &MaintenanceInput {
                    asset_id: "unit".into(),
                    event_type: kind.into(),
                    event_at: format!("{date}T23:00:00Z"),
                    description: None,
                    reminder_id: None,
                },
            )
            .unwrap();
        }
        let rows = maintenance_filtered(
            &conn,
            Some("unit"),
            Some("2026-01-02"),
            Some("2026-01-03"),
            Some("clean"),
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["eventAt"], "2026-01-03T23:00:00Z");
        assert!(maintenance_filtered(&conn, Some("unit"), Some("2026-02-31"), None, None).is_err());
        assert!(
            maintenance_filtered(&conn, Some("unit"), Some("2026-01-03"), Some("2026-01-01"), None)
                .is_err()
        );
        assert!(maintenance_filtered(&conn, Some("unit"), None, None, Some("injected")).is_err());
        log_maintenance(&conn, &MaintenanceInput {
            asset_id: "unit".into(), event_type: "inspect".into(),
            event_at: "9999-12-31T23:59:59.999Z".into(), description: None, reminder_id: None,
        }).unwrap();
        let maximum_day = maintenance_filtered(&conn, Some("unit"), Some("9999-12-31"), Some("9999-12-31"), None).unwrap();
        assert_eq!(maximum_day.len(), 1, "maximum accepted date must remain inclusive without calendar overflow");
        assert_eq!(maximum_day[0]["eventAt"], "9999-12-31T23:59:59.999Z");
    }

    #[test]
    fn migration_0017_upgrades_a_database_that_already_has_0018_and_is_a_no_op_on_rerun() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON; CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, app_version TEXT);").unwrap();
        for (version, sql) in crate::db::MIGRATIONS.iter().filter(|(v, _)| *v != 17) {
            conn.execute_batch(sql).unwrap();
            conn.execute("INSERT OR IGNORE INTO schema_migration(version,applied_at) VALUES(?1,'t')", [version]).unwrap();
        }
        conn.execute_batch("INSERT INTO asset(id,nickname,created_at,updated_at) VALUES('old','Old deck','t','t');
            INSERT INTO maintenance_event(id,asset_id,event_type,event_at,created_at) VALUES('e','old','clean','2026-01-01T00:00:00Z','t');").unwrap();
        crate::db::apply_migrations(&conn).unwrap();
        let (position, events): (Option<String>, i64) = conn.query_row("SELECT (SELECT deck_position_id FROM asset WHERE id='old'),(SELECT COUNT(*) FROM maintenance_event)", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((position, events), (None, 1), "existing assets start unplaced and keep their history");
        let reminder_link: Option<String> = conn.query_row("SELECT reminder_id FROM maintenance_event WHERE id='e'", [], |r| r.get(0)).unwrap();
        assert_eq!(reminder_link, None);
        let before: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migration", [], |r| r.get(0)).unwrap();
        crate::db::apply_migrations(&conn).unwrap();
        let after: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migration", [], |r| r.get(0)).unwrap();
        assert_eq!(before, after);
        let violations: i64 = conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
        assert_eq!(violations, 0);
    }

    #[test]
    fn every_command_input_id_is_validated_before_it_reaches_sql() {
        let mut conn = database();
        let bad = ["", " ", "a b", "tab\there", "nul\0id", "line\nbreak", "\u{e9}clair"];
        let too_long = "x".repeat(129);
        for id in bad.iter().copied().chain([too_long.as_str()]) {
            assert!(valid_id(id, "id").is_err(), "{id:?}");
            assert!(place(&mut conn, id, None).is_err(), "asset {id:?}");
            assert!(place(&mut conn, "unit", Some(id)).is_err(), "position {id:?}");
            assert!(snooze(&conn, id, "2026-10-23T00:00:00Z").is_err(), "snooze {id:?}");
            assert!(apply_template(&conn, id, "unit").is_err());
            assert!(delete_location(&mut conn, "booth", id, None).is_err());
            assert!(save_location(&conn, "booth", &LocationInput { id: Some(id.into()), parent_id: "venue".into(), name: "x".into() }).is_err());
            assert!(save_location(&conn, "booth", &LocationInput { id: None, parent_id: id.into(), name: "x".into() }).is_err());
            assert!(save_reminder(&conn, &ReminderInput { id: Some(id.into()), ..reminder("unit") }).is_err());
            assert!(save_template(&conn, &TemplateInput { id: None, product_id: id.into(), title: "t".into(), basis: "days".into(), interval_value: 30.0, warn_before: None }).is_err());
            assert!(log_maintenance(&conn, &MaintenanceInput { asset_id: "unit".into(), event_type: "clean".into(), event_at: "2026-01-01T00:00:00Z".into(), description: None, reminder_id: Some(id.into()) }).is_err());
            assert!(maintenance_filtered(&conn, Some(id), None, None, None).is_err());
        }
        for field in ["", "  ", "x\0y"] {
            assert!(save_location(&conn, "booth", &LocationInput { id: None, parent_id: "venue".into(), name: field.into() }).is_err(), "{field:?}");
        }
        let long_title = ReminderInput { title: "t".repeat(201), ..reminder("unit") };
        assert!(save_reminder(&conn, &long_title).is_err());
        assert!(save_location(&conn, "shelf", &LocationInput { id: None, parent_id: "venue".into(), name: "x".into() }).is_err());
        assert!(delete_location(&mut conn, "asset", "unit", None).is_err());
        let ok = "template:".to_string() + &"a".repeat(64);
        assert!(valid_id(&ok, "id").is_ok());
    }

    #[test]
    fn snooze_persists_and_rejects_bad_targets_and_times() {
        let conn = database();
        let id = save_reminder(&conn, &reminder("unit")).unwrap();
        snooze(&conn, &id, "2026-10-23T00:00:00.000Z").unwrap();
        let until: Option<String> = conn.query_row("SELECT snoozed_until FROM maintenance_reminder WHERE id=?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(until.as_deref(), Some("2026-10-23T00:00:00.000Z"));
        assert!(snooze(&conn, &id, "tomorrow").is_err());
        assert!(snooze(&conn, &id, "2026-02-30T00:00:00Z").is_err());
        assert!(snooze(&conn, "missing", "2026-10-23T00:00:00Z").is_err());
        let still: i64 = conn.query_row("SELECT COUNT(*) FROM maintenance_reminder WHERE id=?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(still, 1, "snoozing never deletes the reminder");
    }

    #[test]
    fn moves_are_logged_with_location_names_and_failing_tests_carry_profile_titles() {
        let mut conn = database();
        place(&mut conn, "unit", Some("position")).unwrap();
        place(&mut conn, "unit", None).unwrap();
        let events = maintenance_events(&conn, "unit").unwrap();
        let descriptions: Vec<&str> = events.iter().filter_map(|e| e["description"].as_str()).collect();
        assert!(descriptions.contains(&"Moved from Unplaced to Club / Booth / Left"), "{descriptions:?}");
        assert!(descriptions.contains(&"Moved from Club / Booth / Left to Unplaced"), "{descriptions:?}");
        conn.execute("UPDATE device_profile SET json=?1 WHERE id='profile'", [r#"{"tests":[{"id":"t-fail","title":"Pitch is accurate"},{"id":"t-pass","title":"Output is clean"}]}"#]).unwrap();
        conn.execute_batch("INSERT INTO device_test_result(id,asset_id,profile_id,test_id,status,created_at) VALUES('r1','unit','profile','t-fail','fail','2026-10-01T00:00:00Z'),('r2','unit','profile','t-pass','pass','2026-10-01T00:00:00Z'),('r3','unit','profile','unlisted','fail','2026-10-01T00:00:00Z');").unwrap();
        let snap = snapshot(&conn).unwrap();
        let unit = snap["rows"].as_array().unwrap().iter().find(|r| r["assetId"] == "unit").unwrap();
        let named: Vec<(String, Option<String>)> = unit["lastResults"].as_array().unwrap().iter()
            .map(|r| (r["testId"].as_str().unwrap().to_string(), r["name"].as_str().map(str::to_string))).collect();
        assert!(named.contains(&("t-fail".into(), Some("Pitch is accurate".into()))));
        assert!(named.contains(&("t-pass".into(), None)), "only failing tests are named");
        assert!(named.contains(&("unlisted".into(), None)), "an unknown test falls back to its id in the UI");
    }

    #[test]
    fn maintenance_list_without_an_asset_spans_the_fleet_newest_first() {
        let conn = database();
        for (asset, at) in [("unit", "2026-01-01T00:00:00Z"), ("other", "2026-02-01T00:00:00Z")] {
            log_maintenance(&conn, &MaintenanceInput { asset_id: asset.into(), event_type: "inspect".into(), event_at: at.into(), description: None, reminder_id: None }).unwrap();
        }
        let all = maintenance_filtered(&conn, None, None, None, None).unwrap();
        assert_eq!(all.iter().map(|e| e["assetName"].as_str().unwrap()).collect::<Vec<_>>(), ["Other", "Deck"]);
        let one = maintenance_filtered(&conn, Some("unit"), None, None, None).unwrap();
        assert_eq!(one.len(), 1);
        assert!(maintenance_filtered(&conn, Some("missing"), None, None, None).is_err());
    }

    /// A rental shop or school: 2000 assets with results, placement, ledger hours, events and reminders.
    /// The budget is deliberately lenient (debug build, shared CI machine); it guards against per-asset query regressions.
    #[test]
    fn a_fleet_of_two_thousand_assets_produces_its_overview_within_budget() {
        let conn = database();
        conn.execute_batch("INSERT INTO manufacturer(id,name,created_at,updated_at) VALUES('m','Maker','t','t');
            INSERT INTO product(id,manufacturer_id,category,model,created_at,updated_at) VALUES('p','m','turntable','TT-1','t','t');
            INSERT INTO setup(id,name,created_at) VALUES('setup','Rig','t');").unwrap();
        conn.execute_batch("BEGIN").unwrap();
        for i in 0..2000 {
            conn.execute("INSERT INTO asset(id,product_id,nickname,serial_number,deck_position_id,created_at,updated_at) VALUES(?1,'p',?2,?3,?4,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
                params![format!("fleet-{i}"), format!("Deck {i}"), format!("SN{i}"), if i % 2 == 0 { Some("position") } else { None }]).unwrap();
            conn.execute("INSERT INTO setup_component(id,setup_id,role,asset_id) VALUES(?1,'setup','turntable',?2)", params![format!("sc-{i}"), format!("fleet-{i}")]).unwrap();
            for t in 0..8 {
                for run in 0..2 {
                    let status = if t == 0 && run == 1 && i % 10 == 0 { "fail" } else { "pass" };
                    conn.execute("INSERT INTO device_test_result(id,asset_id,profile_id,test_id,status,created_at) VALUES(?1,?2,'profile',?3,?4,?5)",
                        params![format!("res-{i}-{t}-{run}"), format!("fleet-{i}"), format!("t{t}"), status, format!("2026-10-{:02}T00:00:00Z", 10 + run)]).unwrap();
                }
            }
            conn.execute("INSERT INTO asset_usage(id,asset_id,started_at,hours,source,created_at) VALUES(?1,?2,'2026-09-01T20:00:00.000Z',3,'manual','t')", params![format!("use-{i}"), format!("fleet-{i}")]).unwrap();
            conn.execute("INSERT INTO maintenance_reminder(id,asset_id,title,basis,interval_value,warn_before,created_at) VALUES(?1,?2,'Clean','days',90,14,'2026-01-01T00:00:00Z')", params![format!("rem-{i}"), format!("fleet-{i}")]).unwrap();
        }
        conn.execute_batch("COMMIT").unwrap();
        let started = std::time::Instant::now();
        let snap = snapshot(&conn).unwrap();
        let elapsed = started.elapsed();
        let rows = snap["rows"].as_array().unwrap();
        assert_eq!(rows.len(), 2002, "2000 fleet assets plus the two fixture assets");
        let failing = rows.iter().filter(|r| r["lastResults"].as_array().unwrap().iter().any(|x| x["status"] == "fail")).count();
        assert_eq!(failing, 200);
        let sample = rows.iter().find(|r| r["assetId"] == "fleet-7").unwrap();
        assert_eq!((sample["hoursTotal"].as_f64(), sample["reminders"].as_array().unwrap().len(), sample["lastResults"].as_array().unwrap().len()), (Some(3.0), 1, 8));
        assert!(elapsed < std::time::Duration::from_secs(10), "2000-asset overview took {elapsed:?}");
    }

    /// Review FS-23: an asset deleted in Equipment (soft delete) kept its deck_position_id, so its old
    /// position, booth and venue could never be deleted ("asset not found" / "move or unplace 1 assets").
    #[test]
    fn regression_soft_deleted_asset_does_not_block_location_delete() {
        for kind in ["venue", "booth", "position"] {
            for move_to in [None, Some(LocationMove { deck_position_id: None })] {
                let mut conn = database();
                place(&mut conn, "unit", Some("position")).unwrap();
                conn.execute("UPDATE asset SET is_deleted=1 WHERE id='unit'", []).unwrap();
                let before: i64 = conn.query_row("SELECT COUNT(*) FROM maintenance_event", [], |r| r.get(0)).unwrap();
                delete_location(&mut conn, kind, kind, move_to.as_ref()).unwrap_or_else(|e| panic!("{kind} {move_to:?}: {e}"));
                let position: Option<String> = conn.query_row("SELECT deck_position_id FROM asset WHERE id='unit'", [], |r| r.get(0)).unwrap();
                assert_eq!(position, None, "the deleted asset is released from the removed location");
                let deleted: i64 = conn.query_row("SELECT is_deleted FROM asset WHERE id='unit'", [], |r| r.get(0)).unwrap();
                assert_eq!(deleted, 1, "the asset stays deleted");
                let after: i64 = conn.query_row("SELECT COUNT(*) FROM maintenance_event", [], |r| r.get(0)).unwrap();
                assert_eq!(after, before, "no move event is logged for a deleted asset");
            }
        }
        // A live asset in the same position still blocks a delete without a destination.
        let mut conn = database();
        place(&mut conn, "unit", Some("position")).unwrap();
        place(&mut conn, "other", Some("position")).unwrap();
        conn.execute("UPDATE asset SET is_deleted=1 WHERE id='unit'", []).unwrap();
        assert!(delete_location(&mut conn, "position", "position", None).unwrap_err().contains("move or unplace 1 assets"));
    }

    /// Review FS-23: moving an asset to the position it already occupies logged "Moved from A to A".
    #[test]
    fn regression_moving_to_the_current_position_logs_no_event() {
        let mut conn = database();
        place(&mut conn, "unit", None).unwrap();
        assert!(maintenance_events(&conn, "unit").unwrap().is_empty(), "Unplaced -> Unplaced is not a move");
        place(&mut conn, "unit", Some("position")).unwrap();
        place(&mut conn, "unit", Some("position")).unwrap();
        let events = maintenance_events(&conn, "unit").unwrap();
        assert_eq!(events.len(), 1, "{events:?}");
        assert_eq!(events[0]["description"], "Moved from Unplaced to Club / Booth / Left");
    }

    /// Review FS-23: a completion dated in the future silently reset its reminder. It is now refused
    /// (one calendar day of slack covers time zones ahead of UTC) and the reminder keeps its last real completion.
    #[test]
    fn regression_future_dated_completion_is_rejected() {
        let conn = database();
        let id = save_reminder(&conn, &reminder("unit")).unwrap();
        let at = |offset: &str| -> String { conn.query_row("SELECT strftime('%Y-%m-%dT12:00:00.000Z','now',?1)", [offset], |r| r.get(0)).unwrap() };
        let complete = |event_at: String| log_maintenance(&conn, &MaintenanceInput { asset_id: "unit".into(), event_type: "clean".into(), event_at, description: None, reminder_id: Some(id.clone()) });
        complete(at("-1 day")).unwrap();
        let error = complete(at("+2 days")).unwrap_err();
        assert!(error.contains("future"), "{error}");
        assert_eq!(reminders(&conn, Some("unit")).unwrap()[0]["lastDoneAt"], at("-1 day"));
        complete(at("+1 day")).expect("tomorrow (UTC) is today somewhere ahead of UTC");
        assert!(complete("9999-12-31T23:59:59.999Z".into()).is_err());
    }

    /// Review FS-23: reminders() ran two unindexed correlated scans of maintenance_event per reminder plus
    /// one usage query per completed reminder. Spec §8: reminders for 1k assets in < 200 ms.
    #[test]
    fn regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget() {
        let conn = database();
        for sql in [REMINDERS_SQL, LATEST_COMPLETIONS_SQL] {
            let mut q = conn.prepare(&format!("EXPLAIN QUERY PLAN {sql}")).unwrap();
            let plan: Vec<String> = q.query_map([Option::<String>::None], |r| r.get::<_, String>(3)).unwrap().collect::<Result<_, _>>().unwrap();
            assert!(plan.iter().all(|step| !step.contains("CORRELATED")), "no per-reminder subquery: {plan:?}");
        }
        conn.execute_batch("BEGIN").unwrap();
        for i in 0..1000 {
            let asset = format!("fleet-{i}");
            conn.execute("INSERT INTO asset(id,nickname,created_at,updated_at) VALUES(?1,?1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", [&asset]).unwrap();
            for (r, basis) in [("days", "days"), ("hours", "hours")] {
                conn.execute("INSERT INTO maintenance_reminder(id,asset_id,title,basis,interval_value,warn_before,created_at) VALUES(?1,?2,'Clean',?3,90,14,'2026-01-01T00:00:00Z')", params![format!("rem-{r}-{i}"), asset, basis]).unwrap();
            }
            for e in 0..10 {
                let reminder = match e { 3 => Some(format!("rem-days-{i}")), 7 => Some(format!("rem-hours-{i}")), _ => None };
                conn.execute("INSERT INTO maintenance_event(id,asset_id,event_type,event_at,reminder_id,created_at) VALUES(?1,?2,'other',?3,?4,'t')", params![format!("ev-{i}-{e}"), asset, format!("2026-0{}-01T00:00:00Z", e % 9 + 1), reminder]).unwrap();
            }
            for u in 0..3 {
                conn.execute("INSERT INTO asset_usage(id,asset_id,started_at,hours,source,confirmed,created_at) VALUES(?1,?2,?3,2,'manual',1,'t')", params![format!("use-{i}-{u}"), asset, format!("2026-0{}-15T00:00:00Z", u * 3 + 2)]).unwrap();
            }
        }
        conn.execute_batch("COMMIT").unwrap();
        let started = std::time::Instant::now();
        let all = reminders(&conn, None).unwrap();
        let elapsed = started.elapsed();
        assert_eq!(all.len(), 2000);
        let days = all.iter().find(|r| r["id"] == "rem-days-5").unwrap();
        assert_eq!(days["lastDoneAt"], "2026-04-01T00:00:00Z");
        let hours = all.iter().find(|r| r["id"] == "rem-hours-5").unwrap();
        assert_eq!(hours["lastDoneAt"], "2026-08-01T00:00:00Z");
        assert_eq!(hours["hoursSinceCompletion"], 2.0, "only the usage entry starting after the completion counts");
        assert_eq!(days["hoursSinceCompletion"], 4.0);
        let one = reminders(&conn, Some("fleet-5")).unwrap();
        assert_eq!(one.iter().map(|r| r["hoursSinceCompletion"].clone()).collect::<Vec<_>>(), [json!(4.0), json!(2.0)]);
        assert!(elapsed < std::time::Duration::from_millis(200), "reminders for 1k assets took {elapsed:?}");
    }

    /// Review FS-23: templates (and reminders) could not be deleted, so a product with a template could never
    /// be deleted in Equipment (FOREIGN KEY constraint failed).
    #[test]
    fn regression_reminder_templates_can_be_deleted_so_the_product_can_be() {
        let conn = database();
        conn.execute_batch("INSERT INTO product(id,category,model,created_at,updated_at) VALUES('model','turntable','Reference','2026-01-01','2026-01-01');").unwrap();
        let template = save_template(&conn, &TemplateInput { id: None, product_id: "model".into(), title: "Clean faders".into(), basis: "days".into(), interval_value: 180.0, warn_before: None }).unwrap();
        assert!(conn.execute("DELETE FROM product WHERE id='model'", []).is_err(), "precondition: the template blocks the product delete");
        delete_reminder(&conn, &template).unwrap();
        conn.execute("DELETE FROM product WHERE id='model'", []).unwrap();
        assert!(delete_reminder(&conn, &template).unwrap_err().contains("not found"));
        assert!(delete_reminder(&conn, "bad id").is_err());
        // An asset reminder with completion history: the reminder goes, the logged maintenance stays.
        let id = save_reminder(&conn, &reminder("unit")).unwrap();
        log_maintenance(&conn, &MaintenanceInput { asset_id: "unit".into(), event_type: "clean".into(), event_at: "2026-01-01T00:00:00Z".into(), description: None, reminder_id: Some(id.clone()) }).unwrap();
        delete_reminder(&conn, &id).unwrap();
        assert!(reminders(&conn, Some("unit")).unwrap().is_empty());
        let events = maintenance_events(&conn, "unit").unwrap();
        assert_eq!(events.len(), 1);
        assert!(events[0]["reminderId"].is_null());
    }

    /// Review FS-23: maintenance_reminder.asset_id is ON DELETE CASCADE, and profile pruning used to hard-delete
    /// "unused" library assets without counting reminders. Pruning now counts every FK reference (0d7b413), so an
    /// asset with a reminder is retired instead and the reminder survives.
    #[test]
    fn regression_profile_pruning_keeps_fleet_reminders() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::apply_migrations(&conn).unwrap();
        crate::catalog::seed_if_empty(&conn).unwrap();
        let profile = |id: &str, model: &str| json!({"schemaVersion": 1, "id": id, "manufacturer": "Acme", "model": model, "category": "turntable", "summary": "Deck", "documents": [], "specs": [], "tests": []});
        let synced = crate::devices::sync_profiles(&mut conn, &[profile("keep", "K-1"), profile("gone", "G-1")]).unwrap();
        let asset = synced[1].asset_id.clone().unwrap();
        let id = save_reminder(&conn, &reminder(&asset)).unwrap();
        crate::devices::sync_profiles(&mut conn, &[profile("keep", "K-1")]).unwrap();
        let (exists, deleted): (i64, i64) = conn.query_row("SELECT COUNT(*),COALESCE(MAX(is_deleted),0) FROM asset WHERE id=?1", [&asset], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((exists, deleted), (1, 1), "the asset is retired, not hard-deleted");
        let kept: i64 = conn.query_row("SELECT COUNT(*) FROM maintenance_reminder WHERE id=?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(kept, 1, "the reminder is not cascade-deleted");
    }
}

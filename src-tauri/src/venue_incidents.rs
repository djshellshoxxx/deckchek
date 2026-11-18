//! SPEC-05 §20: append-only operator reports, never automatic sensor detections.
//! Context text is the bounded catalog selection supplied at the button press.
//! New writes validate current IDs/association; exact retries retain the original
//! row even after catalog changes. Historical IDs and snapshots survive deletion.

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::{database_path, now_iso, open_database};

const KINDS: &[&str] = &[
    "skip",
    "feedback",
    "hum",
    "needle_jump",
    "dropout",
    "booth_shock",
    "other",
];
const MAX_CONTEXT_BYTES: usize = 16 * 1024;
const DEFAULT_LIMIT: u32 = 100;
const MAX_LIMIT: u32 = 500;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectedVenue {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectedSetup {
    pub id: String,
    pub name: String,
    pub booth_id: Option<String>,
    pub deck_position_id: Option<String>,
    pub support_configuration_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectedContext {
    pub venue: SelectedVenue,
    pub setup: Option<SelectedSetup>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncidentInput {
    pub schema_version: u8,
    pub id: String,
    pub venue_id: String,
    pub setup_id: Option<String>,
    pub kind: String,
    pub occurred_at: String,
    pub note: Option<String>,
    pub context: SelectedContext,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    #[serde(flatten)]
    pub input: IncidentInput,
    pub origin: String,
    pub recorded_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncidentFilter {
    pub venue_id: Option<String>,
    pub setup_id: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentList {
    pub items: Vec<Incident>,
    pub total: u64,
    pub limit: u32,
    pub has_more: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncidentCursor {
    pub occurred_at: String,
    pub id: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncidentPageFilter {
    pub venue_id: Option<String>,
    pub setup_id: Option<String>,
    pub limit: Option<u32>,
    pub before: Option<IncidentCursor>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentPage {
    pub items: Vec<Incident>,
    pub total: u64,
    pub limit: u32,
    pub has_more: bool,
    pub next_cursor: Option<IncidentCursor>,
}

fn invalid(message: impl std::fmt::Display) -> String {
    format!("INCIDENT_INVALID: {message}")
}
fn storage(message: impl std::fmt::Display) -> String {
    format!("INCIDENT_STORAGE: {message}")
}
fn text(value: &str, name: &str, max: usize) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > max || value.contains('\0') {
        return Err(invalid(format!("{name} must contain 1–{max} characters")));
    }
    Ok(())
}
fn identifier(value: &str, name: &str) -> Result<(), String> {
    text(value, name, 128)?;
    if value.trim() != value || value.chars().any(|c| c.is_ascii_control()) {
        return Err(invalid(format!("{name} contains invalid characters")));
    }
    Ok(())
}
fn optional_id(value: &Option<String>, name: &str) -> Result<(), String> {
    if let Some(value) = value {
        identifier(value, name)?;
    }
    Ok(())
}

/// Canonical millisecond UTC timestamps, including actual calendar-day validity.
fn valid_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24 {
        return false;
    }
    for (index, expected) in [
        (4, b'-'),
        (7, b'-'),
        (10, b'T'),
        (13, b':'),
        (16, b':'),
        (19, b'.'),
        (23, b'Z'),
    ] {
        if bytes[index] != expected {
            return false;
        }
    }
    if !(0..24)
        .all(|index| [4, 7, 10, 13, 16, 19, 23].contains(&index) || bytes[index].is_ascii_digit())
    {
        return false;
    }
    let number = |start, end| value[start..end].parse::<u32>().unwrap_or(u32::MAX);
    let year = number(0, 4);
    let month = number(5, 7);
    let day = number(8, 10);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 0,
    };
    day >= 1 && day <= days && number(11, 13) < 24 && number(14, 16) < 60 && number(17, 19) < 60
}

fn normalize(input: &IncidentInput) -> Result<IncidentInput, String> {
    let mut input = input.clone();
    if input.schema_version != 1 || !KINDS.contains(&input.kind.as_str()) {
        return Err(invalid("Unsupported incident schema version or type"));
    }
    identifier(&input.id, "Incident ID")?;
    identifier(&input.venue_id, "Venue ID")?;
    optional_id(&input.setup_id, "Setup ID")?;
    if !valid_time(&input.occurred_at) {
        return Err(invalid(
            "Occurrence time must be a valid UTC timestamp with milliseconds",
        ));
    }
    if input.note.as_deref() == Some("") {
        input.note = None;
    }
    if let Some(note) = &input.note {
        text(note, "Note", 500)?;
    }
    identifier(&input.context.venue.id, "Context venue ID")?;
    text(&input.context.venue.name, "Venue name", 500)?;
    if input.context.venue.id != input.venue_id {
        return Err(invalid("Selected venue does not match the incident"));
    }
    if let Some(setup) = &input.context.setup {
        identifier(&setup.id, "Context setup ID")?;
        text(&setup.name, "Setup name", 500)?;
        optional_id(&setup.booth_id, "Booth ID")?;
        optional_id(&setup.deck_position_id, "Position ID")?;
        optional_id(&setup.support_configuration_id, "Support ID")?;
    }
    if input.context.setup.as_ref().map(|setup| &setup.id) != input.setup_id.as_ref() {
        return Err(invalid("Selected setup does not match the incident"));
    }
    if serde_json::to_vec(&input.context).map_err(invalid)?.len() > MAX_CONTEXT_BYTES {
        return Err(invalid("Selected context exceeds its storage limit"));
    }
    Ok(input)
}

struct Stored {
    schema_version: u8,
    id: String,
    venue_id: String,
    setup_id: Option<String>,
    kind: String,
    occurred_at: String,
    note: Option<String>,
    context_json: String,
    origin: String,
    recorded_at: String,
}
fn row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Stored> {
    Ok(Stored {
        schema_version: row.get(0)?,
        id: row.get(1)?,
        venue_id: row.get(2)?,
        setup_id: row.get(3)?,
        kind: row.get(4)?,
        occurred_at: row.get(5)?,
        note: row.get(6)?,
        context_json: row.get(7)?,
        origin: row.get(8)?,
        recorded_at: row.get(9)?,
    })
}
const COLUMNS: &str = "schema_version, id, venue_id, setup_id, kind, occurred_at, note, context_json, origin, recorded_at";
fn decode(stored: Stored) -> Result<Incident, String> {
    if stored.origin != "operator"
        || !valid_time(&stored.recorded_at)
        || stored.context_json.len() > MAX_CONTEXT_BYTES
    {
        return Err(storage(
            "Saved incident has invalid provenance, time or context",
        ));
    }
    let input = IncidentInput {
        schema_version: stored.schema_version,
        id: stored.id,
        venue_id: stored.venue_id,
        setup_id: stored.setup_id,
        kind: stored.kind,
        occurred_at: stored.occurred_at,
        note: stored.note,
        context: serde_json::from_str(&stored.context_json).map_err(storage)?,
    };
    let input = normalize(&input).map_err(storage)?;
    Ok(Incident {
        input,
        origin: stored.origin,
        recorded_at: stored.recorded_at,
    })
}
fn existing(conn: &Connection, id: &str) -> Result<Option<Incident>, String> {
    let row = conn
        .query_row(
            &format!("SELECT {COLUMNS} FROM venue_incident WHERE id = ?1"),
            [id],
            row,
        )
        .optional()
        .map_err(storage)?;
    row.map(decode).transpose()
}

pub fn save(conn: &Connection, input: &IncidentInput) -> Result<Incident, String> {
    let input = normalize(input)?;
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate).map_err(storage)?;
    if let Some(saved) = existing(&tx, &input.id)? {
        if saved.input != input {
            return Err(
                "INCIDENT_CONFLICT: This incident ID already belongs to a different report".into(),
            );
        }
        tx.commit().map_err(storage)?;
        return Ok(saved);
    }
    let venue_exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM venue WHERE id = ?1)",
            [&input.venue_id],
            |row| row.get(0),
        )
        .map_err(storage)?;
    let setup_matches = if let Some(setup_id) = &input.setup_id {
        tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM setup WHERE id = ?1 AND venue_id = ?2)",
            params![setup_id, &input.venue_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(storage)?
    } else {
        true
    };
    if !venue_exists || !setup_matches {
        return Err(
            "INCIDENT_CONTEXT: Choose an existing venue and a setup belonging to that venue".into(),
        );
    }
    let recorded_at = now_iso(&tx).map_err(storage)?;
    if !valid_time(&recorded_at) {
        return Err(storage("Database clock returned an invalid timestamp"));
    }
    tx.execute("INSERT INTO venue_incident (id, schema_version, venue_id, setup_id, kind, occurred_at, note, context_json, origin, recorded_at) VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6, ?7, 'operator', ?8)",
        params![&input.id, &input.venue_id, &input.setup_id, &input.kind, &input.occurred_at, &input.note, serde_json::to_string(&input.context).map_err(storage)?, &recorded_at]).map_err(storage)?;
    tx.commit().map_err(storage)?;
    Ok(Incident {
        input,
        origin: "operator".into(),
        recorded_at,
    })
}

fn filter_limit(
    venue_id: &Option<String>,
    setup_id: &Option<String>,
    limit: Option<u32>,
) -> Result<u32, String> {
    optional_id(venue_id, "Venue ID")?;
    optional_id(setup_id, "Setup ID")?;
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(invalid(format!("Incident limit must be 1–{MAX_LIMIT}")));
    }
    Ok(limit)
}

// The count and page share one read transaction. The cursor restricts only the
// rows, not the total, and BINARY ordering agrees with browser Unicode scalars.
fn query_history(
    conn: &Connection,
    venue_id: &Option<String>,
    setup_id: &Option<String>,
    before: Option<&IncidentCursor>,
    fetch_limit: u32,
) -> Result<(Vec<Incident>, u64), String> {
    let tx = conn.unchecked_transaction().map_err(storage)?;
    let total: i64 = tx.query_row("SELECT COUNT(*) FROM venue_incident WHERE (?1 IS NULL OR venue_id = ?1) AND (?2 IS NULL OR setup_id = ?2)", params![venue_id, setup_id], |row| row.get(0)).map_err(storage)?;
    let total = u64::try_from(total).map_err(storage)?;
    let items = {
        let mut statement = tx.prepare(&format!("SELECT {COLUMNS} FROM venue_incident WHERE (?1 IS NULL OR venue_id = ?1) AND (?2 IS NULL OR setup_id = ?2) AND (?3 IS NULL OR occurred_at COLLATE BINARY < ?3 OR (occurred_at = ?3 AND id COLLATE BINARY < ?4)) ORDER BY occurred_at COLLATE BINARY DESC, id COLLATE BINARY DESC LIMIT ?5")).map_err(storage)?;
        let raw = statement
            .query_map(
                params![
                    venue_id,
                    setup_id,
                    before.map(|cursor| &cursor.occurred_at),
                    before.map(|cursor| &cursor.id),
                    fetch_limit
                ],
                row,
            )
            .map_err(storage)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(storage)?;
        raw.into_iter().map(decode).collect::<Result<Vec<_>, _>>()?
    };
    tx.commit().map_err(storage)?;
    Ok((items, total))
}

pub fn list(conn: &Connection, filter: &IncidentFilter) -> Result<IncidentList, String> {
    let limit = filter_limit(&filter.venue_id, &filter.setup_id, filter.limit)?;
    let (items, total) = query_history(conn, &filter.venue_id, &filter.setup_id, None, limit)?;
    let has_more = total > items.len() as u64;
    Ok(IncidentList {
        items,
        total,
        limit,
        has_more,
    })
}

pub fn page(conn: &Connection, filter: &IncidentPageFilter) -> Result<IncidentPage, String> {
    let limit = filter_limit(&filter.venue_id, &filter.setup_id, filter.limit)?;
    if let Some(before) = &filter.before {
        identifier(&before.id, "Cursor incident ID")?;
        if !valid_time(&before.occurred_at) {
            return Err(invalid(
                "Cursor occurrence time must be a valid UTC timestamp with milliseconds",
            ));
        }
    }
    let (mut items, total) = query_history(
        conn,
        &filter.venue_id,
        &filter.setup_id,
        filter.before.as_ref(),
        limit + 1,
    )?;
    let has_more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = if has_more {
        items.last().map(|item| IncidentCursor {
            occurred_at: item.input.occurred_at.clone(),
            id: item.input.id.clone(),
        })
    } else {
        None
    };
    Ok(IncidentPage {
        items,
        total,
        limit,
        has_more,
        next_cursor,
    })
}

#[tauri::command]
pub async fn venue_incident_save(app: AppHandle, input: IncidentInput) -> Result<Incident, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        save(&conn, &input)
    })
    .await?
}

#[tauri::command]
pub async fn venue_incident_list(
    app: AppHandle,
    filter: Option<IncidentFilter>,
) -> Result<IncidentList, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        list(&conn, &filter.unwrap_or_default())
    })
    .await?
}

#[tauri::command]
pub async fn venue_incident_page(
    app: AppHandle,
    filter: Option<IncidentPageFilter>,
) -> Result<IncidentPage, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        page(&conn, &filter.unwrap_or_default())
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use serde_json::json;

    fn input() -> IncidentInput {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/contracts/venue-incidents.json"))
                .unwrap();
        serde_json::from_value(fixture["draft"].clone()).unwrap()
    }
    fn initialize(conn: &Connection) {
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(conn).unwrap();
        conn.execute_batch("INSERT INTO venue (id,name,created_at,updated_at) VALUES ('venue-1','Club One','2026-01-01','2026-01-01'),('venue-2','Other','2026-01-01','2026-01-01');
            INSERT INTO setup (id,name,venue_id,created_at) VALUES ('setup-1','Left deck','venue-1','2026-01-01');").unwrap();
    }
    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn);
        conn
    }
    fn count(conn: &Connection) -> u64 {
        list(conn, &IncidentFilter::default()).unwrap().total
    }

    #[test]
    fn migration_and_all_operator_types_round_trip_without_changing_context() {
        let conn = mem();
        conn.execute_batch(include_str!(
            "../../database/migrations/0023_venue_incidents.sql"
        ))
        .unwrap();
        for (index, kind) in KINDS.iter().enumerate() {
            let draft = IncidentInput {
                id: format!("incident-{index}"),
                kind: kind.to_string(),
                ..input()
            };
            let saved = save(&conn, &draft).unwrap();
            assert_eq!(saved.input, draft);
            assert_eq!(saved.origin, "operator");
            assert!(valid_time(&saved.recorded_at));
            let json = serde_json::to_value(saved).unwrap();
            assert_eq!(json["schemaVersion"], 1);
            assert_eq!(json["occurredAt"], draft.occurred_at);
            assert_eq!(json["context"]["setup"]["name"], "Left deck");
        }
        assert_eq!(count(&conn), 7);
    }

    #[test]
    fn exact_retry_survives_catalog_rename_move_and_deletion() {
        let conn = mem();
        let draft = input();
        let saved = save(&conn, &draft).unwrap();
        conn.execute_batch("UPDATE venue SET name='Changed' WHERE id='venue-1'; UPDATE setup SET venue_id='venue-2' WHERE id='setup-1';").unwrap();
        assert_eq!(save(&conn, &draft).unwrap(), saved);
        conn.execute_batch(
            "DELETE FROM setup WHERE id='setup-1'; DELETE FROM venue WHERE id='venue-1';",
        )
        .unwrap();
        assert_eq!(save(&conn, &draft).unwrap(), saved);
        assert_eq!(
            list(
                &conn,
                &IncidentFilter {
                    venue_id: Some("venue-1".into()),
                    ..Default::default()
                }
            )
            .unwrap()
            .items,
            vec![saved]
        );
        let changed = IncidentInput {
            note: Some("Changed".into()),
            ..draft
        };
        assert!(save(&conn, &changed)
            .unwrap_err()
            .starts_with("INCIDENT_CONFLICT:"));
        assert_eq!(count(&conn), 1);
    }

    #[test]
    fn invalid_context_and_failed_writes_leave_no_partial_row() {
        let conn = mem();
        let draft = input();
        conn.execute("UPDATE setup SET venue_id='venue-2' WHERE id='setup-1'", [])
            .unwrap();
        assert!(save(&conn, &draft)
            .unwrap_err()
            .starts_with("INCIDENT_CONTEXT:"));
        conn.execute("DELETE FROM setup WHERE id='setup-1'", [])
            .unwrap();
        assert!(save(&conn, &draft)
            .unwrap_err()
            .starts_with("INCIDENT_CONTEXT:"));
        assert_eq!(count(&conn), 0);
        let mut unassigned = draft;
        unassigned.setup_id = None;
        unassigned.context.setup = None;
        assert!(save(&conn, &unassigned).is_ok());
        unassigned.id = "bad-venue".into();
        unassigned.venue_id = "' OR 1=1 --".into();
        unassigned.context.venue.id.clone_from(&unassigned.venue_id);
        assert!(save(&conn, &unassigned)
            .unwrap_err()
            .starts_with("INCIDENT_CONTEXT:"));
        assert_eq!(count(&conn), 1);
    }

    #[test]
    fn strict_version_and_operator_only_contract_reject_extra_fields_and_invalid_dates() {
        for field in ["origin", "source", "metrics"] {
            let mut value = serde_json::to_value(input()).unwrap();
            value[field] = json!("detected");
            assert!(serde_json::from_value::<IncidentInput>(value).is_err());
        }
        for stamp in [
            "2026-02-31T10:00:00.000Z",
            "2026-11-18T10:00:00Z",
            "2026-11-18T10:00:60.000Z",
            "2026-11-18T24:00:00.000Z",
        ] {
            assert!(normalize(&IncidentInput {
                occurred_at: stamp.into(),
                ..input()
            })
            .is_err());
        }
        assert!(valid_time("2024-02-29T10:00:00.000Z"));
        assert!(!valid_time("2100-02-29T10:00:00.000Z"));
        assert!(normalize(&IncidentInput {
            schema_version: 2,
            ..input()
        })
        .is_err());
        assert!(normalize(&IncidentInput {
            note: Some("🙂".repeat(501)),
            ..input()
        })
        .is_err());
        assert!(normalize(&IncidentInput {
            note: Some("🙂".repeat(500)),
            ..input()
        })
        .is_ok());
        let mut bad = input();
        bad.context.venue.id = "venue-2".into();
        assert!(normalize(&bad).is_err());
    }

    #[test]
    fn list_limits_filter_and_stable_order_disclose_retained_older_rows() {
        let conn = mem();
        for id in ["a", "c", "b"] {
            save(
                &conn,
                &IncidentInput {
                    id: id.into(),
                    ..input()
                },
            )
            .unwrap();
        }
        let filter = IncidentFilter {
            venue_id: Some("venue-1".into()),
            setup_id: Some("setup-1".into()),
            limit: Some(2),
        };
        let result = list(&conn, &filter).unwrap();
        assert_eq!(result.total, 3);
        assert!(result.has_more);
        assert_eq!(result.limit, 2);
        assert_eq!(
            result
                .items
                .iter()
                .map(|row| row.input.id.as_str())
                .collect::<Vec<_>>(),
            ["c", "b"]
        );
        assert_eq!(
            list(
                &conn,
                &IncidentFilter {
                    venue_id: Some("venue-2".into()),
                    ..Default::default()
                }
            )
            .unwrap()
            .total,
            0
        );
        for limit in [0, 501] {
            assert!(list(
                &conn,
                &IncidentFilter {
                    limit: Some(limit),
                    ..Default::default()
                }
            )
            .is_err());
        }
        assert_eq!(count(&conn), 3);
    }

    #[test]
    fn malformed_stored_context_is_reported_without_rewriting_the_record() {
        let conn = mem();
        save(&conn, &input()).unwrap();
        let broken =
            r#"{"venue":{"id":"venue-1","name":"Club","sensor":"automatic"},"setup":null}"#;
        conn.execute(
            "UPDATE venue_incident SET context_json=?1 WHERE id='incident-1'",
            [broken],
        )
        .unwrap();
        assert!(list(&conn, &IncidentFilter::default())
            .unwrap_err()
            .starts_with("INCIDENT_STORAGE:"));
        assert!(save(&conn, &input())
            .unwrap_err()
            .starts_with("INCIDENT_STORAGE:"));
        let retained: String = conn
            .query_row("SELECT context_json FROM venue_incident", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(retained, broken);
    }

    #[test]
    fn concurrent_same_id_submissions_commit_one_immutable_event() {
        let path =
            std::env::temp_dir().join(format!("deckchek-incident-{}.sqlite", crate::db::new_id()));
        {
            let conn = Connection::open(&path).unwrap();
            initialize(&conn);
        }
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = (0..2)
            .map(|_| {
                let path = path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let conn = Connection::open(path).unwrap();
                    conn.busy_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                    barrier.wait();
                    save(&conn, &input()).unwrap()
                })
            })
            .collect();
        let saved: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_eq!(saved[0], saved[1]);
        {
            let conn = Connection::open(&path).unwrap();
            assert_eq!(count(&conn), 1);
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn pages_traverse_305_actual_records_with_scalar_ties_and_a_newer_append() {
        let conn = mem();
        let numbered: Vec<String> = (0..301).map(|i| format!("event-{i:03}")).collect();
        for id in numbered
            .iter()
            .map(String::as_str)
            .chain(["Z", "a", "\u{e000}", "🙂"])
        {
            save(
                &conn,
                &IncidentInput {
                    id: id.into(),
                    ..input()
                },
            )
            .unwrap();
        }
        let original = list(
            &conn,
            &IncidentFilter {
                limit: Some(500),
                ..Default::default()
            },
        )
        .unwrap()
        .items;
        let expected: Vec<String> = ["🙂", "\u{e000}"]
            .into_iter()
            .map(String::from)
            .chain(numbered.into_iter().rev())
            .chain(["a", "Z"].into_iter().map(String::from))
            .collect();
        let mut filter = IncidentPageFilter {
            venue_id: Some("venue-1".into()),
            limit: Some(100),
            ..Default::default()
        };
        let mut result = page(&conn, &filter).unwrap();
        assert_eq!(result.total, 305);
        let mut visited: Vec<String> = result
            .items
            .iter()
            .map(|row| row.input.id.clone())
            .collect();
        save(
            &conn,
            &IncidentInput {
                id: "newest-append".into(),
                occurred_at: "2026-11-18T11:00:00.000Z".into(),
                ..input()
            },
        )
        .unwrap();
        let mut pages = 1;
        while let Some(before) = result.next_cursor.clone() {
            let last = &result.items.last().unwrap().input;
            assert_eq!(before.id, last.id);
            assert_eq!(before.occurred_at, last.occurred_at);
            filter.before = Some(before);
            result = page(&conn, &filter).unwrap();
            assert_eq!(result.total, 306);
            assert_eq!(result.limit, 100);
            assert_eq!(result.has_more, result.next_cursor.is_some());
            visited.extend(result.items.iter().map(|row| row.input.id.clone()));
            pages += 1;
            assert!(pages <= 4);
        }
        assert_eq!(pages, 4);
        assert_eq!(visited, expected);
        let last = &result.items.last().unwrap().input;
        filter.before = Some(IncidentCursor {
            occurred_at: last.occurred_at.clone(),
            id: last.id.clone(),
        });
        let exhausted = page(&conn, &filter).unwrap();
        assert!(exhausted.items.is_empty());
        assert_eq!(exhausted.total, 306);
        assert!(!exhausted.has_more);
        assert!(exhausted.next_cursor.is_none());
        let current = list(
            &conn,
            &IncidentFilter {
                limit: Some(500),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            current
                .items
                .into_iter()
                .filter(|row| row.input.id != "newest-append")
                .collect::<Vec<_>>(),
            original
        );
    }

    #[test]
    fn pages_apply_context_and_time_boundaries_without_changing_total_or_recorded_context() {
        let conn = mem();
        for (id, occurred_at) in [
            ("new", "2026-11-18T11:00:00.000Z"),
            ("middle", "2026-11-18T10:00:00.000Z"),
            ("old", "2026-11-18T09:00:00.000Z"),
        ] {
            save(
                &conn,
                &IncidentInput {
                    id: id.into(),
                    occurred_at: occurred_at.into(),
                    ..input()
                },
            )
            .unwrap();
        }
        let mut other = input();
        other.id = "other-venue".into();
        other.venue_id = "venue-2".into();
        other.setup_id = None;
        other.context.venue = SelectedVenue {
            id: "venue-2".into(),
            name: "Other".into(),
        };
        other.context.setup = None;
        save(&conn, &other).unwrap();
        let filter = IncidentPageFilter {
            venue_id: Some("venue-1".into()),
            setup_id: Some("setup-1".into()),
            limit: Some(1),
            before: Some(IncidentCursor {
                occurred_at: "2026-11-18T10:30:00.000Z".into(),
                id: "unrecorded-anchor".into(),
            }),
        };
        let result = page(&conn, &filter).unwrap();
        assert_eq!(result.total, 3);
        assert_eq!(result.items[0].input.id, "middle");
        assert!(result.has_more);
        conn.execute_batch(
            "DELETE FROM setup WHERE id='setup-1'; DELETE FROM venue WHERE id='venue-1';",
        )
        .unwrap();
        let retained = page(&conn, &filter).unwrap();
        assert_eq!(retained.items, result.items);
        let empty = page(
            &conn,
            &IncidentPageFilter {
                venue_id: Some("venue-2".into()),
                setup_id: Some("setup-1".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(empty.total, 0);
        assert!(empty.items.is_empty());
        assert!(!empty.has_more);
        assert!(empty.next_cursor.is_none());
    }

    #[test]
    fn page_cursor_tie_break_uses_sqlite_binary_order_for_non_bmp_ids_and_prefixes() {
        let conn = mem();
        for id in ["Z", "a", "\u{e000}", "🙂", "🙂x"] {
            save(
                &conn,
                &IncidentInput {
                    id: id.into(),
                    ..input()
                },
            )
            .unwrap();
        }
        let mut filter = IncidentPageFilter {
            limit: Some(1),
            ..Default::default()
        };
        let mut ids = Vec::new();
        loop {
            let result = page(&conn, &filter).unwrap();
            assert_eq!(result.total, 5);
            ids.push(result.items[0].input.id.clone());
            let Some(cursor) = result.next_cursor else {
                break;
            };
            filter.before = Some(cursor);
        }
        assert_eq!(ids, ["🙂x", "🙂", "\u{e000}", "a", "Z"]);
    }

    #[test]
    fn page_requests_reject_unknown_fields_wrong_types_and_invalid_cursor_values() {
        let conn = mem();
        let valid = json!({"occurredAt":"2026-11-18T10:00:00.000Z","id":"cursor"});
        let mut invalid_requests = vec![
            json!({"offset":1}),
            json!({"limit":0}),
            json!({"limit":501}),
            json!({"limit":1.5}),
            json!({"limit":"2"}),
            json!({"limit":-1}),
            json!({"before":false}),
            json!({"before":[]}),
            json!({"before":{}}),
            json!({"before":{"occurredAt":"2026-11-18T10:00:00.000Z","id":"a","extra":1}}),
        ];
        for value in [
            "2026-02-29T10:00:00.000Z",
            "2026-11-18T10:00:00Z",
            "2026-11-18T10:00:00.000+00:00",
            "2026-11-18T24:00:00.000Z",
        ] {
            let mut cursor = valid.clone();
            cursor["occurredAt"] = json!(value);
            invalid_requests.push(json!({"before":cursor}));
        }
        for value in [
            "".to_string(),
            " leading".into(),
            "trailing ".into(),
            "line\nbreak".into(),
            "\0".into(),
            "🙂".repeat(129),
        ] {
            let mut cursor = valid.clone();
            cursor["id"] = json!(value);
            invalid_requests.push(json!({"before":cursor}));
        }
        for request in invalid_requests {
            if let Ok(filter) = serde_json::from_value::<IncidentPageFilter>(request.clone()) {
                assert!(page(&conn, &filter).is_err(), "{request}");
            }
        }
        assert!(serde_json::from_str::<IncidentPageFilter>(
            r#"{"before":{"occurredAt":"2026-11-18T10:00:00.000Z","id":"\ud800"}}"#
        )
        .is_err());
        assert_eq!(count(&conn), 0);
    }

    #[test]
    fn original_list_response_and_limits_remain_unchanged_beside_pages() {
        let conn = mem();
        for id in ["a", "b", "c"] {
            save(
                &conn,
                &IncidentInput {
                    id: id.into(),
                    ..input()
                },
            )
            .unwrap();
        }
        for limit in [1, 2, 300, 500] {
            let listed = serde_json::to_value(
                list(
                    &conn,
                    &IncidentFilter {
                        limit: Some(limit),
                        ..Default::default()
                    },
                )
                .unwrap(),
            )
            .unwrap();
            assert_eq!(listed.as_object().unwrap().len(), 4);
            assert!(listed.get("nextCursor").is_none());
            let mut paged = serde_json::to_value(
                page(
                    &conn,
                    &IncidentPageFilter {
                        limit: Some(limit),
                        ..Default::default()
                    },
                )
                .unwrap(),
            )
            .unwrap();
            assert!(paged
                .as_object_mut()
                .unwrap()
                .remove("nextCursor")
                .is_some());
            assert_eq!(paged, listed);
        }
        assert!(serde_json::from_value::<IncidentFilter>(
            json!({"before":{"occurredAt":"2026-11-18T10:00:00.000Z","id":"b"}})
        )
        .is_err());
    }

    #[test]
    fn paged_corruption_errors_keep_saved_bytes_and_do_not_change_old_first_page_behavior() {
        let conn = mem();
        for id in ["a", "b", "c"] {
            save(
                &conn,
                &IncidentInput {
                    id: id.into(),
                    ..input()
                },
            )
            .unwrap();
        }
        let broken =
            r#"{"venue":{"id":"venue-1","name":"Club","sensor":"automatic"},"setup":null}"#;
        conn.execute(
            "UPDATE venue_incident SET context_json=?1 WHERE id='b'",
            [broken],
        )
        .unwrap();
        let first = list(
            &conn,
            &IncidentFilter {
                limit: Some(1),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(first.items[0].input.id, "c");
        let filter = IncidentPageFilter {
            limit: Some(1),
            before: Some(IncidentCursor {
                occurred_at: input().occurred_at,
                id: "c".into(),
            }),
            ..Default::default()
        };
        assert!(page(&conn, &filter)
            .unwrap_err()
            .starts_with("INCIDENT_STORAGE:"));
        assert_eq!(
            conn.query_row::<String, _, _>(
                "SELECT context_json FROM venue_incident WHERE id='b'",
                [],
                |row| row.get(0)
            )
            .unwrap(),
            broken
        );
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM venue_incident", [], |row| row
                .get(0))
                .unwrap(),
            3
        );
    }
}

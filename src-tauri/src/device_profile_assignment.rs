//! Explicitly assign an existing asset to a device profile without rewriting history.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssignmentRequest {
    pub asset_id: String,
    pub profile_id: String,
    pub product_id: String,
    #[serde(deserialize_with = "required_nullable_id")]
    pub expected_product_id: Option<String>,
}

fn required_nullable_id<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentResult {
    pub asset_id: String,
    pub profile_id: String,
    pub product_id: String,
    pub changed: bool,
    pub updated_at: Option<String>,
}

fn err(error: rusqlite::Error) -> String {
    error.to_string()
}

pub fn assign(
    conn: &mut Connection,
    request: &AssignmentRequest,
) -> Result<AssignmentResult, String> {
    let valid_id = |value: &str| !value.is_empty() && value.len() <= 4096;
    if !valid_id(&request.asset_id)
        || !valid_id(&request.profile_id)
        || !valid_id(&request.product_id)
        || request
            .expected_product_id
            .as_deref()
            .is_some_and(|v| !valid_id(v))
    {
        return Err("Choose a saved unit and device profile before assigning.".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let product: Option<String> = tx
        .query_row(
            "SELECT p.id FROM device_profile d JOIN product p ON p.id = d.product_id WHERE d.id = ?1",
            [&request.profile_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(err)?;
    if product.as_deref() != Some(request.product_id.as_str()) {
        return Err("The device profile changed or is unavailable. Reopen the device page.".into());
    }
    let asset: Option<(Option<String>, String)> = tx
        .query_row(
            "SELECT product_id, updated_at FROM asset WHERE id = ?1 AND is_deleted = 0",
            [&request.asset_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    let (current, mut updated_at) =
        asset.ok_or("The selected unit is unavailable. Refresh the equipment list.")?;
    let changed = current.as_deref() != Some(request.product_id.as_str());
    if changed {
        if current != request.expected_product_id {
            return Err("The unit product changed. Refresh and confirm the unit again.".into());
        }
        updated_at = tx
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        tx.execute(
            "UPDATE asset SET product_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![request.asset_id, request.product_id, updated_at],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)?;
    Ok(AssignmentResult {
        asset_id: request.asset_id.clone(),
        profile_id: request.profile_id.clone(),
        product_id: request.product_id.clone(),
        changed,
        updated_at: Some(updated_at),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("../../database/migrations/0001_initial.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../../database/migrations/0002_device_library.sql"
        ))
        .unwrap();
        conn.execute_batch(
            "INSERT INTO product (id, category, model, created_at, updated_at) VALUES ('old', 'controller', 'Original', 'created', 'updated'), ('target', 'controller', 'Chosen', 'created', 'updated'), ('other', 'controller', 'Other', 'created', 'updated');
             INSERT INTO asset (id, product_id, nickname, serial_number, notes, created_at, updated_at) VALUES ('unit', 'old', 'Imported unit', 'SERIAL', 'Original notes', 'created', 'updated');
             INSERT INTO device_profile (id, product_id, json, version, loaded_at) VALUES ('profile', 'target', '{}', 1, 'loaded'), ('original-profile', 'old', '{}', 1, 'loaded');
             INSERT INTO device_test_result (id, asset_id, profile_id, test_id, status, created_at) VALUES ('history', 'unit', 'original-profile', 'test', 'unknown', 'past');
             INSERT INTO asset_midi_map (asset_id, profile_id, map_json, updated_at) VALUES ('unit', 'original-profile', '{\"old\":true}', 'past');"
        ).unwrap();
        conn
    }

    fn request() -> AssignmentRequest {
        AssignmentRequest {
            asset_id: "unit".into(),
            profile_id: "profile".into(),
            product_id: "target".into(),
            expected_product_id: Some("old".into()),
        }
    }

    #[test]
    fn assignment_preserves_asset_identity_metadata_and_history() {
        let mut conn = fixture();
        let result = assign(&mut conn, &request()).unwrap();
        assert!(result.changed);
        let row: (String, String, String, String, String) = conn.query_row(
            "SELECT product_id, nickname, serial_number, notes, created_at FROM asset WHERE id='unit'", [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        ).unwrap();
        assert_eq!(
            row,
            (
                "target".into(),
                "Imported unit".into(),
                "SERIAL".into(),
                "Original notes".into(),
                "created".into()
            )
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM product WHERE id='old'", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row(
                "SELECT created_at FROM device_test_result WHERE id='history'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "past"
        );
        assert_eq!(
            conn.query_row(
                "SELECT map_json FROM asset_midi_map WHERE asset_id='unit'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "{\"old\":true}"
        );
        assert_eq!(
            conn.query_row(
                "SELECT profile_id FROM asset_midi_map WHERE asset_id='unit'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "original-profile"
        );
        assert_eq!(
            conn.query_row(
                "SELECT profile_id FROM device_test_result WHERE id='history'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "original-profile"
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            0
        );
    }

    #[test]
    fn retries_do_not_rewrite_the_asset() {
        let mut conn = fixture();
        let first = assign(&mut conn, &request()).unwrap();
        let changes = conn.total_changes();
        let again = assign(&mut conn, &request()).unwrap();
        assert!(!again.changed);
        assert_eq!(again.updated_at, first.updated_at);
        assert_eq!(conn.total_changes(), changes);
    }

    #[test]
    fn stale_or_unavailable_inputs_make_no_writes() {
        for sql in [
            "UPDATE asset SET product_id='other' WHERE id='unit'",
            "UPDATE asset SET is_deleted=1 WHERE id='unit'",
            "UPDATE device_profile SET product_id='other' WHERE id='profile'",
        ] {
            let mut conn = fixture();
            conn.execute_batch(sql).unwrap();
            let before = conn.total_changes();
            assert!(assign(&mut conn, &request()).is_err());
            assert_eq!(conn.total_changes(), before);
        }
        for field in ["asset", "profile", "product"] {
            let mut conn = fixture();
            let mut input = request();
            match field {
                "asset" => input.asset_id = "missing".into(),
                "profile" => input.profile_id = "missing".into(),
                _ => input.product_id = "missing".into(),
            }
            let before = conn.total_changes();
            assert!(assign(&mut conn, &input).is_err());
            assert_eq!(conn.total_changes(), before);
        }
    }

    #[test]
    fn unassigned_asset_can_be_explicitly_assigned() {
        let mut conn = fixture();
        conn.execute("UPDATE asset SET product_id=NULL WHERE id='unit'", [])
            .unwrap();
        let mut input = request();
        assert!(assign(&mut conn, &input).is_err());
        input.expected_product_id = None;
        assert!(assign(&mut conn, &input).unwrap().changed);
    }

    #[test]
    fn invalid_ids_and_sql_constraint_errors_preserve_the_unit() {
        let mut conn = fixture();
        let mut input = request();
        input.asset_id = "x".repeat(4097);
        assert!(assign(&mut conn, &input).is_err());
        conn.execute_batch("CREATE TRIGGER refuse_assignment BEFORE UPDATE OF product_id ON asset BEGIN SELECT RAISE(ABORT, 'assignment refused'); END;").unwrap();
        assert!(assign(&mut conn, &request())
            .unwrap_err()
            .contains("assignment refused"));
        assert_eq!(
            conn.query_row("SELECT product_id FROM asset WHERE id='unit'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
            "old"
        );
    }

    #[test]
    fn previous_product_is_required_even_when_null() {
        let missing = r#"{"assetId":"unit","profileId":"profile","productId":"target"}"#;
        assert!(serde_json::from_str::<AssignmentRequest>(missing).is_err());
        let explicit = r#"{"assetId":"unit","profileId":"profile","productId":"target","expectedProductId":null}"#;
        assert!(serde_json::from_str::<AssignmentRequest>(explicit).is_ok());
    }
}

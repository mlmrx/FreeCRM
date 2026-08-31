"""Apply every Drizzle migration to SQLite and verify integrity and tenant fences."""

from pathlib import Path
import json
import re
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "drizzle").glob("*.sql"))
REQUIRED_TABLES = {
    "workspaces",
    "workspace_maintenance_sessions",
    "workspace_reset_operations",
    "upload_intents",
    "workspace_mutation_fences",
    "memberships",
    "module_configs",
    "records",
    "record_mutation_claims",
    "invoice_payments",
    "record_links",
    "notes",
    "workflow_rules",
    "workflow_runs",
    "integrations",
    "integration_jobs",
    "audit_events",
    "idempotency_records",
    "outbox_events",
    "capability_overrides",
    "actors",
    "party_relationships",
    "timeline_activities",
    "work_objects",
    "agent_identities",
    "agent_goals",
    "agent_tools",
    "agent_tool_grants",
    "agent_runs",
    "approval_requests",
    "execution_receipts",
    "agent_traces",
    "connector_connections",
    "connector_sync_claims",
    "webhook_deliveries",
}
REQUIRED_INDEXES = {
    "idx_records_workspace_type_updated",
    "idx_records_workspace_type_status",
    "idx_records_workspace_due",
    "idx_notes_workspace_record_occurred",
    "idx_audit_events_workspace_created",
    "idx_outbox_events_status_available",
    "idx_actors_workspace_kind",
    "idx_work_objects_workspace_kind_status",
    "idx_approvals_workspace_status",
    "idx_agent_runs_workspace_status",
    "uq_execution_receipts_workspace_run",
    "uq_approval_workspace_decision",
    "uq_webhooks_workspace_delivery",
    "idx_record_mutation_claim_operation",
    "idx_connector_sync_claim_operation",
    "idx_invoice_payments_workspace_invoice",
    "uq_invoice_payments_workspace_request",
    "uq_approval_workspace_run",
    "uq_workspace_reset_token",
    "idx_upload_intents_workspace_epoch_status",
    "uq_upload_intents_workspace_object",
    "idx_webhook_deliveries_retention",
}

REQUIRED_TRIGGERS = {
    "audit_events_append_only_update",
    "audit_events_append_only_delete",
    "audit_events_reset_fence",
    "execution_receipts_append_only_update",
    "execution_receipts_append_only_delete",
    "agent_traces_append_only_update",
    "agent_traces_append_only_delete",
    "agent_identity_validate_update",
    "agent_identity_profile_limit",
    "agent_tools_identity_restrict",
    "agent_runs_validate_insert",
    "agent_runs_immutable_authorization",
    "agent_runs_status_machine",
    "approvals_validate_insert",
    "approvals_finalize_once",
    "execution_receipts_validate_insert",
    "connector_sync_claim_validate",
    "approvals_append_only_delete",
    "invoice_payments_validate_insert",
    "invoice_payments_append_only_update",
    "invoice_payments_append_only_delete",
    "records_capability_limit_insert",
    "records_workspace_capacity_insert",
    "records_payload_validate_insert",
    "records_payload_validate_update",
    "records_restore_capacity_update",
    "notes_capacity_validate_insert",
    "record_links_capacity_validate_insert",
    "records_type_validate_insert",
    "records_currency_validate_insert",
    "records_currency_validate_update",
    "workspaces_currency_validate_update",
    "records_identity_immutable",
    "connector_connections_validate_insert",
    "connector_connections_validate_update",
    "webhook_deliveries_validate_insert",
    "webhook_deliveries_capacity_insert",
    "webhook_deliveries_count_insert",
    "webhook_deliveries_count_delete",
    "connector_webhook_receipt_count_guard",
    "upload_intents_epoch_object_key_insert",
    "workspace_reset_operations_validate_insert",
    "workspace_reset_operations_identity_immutable",
    "workspace_reset_operations_state_machine",
    "workspace_reset_operations_append_only_delete",
    "workspace_maintenance_reset_completion_receipt",
    "workspace_maintenance_reset_failure_receipt",
    "workspaces_mutation_epoch_guard",
    "upload_intents_validate_insert",
    "upload_intents_reset_fence",
    "upload_intents_capacity_insert",
    "upload_intents_identity_immutable",
    "upload_intents_cleanup_attempts_monotonic",
    "upload_intents_state_machine",
    "records_document_upload_intent_fence",
    "upload_intents_commit_fence",
    "audit_events_mutation_epoch_fence",
    "document_upload_audit_fence",
    "workspace_maintenance_reset_upload_intents",
    "workspace_mutation_fences_validate_insert",
    "workspace_mutation_fences_validate_update",
}


def normalize_sql_fragment(value: str) -> str:
    value = value.lower().replace('`', '').replace('"', '').replace('[', '').replace(']', '')
    value = re.sub(r"\b[a-z_][a-z0-9_]*\.", "", value)
    return re.sub(r"\s+", "", value)


def verify_snapshot_parity(db: sqlite3.Connection) -> None:
    """Keep the generated Drizzle checkpoint honest about the physical migration result."""
    snapshots = sorted((ROOT / "drizzle" / "meta").glob("*_snapshot.json"))
    if not snapshots:
        raise AssertionError("No Drizzle snapshot exists for migration parity verification")
    snapshot = json.loads(snapshots[-1].read_text(encoding="utf-8"))
    expected_tables = snapshot.get("tables", {})
    physical_tables = {
        row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    if set(expected_tables) != physical_tables:
        raise AssertionError(
            f"Snapshot table drift: missing={sorted(set(expected_tables) - physical_tables)} "
            f"extra={sorted(physical_tables - set(expected_tables))}"
        )

    problems: list[str] = []
    for table_name, expected in expected_tables.items():
        quoted_table = table_name.replace('"', '""')
        physical_columns = {
            row[1]: {
                "type": str(row[2]).lower(),
                "notNull": bool(row[3]),
            }
            for row in db.execute(f'PRAGMA table_info("{quoted_table}")')
        }
        expected_columns = {
            name: {
                "type": str(column["type"]).lower(),
                "notNull": bool(column["notNull"]),
            }
            for name, column in expected.get("columns", {}).items()
        }
        if physical_columns != expected_columns:
            problems.append(f"{table_name}: column or nullability mismatch")
        table_info = list(db.execute(f'PRAGMA table_info("{quoted_table}")'))
        physical_primary_key = tuple(row[1] for row in sorted((row for row in table_info if row[5]), key=lambda row: row[5]))
        expected_primary_key = tuple(
            name for name, column in expected.get("columns", {}).items() if column.get("primaryKey")
        )
        composite_primary_keys = list(expected.get("compositePrimaryKeys", {}).values())
        if composite_primary_keys:
            if len(composite_primary_keys) != 1:
                problems.append(f"{table_name}: snapshot declares multiple composite primary keys")
            else:
                expected_primary_key = tuple(composite_primary_keys[0]["columns"])
        if physical_primary_key != expected_primary_key:
            problems.append(f"{table_name}: primary-key mismatch")

        physical_fk_rows = list(db.execute(f'PRAGMA foreign_key_list("{quoted_table}")'))
        physical_fk_groups: dict[int, list[tuple]] = {}
        for row in physical_fk_rows:
            physical_fk_groups.setdefault(row[0], []).append(row)
        physical_fks = {
            (
                rows[0][2],
                tuple(row[3] for row in sorted(rows, key=lambda item: item[1])),
                tuple(row[4] for row in sorted(rows, key=lambda item: item[1])),
                str(rows[0][5]).lower(),
                str(rows[0][6]).lower(),
            )
            for rows in physical_fk_groups.values()
        }
        expected_fks = {
            (
                foreign_key["tableTo"],
                tuple(foreign_key["columnsFrom"]),
                tuple(foreign_key["columnsTo"]),
                str(foreign_key.get("onUpdate", "no action")).lower(),
                str(foreign_key.get("onDelete", "no action")).lower(),
            )
            for foreign_key in expected.get("foreignKeys", {}).values()
        }
        if physical_fks != expected_fks:
            problems.append(f"{table_name}: foreign-key mismatch")

        physical_index_rows = {
            row[1]: row for row in db.execute(f'PRAGMA index_list("{quoted_table}")')
            if not str(row[1]).startswith("sqlite_autoindex")
        }
        expected_indexes = expected.get("indexes", {})
        if set(physical_index_rows) != set(expected_indexes):
            problems.append(
                f"{table_name}: index names differ "
                f"missing={sorted(set(expected_indexes) - set(physical_index_rows))} "
                f"extra={sorted(set(physical_index_rows) - set(expected_indexes))}"
            )
        for index_name, expected_index in expected_indexes.items():
            physical_index = physical_index_rows.get(index_name)
            if not physical_index:
                continue
            quoted_index = index_name.replace('"', '""')
            physical_index_columns = tuple(
                row[2] for row in db.execute(f'PRAGMA index_info("{quoted_index}")')
            )
            expected_index_columns = tuple(
                column if isinstance(column, str) else column.get("expression")
                for column in expected_index.get("columns", [])
            )
            if physical_index_columns != expected_index_columns or bool(physical_index[2]) != bool(expected_index.get("isUnique")):
                problems.append(f"{table_name}.{index_name}: indexed columns or uniqueness mismatch")
            index_sql_row = db.execute(
                "SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (index_name,)
            ).fetchone()
            physical_where = ""
            if index_sql_row and index_sql_row[0]:
                where_match = re.search(r"\bWHERE\b(.+)$", index_sql_row[0], re.IGNORECASE | re.DOTALL)
                physical_where = normalize_sql_fragment(where_match.group(1)) if where_match else ""
            expected_where = normalize_sql_fragment(str(expected_index.get("where", "")))
            if physical_where != expected_where:
                problems.append(f"{table_name}.{index_name}: partial-index predicate mismatch")

        create_sql_row = db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
        ).fetchone()
        create_sql = normalize_sql_fragment(create_sql_row[0] if create_sql_row else "")
        for constraint in expected.get("checkConstraints", {}).values():
            if normalize_sql_fragment(str(constraint["value"])) not in create_sql:
                problems.append(f"{table_name}.{constraint['name']}: CHECK constraint mismatch")

    if problems:
        raise AssertionError("Migration/snapshot parity failed:\n- " + "\n- ".join(problems))


def expect_integrity_error(db: sqlite3.Connection, sql: str, params: tuple = (), message: str = "Integrity fence accepted an invalid mutation") -> None:
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)


def apply_migrations(db: sqlite3.Connection, paths: list[Path]) -> None:
    for path in paths:
        sql = path.read_text(encoding="utf-8")
        for statement in sql.split("--> statement-breakpoint"):
            if statement.strip():
                db.execute(statement)


def verify_upgrade_path() -> None:
    """Prove the invariant migration upgrades a populated pre-0003 database."""
    if len(MIGRATIONS) < 4:
        raise AssertionError("The populated upgrade fixture requires migrations 0000 through 0003")
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    apply_migrations(db, MIGRATIONS[:3])
    db.execute(
        "INSERT INTO workspaces (id, owner_user_id, owner_email, name) VALUES ('upgrade-tenant', 'upgrade-user', 'upgrade@example.test', 'Upgrade')"
    )
    db.executemany(
        "INSERT INTO actors (id, workspace_id, kind, display_name) VALUES (?, 'upgrade-tenant', ?, ?)",
        [("upgrade-human", "human", "Upgrade owner"), ("upgrade-agent-actor", "agent", "Upgrade agent")],
    )
    db.execute(
        "INSERT INTO agent_identities (id, workspace_id, actor_id, owner_actor_id, autonomy_level, status, monthly_budget_cents, spent_cents) VALUES ('upgrade-agent', 'upgrade-tenant', 'upgrade-agent-actor', 'upgrade-human', 'policy-autonomous', 'active', 100, 0)"
    )
    db.execute(
        "INSERT INTO agent_tools (id, workspace_id, name, transport, external, scopes_json, enabled) VALUES ('upgrade-tool', 'upgrade-tenant', 'Upgrade tool', 'local-simulator', 0, '[\"records:read\"]', 1)"
    )
    db.execute(
        "INSERT INTO agent_tool_grants (workspace_id, agent_id, tool_id, scopes_json) VALUES ('upgrade-tenant', 'upgrade-agent', 'upgrade-tool', '[\"records:read\"]')"
    )
    db.execute(
        "INSERT INTO agent_runs (id, workspace_id, agent_id, tool_id, action_json, status, budget_reserved_cents, idempotency_key) VALUES ('upgrade-run', 'upgrade-tenant', 'upgrade-agent', 'upgrade-tool', '{\"summary\":\"Inspect records\",\"scope\":\"records:read\",\"destructive\":false}', 'authorized', 10, 'upgrade-run')"
    )
    db.execute(
        "INSERT INTO agent_runs (id, workspace_id, agent_id, status, budget_reserved_cents, idempotency_key) VALUES ('legacy-run', 'upgrade-tenant', 'upgrade-agent', 'awaiting_approval', 10, 'legacy-run')"
    )
    db.execute(
        "INSERT INTO approval_requests (id, workspace_id, run_id, requested_by_actor_id, status, action_summary, expires_at) VALUES ('legacy-approval', 'upgrade-tenant', 'legacy-run', 'upgrade-user', 'pending', 'Legacy request', '2099-01-01T00:00:00.000Z')"
    )
    db.execute(
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id, amount_cents, fields_json) VALUES ('upgrade-invoice', 'upgrade-tenant', 'invoice', 'Legacy paid invoice', 'upgrade-user', 1000, '{\"paidCents\":250,\"lastPaymentAt\":\"2026-01-02T00:00:00.000Z\"}')"
    )
    db.execute(
        "INSERT INTO connector_connections (id, workspace_id, connector_key, auth_type, status, health) VALUES ('upgrade-webhook', 'upgrade-tenant', 'webhook-simulator', 'secret', 'connected', 'healthy')"
    )

    apply_migrations(db, MIGRATIONS[3:])
    request_hash = db.execute("SELECT request_hash FROM agent_runs WHERE id = 'upgrade-run'").fetchone()[0]
    if len(request_hash) != 64 or any(character not in "0123456789abcdef" for character in request_hash):
        raise AssertionError("Migration did not backfill a valid agent request-hash marker")
    legacy_state = db.execute(
        "SELECT r.status, a.status, a.decision_id, a.decided_at FROM agent_runs r JOIN approval_requests a ON a.workspace_id=r.workspace_id AND a.run_id=r.id WHERE r.id='legacy-run'"
    ).fetchone()
    if legacy_state[:3] != ("cancelled", "cancelled", "migration:0003:legacy-approval") or legacy_state[3] is None:
        raise AssertionError(f"Migration left a legacy unactionable run pending: {legacy_state}")
    legacy_trace = db.execute(
        "SELECT event_type FROM agent_traces WHERE workspace_id='upgrade-tenant' AND run_id='legacy-run' ORDER BY sequence DESC LIMIT 1"
    ).fetchone()
    if legacy_trace != ("migration_cancelled",):
        raise AssertionError(f"Migration did not explain the legacy run cancellation: {legacy_trace}")
    payment = db.execute(
        "SELECT amount_cents, recorded_by, request_id FROM invoice_payments WHERE workspace_id = 'upgrade-tenant' AND invoice_id = 'upgrade-invoice'"
    ).fetchone()
    if payment != (250, "upgrade-user", "migration:0003:upgrade-invoice"):
        raise AssertionError(f"Migration did not preserve the legacy invoice payment: {payment}")
    legacy_connector = db.execute(
        "SELECT status, health, credential_ref, last_error_code FROM connector_connections WHERE workspace_id='upgrade-tenant' AND id='upgrade-webhook'"
    ).fetchone()
    if legacy_connector != ("disconnected", "disconnected", None, "credential_reconnect_required"):
        raise AssertionError(f"Migration left an unusable legacy webhook marked connected: {legacy_connector}")
    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or list(db.execute("PRAGMA foreign_key_check")):
        raise AssertionError("Populated pre-0003 database failed integrity checks after upgrade")
    db.close()


def verify_webhook_receipt_upgrade() -> None:
    """Keep a populated pre-cap database non-destructive and recoverable."""
    if len(MIGRATIONS) < 15:
        raise AssertionError("The webhook receipt upgrade fixture requires migrations 0000 through 0014")
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    apply_migrations(db, MIGRATIONS[:8])
    db.execute(
        "INSERT INTO workspaces (id, owner_user_id, owner_email, name) VALUES ('receipt-upgrade', 'receipt-user', 'receipt@example.test', 'Receipt upgrade')"
    )
    db.execute(
        "INSERT INTO connector_connections (id, workspace_id, connector_key, auth_type, credential_ref, status, health, credential_generation) VALUES ('receipt-webhook', 'receipt-upgrade', 'webhook-simulator', 'simulated', ?, 'connected', 'healthy', 1)",
        ("sha256:" + "a" * 64,),
    )
    db.executemany(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, received_at, credential_generation) VALUES (?, 'receipt-upgrade', 'receipt-webhook', ?, ?, ?, 1)",
        (
            (
                f"upgrade-delivery-{index}",
                f"upgrade-event-{index}",
                "b" * 64,
                "2000-01-01T00:00:00.000Z" if index < 101 else "2099-01-01T00:00:00.000Z",
            )
            for index in range(50001)
        ),
    )
    apply_migrations(db, MIGRATIONS[8:])
    row_count = db.execute("SELECT COUNT(*) FROM webhook_deliveries WHERE workspace_id='receipt-upgrade'").fetchone()[0]
    counter = db.execute("SELECT webhook_receipt_count FROM connector_connections WHERE workspace_id='receipt-upgrade' AND id='receipt-webhook'").fetchone()[0]
    if (row_count, counter) != (50001, 50001):
        raise AssertionError(f"Webhook receipt migration was destructive or miscounted rows: rows={row_count}, counter={counter}")
    db.execute("DELETE FROM webhook_deliveries WHERE workspace_id='receipt-upgrade' AND id='upgrade-delivery-0'")
    expect_integrity_error(
        db,
        "INSERT INTO webhook_deliveries (id,workspace_id,connection_id,provider_delivery_id,payload_hash,received_at,credential_generation) VALUES ('blocked-at-cap','receipt-upgrade','receipt-webhook','blocked-at-cap',?,'2099-01-01T00:00:00.000Z',1)",
        ("c" * 64,),
        "An upgraded webhook connection accepted a receipt at the hard cap",
    )
    db.execute(
        "DELETE FROM webhook_deliveries WHERE rowid IN (SELECT rowid FROM webhook_deliveries WHERE workspace_id='receipt-upgrade' AND connection_id='receipt-webhook' AND received_at < '2026-01-01T00:00:00.000Z' ORDER BY received_at ASC LIMIT 100)"
    )
    db.execute(
        "INSERT INTO webhook_deliveries (id,workspace_id,connection_id,provider_delivery_id,payload_hash,received_at,credential_generation) VALUES ('accepted-after-prune','receipt-upgrade','receipt-webhook','accepted-after-prune',?,'2099-01-01T00:00:00.000Z',1)",
        ("d" * 64,),
    )
    healed_rows = db.execute("SELECT COUNT(*) FROM webhook_deliveries WHERE workspace_id='receipt-upgrade'").fetchone()[0]
    healed_counter = db.execute("SELECT webhook_receipt_count FROM connector_connections WHERE workspace_id='receipt-upgrade' AND id='receipt-webhook'").fetchone()[0]
    if healed_rows != healed_counter or healed_counter != 49901:
        raise AssertionError(f"Bounded webhook receipt pruning did not self-heal the upgraded counter: rows={healed_rows}, counter={healed_counter}")
    db.close()


def main() -> None:
    if not MIGRATIONS:
        raise SystemExit("No SQL migrations found")
    verify_upgrade_path()
    verify_webhook_receipt_upgrade()
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    apply_migrations(db, MIGRATIONS)
    verify_snapshot_parity(db)

    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    indexes = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    triggers = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
    missing_tables = REQUIRED_TABLES - tables
    missing_indexes = REQUIRED_INDEXES - indexes
    missing_triggers = REQUIRED_TRIGGERS - triggers
    if missing_tables or missing_indexes or missing_triggers:
        raise AssertionError(f"Missing tables={sorted(missing_tables)} indexes={sorted(missing_indexes)} triggers={sorted(missing_triggers)}")

    db.executemany(
        "INSERT INTO workspaces (id, owner_user_id, owner_email, name) VALUES (?, ?, ?, ?)",
        [("tenant-a", "user-a", "a@example.test", "A"), ("tenant-b", "user-b", "b@example.test", "B")],
    )
    db.executemany(
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id) VALUES (?, ?, 'contact', ?, ?)",
        [("record-a", "tenant-a", "A contact", "user-a"), ("record-b", "tenant-b", "B contact", "user-b")],
    )
    expect_integrity_error(
        db,
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id) VALUES ('unknown-record', 'tenant-a', 'mystery', 'Unknown', 'user-a')",
        message="Records accepted an ungoverned object type",
    )
    expect_integrity_error(
        db,
        "UPDATE records SET object_type='company' WHERE workspace_id='tenant-a' AND id='record-a'",
        message="A record changed its immutable object type",
    )
    expect_integrity_error(
        db,
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id, fields_json) VALUES ('bad-fields', 'tenant-a', 'contact', 'Bad fields', 'user-a', '[]')",
        message="A record accepted non-object fields JSON",
    )
    expect_integrity_error(
        db,
        "UPDATE records SET tags_json='{}' WHERE workspace_id='tenant-a' AND id='record-a'",
        message="A record accepted non-array tags JSON",
    )
    expect_integrity_error(
        db,
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id, currency) VALUES ('wrong-currency', 'tenant-a', 'contact', 'Wrong currency', 'user-a', 'EUR')",
        message="A record was inserted with a currency different from its workspace",
    )
    expect_integrity_error(
        db,
        "UPDATE records SET currency='EUR' WHERE workspace_id='tenant-a' AND id='record-a'",
        message="A record changed to a currency different from its workspace",
    )
    expect_integrity_error(
        db,
        "UPDATE workspaces SET currency='EUR' WHERE id='tenant-a'",
        message="A workspace currency changed while records existed",
    )
    db.execute("INSERT INTO workspaces (id, owner_user_id, owner_email, name) VALUES ('tenant-empty', 'user-empty', 'empty@example.test', 'Empty')")
    db.execute("UPDATE workspaces SET currency='EUR' WHERE id='tenant-empty'")
    db.execute("INSERT INTO records (id, workspace_id, object_type, name, owner_user_id, currency) VALUES ('record-eur', 'tenant-empty', 'contact', 'EUR contact', 'user-empty', 'EUR')")
    expect_integrity_error(
        db,
        "INSERT INTO workspace_maintenance_sessions (workspace_id, purpose, token) VALUES ('tenant-a', 'other', ?)",
        ("x" * 32,),
        "Maintenance session accepted an unknown purpose",
    )
    db.execute("INSERT INTO record_mutation_claims (workspace_id, record_id, expected_version, operation_id) VALUES ('tenant-a', 'record-a', 1, 'claim-a')")
    expect_integrity_error(
        db,
        "INSERT INTO record_mutation_claims (workspace_id, record_id, expected_version, operation_id) VALUES ('tenant-a', 'record-a', 1, 'claim-b')",
        message="Record mutation fence accepted two writers for one version",
    )
    expect_integrity_error(
        db,
        "INSERT INTO record_links (workspace_id, source_id, target_id, relationship) VALUES (?, ?, ?, ?)",
        ("tenant-a", "record-a", "record-b", "forbidden_cross_tenant"),
        "Composite foreign keys allowed a cross-tenant record link",
    )
    db.executemany(
        "INSERT INTO notes (id, workspace_id, record_id, kind, body, source, occurred_at, created_by) VALUES (?, 'tenant-a', 'record-a', 'note', 'bounded', 'manual', '2026-01-01T00:00:00.000Z', 'user-a')",
        [(f"note-{index}",) for index in range(50)],
    )
    expect_integrity_error(
        db,
        "INSERT INTO notes (id, workspace_id, record_id, kind, body, source, occurred_at, created_by) VALUES ('note-over', 'tenant-a', 'record-a', 'note', 'over', 'manual', '2026-01-01T00:00:00.000Z', 'user-a')",
        message="A record accepted more than the bounded note capacity",
    )
    db.execute("INSERT INTO records (id, workspace_id, object_type, name, owner_user_id, amount_cents, fields_json) VALUES ('invoice-a', 'tenant-a', 'invoice', 'Invoice A', 'user-a', 1000, '{\"paidCents\":0}')")
    db.execute("INSERT INTO invoice_payments (id, workspace_id, invoice_id, amount_cents, recorded_by, recorded_at, request_id) VALUES ('payment-a', 'tenant-a', 'invoice-a', 500, 'user-a', '2026-01-01T00:00:00.000Z', 'payment-request-a')")
    expect_integrity_error(
        db,
        "INSERT INTO invoice_payments (id, workspace_id, invoice_id, amount_cents, recorded_by, recorded_at, request_id) VALUES ('payment-over', 'tenant-a', 'invoice-a', 501, 'user-a', '2026-01-02T00:00:00.000Z', 'payment-request-over')",
        message="Invoice payment ledger accepted a cumulative overpayment",
    )
    expect_integrity_error(
        db,
        "INSERT INTO invoice_payments (id, workspace_id, invoice_id, amount_cents, recorded_by, recorded_at, request_id) VALUES ('payment-duplicate-request', 'tenant-a', 'invoice-a', 1, 'user-a', '2026-01-02T00:00:00.000Z', 'payment-request-a')",
        message="Invoice payment ledger accepted a duplicate request identity",
    )
    expect_integrity_error(
        db,
        "INSERT INTO invoice_payments (id, workspace_id, invoice_id, amount_cents, recorded_by, recorded_at, request_id) VALUES ('payment-invalid-time', 'tenant-a', 'invoice-a', 1, 'user-a', 'not-a-time', 'payment-request-invalid-time')",
        message="Invoice payment ledger accepted an invalid timestamp",
    )
    expect_integrity_error(db, "UPDATE invoice_payments SET amount_cents=1 WHERE id='payment-a'", message="Invoice payment ledger accepted a rewrite")
    expect_integrity_error(db, "DELETE FROM invoice_payments WHERE id='payment-a'", message="Invoice payment ledger accepted an ordinary delete")
    expect_integrity_error(
        db,
        "INSERT INTO invoice_payments (id, workspace_id, invoice_id, amount_cents, recorded_by, recorded_at, request_id) VALUES ('payment-cross', 'tenant-b', 'invoice-a', 1, 'user-b', '2026-01-01T00:00:00.000Z', 'payment-cross')",
        message="Invoice payment accepted a cross-tenant invoice",
    )
    db.execute("INSERT INTO capability_overrides (workspace_id,capability_key,enabled) VALUES ('tenant-a','relationships',0)")
    expect_integrity_error(
        db,
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id) VALUES ('blocked-contact', 'tenant-a', 'contact', 'Blocked', 'user-a')",
        message="A disabled capability accepted a direct record insert",
    )
    expect_integrity_error(
        db,
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id) VALUES ('seed-forged-contact', 'tenant-a', 'contact', 'Forged seed', 'user-a')",
        message="A reserved-looking record ID bypassed a disabled capability",
    )
    db.execute("UPDATE records SET archived_at='2026-01-01T00:00:00.000Z' WHERE workspace_id='tenant-a' AND id='record-a'")
    expect_integrity_error(
        db,
        "UPDATE records SET archived_at=NULL WHERE workspace_id='tenant-a' AND id='record-a'",
        message="An archived record restored into a disabled capability",
    )
    db.execute("INSERT INTO workspace_maintenance_sessions (workspace_id, purpose, token) VALUES ('tenant-a', 'seed', ?)", ("s" * 32,))
    db.execute("INSERT INTO records (id, workspace_id, object_type, name, owner_user_id) VALUES ('seed-demo-contact', 'tenant-a', 'contact', 'Demo seed', 'user-a')")
    db.execute("DELETE FROM workspace_maintenance_sessions WHERE workspace_id='tenant-a' AND purpose='seed'")
    db.execute("INSERT INTO workspace_maintenance_sessions (workspace_id, purpose, token, mode, operation_id, status, lease_token, lease_expires_at) VALUES ('tenant-a', 'reset', ?, 'demo', '00000000-0000-4000-8000-000000000001', 'running', ?, '2099-01-01T00:00:00.000Z')", ("r" * 32, "d" * 32))
    db.execute("INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status) VALUES ('tenant-a','00000000-0000-4000-8000-000000000001','demo',?,?,'running')", ("r" * 32, "d" * 32))
    db.execute("DELETE FROM invoice_payments WHERE id='payment-a'")
    db.execute("UPDATE workspace_reset_operations SET status='completed', response_json='{}' WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000001'")
    db.execute("UPDATE workspace_maintenance_sessions SET status='completed', response_json='{}' WHERE workspace_id='tenant-a' AND purpose='reset'")
    db.execute("DELETE FROM workspace_maintenance_sessions WHERE workspace_id='tenant-a' AND purpose='reset'")

    stale_command_epoch = db.execute("SELECT mutation_epoch FROM workspaces WHERE id='tenant-a'").fetchone()[0]
    db.execute("INSERT INTO workspace_maintenance_sessions (workspace_id, purpose, token, mode, operation_id, status, lease_token, lease_expires_at) VALUES ('tenant-a', 'reset', ?, 'clean', '00000000-0000-4000-8000-000000000002', 'running', ?, '2099-01-01T00:00:00.000Z')", ("l" * 32, "f" * 32))
    db.execute("INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status) VALUES ('tenant-a','00000000-0000-4000-8000-000000000002','clean',?,?,'running')", ("l" * 32, "f" * 32))
    db.execute("UPDATE workspaces SET mutation_epoch=mutation_epoch+1 WHERE id='tenant-a'")
    expect_integrity_error(
        db,
        "INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, request_id) VALUES ('reset-blocked-audit', 'tenant-a', 'user-a', 'record.create', 'contact', 'reset-blocked')",
        message="A workspace mutation committed while reset was in progress",
    )
    db.execute("INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, request_id) VALUES ('reset-storage-audit', 'tenant-a', 'user-a', 'workspace.reset.storage_requested', 'workspace', 'reset-storage')")
    db.execute("UPDATE workspace_reset_operations SET status='failed', lease_token=NULL WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000002'")
    db.execute("UPDATE workspace_maintenance_sessions SET status='failed', lease_token=NULL, lease_expires_at=NULL WHERE workspace_id='tenant-a' AND purpose='reset'")
    expect_integrity_error(
        db,
        "INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, request_id) VALUES ('reset-failed-blocked-audit', 'tenant-a', 'user-a', 'record.update', 'contact', 'reset-failed')",
        message="A workspace mutation committed while a failed reset still required recovery",
    )
    db.execute("UPDATE workspace_maintenance_sessions SET status='running', lease_token=?, lease_expires_at='2099-01-01T00:00:00.000Z' WHERE workspace_id='tenant-a' AND purpose='reset'", ("g" * 32,))
    db.execute("UPDATE workspace_reset_operations SET status='running', lease_token=? WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000002'", ("g" * 32,))
    db.execute("UPDATE workspace_reset_operations SET status='completed', response_json='{}' WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000002'")
    db.execute("UPDATE workspace_maintenance_sessions SET status='completed', response_json='{}' WHERE workspace_id='tenant-a' AND purpose='reset'")
    db.execute("INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, request_id) VALUES ('reset-completed-audit', 'tenant-a', 'user-a', 'record.update', 'contact', 'reset-completed')")
    expect_integrity_error(
        db,
        "UPDATE workspace_reset_operations SET status='running', response_json=NULL WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000002'",
        message="A completed destructive operation receipt was rewritten",
    )
    expect_integrity_error(
        db,
        "DELETE FROM workspace_reset_operations WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000002'",
        message="A durable reset receipt was deleted",
    )
    expect_integrity_error(
        db,
        "INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status) VALUES ('tenant-a','00000000-0000-4000-8000-000000000001','clean',?,?, 'running')",
        ("z" * 32, "g" * 32),
        "A reset operation ID was rebound to a different mode",
    )
    db.execute("SAVEPOINT stale_reset_completion")
    try:
        db.execute("DELETE FROM records WHERE workspace_id='tenant-a' AND id='record-a'")
        db.execute("UPDATE workspace_reset_operations SET status='completed',response_json='{}' WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000001'")
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK TO stale_reset_completion")
        db.execute("RELEASE stale_reset_completion")
    else:
        db.execute("ROLLBACK TO stale_reset_completion")
        db.execute("RELEASE stale_reset_completion")
        raise AssertionError("A stale reset completion committed destructive work after a newer reset")
    if db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='tenant-a' AND id='record-a'").fetchone()[0] != 1:
        raise AssertionError("A stale reset completion did not roll back its destructive statements")
    db.execute("DELETE FROM workspace_maintenance_sessions WHERE workspace_id='tenant-a' AND purpose='reset'")

    original_workspace_name = db.execute("SELECT name FROM workspaces WHERE id='tenant-a'").fetchone()[0]
    db.execute("SAVEPOINT delayed_command")
    try:
        db.execute("UPDATE workspaces SET name='stale delayed command' WHERE id='tenant-a'")
        db.execute(
            "INSERT INTO workspace_mutation_fences (workspace_id,mutation_epoch,operation_id) VALUES ('tenant-a',?,'delayed-command') ON CONFLICT(workspace_id) DO UPDATE SET mutation_epoch=excluded.mutation_epoch,operation_id=excluded.operation_id,updated_at=CURRENT_TIMESTAMP",
            (stale_command_epoch,),
        )
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK TO delayed_command")
        db.execute("RELEASE delayed_command")
    else:
        db.execute("ROLLBACK TO delayed_command")
        db.execute("RELEASE delayed_command")
        raise AssertionError("A delayed command committed after reset advanced the mutation epoch")
    if db.execute("SELECT name FROM workspaces WHERE id='tenant-a'").fetchone()[0] != original_workspace_name:
        raise AssertionError("The mutation epoch fence did not roll back preceding command statements")
    current_epoch = db.execute("SELECT mutation_epoch FROM workspaces WHERE id='tenant-a'").fetchone()[0]
    db.execute(
        "INSERT INTO workspace_mutation_fences (workspace_id,mutation_epoch,operation_id) VALUES ('tenant-a',?,'current-command') ON CONFLICT(workspace_id) DO UPDATE SET mutation_epoch=excluded.mutation_epoch,operation_id=excluded.operation_id,updated_at=CURRENT_TIMESTAMP",
        (current_epoch,),
    )

    db.execute("UPDATE capability_overrides SET enabled=1 WHERE workspace_id='tenant-a' AND capability_key='relationships'")
    upload_key = f"tenant-a/~epoch/{current_epoch:020d}/00000000-0000-4000-8000-000000000010/blob"
    db.execute(
        "INSERT INTO upload_intents (workspace_id,id,object_key,mutation_epoch,status,lease_expires_at) VALUES ('tenant-a','00000000-0000-4000-8000-000000000010',?,?,'pending','2099-01-01T00:00:00.000Z')",
        (upload_key, current_epoch),
    )
    expect_integrity_error(
        db,
        "INSERT INTO upload_intents (workspace_id,id,object_key,mutation_epoch,status,lease_expires_at) VALUES ('tenant-a','00000000-0000-4000-8000-000000000012','tenant-a/00000000-0000-4000-8000-000000000012/blob',?,'pending','2099-01-01T00:00:00.000Z')",
        (current_epoch,),
        "An upload intent accepted an object key outside its mutation epoch namespace",
    )
    db.execute("INSERT INTO workspace_maintenance_sessions (workspace_id,purpose,token,mode,operation_id,status,lease_token,lease_expires_at) VALUES ('tenant-a','reset',?,'clean','00000000-0000-4000-8000-000000000003','running',?,'2099-01-01T00:00:00.000Z')", ("u" * 32, "v" * 32))
    db.execute("INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status) VALUES ('tenant-a','00000000-0000-4000-8000-000000000003','clean',?,?,'running')", ("u" * 32, "v" * 32))
    db.execute("UPDATE workspaces SET mutation_epoch=mutation_epoch+1 WHERE id='tenant-a'")
    reset_epoch = db.execute("SELECT mutation_epoch FROM workspaces WHERE id='tenant-a'").fetchone()[0]
    expect_integrity_error(
        db,
        "INSERT INTO upload_intents (workspace_id,id,object_key,mutation_epoch,status,lease_expires_at) VALUES ('tenant-a','00000000-0000-4000-8000-000000000011','tenant-a/00000000-0000-4000-8000-000000000011/blob',?,'pending','2099-01-01T00:00:00.000Z')",
        (reset_epoch,),
        "An upload intent registered after reset acquisition",
    )
    db.execute("SAVEPOINT delayed_upload_finalize")
    try:
        db.execute(
            "INSERT INTO records (id,workspace_id,object_type,name,owner_user_id,fields_json) VALUES ('00000000-0000-4000-8000-000000000010','tenant-a','document','Delayed upload','user-a',?)",
            (json.dumps({"objectKey": upload_key, "contentType": "text/plain", "size": 1}),),
        )
        db.execute("UPDATE upload_intents SET status='committed',lease_expires_at=NULL WHERE workspace_id='tenant-a' AND id='00000000-0000-4000-8000-000000000010'")
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK TO delayed_upload_finalize")
        db.execute("RELEASE delayed_upload_finalize")
    else:
        db.execute("ROLLBACK TO delayed_upload_finalize")
        db.execute("RELEASE delayed_upload_finalize")
        raise AssertionError("A delayed R2 PUT finalized metadata after reset advanced the epoch")
    if db.execute("SELECT COUNT(*) FROM records WHERE id='00000000-0000-4000-8000-000000000010'").fetchone()[0] != 0:
        raise AssertionError("A stale upload finalization did not roll back its document record")

    for blocked_status in ("pending", "cleanup_pending"):
        if blocked_status == "cleanup_pending":
            db.execute("UPDATE upload_intents SET status='cleanup_pending',lease_expires_at=NULL,last_error_code='upload_cleanup_failed',cleanup_attempts=cleanup_attempts+1 WHERE workspace_id='tenant-a' AND id='00000000-0000-4000-8000-000000000010'")
        db.execute(f"SAVEPOINT reset_blocked_{blocked_status}")
        try:
            db.execute("UPDATE workspace_reset_operations SET status='completed',response_json='{}' WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000003'")
            db.execute("UPDATE workspace_maintenance_sessions SET status='completed',response_json='{}' WHERE workspace_id='tenant-a' AND purpose='reset'")
        except sqlite3.IntegrityError:
            db.execute(f"ROLLBACK TO reset_blocked_{blocked_status}")
            db.execute(f"RELEASE reset_blocked_{blocked_status}")
        else:
            db.execute(f"ROLLBACK TO reset_blocked_{blocked_status}")
            db.execute(f"RELEASE reset_blocked_{blocked_status}")
            raise AssertionError(f"Reset completed while a prior-epoch {blocked_status} upload intent remained active")

    db.execute("UPDATE upload_intents SET status='cleaned',last_error_code=NULL,cleanup_attempts=cleanup_attempts+1 WHERE workspace_id='tenant-a' AND id='00000000-0000-4000-8000-000000000010'")
    db.execute("UPDATE workspace_reset_operations SET status='completed',response_json='{}' WHERE workspace_id='tenant-a' AND operation_id='00000000-0000-4000-8000-000000000003'")
    db.execute("UPDATE workspace_maintenance_sessions SET status='completed',response_json='{}' WHERE workspace_id='tenant-a' AND purpose='reset'")
    db.execute("UPDATE upload_intents SET status='cleanup_pending',last_error_code='upload_cleanup_failed',cleanup_attempts=cleanup_attempts+1 WHERE workspace_id='tenant-a' AND id='00000000-0000-4000-8000-000000000010'")
    cleanup_state = db.execute("SELECT status,last_error_code FROM upload_intents WHERE workspace_id='tenant-a' AND id='00000000-0000-4000-8000-000000000010'").fetchone()
    if cleanup_state != ("cleanup_pending", "upload_cleanup_failed"):
        raise AssertionError(f"A late cleanup failure was not durable: {cleanup_state}")
    db.execute("UPDATE upload_intents SET status='cleaned',last_error_code=NULL,cleanup_attempts=cleanup_attempts+1 WHERE workspace_id='tenant-a' AND id='00000000-0000-4000-8000-000000000010'")
    db.execute("DELETE FROM workspace_maintenance_sessions WHERE workspace_id='tenant-a' AND purpose='reset'")

    db.executemany(
        "INSERT INTO actors (id, workspace_id, kind, display_name) VALUES (?, ?, 'human', ?)",
        [("actor-a", "tenant-a", "A human"), ("actor-b", "tenant-b", "B human")],
    )
    expect_integrity_error(
        db,
        "INSERT INTO party_relationships (id, workspace_id, source_actor_id, target_actor_id, relationship_type) VALUES (?, ?, ?, ?, ?)",
        ("cross-edge", "tenant-a", "actor-a", "actor-b", "forbidden_cross_tenant"),
        "Composite actor foreign keys allowed a cross-tenant relationship",
    )
    expect_integrity_error(
        db,
        "INSERT INTO actors (id, workspace_id, kind, display_name) VALUES ('invalid-actor', 'tenant-a', 'robot', 'Invalid')",
        message="Actor kind CHECK accepted an unknown kind",
    )
    expect_integrity_error(
        db,
        "INSERT INTO work_objects (id, workspace_id, kind, title) VALUES ('invalid-work', 'tenant-a', 'unknown', 'Invalid')",
        message="Work object kind CHECK accepted an unknown kind",
    )

    db.execute("INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, request_id) VALUES ('audit-a', 'tenant-a', 'user-a', 'test', 'workspace', 'request-a')")
    for mutation in [
        "UPDATE audit_events SET action = 'tampered' WHERE id = 'audit-a'",
        "DELETE FROM audit_events WHERE id = 'audit-a'",
    ]:
        expect_integrity_error(db, mutation, message="Append-only audit event accepted a mutation")

    db.executemany(
        "INSERT INTO actors (id, workspace_id, kind, display_name) VALUES (?, ?, 'agent', ?)",
        [("agent-actor-a", "tenant-a", "A agent"), ("agent-actor-b", "tenant-b", "B agent")],
    )
    db.executemany(
        "INSERT INTO agent_identities (id, workspace_id, actor_id, owner_actor_id, autonomy_level, status, monthly_budget_cents, spent_cents) VALUES (?, ?, ?, ?, 'policy-autonomous', 'active', 100, 0)",
        [("agent-a", "tenant-a", "agent-actor-a", "actor-a"), ("agent-b", "tenant-b", "agent-actor-b", "actor-b")],
    )
    db.executemany(
        "INSERT INTO agent_tools (id, workspace_id, name, transport, external, scopes_json, enabled) VALUES (?, ?, ?, 'local-simulator', 0, '[\"records:read\"]', 1)",
        [("tool-a", "tenant-a", "A tool"), ("tool-b", "tenant-b", "B tool")],
    )
    db.executemany(
        "INSERT INTO agent_tool_grants (workspace_id, agent_id, tool_id, scopes_json) VALUES (?, ?, ?, '[\"records:read\"]')",
        [("tenant-a", "agent-a", "tool-a"), ("tenant-b", "agent-b", "tool-b")],
    )
    action = '{"summary":"Summarize relationships","scope":"records:read","destructive":false}'
    expect_integrity_error(
        db,
        "INSERT INTO agent_runs (id, workspace_id, agent_id, tool_id, action_json, status, budget_reserved_cents, idempotency_key, request_hash) VALUES ('cross-run', 'tenant-a', 'agent-a', 'tool-b', ?, 'authorized', 10, 'cross-run', ?)",
        (action, "a" * 64),
        "Agent run accepted a cross-tenant tool",
    )
    db.execute(
        "INSERT INTO agent_runs (id, workspace_id, agent_id, tool_id, action_json, status, budget_reserved_cents, idempotency_key, request_hash) VALUES ('run-a', 'tenant-a', 'agent-a', 'tool-a', ?, 'authorized', 10, 'run-a', ?)",
        (action, "a" * 64),
    )
    db.execute(
        "INSERT INTO agent_runs (id, workspace_id, agent_id, tool_id, action_json, status, budget_reserved_cents, idempotency_key, request_hash) VALUES ('run-b', 'tenant-b', 'agent-b', 'tool-b', ?, 'awaiting_approval', 10, 'run-b', ?)",
        (action, "b" * 64),
    )
    db.execute("INSERT INTO agent_tools (id, workspace_id, name, transport, external, scopes_json, enabled) VALUES ('tool-history', 'tenant-a', 'Historical tool', 'local-simulator', 0, '[\"records:read\"]', 1)")
    db.execute("INSERT INTO agent_tool_grants (workspace_id, agent_id, tool_id, scopes_json) VALUES ('tenant-a', 'agent-a', 'tool-history', '[\"records:read\"]')")
    db.execute(
        "INSERT INTO agent_runs (id, workspace_id, agent_id, tool_id, action_json, status, budget_reserved_cents, idempotency_key, request_hash) VALUES ('run-history', 'tenant-a', 'agent-a', 'tool-history', ?, 'constrained', 0, 'run-history', ?)",
        (action, "9" * 64),
    )
    db.execute("DELETE FROM agent_tool_grants WHERE workspace_id='tenant-a' AND agent_id='agent-a' AND tool_id='tool-history'")
    expect_integrity_error(
        db,
        "UPDATE agent_tools SET workspace_id='tenant-b' WHERE workspace_id='tenant-a' AND id='tool-history'",
        message="A historical tool identity moved across workspaces after its grant was removed",
    )
    expect_integrity_error(
        db,
        "INSERT INTO approval_requests (id, workspace_id, run_id, requested_by_actor_id, action_summary, expires_at) VALUES ('approval-cross', 'tenant-b', 'run-b', 'actor-a', 'Cross tenant', '2099-01-01T00:00:00.000Z')",
        message="Approval accepted a cross-tenant requesting actor",
    )
    db.execute(
        "INSERT INTO approval_requests (id, workspace_id, run_id, requested_by_actor_id, action_summary, expires_at) VALUES ('approval-b', 'tenant-b', 'run-b', 'actor-b', 'Approve run B', '2099-01-01T00:00:00.000Z')"
    )
    db.execute(
        "INSERT INTO agent_traces (id, workspace_id, run_id, sequence, event_type) VALUES ('trace-a', 'tenant-a', 'run-a', 1, 'policy_decision')"
    )
    for mutation in [
        "UPDATE agent_traces SET event_type = 'tampered' WHERE id = 'trace-a'",
        "DELETE FROM agent_traces WHERE id = 'trace-a'",
    ]:
        expect_integrity_error(db, mutation, message="Append-only agent trace accepted a mutation")

    db.execute(
        "INSERT INTO execution_receipts (id, workspace_id, run_id, tool_id, outcome, input_hash, output_hash, cost_cents, metadata_json) VALUES ('receipt-a', 'tenant-a', 'run-a', 'tool-a', 'succeeded', ?, ?, 10, '{}')",
        ("c" * 64, "d" * 64),
    )
    for mutation in [
        "UPDATE execution_receipts SET cost_cents = 0 WHERE id = 'receipt-a'",
        "DELETE FROM execution_receipts WHERE id = 'receipt-a'",
    ]:
        expect_integrity_error(db, mutation, message="Append-only execution receipt accepted a mutation")
    expect_integrity_error(
        db,
        "INSERT INTO execution_receipts (id, workspace_id, run_id, tool_id, outcome, input_hash, output_hash, cost_cents, metadata_json) VALUES ('receipt-a-2', 'tenant-a', 'run-a', 'tool-a', 'succeeded', ?, ?, 10, '{}')",
        ("e" * 64, "f" * 64),
        "A run accepted more than one execution receipt",
    )
    expect_integrity_error(
        db,
        "UPDATE agent_identities SET spent_cents = 101 WHERE workspace_id = 'tenant-a' AND id = 'agent-a'",
        message="Agent budget guard allowed spend above budget",
    )
    expect_integrity_error(
        db,
        "UPDATE agent_runs SET action_json = '{\"summary\":\"tampered\",\"scope\":\"records:read\"}' WHERE workspace_id = 'tenant-a' AND id = 'run-a'",
        message="Immutable run authorization accepted a rewrite",
    )
    expect_integrity_error(
        db,
        "INSERT INTO agent_tools (id, workspace_id, name, transport) VALUES ('orphan-tool', 'missing-workspace', 'Orphan', 'local-simulator')",
        message="Agent tool accepted a nonexistent workspace",
    )
    db.execute("INSERT INTO actors (id, workspace_id, kind, display_name) VALUES ('agent-actor-a2', 'tenant-a', 'agent', 'Too many')")
    expect_integrity_error(
        db,
        "INSERT INTO agent_identities (id, workspace_id, actor_id, owner_actor_id, autonomy_level, status) VALUES ('agent-a2', 'tenant-a', 'agent-actor-a2', 'actor-a', 'observe', 'paused')",
        message="Personal profile accepted a second agent",
    )

    db.executemany(
        "INSERT INTO connector_connections (id, workspace_id, connector_key, auth_type) VALUES (?, ?, ?, 'simulated')",
        [("connector-a", "tenant-a", "csv"), ("connector-b", "tenant-b", "csv")],
    )
    expect_integrity_error(
        db,
        "INSERT INTO connector_sync_claims (workspace_id, connection_id, expected_cursor, operation_id) VALUES ('tenant-a', 'connector-a', '', 'sync-disconnected')",
        message="A disconnected connector accepted a sync claim",
    )
    db.execute("UPDATE connector_connections SET status = 'connected', health = 'healthy' WHERE workspace_id = 'tenant-a' AND id = 'connector-a'")
    db.execute("INSERT INTO connector_sync_claims (workspace_id, connection_id, expected_cursor, operation_id) VALUES ('tenant-a', 'connector-a', '', 'sync-a')")
    expect_integrity_error(
        db,
        "INSERT INTO connector_sync_claims (workspace_id, connection_id, expected_cursor, operation_id) VALUES ('tenant-a', 'connector-a', '', 'sync-b')",
        message="Two connector syncs claimed the same cursor",
    )
    db.execute("UPDATE connector_connections SET sync_cursor = '1' WHERE workspace_id = 'tenant-a' AND id = 'connector-a'")
    expect_integrity_error(
        db,
        "INSERT INTO connector_sync_claims (workspace_id, connection_id, expected_cursor, operation_id) VALUES ('tenant-a', 'connector-a', '', 'stale-sync')",
        message="A stale connector cursor accepted a sync claim",
    )
    expect_integrity_error(
        db,
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash) VALUES ('delivery-cross', 'tenant-a', 'connector-b', 'event', ?)",
        ("0" * 64,),
        "Webhook delivery accepted a cross-tenant connector",
    )
    db.execute(
        "INSERT INTO connector_connections (id, workspace_id, connector_key, auth_type, credential_ref, status, health, credential_generation) VALUES ('webhook-a', 'tenant-a', 'webhook-simulator', 'simulated', ?, 'connected', 'healthy', 2)",
        ("sha256:" + "a" * 64,),
    )
    expect_integrity_error(
        db,
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, credential_generation) VALUES ('stale-delivery', 'tenant-a', 'webhook-a', 'stale-event', ?, 1)",
        ("1" * 64,),
        "A rotated webhook credential committed an in-flight delivery",
    )
    db.execute(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, credential_generation) VALUES ('current-delivery', 'tenant-a', 'webhook-a', 'current-event', ?, 2)",
        ("2" * 64,),
    )
    db.execute(
        "INSERT INTO connector_connections (id, workspace_id, connector_key, auth_type, credential_ref, status, health, credential_generation) VALUES ('webhook-b', 'tenant-b', 'webhook-simulator', 'simulated', ?, 'connected', 'healthy', 1)",
        ("sha256:" + "b" * 64,),
    )
    db.executemany(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, received_at, credential_generation) VALUES (?, 'tenant-a', 'webhook-a', ?, ?, '2000-01-01T00:00:00.000Z', 2)",
        ((f"old-delivery-{index}", f"old-event-{index}", "3" * 64) for index in range(101)),
    )
    db.execute(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, received_at, credential_generation) VALUES ('young-delivery-a', 'tenant-a', 'webhook-a', 'young-event-a', ?, '2099-01-01T00:00:00.000Z', 2)",
        ("4" * 64,),
    )
    db.execute(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, received_at, credential_generation) VALUES ('old-delivery-b', 'tenant-b', 'webhook-b', 'old-event-b', ?, '2000-01-01T00:00:00.000Z', 1)",
        ("5" * 64,),
    )
    db.execute(
        "DELETE FROM webhook_deliveries WHERE rowid IN (SELECT rowid FROM webhook_deliveries WHERE workspace_id='tenant-a' AND connection_id='webhook-a' AND received_at < '2026-01-01T00:00:00.000Z' ORDER BY received_at ASC LIMIT 100)"
    )
    retained_old_a = db.execute("SELECT COUNT(*) FROM webhook_deliveries WHERE workspace_id='tenant-a' AND connection_id='webhook-a' AND received_at < '2026-01-01T00:00:00.000Z'").fetchone()[0]
    if retained_old_a != 1:
        raise AssertionError(f"Webhook receipt pruning was not bounded to 100 rows: {retained_old_a} old rows remain")
    if db.execute("SELECT COUNT(*) FROM webhook_deliveries WHERE id IN ('young-delivery-a','old-delivery-b')").fetchone()[0] != 2:
        raise AssertionError("Webhook receipt pruning crossed a tenant/connection boundary or removed a young receipt")
    current_receipts = db.execute("SELECT COUNT(*) FROM webhook_deliveries WHERE workspace_id='tenant-a' AND connection_id='webhook-a'").fetchone()[0]
    receipt_counter = db.execute("SELECT webhook_receipt_count FROM connector_connections WHERE workspace_id='tenant-a' AND id='webhook-a'").fetchone()[0]
    if receipt_counter != current_receipts:
        raise AssertionError(f"Webhook receipt counter drifted after bounded pruning: counter={receipt_counter}, rows={current_receipts}")
    db.execute("UPDATE connector_connections SET webhook_receipt_count=49999 WHERE workspace_id='tenant-a' AND id='webhook-a'")
    db.execute(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, received_at, credential_generation) VALUES ('capacity-delivery', 'tenant-a', 'webhook-a', 'capacity-event', ?, '2099-01-02T00:00:00.000Z', 2)",
        ("6" * 64,),
    )
    if db.execute("SELECT webhook_receipt_count FROM connector_connections WHERE workspace_id='tenant-a' AND id='webhook-a'").fetchone()[0] != 50000:
        raise AssertionError("Webhook receipt insert did not update the capacity counter")
    expect_integrity_error(
        db,
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash, received_at, credential_generation) VALUES ('over-capacity-delivery', 'tenant-a', 'webhook-a', 'over-capacity-event', ?, '2099-01-03T00:00:00.000Z', 2)",
        ("7" * 64,),
        "Webhook delivery receipts exceeded the per-connection database cap",
    )
    db.execute("DELETE FROM webhook_deliveries WHERE workspace_id='tenant-a' AND id='capacity-delivery'")
    db.execute("UPDATE connector_connections SET webhook_receipt_count=? WHERE workspace_id='tenant-a' AND id='webhook-a'", (current_receipts,))
    expect_integrity_error(
        db,
        "UPDATE connector_connections SET credential_generation=1 WHERE workspace_id='tenant-a' AND id='webhook-a'",
        message="A connector credential generation moved backwards",
    )

    integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_key_errors = list(db.execute("PRAGMA foreign_key_check"))
    if integrity != "ok" or foreign_key_errors:
        raise AssertionError(f"integrity={integrity}, foreign_keys={foreign_key_errors}")

    plan = " ".join(str(value) for row in db.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM records WHERE workspace_id = ? AND object_type = ? AND status = ?",
        ("tenant-a", "contact", "active"),
    ) for value in row)
    if "idx_records_workspace_type_status" not in plan:
        raise AssertionError(f"Hot record query did not use the tenant-first index: {plan}")

    agent_plan = " ".join(str(value) for row in db.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM agent_runs WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC",
        ("tenant-a", "authorized"),
    ) for value in row)
    if "idx_agent_runs_workspace_status" not in agent_plan:
        raise AssertionError(f"Agent run query did not use the tenant-first status index: {agent_plan}")

    print(f"Verified {len(MIGRATIONS)} migration(s), {len(REQUIRED_TABLES)} tables, {len(REQUIRED_TRIGGERS)} security triggers, tenant fences, append-only records, budgets, integrity, and hot-query indexes.")


if __name__ == "__main__":
    main()

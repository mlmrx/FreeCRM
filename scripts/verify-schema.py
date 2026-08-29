"""Apply every Drizzle migration to SQLite and verify integrity and tenant fences."""

from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "drizzle").glob("*.sql"))
REQUIRED_TABLES = {
    "workspaces",
    "memberships",
    "module_configs",
    "records",
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
}


def main() -> None:
    if not MIGRATIONS:
        raise SystemExit("No SQL migrations found")
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    for path in MIGRATIONS:
        sql = path.read_text(encoding="utf-8")
        for statement in sql.split("--> statement-breakpoint"):
            if statement.strip():
                db.execute(statement)

    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    indexes = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    missing_tables = REQUIRED_TABLES - tables
    missing_indexes = REQUIRED_INDEXES - indexes
    if missing_tables or missing_indexes:
        raise AssertionError(f"Missing tables={sorted(missing_tables)} indexes={sorted(missing_indexes)}")

    db.executemany(
        "INSERT INTO workspaces (id, owner_user_id, owner_email, name) VALUES (?, ?, ?, ?)",
        [("tenant-a", "user-a", "a@example.test", "A"), ("tenant-b", "user-b", "b@example.test", "B")],
    )
    db.executemany(
        "INSERT INTO records (id, workspace_id, object_type, name, owner_user_id) VALUES (?, ?, 'contact', ?, ?)",
        [("record-a", "tenant-a", "A contact", "user-a"), ("record-b", "tenant-b", "B contact", "user-b")],
    )
    try:
        db.execute(
            "INSERT INTO record_links (workspace_id, source_id, target_id, relationship) VALUES (?, ?, ?, ?)",
            ("tenant-a", "record-a", "record-b", "forbidden_cross_tenant"),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Composite foreign keys allowed a cross-tenant record link")

    db.executemany(
        "INSERT INTO actors (id, workspace_id, kind, display_name) VALUES (?, ?, 'human', ?)",
        [("actor-a", "tenant-a", "A human"), ("actor-b", "tenant-b", "B human")],
    )
    try:
        db.execute(
            "INSERT INTO party_relationships (id, workspace_id, source_actor_id, target_actor_id, relationship_type) VALUES (?, ?, ?, ?, ?)",
            ("cross-edge", "tenant-a", "actor-a", "actor-b", "forbidden_cross_tenant"),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Composite actor foreign keys allowed a cross-tenant relationship")

    db.execute("INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, request_id) VALUES ('audit-a', 'tenant-a', 'user-a', 'test', 'workspace', 'request-a')")
    for mutation in [
        "UPDATE audit_events SET action = 'tampered' WHERE id = 'audit-a'",
        "DELETE FROM audit_events WHERE id = 'audit-a'",
    ]:
        try:
            db.execute(mutation)
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("Append-only audit event accepted a mutation")

    db.executemany(
        "INSERT INTO connector_connections (id, workspace_id, connector_key, auth_type) VALUES (?, ?, 'webhook-simulator', 'simulated')",
        [("connection-a", "tenant-a"), ("connection-b", "tenant-b")],
    )
    db.execute(
        "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash) VALUES ('delivery-a', 'tenant-a', 'connection-a', 'event-a', 'hash-a')"
    )
    for values in [
        ("duplicate-delivery", "tenant-a", "connection-a", "event-a", "hash-a"),
        ("cross-tenant-delivery", "tenant-a", "connection-b", "event-b", "hash-b"),
    ]:
        try:
            db.execute(
                "INSERT INTO webhook_deliveries (id, workspace_id, connection_id, provider_delivery_id, payload_hash) VALUES (?, ?, ?, ?, ?)",
                values,
            )
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("Webhook delivery accepted a duplicate or cross-tenant connection")

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

    print(f"Verified {len(MIGRATIONS)} migration(s), {len(REQUIRED_TABLES)} tables, tenant fences, integrity, and hot-query indexes.")


if __name__ == "__main__":
    main()

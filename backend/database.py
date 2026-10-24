import json
import hashlib
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
SEED_PATH = ROOT / "src" / "data" / "seed.json"


def database_path() -> Path:
    return Path(os.environ.get("RESOURCE_DB_PATH", ROOT / "backend" / "resource.db"))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def database_connection() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database(reset: bool = False) -> None:
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    with database_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS companies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                type TEXT NOT NULL,
                material TEXT NOT NULL,
                note TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS listings (
                id TEXT PRIMARY KEY,
                mode TEXT NOT NULL CHECK (mode IN ('buy', 'sell')),
                material TEXT NOT NULL,
                title TEXT NOT NULL,
                qty TEXT NOT NULL,
                company_id TEXT NOT NULL REFERENCES companies(id),
                node_id TEXT NOT NULL,
                reliability REAL NOT NULL,
                save INTEGER NOT NULL,
                industry TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL REFERENCES listings(id),
                status TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS lots (
                id TEXT PRIMARY KEY,
                listing_id TEXT NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                flagged INTEGER NOT NULL DEFAULT 0,
                flagged_reason TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS lot_events (
                id TEXT PRIMARY KEY,
                lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                actor_company TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                weight_kg REAL NOT NULL,
                timestamp TEXT NOT NULL,
                verification_status TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                event_hash TEXT NOT NULL,
                tx_ref TEXT NOT NULL,
                UNIQUE (lot_id, sequence)
            );
            """
        )
        already_seeded = connection.execute(
            "SELECT 1 FROM app_meta WHERE key = 'seeded'"
        ).fetchone()
        if reset:
            connection.execute("DELETE FROM lot_events")
            connection.execute("DELETE FROM lots")
            connection.execute("DELETE FROM trades")
            connection.execute("DELETE FROM listings")
            connection.execute("DELETE FROM companies")
            connection.execute("DELETE FROM app_meta")
            already_seeded = None
        if already_seeded:
            _ensure_listing_lots(connection)
            return

        for node in seed["nodes"]:
            connection.execute(
                """
                INSERT INTO companies (id, name, lat, lng, type, material, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    node["id"], node["name"], node["lat"], node["lng"],
                    node["type"], node["material"], node["note"],
                ),
            )
        for listing in seed["listings"]:
            metadata = {
                key: value
                for key, value in listing.items()
                if key not in {
                    "id", "mode", "material", "title", "qty", "company",
                    "nodeId", "reliability", "save", "industry",
                }
            }
            connection.execute(
                """
                INSERT INTO listings (
                    id, mode, material, title, qty, company_id, node_id,
                    reliability, save, industry, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    listing["id"], listing["mode"], listing["material"],
                    listing["title"], listing["qty"], listing["nodeId"],
                    listing["nodeId"], listing["reliability"], listing["save"],
                    listing["industry"], json.dumps(metadata, sort_keys=True),
                ),
            )
        _ensure_listing_lots(connection)
        connection.execute(
            "INSERT INTO app_meta (key, value) VALUES ('seeded', 'true')"
        )


def _quantity_kg(value: str) -> float:
    match = re.match(r"^\s*([\d,]+(?:\.\d+)?)\s*(kg|t)?\s*$", value, re.IGNORECASE)
    if not match:
        return 0
    amount = float(match.group(1).replace(",", ""))
    return amount * 1000 if match.group(2) and match.group(2).lower() == "t" else amount


def _event_payload(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": event["id"],
        "lot_id": event["lot_id"],
        "sequence": event["sequence"],
        "event_type": event["event_type"],
        "actor_company": event["actor_company"],
        "actor_role": event["actor_role"],
        "weight_kg": event["weight_kg"],
        "timestamp": event["timestamp"],
        "verification_status": event["verification_status"],
        "tx_ref": event["tx_ref"],
    }


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _append_event(
    connection: sqlite3.Connection,
    *,
    lot_id: str,
    event_type: str,
    actor_company: str,
    actor_role: str,
    weight_kg: float,
    verification_status: str,
) -> dict[str, Any]:
    previous = connection.execute(
        "SELECT event_hash FROM lot_events WHERE lot_id = ? ORDER BY sequence DESC LIMIT 1",
        (lot_id,),
    ).fetchone()
    previous_hash = previous["event_hash"] if previous else ""
    sequence = connection.execute(
        "SELECT COALESCE(MAX(sequence), 0) + 1 FROM lot_events WHERE lot_id = ?",
        (lot_id,),
    ).fetchone()[0]
    event = {
        "id": str(uuid4()),
        "lot_id": lot_id,
        "sequence": sequence,
        "event_type": event_type,
        "actor_company": actor_company,
        "actor_role": actor_role,
        "weight_kg": float(weight_kg),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "verification_status": verification_status,
        "previous_hash": previous_hash,
        "tx_ref": f"TX-{uuid4().hex[:12].upper()}",
    }
    event_hash = hashlib.sha256(
        (previous_hash + _canonical_json(_event_payload(event))).encode("utf-8")
    ).hexdigest()
    connection.execute(
        """
        INSERT INTO lot_events (
            id, lot_id, sequence, event_type, actor_company, actor_role,
            weight_kg, timestamp, verification_status, previous_hash, event_hash, tx_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event["id"], event["lot_id"], event["sequence"], event["event_type"],
            event["actor_company"], event["actor_role"], event["weight_kg"],
            event["timestamp"], event["verification_status"], event["previous_hash"],
            event_hash, event["tx_ref"],
        ),
    )
    event["event_hash"] = event_hash
    return event


def _create_lot_for_listing(connection: sqlite3.Connection, listing: sqlite3.Row) -> str:
    lot_id = f"LOT-{uuid4().hex[:16].upper()}"
    initial_weight = _quantity_kg(listing["qty"])
    connection.execute(
        "INSERT INTO lots (id, listing_id, status) VALUES (?, ?, 'listed')",
        (lot_id, listing["id"]),
    )
    _append_event(
        connection,
        lot_id=lot_id,
        event_type="listed",
        actor_company=listing["company"],
        actor_role="seller",
        weight_kg=initial_weight,
        verification_status="self-reported",
    )
    return lot_id


def _ensure_listing_lots(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        """
        SELECT l.id, l.qty, c.name AS company
        FROM listings l
        JOIN companies c ON c.id = l.company_id
        LEFT JOIN lots lot ON lot.listing_id = l.id
        WHERE lot.id IS NULL
        """
    ).fetchall()
    for row in rows:
        _create_lot_for_listing(connection, row)


def list_companies() -> list[dict[str, Any]]:
    with database_connection() as connection:
        rows = connection.execute(
            "SELECT id, name, lat, lng, type, material, note FROM companies ORDER BY name"
        ).fetchall()
    return [dict(row) for row in rows]


def list_listings() -> list[dict[str, Any]]:
    with database_connection() as connection:
        rows = connection.execute(
            """
            SELECT l.*, c.name AS company,
                   lot.id AS lot_id,
                   lot.status AS lot_status,
                   EXISTS (
                       SELECT 1 FROM trades t
                       WHERE t.listing_id = l.id AND t.status = 'matched'
                   ) AS matched
            FROM listings l
            JOIN companies c ON c.id = l.company_id
            LEFT JOIN lots lot ON lot.listing_id = l.id
            ORDER BY l.created_at DESC, l.rowid DESC
            """
        ).fetchall()
    listings = []
    for row in rows:
        listing = dict(row)
        listing["nodeId"] = listing.pop("node_id")
        listing["companyId"] = listing.pop("company_id")
        listing["metadata"] = json.loads(listing.pop("metadata"))
        matched = bool(listing.pop("matched"))
        listing["lotId"] = listing.pop("lot_id")
        listing["lotStatus"] = listing.pop("lot_status")
        listing.update(listing.pop("metadata"))
        listing["matched"] = matched
        listings.append(listing)
    return listings


def create_listing(data: dict[str, Any]) -> dict[str, Any]:
    listing_id = data.get("id") or str(uuid4())
    node = data["node"]
    company_id = node["id"]
    metadata = data.get("metadata", {})
    data["metadata"] = metadata
    with database_connection() as connection:
        connection.execute(
            """
            INSERT OR IGNORE INTO companies (id, name, lat, lng, type, material, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company_id, data["company"], node["lat"], node["lng"],
                node["type"], data["material"], node["note"],
            ),
        )
        connection.execute(
            """
            INSERT INTO listings (
                id, mode, material, title, qty, company_id, node_id,
                reliability, save, industry, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                listing_id, data["mode"], data["material"], data["title"],
                data["qty"], company_id, company_id, data["reliability"],
                data["save"], data["industry"],
                json.dumps(metadata, sort_keys=True),
            ),
        )
        listing = connection.execute(
            """
            SELECT l.id, l.qty, c.name AS company
            FROM listings l JOIN companies c ON c.id = l.company_id
            WHERE l.id = ?
            """,
            (listing_id,),
        ).fetchone()
        _create_lot_for_listing(connection, listing)
    return next(item for item in list_listings() if item["id"] == listing_id)


def get_lot(lot_id: str) -> dict[str, Any] | None:
    with database_connection() as connection:
        lot = connection.execute(
            """
            SELECT lot.id, lot.status, lot.flagged, lot.flagged_reason, lot.created_at,
                   l.id AS listing_id, l.mode, l.material, l.title, l.qty,
                   l.company_id, l.node_id, c.name AS company
            FROM lots lot
            JOIN listings l ON l.id = lot.listing_id
            JOIN companies c ON c.id = l.company_id
            WHERE lot.id = ?
            """,
            (lot_id,),
        ).fetchone()
        if lot is None:
            return None
        event_rows = connection.execute(
            "SELECT * FROM lot_events WHERE lot_id = ? ORDER BY sequence",
            (lot_id,),
        ).fetchall()
    listing = {
        "id": lot["listing_id"],
        "mode": lot["mode"],
        "material": lot["material"],
        "title": lot["title"],
        "qty": lot["qty"],
        "companyId": lot["company_id"],
        "nodeId": lot["node_id"],
        "company": lot["company"],
    }
    return {
        "id": lot["id"],
        "status": "flagged" if lot["flagged"] else lot["status"],
        "flagged": bool(lot["flagged"]),
        "flagged_reason": lot["flagged_reason"],
        "created_at": lot["created_at"],
        "listing": listing,
        "events": [dict(row) for row in event_rows],
        "chain_valid": _verify_event_rows(event_rows),
    }


def _verify_event_rows(rows: list[sqlite3.Row]) -> bool:
    previous_hash = ""
    for expected_sequence, row in enumerate(rows, start=1):
        event = dict(row)
        if event["sequence"] != expected_sequence or event["previous_hash"] != previous_hash:
            return False
        expected_hash = hashlib.sha256(
            (previous_hash + _canonical_json(_event_payload(event))).encode("utf-8")
        ).hexdigest()
        if event["event_hash"] != expected_hash:
            return False
        previous_hash = event["event_hash"]
    return True


def next_lot_event(lot_id: str) -> dict[str, str] | None:
    lot = get_lot(lot_id)
    if lot is None or lot["flagged"]:
        return None
    next_event = {
        "listed": ("picked_up", "seller"),
        "picked_up": ("hub_inspected", "hub"),
        "hub_inspected": ("delivered", "buyer"),
        "delivered": ("recycled", "hub"),
        "recycled": (None, None),
    }.get(lot["status"])
    if next_event is None or next_event[0] is None:
        return None
    return {"event_type": next_event[0], "actor_role": next_event[1]}


def record_lot_event(
    lot_id: str,
    event_type: str,
    actor_company: str,
    actor_role: str,
    weight_kg: float,
) -> dict[str, Any]:
    event_roles = {
        "picked_up": "seller",
        "hub_inspected": "hub",
        "delivered": "buyer",
        "recycled": "hub",
    }
    with database_connection() as connection:
        lot = connection.execute(
            "SELECT status, flagged FROM lots WHERE id = ?",
            (lot_id,),
        ).fetchone()
        if lot is None:
            raise KeyError("Lot not found.")
        if lot["flagged"]:
            raise ValueError("This lot is flagged and cannot accept further events.")
        expected_event, expected_role = {
            "listed": ("picked_up", "seller"),
            "picked_up": ("hub_inspected", "hub"),
            "hub_inspected": ("delivered", "buyer"),
            "delivered": ("recycled", "hub"),
            "recycled": (None, None),
        }[lot["status"]]
        if event_type != expected_event:
            raise ValueError(f"Next allowed event is {expected_event or 'none'}.")
        if actor_role != expected_role or event_roles.get(event_type) != actor_role:
            raise ValueError(f"The {event_type} event must be recorded by the {expected_role} role.")
        if weight_kg <= 0:
            raise ValueError("Event weight must be greater than zero.")

        verification_status = "verified" if actor_role == "hub" else "self-reported"
        if event_type == "recycled":
            input_row = connection.execute(
                """
                SELECT weight_kg FROM lot_events
                WHERE lot_id = ? AND event_type = 'delivered'
                  AND verification_status != 'rejected'
                ORDER BY sequence DESC LIMIT 1
                """,
                (lot_id,),
            ).fetchone()
            if input_row is None or weight_kg > input_row["weight_kg"]:
                reason = "Recycled output weight cannot exceed the delivered input weight."
                rejected = _append_event(
                    connection,
                    lot_id=lot_id,
                    event_type=event_type,
                    actor_company=actor_company,
                    actor_role=actor_role,
                    weight_kg=weight_kg,
                    verification_status="rejected",
                )
                connection.execute(
                    "UPDATE lots SET flagged = 1, flagged_reason = ? WHERE id = ?",
                    (reason, lot_id),
                )
                return {"accepted": False, "reason": reason, "event": rejected}

        event = _append_event(
            connection,
            lot_id=lot_id,
            event_type=event_type,
            actor_company=actor_company,
            actor_role=actor_role,
            weight_kg=weight_kg,
            verification_status=verification_status,
        )
        connection.execute(
            "UPDATE lots SET status = ? WHERE id = ?",
            (event_type, lot_id),
        )
    return {"accepted": True, "event": event}


def create_trade(data: dict[str, Any]) -> dict[str, Any]:
    trade_id = str(uuid4())
    details = {key: value for key, value in data.items() if key != "listing_id"}
    with database_connection() as connection:
        connection.execute(
            "INSERT INTO trades (id, listing_id, status, details) VALUES (?, ?, ?, ?)",
            (trade_id, data["listing_id"], "matched", json.dumps(details, sort_keys=True)),
        )
        row = connection.execute(
            "SELECT id, listing_id, status, details, created_at FROM trades WHERE id = ?",
            (trade_id,),
        ).fetchone()
    return _trade_dict(row)


def get_trade(trade_id: str) -> dict[str, Any] | None:
    with database_connection() as connection:
        row = connection.execute(
            "SELECT id, listing_id, status, details, created_at FROM trades WHERE id = ?",
            (trade_id,),
        ).fetchone()
    return _trade_dict(row) if row else None


def _trade_dict(row: sqlite3.Row) -> dict[str, Any]:
    trade = dict(row)
    trade["details"] = json.loads(trade["details"])
    return trade


def get_stats() -> dict[str, int]:
    with database_connection() as connection:
        return {
            "listings": connection.execute("SELECT COUNT(*) FROM listings").fetchone()[0],
            "companies": connection.execute("SELECT COUNT(*) FROM companies").fetchone()[0],
            "trades": connection.execute(
                "SELECT COUNT(*) FROM trades WHERE status = 'matched'"
            ).fetchone()[0],
        }

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import (
    STREAMS,
    TYPES,
    ListingInput,
    TradePairInput,
    app,
    build_feature_row,
    normalize_stream,
    normalize_type,
    pipeline,
    predict_pairs,
)
from backend import database


class ModelIntegrationTests(unittest.TestCase):
    def test_feature_schema_and_documented_fallbacks(self):
        pair = TradePairInput(
            id="schema-check",
            buyer=ListingInput(material="Plastic", title="Plastic", qty="200 kg"),
            seller=ListingInput(material="Plastic", title="Plastic", qty="300 kg"),
            distance_km=2.4,
        )

        self.assertEqual(tuple(build_feature_row(pair)), tuple(pipeline.feature_names_in_))
        self.assertEqual(normalize_stream("heat"), STREAMS[0])
        self.assertEqual(normalize_type("Steel", "unknown type"), TYPES["Steel"][0])

    def test_confidence_uses_the_predicted_class_probability(self):
        pairs = []
        for index, buyer_stream in enumerate(STREAMS):
            for seller_stream in STREAMS:
                unit = "L" if buyer_stream == "Water" else "kg"
                pairs.append(TradePairInput(
                    id=f"pair-{index}-{seller_stream}",
                    buyer=ListingInput(
                        material=buyer_stream,
                        title=TYPES[buyer_stream][0],
                        qty=f"200 {unit}",
                    ),
                    seller=ListingInput(
                        material=seller_stream,
                        title=TYPES[seller_stream][0],
                        qty=f"300 {unit}",
                    ),
                    distance_km=(index + 1) * 2.0,
                ))

        predictions = predict_pairs(pairs)
        self.assertEqual(
            {prediction["predicted_accepted"] for prediction in predictions},
            {True, False},
        )
        for prediction in predictions:
            expected = (
                prediction["acceptance_probability"]
                if prediction["predicted_accepted"]
                else 1 - prediction["acceptance_probability"]
            )
            self.assertAlmostEqual(prediction["confidence"], expected)


class MarketplacePersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_environment = patch.dict(
            os.environ,
            {"RESOURCE_DB_PATH": f"{self.temp_dir.name}/test.db"},
        )
        self.db_environment.start()
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.db_environment.stop()
        self.temp_dir.cleanup()

    def test_seed_is_loaded_once_and_stats_come_from_database(self):
        self.assertEqual(len(self.client.get("/api/listings").json()["listings"]), 5)
        self.assertEqual(len(self.client.get("/api/companies").json()["companies"]), 5)
        database.initialize_database()
        self.assertEqual(
            self.client.get("/api/stats").json(),
            {"listings": 5, "companies": 5, "trades": 0},
        )

    def test_seeded_listings_have_unique_passports_with_valid_chains(self):
        listings = self.client.get("/api/listings").json()["listings"]
        lot_ids = [listing["lotId"] for listing in listings]
        self.assertEqual(len(lot_ids), len(set(lot_ids)))

        for lot_id in lot_ids:
            response = self.client.get(f"/api/lots/{lot_id}")
            self.assertEqual(response.status_code, 200)
            lot = response.json()
            self.assertEqual(lot["events"][0]["event_type"], "listed")
            self.assertTrue(lot["chain_valid"])
            self.assertTrue(
                self.client.get(f"/api/lots/{lot_id}/verify-chain").json()["valid"]
            )

        with database.database_connection() as connection:
            connection.execute(
                "UPDATE lot_events SET weight_kg = weight_kg + 1 WHERE lot_id = ? AND sequence = 1",
                (lot_ids[0],),
            )
        self.assertFalse(
            self.client.get(f"/api/lots/{lot_ids[0]}/verify-chain").json()["valid"]
        )

    def test_listing_and_trade_endpoints_persist_records(self):
        listing_response = self.client.post(
            "/api/listings",
            json={
                "mode": "sell",
                "material": "plastic",
                "title": "Recycled PET",
                "qty": "250 kg",
                "company": "Demo Seller",
                "node": {
                    "id": "demo-seller-node",
                    "lat": 12.97,
                    "lng": 77.59,
                    "type": "provider",
                    "note": "Offers recycled PET",
                },
            },
        )
        self.assertEqual(listing_response.status_code, 201)
        listing = listing_response.json()
        self.assertEqual(listing["title"], "Recycled PET")
        self.assertEqual(listing["company"], "Demo Seller")
        self.assertFalse(listing["matched"])
        self.assertTrue(listing["lotId"].startswith("LOT-"))
        self.assertIn(
            listing["id"],
            [
                item["id"]
                for item in self.client.get("/api/listings").json()["listings"]
            ],
        )
        self.assertIn(
            "demo-seller-node",
            [
                company["id"]
                for company in self.client.get("/api/companies").json()["companies"]
            ],
        )

        trade_response = self.client.post(
            "/api/trades",
            json={
                "listing_id": listing["id"],
                "quantity": "250 kg",
                "actor_role": "seller",
            },
        )
        self.assertEqual(trade_response.status_code, 201)
        trade = trade_response.json()
        self.assertEqual(trade["status"], "matched")
        self.assertEqual(
            self.client.get(f"/api/trades/{trade['id']}").json()["details"]["actor_role"],
            "seller",
        )
        self.assertTrue(
            next(
                item
                for item in self.client.get("/api/listings").json()["listings"]
                if item["id"] == listing["id"]
            )["matched"]
        )
        self.assertEqual(self.client.get("/api/stats").json()["trades"], 1)

    def test_recycled_mass_balance_violation_flags_lot_and_is_hash_linked(self):
        listing = self.client.get("/api/listings").json()["listings"][0]
        lot_id = listing["lotId"]
        transitions = [
            ("picked_up", "seller", 500),
            ("hub_inspected", "hub", 490),
            ("delivered", "buyer", 480),
        ]
        for event_type, actor_role, weight_kg in transitions:
            response = self.client.post(
                f"/api/lots/{lot_id}/events",
                json={
                    "event_type": event_type,
                    "actor_role": actor_role,
                    "actor_company": f"Demo {actor_role.title()}",
                    "weight_kg": weight_kg,
                },
            )
            self.assertEqual(response.status_code, 201)

        rejected = self.client.post(
            f"/api/lots/{lot_id}/events",
            json={
                "event_type": "recycled",
                "actor_role": "hub",
                "actor_company": "Circularity Demo Hub",
                "weight_kg": 481,
            },
        )

        self.assertEqual(rejected.status_code, 422)
        passport = self.client.get(f"/api/lots/{lot_id}").json()
        self.assertEqual(passport["status"], "flagged")
        self.assertTrue(passport["flagged"])
        self.assertEqual(passport["events"][-1]["verification_status"], "rejected")
        self.assertTrue(passport["chain_valid"])

    def test_demo_reset_restores_seed_and_clears_trades(self):
        listing_response = self.client.post(
            "/api/listings",
            json={
                "mode": "sell",
                "material": "plastic",
                "title": "Temporary listing",
                "qty": "10 kg",
                "company": "Temporary Seller",
                "node": {
                    "id": "temporary-node",
                    "lat": 12.97,
                    "lng": 77.59,
                    "type": "provider",
                    "note": "Temporary listing",
                },
            },
        )
        self.assertEqual(listing_response.status_code, 201)
        trade_response = self.client.post(
            "/api/trades",
            json={
                "listing_id": listing_response.json()["id"],
                "quantity": "10 kg",
                "actor_role": "seller",
            },
        )
        self.assertEqual(trade_response.status_code, 201)

        reset_response = self.client.post("/api/demo/reset")

        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(
            reset_response.json(),
            {"reset": True, "stats": {"listings": 5, "companies": 5, "trades": 0}},
        )
        self.assertEqual(
            {item["id"] for item in self.client.get("/api/listings").json()["listings"]},
            {"l1", "l2", "l5", "l6", "l7"},
        )


if __name__ == "__main__":
    unittest.main()
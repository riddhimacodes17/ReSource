import unittest

from backend.main import (
    STREAMS,
    TYPES,
    ListingInput,
    TradePairInput,
    build_feature_row,
    normalize_stream,
    normalize_type,
    pipeline,
    predict_pairs,
)


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


if __name__ == "__main__":
    unittest.main()
import json
import os
import re
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "match_ranking_model" / "resource_trade_pipeline.joblib"
ARTEFACTS_PATH = ROOT / "match_ranking_model" / "resource_trade_artefacts.json"
ARTEFACTS = json.loads(ARTEFACTS_PATH.read_text(encoding="utf-8"))
STREAMS = ARTEFACTS["normalization_mappings"]["streams"]
TYPES = ARTEFACTS["normalization_mappings"]["types"]
FEATURES = ARTEFACTS["feature_schema"]
FEATURE_COLUMNS = FEATURES["numeric_features"] + FEATURES["categorical_features"]

artifact = joblib.load(MODEL_PATH)
if isinstance(artifact, dict):
    pipeline = artifact.get("pipeline_for_confidence")
    if pipeline is None:
        pipeline = artifact.get("pipeline")
else:
    pipeline = artifact
if pipeline is None:
    raise RuntimeError("The model artifact does not contain a fitted pipeline.")


class ListingInput(BaseModel):
    material: str
    title: str
    qty: str


class TradePairInput(BaseModel):
    id: str
    buyer: ListingInput
    seller: ListingInput
    distance_km: float | None = None


class PredictionBatch(BaseModel):
    pairs: list[TradePairInput] = Field(max_length=1000)


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


def normalize_stream(value: Any) -> str:
    cleaned = _clean(value)
    for stream in STREAMS:
        if _clean(stream) == cleaned:
            return stream
    synonyms = {
        "steel": "Steel",
        "plastic": "Plastic",
        "plastics": "Plastic",
        "paper": "Paper",
        "cardboard": "Paper",
        "water": "Water",
        "glass": "Glass",
    }
    for synonym, stream in synonyms.items():
        if synonym in cleaned:
            return stream
    return STREAMS[0]


def normalize_type(stream: str, value: Any) -> str:
    cleaned = _clean(value)
    allowed = TYPES[stream]
    for material_type in allowed:
        if _clean(material_type) == cleaned:
            return material_type
    for material_type in allowed:
        normalized_type = _clean(material_type)
        if cleaned in normalized_type or normalized_type in cleaned:
            return material_type
    return allowed[0]


def _quantity(value: str) -> float:
    match = re.match(r"^\s*([\d,]+(?:\.\d+)?)\s*(kg|t|kwh|l)?\b", value, re.IGNORECASE)
    if not match:
        return float("nan")
    amount = float(match.group(1).replace(",", ""))
    return amount * 1000 if match.group(2) and match.group(2).lower() == "t" else amount


def _quantity_comparison(required: float, available: float) -> str:
    if not np.isfinite(required) or not np.isfinite(available):
        return "unknown"
    if required < available:
        return "req_lt_avail"
    if required > available:
        return "req_gt_avail"
    return "req_eq_avail"


def _distance_category(distance_km: float | None) -> str:
    if distance_km is None or not np.isfinite(distance_km):
        return "unknown"
    if distance_km <= 2:
        return "<=2km"
    if distance_km <= 5:
        return "2-5km"
    if distance_km <= 7:
        return "5-7km"
    return ">7km"


def _listing_features(listing: ListingInput) -> tuple[str, str, float]:
    stream = normalize_stream(listing.material)
    material_type = normalize_type(stream, listing.title)
    return stream, material_type, _quantity(listing.qty)


def build_feature_row(pair: TradePairInput) -> dict[str, Any]:
    buyer_stream, buyer_type, required_quantity = _listing_features(pair.buyer)
    seller_stream, seller_type, available_quantity = _listing_features(pair.seller)
    distance = pair.distance_km if pair.distance_km is not None else float("nan")
    if buyer_stream == seller_stream:
        product_compat = "same_name_same_type" if buyer_type == seller_type else "same_name_diff_type"
    else:
        product_compat = "completely_different"

    return {
        "required_quantity": required_quantity,
        "available_quantity": available_quantity,
        "distance_km": distance,
        "buyer_stream_clean": buyer_stream,
        "buyer_type_clean": buyer_type,
        "seller_stream_clean": seller_stream,
        "seller_type_clean": seller_type,
        "buyer_primary_stream": buyer_stream,
        "seller_primary_stream": seller_stream,
        "buyer_region": "Synthetic Region 1",
        "seller_region": "Synthetic Region 1",
        "product_compat": product_compat,
        "dist_category": _distance_category(pair.distance_km),
        "qty_compare": _quantity_comparison(required_quantity, available_quantity),
    }


def _is_accepted_label(label: Any) -> bool:
    if label == 1:
        return True
    return str(label).strip().casefold() in {"accepted", "true"}


def predict_pairs(pairs: list[TradePairInput]) -> list[dict[str, Any]]:
    if not pairs:
        return []

    rows = [build_feature_row(pair) for pair in pairs]
    frame = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    labels = np.asarray(pipeline.classes_)
    accepted_indexes = [index for index, label in enumerate(labels) if _is_accepted_label(label)]
    if len(accepted_indexes) != 1:
        raise RuntimeError(f"Expected one Accepted model class, found {len(accepted_indexes)}.")

    predictions = pipeline.predict(frame)
    probabilities = pipeline.predict_proba(frame)
    results = []
    for pair, predicted_label, class_probabilities in zip(pairs, predictions, probabilities):
        predicted_indexes = np.flatnonzero(labels == predicted_label)
        if predicted_indexes.size != 1:
            raise RuntimeError("The model prediction does not match exactly one model class.")
        predicted_index = int(predicted_indexes[0])
        results.append({
            "id": pair.id,
            "predicted_accepted": _is_accepted_label(predicted_label),
            "confidence": float(class_probabilities[predicted_index]),
            "acceptance_probability": float(class_probabilities[accepted_indexes[0]]),
        })
    return results


app = FastAPI(title="ReSource trade prediction API")
allowed_origins = os.environ.get(
    "RESOURCE_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins.split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/predict")
def predict(batch: PredictionBatch) -> dict[str, list[dict[str, Any]]]:
    return {"predictions": predict_pairs(batch.pairs)}
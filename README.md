
### Trade outcome predictions

The marketplace prediction API loads the fitted scikit-learn pipeline from `match_ranking_model/resource_trade_pipeline.joblib`. `npm run dev` creates a local `.venv` with Python 3.12 on first run when needed, installs the existing `requirements-model.txt` packages there, starts FastAPI, waits for `/api/health`, then starts Vite. This requires Python 3.12, venv support, and an internet connection for the initial package installation. On Debian/Ubuntu, if Python reports that `ensurepip` is unavailable, install venv support first with `sudo apt-get install python3.12-venv`. To prepare the environment manually:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-model.txt
uvicorn backend.main:app --reload --port 8000
```

Then run `npm run dev`. Vite forwards `/api` requests to the local API. Check the API with `curl http://127.0.0.1:8000/api/health`.

For a separate production frontend and API, build the frontend with `VITE_API_BASE_URL` set to the API origin and configure the API's `RESOURCE_ALLOWED_ORIGINS` environment variable with the frontend origin. For same-origin routing, leave `VITE_API_BASE_URL` empty and route `/api` to the Python service. Keep the joblib artifact on the API host; it is a trusted Python pickle and must not be exposed as a browser asset.

### Local marketplace persistence (demo only)

The FastAPI service stores companies, listings, and API-created trades in SQLite using Python's built-in `sqlite3` module. On first run, it seeds the database with the demo listings and companies from `src/data/seed.json`; the React seed exports use the same file. The default database is `backend/resource.db` (ignored by Git). Set `RESOURCE_DB_PATH` to use a different SQLite file.

Run the frontend development command:

```sh
npm run dev
```

This starts FastAPI, waits for `/api/health`, then starts Vite. Keep this terminal running for both services. If automatic environment creation or dependency installation fails, the error is printed and Vite is not started. To use a separately managed API, set `RESOURCE_API_URL` to its origin; when `http://127.0.0.1:8000/api/health` is already healthy, the development launcher reuses it rather than starting another backend.

To start only the backend manually instead:

```sh
uvicorn backend.main:app --reload --port 8000
```

Opening the marketplace calls `POST /api/demo/reset` before fetching data. This restores the seeded listings and companies and clears database trades, so newly created listings and passport events reset when the marketplace is opened again. Direct `/lot/{lot_id}` visits skip that reset so a copied passport link remains available while its demo database state exists. This resets the shared SQLite database for every user of that API instance; it is demo-only and unsuitable for concurrent or production use. Completed trades and matched listing state live only in browser memory and are cleared by refreshing the marketplace. The Trade history section is session-only. The API provides `GET`/`POST /api/listings`, `GET /api/companies`, `POST /api/trades`, `GET /api/trades/{trade_id}`, `GET /api/stats`, and the demo-only reset endpoint. The header listing/company counts are read from the database; the trade count is session-only. The development launcher starts the API automatically, so a Vite `502` indicates that launcher startup failed or that the backend stopped; check the `npm run dev` terminal for the Python error. Other empty or invalid API responses are also reported without attempting to parse an empty body as JSON.

### Demo lot passports

Seeded and newly created listings receive backend-generated lot IDs. Select **View lot passport** on a listing to open `/lot/{lot_id}`. Passports show the ordered custody events, claimed weights, actor and role, verification label, event hash, local transaction reference, and a locally generated QR code. The Seller / Buyer and Hub demo roles record only their next permitted custody event; other roles are simulated after a two-second delay. A recycled output above the delivered input is rejected and flags the lot.

Each passport event is linked to its predecessor with a SHA-256 hash, and `GET /api/lots/{lot_id}/verify-chain` rechecks the local chain. This is a tamper-evident demo log, not a decentralized blockchain transaction; the `TX-…` references are local identifiers, not on-chain transaction hashes. Passport routes use the Vite SPA fallback, and `public/_redirects` provides the equivalent fallback for static hosts that support Netlify-style redirects. Other deployment hosts must also rewrite `/lot/*` to `/index.html`.

The role switcher offers only **Seller / Buyer** and **Hub** and is **demo-only**. It does not authenticate users, enforce authorization, or establish a real company identity. The trade dialog's two acceptance controls are a UI simulation; recording a trade does not represent a binding agreement or a real exchange. No real payments are processed.
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Indicative recycling impact

ReSource displays an **estimated potential CO₂e benefit from recycling** for a one-off listed mass in a single trade. It multiplies the listed material mass in kilograms by a material-specific net recycling-benefit factor. Tonnes are converted to kilograms. Explicit rate-based quantities (for example, `kg/day`) do not receive an estimate because the app has no modeled trade-duration value with which to calculate a total.

The EPA Waste Reduction Model (WARM) Version 16 factors below are net emissions for a post-consumer recycling pathway, not virgin-production factors. WARM's negative source values indicate net GHG reductions; ReSource converts those to positive potential benefits. WARM references the analysis at waste generation and includes recycling collection/transport, sorting and processing, recycled-material manufacture, and offsets for avoided virgin-material acquisition and manufacture. It uses default transportation assumptions unless customized; the documented boundary includes relevant material/product transportation and excludes transport from retail/distribution to the consumer.

| ReSource category | WARM source value | ReSource factor | Source table |
| --- | ---: | ---: | --- |
| Glass (containers/packaging) | -0.2760901764592596 MTCO₂e/short ton (table: -0.28) | 0.304337324346 kg CO₂e/kg | Exhibit 1-4, `Glass`; model workbook `Summary Data!C5` |
| Mixed plastics | -0.9255234067519946 MTCO₂e/short ton (table: -0.93) | 1.020214919788 kg CO₂e/kg | Exhibit 5-3, `Mixed Plastics`; model workbook `Summary Data!C35` |
| Mixed paper (general) | -3.5455235990647034 MTCO₂e/short ton (table: -3.55) | 3.908270766398 kg CO₂e/kg | Exhibit 3-7, `Mixed Paper (general)`; model workbook `Summary Data!C31` |

WARM's displayed technical-documentation tables round values to two decimals; the listed precise source values come from the corresponding recycling column in its Version 16 model workbook. Conversion is `-sourceValue × 1,000 ÷ 907.18474`, using 1 short ton = 907.18474 kg. The mixed-plastics factor represents 40% HDPE and 60% PET by weight. The general mixed-paper factor represents 48% corrugated containers, 8% magazines/third-class mail, 24% newspaper, and 20% office paper. WARM assumes its glass category is containers and packaging recycled closed-loop into bottles and jars; it does not cover flat/plate glass, windows, mirrors, or glass in durable goods.

The steel-scrap factor is a provisional literature benchmark: Broadbent (2016) reports 1.5 kg CO₂-e saved per kg of end-of-life steel scrap recycled under a Worldsteel closed-material-loop methodology. Per the demo assumption, it is applied to all generic steel listings without a per-listing confirmation; this assumes the listed mass is end-of-life scrap recycled closed-loop into new steel and may overstate benefit when that assumption does not hold. Detailed system-boundary stages, geography, scrap grade/yield, and transport assumptions could not be verified from the accessible abstract. Steel is therefore an indicative scrap-recycling benchmark, not a verified generic steel-production factor. Heat and water remain unsupported.

Listings in the generic glass, plastic, and paper categories use the corresponding WARM category-average factor without an additional confirmation prompt. These are indicative category averages: glass is specifically container/packaging glass recycled closed-loop into bottles and jars, plastics represent WARM's 40% HDPE/60% PET mixture, and paper represents WARM's general mixed-paper composition.

Sources:

- [EPA WARM Version 16 and version history](https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model), released December 2023; [model workbook](https://www.epa.gov/system/files/documents/2023-12/warm_v16.xls).
- [EPA WARM Version 16 Containers, Packaging, and Non-Durable Goods Materials documentation](https://www.epa.gov/system/files/documents/2023-12/warm_containers_packaging_and_non-durable_goods_materials_v16_dec.pdf).
- [EPA WARM Version 16 Management Practices documentation](https://www.epa.gov/system/files/documents/2024-01/warm_management_practices_v16_dec.pdf).
- Broadbent, Clare (2016), [“Steel’s recyclability: demonstrating the benefits of recycling steel to achieve a circular economy”](https://doi.org/10.1007/s11367-016-1081-1), *The International Journal of Life Cycle Assessment*, 21(11), 1658–1665.

### Checking for WARM factor updates

The app loads its local factor data from `src/data/emission-factors.json`; normal application use does not contact the source websites. To check the official EPA version index and extract candidate WARM factors:

```sh
python -m pip install -r requirements-emissions.txt
python scripts/update_emission_factors.py
```

The updater uses Python's standard library for HTTPS retrieval and `xlrd` to read EPA's legacy `.xls` workbook. It identifies the workbook version, recycling column, and material rows from workbook contents, validates units and signs, and compares the source workbook hash, version, cell locations, and factor values with the currently used factors. It writes timestamped candidate JSON and a human-readable `.diff` under `data/candidates/`. These are unapproved review artifacts; the script never writes or promotes factors into the app's JSON file. The steel factor is not extracted or modified.

For offline tests, install `requirements-emissions-test.txt` (which adds test-only `xlwt` to create small synthetic `.xls` fixtures) and run:

```sh
python -m unittest discover -s tests -v
```

If the workbook layout changes, a required row or unit check fails, or the source cannot be retrieved, the updater reports the failure and writes no candidate factor JSON. A local workbook can be checked without network access by passing `--workbook /path/to/warm.xls`; use `--source-url` only when that local file's official EPA URL is known. All candidate values require human review against the matching official materials documentation before any future promotion.

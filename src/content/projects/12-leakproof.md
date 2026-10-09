---
title: "Leakproof"
slug: "leakproof"
summary: "The same fraud model built carelessly and point-in-time correct, then both scored on live stream features. The careless one lost half its PR-AUC."
order: 12
started: 2026-10-08
stack:
  - "LightGBM"
  - "Redpanda"
  - "Redis"
  - "DuckDB"
  - "FastAPI"
  - "Streamlit"
  - "Docker"
  - "Python"
kind: personal
repo: "https://github.com/RahimMahat/leakproof"
throughput: "The last 15% of transactions by time — 88,581 rows over 30.8 days — replayed through Redpanda and Redis, where all 14 streamed features matched the offline ones on every row, largest difference 1.8e-12"
latency: "POST /score at p50 2.8 ms, p95 4.3 ms, p99 5.9 ms, down from 121 ms. The careless model scored 0.999 offline and 0.901 live; the honest one scored 0.954 and held at 0.947"
broke: "Label timing is its own leak and it does not look like one. Point-in-time features with labels assumed known a second after each transaction scored 0.981 on validation; the same features with a realistic confirmation delay scored 0.954. Nothing about the feature timestamps was wrong — the labels were simply from the future. Parity between the offline and online paths turned out to need an ordering rule rather than matching formulas: a label arriving in the same second as a transaction has to be applied first in both, and a transaction must not see itself. And the first scoring service took 121 ms a request, of which Redis was 1.8 ms and the model under 1 ms."
fixed: "Every feature is defined once in a spec that both paths read — DuckDB window functions offline, Redis sorted sets fed by Redpanda online — and transactions and label arrivals share one ordered single-partition topic, so their relative order is a property of the data rather than of the consumer. Streaming the whole holdout period through the real containers, all 14 features matched on all 88,581 rows. A test moves future rows and fails if any past feature changes. The 121 ms turned out to be a one-row pandas DataFrame built per request; a plain-array scorer brought it to 2.8 ms with identical scores."
failed: false
---

**The problem.** A fraud model that scores 0.999 offline can be a 0.90 model in
production, and the gap is made by ordinary habits rather than exotic bugs — a
random split, aggregates computed over the whole dataset, a per-card fraud rate
that has read every label including the one being predicted. That much is folk
knowledge. What I could not find was the number: how much of the score is the
leak, and what the leak costs once the model is making decisions. So the point
of this was to measure it end to end rather than assert it.

**The architecture.** The same LightGBM model is built twice on the IEEE-CIS
data. The careless pipeline adds one bad habit at a time, with the model and its
settings held fixed, so the inflation can be attributed rather than just
observed: 0.910 on a time split, 0.970 once the split goes random, 0.974 with
card aggregates over every row, 0.999 once the card fraud rate has seen every
label. The honest pipeline defines every feature once in a spec, and a
transaction's features use only that card's earlier transactions and only labels
that had arrived by then — the model trains only on rows whose label existed on
the training date. Then both are scored on a holdout month using features the
live path actually produced: transactions and label arrivals replayed through
Redpanda, per-card state in Redis, a FastAPI service that reads the state,
scores, and records the transaction. The offline and online halves read one
spec, which is the only reason the comparison means anything.

**The interesting decision.** Writing the careless pipeline deliberately, and
incrementally, instead of only building the good one. It is the expensive half
of the project and it produces no deployable artefact, but without it the
headline is one model's score against another model's score, which proves
nothing about leakage in particular. The incremental version is what turns "the
score was inflated" into a ledger of which habit bought how much. The result I
did not expect is that the honest model is also the better model live — 0.947
against 0.901 — so leakage does not merely flatter the score, it produces a
model that leans on features it will never be given. In money, on a $5 review
cost, the careless model promised $264 per thousand transactions and cost
$4,304, because its threshold was tuned on scores it could not reproduce.
Choosing the threshold by cost rather than by accuracy halved the month's bill,
$147k against $300k, and landed within 1.3% of the best threshold in hindsight.

Where I would push back on my own results: this is one dataset, one seed and one
training date, with no intervals reported, and the label delay is simulated and
independent of everything else — real chargebacks that confirm quickly probably
differ from the ones that confirm late. The latency numbers are one client on a
laptop against a single-threaded consumer on one partition, which says nothing
about concurrent load. The direction of the effect I will defend; the second
decimal place I will not.

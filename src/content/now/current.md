---
updated: 2026-10-09
building:
  - "lossproof — one CDC stream into two Iceberg lakes, faulted on purpose, then every row reconciled against the source"
  - "leakproof — the same fraud model built carelessly and point-in-time correct, both scored on features a live stream produced"
  - "this site, still — a terminal you can query instead of a portfolio you scroll"
reading:
  - "Designing Data-Intensive Applications — the stream processing chapters, again"
  - "the Iceberg and DuckDB docs, mostly to argue with myself about table formats"
learning:
  - "AWS Certified Solutions Architect – Associate, in progress"
---

Three projects in six weeks have turned into one method, mostly by accident:
build the careless version on purpose, measure exactly what it costs, and only
then build the one that is correct. `warehouse-gpt` put a number on what context
is worth to a text-to-SQL agent, `leakproof` on what leakage is worth to a fraud
model, `lossproof` on what an ordinary week costs a change-data-capture lake.

The through-line is the same conviction four years of moving data left me with —
the hard part of applied AI is not the model, it is getting the right data to the
right place, on time, in a shape someone can trust. What has changed is that I
would now rather count that than assert it, which is why each of these ships the
number that argues against it too.

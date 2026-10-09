---
title: "Lossproof"
slug: "lossproof"
summary: "The same CDC pipeline built carelessly and correctly, then faulted. With every fault in one run, 69% of the careless lake was wrong. The correct one matched."
hook: "69% of the careless lake wrong; the correct one matched"
order: 13
started: 2026-10-09
stack:
  - "PostgreSQL"
  - "Debezium"
  - "Apache Kafka"
  - "Apache Iceberg"
  - "Terraform"
  - "AWS Step Functions"
  - "AWS Lambda"
  - "dbt"
  - "Amazon Athena"
  - "AWS Glue"
  - "Amazon S3"
  - "Python"
kind: personal
repo: "https://github.com/RahimMahat/lossproof"
throughput: "100,000 source transactions and about 320,000 messages through one stream into two lakes, then every source row compared with every lake row by key: 53,785 of 77,962 wrong for the careless consumer, 0 of 77,962 for the correct one"
latency: "A nightly Step Functions run compacts each table from 15 data files to one, reconciles 8,229 rows to zero differences, then builds 7 dbt models and 10 tests — and fails on LakeDiverged before building a single mart if one row disagrees"
broke: "My first crash test proved nothing: the careless consumer survived eight kills with zero wrong rows, because every kill had landed while it was idle. Then a failed run looked like a drained one — the emulated Kafka ran out of room for new topics, Debezium's task died, the stream went quiet, and the harness took quiet for finished and scored both consumers 16,328 wrong of 16,323. Re-creating a Kafka Connect connector under a name it had used before made it resume from a position in a replication slot that no longer existed. The first compaction task crashed when the consumer committed ahead of it. And dbt registered two marts under the same Glue location, so each Athena table returned the other's rows as well."
fixed: "The harness now kills continuously while the workload runs, because a kill only matters under load; it deletes old topics and checks the connector is alive before it trusts a number; and connector and slot names carry the time, so a reset cannot resume into a dead slot. For the two writers, Iceberg and the catalogue both refuse the stale commit, which is the safe outcome — but each writer needed a plan for losing, so compaction skips the table and the consumer re-applies its batch against the table as it now is. Deletes are kept as tombstones rather than removed, which gives a late change something to compare against and makes the snapshot purge one rule: anything older than the snapshot is gone. Each mart got its own folder, and a dbt test compares the dimension's current versions against the lake, since the reconciler does not reach that far."
failed: false
---

**The problem.** A change-data-capture pipeline that matches its source on a
quiet day can be badly wrong after an ordinary week — a restart, a schema
change, a connector someone had to rebuild. Everyone who has run one knows this.
What I wanted was the count: which faults actually corrupt a lake, by how much,
and which ones turn out to be harmless despite the reputation. So the measurement
had to come first and be trusted before anything was judged by it.

**The architecture.** A seeded generator runs an order workload against Postgres
— inserts, updates, deletes, cascades — and Debezium turns the write-ahead log
into Kafka topics. Two consumers read the same stream into separate Iceberg
tables. The careless one auto-commits offsets on a timer, applies changes in
arrival order, writes each batch as two commits, holds its schema fixed and logs
errors past. The correct one writes its offsets into the same Iceberg commit as
the rows, merges by key and Postgres log position, keeps deletes as tombstones,
widens the table when a column appears, and sends junk to a dead-letter queue. A
reconciler reduces every source row and every lake row to a canonical string and
compares them by primary key — built third, before the correct consumer existed,
because it is the thing everything else is scored by. A chaos harness then runs
seeded scenarios against both at once. All of it sits on emulated AWS created by
Terraform, with a nightly Step Functions workflow that compacts, reconciles, and
only then builds dbt marts.

**The interesting decision.** Building the reconciler before the consumer it was
meant to vindicate. It is the inversion of the obvious order and it is the whole
reason the numbers mean anything: a reconciler written after the good consumer
is a reconciler written by someone who knows what the good consumer does, and it
will quietly agree with it. Writing it first meant it had only one consumer to
describe and no reason to flatter it — and it caught the embarrassing ones,
including a run where both consumers scored 16,328 wrong out of 16,323 rows,
which is impossible and was the harness mistaking a dead connector for a drained
stream. The findings I did not expect run in both directions. Redelivering every
message from the start, twice, did no damage at all, even to the careless
consumer: replaying a contiguous stretch of changes in order ends in the same
state. Meanwhile one `ALTER TABLE` was the single most expensive fault in the
set — 8,319 wrong rows — because widening a column made the writes fail after
the batch's first commit had already deleted the old versions.

The result I find most uncomfortable is that crash damage is luck. The careless
consumer ended three identical runs on different seeds with 504, 439 and 0 wrong
rows, which means a pipeline built this way can pass a crash test and still be
unsafe. That is also the limit of this project as it stands: every scenario is a
single seed, the AWS is an emulator rather than the real thing, and the
reconciler needs a drained stream, so it cannot yet be pointed at a live source.

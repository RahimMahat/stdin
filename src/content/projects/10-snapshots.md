---
title: "Daily snapshots"
slug: "snapshots"
summary: "Nine Athena queries that turn change-record tables into one current row per key, once a day, as partitioned Parquet."
order: 10
started: 2025-10-14
stack:
  - "Amazon Athena"
  - "SQL"
  - "Jinja"
  - "AWS Step Functions"
  - "AWS Lambda"
  - "Amazon S3"
  - "Parquet"
  - "Terraform"
throughput: "9 snapshot tables, deployed to two environments, on the platform's existing query runner"
latency: "A consumer reads one day's de-duplicated partition in place of the full change history"
broke: "\"One row per key\" is entirely about the key. For several tables my first choice of partition columns for the window was wrong and had to be revised, and one table's partitioning took a second pass. One snapshot also disagreed with its source about a column's type."
fixed: "Worked the keys out table by table and corrected the window partitions until each snapshot held one row per record. A column added or retyped in a source table is now changed in its snapshot in the same piece of work."
failed: false
---

**The problem.** Incremental extraction is efficient and awkward. Every change
to a purchase order or a quality notification lands as another row, including
the change that deletes it. The table is a history. Almost nobody wants the
history. They want the state of things this morning, and each consumer was left
to write its own version of "latest row per key".

**The architecture.** Each snapshot is a templated Athena UNLOAD. A window
function ranks the rows for each business key, the query keeps the first, drops
keys whose latest change is a deletion, and writes the result as Parquet under
a year, month and day partition. The platform's query runner, a Step Function
with a pre-processing Lambda and an execution Lambda, resolves the date,
renders the template and runs it on a schedule; a config file says which
template runs in which environment. Each output is a catalog table in
Terraform. I wrote the nine templates and their config. The runner was already
there, which was the point.

**The interesting decision.** De-duplicating at read time, in a snapshot,
instead of at write time, in the ingestion job. I had built a write-time
version earlier, inside the job that lands the data, and it was taken back out.
The snapshot is the better home for it. Removing duplicates on the way in means
the ingestion job has to hold an opinion about every table's business key, and
it discards history someone may want later. A snapshot leaves the raw table
alone and puts the definition of "current" in one reviewed query per table.

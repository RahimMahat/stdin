---
title: "Precomputed snapshots"
slug: "snapshots"
summary: "A Step Function and two Lambdas that precompute daily snapshots of the most-queried tables, so an analyst reading today stops scanning years."
order: 5
started: 2025-10-01
stack:
  - "AWS Step Functions"
  - "AWS Lambda"
  - "Amazon Athena"
  - "Python"
  - "Jinja"
  - "Amazon SNS"
  - "Terraform"
  - "Amazon S3"
  - "Denodo"
throughput: "Around 50 of 300+ tables — the largest of them in the billions of rows — snapshotted once a day"
latency: "Timeouts and concurrency pressure on the hardest-hit tables stopped; the common query reads one day instead of the full history"
broke: "A snapshot went stale without saying so. The run had succeeded — the pre-processor resolved a latest date before the upstream load for that day had finished landing, so the snapshot was built on a partial day and published looking exactly like a good one. Analysts read it for more than it was worth, and nothing in the pipeline had an opinion about that."
fixed: "The date a snapshot is built for is no longer whatever the calendar says: the pre-processor checks the upstream partition is complete before it resolves a watermark, and a run that cannot establish one fails loudly instead of publishing a thin table. Either Lambda failing raises an SNS topic to the data engineering list."
pipeline:
  nodes:
    - { id: source, label: "source tables", note: "~50 of 300+", lane: 0, cmd: "cat projects/sap" }
    - { id: pre, label: "pre-process", note: "latest date", lane: 1 }
    - { id: ctas, label: "ctas lambda", note: "jinja", lane: 2 }
    - { id: snapshot, label: "s3 snapshot", note: "parquet", lane: 3 }
    - { id: sns, label: "sns alert", note: "the DE list", lane: 3 }
    - { id: glue, label: "glue table", note: "terraform", lane: 4 }
    - { id: athena, label: "athena", lane: 5 }
    - { id: denodo, label: "denodo", lane: 5, cmd: "cat projects/warehouse" }
  edges:
    - { from: source, to: pre, label: "daily" }
    - { from: pre, to: ctas, label: "on success" }
    - { from: ctas, to: snapshot, label: "athena" }
    - { from: ctas, to: sns, label: "on failure" }
    - { from: snapshot, to: glue }
    - { from: glue, to: athena }
    - { from: glue, to: denodo }
failed: false
---

**The problem.** Ingestion and modelling both worked. What did not work was
fifty tables being read the same way at the same time every morning. The tables
analysts hit hardest are also the biggest — the largest run to billions of rows —
and the query they run is almost always the same shape: the latest data,
filtered. Answering that from the full table means scanning years of history to
return a day of it, once per analyst, every morning. Queries timed out,
concurrency limits were reached, cost climbed, and everything else sharing the
warehouse got slower for reasons that had nothing to do with it.

**The architecture.** Athena does the work; the Lambdas decide what work to ask
for. A daily Step Function runs a pre-processor that resolves the parameters the
query needs — chiefly which date is actually the latest complete one — and on
success hands off to a second Lambda, which renders a Jinja-templated CTAS,
submits it to Athena, waits on it, and writes the result as Parquet to the
snapshot bucket. Terraform catalogues the output as a Glue table, so a snapshot
is queried exactly the way its source is: Athena for engineers, Denodo for
analysts, no new access path for anyone to learn. Success logs metrics; failure
publishes to an SNS topic that mails the data engineering list.

**The interesting decision.** Splitting one job into two Lambdas behind a state
machine. One Lambda would have been simpler and would have worked. The split is
there because resolving a watermark and running a templated CTAS are different
jobs with different failure modes — the first is a question about whether
upstream is ready, the second about whether a query is correct — and separating
them means each is reusable by something else and each fails for a legible
reason. The cost is a state machine to maintain and a handoff that can itself go
wrong. The honest part is what happened to the alerting hung off it: failures
mail a distribution list, and I now have an inbox rule for that list, which is
most of what you need to know about how well it works. Splitting the compute was
right. Treating an alert as the same thing as somebody noticing was not.

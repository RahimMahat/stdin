---
title: "The landing zone"
slug: "ingest"
summary: "The ingestion layer of a multi-source AWS platform: Glue and PySpark for batch, and one contract every source meets before anything downstream reads it."
hook: "50% lower end-to-end processing time"
order: 1
started: 2022-10-01
stack:
  - "AWS Glue"
  - "PySpark"
  - "AWS Lambda"
  - "Amazon SQS"
  - "API Gateway"
  - "Amazon S3"
  - "Jenkins"
throughput: "Several upstream systems on one contract — batch through Glue, and the platform's first event path behind the same landing zone"
latency: "50% lower end-to-end processing time than the pipeline it replaced"
broke: "The real-time path failed in ways the batch path never did. A downstream service being slow or briefly unavailable did not just delay a message — it left records half-applied, so the failure showed up later as inconsistent data rather than as an error anyone was paged for."
fixed: "Built a real explicit error-handling layer across the streaming path: retries with backoff, dead-letter queues on the SQS consumers, and failures surfaced as failures instead of as silence. System failures and data inconsistencies dropped by around 25%."
failed: false
---

**The problem.** The platform pulled from several upstream systems with nothing
in common — different shapes, different schedules, different definitions of
"late". Every new source meant another bespoke script, and because each one
handled its own failures, none of them handled failures well. The batch jobs
were fine. The near-real-time paths were where things quietly went wrong.

**The architecture.** Everything lands in S3 first, raw and unmodified, before
anything is allowed to interpret it. Batch sources come in through Glue jobs
written in PySpark, scheduled and gated by Jenkins — that is the bulk of it, and
the part the contract was really written for. Event sources arrive over API
Gateway into Lambda and are buffered through SQS; that was the platform's first
event path, and `cat projects/events` is the one that eventually replaced it.
The boundary that matters is the landing zone: upstream of it, anything can be
true; downstream of it, the shape is guaranteed, which is what makes the
transformation layer possible to reason about at all.

**The interesting decision.** Buffering the event path through SQS rather than
writing straight through from Lambda. It costs a hop and it costs latency, and
for a while it looked like unnecessary machinery. It stopped being unnecessary
the first time a downstream dependency went slow instead of going down — the
queue absorbed it, and the alternative would have been partial writes we would
have found out about days later from a business user. The general lesson I keep
re-learning: the failure mode you should design for is not "it broke", it's
"it half-worked and nobody noticed."

Two years later I built the analytics event API and took the Lambda back out of
that hop, wiring the gateway straight to the queue. Both decisions were right
when they were made, and the difference between them is the honest version of
what I learned: the buffer was the part worth keeping, the function sitting in
front of it was not.

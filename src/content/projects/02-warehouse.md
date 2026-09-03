---
title: "Warehouse and serving layer"
slug: "warehouse"
summary: "The serving layer — Redshift models, a Denodo virtualization tier, and the QuickSight dashboards the business actually opens on a Monday morning."
order: 2
started: 2023-03-01
stack:
  - "Amazon Redshift"
  - "Amazon S3"
  - "Denodo"
  - "Amazon QuickSight"
  - "SQL"
throughput: "TODO — models, tables or TB scanned per day"
latency: "35% faster query execution after performance tuning"
broke: "TODO — the failure that actually happened here. What broke, how you found out, and how long it was wrong before anyone noticed."
fixed: "TODO — what you changed, and what you would do differently now."
failed: false
---

**The problem.** Ingestion solved getting data in. It did not solve anyone being
able to use it. Analysts were querying close to raw tables, which meant every
dashboard encoded its own quiet interpretation of what a metric meant, and two
dashboards could disagree without either being wrong. Query cost and query time
were both climbing for reasons nobody could point at.

**The architecture.** Curated data lands in Redshift as modelled tables rather
than as mirrors of the source systems. Denodo sits above that as a
virtualization layer, so consumers hit one consistent surface instead of
learning which physical table is the current one. QuickSight reads from there.
Storage stays tiered across S3 and Redshift by how often something is actually
touched, which is where most of the cost reduction came from — roughly 30% lower
storage cost, without deleting anything anyone still needed.

**The interesting decision.** Putting a virtualization tier in front of the
warehouse instead of just publishing more views. Views would have been simpler
and one fewer system to run. The argument for Denodo was that it decouples what
consumers depend on from what the platform is physically doing, so a migration
underneath does not become a coordination problem with every dashboard owner in
the company. That is a bet on future change being likely — a reasonable engineer
could have taken the other side of it and been right for a couple of years.

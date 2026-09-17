---
title: "Scheduled SAP ingestion"
slug: "sap"
summary: "Over 400 AppFlow flows pulling SAP into S3, provisioned from one boto3 module, transformed on a schedule rather than on every event."
order: 4
started: 2024-04-01
stack:
  - "AWS AppFlow"
  - "Python"
  - "AWS Glue"
  - "Amazon S3"
  - "AWS CDK"
  - "Terraform"
  - "Parquet"
  - "Amazon Athena"
  - "Denodo"
throughput: "400+ AppFlow flows across five schedule tiers — every twenty minutes through to weekly — landing on the order of 100k rows and single-digit GB a day"
latency: "No flow created by hand: adding a SAP service is a config entry, not a console session"
broke: "A controlled-deployment feature meant to route flows to the right environment by SAP client id deleted a production flow instead. It was a GB-a-day source, the pipeline reported nothing wrong, and for two to three days everything downstream looked healthy. The failure surfaced as business users noticing their numbers had stopped moving — not as an alert."
fixed: "Gave the flows a filtered read so a gap can be closed after the fact: re-query from a last_updated watermark and backfill, which is how the missing days were recovered. Environment routing now asserts that a client id belongs to the environment it is being applied to, and a flow missing from config is reported rather than deleted implicitly."
pipeline:
  nodes:
    - { id: sap, label: "SAP services", lane: 0 }
    - { id: appflow, label: "AppFlow", note: "400+ flows", lane: 1 }
    - { id: raw, label: "s3 raw", note: "archived ~12mo", lane: 2 }
    - { id: glue, label: "glue job", note: "5 tiers", lane: 3 }
    - { id: staging, label: "s3 staging", note: "parquet", lane: 4 }
    - { id: athena, label: "athena", lane: 5 }
    - { id: denodo, label: "denodo", lane: 5, cmd: "cat projects/warehouse" }
  edges:
    - { from: sap, to: appflow }
    - { from: appflow, to: raw }
    - { from: raw, to: glue, label: "scheduled" }
    - { from: glue, to: staging }
    - { from: staging, to: athena }
    - { from: staging, to: denodo }
failed: false
---

**The problem.** A DataStage to Netezza to Cognos stack was being retired and the
SAP data underneath it had to land in AWS. SAP does not present as one source:
it is services and sub-services, hundreds of them, each with its own refresh
expectation, and the ones finance cares about are not the ones supply chain
cares about. Assembling that by hand was never on the table — four hundred flows
built in a console is four hundred things that exist only as somebody's memory
of having clicked them.

**The architecture.** Every service and sub-service pair is one AppFlow flow,
and no flow is authored by hand: a Python module over the AppFlow client takes
the pair and produces the flow — connector profile, schedule, load type, whether
it is full or incremental, destination prefix — from configuration, so adding a
source is a config entry rather than a session in the console. Flows land raw in
S3 and nothing interprets them there. Scheduled Glue jobs pick raw up per tier,
do the unglamorous work — date extraction, type coercion, Parquet out — and
write staging; raw stays under a lifecycle policy for roughly twelve months, so
any transform can be replayed against what actually arrived rather than against
what we believe arrived. Glue tables over both buckets are Terraform,
deliberately apart from the CDK that deploys the provisioner and the transform
jobs: the catalogue holds no logic, changes on a different clock, and has no
business being coupled to the code that fills it. Athena for engineers, Denodo
for everyone else.

**The interesting decision.** Not making the transform event-driven. Firing on
object arrival is the default answer and usually the right one — lower latency,
nothing polling, no schedule to keep aligned with upstream. At four hundred flows
it inverts. Each flow lands on its own cadence into its own prefix, so arrivals
never batch; they come as a long tail of single-object events, each one starting
a Glue job to process a fraction of a partition. The cost of that is real and
the latency it buys is worth nothing, because nobody downstream reads SAP in the
second it lands — they read it in the morning. So the transform runs per tier on
a schedule and processes whole partitions. Event-driven was a better default and
a worse fit, and telling those two apart is most of the job.

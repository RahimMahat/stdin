---
title: "SAP object onboarding"
slug: "sap"
summary: "Ninety SAP services taken from \"it exists in SAP\" to \"it is a partitioned table in Athena\", through a fleet of 400+ AppFlow flows and a parameterised Glue job."
order: 4
started: 2024-04-26
stack:
  - "AWS AppFlow"
  - "AWS Glue"
  - "Python"
  - "pandas"
  - "Amazon S3"
  - "Parquet"
  - "Terraform"
  - "AWS CDK"
  - "Amazon Athena"
throughput: "90 SAP objects onboarded and 140+ source-to-lake mappings added, in a fleet of 400+ flows on schedules from every twenty minutes to weekly"
latency: "Delta-enabled feeds moved from one extraction a day to one an hour, with hour-level partitions to match"
broke: "The mapping in the Glue job is one large dictionary, and several people add to it every week. Merge after merge, it had quietly collected repeated keys: 428 entries for 254 distinct datasets. A dictionary keeps the last definition and says nothing about the others, so which version of a dataset's transform ran depended on where it happened to sit in the file. Some of the duplicates disagreed with each other."
fixed: "Found the duplicates, resolved each conflict by hand, and removed the rest: 428 entries down to 254, and a third of the file gone. The partition parsing that broke when client identifiers changed shape got the same treatment: one named pattern, defined once and reused by every mapping."
failed: false
---

**The problem.** SAP does not arrive as a source. It arrives as hundreds of
OData services, each with its own keys, its own refresh expectation and its own
surprises about what a boolean looks like. Every one the business asks for has
to become the same three things: a flow that extracts it, a transform that
types and partitions it, and a catalog table someone can query.

**The architecture.** A flow is a config entry: service, full or incremental,
schedule, which SAP clients it applies to. Flows land raw in S3. One Glue job,
run hourly, walks a mapping of source prefix to destination, with per-dataset
column maps and type conversions, and writes Parquet partitioned by client,
year, month, day and hour. The catalog table is Terraform. I did not design
that pattern; I inherited it and became its heaviest user, adding 90 of the
flows and more than half of the mappings in the job, across purchasing, sales,
manufacturing, warehouse management, finance and quality.

**The interesting decision.** Carrying the SAP environment in the client
identifier. A QA client and a production client can share the same three-digit
client number, and the pipeline had assumed an identifier was just that number.
I changed the identifier to carry both the environment and the number, threaded
it through flow names, S3 paths and the job's partition parsing, and made every
flow declare which clients it runs for. It touched all 400-odd flows. The
alternative was a second copy of everything for QA, which is how environments
drift.

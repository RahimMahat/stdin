---
title: "Retail point-of-sale ETL"
slug: "retail-pos"
summary: "Twenty-nine Glue processors that turn fourteen retail partners' sales and inventory files into one Redshift star schema, a feed at a time."
order: 3
started: 2023-06-30
stack:
  - "AWS Glue"
  - "PySpark"
  - "Amazon Redshift"
  - "Amazon S3"
  - "Python"
  - "SQL"
  - "pytest"
throughput: "29 processors (13 dimension, 16 fact) across 14 retail partner feeds, each with its own unit tests"
latency: "A new retailer is a processor, a config entry and a test file, not a new pipeline"
broke: "Source files changed shape. One retailer moved to a new raw file format, another remapped its columns, and a preprocessing step that two Canadian feeds depended on was retired. Values that had always parsed stopped parsing: negative units, padded model numbers, store numbers in a new position."
fixed: "Rebuilt the affected processors against the new layouts and removed the preprocessing dependency, so each processor reads what the retailer actually sends. Parsing got more explicit: regex extraction that accepts negatives, trimming on key fields, explicit casts in place of inferred types. Each fix came with a test using the new file shape."
failed: false
---

**The problem.** Every retailer reports sales differently. One sends store-level
files, another sends online orders with a different idea of what a week is, a
third arrives through a data provider with its own column names and its own way
of writing a negative number. The business wanted one answer to "what sold,
where, last week" across all of them, and the warehouse wanted one shape.

**The architecture.** Each feed gets a processor class: it takes the raw file as
a Glue DynamicFrame, maps and cleans it, and hands back rows in the shape of a
shared fact or dimension table in Redshift. Dimension processors derive two
keys from the data itself: a durable key that identifies the product or store
for good, and a version key that changes when its description does. The shared
load uses that pair to keep history as an SCD Type 2 dimension. A configurator
registers every feed against its processor, so the job itself does not change
when a retailer is added. Every processor ships with a unit-test file built on
that retailer's quirks.

**The interesting decision.** One class per feed instead of one configurable
processor for all of them. A single config-driven transform looks cleaner and
is tempting for the first few retailers. A few more and it becomes a config
language with conditionals in it. Small classes on a common base keep each
retailer's oddities in a file with that retailer's name on it, which is where
the next person will look. I added base classes for the cases that really were
shared, such as inventory facts and one retailer's Canadian feeds, and the
inventory base was later extended by other engineers' processors.

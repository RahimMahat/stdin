---
title: "Supply-planning ingestion"
slug: "planning"
summary: "Ten scheduled Glue jobs that check planning-system extracts against a declared schema and land them as partitioned tables."
order: 7
started: 2024-06-05
stack:
  - "AWS Glue"
  - "Python"
  - "pandas"
  - "pandera"
  - "Terraform"
  - "Amazon S3"
  - "Parquet"
  - "Amazon Athena"
throughput: "10 Glue jobs with catalog tables, on daily, weekday and weekly schedules, in a family of 32"
latency: "A file that cannot be processed fails the run and names itself"
broke: "Validity dates. Several datasets carry valid-from and valid-to columns as strings, in more than one format, and \"no end date\" is written as the last day of the year 9999. That date does not fit in a pandas timestamp, whose range ends in 2262, so the obvious conversion either fails or loses the very value that means \"still valid\"."
fixed: "Wrote one conversion helper that normalises both formats and returns plain dates, which hold the year 9999 comfortably and are written to Parquet as a date type. Applied it to every validity column, changed the catalog types to match, and covered the helper with unit tests."
failed: false
---

**The problem.** The planning system exports files: forecasts, production
sources, locations, resources, each on its own calendar. Some arrive daily,
some only on weekdays, some once a week. Planners compare them against actuals
from SAP, so they had to land in the same lake, under the same partitions, with
types that join.

**The architecture.** Each dataset is a config entry with a destination and a
declared schema: every expected column and its type. A Glue job per dataset
reads the day's file, coerces it to that schema, adds audit columns, and writes
Parquet partitioned by year, month and day. If any file fails, the run fails
and says which. The jobs, their schedules and their catalog tables are
Terraform, one module each, on Glue 5.0. I added ten of the datasets end to end
along with the job definitions that run them.

**The interesting decision.** A declared schema per dataset, with the run
failing when a file does not fit. The tolerant option is to land whatever
arrives and let consumers cope. With planning data that means a renamed column
shows up as a blank in someone's report, and "is the plan wrong or is the data
wrong" gets asked in a meeting. A schema check costs a failed job now and then.
A failed job has an owner and a log line.

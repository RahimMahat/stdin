---
title: "The data catalog as code"
slug: "catalog"
summary: "More than 150 partitioned Glue catalog tables and 5,000 columns declared in Terraform, a third of the platform's catalog."
order: 6
started: 2024-06-05
stack:
  - "Terraform"
  - "AWS Glue Data Catalog"
  - "Amazon Athena"
  - "Amazon S3"
  - "Parquet"
  - "HCL"
throughput: "154 tables and 5,000+ columns across 12 SAP functional areas; 166 Terraform modules in all, the most of any contributor"
latency: "A table is reviewable in a pull request before it exists, and identical in every environment after"
broke: "Types. SAP sends booleans as flags, timestamps as strings, and numerics that are sometimes integers. A table would deploy cleanly and then fail in Athena the first time someone selected the wrong column, because the catalog said boolean and the Parquet said string."
fixed: "Made Athena the test. New tables get queried there before the work is called done, and the fix goes where it belongs: a conversion in the transform when the data is wrong, a type change in Terraform when the declaration is. The habit is unglamorous and it is why the tables are boring to use."
failed: false
---

**The problem.** A data lake without a catalog is a bucket. Every SAP object
landing in S3 needed a table definition before anyone could query it, and the
definition had to match what the transform actually wrote: same column names,
same types, same partitions. Get one type wrong and the table does not return
bad data, it returns an error, to an analyst, on a Monday.

**The architecture.** One Terraform module instance per table: database, name,
storage format, partition keys and the full column list with types and
descriptions taken from the SAP field definitions. Tables are grouped into
files by functional area, so purchasing lives with purchasing. Partition keys
come from shared locals, so all 150-odd tables agree on what a partition is.
The catalog deploys separately from the jobs that fill it.

**The interesting decision.** Schemas written out by hand, not inferred. That
was the platform's convention before I arrived and I came to agree with it.
Inference is free and it is right most of the time. The rest of the time it
decides a column of mostly-empty strings is a number, and the first you hear of
it is a broken dashboard. Declared schemas cost real typing, about four lines a
column, and in return the catalog says exactly what was reviewed. On a platform
where the same table feeds finance and operations, I would make that trade
again.

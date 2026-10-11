---
title: "Nightshift"
slug: "nightshift"
summary: "A receipt-extraction lake with an LLM as an ETL step and an agent on call, both measured. A 101-line script fixed 15 of 16 incidents. The agent fixed 11."
hook: "a 101-line runbook beat the on-call agent, 15 to 11"
order: 14
started: 2026-10-11
stack:
  - "AWS CDK"
  - "AWS Lambda"
  - "Amazon SQS"
  - "Amazon S3"
  - "Amazon API Gateway"
  - "AWS Glue Data Catalog"
  - "Amazon Athena"
  - "Amazon CloudWatch"
  - "Parquet"
  - "MCP"
  - "Docker"
  - "Python"
kind: personal
repo: "https://github.com/RahimMahat/nightshift"
throughput: "100 receipts from the CORD test split for each of three models, scored against the dataset's labels, then 16 injected incidents handled by four responders through one policy layer, each judged by a reconciler that compares the lake with a fault-free run"
latency: "Contracts and a repair loop removed 36% to 66% of wrong values for 24% to 35% more tokens, and 24% on a held-out split. On call, the scripted runbook got 15 of 16 right in a median 9 s; the agent got 11 in 37 s, and 9 without the runbook as text"
broke: "The emulator says yes and does nothing: its CloudFormation reported the Glue database, the bucket notification and a schedule as created, and created none of them. My scorer was wrong before the model was, punishing every model for skipping lines like \"Less Ice\" that the dataset labels as items. The free tier counted the whole output cap against its per-minute limit whatever the answer's length, my limiter kept reservations for refused requests, and the first evaluation took four times longer than it should have. The laptop slept for 27 minutes in the middle of an incident and the run looked like a stalled pipeline. The first agent pilot failed because of my tools and not the model: a redrive did not say what it had moved, timestamps came with no \"now\", and error counts included old errors. And the agent's first full run found three bugs in my harness that the scripted runbook had never reached, because the script only ever does things in the order I wrote."
fixed: "A spike tested every unproven part before the design depended on it, which is where the emulator's silent no-ops were caught and where Redshift and one incident type were dropped, because the emulator could not show them honestly. Only priced lines count in the scorer now, for every model, and the write-up says the rule was chosen after seeing the mismatches. The harness asks the machine to stay awake and a run can be resumed. For the pilot I changed the tools, not the prompt. The three harness bugs were fixed, every responder was run again, and both passes are reported. One of the three only appears on a stack with no history, which is exactly what CI builds, so it would have failed on the first push."
failed: false
---

**The problem.** Two things get said about LLMs and data pipelines: that a model
can be an ETL step, and that an agent can be the engineer on call. Both are
usually shown as a demo, and a demo answers neither question that matters. For
extraction: how many of the values the model writes are wrong, and how many of
those can a check catch before they reach the lake? For operations: when the
pipeline breaks, how often does an agent put it right, compared with the
cheapest alternative I could write? I wanted to count both.

**The architecture.** The lake is AWS CDK deployed to a local emulator: API
Gateway to an ingest Lambda to S3, an SQS queue with a dead-letter queue behind
it, and an extract Lambda that writes Parquet, with Glue and Athena on top. A
document's id is a hash of its content and each document is one file named by
that id, so everything is safe to run twice. Extraction is one prompt, written
before any result, scored against the CORD dataset's labels; model calls are
recorded and replayed, so the pipeline is deterministic and needs no key in CI.
Around the model sit the contracts: a check that every extracted amount is a
number printed in the document, arithmetic checks, a retry that tells the model
what it broke, and a quarantine after two repairs. Around the pipeline sit a run
log, metrics, four alarms and a reconciler that compares the lake with a
fault-free run, document by document. Then the operations half: sixteen ways to
break the platform, a policy layer every action must pass — eight actions, none
of which deletes anything, each dry-run first — 101 lines of plain rules as a
scripted runbook, and last of all the agent, a tool-calling loop with no
framework whose tools are also served over MCP.

**The interesting decision.** Writing the incidents, the policy layer and the
scripted runbook before the agent existed. It is the same inversion as building
the reconciler first in `cat projects/lossproof`: the baseline has to exist
before the thing it judges, or the agent is graded against nothing. It is also
what produced the result. The script beat the agent, 15 of 16 against 11, and
against 9 when the agent was not given the runbook as text. Doing nothing got 1.
The agent's failures were not random: it restores a setting and stops as soon as
the alarm clears, leaving the rows a weaker model had already written in the
lake; it takes half-minute-old failures for a live outage; and twice it asked to
switch to a model that appears nowhere in the project, which the policy layer
refused. But the script's one failure is the agent's best case. When a source
renamed its fields, the script took real documents for junk and set five aside,
and the agent, in one run of three, read a file, saw a new format and escalated.
Rules are reliable on what their author thought of, and that is all.

The extraction half turned on a smaller surprise. More than nine in ten of the
wrong header amounts were one mistake, a thousands separator read as a decimal
point — `60.000` stored as 60 — and the arithmetic checks cannot see it, because
a receipt read that way is wrong by the same factor everywhere and its sums
still add up. The check that caught it asks only whether each number is printed
in the document. Four of the incidents also carried instructions planted for
the responder, to purge the queues, switch models or pause; none was followed,
by any responder, in any run.

Where I would push back on my own results: every responder ran each incident
once, so these are counts and not rates. I wrote both the incidents and the
script that handles them, so the script has already seen its own exam. And the
repair loop's 36% to 66% is the number I designed against; on a split I had not
looked at it was 24%, and that is the honest one.

---
title: "WarehouseGPT"
slug: "warehouse-gpt"
summary: "A text-to-SQL agent, and an ablation suite built to measure why agents like it fail. Context took the smallest model from 63.5% to 98.0%."
hook: "context took the smallest model from 63.5% to 98.0%"
order: 11
started: 2026-09-01
stack:
  - "LangGraph"
  - "dbt"
  - "DuckDB"
  - "PySpark"
  - "Delta Lake"
  - "LiteLLM"
  - "sqlglot"
  - "LanceDB"
  - "FastAPI"
  - "OpenTelemetry"
  - "Python"
kind: personal
repo: "https://github.com/RahimMahat/warehouse-gpt"
throughput: "Nine source tables and about 1.5M rows — 99,441 orders, 96,096 customers, 3,095 sellers — into a seven-table star schema behind 17 governed metrics, 31 Spark data-quality checks and 49 dbt tests, on a $0 budget"
latency: "Execution accuracy over 58 golden questions: 63.5% on raw DDL, 98.0% on the full context. Documentation alone was worth 10–19 points, and with everything switched on the smallest model beat both larger ones running on docs alone"
broke: "The evaluation lied to me in both directions, and I only found out because I read every single failure before publishing a number. Two were the comparator's fault: a percentage printed as `1.60` arrives as the float `1.6` and tripped my own rounding rule, and one extra `NULL` group row sank an otherwise correct answer. Two golden questions had drifted into near-copies of examples the agent can retrieve, so on the top rung it was being marked on its own study notes. And one rung of the ablation ladder had only been partly rebuilt, which made it look identical to the rung below it — because the questions still missing were exactly the ones where self-correction would have fired."
fixed: "Every one of those is now a test rather than a thing I remember. The comparator's rules each have unit tests including the negative cases; a disjointness test fails if a golden question drifts too close to a retrievable example, and the two that had are replaced; the report now drops any rung with incomplete coverage instead of estimating it, because a plausible number is worse than a missing one. The genuinely ambiguous question — an order delivered and then canceled — accepts either reading through an alternative reference, since the disagreement was real and mine to resolve rather than the agent's to guess."
failed: false
---

**The problem.** A "chat with your database" demo pastes the `CREATE TABLE`
statements into a prompt and lets the model write SQL. Against a real warehouse
that produces answers which run and are wrong. Revenue summed over `order_value`
quietly includes freight and canceled orders, when the business means item
prices on non-canceled ones. Counting `customer_id` overcounts people by several
thousand, because in this dataset the id is issued per order. Filters get
written as `'cancelled'` and `'São Paulo'` when the data says `'canceled'` and
`'SP'`. Year-over-year comparisons treat 2016 and late 2018 as whole years when
both are partial. Every one of those is something a new analyst is told in their
first week, and something dbt docs, a semantic layer and data-quality checks
already exist to write down. My hypothesis was that these agents mostly fail for
want of that context rather than for want of a bigger model — and that it was
worth measuring rather than asserting.

**The architecture.** Spark writes bronze and silver as Delta, with a small
declarative data-quality framework running 31 checks over them; dbt on DuckDB
reads those Delta tables in place through `delta_scan` and builds the gold star
schema. Delta is the contract between the two halves, which is the point: the
dbt project could move to Databricks by swapping the adapter. Above the
warehouse sit three things the agent reads — 17 metrics written in dbt's own
MetricFlow spec so `dbt parse` validates them, compiled into concrete SQL
recipes; a profiler that records exact column values, time coverage, and the
failing data-quality checks as caveats; and 22 verified question→SQL examples
indexed with embeddings that run on the CPU. The agent itself is an explicit
LangGraph state machine: assemble context, generate SQL, guard it with sqlglot,
execute it in a read-only DuckDB sandbox, repair on failure, answer. Those
context layers are the rungs of an ablation ladder, and the system prompt is
byte-identical at every rung, so any difference in the score is the context and
nothing else.

**The interesting decision.** Building the agent as a state machine rather than
a free-form tool loop, which cost me the thing everyone wants from an agent. A
ReAct-style loop is more flexible and would handle questions that need genuine
exploration; mine cannot. What it buys is that every capability is a switch the
evaluation can turn off, which is the only reason the ladder exists — you cannot
ablate a component that the model may or may not have decided to use on any
given run. The same instinct produced the one refusal I am most sure about: the
answer cache matches exact normalized questions only, because "revenue in 2017"
and "revenue in 2018" embed almost identically, and a semantic cache would serve
one for the other and be confidently, silently wrong about the year. Where I
would push back on my own results: 63.5% to 98.0% is a real effect and I will
defend it, but the two mid-table models landing on 82.7% apiece is not a
finding. On 52 answerable questions the confidence intervals are ±10–14 points,
and a number that precise invites more weight than it can carry.

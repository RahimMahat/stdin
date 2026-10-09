---
title: "Flow operations utility"
slug: "flowctl"
summary: "A Lambda that suspends, reactivates, reschedules and reports on a fleet of more than 400 AppFlow flows, so nobody does it one flow at a time in the console."
hook: "400+ flows suspended or rescheduled in one invocation"
order: 9
started: 2025-04-22
stack:
  - "AWS Lambda"
  - "AWS AppFlow"
  - "Python"
  - "boto3"
  - "Amazon SNS"
  - "AWS CDK"
  - "pytest"
throughput: "Four modes over a fleet of 400+ flows, selected by criteria, covered by 33 unit tests"
latency: "A bulk suspend or reactivate is one invocation with a filter"
broke: "The first version's criteria handling was looser than an operator would assume, and the modes had grown as a chain of conditions that was getting hard to read and easy to get wrong."
fixed: "Shipped a follow-up that made the AND behaviour explicit, added safeguards around the criteria keys, and turned the mode handling into an explicit match on a fixed set, with anything else refused. Tests cover each mode."
failed: false
---

**The problem.** Four hundred scheduled flows are fine until the source system
has a maintenance window, or a transport, or a bad night. Then somebody has to
suspend the affected flows, remember which ones they were, turn them back on,
and find the ones that errored in between. The console does this one flow at a
time.

**The architecture.** One Lambda, four modes. Suspend and reactivate take
criteria (name prefix, name suffix, status, schedule type), list the fleet,
filter it, and act on what matches. Report finds flows whose last run errored.
Update-cron takes a file of flow names and new schedules and applies them.
Every invocation ends by publishing what it changed and what it could not
change to an SNS topic, so the result of a bulk operation is a message, not a
guess. I took over a small on-demand function that did one of these things and
rewrote it; most of the handler and all 33 tests are mine.

**The interesting decision.** Selecting by criteria instead of by list. A list
of flow names is explicit, and it is out of date the day after someone adds a
flow. Criteria stay correct as the fleet grows, at the price of being able to
match more than you meant. So criteria combine with AND, never OR, each one
narrowing the selection, and the function reports exactly which flows it
touched.

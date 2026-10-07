---
title: "Analytics event API"
slug: "events"
summary: "A REST endpoint, a queue, two Lambdas and a Glue job that take usage events from client applications to a partitioned table, built alone in three phases."
order: 8
started: 2024-08-19
stack:
  - "Amazon API Gateway"
  - "AWS Lambda"
  - "Amazon SQS"
  - "AWS CDK"
  - "AWS Glue"
  - "Python"
  - "Amazon S3"
  - "OpenAPI"
  - "Terraform"
throughput: "One API, two queues, two Lambda functions and a daily Glue job, consuming batches of up to 1,000 messages per invocation"
latency: "Three phases shipped in under four months, from first endpoint to queryable table"
broke: "A message with an invalid timestamp could never succeed, and the processor reported it as a failure, so the queue would hand it back, and back. The queue's visibility timeout and the function's run time also did not agree at first, which is how a message reappears while it is still being processed."
fixed: "Malformed messages are logged and left out of the retry path. The timeouts were set to agree with each other: visibility timeout above the function timeout, a five-minute batching window, and a catch-all that fails only the message that caused the error. Anything that still fails five times lands in the dead-letter queue, where it can be looked at."
failed: false
---

**The problem.** Application teams wanted to send usage events to the data
platform, and the platform had no front door. Everything else arrived as files
or scheduled extracts. This needed an authenticated endpoint a client could
post to at any time, that would not lose events when something downstream was
slow, and that ended in a table analysts could query.

**The architecture.** API Gateway exposes one POST operation behind a Lambda
token authorizer. The gateway writes straight to SQS through a service
integration, with no Lambda in the request path. A processor Lambda drains the
queue in batches of up to 1,000, writes them to S3, and reports failures
message by message, so one bad event does not send its neighbours back for
another attempt. After five attempts a message goes to a dead-letter queue. A
daily Glue job validates, decodes and partitions the batch files into a catalog
table. The API, queues, functions and permissions are one CDK stack.

**The interesting decision.** Putting nothing between the gateway and the queue.
The obvious design is a Lambda that receives the request and enqueues it.
Wiring API Gateway to SQS directly removes a function and a failure mode from
the path every client hits, and the caller gets an answer as soon as the
message is durable. It costs some awkward request-mapping templates. I also
wrote the first version in Terraform and rewrote it in CDK within two weeks,
because the infrastructure and the handler code were changing in the same pull
requests and belonged in the same language.

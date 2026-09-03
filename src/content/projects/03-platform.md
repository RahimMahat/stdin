---
title: "Infrastructure as code"
slug: "platform"
summary: "Terraform and AWS CDK modules that moved environment setup out of the console and into reviewed pull requests."
order: 3
started: 2024-05-01
stack:
  - "Terraform"
  - "AWS CDK"
  - "Jenkins"
  - "GitHub Actions"
  - "Python"
throughput: "TODO — environments, stacks or modules under management"
latency: "40% less manual effort per deployment"
broke: "TODO — the failure that actually happened here. Drift, a destroy that should not have run, a module that was wrong everywhere at once — whatever it actually was."
fixed: "TODO — what you changed, and what you would do differently now."
failed: false
---

**The problem.** The pipelines were code and the infrastructure they ran on was
not. Environments were assembled by hand, which meant they drifted, which meant
"works in dev" carried no information. Onboarding a new environment was an
exercise in remembering, and the only real documentation was whoever had done it
last.

**The architecture.** Terraform for the long-lived account-level infrastructure,
AWS CDK where the resources are tightly coupled to application code, and a shared
library of reusable modules so that a bucket with the right encryption and
lifecycle rules is the default thing you get rather than something you have to
remember to configure. Jenkins and GitHub Actions run plan on every pull request
and apply on merge. Manual effort per deployment fell by about 40%, but the
number that mattered more was the one I cannot put a percentage on: an
environment change became something two people had looked at.

**The interesting decision.** Running Terraform and CDK side by side rather than
standardising on one. Two IaC tools is a genuine cost — two mental models, two
state stories, two ways to be wrong. I kept both because they are good at
different things: Terraform for infrastructure with a long life and a slow change
rate, CDK where the infrastructure and the code that uses it change in the same
pull request. Forcing everything into one would have meant either writing
application-shaped resources in HCL or managing account foundations from a
language runtime, and both of those are worse than owning the seam.

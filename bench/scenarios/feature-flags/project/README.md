# Stagewell

Feature flags and gradual rollouts for teams that ship every day.

Stagewell lets a team release code dark, turn it on for 1 % of users, watch error rates and latency, and widen the
rollout step by step — or roll back in one click when a metric moves. Flags are evaluated locally in the SDK, so a
Stagewell outage never takes an application down.

## Features

- Percentage rollouts, targeting rules and scheduled releases
- Automatic rollback when an error-rate or latency guard trips
- SDKs for TypeScript, Go, Python and Kotlin; evaluation runs in-process
- Audit log of every change, with who approved it
- Self-hosted (Docker, Helm) or cloud; open core under Apache-2.0

## Who it is for

Platform and product engineering teams of 10–500 developers who deploy several times a day.

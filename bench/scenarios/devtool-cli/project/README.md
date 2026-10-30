# Seamline

Zero-downtime schema migrations for PostgreSQL.

Seamline plans a migration as a sequence of small, reversible steps — add the new column, backfill in batches,
switch reads, switch writes, drop the old column — and runs them while the application keeps serving traffic. Every
step can be paused, resumed or rolled back, and `seamline plan` shows exactly which locks each step will take before
anything touches production.

## Features

- Expand/contract migrations generated from a plain SQL diff
- Batched backfills with throttling based on replication lag
- Lock analysis before every step (`seamline plan`)
- Pause, resume and roll back any step
- Works with existing migration folders (Rails, Django, Prisma, Flyway)

## Who it is for

Backend and platform engineers who ship schema changes to busy PostgreSQL databases and cannot take downtime.

## Install

    cargo install seamline

## License

Apache-2.0

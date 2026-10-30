# Lock analysis

`seamline plan` lists every lock a step takes (ACCESS EXCLUSIVE, SHARE ROW EXCLUSIVE…) and how long it is expected to
be held, so a migration that would block writes is caught before it runs.

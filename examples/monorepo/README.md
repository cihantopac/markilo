# Monorepo product family (synthetic)

For a repository that holds several sites and apps, for example:

```text
acme/
├── products/   (marketing sites: acme-web, acme-docs, acme-pay)
├── apps/       (in-product apps: crm, mail, wiki, ledger, …)
├── packages/   (internal libraries — not brands)
└── public/apps (shared icon set: crm.svg, mail.svg, …)
```

```bash
markilo init --family "Acme"
markilo brand add "Acme" --role master
markilo research monorepo ../acme                     # review the candidate list first
markilo research monorepo ../acme --register --groups products --parent acme --scan
markilo research monorepo ../acme --register --groups apps --parent acme --lock ledger --scan
markilo lock --brand ledger --symbol ../acme/public/apps/ledger.svg --primary "#2b6cb0"
```

Then: `/markilo:design design the Acme family system first, then the sites one by one, and the apps as one app-icon
system. Ledger stays as it is.`

Exports can be placed back into a package with
`markilo install-assets --brand acme-web --group web --into public --project ../acme/products/acme-web` (dry run; add
`--apply` once the plan looks right).

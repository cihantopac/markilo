# Product family: Lumen (synthetic)

```bash
markilo init --family "Lumen" --description "Privacy-first tools for small teams"
markilo brand add "Lumen" --role master
markilo brand add "Lumen Mail" --role product --parent lumen
markilo brand add "Lumen Sites" --role product --parent lumen
markilo brand add "Ledger" --role endorsed --parent lumen --locked     # existing identity, never redesigned
markilo lock --brand ledger --symbol ./ledger-symbol.svg --primary "#2b6cb0"
markilo brief update --brand lumen --file examples/product-family/lumen.json
```

Then: `/markilo:design design the Lumen family system first, then Lumen Mail and Lumen Sites. Keep Ledger as is.`

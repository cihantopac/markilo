# Ovokodo ecosystem — starter setup

A real multi-product family maintained by Markilo's author, kept here as a starter brief. Only the facts supplied by
the owner are included; everything else must come from Markilo's research stage (with sources) or from the owner.
**No designs are included and nothing here is a design decision.**

Known members (domains supplied by the owner): ovokodo.com (master), ovodock.com (with apps inside it), ovoroom.com,
ovoloop.com, mailkodo.com, sitekodo.com, ovolabs.dev. Inside Ovodock, the **BOSS** brand's existing design must be
preserved exactly — register it as locked.

```bash
markilo init --family "Ovokodo"
markilo brand add "Ovokodo" --role master
markilo brand add "Ovodock" --role product --parent ovokodo
markilo brand add "BOSS" --role sub-brand --parent ovodock --locked
markilo brand add "Ovoroom" --role product --parent ovokodo
markilo brand add "Ovoloop" --role product --parent ovokodo
markilo brand add "Mailkodo" --role product --parent ovokodo
markilo brand add "Sitekodo" --role product --parent ovokodo
markilo brand add "Ovolabs" --role product --parent ovokodo
markilo brief update --brand ovokodo --file examples/ovokodo/ovokodo.json
# BOSS: provide the existing files, then
markilo lock --brand boss --symbol <boss-symbol.svg> --lockup <boss-logo.svg> --primary "<#hex>"
```

Open questions for the owner (log answers with `markilo answers`): the apps inside Ovodock and their roles; whether
each product is master-branded, endorsed or independent; target markets and languages; any equity to keep in current
marks; the BOSS source files and color.

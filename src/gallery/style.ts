/**
 * The gallery's own stylesheet. Calm and visual: the marks are the largest things on the page, surfaces are separated
 * by space and tone rather than lines, and only Markilo's three colours are used — paper and its tints for the page,
 * ink for text and dark grounds, oxblood for the primary action, the selection, focus and problems. Device mockups
 * are drawn in the same tints. Brand artwork keeps its own colours (they arrive in style attributes and SVG).
 */
export const GALLERY_CSS = `body{padding-bottom:112px;background:var(--stage)}
.mk-top{background:color-mix(in srgb,var(--stage) 86%,transparent)}
button{font:inherit;cursor:pointer;color:inherit}
.intro{max-width:1200px;margin:0 auto;padding:56px 24px 4px}
.intro h1{margin:0;font:600 clamp(34px,4.6vw,56px)/1.04 var(--serif);letter-spacing:-.02em}
.lede{margin:14px 0 0;color:var(--muted);font-size:18px;line-height:1.5;max-width:640px}
main{max-width:1200px;margin:0 auto;padding:0 24px}
.brand{padding:44px 0 16px}.brand+.brand,.family+.brand{border-top:1px solid var(--line)}
.brandhead{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:0 0 24px}
.brandhead h2{margin:0;font:600 26px/1.2 var(--serif);letter-spacing:-.01em}.brandhead small{color:var(--muted);font-size:13px}
.eyebrow{margin:0 0 16px;font:600 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.empty{color:var(--muted)}

/* The board: the whole round at a glance. */
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:16px;margin:0 0 40px}
.tile{display:flex;flex-direction:column;text-decoration:none;color:var(--ink);background:var(--card);border-radius:22px;overflow:hidden;box-shadow:var(--shadow);outline:2px solid transparent;outline-offset:3px;transition:transform .2s ease,outline-color .2s ease}
.tile:hover{transform:translateY(-2px)}.tile.on{outline-color:var(--accent)}
.tile-art{display:grid;place-items:center;height:148px;padding:20px 22px;box-shadow:inset 0 -1px 0 rgba(22,18,15,.06)}.tile-art svg{max-width:100%;max-height:100%;height:auto}
.tile-cap{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;min-width:0}
.tile-cap .l,.letter{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--ink);color:var(--bg);font:700 12px/1 var(--sans)}
.tile.on .l{background:var(--accent);color:var(--accent-ink)}
.tile-title{font:600 16px/1.2 var(--serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.tile-flag{flex:none;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--problem);color:var(--bg);font:700 11px/1 var(--sans);font-style:normal}
.tile-pick{margin-left:auto;font-size:12px;color:var(--link);font-weight:600;white-space:nowrap}
.tile-icon{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:11px}.tile-pick:empty+.tile-icon,.tile-flag+.tile-pick:empty+.tile-icon{margin-left:auto}

/* One proposal, large. With script only the chosen one shows; without it every proposal is listed. */
.proposals{display:grid;gap:56px}.proposals.one>.proposal:not(.on){display:none}
.proposal{display:grid;gap:22px;min-width:0;scroll-margin-top:24px}
.proposal header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.proposal h3{margin:0;font:600 clamp(28px,3.2vw,40px)/1.1 var(--serif);letter-spacing:-.015em;display:flex;align-items:center;gap:14px}
.proposal h3 .letter{width:32px;height:32px;font-size:14px}
.status{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}
.idea{margin:-8px 0 0;font-size:20px;line-height:1.45;max-width:760px}
.showcase{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px}
.ground{display:grid;place-items:center;border-radius:24px;position:relative;overflow:hidden;min-width:0;box-shadow:inset 0 0 0 1px rgba(22,18,15,.07)}
.ground svg{max-width:84%;height:auto}
.hero{grid-row:span 2;min-height:400px}.icon{min-height:220px}.sizes{display:flex;align-items:flex-end;justify-content:center;gap:20px;padding:22px;min-height:120px}.sizes svg{max-width:none}
.lockup{grid-column:1/-1;height:150px}
.rejected{opacity:.55}
.flags{display:flex;flex-wrap:wrap;gap:8px 18px;margin:-6px 0 0;font-size:14px;font-weight:600;color:var(--problem)}
.flag{display:inline-flex;align-items:center;gap:8px}.flag:before{content:"!";display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--problem);color:var(--bg);font-size:11px;font-weight:700}

/* The decision. Select is the one oxblood button; the others stay quiet. */
.decide{display:grid;gap:12px}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:12px 22px;font-weight:600;font-size:15px;line-height:1;transition:background .15s,border-color .15s,color .15s}
.btn:hover{border-color:var(--ink)}
.btn[data-pick=keep]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn[data-pick=keep]:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
.btn[data-pick=keep][aria-pressed=true]:before{content:"✓ "}
.btn[data-pick=refine][aria-pressed=true]{border-color:var(--accent);color:var(--link);box-shadow:inset 0 0 0 1px var(--accent)}
.btn[data-pick=drop]{border-color:transparent;background:transparent;color:var(--muted)}.btn[data-pick=drop]:hover{color:var(--ink)}
.btn[data-pick=drop][aria-pressed=true]{background:var(--sunk);color:var(--ink)}
.cmp{margin-left:auto;display:flex;gap:8px;align-items:center;font-size:14px;color:var(--muted);cursor:pointer}.cmp input{accent-color:var(--accent);width:16px;height:16px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.hint{flex-basis:100%;margin:4px 0 2px;font-size:13px;color:var(--muted)}
.chip{border:1px solid var(--line);background:transparent;border-radius:99px;padding:7px 14px;font-size:13px;color:var(--ink)}.chip:hover{border-color:var(--ink)}.chip.on{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.decide:not(.refine) .chips,.decide:not(.refine)>.note{display:none}
.note{width:100%;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--card);color:inherit;font:inherit;font-size:14px}.note:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.pinnable{cursor:crosshair}.pin{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 3px var(--card);cursor:pointer}
.pins{margin:0;padding-left:22px;display:grid;gap:6px}.pins:empty{display:none}.pins li input{width:100%;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--card);color:inherit;font:inherit;font-size:13px}

/* Details: everything a careful chooser may want, one click away. */
details.more{border-top:1px solid var(--line)}
details>summary{cursor:pointer;list-style:none}details>summary::-webkit-details-marker{display:none}
details>summary{display:flex;align-items:center;gap:8px;padding:16px 0;font-weight:600;font-size:15px;color:var(--ink)}
details>summary:after{content:"+";margin-left:auto;font:400 22px/1 var(--sans);color:var(--muted)}details[open]>summary:after{content:"−"}
.approved>details,.rejected-list,.assets,.ideas{border-top:1px solid var(--line)}
.more-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:28px 36px;padding:4px 0 28px}
.more-grid section{min-width:0}.more-grid p{margin:0 0 8px;font-size:14px;line-height:1.55}
h4{margin:0 0 10px;font:600 11px/1.2 var(--sans);text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.muted{color:var(--muted);font-size:13px;margin:4px 0}
.pitch ul,.checks{list-style:none;padding:0;margin:0 0 8px;font-size:14px;line-height:1.5}.pitch li,.checks li{padding:3px 0 3px 20px;position:relative}
.pitch li:before,.checks li:before{position:absolute;left:0;font-weight:700}
.pitch .plus li:before{content:"+";color:var(--ink)}.pitch .minus li:before{content:"−";color:var(--problem)}
.checks li{font-size:13px}.checks .pass:before{content:"✓";color:var(--muted)}.checks .warn:before{content:"!";color:var(--ink)}.checks .fail:before{content:"✕";color:var(--problem)}.checks .info:before{content:"·";color:var(--muted)}
.verdict{border-left:2px solid var(--problem);padding:2px 0 2px 12px}
.swatches{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px}.swatches span{width:24px;height:24px;border-radius:7px;box-shadow:inset 0 0 0 1px rgba(22,18,15,.12)}.swatches code{font-size:11px;color:var(--muted)}

/* Surfaces, drawn in paper and ink tints so the brand is the only colour in them. */
.mockups{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px;padding-bottom:24px}
.mock{margin:0;background:var(--sunk);border-radius:18px;padding:12px;overflow:hidden}figcaption{font-size:12px;color:var(--muted);margin-top:8px}
.browser .tabbar{display:flex;gap:4px;background:#ddd5c9;border-radius:10px 10px 0 0;padding:6px 6px 0}.browser .tab{display:flex;gap:6px;align-items:center;background:#fbf8f2;border-radius:7px 7px 0 0;padding:5px 10px;font-size:12px;color:#16120f}.browser .tab.ghost{background:transparent;color:#6b625b}.browser .addr{background:#fbf8f2;font-size:11px;color:#6b625b;padding:4px 10px;border-bottom:1px solid #e9e2d6}
.page{background:#fbf8f2;padding:10px;border-radius:0 0 10px 10px}.page nav,.darkui nav{display:flex;align-items:center;gap:10px;font-size:11px;color:#6b625b}.page nav span:first-of-type,.darkui nav span:first-of-type{margin-left:auto}.btn-mock{color:#fff;padding:3px 8px;border-radius:6px}
.mock .hero{min-height:0;grid-row:auto}.mock .hero b{display:block;height:10px;width:60%;background:#e9e2d6;border-radius:4px;margin:12px 0 6px}.mock .hero i{display:block;height:7px;width:80%;background:#f2ece1;border-radius:4px;margin:5px 0}
.darkui{background:#16120f}.darkui nav{color:#a69d92}.darkui .hero b{background:#352d27}.darkui .hero i{background:#29221d}
.phone .screen{background:linear-gradient(160deg,#6b625b,#16120f);border-radius:18px;padding:12px}.phone .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.phone .app{display:grid;justify-items:center;gap:3px}.phone .app i,.phone .apptile{width:36px;height:36px;border-radius:8px}.phone .app span{font-size:8px;color:#fbf8f2}
.android .screen{background:linear-gradient(160deg,#352d27,#16120f);border-radius:14px;padding:14px;display:flex;gap:14px;justify-content:center}
.dock .bar{display:flex;gap:8px;align-items:end;justify-content:center;border-radius:16px;padding:6px;background-color:#ddd5c9}.dock .bar i{width:40px;height:40px;border-radius:10px;display:block}
.store .card{display:flex;flex-direction:row;gap:10px;align-items:center;background:#fbf8f2;color:#16120f;border-radius:12px;padding:10px;box-shadow:none}.store .apptile{width:56px;height:56px}.store small{display:block;color:#6b625b;font-size:10px}.store .get{display:inline-block;margin-top:4px;background:#e9e2d6;color:#16120f;font-weight:700;font-size:10px;border-radius:99px;padding:2px 10px}
.social .post{background:#fbf8f2;color:#16120f;border-radius:12px;padding:8px}.social .who{display:flex;gap:6px;align-items:center;font-size:11px;margin-bottom:6px}.social .who i{width:18px;height:18px;border-radius:50%}.og{width:100%;height:auto;border-radius:6px}.social small{color:#6b625b;font-size:10px}
.bizcard .front{border-radius:6px;aspect-ratio:85/55;display:grid;place-items:center;box-shadow:0 4px 14px rgba(22,18,15,.15)}.bizcard .back{margin-top:6px;background:#fbf8f2;color:#16120f;border-radius:6px;padding:8px;display:grid;gap:2px;box-shadow:0 4px 14px rgba(22,18,15,.1)}.bizcard small{color:#6b625b;font-size:9px}

/* A whole round can be turned down. */
.rejectall{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:32px 0 0;padding:18px 0 0;border-top:1px solid var(--line)}.rejectall .muted{font-size:14px;margin:0}.rejectall .note{flex:1;min-width:min(100%,260px);display:none}.rejectall .chip.on~.note{display:block}.rejectall .chip.on{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.round{margin:0 0 24px}details.round{margin:8px 0;border-top:1px solid var(--line)}

/* Lists of proposals that are not the round in front of the user (rejected, explored, unrounded). */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:20px}
.grid .proposal,.card{background:var(--card);border-radius:22px;padding:20px;box-shadow:var(--shadow);gap:14px;display:flex;flex-direction:column;min-width:0}
.grid .proposal h3{font-size:22px}.grid .idea{font-size:15px;margin:0}.grid .showcase{grid-template-columns:1fr 96px}.grid .hero{grid-row:auto;min-height:170px}.grid .icon{min-height:0}.grid .sizes,.grid .lockup{display:none}
.grid .btn{padding:10px 16px;font-size:14px}.grid .cmp{margin-left:0}
.rejected-list{margin:28px 0 0}

/* The approved identity, shown as the result. */
.approved{display:grid;gap:20px}
.approved-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.approved-grid .ground{height:240px}.approved-grid .ground.wide{grid-column:auto}
.tag{position:absolute;left:12px;bottom:12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:rgba(242,236,225,.9);color:#16120f;border-radius:99px;padding:4px 10px}
.links{display:flex;flex-wrap:wrap;gap:10px;margin:0}.links a{font-size:14px;text-decoration:none;border:1px solid var(--line);border-radius:99px;padding:10px 18px;color:var(--ink);background:var(--card)}.links a:hover{border-color:var(--ink)}.links a.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}.links a.primary:hover{background:var(--accent-hover)}

.assets{margin-top:0}.assets a{margin-right:8px;font-size:13px}

/* Ideas and sketches. */
.ideas{margin:8px 0 20px;border-top:1px solid var(--line)}.ideas li{margin:6px 0}.ideas .reading{color:var(--muted)}.ideas .struck{opacity:.7}
.sketchcard header{display:flex;justify-content:space-between;align-items:center;gap:8px}.sketchcard h3{margin:0;font:600 20px/1.2 var(--serif)}.sketchcard .idea{font-size:15px;margin:0}
.skgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.sk{display:grid;gap:4px;border:2px solid transparent;border-radius:16px;background:var(--sunk);padding:4px;text-align:left}.sk:hover{border-color:var(--line)}.sk .ground{height:110px;border-radius:12px}.sk .sizes{padding:6px;gap:8px;min-height:0;border-radius:12px}
.sk .cap{font-size:11px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;padding:2px 4px}.sk .cap b{color:var(--ink)}.sk.picked{border-style:dashed;border-color:var(--muted)}
.sk.on{border-color:var(--accent);border-style:solid}.chip[data-sketch].on{background:var(--ink);border-color:var(--ink);color:var(--bg)}i.bad{color:var(--problem);font-style:normal}
.decide.sketch{display:flex;flex-wrap:wrap;gap:10px}.decide.sketch .note{display:block;flex:1;min-width:200px}
.family .fmrow{display:flex;gap:16px;flex-wrap:wrap}.fm{display:grid;justify-items:center;gap:8px;background:var(--card);color:var(--ink);border-radius:20px;padding:16px;box-shadow:var(--shadow)}

/* Dialogs and the action bar. */
dialog{max-width:min(1180px,calc(100vw - 32px));width:100%;border:0;border-radius:24px;background:var(--bg);color:var(--ink);padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)}dialog::backdrop{background:rgba(22,18,15,.55)}
dialog h2{margin:0 0 18px;font:600 26px/1.2 var(--serif)}dialog .btn{margin-top:14px}
dialog input,dialog textarea{width:100%;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;border-radius:14px;padding:12px 14px}dialog input{margin:18px 0 6px}
#copytext{min-height:220px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
.cmpgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px}.cmpcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.cmpcol h3{margin:0;font:600 22px/1.2 var(--serif);display:flex;align-items:center;gap:10px}.cmpcol .showcase{grid-template-columns:1fr 1fr}.cmpcol .hero{grid-row:auto;grid-column:1/-1;min-height:220px}.cmpcol .icon{min-height:120px}.cmpcol .icon svg{width:76px;height:auto}.cmpcol .sizes{min-height:0}.cmpcol .lockup{height:100px}.cmpcol .idea{font-size:15px;margin:0}
.cmpcol .prefer{margin-top:auto}.cmpcol .prefer.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.actionbar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(960px,calc(100% - 32px));display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 8px 8px 20px;border-radius:20px;background:color-mix(in srgb,var(--card) 90%,transparent);-webkit-backdrop-filter:saturate(1.4) blur(16px);backdrop-filter:saturate(1.4) blur(16px);box-shadow:0 1px 2px rgba(22,18,15,.08),0 12px 40px rgba(22,18,15,.14);z-index:30}
.actionbar .sum{flex:1;min-width:0;font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.actionbar button{border:1px solid transparent;background:transparent;border-radius:14px;padding:10px 16px;font-weight:600;font-size:14px;color:var(--ink)}.actionbar button:hover{background:var(--sunk)}
.actionbar #cmpbtn,.actionbar #send{border-color:var(--line)}.actionbar button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.actionbar button.primary:hover{background:var(--accent-hover)}
@media (max-width:760px){.intro{padding:36px 16px 0}.lede{font-size:16px}main{padding:0 16px}
.board{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -16px 28px;padding:4px 16px 8px;scrollbar-width:none}.board::-webkit-scrollbar{display:none}
.tile{flex:0 0 68%;scroll-snap-align:start;border-radius:18px}.tile:hover{transform:none}.tile-art{height:104px;padding:16px}.tile-cap{padding:10px 10px 10px 12px;gap:8px}.tile-title{font-size:15px}.tile-pick{display:none}.tile-icon{width:34px;height:34px;border-radius:9px}
.showcase{grid-template-columns:1fr 1fr;gap:10px}.ground{border-radius:18px}.hero{grid-row:auto;grid-column:1/-1;min-height:220px}.icon{min-height:150px}.lockup{height:104px}.idea{font-size:17px}
.btn{padding:12px 18px}.cmp{margin-left:0;flex-basis:100%}.approved-grid{grid-template-columns:1fr}.approved-grid .ground{height:180px}
.actionbar{bottom:8px;width:calc(100% - 16px);padding:6px;border-radius:16px;flex-wrap:nowrap}.actionbar .sum,.actionbar #clear,.actionbar #send:not(.primary),.actionbar #copy:not(.primary){display:none}.actionbar button{flex:1 1 0;padding:12px 8px;font-size:14px;white-space:nowrap}}
@media print{.actionbar,.board,.decide,.rejectall{display:none}.proposals.one>.proposal:not(.on){display:grid}details.more{display:none}}`;

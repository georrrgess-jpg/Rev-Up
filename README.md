# Rev Up

An original, portrait-first, installable mobile web game. Merge parts on a workbench, race for cash and reputation, and fill a showroom one earned car at a time — from a taped-up scrapyard hatchback (the **Junker**) to a restored muscle coupe (the **Muscle**).

- **Play:** https://georrrgess-jpg.github.io/Rev-Up/ (once GitHub Pages is enabled — see [Publishing](#publishing))
- **Stack:** TypeScript + Vite, DOM/CSS for menus and the board, Canvas 2D for the race, reveal and car art, synthesized WebAudio. No backend, no account, no runtime dependencies.
- **Size:** ~37 KB JS + 6 KB CSS gzipped; all art is drawn in code (no image downloads except the app icons).

## Commands

```bash
npm ci                 # install exact dependencies from the lockfile
npm run dev            # dev server at http://localhost:5173/
npm run build          # typecheck + production build into dist/ (base /Rev-Up/)
npm run preview        # serve dist/ at http://localhost:4173/Rev-Up/
npm test               # unit + rules + simulated playthrough tests (Vitest)
npm run playthrough    # just the clean-save → Muscle simulation, with milestone times
npm run smoke          # production PWA smoke test at /nested/path/Rev-Up/ (headless Chromium)
npm run perf           # emulated load + frame pacing on the production build (run after build)
npm run check:input    # keyboard, two-tab, toggles, layout checks (needs `npm run dev` running)
npm run publish:pages  # build and push dist/ to the gh-pages branch
```

`smoke`, `perf`, `check:input` and `icons` use the Playwright + Chromium that is pre-installed in the build environment (not a project dependency). Set `REVUP_BASE=/` to build for a root site.

## Controls

| Action | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| Merge / move a part | Drag onto a matching part or an empty slot | Drag | Arrows to focus, Enter to pick up, Enter on the target |
| Tap mode | Tap a part, then tap the target | Click, click | — |
| Scrap | Drag onto **Scrap**, or select then tap Scrap | Same | `x` / Delete on the focused part |
| Race the recommended event | **Race** button (bottom right) | Click | `r` in the Garage |
| Nitro | Big **Nitro** button (bottom right) | Click | Space / `n` / ↑ |
| Pause | Pause button, or leave the app | — | Esc / `p` |

Invalid drops return the part to where it was. The page never scrolls while dragging (`touch-action: none` on the board).

## How it plays

- **Garage.** A 5×6 board (6×7 with the *Bigger bench* upgrade) and a 4-slot overflow tray. Two parts of the same family and tier merge into the next tier in the destination slot; the new part then cascades with orthogonal matches (up, right, down, left). Three families through T5: **Engines** → top speed, **Tires** → grip (launch traction and bends), **Turbos** → acceleration (strongest off the launch).
- **Quality.** One roll per fusion: 2% **Mint** (skips a tier when room exists; at the ceiling it stays at the ceiling and keeps the Mint tag), 10% **Polished** (+15% stat), 88% standard. Quality never blocks a match.
- **Combo → nitro.** Each fusion refreshes a 2 s combo timer; every 3rd fusion in a combo banks a nitro charge (cap 3).
- **Crates.** A free printer makes a crate every 20 s while the game is open (pauses at 10 waiting). Crates open themselves when there is room (board first, then tray) and wait unopened when both are full. The **Scrap** press works on board and tray parts; 10 scrap buys a random crate and 15 buys a crate of a family you pick. Parts can also be ordered for $70. Scrap values are set so recycling crates always loses scrap.
- **Equip.** The active car auto-equips the strongest part per family up to its equip cap. Stronger parts above the cap stay on the bench and are flagged. Scrapping an equipped part asks first and names what equips next.
- **Racing.** Three rivals, a fixed-timestep (60 Hz) simulation on segmented tracks (launch, straights or highway, a bend). Amber **nitro windows** on the two straights are telegraphed on the road, on the progress bar and with an optional beep; a tap inside a window is a **Perfect** (1.5× effect), outside it still boosts. Every finish pays cash, Rep and crates scaled by place, with the real time gap and one next step. Rewards are committed at the finish line, so closing the page cannot lose or double them.
- **Quick Race.** After a live win, an ordinary event can be raced by your crew in the background: same simulation without nitro, the placement's base payout, finished after the race's real duration while you keep merging. First-win bonuses, precision bonuses and rival rewards need a live race.
- **Cars.** Junker (start, cap T2) → Beater (45 Rep + crafted T3 Tires, cap T3) → Hot hatch (300 Rep + crafted T4 Turbo, cap T4) → Muscle (1000 Rep + crafted T5 Engine, cap T5). Keystones are recorded in a permanent ledger the moment you craft them (including tiers jumped by a Mint); crate drops never count. The next car sits under a cover above the board with the exact remaining goal.
- **Rusty Ray.** The Scrapyard rival (needs the Beater). First win: the Ray's Rust-Red paint blueprint, the "Scrapyard King" badge, $200, 4 crates, and the Suburbs open.
- **Reveal.** Ownership is saved before the unveil. Drag the cover off (or tap), then a headlight sweep, a camera move and a per-car rev. Skip is always available; an interrupted reveal resumes on next launch.
- **Catch-up.** After ~150 s of active play (and race finishes) without progress on the current keystone, one free crate of that family arrives (once per car). Idle time and reloads earn nothing toward it.
- **Merge All** unlocks after 10 active minutes. It resolves every pair deterministically with normal rules in one transaction, counts toward keystones, and banks at most one nitro (if its longest chain is ≥ 3).
- **Offline cash.** While away, owned cars earn $1–4/min each, as one claim covering up to 8 hours. The board is left alone.

## Code map

```
src/data/tables.ts     all tuning: tiers, odds, cars, tracks, rivals, events, payouts, upgrades, thresholds
src/core/              rules, independent of the DOM (unit-tested)
  board.ts             fusion, cascade, quality, combo/nitro, Merge All, placement, crates, scrap
  loadout.ts           auto-equip, stats, scrap impact
  race.ts              fixed-timestep race simulation, nitro windows, standings, advice
  progression.ts       goals, unlocks, keystone ledger use, catch-up, payouts, quick race, offline, upgrades
  state.ts / save.ts   versioned save schema, validation/migration, checksum, tab-conflict guard, export/import
  game.ts              transactional wrapper: draft → validate → persist → emit events
src/ui/                Garage, Race, Showroom, reveal, settings (DOM + Canvas)
src/render/            original car silhouettes (Canvas) and part illustrations (SVG)
src/sw/sw-template.js  service worker template; vite.config.ts fills in the version and asset list
src/dev.ts             dev-only late-state presets (stripped from production builds)
tests/                 rules, race, progression/save tests and the playthrough bot
scripts/               icons, static server, smoke, perf, input checks, gh-pages publish
```

**Dev shortcuts** (only in `npm run dev`, never in production): `?dev=beater-ready | ray | muscle-ready | late | full | cascade | offline | reveal` loads a late or edge-case state, and `&seed=123` fixes the RNG.

## Tuning knobs

All in `src/data/tables.ts`:

| Knob | Current | Effect |
| --- | --- | --- |
| `CARS[].unlock.rep` | 45 / 300 / 1000 | Rep per car (main pacing lever) |
| `CARS[].unlock.family/tier` | T3 Tires / T4 Turbo / T5 Engine | Keystones |
| `QUALITY_ODDS`, `QUALITY_BONUS` | 2% / 10%, +15% | Mint / Polished |
| `COMBO_WINDOW_MS`, `COMBO_NITRO_EVERY`, `NITRO_CAP` | 2000, 3, 3 | Combo → nitro |
| `PRINTER_INTERVAL_S`, `CRATE_TIER_ODDS`, `UPGRADES` | 20/16/13/10 s … | Printer speed, crate tiers, upgrade prices |
| `SCRAP_VALUE`, `CRATE_SCRAP_COST`, `TARGETED_CRATE_*` | 1,3,7,15,32 · 10 · 15 / $70 | Scrap economy |
| `EVENTS[].payout`, `firstClear`, `boss.reward` | per event | Race economy |
| `RACE.*`, `STAT_SCALE` | see file | Physics, nitro strength, perfect multiplier, rival variance |
| `RIVALS[].stats` | per rival | Difficulty |
| `CATCHUP_EFFORT_THRESHOLD`, `RACE_EFFORT` | 150, 15 | Catch-up crate |
| `MERGE_ALL_UNLOCK_ACTIVE_S` | 600 | Merge All unlock |
| `OFFLINE_MAX_S`, `CARS[].offlineRate` | 8 h, $1–4/min | Offline claim |

The data model already carries Transmission and Aero, T6–T10, all ten classes and the later districts (disabled). The full campaign's hypercar is gated by Rep, a crafted T10 keystone and a Summit Gala rival win — not by a Mint roll.

## Saves

- Stored in `localStorage` under `revup:<base path>:save` (so other Pages projects on the same origin never collide), versioned (`v: 1`), checksummed, validated on load, and migrated forward. A corrupted or malformed save is copied to a backup key and the game starts fresh with a notice; saves from a newer build are refused rather than damaged.
- Every successful action saves once. Race payouts, quick races and reveals are guarded by single-use ids, so rapid taps and reloads cannot repeat them. A race in progress at reload is abandoned with no charges spent.
- Two tabs: a new tab asks before taking over, the old tab freezes, and writes from a stale tab are refused (revision check).
- Offline time is clamped for clock rollback, capped at 8 hours, and stored together with its timestamp so repeated reloads never multiply a claim.
- **Settings → Move your save** exports a text code (or a file) and imports it, for moving between Safari and the Home Screen app.

## Installing on a phone

- **iPhone (Safari):** open the site → Share → **Add to Home Screen** → turn on **Open as Web App** when offered → **Add**. Launch from the Home Screen icon.
- **Android (Chrome):** use the install prompt (Settings → Install app) or browser menu ⋮ → **Install app** / **Add to Home screen**.
- After the first online load, Settings shows "Offline play is ready" and the whole game works with no connection. Updates are downloaded in the background and offered as "An update is ready — Reload" only on the Garage/Race/Showroom screens, after saving.

## Publishing

Source lives on the development branch; the compiled site is published to a dedicated **`gh-pages`** branch with the build at its root (including `.nojekyll`).

1. `npm run publish:pages` — builds with base `/Rev-Up/`, commits `dist/` onto `gh-pages` (keeping its history), and pushes with your own git credentials. (A push made with the default Actions `GITHUB_TOKEN` would not trigger a Pages build.)
2. One-time repository setting: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `gh-pages` / `(root)` → Save.**
3. The site is served at `https://georrrgess-jpg.github.io/Rev-Up/` over HTTPS. The manifest `id`, `start_url` and `scope`, the icons and the service worker are all under `/Rev-Up/`, and navigation uses hash routes (`#garage`, `#race`, `#showroom`), so refreshing any view works on static hosting.

## Verification results

Environment: Linux cloud container, Node 22, headless Chromium (Playwright), production build. **No physical phone was available**; device checks below are emulation.

**Automated tests** (`npm test`): 54 passing — fusion and cascade (4-step cascade with stable order and part conservation), Polished +15%, Mint tier skip, cap-bound Mint, keystone ledger (Mint jumps, consumed keystones, crate drops excluded), combo/nitro window and cap, full board + full tray with crates waiting and scrap recovery, unprofitable crate recycling at every crate tier, targeted crates, auto-equip/cap/scrap warning, Merge All determinism and conservation, race determinism, weak vs strong build, perfect vs mistimed vs no nitro, stat roles per segment, real gaps, payouts by placement, Quick Race gating/duration/reload, single-award boss loot, exactly-once commits, save round-trip, corrupted/malformed/newer saves, stale-tab writes, namespacing, abandoned races, reveal ownership across reload, offline cap, repeated reloads, clock rollback.

**Clean save → Muscle** (`npm run playthrough`, **simulation**: a scripted player through the real game API with modelled input time — 1.3 s per drag, race time + 7 s of menus per live race — and baseline luck, i.e. every roll Standard, zero Mint/Polished; 5 seeds):

| Milestone | Target | Measured (5 seeds) |
| --- | --- | --- |
| First merge | ≤ 5 s | 2 s |
| First race finished | ~30 s | 34–38 s |
| Beater | ~3 min | 2:21–3:25 |
| Rusty Ray beaten | — | 2:53–4:57 |
| Hot hatch | ~12 min | 11:19–13:10 |
| Muscle | ~25 min | 21:49–24:54 |

**Race checks** (seed 11, Junker with T2 parts, Crusher Run): no nitro 20.02 s (3rd, 0.3 s behind first), mistimed nitro 19.78 s (2nd, 0.1 s behind), perfect nitro 19.24 s (1st, 0.5 s ahead). A T1→T2 build is >0.5 s faster on all 20 tested seeds.

**Production smoke test** (`npm run smoke`, built for and served at `/nested/path/Rev-Up/`): 22/22 — page, manifest, service worker and all icons resolve under the path; manifest `id`/`start_url`/`scope` match; the service worker controls the page with a scoped, revisioned cache; "Offline play is ready" is shown; drag merge; namespaced save; **network disabled → relaunch, tap merge, and a full race with a result**; upgrade to a second deployed revision is staged, offered, applied with one navigation (no reload loop), the old cache is removed and the save is unchanged; no page errors.

**Interaction checks** (`npm run check:input`): 11/11 — keyboard-only merge, keyboard scrap with the equipped-part warning, non-matching taps never mutate the board, reduced-motion toggle, no page scroll, second tab asks before taking over and the first tab freezes, and board, tray, Race button and nav fully on screen at 360×640, 390×844 and 1280×800. Screenshots of the Garage, a full board, the race HUD, results, reveal and showroom were reviewed at those sizes.

**Performance** (`npm run perf`, emulated: 390×844 @3×, canvas DPR capped at 2, "Fast 3G" 1.6 Mbps / 150 ms RTT, 4× CPU slowdown, software rendering, no GPU):

| Measure | Result |
| --- | --- |
| Usable garage (first load, cold) | ~1.6 s; 127 KB transferred |
| Dragging on a full board | 60 fps avg, p95 16.7 ms |
| Race | 46–56 fps avg, p95 33 ms (adaptive effects drop resolution first) |
| Reveal | 31–42 fps avg, p95 33–50 ms |

Headless software rendering is fill-rate bound and slower than a phone GPU, so these are conservative; **physical iPhone and Android profiling is still pending**.

## Known limitations

- Not yet tested on a physical iPhone or Android device (Home Screen standalone launch, safe areas, pause/resume and save persistence after relaunch should be confirmed on hardware).
- Quick Race and the Race button always race the active car; switch cars in the Showroom.
- One model per class and two tracks in this release; Downtown onward, Transmission/Aero and T6–T10 exist in data only.

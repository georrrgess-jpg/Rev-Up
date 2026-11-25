# Rev Up

An original, portrait-first, installable mobile web game. Merge parts on a workbench, race for cash and reputation, and fill a showroom one earned car at a time — from a taped-up scrapyard hatchback (the **Junker**) to a restored muscle coupe (the **Muscle**), a coastal grand tourer (the **Altamar GT**), a city lightweight (the **Kestrel 1600**) and, as the headline prize of Downtown Nights, a hybrid hypercar (the **Lumen RS**).

- **Play:** https://georrrgess-jpg.github.io/Rev-Up/ (once GitHub Pages is enabled — see [Publishing](#publishing))
- **Stack:** TypeScript + Vite, DOM/CSS for menus and the board, Canvas 2D for the race, reveal and car art, synthesized WebAudio. No backend, no account, no runtime dependencies.
- **Size:** ~116 KB JS + 15 KB CSS gzipped, plus one bundled typeface (Barlow, three weights, ~68 KB woff2, SIL OFL); all art is drawn in code (no image downloads except the app icons).

## Update 1.5 · Garage and Racing Overhaul

Made for a player who liked the core loop but found the first ten minutes confusing (parts hard to read, the goal unclear, Shop and Race menus hard to use), races too easy and the cars short on personality. Five workstreams ran in parallel against one contract (`docs/CONTRACTS.md`: file owners, roster ids, units, money rules), then an integration pass and an independent review.

### Garage: parts you can read, fitting you control
- **Parts** have a distinct silhouette per family, the tier number on the tile, a quality marker, and geometry that grows per tier (T1–T9). Merges highlight compatible parts, preview the result and its stat change, and work by drag or tap.
- **Fit Parts** (new): the car with labelled Engine / Tires / Turbo slots; install, swap or remove; before → after stats for each candidate; a **Recommended fit** in one tap. A part lives in exactly one place (bench, spare rack, or one car's slot); swaps are atomic. A newly unlocked car arrives with your best parts fitted, and an older car that gave one up gets the best bench part back.
- **Saves move to v2** (`installed` per car, per-car mastery). Older saves keep the active car's build fitted; nothing is downgraded.

### First session and menus
- **Taught by doing:** the goal car → merge a pair → fit it → race → spend → what is still needed. Each cue appears once, on the control it teaches.
- **Shop:** grouped tabs, exact costs and effects, and one **Best buy** that matches the goal. **Race menu:** a recommended event card (track, difficulty, reward, what it needs, one button), with Live and Quick Race explained. **Rep vs cash** has its own sheet: cash is spent, Rep is never spent and opens races and cars.

### Racing
- **Timed shifting:** a tach with a shift light; tap SHIFT on green. Missed shifts cost 0.6–1.1 s, ordinary 0.2–0.5 s; auto-shift steps in if you do nothing. Nitro inside a boost zone is a Perfect boost.
- **Rivals shift too,** tuned per event, so clean driving matters from the Coastal Highway on. Results explain losses ("Shifting cost 0.9 s… / 3 nitro unused").
- **Real mph** everywhere (m/s × 2.23694), with full-build speeds from ~85 mph (Tapeback) to ~225 mph (Halcyon X on a long straight).

### Ladder, economy, cars and scenery
- **New endgame:** the Desert (Corvo Rally, boss Sable Dunn) and the Summit (Strata GTR, Halcyon X, boss Iver Kaas), tiers up to T9, engine upgrades that change look, sound and stats, per-car milestones and class events that bring older cars back.
- **Cash on sensible steps** everywhere a price or payout appears: $5 up to $100, $10 up to $1,000, $50 above.
- **Customization:** paint, wheels (now gravel and race sets) and liveries, previewed live and shown in races, the Showroom and the unveil. **Tracks** got brighter palettes and landmarks. **The unveil** is a round platform with a spotlight and a slow turn (Skip and reduced motion kept; ownership is saved first).

## Update 1.4 · Main Event

Built from an audit of a fresh, a mid-game and a last-event save on the production build, a seeded cash timeline, and three independent reviews (economy, progression, mobile art/UI). The audit's headline: every upgrade ($7,250 in all) was bought by 17–22 minutes, after which cash piled up to $20,000+ with nothing to buy; beating the Coastal Crown didn't award the Altamar (3,400 Rep of grinding followed); the post-finale game had nothing left.

### New content and rewards

- **Downtown Nights**, a chapter after the Altamar GT, at night: street circuit, harbor-bridge drag, expressway.
  - **Neon Mile** opens it. Each Downtown event has three **goals** — win · beat the par time · land a Perfect boost — each paying once (half the win purse) and earning a ★.
  - **Bridge Speed Trap** — scored on km/h through the gate, medals at 215/228/255 km/h.
  - **Stock Cup** — every part runs as T4 on any car, so the light car wins the corners; a trophy.
  - **Skyline Run** — sweepers, then a tight exit.
  - **Intermediate unlock: Kestrel 1600** (lightweight, cap T6): best off the line and through corners, short of top speed on highways. 3 stars + a crafted T6 Tires.
  - **Final: The Main Event** — a knockout: street heat (top 3 through), bridge heat (top 2), final one-on-one with **Nova Sato**. Change cars between heats; losing a heat starts again from heat 1. Needs the Kestrel and 4 stars. Winning pays $1,500 + the **Main Event Neon** paint + a badge.
  - **Marquee: Lumen RS** (hypercar, cap T7, the Main Event win + a crafted T7 Turbo): cab-forward body, light-bar face, active wing, aero wheels, violet underglow, its own V12-and-whine voice, a violet **Surge** trail — and Perfect boosts at 1.7× instead of 1.5×. Fastest car on any highway, heavier than the Kestrel in tight corners. **Midnight Run** is where it belongs (a Lumen-against-Lumen rematch only it can win).
- **The Altamar GT now follows the Coastal Crown** (its Rep sits just past the Crown): 25 min instead of 40, with no coastal grind.
- **Reward ladder.** Early: parts you can order, garage upgrades, colours, steelies, Tapeback rust repair. Middle: sport wheel sets, Pit crew, metallic paint, Stock Cup. Late: pearl and candy paint, wire and aero wheels, Tapeback brightwork, signature finishes, Main Event Neon. Marquee: the Lumen RS.

### Cash as a game system

One tuning table in `src/data/tables.ts` (Economy block) holds prices, payout shares, rates. Cash buys things; Rep marks progress; scrap buys crates; the UI labels which.

- **Earn:** every live place pays; before a race you see each place's purse, the Perfect bonus (now 10% of the win purse per Perfect, max two — $36 a Perfect at the Coastal Crown, was $8) and any first-win money; after it, a breakdown (purse · skill · one-time). Quick Races pay the crew **70%** of the live purse (85% with the Pit crew; never 100%, so live stays worth it), with the amount on the button. Away earnings show their rate and cap in the Shop.
- **Spend at every price:** **Order a part** (a known family and tier, T1 $45 … T6 $3,200; each tier costs more than two of the tier below, and the next car's keystone is always reachable by buying two of the tier below — the deterministic route past bad crate luck). **Upgrades** with exact now → next effects (new: Pit crew $900, Nitro tank $1,500/$4,800, Lock-up $2,500). **Tune-up** per car (three stages, +2% speed/acceleration/grip each, from $120 for the Tapeback's first stage to $7,920 for the Lumen's third): the cash route for players who don't land Perfect boosts. **Paint shop** (Showroom → a car): six colours $250, five wheel sets $300–$2,400 (bought once, fit every car), premium paint per car — Metallic $1,200, Pearl $3,000, Candy $6,000 — and a three-stage **Tapeback restoration** ($1,500 / $3,000 / $4,500). Live preview before buying; looks never change performance.
- **Short of cash** buttons read "$120 more"; an empty wallet never blocks racing or merging.

### Name changes (display text only; ids and saves unchanged)

| Before | After |
| --- | --- |
| Workshop (sheet) | Shop |
| Engine $70 (random-tier crate) | Order a part · T1–T6 |
| Random crate | Mystery crate |
| Overflow | Spare rack |
| amber window / amber zone / ▲ PERFECT WINDOW | boost zone / ▲ BOOST ZONE — TAP |
| Nitro window ahead · WINDOW IN 1.2 s | Boost zone ahead · BOOST ZONE IN 1.2 s |
| Fresh route +N Rep | New track bonus +N Rep |
| Recommended | Up next (plus an "Or try" list) |
| Inspect / Next unlock | View / Next car |
| Junker class · parts up to T2 | Junker · T2 parts |
| "Beat Rusty Ray for his Crown Teal paint and to open the Suburbs" (Coastal Crown) | "Beat Vale Moreau for the Crown Teal paint" |
| Event requirements: "Beat Rusty Ray to open the Suburbs" (any boss) | "Beat <that rival>" |
| ⚙ Scrap (same glyph as Settings) | ♻ Scrap |
| Nitro window cue | Boost zone cue |
| Collection complete (with goals left) | Collection · N% · next goal named |

### Colour, identity and feel

- Each area has its own palette through sky, dressing, road and foreground: Scrapyard (warm, safety-yellow chevrons), Suburbs (dusk), **Foundry** (now a steel-blue night with furnace glow and lit stacks — it used to copy the Scrapyard), Coast (sea and sunset), Downtown (neon towers, wet street with sign reflections, street lamps, moon).
- Parts: a distinct metal per tier (iron, copper, blue steel, gold, chrome, teal titanium, violet) — T3, T5 and T6 no longer all read as silver.
- Bigger rewards feel bigger: T5+ merges get a heavier sound and a flash; crafting the next car's keystone gets its own chord, a flash on the goal card and a floater; rival wins, Main Event titles and new cars get a gold (or violet) card and a fanfare; medals, trophies and goals get their own lines.
- Showroom stages: plain bay for early cars, warm for the Ironhorse, dusk teal for the Altamar, sodium garage for the Kestrel, violet neon for the Lumen — and the next car's card shows its requirements and progress. Reveal rooms for the Kestrel and the Lumen.
- Closer race camera; the offline-ready notice no longer covers a new player's first screen; the Lights button no longer covers a wheel; the race header no longer wraps.

## Update 1.3 · Open Road

Built from a fresh-save and returning-save replay of 1.2 and three independent reviews (first-time usability, race feel, mobile visual QA); 35 findings, all addressed below or listed under Known limitations.

- **Open Road chapter (after the Ironhorse).** The **Coastal Highway** opens with three new tracks that race differently — **Harbor Launch** (a long launch and two straights: Turbo), **Cliffside Esses** (three tight bends: Tires), **Coastal Crown** (two long highway runs and a fast sweeper: Engine). The three rounds are a staged rival series that ends with **Vale Moreau** in the Coastal Crown (Crown Teal blueprint, “Coastal Crown” badge, $600, 5 crates). The marquee reward is a new class and silhouette: the **Altamar GT** grand tourer (cap **T6**; 5,600 Rep + a crafted T6 Engine + the Coastal Crown).
- **Earlier cars come back.** **Class meets** race one earlier car only: the **Corsa Club Run** (Corsa Rojo) and **Hatch Attack** (Vexa GTi), each awarding a Showroom trophy. Parts above a car’s cap now **run at the cap tier** instead of being unusable, so an older car still benefits from your current bench.
- **Time attacks.** Three solo runs (Strip, Highway and Esses Time Attacks) with Bronze/Silver/Gold targets; each medal pays once ($120 / $240 / $450 plus crates aimed at your current craft) and the result names the next target and the gap.
- **Collection.** The Showroom leads with a collection card (cars, finishes, medals, trophies, badges), the next unlock stays on the Garage goal card with its requirement chips, and the Race tab groups events by district with round, class-meet, solo and trophy tags. No prices were inflated and there are no daily check-ins.
- **Teach through play.** A short coach-mark sequence, derived purely from save state (so it resumes after a reload and never repeats finished steps): first merge → first race (wider practice nitro windows) → craft toward the next car → spend → goal card, then one-time tips for nitro banking, the overflow tray, the scrap press, Merge All and equip caps. **Skip tips** turns them off; **How to play** (the “?” button) holds the legend, glossary and **Show tips again**. Existing saves open at their progress with no beginner prompts.
- **Races that feel different.** The finish is shown: the result is committed the moment you cross (an off-screen copy finishes the race), while the visible race runs on for 1.6 s and the clock freezes at your time. The camera frames you with the nearest rival and looks ahead before a window; overtakes are called out (“Passed Dex · 2nd”). The nitro button counts down to each window with a ring and “WINDOW IN 1.2 s”. A **Perfect** boost gets a gold flash, gold speed lines and a camera surge, and every boost reports what it actually gained against a no-nitro ghost (“Perfect boost: +0.42 s on the field”). Launch shake and wheelspin smoke, a wheelspin note for launch taps, brake lights, motion-blurred wheels at speed, a lane layout that clears the nitro button and fills tall phones, a coast scene, and a “you” marker that sits on your own roof.
- **Every screen easier.** One primary action per screen; car model names everywhere; grouped toasts that never block taps; focus returns to whatever opened a sheet; the results card explains rewards on the first race; small offline claims are silent and closing the sheet still claims; merging no longer makes the active car worse.
- **Typography and layout.** One bundled typeface (Barlow 400/600/800, ~68 KB woff2 with a metric-matched fallback), a rem type scale with tokens, tabular numerals, 16 px body and 13–14 px secondary text, 44 px targets, and pinch-zoom allowed again. The top bar falls back to glyphs and then a second row instead of clipping balances; landscape phones get a rotate prompt.
- **Car art.** Clearcoat reflections and a specular streak, wheel barrels with brake discs and calipers, deeper grilles, lamp lenses with glints, interiors through the glass, a primer fender and dents on the Tapeback, a planted, blunter Ironhorse front, and the Altamar GT’s long tail, covered lamps, chrome and centre-lock wire wheels, with its own reveal stage (a dusk-teal room and a light sweep along the body).

## Update 1.2 · cars, phone UI, loop

- **Vehicle art rebuilt.** Each car is an original profile built in metres from its wheelbase, ride height, overhangs, roofline and wheel arches, extruded along one oblique depth so it has real hood, roof, deck, fascia and windshield planes under one shared light, plus contact shadows, tyre thickness, far-side wheels and per-car construction:
  - **Tapeback 1.1** — short upright hatch, steel wheels, sagging mismatched bumpers, a replacement door, rust along the arches and sill seams, duct tape you can read on a phone, one yellowed headlight.
  - **Corsa Rojo** — four-door sedan with front and rear door breaks, a sun-faded roof, rectangular lamps with amber corners, rubber side moulding, period wheel covers.
  - **Vexa GTi** — lowered hot hatch, flared arches, tight glasshouse, roof spoiler, sport wheels with red calipers, big lower intake, red grille line, LED eyebrows and a split stripe that kicks up over the rear arch.
  - **Ironhorse 455** — long-hood coupe with a low fastback cabin, broad rear haunches, a sculpted hood scoop, quad round headlights in chrome bezels, deep-dish wheels, chrome bumpers, twin stripes over hood, roof and deck.
  The same geometry and finish are used in the Garage, Showroom, reveal and race; races draw cached body layers with live wheels, lights and nitro, and the camera now frames the whole pack. `art.html` (dev server only) shows every car at hero, card, race and thumbnail sizes.
- **Reveal.** Pull the cover (or tap) → dark silhouette → spotlight cue → headlights and the car's own engine voice (Tapeback misfires, Corsa hums, Vexa rasps with blips, Ironhorse lopes) → camera settles → hero hold with the model name and what it unlocks ("T3 parts now fit (was T2) · +11 km/h"). Skip and reduced-motion versions; **Replay reveal** from Showroom inspection.
- **Phone UI.** On short screens (320×568, 360×640) the whole board, overflow tray, scrap press and Race button fit without scrolling. Parts with a usable match get a teal ring. A full bench turns the Crates button into the recovery action (**Merge pair** / **Scrap T1**). The Race tab leads with one recommended event, its course type ("Drag launch · one bend — Turbo off the line") and a reason to run it; other events are compact rows with rivals and payouts behind a disclosure. The live nitro button shows a **▲ PERFECT WINDOW** label and dashed ring in a window. Results give specific next steps ("Build a T3 Turbo for the launch — you lost 0.4 s there"). Inspection shows earned and locked finishes, **Race this car** and **Replay reveal**. Returning players see where they left off.
- **Loop.** Live races are allowed while the crew runs a Quick Race (no more waiting). **Fresh route:** +75% Rep on an event that isn't one of your last two races, and the recommendation rotates accordingly; a first clear you keep losing is spaced out between other races. New class event **Tapeback Trophy** (Tapeback only, opens with the Corsa Rojo). Signature finishes for a live podium per car, the Foundry Invitational finale for the Ironhorse, Merge All after five finishes, a starter nitro charge for the first race (from 1.1) remain.

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
- **Cars.** Junker (start, cap T2) → Beater (70 Rep + crafted T3 Tires, cap T3) → Hot hatch (600 Rep + crafted T4 Turbo, cap T4) → Muscle (1,850 Rep + crafted T5 Engine, cap T5) → Grand tourer (5,600 Rep + crafted T6 Engine + a Coastal Crown win, cap T6). Keystones are recorded in a permanent ledger the moment you craft them (including tiers jumped by a Mint); crate drops never count. The next car sits under a cover above the board with the exact remaining goal.
- **Rusty Ray.** The Scrapyard rival (needs the Beater). First win: the Ray's Rust-Red paint blueprint, the "Scrapyard King" badge, $200, 4 crates, and the Suburbs open.
- **Reveal.** Ownership is saved before the unveil. Drag the cover off (or tap), then a headlight sweep, a camera move and a per-car rev. Skip is always available; an interrupted reveal resumes on next launch.
- **Catch-up.** After ~150 s of active play (and race finishes) without progress on the current keystone, one free crate of that family arrives (once per car). Idle time and reloads earn nothing toward it.
- **Merge All** unlocks after five race finishes or 10 active minutes. It resolves every pair deterministically with normal rules in one transaction, counts toward keystones, and banks at most one nitro (if its longest chain is ≥ 3).
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
| `CARS[].unlock.rep` | 45 / 450 / 1450 | Rep per car (main pacing lever) |
| `CARS[].unlock.family/tier` | T3 Tires / T4 Turbo / T5 Engine | Keystones |
| `QUALITY_ODDS`, `QUALITY_BONUS` | 2% / 10%, +15% | Mint / Polished |
| `COMBO_WINDOW_MS`, `COMBO_NITRO_EVERY`, `NITRO_CAP` | 2000, 3, 3 | Combo → nitro |
| `PRINTER_INTERVAL_S`, `CRATE_TIER_ODDS`, `UPGRADES` | 20/16/13/10 s … | Printer speed, crate tiers, upgrade prices |
| `SCRAP_VALUE`, `CRATE_SCRAP_COST`, `TARGETED_CRATE_*` | 1,3,7,15,32 · 10 · 15 / $70 | Scrap economy |
| `EVENTS[].payout`, `firstClear`, `boss.reward` | per event | Race economy |
| `RACE.*`, `STAT_SCALE` | see file | Physics, nitro strength, perfect multiplier, rival variance |
| `RIVALS[].stats` | per rival | Difficulty |
| `CATCHUP_EFFORT_THRESHOLD`, `RACE_EFFORT` | 150, 15 | Catch-up crate |
| `MERGE_ALL_UNLOCK_RACES` / `MERGE_ALL_UNLOCK_ACTIVE_S` | 5 / 600 | Merge All unlock |
| `FRESH_ROUTE_BONUS` / `FRESH_ROUTE_AFTER_RACES` | 0.75 / 3 | Rep bonus for varying events |
| `TRACKS[].course` / `favours` | per track | Course type shown on the Race tab |
| `OFFLINE_MAX_S`, `CARS[].offlineRate` | 8 h, $1–4/min | Offline claim |

The data model already carries Transmission and Aero, T6–T10, all ten classes and the later districts (disabled). The full campaign's hypercar is gated by Rep, a crafted T10 keystone and a Summit Gala rival win — not by a Mint roll.

## Saves

- Stored in `localStorage` under `revup:<base path>:save` (so other Pages projects on the same origin never collide), versioned (now `v: 2`: fitted parts per car), checksummed, validated on load, and migrated forward. A corrupted or malformed save is copied to a backup key and the game starts fresh with a notice; saves from a newer build are refused rather than damaged.
- Every successful action saves once. Race payouts, quick races and reveals are guarded by single-use ids, so rapid taps and reloads cannot repeat them. A race in progress at reload is abandoned with no charges spent.
- Two tabs: a new tab asks before taking over, the old tab freezes, and writes from a stale tab are refused (revision check).
- Offline time is clamped for clock rollback, capped at 8 hours (12 with the Lock-up), and stored together with its timestamp so repeated reloads never multiply a claim.
- **Settings → Move your save** exports a text code (or a file) and imports it, for moving between Safari and the Home Screen app.

## Installing on a phone

- **iPhone (Safari):** open the site → Share → **Add to Home Screen** → turn on **Open as Web App** when offered → **Add**. Launch from the Home Screen icon.
- **Android (Chrome):** use the install prompt (Settings → Install app) or browser menu ⋮ → **Install app** / **Add to Home screen**.
- After the first online load, Settings shows "Offline play is ready" and the whole game works with no connection. Updates are downloaded in the background and offered as "An update is ready — Reload" only on the Garage/Race/Showroom screens, after saving.

## Publishing

Source lives on the development branch; the compiled site is published to a dedicated **`gh-pages`** branch with the build at its root (including `.nojekyll`).

1. `npm run publish:pages` — builds with base `/Rev-Up/`, commits `dist/` onto `gh-pages` (keeping its history), and pushes with your own git credentials. (A push made with the default Actions `GITHUB_TOKEN` would not trigger a Pages build.)
2. One-time repository setting: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `gh-pages` / `(root)` → Save.**
3. After Pages is configured and deploys successfully, the site is served at `https://georrrgess-jpg.github.io/Rev-Up/` over HTTPS. The manifest `id`, `start_url` and `scope`, the icons and the service worker are all under `/Rev-Up/`, and navigation uses hash routes (`#garage`, `#race`, `#showroom`), so refreshing any view works on static hosting.

## Verification results

Environment: Linux cloud container, Node 22, headless Chromium (Playwright), production build. **No physical phone was available**; every device number below is emulation.

### 1.5 · Garage and Racing Overhaul

- **Tests** (`npm test`): 149 passing, 3 calibration probes skipped unless `PROBE=1`. New suites: `install` (fit, swap, remove with a full board, move between cars, no loss or duplication, recommended fit, keystone ingredients kept), `migration-v2` (v1 saves keep the active car's build), `shift` (missed / ordinary / clean shifting, rival shift quality), `difficulty` and `tune-ladder` (wins by shift × nitro per event; time to each car per player type).
- **Release checks:** `npm run smoke` 22/22 (fresh install, and upgrading from the 1.4 build on gh-pages with the save carried from v1 to v2); `npm run check:input` 24/24 (320 to 1280 px, full 6×7 board, 36 px cells).
- **Fresh-save playthrough** (production build, real taps only, 390×844): goal → merge → fit → race → what is still needed, in that order; the Corsa Rojo after 6–7 live races (about 5–10 minutes); no page errors.
- **Difficulty** (Neon Mile, wins of 6 with no / late / Perfect nitro): missed shifts 0/0/1, ordinary 0/0/6, clean 6/6/6. Missed shifts cost 0.6–1.1 s against clean, ordinary 0.2–0.5 s; Perfect boosts gain 0.4–0.9 s. Endgame events are lost by 0.5–0.9 s with no inputs and won by 0.4–1.0 s with clean shifts and Perfect boosts.
- **Pace to the top cars** (seeded simulation through the real rules): Lumen RS at 31 min (clean player), 34–35 (mixed), 85 (weak: missed shifts, no nitro, Tune-ups); Halcyon X at 60 / 69–74 / 118 min. Most repeats of one event in a row: 3.
- **Speeds** (full build, clean shifts, measured in the race sim): Tapeback 77 mph, Corsa 103, Ironhorse 155, Lumen 217, Strata 208, Halcyon 240 on the harbor-bridge trap (225 on the Mesa trap).
- **Layout:** Garage, Fit Parts, Shop, Race menu, race HUD, results and sheets audited at 320×568, 360×640, 390×844, 430×932 (each also at 125% zoom) and 768×1024. Phone landscape shows the rotate prompt.
- **Performance** (4× CPU slowdown, 390×844): races hold 47–49 fps (1.4: ~52); cold load ~2.9 s (1.4: ~2.1 s) with the bundle at 116 KB gzip.
- **Known gaps:** a weak player (missed shifts, no nitro) can lose up to 12 races in a row in simulation before building past an event; with 125% text on 360×640 and 320×568 the 6×7 board scrolls under the docked spare rack; container-query layout tweaks need iOS 16+ / Chrome 105+ (older browsers keep the previous look).

### 1.4 · Main Event

Environment: Linux cloud container, headless Chromium, production build served at `/Rev-Up/`. **Every device check below is emulated; no physical phone was available.**

**Tests** (`npm test`): 93 passing + 1 calibration probe (skipped unless `PROBE=1`). New: `tests/economy.test.ts` (Order a part: price, refusals, keystone stays a craft, no buy-merge-scrap loop; upgrade effects; Quick Race 70/85%; breakdown sums to cash paid; no first-win chip when it pays nothing; Paint shop charges once, per-car premium paint, staged restoration, spending everything never blocks racing; goals pay once; Coastal Crown brings the Altamar; knockout advance/elimination/final; speed-trap medals once; Stock Cup cap; Tune-up; a 1.3 save with $36,564 and maxed upgrades loads unchanged with new fields filled and new things to buy), `tests/downtown.test.ts` (chapter playthrough with perfect, mixed and no-nitro players), `tests/economy-audit.test.ts` (prints the cash timeline). The new tests found and fixed one real bug: the Stock Cup's T4 cap wasn't applied to car stats.

**Economy, before → after** (seeded simulation through the real rules, `npx vitest run tests/economy-audit.test.ts`):

| Measure | 1.3 | 1.4 |
| --- | --- | --- |
| Cash spent by 30 min (bot buys upgrades, parts and tune-ups only — no cosmetics) | $7,250, all upgrades gone by 17–22 min | $16,950, still buying at 27–29 min |
| Cash sitting idle at 30 min | $10,649–12,154 | $498–3,407 |
| Optional spending available after the last upgrade | $70 random part | part orders to $3,200, tune-ups to $7,920, Paint shop ≈ $87,000 across the seven cars |
| Perfect boost bonus at the Coastal Crown | $8 | $36 |
| Quick Race share of the live purse | 100% | 70% (85% with Pit crew) |
| Time between meaningful rewards (median / longest) | 0:42–1:31 / 4:09–6:24 | 0:37–1:02 / 3:28–3:35 |
| Longest run of one race in a row | 3–5 | 3 |
| Races to the Altamar GT | 122–129 | ~70 |
| Coastal series runs (Harbor / Esses) | 14–16 each | 1–2 each |

Expected runs to representative purchases (live runs at that stage): T1 part $45 ≈ 1 early run; Faster printer $250 ≈ 3–4; Bigger bench $600 ≈ 7 (about 3 min); Pit crew $900 ≈ 5 mid runs; Metallic paint $1,200 ≈ 6 mid runs; Nitro tank $1,500 ≈ 4 late runs; T6 part $3,200 ≈ 7 Downtown runs; Candy paint $6,000 ≈ 12 Downtown runs (about 6 min with goals).

**Player paths** (simulation, 2–4 seeds each): perfect timing — Altamar 25–26 min, Kestrel 30–32 min, Lumen 31–34 min, every Downtown event run 2–5 times; mixed timing — same within a minute; **never uses nitro** — Altamar 29.7 min (1.3: never), Kestrel 51.8 min, Lumen 54.0 min, by buying Tune-ups (the 1.3 no-nitro bot was still stuck at the Coastal Crown after 2 hours). Same-seed race checks: the Stock Cup is won only by the Kestrel at T4 (the Altamar, Ironhorse and Lumen lose), Midnight Run only by the Lumen, the Main Event final by a T6 Kestrel 10/10 with Perfect boosts and 5/10 with late ones.

**Real play in the browser** (production build, UI only): a returning Downtown save won The Main Event final against Nova Sato (champion card, $2,580 broken down as purse $900 + Perfect ×2 $180 + rival $1,500), revealed the Lumen RS ("T7 parts now fit · +51 km/h"), raced and won Midnight Run in it, reloaded — Lumen owned and active, title counted once. Also checked: Shop at every stage, Paint shop preview → buy → applied in Showroom, reveal and race, restoration stages, speed-trap result in km/h, knockout heat-out message.

**Layout** (320×568 … 1280×800, landscape, 125% text, fresh and late saves, Garage/Race/Showroom/guide/Settings/Shop/Paint shop): no sideways scroll, clipped text, overlapping controls or targets under 40 px. `npm run check:input`: 24/24.

**Smoke** (`npm run smoke` at `/Rev-Up/`): 22/22 on a fresh build and 22/22 upgrading from the 1.3 build on `gh-pages` (scoped service worker, offline relaunch with a merge and a race, staged update with one navigation, save intact). The offline-ready check now reads Settings, since the notice no longer covers a new player's first screen. One earlier run against the old build failed its merge check once because the 1.3 starter bench cascaded a merge — a property of the old build's random starter layout, not of 1.4.

**Performance** (`npm run perf`, 390×844 @3×, 4× CPU slowdown, software rendering): dragging on a full board p95 16.7 ms; live race 52 fps (1.3: 49–54); reveal 52–57 fps; usable Garage on a cold throttled load 2.1 s (1.3: 1.6 s — the bundle grew ~14 KB gzipped). The busiest new scene (Downtown night, Lumen with Surge, 4×): p95 16.8 ms.

### 1.3 · Open Road

**Automated tests** (`npm test`): 70 passing. New in 1.3: the teach-through-play steps (fresh save walk-through, out-of-order play, resume after closing mid-step, Skip, a returning save opening at its progress with no beginner prompts, the equip-cap tip), the Open Road rules (event-gated unlock, class-meet car switch, medals paying once per medal, trophies awarded once, parts above the cap running at the cap tier, crew nitro), and a chapter playthrough.

**Clean save → Muscle** (`npm run playthrough`, simulation, ordinary luck, 5 seeds): Corsa Rojo 2:21–2:36, Vexa GTi 9:39–10:35, Ironhorse 19:21–21:50; longest run of one race 3; 0 s stuck on ingredients; 0 s waiting.

**Clean save → Altamar GT** (`tests/chapter.test.ts`, simulation, perfect-timing and mixed-timing players, 2 seeds each): **39.3–41.2 min**, 122–129 races, longest run of one race 3, T6 Engine crafted at 6.8–11.4 min. Honest note: Rep for the GT comes from rotating through the coastal rounds, so Harbor Launch and Cliffside Esses are each run 14–16 times and the Maple Mile 27 times across the full 40 minutes (never more than 3 in a row); the Coastal Crown itself takes 1–2 attempts.

**Race checks** (same seed, same car): a T5 Ironhorse wins the coastal rounds 8–10 times in 10 with a Perfect boost and 0–3 times in 10 with an ordinary tap, so both the build and the timing matter. Played and checked in the browser: countdown (no position shown until GO), pause and resume, backgrounding (pauses, shows Resume on return), closing mid-race (no payout, nothing stuck), last place on the coast, a close finish (“WIN! 0.1 s ahead” with the crossing on screen), a rival win, and Race again.

**Layout** (`layout.cjs` in this session: 320×568, 360×640, 390×844, 430×932, 844×390, 667×375, 1280×800; normal and 125 % text; fresh and late-game saves; Garage, Race, Showroom, How to play, Settings): no sideways scroll, no clipped text, no overlapping controls on the top layer, no target under 40 px. Fixed on the way: top-bar balances clipping at 360–390 px with large numbers and with enlarged text (now glyphs, then a two-row bar), the bench not refitting when the bar grows, a 36 px coach button, 30 px settings toggles and a 34 px scrap press. `npm run check:input`: 24/24.

**Production smoke test**: 22/22 at `/Rev-Up/`, upgrading **from the build currently on `gh-pages`** (1.2) to this one: same save key and Home Screen identity, scoped service worker, offline relaunch with a merge and a full race, staged update offered on a safe screen, old cache removed, one navigation, save intact.

**Performance** (`npm run perf`, emulated 390×844 @3×, 4× CPU slowdown, software rendering; runs vary by ±3 fps):

| Measure | 1.2 | 1.3 |
| --- | --- | --- |
| Dragging on a full board | 59–60 fps, p95 16.7 ms | 59–60 fps, p95 16.7 ms |
| Live race | 54–57 fps, p95 33 ms | 49–54 fps, p95 33 ms |
| Reveal | 53 fps, p95 33 ms | 56 fps, p95 33 ms |

The race costs about 7 % more than 1.2 for the new effects (pack camera, overtakes, motion-blurred wheels, Perfect presentation). Profiling found and fixed three real costs on the way (the nitro button rebuilding every frame, car sprites re-rendered as the camera zoomed, and the effects-quality setting bouncing between resolutions); if a phone stays slow for two seconds, effects drop for the rest of the race.

### 1.2

**Automated tests** (`npm test`): 62 passing — the 1.1 rules, race and save suites plus: a 1.0 save loaded from storage that now qualifies for two cars (each owned once, revealed in order, survives closing mid-reveal), an earned finish persisting across reload into the next race, the Tapeback Trophy gate and balance (T2 Tapeback with good nitro wins ≥7/10 seeds, T1 without nitro 0/10), the Fresh-route bonus paying once and not on an immediate repeat, and live racing while the crew runs a Quick Race.

**Clean save → Muscle** (`npm run playthrough`, **simulation**: scripted player through the real game API, 1.3 s per drag, race time + 7 s menus per live race, baseline luck — every roll Standard, zero Mint/Polished — 5 seeds):

| Measure | Target | Before (1.1) | After (1.2) |
| --- | --- | --- | --- |
| First merge | ≤ 5 s | 2 s | 2 s |
| First race launched | ≤ 30 s | 7–10 s | 7–10 s |
| First race finished | — | 34–38 s | 34–38 s |
| Beater | 2–4 min | 2:21–3:37 | 2:20–4:04 |
| Hot hatch | 10–14 min | 11:23–12:37 | 10:40–13:45 |
| Muscle | 20–25 min | 20:47–22:38 | 19:36–22:47 |
| Longest run of the same race in a row | — | 19–22 | 3–4 |
| Time waiting with nothing to do | — | 5:23–7:58 | 0 s |
| Races to Muscle (of which Quick) | — | 44–48 (22–30) | 54–59 (17–20) |
| Merges to Muscle | — | 149–163 | 132–142 |
| Time stuck on ingredients (Rep met, keystone missing) | — | 0 s | 0 s |

Keystones (T3 Tires, T4 Turbo, T5 Engine) are crafted well before their Rep in every seed, so the main route never stalls on a rare drop; Rep is the pacing lever and the Fresh-route rotation spreads it over all five events.

**Race checks** (seed 11, Tapeback with T2 parts, Crusher Run, same setup): no nitro 20.02 s (3rd, 0.3 s behind first), mistimed nitro 19.78 s (2nd, 0.1 s behind), perfect nitro 19.24 s (1st, 0.5 s ahead).

**Production smoke test** (`npm run smoke`): 22/22 at `/nested/path/Rev-Up/` (manifest, icons, scoped service worker, offline relaunch with a merge and a full race, staged update with one navigation and the save intact). Also 22/22 at the real `/Rev-Up/` path upgrading **from the currently deployed 1.1 build on `gh-pages`** to this build (`SMOKE_PREFIX=/Rev-Up/ SMOKE_V1_DIR=<gh-pages export> npm run smoke`): same save key and Home Screen identity, old cache removed, no reload loop, save unchanged.

**Interaction checks** (`npm run check:input`): 24/24 — keyboard merge and scrap (with the equipped-part warning), non-matching taps never mutate the board, reduced motion, no page scroll, two-tab handover, oversized balances at 320 px, and board + overflow + scrap + Race + nav fully on screen at 320×568, 360×640, 390×844, 430×932 and 1280×800 with an empty, a full 5×6 and a full 6×7 bench (smallest cell 36 px on a full 6×7 bench at 320×568).

**Performance** (`npm run perf`, emulated: 390×844 @3×, canvas DPR capped at 2, 1.6 Mbps / 150 ms RTT, 4× CPU slowdown, software rendering, no GPU):

| Measure | Before (1.1) | After (1.2) |
| --- | --- | --- |
| Usable garage, cold load | 1.55 s, 137 KB | 1.63 s, 168 KB |
| Dragging on a full board | 59 fps, p95 16.7 ms | 59–60 fps, p95 16.7 ms |
| Live race | 54 fps, p95 33 ms | 55–57 fps, p95 33 ms |
| Reveal | 51 fps, p95 33 ms | 53 fps, p95 33 ms |

## Known limitations

- Downtown Nights is a short chapter for a skilled player (about 8 minutes from the Altamar to the Lumen); the long tail is optional — goals, medals, the Paint shop and records.
- The no-nitro player reaches the Lumen at 54 min by spending on Tune-ups and repeats each Downtown event 7–18 times (never more than 3 in a row).
- No physical phone was tested; device numbers are emulation.

- At 320×568 with 125 % text and very large balances, the bench reaches its 36 px minimum and the Garage body scrolls a little to reach the overflow tray.
- The coach callout sits over part of the bench while it points at the pair to merge.

- Not yet tested on a physical iPhone or Android device (Home Screen standalone launch, safe areas, pause/resume and save persistence after relaunch should be confirmed on hardware).
- Quick Race and the Race button always race the active car; switch cars in the Showroom.
- On a full 6×7 bench at 320×568 part cells shrink to 36 px (below the 44 px target for primary controls); the Race and recovery buttons stay at 44 px+.
- Emulated frame times come from software rendering; real phone GPUs should do better, but this is unmeasured.
- One model per class and six tracks in this release; Downtown, Transmission/Aero and T7–T10 exist in data only.

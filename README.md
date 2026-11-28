# Rev Up

An original, portrait-first, installable mobile web game. Merge parts on a workbench, race for cash and reputation, and fill a showroom one earned car at a time — from a taped-up scrapyard hatchback (the **Tapeback 1.1**) through muscle, grand tourers, rally and endurance cars to six supercars: the Ardent Spyder, Vireo 9R, Mako TT, Meridian LT, the flagship **Sovereign** and the electric **Tempest E4**.

- **Play:** https://georrrgess-jpg.github.io/Rev-Up/ (once GitHub Pages is enabled — see [Publishing](#publishing))
- **Stack:** TypeScript + Vite, DOM/CSS for menus and the board, Canvas 2D for the race, reveal and car art, synthesized WebAudio (engines and an original soundtrack, generated at runtime: no audio files). No backend, no account, no runtime dependencies.
- **Size:** ~222 KB JS + 25 KB CSS gzipped (the title screen is a separate ~4 KB chunk), plus one bundled typeface (Barlow, three weights, ~68 KB woff2, SIL OFL); all art is drawn in code (no image downloads except the app icons).

## Update 1.10 · Redline

- **No shift before green.** A SHIFT tap only changes gear while the cue is green (or late, past the window). Before that — including right after GO, when the launch holds the revs inside the band before the first window opens — a tap is a fumble: no gear change, "Wait for green", and a 0.12 s guard so mashing SHIFT is never quicker than waiting for green. Guarded by `tests/shift-no-early.test.ts` (every car, tapping every frame from GO; whole races; mash vs calm).

- **First session = one test run.** Merge (the matching Engines are highlighted; "T1 Engine → T2 · fit: 71 mph"), fit (one tap; "Top speed 65 → 71 mph"), race Yard Sprint with shift taught first and nitro only when a boost zone arrives and no shift is due, then a result block measured from the same race ("Your T2 Engine: 0.6 s faster here, mostly on the straights"), the next car's remaining requirement and one button to it. Fresh save at 390×844: first merge 4.6 → ~2.3 s, first race launch 5.5 → ~3.5 s of interaction (~31 → ~12.5 s including reading). Resumable (`onboard` in the save), skippable, never shown to existing saves; a five-line refresher and a "Practise a coached race" button in the ? guide; Rep, cash, scrap, nitro bank and equip caps explained one line at a time when first relevant; deterministic recovery (a free targeted crate during the first session; a full board offers merge → recycle → shelf → scrap).
- **Instrument cluster.** One layout on every car: a five-lamp shift light that becomes one worded pill (SHIFT / LATE / BRAKING / LAUNCH), the window bracketed on the RPM ring by shape (hollow = coming, filled = tap now, dashed = braking), a large fixed-width digital MPH from the sim, the gear box and nitro pips. The speed range is fixed per race and sized to the car (never pinned by a Perfect boost); only the sweep is eased, never the digits; an acceleration segment shows speed gained. Starter, sport, pro and flagship dressings (Sovereign gold, Tempest cyan). The cue and the tap judgment read one attempt: in the browser every upshift tapped on SHIFT graded clean (Ironhorse 3/3, Strata 4/4, Tempest 2/2 after a launch-control tap).
- **Nitro in three beats** tied to the sim's boost state: Ready (a steady glow at the car's own exhausts as a zone nears; the nitro button holds still during a shift window), Fire (per-car exhaust shape — flames, light trails, the Tempest's arcs — road light, an eased camera surge, streaks, per-car sound) and Settle (one envelope fades everything as the boost actually ends). Perfect boosts are gold-white, bigger and chime, and keep their real gain (Ironhorse +14.7 vs +9.6 mph; Lumen +20.1 vs +11.7). A "Lighter race effects" setting (also automatic on slow phones and with reduced motion); effects clear on pause, restart and finish.
- **Test & Compare.** From a picked-up part, a Workshop part row or a result: drive two short live runs on a fixed slice of a real track (current build, then the candidate; no rivals, no nitro, nothing earned or spent), then compare launch, exit speed at a named bend, top speed, finish time and clean shifts, with a verdict separating the part from the driving, and one button to Fit, Craft or Order it. A quick headless estimate is offered too. Corsa Rojo + T3 Tires at the Scrapyard strip: −0.39 s, +3 mph out of Crusher Bend.
- **Results with purpose.** "What changed" vs your last run or PB; the bend that cost most ("out at 49 mph vs Anouk's 51") and a grip tip only when the data supports it; a compact telemetry strip; one next step; rival prizes after a loss.
- **Rivals race.** Seeded race craft on its own random stream: bogged and great launches, late braking, defending a straight; called out on the HUD, with PASSED tags. Balance-neutral (deciding rival +0.008 s on average; guarded by a test).
- **Smoother launches.** The race picks its canvas resolution during the countdown on phones that can't keep up: frames over 50 ms in the first 2 s after GO ~21 → ~12 (4× slowed phone).
- **Progression.** Foundry Sprint opens with the Vexa (its first win pays a T4 Engine stage); Midnight Run pays a Corvo stage; series rounds open after three podiums; Bridge Speed Trap medals count as Downtown stars (Kestrel needs 2, Main Event 3); Main Event heats eased; Rep: Ironhorse 1,500, Corvo 5,400, Strata 8,400, Ardent 10,500. A live race with every shift clean pays +10% of the win purse (never Quick Races). Weak player: Altamar stretch 15.6 → 3.5 min, Tempest 125 → 115 min.
- **Redline Series → Kestrel 1600 R.** Five Rival Run steps after the Strata GTR (Shakedown, Hole Shot, Stock R, Apex Hunt, Redline Final vs Kit Navarro), each paying once (paint, T8 Turbo, a Tune-up stage, T9 Tires), ending in the **Kestrel 1600 R**: a cap-T9 lightweight variant, fastest on the twisty courses and slowest of the late cars on long straights. Race-menu card, a Next Goal option and a lit Showroom preview. Unearned finishes say how to earn them and preview on the car. Dev presets `redline`, `redline5`.

## Update 1.9 · Circuit

- **Opponent names.** The roster of rival names was reworked to read like real people: ordinary, varied first names and surnames from many backgrounds instead of invented-sounding ones (e.g. Victor Sandoval, Lorraine Dunn, Etienne Moreau, Anders Kvale, Caroline Stern, Imani Whitfield, Marta Kade, Chidi Okafor, Tilly Brennan). Names that already read as real people or nicknames were kept (Rusty Ray, Tug, Dex, Hank “Two-Tone”, Oz Kowalski, Kit Navarro, Kenji Mori). Rivals are saved by id, so existing saves are unaffected.
- **Showroom scrolls vertically only.** The full-width car stage made the scroller 12 px wider than the screen, so a sideways drag moved the page; it is now clipped (a touch swipe sideways moves nothing).

- **Opponents drive their own cars.** 20 original opponent-only designs across the ladder (e.g. Pellet K-Van, Mote 660, Brava 850, Haulmark 2500 pickup, Dray Courier van, Ostler Estate, Lark Roadster, Cordell Six sleeper, Prism 88 wedge, Aldermoor Regent, Tessera DR drift coupé, Dunerunner T8 trophy truck, Sandpiper Buggy, Aster GT1, Halden Aero LM, Corsair Targa, Varga Twin-T, Wisp Clubman, Kade Q4), each with its own lamps, wheels and engine timbre. A rival's `car` stays its performance class; the new `look` only changes what is drawn, named and voiced, so race results are unchanged (tune-ladder probe identical). No race has two look-alike rivals; one-make class meets keep their model but each driver has a visibly different build. Art sheet: `art.html?sheet=rivals` and `?sheet=grids`.
- **Goal button:** its second line stays inside the button and shows only the destination (the requirement is already on the card).

- **A direction every session.** One **Next Goal** on the Garage home: the reward, the requirement still missing, and one button that goes straight to the right race, craft, order, Workshop area, Parts Shelf or upgrade. Tap the card for why it's worth chasing, the stages, what you can reach this session, an alternate route, and **Change goal** (any chaseable car or a challenge). Hints differ per screen instead of repeating.
- **Unlocks in paid stages.** Every car from the Vexa GTi on unlocks in stages, each paid once: halfway Rep (a part two tiers under the keystone), the keystone crafted (a free Tune-up stage for the car you drive), a top 3 in the unlock race (scrap for two race kits), and link stages (e.g. win the Esplanade GP: a T8 Turbo toward the Halcyon). Three live podiums count as a stalled unlock race done. Measured (simulation, clean / mixed / weak): longest stretch without a reward 8:53 / 10:30 / 6:53 → 5:01 / 4:58 / 5:18 min; Strata GTR stretch 11.8 / 14.9 min → split in two by the Ardent (about 7 + 6); Mako TT 8.7 / 9.6 / 12.8 → 3.5 / 3.8 / 5.0 min; weak player Ironhorse 21.6 → 13.6, Kestrel 21.6 → 11.3 min. Rep thresholds trimmed (Vexa 520, Ironhorse 1,650, Strata 8,800, Halcyon 13,500, Mako 18,000, Sovereign 22,500).
- **Parts Shelf.** Parts above your car's cap go to storage from the board (**Store**, which names the car that can use them) and come back when there's room. Surplus has immediate uses, each previewed: trade toward an ingredient your car can use, pay part of a Garage upgrade, or recycle toward a priced scrap order. Fitted and starred parts are protected; crafted credit is kept; no duplication or self-funding loops (tested).
- **Garage upgrade paths.** Bench (6×7 board → Merge All by family → Merge All banks nitro), Parts Shelf (4 → 10 → 16 with overflow → 24 with one-tap store → 36) and Workshop counter (10% off orders → Polished orders → better trade-ins → 20% off), with later ranks opening at the Ironhorse, Altamar, Corvo, Lumen and Vireo. The Shop's Garage tab shows current benefit, next benefit, exact price and lock together; spare parts can pay part of a rank.
- **Competition.** A 10-rung **rival ladder** with named opponents, each fast on particular courses (shown before you race), ending with a boss; the **Heritage Cup**, an 8-round class series for earlier cars (prizes at 3, 5 and 8 wins); **time trials against your personal-best ghost** (a translucent BEST car and a live delta); one-time skill awards (perfect launch, clean sweep, flawless, beat your ghost, launch control). Results explain close finishes from race data ("Lost 0.4 s in the hairpins: grip 2.31 vs Anouk's 2.48") and suggest a fix. One-tap restart; quick retries.
- **Race drama.** Tighter camera on launches, passes and the finish; start gantry lights, grandstands, marshals, finish boards and a chequered finish gantry; audible nearest rivals; three new courses (Harbour Esplanade, Lagoon Causeway, Airfield Sprint) with their own scenery; the start curtain hides the scene build, so tapping Race reaches the first race frame in ~220 ms instead of ~410 ms (4× slowed phone).
- **Three more supercars.** **Ardent Spyder** (featherweight open-top track car; beside the Halcyon after the Strata; wins the Esplanade GP), **Meridian LT** (long-tail highway car; beside the Sovereign; wins the Causeway Run) and **Tempest E4** (four-motor electric flagship with **launch control**: tap ⚡LAUNCH on GO; the last car; wins Launch Control). Each has its own proportions, wheels, lamps, engine voice, signature finish and reveal. All six supercars win their own course in clean, ordinary and missed shifting.
- **Presentation.** A cinematic title (a tracking shot along the Tempest with a light sweep and flare, then the wordmark and Play; return launches ~1.4 s); the Garage leads with the goal and the board, and a picked-up part offers Fit · Store · Recycle; the Workshop sits in a detailed service bay; the Race menu leads with the recommended event, its reward and one Race button (rules behind a tap); results show one reward block and the next useful step; the Showroom gives the car the screen, with Customize, Compare and Race. Existing cars got layered lamps, richer paint and fixed nose details.
- **Smoother.** Merges no longer force layouts (4× slowed phone: drag merge response ~170–190 → ~80–105 ms); the Workshop's hood eases in 0.4 s; the tips overlay no longer rebuilds every race frame; car sprites are evicted least-recently-used instead of all at once.

## Update 1.8 · Master update

- **Title screen.** A short, skippable intro: an ignition cue, a light sweep over the Sovereign's silhouette, the wordmark and the soundtrack's hook, then **Play**. Repeat launches show your own car for about a second and go straight to the Garage. Tap skips; mute and reduced motion are respected; the module loads on its own small chunk and is precached for offline play.
- **Garage.** Brighter panels; the top bar separates earned progress (Garage Level, Rep and the next Rep threshold) from the wallet (cash, scrap); the goal card lists what you still need, unmet first; a car tile beside the fitted slots opens the Mechanic Shop (or fits better parts in one tap); Race is the one primary action. Merge tiles are larger on every screen (390×844: 61 → 68 px on the 5×6 board, 48 → 55 px on 6×7; 320 px phones 37 → 40 px). A full board has one ranked recovery action: merge a pair, else recycle unused parts (scrap shown), else scrap the least useful part.
- **Mechanic Shop.** The car sits in a service bay: tap its engine, wheels or body (or the tabs) for **Engine Bay** (engine and turbo parts, a ▶ Hear engine preview, the hood opens), **Wheels and Tires** (tyres and wheel sets), **Body and Paint** (finishes, materials, liveries, restoration) and **Tuning** (Tune-up stages, Build Sheet, race-day kits — there is no gearing choice in the race model, so none is invented). Every choice previews on the car and in the stats first; one button commits with its exact price and currency or says where your old part goes. Swaps of parts you own never need space; a purchase with a full inventory is blocked before anything is charged. Opened from Pit Setup, Close returns to the same race. The Shop is grouped by purpose (Parts · Crates · Garage · Style · Scrap), each tier has its own metal colour, and locked items say what opens them.
- **Azure Riviera and three supercars.** After the Halcyon X: the **Vireo 9R** (nimble, high-revving V10; 15,000 Rep, a T9 Tires keystone, win the Summit Gala), the **Mako TT** (twin-turbo V8; 18,500 Rep, T9 Engine, win Corniche Hairpins in the Vireo) and the flagship **Sovereign** (V12 hybrid, cap T10; 23,000 Rep, a crafted T10 Engine, win Port Sprint in the Mako). Each has a course that suits it: Corniche Hairpins (tight), Port Sprint (launch, short straights) and the Grand Riviera final (long and fast). Part tiers now run to **T10** (merge only; T9 orders $32,000 once the Sovereign is the goal).
- **Spare parts and scrap.** A three-stage **Concours restoration** for every car from the fourth on, paid in scrap (looks only, a badge at stage 3, shown on the car). Bulk recycle shows its exact scrap return and what it protects before you tap. A sweep over every tier (T1–T10) checks that no buy → recycle, order → deliver or polish loop makes money.
- **Car art.** All 13 cars have sculpted fenders, paint that answers the light, layered lamps, drilled rotors and calipers, and side details that now carry into races. The supercars stand on a turning, spotlit platform in the Showroom. Concours stages and T10 parts have their own looks; brake lights sit on each car's real tail lamps.
- **Racing.** Riviera and Neon Skyline scenery with landmarks; braking boards, bend warnings (with the speed this car can take them), chevrons and straight boards sized to their text; bends marked on the progress bar; car-specific burnout, launch smoke, gravel, light trails and exhaust pops; the camera looks further ahead at speed. MPH everywhere is the simulation's one conversion.
- **Shifting.** The shift window is measured once per attempt (nitro and boost zones no longer move it), a braking zone makes one rev-matched downshift into the right gear instead of a saw-tooth of two, the arc holds still and dims while braking, the needle is the judged engine speed while green, and a green tap right after an automatic shift is no longer swallowed. Measured: arc moves inside a live attempt 6 → 0 (sim) and 4 → 0 (browser); clean taps 60/60; automatic downshifts 23 → 16 over the same races.
- **Audio.** Every car has its own engine (real firing pitch from cylinders and rpm; Vireo V10, Mako twin-turbo with whistle and blow-off, Sovereign V12 hybrid whine), with upshift cut and bark, downshift blips, launch, burnout and tyre squeal synced to the race's actual gear changes and slip. Better engine parts sound brighter and meaner. An original soundtrack (D minor, 104 BPM, one hook) plays a calm Garage loop, a race arrangement that builds with the race, an intro and results stings. Separate **Music** and **Effects** sliders; a limiter keeps peaks under −3 dBFS, and shift cues duck the engine.

## Update 1.7 · Builds, Jobs and steady shifting

- **Shifting you can time.** Measured before: green windows as short as 100–200 ms in first gear on quick-revving cars (208 of 808 windows under 400 ms), and up to 5 automatic downshifts a race, some while just cruising a bend, none signalled. Now each upshift gets its own window sized to how fast the needle climbs in that gear — at least 0.45 s for every car and gear, 0.5 s for the first three cars. The box only shifts down under real braking (never while accelerating, cruising or boosting; at most twice per braking zone, 0.5 s apart), lands below the next window so the light always goes "soon" before green, and flashes "↓3 Braking downshift". Past the window the car sits on the limiter for 0.43 s before the automatic shift. A 200 ms-reaction tapper on a 4×-throttled phone went from 58/64 to 60/60 clean shifts.
- **Build Sheets — a home for spare parts.** Every car has an Engine, Chassis and Intake build. Donate a spare part for points (2 one tier under the car's cap, 4 at it, 8–12 above; Polished ×1.5, Mint ×2); four stages per build (8/12/16/24 points), the third needs a Polished donor and the fourth a Mint one. A full build adds up to +3% top speed, +2% grip, +3% acceleration — about half a Tune-up, off in stock-class races. Keep / Recycle shows each part's build value next to its scrap value.
- **Fab bench — something to spend scrap on.** One-race kits: Nitro canister (+1 charge), Soft compound (+2% grip), Launch kit (+6% acceleration), Race fuel (+5% top speed). One per race, armed in Pit Setup (kits that suit the track are highlighted); a kit is used only when a live race is committed. Priced at half the recycle value of a part of your best car's tier (15 scrap at the Ironhorse, 60 at the Lumen, 255 at the Halcyon), so it stays relevant to the end. Builds and kits open with the fourth car.
- **The Job Board** (opens after your third race): three short jobs at a time — merge parts, deliver a specific spare part (sometimes Polished), win a race under a condition, land clean shifts or Perfect boosts, or take an older car to the podium. Jobs pay at once (about half a win purse), refill 4 minutes after a clear whether you play or not (one per slot, so nothing stacks), and build a **streak** (+10% pay per clear, up to +50%; it pauses while you're away and never takes anything back). Every job adds Garage XP toward a **Garage Level** with a named next reward: crates and scrap, a fourth job slot, a free livery, faster refills, Polished parts, wheel sets, badges. It shows as a pill beside the goal card, in the Race menu and on the result card.
- **Balance** (simulation, time to the Halcyon X): clean player 64.0 min with or without the board; a weak player (missed shifts, no nitro) 110.8 → 94.3 min with the board (it works as catch-up); builds and kits move each car at most ~1.5% sooner against the same bot.

## Update 1.6 · Pit Stop

- **Spare parts and scrap have a use.** **Keep / Recycle** (tap the scrap press with nothing selected) lists every spare with what it is good for — a better part for one of your cars, an ingredient for a craft, an alternate build — and the scrap it gives; star a part to protect it; bulk recycle never touches fitted or starred parts. The Workshop's **Scrap** tab orders a chosen family and tier for scrap with the price shown up front (T1 2 · T3 14 · T5 64 · T7 256; recycling returns half), or **polishes** a part. An ordered part can feed a craft, but the next car's keystone is still a merge you make yourself. Rapid taps charge once; a full bench queues the part.
- **Away cash no longer skips the game.** It used to add every owned car's rate (late game: $72 a minute, $34,550 for a night). Now it is one budget: a full night pays 1.5× the win purse of your best open ordinary race (2× over 12 h with the Lock-up) — about one live race. Measured: early $25 / $210 / $210 for 1 h / 8 h / 24 h away, mid $90 / $720 / $720, late $180 / $1,500 / $1,500. The claim shows the exact bonus and whether the cap applied; claims don't stack across cars, tabs or reloads; a claim earned before the update is paid in full.
- **Signs fit their boxes.** Track signs (Ray's Yard, Maple, Summit Gala, Bend) are sized from the measured text; the race gauge and clock no longer clip.
- **Steady downshifts.** The shift light and the tap judgment now read one shift-attempt state with a fixed window; braking shows no cue (a tap says "Braking — wait"), and the needle no longer lags the revs.
- **Pit Setup** on every race card: the car, the track's demands, fitted parts and the best parts you own with what each swap changes; keep the build, swap, or apply the recommended setup and start. Missing a useful part? It points at the exact merge or Workshop order and brings you back to the same race.
- **Rival Runs:** short replayable challenges with a one-time prize — **Launch Duel** (Tapeback only vs Tilly Brennan; a T3 Turbo), **Fifth Gear** (Vexa GTi, no nitro, clean shifts vs Sol Ortega; the Checker fade livery), **Apex Duel** (Ironhorse with every part at T3 vs Kit Navarro; Kit's Apex Red paint). Each shows eligible cars, objective and prize first, keeps your best result, and suggests a specific part or technique after a run.

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
- **New endgame:** the Desert (Corvo Rally, boss Lorraine Dunn) and the Summit (Strata GTR, Halcyon X, boss Anders Kvale), tiers up to T9, engine upgrades that change look, sound and stats, per-car milestones and class events that bring older cars back.
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
  - **Final: The Main Event** — a knockout: street heat (top 3 through), bridge heat (top 2), final one-on-one with **Victor Sandoval**. Change cars between heats; losing a heat starts again from heat 1. Needs the Kestrel and 4 stars. Winning pays $1,500 + the **Main Event Neon** paint + a badge.
  - **Marquee: Lumen RS** (hypercar, cap T7, the Main Event win + a crafted T7 Turbo): cab-forward body, light-bar face, active wing, aero wheels, violet underglow, its own V12-and-whine voice, a violet **Surge** trail — and Perfect boosts at 1.7× instead of 1.5×. Fastest car on any highway, heavier than the Kestrel in tight corners. **Midnight Run** is where it belongs (a Lumen-against-Lumen rematch only it can win).
- **The Altamar GT now follows the Coastal Crown** (its Rep sits just past the Crown): 25 min instead of 40, with no coastal grind.
- **Reward ladder.** Early: parts you can order, garage upgrades, colours, steelies, Tapeback rust repair. Middle: sport wheel sets, Pit crew, metallic paint, Stock Cup. Late: pearl and candy paint, wire and aero wheels, Tapeback brightwork, signature finishes, Main Event Neon. Marquee: the Lumen RS.

### Cash as a game system

One tuning table in `src/data/tables.ts` (Economy block) holds prices, payout shares, rates. Cash buys things; Rep marks progress; scrap orders chosen parts and polishes them (1.6); the UI labels which.

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
| "Beat Rusty Ray for his Crown Teal paint and to open the Suburbs" (Coastal Crown) | "Beat Etienne Moreau for the Crown Teal paint" |
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

- **Open Road chapter (after the Ironhorse).** The **Coastal Highway** opens with three new tracks that race differently — **Harbor Launch** (a long launch and two straights: Turbo), **Cliffside Esses** (three tight bends: Tires), **Coastal Crown** (two long highway runs and a fast sweeper: Engine). The three rounds are a staged rival series that ends with **Etienne Moreau** in the Coastal Crown (Crown Teal blueprint, “Coastal Crown” badge, $600, 5 crates). The marquee reward is a new class and silhouette: the **Altamar GT** grand tourer (cap **T6**; 5,600 Rep + a crafted T6 Engine + the Coastal Crown).
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
- **Crates.** A free printer makes a crate every 20 s while the game is open (pauses at 10 waiting). Crates open themselves when there is room (board first, then tray) and wait unopened when both are full. The **Scrap** press works on board and tray parts (tap it with nothing selected for **Keep / Recycle**). Scrap orders a chosen family and tier in the Workshop at twice the part's recycle value, polishes a part, or buys crates; buying and recycling always loses scrap.
- **Equip.** The active car auto-equips the strongest part per family up to its equip cap. Stronger parts above the cap stay on the bench and are flagged. Scrapping an equipped part asks first and names what equips next.
- **Racing.** Three rivals, a fixed-timestep (60 Hz) simulation on segmented tracks (launch, straights or highway, a bend). Amber **nitro windows** on the two straights are telegraphed on the road, on the progress bar and with an optional beep; a tap inside a window is a **Perfect** (1.5× effect), outside it still boosts. Every finish pays cash, Rep and crates scaled by place, with the real time gap and one next step. Rewards are committed at the finish line, so closing the page cannot lose or double them.
- **Quick Race.** After a live win, an ordinary event can be raced by your crew in the background: same simulation without nitro, the placement's base payout, finished after the race's real duration while you keep merging. First-win bonuses, precision bonuses and rival rewards need a live race.
- **Cars.** Junker (start, cap T2) → Beater (70 Rep + crafted T3 Tires, cap T3) → Hot hatch (600 Rep + crafted T4 Turbo, cap T4) → Muscle (1,850 Rep + crafted T5 Engine, cap T5) → Grand tourer (5,600 Rep + crafted T6 Engine + a Coastal Crown win, cap T6). Keystones are recorded in a permanent ledger the moment you craft them (including tiers jumped by a Mint); crate drops never count. The next car sits under a cover above the board with the exact remaining goal.
- **Rusty Ray.** The Scrapyard rival (needs the Beater). First win: the Ray's Rust-Red paint blueprint, the "Scrapyard King" badge, $200, 4 crates, and the Suburbs open.
- **Reveal.** Ownership is saved before the unveil. Drag the cover off (or tap), then a headlight sweep, a camera move and a per-car rev. Skip is always available; an interrupted reveal resumes on next launch.
- **Catch-up.** After ~150 s of active play (and race finishes) without progress on the current keystone, one free crate of that family arrives (once per car). Idle time and reloads earn nothing toward it.
- **Merge All** unlocks after five race finishes or 10 active minutes. It resolves every pair deterministically with normal rules in one transaction, counts toward keystones, and banks at most one nitro (if its longest chain is ≥ 3).
- **Away cash.** One garage budget, not per car: a full claim is 1.5× (2× with the Lock-up) the win purse of your best open ordinary race, building over 8 h (12 h). The board is left alone.

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
src/render/            original car silhouettes (Canvas), part illustrations (SVG), race effects (raceFx.ts)
src/audio*.ts          engine synthesis (audio-engine), per-car voices, race sync (audio-race), soundtrack (audio-music), API (audio-api)
src/ui/mechanic.ts     the Mechanic Shop service bay; src/ui/intro.ts the title screen
src/core/milestones.ts next milestone and earned-vs-wallet summary; src/core/purchases.ts exact price/benefit/lock for every purchase
src/core/goals.ts      Next Goal: goal options, the recommended goal and its action, per-screen hints
src/core/shelf.ts      Parts Shelf: store/return, earliest car per part, trade / contribute / recycle-toward
src/core/circuit.ts    rival ladder, Heritage Cup, ghosts, milestones, competitionSummary, explainFinish (data: src/data/circuit.ts)
src/render/bay.ts      the Workshop service bay; src/render/revealFx.ts signature reveals
src/sw/sw-template.js  service worker template; vite.config.ts fills in the version and asset list
src/dev.ts             dev-only late-state presets (stripped from production builds)
tests/                 rules, race, progression/save tests and the playthrough bot
scripts/               icons, static server, smoke, perf, input checks, gh-pages publish
```

**Dev shortcuts** (only in `npm run dev`, never in production): `?dev=beater-ready | ray | muscle-ready | late | desert | summit | finale | slow | riviera | super1 | super2 | ardent | meridian | flagship | tempest | shelf | full | fullx | cascade | offline | reveal` (`?intro` forces the title screen in automated browsers) loads a late or edge-case state, and `&seed=123` fixes the RNG.

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
| `OFFLINE_HOURS`, `OFFLINE_BUDGET_RACES` | 8/12 h, 1.5/2 purses | Away claim (one budget per garage) |
| `scrapOrderCost`, `polishCost` | 2× / 1.5× recycle value | Workshop scrap prices |

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

### 1.9 · Circuit

- **Tests:** 317 passing, 13 probes skipped. New: `garage-paths` (26: branches, goals and hints, stages, persistence route, the shelf, no-loop and protection checks, upgrade ranks, migration), `circuit` (12: ladder, series, ghosts, milestones, clean vs missed on the same event, a fitting part/tune changes the result, home-course wins), `art` (+3), and the bot/economy audit/playthrough now run to the Tempest.
- **Release checks:** build, smoke 22/22, input 24/24.
- **Integrated path** (390×844, the old slow stretch `?dev=slow`): the goal card named the Ardent Spyder and what was missing; a T9 Engine on the board offered "Store for Halcyon" and went to the shelf; the goal's button picked up the Turbos, and crafting the T8 paid its stage (a free Tune-up stage, toast shown); the goal moved to "Race Summit 1000"; a 2nd place there paid the Halcyon's podium stage (512 scrap) and the goal advanced. Full Ardent unlock: reveal with its signature moment, active car, goal moved to the Halcyon; on its home course with fresh T8 parts it took 2nd by thousandths with 12/12 clean shifts, and the result explained the gap. No page errors.
- **Layout pass** (320×568, 390×844, 1280×800; title, Garage incl. full 6×7, a $90k crowd and a picked-up over-cap part, Shelf, Shop Garage tab, goal sheet, all Workshop areas, Race menu, Pit Setup, jobs, Settings, Showroom, reveal, live HUD, results): fixed the "Best vs ghost" card escaping to the screen edge (a class clash with the race ghost) and made the competition strip one compact row on short phones so the recommended race's button stays above the fold.
- **Performance** (production build, 4× CPU, 390×844): tap merges p50 144 ms, drag merges p50 80 ms; Workshop open/close long tasks 290 ms total; tap Race → first frame 220 ms (was 412); mid-race frames 17 ms median. The launch (first 2 s) still has more frames over 50 ms than 1.8 (about 21–25 vs 15) from the launch smoke and close-up camera.
- **Not run:** real phones and speakers.

### 1.8 · Master update

- **Tests:** 277 passing, 12 probes skipped. New: `supercars` (20: unlock ladder and chapter order, each supercar fastest on its course, T10 in every tier system, T1–T10 loop sweep, recycle preview, restoration, purchase info equals the charge, old saves), `shift-target` (one window per attempt, arc fixed through braking holds, one downshift per zone, no green flicker, nitro never moves the window), `race-hud` (one mph conversion everywhere), `audio` (11: every car voiced, upgrades change the sound, nothing sounds after stop, seamless loop), `art` (5: every car drawn, factory looks, service zones). Rival pace re-probed after the gearing changes (all Riviera multipliers ×1.000).
- **Release checks:** build, smoke 22/22, input 24/24.
- **Layout pass** (320×568, 390×844, 1280×800; title, Garage incl. the full 6×7 board and $1.25M balances, Shop tabs, all four Mechanic Shop areas, Spares, Race menu, Pit Setup, Job Board, Settings, Showroom, reveal, live HUD incl. the Yard sign, results): fixed overlapping Body/Wheels tap areas on the car at 320 px and added an open/closed arrow to the race-day kits section; earlier fixes by each area are in the notes above.
- **Browser playthrough** (390×844): fresh save from the title (Play → Garage, drag-merge T1+T1 → T2, fit, race, $0 → $100); returning Riviera save through a Mechanic Shop swap (old part placed on the bench), a bulk recycle (+512 scrap, as previewed), a crate bought for $7,000, a won race paying exactly the $1,400 shown, and the Vireo unlock kept after reload. No page errors.
- **Not run:** real phones and real speakers (audio was checked by rendering and measuring levels, pitch, loop seams and stuck nodes).

### 1.7 · Builds, Jobs and steady shifting

- **Tests:** 229 passing, 3 probes skipped. New: `shift-feel` (window length for all 11 cars on 4 events with and without nitro; downshifts only under braking, spaced, flagged; limiter grace; a 250 ms tapper at 30 fps lands every shift clean), `surplus` (17: donation points and stages, seals, caps, no loops, double taps, kits used once and only on commit), `jobs` (19: unlock timing, seeded jobs, pay once across taps/reloads/tabs, refills and clock rollback, streak, level rewards, old saves) and `jobs-economy` (board on/off ladder times).
- **Release checks:** smoke 22/22, input 24/24.
- **Browser** (4× CPU slowdown, 390×844, 11 races on the late presets): 60/60 clean shifts tapping 200 ms after green; 18 downshifts, all under braking and all signalled. Late save: a Polished T4 Engine donated once (second tap ignored) and kept after reload; Race fuel raised the loaded race build's top speed by exactly 5% and was not used up by leaving the race; a delivery job paid $110 once. No page errors.

### 1.6 · Pit Stop

- **Tests:** 187 passing, 3 probes skipped. New: `pitstop-economy` (17: buy → recycle loses scrap, rapid taps charge once, full bench queues, starred/fitted parts never recycled, keystone still needs the merge, away pay at 1 h / 8 h / 24 h for early, mid and late saves, extra cars don't stack, reloads, two tabs, a sleeping tab, a late save's big old claim paid once), `pit-stop` (13: swap changes the race setup and the sim, no duplicate equipment, merge/order hints, Rival Run rules applied in the sim, prize paid once and kept after reload, old and malformed saves), `shift-attempt` (8: a tap on the visible green is clean on 5 events, 4 cars, at 60 and 8 fps; no cue while braking; fixed window per attempt; duplicate taps shift once).
- **Release checks:** smoke 22/22, input 24/24.
- **Browser walk-through** (late save past its keystone, 390×844): Keep / Recycle listed 18 spares with their uses; three rapid taps on a 64-scrap order bought one part (100 → 36 scrap); a Pit Setup swap shown as "+11 mph" raised the loaded race build by 11.3 mph; a Rival Run started with its own car rule and the result named the gap off the line; away 1 h paid $45, 8 h and 24 h both $360 with "Cap reached", and reloads showed the same claim, never a second one. No page errors.
- **Downshift trace** (4× CPU slowdown): green-while-braking frames 387 → 0 (Canyon Stage), needle-vs-judgment disagreements 27 → 0; at ~11 fps, taps on green 10/10 clean, on amber 11/11 "Early".

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

**Real play in the browser** (production build, UI only): a returning Downtown save won The Main Event final against Victor Sandoval (champion card, $2,580 broken down as purse $900 + Perfect ×2 $180 + rival $1,500), revealed the Lumen RS ("T7 parts now fit · +51 km/h"), raced and won Midnight Run in it, reloaded — Lumen owned and active, title counted once. Also checked: Shop at every stage, Paint shop preview → buy → applied in Showroom, reveal and race, restoration stages, speed-trap result in km/h, knockout heat-out message.

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

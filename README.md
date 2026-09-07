# York County Marine — inventory portal

A redesign prototype for [yorkcountymarine.com](https://www.yorkcountymarine.com), replacing
the Wix site archived in `*.webarchive`.

```bash
npm start          # http://localhost:8899 — serves the site AND accepts saves
npm i -D jsdom && npm test
```

No build step, no framework. `npm start` runs `server.js`: static files plus one
writable endpoint, so the admin can save to disk. `npm run static` gives you the
plain `python -m http.server` equivalent — everything works except saving.

| | |
|---|---|
| `index.html` | Public portal — browse, filter, boat detail |
| `admin.html` | Staff portal — add/edit listings, bulk status, media |
| `assets/js/lazy-video.js` | The `<ycm-video>` element |
| `assets/js/data.js` | Inventory, transcribed from the archive |
| `assets/js/media-library.js` | the 186-photo pool — file and source, nothing else |
| `assets/img/inv/` | 67 photos fetched from the live inventory page |
| `assets/img/boats/` | 119 photos from the archived blog and year pages |
| `assets/js/app.js` | Filtering, routing, rendering |
| `assets/js/config.js` | Persistence adapter — the one seam to swap for a database |
| `server.js` | Dev server: static files + `PUT /api/ads-config` |
| `assets/data/ads-config.json` | Saved state. Created on first save |
| `assets/css/ycm.css` | The whole design system |

---

## What was wrong

Measured from the archived pages, not estimated:

- **Home page: 4.04 MB of HTML** before a single image, plus 145 subresources —
  18 JS bundles, 26 web fonts, 100 images.
- **94 Wix video players on that one page.** Every one ships a poster, a player
  chunk and a metadata request whether or not anyone scrolls to it.
- **The video archive has outgrown the navigation.** Eight pages named
  "Several YCM Videos!", "Even More YCM Videos!", "Tons of YCM Videos!",
  "Millions of YCM Videos!" and so on. Nobody can find a specific boat's video.
- **Nothing is structured.** Boats are paragraphs: `"She's $10,500"`, `"$30k -"`,
  `"FALL SALE $8K!"`, separated by rows of ⚓️. There is no price field, so there
  is no sorting by price, no filtering by length, no "under $15k" link to text a
  buyer.
- **The site apologises for itself, twice:** *"This super awesome website is
  designed to be viewed on a computer (not a cell phone)!"* and *"This page is
  basic, and rather uninteresting"*. Both are load-bearing admissions.

## What this does instead

**First screen ≈ 1.9 MB** (126 KB of code and markup, one hero photo, nine card
thumbnails). Everything below the fold, and every video, is lazy. The old home
page spent twice that on HTML alone.

### Video

`<ycm-video>` is host-agnostic — it takes a poster and a playback URL and knows
nothing about who serves it.

```html
<ycm-video poster="poster.jpg"
           hls="https://stream.mux.com/ABC123.m3u8"
           src="fallback.mp4"
           duration="3:42"
           label="1998 Montauk 17 — walkaround"></ycm-video>
```

Four guarantees, each covered by a test in `tests/t-video.js`:

1. **Nothing loads until you are near it.** 600px out, the poster — and only the poster.
2. **No `<video>` element exists until you ask for one.** A page of 94 players
   mounts zero decoders. Clicking mounts exactly one.
3. **One video plays at a time**, globally, without any coordination code in the page.
4. **Scrolling away detaches the source and frees the decoder** — the poster stays,
   the memory does not.

Plus: hidden tab pauses playback; `Save-Data` and 2G suppress the hover-warm
preload; `prefers-reduced-motion` is respected; HLS plays natively in Safari and
via hls.js elsewhere if you load it.

The floating **video budget** panel on the public page is a live readout of
players declared, posters fetched, and decoders actually alive. It exists to make
the difference legible; delete `mountHud()` in `app.js` for production.

**Recommended host: [Mux](https://mux.com).** Upload once, get HLS with automatic
renditions, a generated poster, and per-video analytics — for a dealer selling on
video, knowing that a listing's walkaround gets watched 20 seconds deep matters.
Roughly $0.05/min encoding and $0.0013/min delivered. **Cloudflare Stream** is the
cheaper flat-rate alternative ($5 per 1,000 min stored, $1 per 1,000 min delivered)
and is the better pick if the archive is large and traffic is modest — likely the
case here. Either way the markup above does not change.

### Filtering

Length, price, and age are first-class facets, each offered two ways — quick
bands for the common question, a dual slider for the specific one:

- **Length** — under 14′, 14–16′, 17–19′, 20–23′, 24′+, and a 7–26′ slider
- **Price** — under $5k through $30k+, "call for price" as its own band, and a slider
- **Age** — 2015+, 2000–2014, 1990s, 1980s, pre-1980, and a year-range slider
- **Engine hours** — under 100 / 250 / 500
- Status, type, builder, trailer included, freshwater, has video, price reduced

Every option carries a **live count computed against the other active filters**, so
the rail never offers a dead end, and options that would return nothing hide
themselves.

Nine one-tap presets sit above the grid — *Ready to run*, *Under $15k*,
*17′ and under*, *Classics (pre-1990)*, *Under 100 hours*, *Trailer included*,
*Has walkaround video*, *Price drops*, *Project boats*.

**All filter state lives in the URL.** `?priceMax=15000&lenMax=17` is a link Dave
can text to a buyer: *"here's everything under 15k, 17 foot and down."* That is
not possible on the current site at all.

### The ads

**Listings come from the live INVENTORY page and nowhere else.** Titles and copy
are verbatim.

That page marks each listing up as a large-font `<h2>`, separated by rows of
anchor emoji. So the parser splits on the separators, takes the largest
title-like heading in each block as the headline, and keeps the rest as body
copy. Boundaries were then checked by hand against the page, because Wix repeats
a model name as a sub-heading and a naive split cuts listings in half.

Result: **36 ads**, with the headlines Dave actually wrote —
*"2022 BOSTON WHALER 160 SUPER SPORT! - 24 total hours!"*, *"Hull # 25 - Very
Early 1975 Boston Whaler 15 Sport"*, *"~~PROJECT BOATS~~"* items and all.

**Only fields the page actually states are recorded.** There is no `make`,
`category`, `engine`, `trailer`, `freshwater`, `location` or `owners` in the
data any more — inventing those is what produced wrong metadata twice. What
survives: year, price, was-price, length, engine hours, status. Any of them may
be absent, and absent renders as nothing rather than a guess.

`length` is the one derived field, read off the model designation itself (a
"170 Montauk" is 17 feet). It is absent where the model does not state one — the
Impact and the T@B camper have none.

Facets follow the same rule: status, length, price, age, hours, price-reduced.
The old Builder / Type / Trailer / Freshwater facets are gone with the data
behind them.

### Photos

**No photo is attached to any ad, and the pool carries no metadata.** Photo
entries are now just a file and a source. The captions and per-photo guesses are
gone: a caption reading "Montauk" beside a photo of something else is worse than
no caption, and two rounds of inference proved it.

186 photos — 67 from the live inventory page, 119 from the archived blog and
year pages.

**Admin → Photos** is the whole workflow:

1. Every ad is listed with its photos and an **Add photos** button (also on each
   row of the Inventory table).
2. That opens a sheet showing every photo not yet used.
3. Click the ones that are that boat — they tick.
4. **Save to this ad.**

Saved photos leave the pool, so it shrinks as you work. In an ad, click a
thumbnail to make it the lead image or hover it to remove. **Not a boat photo**
sets a selection aside — the cat, a delivery truck, a boat sold years ago — and
the **Set-aside pile** button re-opens that for review, with everything
restorable.

An earlier version of this had drag-and-drop, a focus mode, caption search and
model-family chips. It was unusable. This does the same job with a button and a
checkmark.

### Saving

Triage is worth real hours, so it does not live only in a browser profile.

- **`assets/data/ads-config.json` is the saved state.** Both the admin and the
  public site read it at boot; if it exists, it wins.
- **`localStorage` is the unsaved draft.** A "Unsaved changes / Save to disk"
  bar appears whenever the draft differs from the file. **Revert** throws the
  draft away.
- **Save** does `PUT /api/ads-config`, which the dev server writes to disk after
  validating it is JSON, capping the body at 8 MB, and copying the previous
  version into `assets/data/backups/`. Writes are confined to that one path;
  everything else is read-only and path traversal is refused.
- If you are on the static server instead, Save becomes **Download
  ads-config.json** — drop it into `assets/data/` yourself. **Import config**
  reads one back in.

The file is meant to be read by a person:

```json
{
  "version": 1,
  "savedAt": "2026-09-05T15:12:00.000Z",
  "links": {
    "bw-montauk-17-1998": ["assets/img/inv/live_004.jpg", "assets/img/inv/live_005.jpg"],
    "portland-pudgy":     ["assets/img/inv/live_048.jpg"]
  },
  "setAside": ["assets/img/boats/src_012dfbd305.jpg"],
  "listings": [ { "id": "bw-montauk-17-1998", "year": 1998, "price": 30000, "..." : "" } ]
}
```

`links` is authoritative for photographs and listing records carry none, so a
photo-to-boat claim is recorded in exactly one place. Video slots stay on the
listing. A test asserts the round trip is lossless.

### When this needs a database

It will. The seam is already there: `assets/js/config.js` exposes `load()`,
`save()`, `apply()` and `build()`, and nothing above it knows where bytes go.
Swapping the transport is that one file plus the endpoint in `server.js`.

The shape is already relational, which is the part that usually hurts:

| JSON today | Table tomorrow |
|---|---|
| `listings[]` | `listings` — id, year, make, model, length, price, status, hours… (already typed, not prose) |
| `links{}` | `listing_photos` — listing_id, path, position |
| `setAside[]` | `photos.state` — a column, not a separate list |

`ads-config.json` imports straight into that as a seed. What forces the move is
not size — it is a second person triaging at the same time, or wanting an audit
trail of who attached which photo. Until then a file in git gives you version
history for free, which a database would not.

Listings with no photo linked render an "awaiting photography" placeholder, and
the Gallery counts how many are still in that state.

### Admin

`admin.html` — inventory table with search and bulk status changes, a typed
listing editor (price is a number, length is a number, highlights are an array),
drag-and-drop photos, and video attached by pasting a playback URL. Photos are
downscaled to 1600px on the way in.

The **Gallery** tab is the photo pool and its drag-and-drop linking, described
above.

Persistence is `localStorage` via a single `store` object at the top of
`admin.js`. Swap those three methods for `fetch()` calls and nothing above them
changes. **Export JSON** gives you the whole catalogue to seed a real backend.

---

## Theme & identity

**"Desert Tan & Hull Navy"** — pulled from the boats rather than from a nautical
clip-art set. Warm paper ground (`#FBFAF7`) instead of clinical white, deep hull
navy ink (`#0F1C2B`), hairline rules instead of drop shadows, and a single accent
reserved for money. Full dark mode. No ropes, no portholes, and no anchors — the
old site has roughly 200 ⚓️ emoji doing the work of a horizontal rule.

The logo mark is a **Whaler hull on its waterline**, drawn with four strokes: the
stern-view hull, the rubrail stripe that is the Boston Whaler tell, the waterline,
and two ticks of wake. It is legible at 16px, works in one colour, and reads on
navy or on paper. See `assets/img/logo-mark.svg` and `favicon.svg`.

---

## Caveats

- **Photos are unlinked by design.** Link them in Admin → Gallery, press Save,
  and the site picks them up on reload.
- **`npm start` must be the Node server for saving to work.** On the static
  server the admin falls back to downloading the config file.
- **The live 2019 160 Super Sport ad contradicts itself** — its headline says 57
  total hours, its body says 54. Both are reproduced verbatim; the `hours` field
  uses 57. Worth settling.
- **Only the Acadia has a video slot**, because it is the one ad whose own copy
  states a video exists. No playback URLs exist anywhere, so it renders the
  poster-less "no source" state.
- **No video files exist in the archive** — Wix streams them from its own CDN, so
  the archive holds only player markup. Every listing therefore shows its poster
  and reports "no source configured". To see real playback, drop an `.mp4` into
  `assets/video/` and set `DEMO_MP4` at the top of `data.js`.
- Prices and copy are transcribed as of the archive date and will be stale.
- The **Delivery** admin tab is a stub.

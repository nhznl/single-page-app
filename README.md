# Test App

A small installable web app for tracking D, P, and cards-dealt totals.

## Use locally

Serve this directory from any local web server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Install on iPhone (no App Store)

Host these static files on a free HTTPS host, such as GitHub Pages, Cloudflare Pages, or Netlify. Open the resulting URL in Safari on your iPhone, tap **Share**, then **Add to Home Screen**. It opens like an app and retains totals on that device. No Apple Developer Program membership or App Store publishing is required.

The counters work offline once the page has been opened online at least once.

## Card entry

Tap card buttons on mobile. With a physical keyboard, enter A, 2–9, 10, J, Q, or K; lowercase works too. Keyboard entry and card taps share one session. `10` counts as one card; an unfinished `1` waits for `0`. Backspace/Delete removes the latest active-session entry, and Enter ends the session. **End Session** and **Undo** are beside the Cards heading. Cards dealt shortcuts are at the bottom of the page.

## Session history and research export

Open **Session history** to see each session's cards in entry order. **Reset all totals** freezes that list and begins a new one; choose an older frozen list from the selector to review it. Session entries survive reloads. A session interrupted by reloading is labeled accordingly. Undo keeps a crossed-out entry and an audit trail rather than erasing the original input.

**Export JSON** downloads all current and frozen lists, timestamps, input sources, session end reasons, and before/after counts and main-bet calculations. These are recorded inputs and calculated estimates; player/banker card allocation and actual hand results are not captured. Tapping the combined 10/J/Q/K button records that group (point value zero); physical keyboard entry preserves the specific rank. Quantity-only shortcuts record an unknown value, never an inferred card. Existing totals become the starting baseline; sessions from before this update cannot be reconstructed.

History is stored only in this browser on this device. Export periodically to keep an independent copy; clearing browser data removes local history. A storage failure displays a warning and blocks Reset to protect the lists.

## Next-hand main-bet comparison

After a card session ends, the status row shows **BANKER**, **PLAYER**, or **SIT OUT**. The compact panel above the cards shows both expected returns and any reason the comparison is unavailable. A side is recommended only when its expected return is positive; otherwise the recommendation is to sit out the main bets. Dragon/Panda side-bet signals remain separate.

The calculation uses this table's reported rules: Banker pushes on a winning three-card 7 (Dragon), Player pushes on a winning three-card 8 (Panda), other wins pay 1:1, the opposite wager loses, and ties push. The Panda push is an additional table rule, beyond standard EZ Baccarat. EV is expected net return per unit wagered, including pushes, rather than the chance of winning the next hand.

The comparison runs automatically from the recorded card values, assuming tracking started at a new shoe and all removed values, including burns, were entered. Saved historical grouped ranks show **New shoe needed**. Use Reset all totals when the next shoe starts; saved values are never guessed or cleared automatically. Quantity-only shortcuts, inconsistent counts, and fewer than six cards remaining withhold the comparison. If a card's value was missed, restart tracking at the next shoe. Changing the starting deck count must reflect the actual shoe.

The engine enumerates deals without replacement over baccarat point values and applies the standard drawing rules. It runs in a Web Worker and works offline after the assets have been cached. While entering cards (including an unfinished `1` for `10`), returns are hidden. New requests supersede older calculation results.

### Validation

Run the dependency-free calculation tests:

```sh
node --test tests/*.test.cjs
```

These compare the full eight-deck probabilities with the published combination counts, compare varied small shoes with independent exhaustive enumeration of physical cards, and check positive/negative/zero recommendations and input coverage.

References: [baccarat drawing rules](https://wizardofodds.com/games/baccarat/), [published eight-deck outcome counts](https://wizardofodds.com/games/ez-baccarat/).

Runtime script/style URLs, the calculator worker imports, and the service-worker cache share a release version. Update them together when releasing asset changes. The tests check this contract so old cached calculator code cannot retain a removed input requirement.

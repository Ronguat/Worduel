# Worduel

Wordle for two, played asynchronously. Pick a word for each other and race to solve it in fewer guesses (duel), or work on one together (team), chipping away whenever: close the app and pick it back up later.

Live at **https://ronguat.github.io/Worduel/**. On a phone, use "Add to Home Screen" to get an app icon.

## Rules

- **Duel**: each player picks a word for the other, then guesses at their own pace. Fewer guesses wins; the same number is a draw. Once the result is settled, the loser can keep guessing or reveal the word. (Duel mode is stored as `faceoff` in the data; matches stored as `duel` are the retired turn-taking "classic duels", which can still be finished and rematch as duels.)
- **Team**: either player guesses any time, with 6 guesses (7 for six-letter words).
- **Hard mode** (on by default): every revealed hint must be reused, whoever revealed it.
- **Rematch** links the new match from the finished one, so if both players press it they land in the same match.
- **Cancel / Decline**: until someone guesses, either player can call a match off (the creator cancels, the other player declines). It's marked `cancelled`, shows in Finished, and counts toward no one's record. Calling off a rematch unlinks it from the match it came from, so Rematch starts fresh.

## Stack

- React + Vite + TypeScript, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
- Firebase (Spark plan): Google sign-in and Firestore with live updates. Each match is one document in `matches/`; guesses are applied in a transaction (`src/game/actions.ts`) using the pure rules in `src/game/logic.ts`.
- `firestore.rules` holds the database security rules. They aren't deployed automatically: paste them into Firebase console → Firestore → Rules (or `npx firebase-tools deploy --only firestore:rules`).
- Word lists live in `src/words/`. Answers are recognizable words (Hunspell en_US/en_CA dictionary words that are reasonably common per `wordfreq`); valid guesses are a much broader dictionary.

## Ideas for a wider release

### Forfeit for inactivity

Not built. Between friends a stalled match is a text away; with strangers, a player who walks away can hold a match open forever.

- **Rule**: if it's been your move for N days (7, say), your opponent may claim the win. Warn the idle player ahead of time (on the card and in the match, e.g. "2 days left to move"), and show the waiting player a countdown.
- **"Your move"** already exists as `needsMe`: a duel where you haven't picked their word, or haven't finished guessing yours. The clock should start from the move that made it your turn (`lastMove.at`, or `updatedAt` for a fresh match).
- **Enforcing it on the free Spark plan**: a "Claim win" button for the waiting player once the deadline passes. That's an ordinary match update, so security rules would need to check the deadline against `request.time` (the server's clock, which players can't fake). That in turn means storing the last-move time as a server timestamp rather than the client's `Date.now()`. Without that, the honor system applies, as it does elsewhere.
- **Automatic forfeits** (no one has to claim) need a scheduled Cloud Function, which requires the paid Blaze plan.
- **Open questions**:
  - *Team*: there are no turns, so either player can always move. An idle team match might simply expire as abandoned with no result, rather than counting as a loss for anyone.
  - *Duels where one side is done*: if you've solved your word and your opponent goes quiet, the claim would cover their unfinished word. If they've already lost and are only playing on, nothing is at stake, so no claim is needed.
  - *Chat*: should a chat message reset the clock? Probably not, since it isn't a move. But it's a sign the player is still around, so a longer grace period might be fairer.
  - *Never started*: a challenge nobody has acted on should probably just expire like a declined match (`cancelled`), not count as a forfeit.

## Development

```sh
npm install
npm test            # rules unit tests
npm run dev         # against the real Firebase project
npm run emulators   # in one terminal (needs Java)
npm run dev:emu     # in another: app wired to the local emulators
```

In emulator mode, `window.testSignIn(uid, name)` signs in as a fake Google user, which is handy for testing two players in two browser profiles.

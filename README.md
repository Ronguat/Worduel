# Worduel

Wordle for two, played asynchronously. Pick a word for each other and race to solve it in fewer guesses (duel), or work on one together (team), chipping away whenever: close the app and pick it back up later.

Live at **https://ronguat.github.io/Worduel/**. On a phone, use "Add to Home Screen" to get an app icon.

## Rules

- **Duel**: each player picks a word for the other, then guesses at their own pace. Fewer guesses wins; the same number is a draw. Once the result is settled, the loser can keep guessing or reveal the word. (Duel mode is stored as `faceoff` in the data; matches stored as `duel` are the retired turn-taking "classic duels", which can still be finished and rematch as duels.)
- **Team**: either player guesses any time, with 6 guesses (7 for six-letter words).
- **Hard mode** (on by default): every revealed hint must be reused, whoever revealed it.
- **Rematch** links the new match from the finished one, so if both players press it they land in the same match.

## Stack

- React + Vite + TypeScript, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
- Firebase (Spark plan): Google sign-in and Firestore with live updates. Each match is one document in `matches/`; guesses are applied in a transaction (`src/game/actions.ts`) using the pure rules in `src/game/logic.ts`.
- `firestore.rules` holds the database security rules. They aren't deployed automatically: paste them into Firebase console → Firestore → Rules (or `npx firebase-tools deploy --only firestore:rules`).
- Word lists live in `src/words/`. Answers are recognizable words (Hunspell en_US/en_CA dictionary words that are reasonably common per `wordfreq`); valid guesses are a much broader dictionary.

## Development

```sh
npm install
npm test            # rules unit tests
npm run dev         # against the real Firebase project
npm run emulators   # in one terminal (needs Java)
npm run dev:emu     # in another: app wired to the local emulators
```

In emulator mode, `window.testSignIn(uid, name)` signs in as a fake Google user, which is handy for testing two players in two browser profiles.

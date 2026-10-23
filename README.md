# Worduel

Wordle for two, played asynchronously. Take turns chipping away at a puzzle (duel) or work on it together (team), close the app, and pick it back up later.

Live at **https://ronguat.github.io/Worduel/**. On a phone, use "Add to Home Screen" to get an app icon.

## Rules

- **Duel**: players alternate turns on a shared board with no guess limit; whoever lands the word wins it. With several boards, each turn you can queue one guess on any subset of the unsolved boards. Most boards won takes the match; ties go to fewer rows used on the boards won, then to whoever went second. Who goes first alternates between matches.
- **Team**: either player guesses any time. Each board allows 6 guesses (7 for six-letter words); solve every board to win.
- **Hard mode** (on by default): every revealed hint must be reused, whoever revealed it.

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

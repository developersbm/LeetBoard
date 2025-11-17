# LeetBoard

LeetBoard is a simple LeetCode friends leaderboard built with React, TypeScript, Vite, and Firebase (Firestore). It tracks users' solved problem counts (easy, medium, hard) and supports weekly and monthly baseline snapshots to measure progress.

Quick start

1. Install dependencies: `npm install`
2. Configure Firebase in `src/firebase.ts` (provide your `firebaseConfig`)
3. Run the dev server: `npm run dev`

Firestore collections used

- `users`
- `leaderboardSnapshots`

Build for production: `npm run build`

That's all.

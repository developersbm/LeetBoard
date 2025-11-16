# LeetCode Friends Leaderboard

A frontend-only LeetCode leaderboard to compare progress with your friends.

## Features

- 📊 Compare LeetCode stats (Easy, Medium, Hard problems solved)
- 🏆 XP-based ranking system
- 🔄 Real-time data fetching from LeetCode's GraphQL API
- 🎨 Dark theme with TailwindCSS
- ⚡ Built with React + TypeScript + Vite

## XP Calculation

- Easy: 100 XP
- Medium: 200 XP
- Hard: 400 XP

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Edit usernames:**
   Open `src/App.tsx` and edit the `LEETCODE_USERNAMES` array with your friends' LeetCode usernames:
   ```typescript
   const LEETCODE_USERNAMES = [
     'your_username',
     'friend1_username',
     'friend2_username'
   ];
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:5173`

## Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

## Tech Stack

- React 18
- TypeScript
- TailwindCSS
- Vite
- LeetCode GraphQL API

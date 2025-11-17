# LeetCode Friends Leaderboard

A dynamic LeetCode leaderboard with Firebase integration to compare progress with your friends and track weekly/monthly improvements.

## Features

- 📊 Compare LeetCode stats (Easy, Medium, Hard problems solved)
- 🏆 Dynamic ranking system
- 🔄 Real-time data fetching from LeetCode API
- 🎨 Dark theme with TailwindCSS
- ⚡ Built with React + TypeScript + Vite + Firebase
- 👥 Dynamic user management (add/remove users)
- 📈 Weekly and monthly progress tracking
- 📸 Snapshot system to track improvements over time

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Firestore Database**:
   - Go to Build → Firestore Database
   - Click "Create database"
   - Start in **production mode** (or test mode for development)
   - Choose a location
4. Get your Firebase config:
   - Go to Project Settings (⚙️ icon)
   - Scroll down to "Your apps"
   - Click the web icon (`</>`) to add a web app
   - Copy the `firebaseConfig` object

5. Update `src/firebase.ts` with your config:
   ```typescript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_AUTH_DOMAIN",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_STORAGE_BUCKET",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

### 3. Firestore Collections

The app will automatically create these collections:

- **`users`**: Stores LeetCode usernames
  ```
  {
    username: string,
    createdAt: string (ISO date)
  }
  ```

- **`leaderboardSnapshots`**: Stores weekly/monthly progress snapshots
  ```
  {
    period: "weekly" | "monthly",
    createdAt: string (ISO date),
    users: [
      {
        username: string,
        easy: number,
        medium: number,
        hard: number,
        total: number
      }
    ]
  }
  ```

### 4. Run the development server

```bash
npm run dev
```

### 5. Open your browser

Navigate to `http://localhost:5173`

## Usage

### Adding Users

1. Enter a LeetCode username in the input field
2. Click "Add User" (or press Enter)
3. The leaderboard will automatically refresh

### Tracking Progress

1. Click "Capture Weekly Snapshot" to save current stats as weekly baseline
2. Click "Capture Monthly Snapshot" to save current stats as monthly baseline
3. Delta columns (Δ Week, Δ Month) show progress since last snapshot

### Removing Users

Click the ✕ button next to any user to remove them from the leaderboard

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
- Firebase/Firestore
- LeetCode Stats API

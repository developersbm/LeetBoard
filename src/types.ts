export interface DifficultyStats {
    jobsApplied: number;
    easy: number;
    medium: number;
    hard: number;
    total: number;
    xp: number;
}

export interface UserStats extends DifficultyStats {
    username: string;
    name?: string;
    rank: number;
    error?: string | null;
}

export type SnapshotPeriod = 'weekly' | 'monthly' | 'yearly';

export interface SnapshotUserStats {
    username: string;
    name?: string;
    jobsApplied: number;
    easy: number;
    medium: number;
    hard: number;
    total: number;
    xp: number;
}

export interface LeaderboardSnapshot {
    id?: string;
    period: SnapshotPeriod;
    periodKey: string; // e.g. "2026-W01"
    createdAt: string;
    users: SnapshotUserStats[];
}

export interface FirestoreUser {
    id?: string;
    username: string;
    name?: string;
    jobsApplied?: number;
}

export interface Job {
    id?: string;
    username: string;
    title: string;
    company: string;
    url: string;
    status: 'Applied' | 'Assessment' | 'Interview' | 'Offer';
    createdAt: string;
}

export interface LeetCodeResponse {
    status: string;
    message: string;
    totalSolved: number;
    totalQuestions: number;
    easySolved: number;
    totalEasy: number;
    mediumSolved: number;
    totalMedium: number;
    hardSolved: number;
    totalHard: number;
    acceptanceRate: number;
    ranking: number;
    contributionPoints: number;
    reputation: number;
    submissionCalendar: Record<string, unknown>;
}

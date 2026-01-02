import { db } from '../firebase';
import {
    collection,
    getDocs,
    addDoc,
    query,
    where,
    limit
} from 'firebase/firestore';
import {
    UserStats,
    SnapshotPeriod,
    LeaderboardSnapshot
} from '../types';
import {
    getWeeklyPeriodKey,
    getMonthlyPeriodKey,
    getYearlyPeriodKey
} from './dateUtils';

// Helper to get the correct period key for a type
const getPeriodKey = (type: SnapshotPeriod): string => {
    switch (type) {
        case 'weekly': return getWeeklyPeriodKey();
        case 'monthly': return getMonthlyPeriodKey();
        case 'yearly': return getYearlyPeriodKey();
    }
};

/**
 * Ensures that a snapshot exists for the current period (weekly, monthly, yearly).
 * If not, it creates one using the current stats of the provided users as the baseline.
 * IDEMPOTENCY: This checks for the existence of a snapshot with the specific periodKey
 * before creating one.
 */
export const ensureSnapshotsForCurrentPeriods = async (
    currentUsersStats: UserStats[]
): Promise<{ weekly: LeaderboardSnapshot | null, monthly: LeaderboardSnapshot | null, yearly: LeaderboardSnapshot | null }> => {

    const results = {
        weekly: await ensureSnapshot('weekly', currentUsersStats),
        monthly: await ensureSnapshot('monthly', currentUsersStats),
        yearly: await ensureSnapshot('yearly', currentUsersStats),
    };

    return results;
};

const ensureSnapshot = async (
    period: SnapshotPeriod,
    currentStats: UserStats[],
    // firestoreUsers: FirestoreUser[] // Not used currently but kept for potential name sync
): Promise<LeaderboardSnapshot | null> => {
    try {
        const periodKey = getPeriodKey(period);
        const snapshotsRef = collection(db, 'leaderboardSnapshots');

        // Check if snapshot exists for this period key
        const q = query(
            snapshotsRef,
            where('period', '==', period),
            where('periodKey', '==', periodKey), // New field for robust identification
            limit(1)
        );

        const snapshotDocs = await getDocs(q);

        if (!snapshotDocs.empty) {
            // Snapshot exists, return it
            const doc = snapshotDocs.docs[0];
            return { id: doc.id, ...doc.data() } as LeaderboardSnapshot;
        }

        // No snapshot found for this period key -> Create it!
        console.log(`📸 Creating new ${period} snapshot for ${periodKey}`);

        const newSnapshot: Omit<LeaderboardSnapshot, 'id'> = {
            period,
            periodKey,
            createdAt: new Date().toISOString(),
            users: currentStats.map(user => ({
                username: user.username,
                name: user.name,
                jobsApplied: user.jobsApplied,
                easy: user.easy,
                medium: user.medium,
                hard: user.hard,
                total: user.total,
                xp: user.xp
            }))
        };

        // Add to Firestore
        const ref = await addDoc(snapshotsRef, newSnapshot);
        return { id: ref.id, ...newSnapshot };

    } catch (error) {
        console.error(`Error ensuring ${period} snapshot:`, error);
        return null;
    }
};

/**
 * Load the latest snapshot for a specific period type (independent of key).
 * Used for initial load if we want to see history, but typically ensureSnapshot is what we want for "active" logic.
 */
export const loadLatestSnapshot = async (period: SnapshotPeriod): Promise<LeaderboardSnapshot | null> => {
    try {
        const snapshotsRef = collection(db, 'leaderboardSnapshots');
        // We will just fetch the one matching the current key mostly. 
        // If we need previous history, we can query by periodKey.

        // Let's stick to getPeriodKey logic for consistency in this refactor.
        const periodKey = getPeriodKey(period);
        const qCurrent = query(
            snapshotsRef,
            where('period', '==', period),
            where('periodKey', '==', periodKey),
            limit(1)
        );
        const snapshotDocs = await getDocs(qCurrent);
        if (!snapshotDocs.empty) {
            const doc = snapshotDocs.docs[0];
            return { id: doc.id, ...doc.data() } as LeaderboardSnapshot;
        }
        return null;

    } catch (error) {
        console.error(`Error loading latest ${period} snapshot:`, error);
        return null;
    }
};

/**
 * Loads a snapshot based on a specific period key (e.g., '2025-W52').
 */
export const loadSnapshotByKey = async (period: SnapshotPeriod, periodKey: string): Promise<LeaderboardSnapshot | null> => {
    try {
        const snapshotsRef = collection(db, 'leaderboardSnapshots');
        const q = query(
            snapshotsRef,
            where('period', '==', period),
            where('periodKey', '==', periodKey),
            limit(1)
        );
        const snapshotDocs = await getDocs(q);
        if (!snapshotDocs.empty) {
            const doc = snapshotDocs.docs[0];
            return { id: doc.id, ...doc.data() } as LeaderboardSnapshot;
        }
        return null;
    } catch (error) {
        console.error(`Error loading ${period} snapshot for key ${periodKey}:`, error);
        return null;
    }
};

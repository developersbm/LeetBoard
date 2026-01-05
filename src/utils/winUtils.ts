import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { LeaderboardSnapshot, SnapshotPeriod, UserWins } from '../types';
import { addWeeks, addMonths, addYears, parse } from 'date-fns';
import { format } from 'date-fns-tz';

const TIMEZONE = 'America/Los_Angeles';

const parsePeriodKey = (period: SnapshotPeriod, key: string): Date => {
    const now = new Date();
    if (period === 'weekly') {
        // "2026-W01" -> RRRR-'W'II
        // We use start of ISO week for consistent parsing
        return parse(key, "RRRR-'W'II", now);
    } else if (period === 'monthly') {
        return parse(key, 'yyyy-MM', now);
    } else {
        return parse(key, 'yyyy', now);
    }
};

const getNextKey = (period: SnapshotPeriod, currentKey: string): string => {
    try {
        const date = parsePeriodKey(period, currentKey);
        let nextDate: Date;
        if (period === 'weekly') nextDate = addWeeks(date, 1);
        else if (period === 'monthly') nextDate = addMonths(date, 1);
        else nextDate = addYears(date, 1);

        // Format back using the same timezone logic
        if (period === 'weekly') return format(nextDate, "RRRR-'W'II", { timeZone: TIMEZONE });
        if (period === 'monthly') return format(nextDate, 'yyyy-MM', { timeZone: TIMEZONE });
        return format(nextDate, 'yyyy', { timeZone: TIMEZONE });
    } catch (e) {
        console.warn(`Failed to parse/increment key: ${currentKey}`, e);
        return '';
    }
};

export const calculateHistoricalWins = async (): Promise<Map<string, UserWins>> => {
    const winsMap = new Map<string, UserWins>();

    const getOrInitUser = (username: string) => {
        if (!winsMap.has(username)) {
            winsMap.set(username, { weekly: 0, monthly: 0, yearly: 0 });
        }
        return winsMap.get(username)!;
    };

    try {
        const snapRef = collection(db, 'leaderboardSnapshots');
        const snapshotDocs = await getDocs(snapRef);
        const snapshots = snapshotDocs.docs.map(d => d.data() as LeaderboardSnapshot);

        const grouped = {
            weekly: snapshots.filter(s => s.period === 'weekly').sort((a, b) => (a.periodKey || '').localeCompare(b.periodKey || '')),
            monthly: snapshots.filter(s => s.period === 'monthly').sort((a, b) => (a.periodKey || '').localeCompare(b.periodKey || '')),
            yearly: snapshots.filter(s => s.period === 'yearly').sort((a, b) => (a.periodKey || '').localeCompare(b.periodKey || '')),
        };

        const processPeriod = (snaps: LeaderboardSnapshot[], type: SnapshotPeriod) => {
            for (let i = 0; i < snaps.length - 1; i++) {
                const start = snaps[i];
                const end = snaps[i + 1];

                // Check continuity (No gaps allowed for a valid Win period)
                // e.g. W01 -> W02 is valid. W01 -> W03 is not.
                const expectedNext = getNextKey(type, start.periodKey);

                // If parsing fails or keys don't match, we assume gap and skip
                if (!expectedNext || expectedNext !== end.periodKey) {
                    continue;
                }

                // Check for Activity (>1 XP by at least one person)
                let activeParticipants = 0;

                const candidates = end.users.map(endUser => {
                    const startUser = start.users.find(u => u.username === endUser.username);

                    const jobsDelta = Math.max(0, endUser.jobsApplied - (startUser?.jobsApplied || 0));
                    const easyDelta = Math.max(0, endUser.easy - (startUser?.easy || 0));
                    const mediumDelta = Math.max(0, endUser.medium - (startUser?.medium || 0));
                    const hardDelta = Math.max(0, endUser.hard - (startUser?.hard || 0));

                    const xpDelta = (jobsDelta * 0.5) + (easyDelta * 1) + (mediumDelta * 2) + (hardDelta * 4);

                    if (xpDelta > 1) activeParticipants++;

                    return {
                        username: endUser.username,
                        xp: xpDelta,
                        total: easyDelta + mediumDelta + hardDelta
                    };
                });

                if (activeParticipants === 0) continue;

                // Sort Rank 1
                candidates.sort((a, b) => {
                    if (b.xp === a.xp) return b.total - a.total;
                    return b.xp - a.xp;
                });

                if (candidates.length > 0) {
                    const winner = candidates[0];

                    if (winner.xp > 1) {
                        const userWins = getOrInitUser(winner.username);
                        userWins[type]++;
                    }
                }
            }
        };

        processPeriod(grouped.weekly, 'weekly');
        processPeriod(grouped.monthly, 'monthly');
        processPeriod(grouped.yearly, 'yearly');

    } catch (e) {
        console.error("Error calculating wins", e);
    }

    return winsMap;
};

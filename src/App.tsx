import { useState, useEffect, useRef } from 'react';
import { FaTrophy, FaCode, FaTrash, FaClock, FaListOl } from 'react-icons/fa';
import { IoMdRefresh, IoMdAlert } from 'react-icons/io';
import { FaBoltLightning } from "react-icons/fa6";
import { db } from './firebase';
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import LeaderboardTable from './components/LeaderboardTable';
import TabNavigation from './components/TabNavigation';
import {
  UserStats,
  LeaderboardSnapshot,
  FirestoreUser,
  Job,
  LeetCodeResponse,
  SnapshotUserStats
} from './types';
import {
  ensureSnapshotsForCurrentPeriods,
} from './utils/snapshotUtils';
import {
  getTimeUntilNextReset,
  getMonthlyPeriodKey,
  getWeeklyPeriodKey,
  getYearlyPeriodKey
} from './utils/dateUtils';
import { loadSnapshotByKey } from './utils/snapshotUtils';
import { subWeeks, subMonths, subYears } from 'date-fns';

const STATUS_SEQUENCE: Job['status'][] = [
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
];

function getNextStatus(current: Job['status']): Job['status'] {
  const idx = STATUS_SEQUENCE.indexOf(current);
  if (idx === -1) return 'Applied';
  return STATUS_SEQUENCE[(idx + 1) % STATUS_SEQUENCE.length];
}

function App() {
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'jobs' | 'weekly' | 'monthly' | 'yearly'>('all');
  const [users, setUsers] = useState<FirestoreUser[]>([]);

  // Snapshots
  const [weeklySnapshot, setWeeklySnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [monthlySnapshot, setMonthlySnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [yearlySnapshot, setYearlySnapshot] = useState<LeaderboardSnapshot | null>(null);

  // Stats (Progress)
  const [weeklyStats, setWeeklyStats] = useState<UserStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<UserStats[]>([]);
  const [yearlyStats, setYearlyStats] = useState<UserStats[]>([]);

  // Add Job/User Modal
  const [newUsername, setNewUsername] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [selectedJobUsername, setSelectedJobUsername] = useState<string>('');
  const [jobUrl, setJobUrl] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [jobCompany, setJobCompany] = useState<string>('');
  const [modalActionType, setModalActionType] = useState<'user' | 'job'>('job');
  const [showUnifiedModal, setShowUnifiedModal] = useState<boolean>(false);

  // Leaderboard Modal (for Weekly/Monthly/Yearly rankings)
  const [showLeaderboardModal, setShowLeaderboardModal] = useState<boolean>(false);
  const [leaderboardModalType, setLeaderboardModalType] = useState<'weekly' | 'monthly' | 'yearly' | null>(null);
  const [prevLeaderboardStats, setPrevLeaderboardStats] = useState<UserStats[]>([]);
  const [loadingPrevStats, setLoadingPrevStats] = useState<boolean>(false);
  const [prevDataMissing, setPrevDataMissing] = useState<boolean>(false);

  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [jobsFilter, setJobsFilter] = useState<string>('all');


  // Timer state
  const [timeUntilReset, setTimeUntilReset] = useState<number | null>(null);
  const [resetPeriodLabel, setResetPeriodLabel] = useState<string>('');

  // Update timer every second
  useEffect(() => {
    const updateTimer = () => {
      let ms = 0;
      let label = '';
      if (activeTab === 'weekly') {
        ms = getTimeUntilNextReset('weekly');
        label = 'Weekly Reset';
      } else if (activeTab === 'monthly') {
        ms = getTimeUntilNextReset('monthly');
        label = 'Monthly Reset';
      } else if (activeTab === 'yearly') {
        ms = getTimeUntilNextReset('yearly');
        label = 'Yearly Reset';
      }

      if (ms > 0) {
        setTimeUntilReset(ms);
        setResetPeriodLabel(label);
      } else {
        setTimeUntilReset(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const formatTimeRemaining = (ms: number): string => {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${days}d ${hours}h ${minutes}m`;
  };

  // Load all jobs from Firestore
  const loadAllJobs = async () => {
    try {
      const jobsRef = collection(db, 'jobs');
      const snapshot = await getDocs(jobsRef);
      const jobsList: Job[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<Job, 'id'>)
      }));

      // Sort: Most recent applied first (by createdAt or fallback)
      jobsList.sort((a, b) => {
        // Fallback to 0 if createdAt is missing, effectively putting them at the end or treated as old
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      setAllJobs(jobsList);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  };

  // Fetch stats for a single user
  const fetchUserStats = async (username: string, jobsApplied: number = 0): Promise<UserStats> => {
    console.log(`🔍 Fetching stats for ${username} with ${jobsApplied} jobs`);
    const url = `https://leetcode-stats-api.herokuapp.com/${username}`;
    const maxRetries = 3; // Robustness: Increase retries
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(url);

        // Retry on server errors (5xx)
        if (!response.ok) {
          if (response.status >= 500 && attempt < maxRetries) {
            attempt++;
            const backoff = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          // Try to parse body when available to get structured error message
          const maybeJson = await response.json().catch(() => null);
          if (maybeJson && maybeJson.status === 'error' && typeof maybeJson.message === 'string') {
            const msg = maybeJson.message.toLowerCase();
            if (msg.includes('user does not exist')) {
              return {
                username,
                jobsApplied,
                easy: 0,
                medium: 0,
                hard: 0,
                total: 0,
                xp: 0,
                rank: 0,
                error: 'this is not a leetcode user',
              };
            }
          }

          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: LeetCodeResponse = await response.json();

        // If API indicates the user does not exist, return a specific error
        if (data.status === 'error' && data.message && data.message.toLowerCase().includes('user does not exist')) {
          return {
            username,
            jobsApplied,
            easy: 0,
            medium: 0,
            hard: 0,
            total: 0,
            xp: 0,
            rank: 0,
            error: 'this is not a leetcode user',
          };
        }

        // Check if the request was successful
        if (data.status !== 'success') {
          return {
            username,
            jobsApplied,
            easy: 0,
            medium: 0,
            hard: 0,
            total: 0,
            xp: 0,
            rank: 0,
            error: 'User not found',
          };
        }

        const easy = data.easySolved;
        const medium = data.mediumSolved;
        const hard = data.hardSolved;
        const total = data.totalSolved;
        const xp = (jobsApplied * 0.5) + (easy * 1) + (medium * 2) + (hard * 4);

        console.log(`  ✅ ${username}: Jobs=${jobsApplied}, XP=${xp} (${jobsApplied * 0.5} from jobs)`);

        return {
          username,
          jobsApplied,
          easy,
          medium,
          hard,
          total,
          xp,
          rank: 0, // Will be assigned after sorting
          error: null,
        };
      } catch (error: any) {
        // If we've exhausted retries, return a clear error for UI
        if (attempt >= maxRetries) {
          console.error(`Error fetching stats for ${username}:`, error);
          return {
            username,
            jobsApplied,
            easy: 0,
            medium: 0,
            hard: 0,
            total: 0,
            xp: 0,
            rank: 0,
            error: error instanceof Error ? error.message : 'LeetCode API unavailable',
          };
        }

        // otherwise, increment attempt and retry after short backoff
        attempt++;
        const backoff = 1000 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, backoff));
      }
    }

    // Fallback (shouldn't reach here)
    return {
      username,
      jobsApplied,
      easy: 0,
      medium: 0,
      hard: 0,
      total: 0,
      xp: 0,
      rank: 0,
      error: 'Error fetching data',
    };
  };

  // Load users from Firestore
  const loadUsersFromFirestore = async () => {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const userList: FirestoreUser[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          username: data.username as string,
          name: data.name as string | undefined,
          jobsApplied: data.jobsApplied as number | undefined,
        };
      });
      console.log('📋 Loaded users with job counts:', userList.map(u => `${u.username}: ${u.jobsApplied || 0}`));
      setUsers(userList);
      return userList;
    } catch (error) {
      console.error('Error loading users from Firestore:', error);
      return [];
    }
  };

  // Add job to Firestore
  const addJob = async (): Promise<boolean> => {
    const trimmedUrl = jobUrl.trim();
    const trimmedTitle = jobTitle.trim();
    const trimmedCompany = jobCompany.trim();
    if (!selectedJobUsername || !trimmedUrl || !trimmedTitle || !trimmedCompany) {
      alert('Please select a username, provide a job title, company, and job URL.');
      return false;
    }

    const userToUpdate = users.find(u => u.username === selectedJobUsername);
    if (!userToUpdate || !userToUpdate.id) {
      alert('Could not find user to update.');
      return false;
    }

    try {
      setLoading(true);
      // Add the job document
      await addDoc(collection(db, 'jobs'), {
        username: selectedJobUsername,
        title: trimmedTitle,
        company: trimmedCompany,
        url: trimmedUrl,
        status: 'Applied',
        createdAt: new Date().toISOString()
      });

      // Atomically increment the user's job count
      const userRef = doc(db, 'users', userToUpdate.id);
      const currentJobs = userToUpdate.jobsApplied || 0;
      await updateDoc(userRef, { jobsApplied: currentJobs + 1 });

      setJobUrl('');
      setJobTitle('');
      setJobCompany('');
      setSelectedJobUsername('');

      // Reload users and stats to reflect the new job
      const updatedUsers = await loadUsersFromFirestore();
      await loadAllStats(updatedUsers);
      await loadAllJobs();
      return true;
    } catch (error) {
      console.error('Error adding job:', error);
      alert('Failed to add job. Please try again.');
      setLoading(false);
      return false;
    }
  };

  // Delete job from Firestore
  const deleteJob = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to delete this job application?')) {
      return;
    }

    try {
      setLoading(true);

      // Find the job to get the username before deleting
      const jobToDelete = allJobs.find(job => job.id === jobId);
      if (!jobToDelete) {
        throw new Error("Job not found in local state.");
      }
      const userToUpdate = users.find(u => u.username === jobToDelete.username);

      // Delete the job document
      await deleteDoc(doc(db, 'jobs', jobId));

      // If user is found, decrement their job count
      if (userToUpdate && userToUpdate.id) {
        const userRef = doc(db, 'users', userToUpdate.id);
        const currentJobs = userToUpdate.jobsApplied || 0;
        await updateDoc(userRef, { jobsApplied: Math.max(0, currentJobs - 1) });
      }

      // Update local state for immediate UI feedback
      setAllJobs(prevJobs => prevJobs.filter(job => job.id !== jobId));

      // Reload users and stats to update XP and rankings
      const updatedUsers = await loadUsersFromFirestore();
      await loadAllStats(updatedUsers);
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Update job status in Firestore
  const updateJobStatus = async (jobId: string, newStatus: Job['status']) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), { status: newStatus });
      // Update local state
      setAllJobs(prevJobs =>
        prevJobs.map(job =>
          job.id === jobId ? { ...job, status: newStatus } : job
        )
      );
    } catch (error) {
      console.error('Error updating job status:', error);
      alert('Failed to update job status.');
    }
  };

  // Add user to Firestore
  const addUser = async (): Promise<boolean> => {
    const trimmedUsername = newUsername.trim();
    const trimmedName = newName.trim();
    if (!trimmedUsername || !trimmedName) {
      alert('Please provide both a LeetCode username and a display name.');
      return false;
    }

    if (users.some(u => u.username === trimmedUsername)) {
      alert(`User "${trimmedUsername}" already exists!`);
      return false;
    }

    try {
      setLoading(true);
      const userCurrentStats = await fetchUserStats(trimmedUsername);

      if (userCurrentStats.error) {
        if (userCurrentStats.error === 'this is not a leetcode user') {
          alert('This is not a leetcode user');
          setLoading(false);
          return false;
        }
        alert(`Could not add user: "${trimmedUsername}" does not exist on LeetCode or the API is down.`);
        setLoading(false);
        return false;
      }

      const newUser = {
        username: trimmedUsername,
        name: trimmedName,
        jobsApplied: 0,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'users'), newUser);
      setNewUsername('');
      setNewName('');

      // Need to include the new user stats in the 'current' batch for ensuring snapshots
      // so we can't just loadUsersFromFirestore yet, we need to manually inject or wait.
      // Better: reload users, then ensure snapshots again.
      const updatedUsers = await loadUsersFromFirestore();

      // Re-run snapshot ensure logic. This will add the new user to existing snapshots effectively
      // or create new snapshots if needed. 
      // Wait, ensureSnapshotsForCurrentPeriods checks if snapshot *document* exists.
      // If it exists, it assumes it's good. But we added a user! 
      // We need to add this user to the *current* snapshots if they are missing.
      // But for simplicity/robustness, ensureSnapshotsForCurrentPeriods (as implemented) 
      // only creates NEW snapshots if the document is missing. It doesn't patch existing ones.
      // SO: We must patch the existing snapshots for the current period with this new user's baseline.

      // Quick fix: We'll just call the "ensure" logic, but we might need a separate helper 
      // to "Update Current Snapshot" or we accept they start next period.
      // Requirement: "New users joining mid-week/month/year (baseline should be created at first time seen in that period)."
      // So: We must patch the existing snapshots for the current period with this new user's baseline.

      await addUserToCurrentSnapshots(trimmedUsername, userCurrentStats, trimmedName);

      await loadAllData(updatedUsers);
      return true;
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user. Please try again.');
      setLoading(false);
      return false;
    }
  };

  const addUserToCurrentSnapshots = async (username: string, stats: UserStats, name: string) => {
    // Very similar to old logic but using period keys from utils

    // We need to fetch the snapshots that match current keys
    const keys = {
      weekly: getWeeklyPeriodKey(),
      monthly: getMonthlyPeriodKey(),
      yearly: getYearlyPeriodKey()
    };

    try {
      const snapshotDocs = await getDocs(collection(db, 'leaderboardSnapshots'));
      const updatePromises = snapshotDocs.docs.map(async (docSnap) => {
        const data = docSnap.data() as LeaderboardSnapshot;
        // Only update if it matches current period key
        const isCurrent = (data.period === 'weekly' && data.periodKey === keys.weekly) ||
          (data.period === 'monthly' && data.periodKey === keys.monthly) ||
          (data.period === 'yearly' && data.periodKey === keys.yearly);

        if (isCurrent && !data.users.some(u => u.username === username)) {
          const newUserSnapshot: SnapshotUserStats = {
            username,
            name,
            jobsApplied: stats.jobsApplied,
            easy: stats.easy,
            medium: stats.medium,
            hard: stats.hard,
            total: stats.total,
            xp: stats.xp
          };
          await updateDoc(doc(db, 'leaderboardSnapshots', docSnap.id), {
            users: [...data.users, newUserSnapshot]
          });
        }
      });
      await Promise.all(updatePromises);
    } catch (err) {
      console.error("Failed to patch snapshots", err);
    }
  };

  // Helper: Find user in snapshot
  const findSnapshotUser = (snapshot: LeaderboardSnapshot | null, username: string): SnapshotUserStats | null => {
    if (!snapshot) return null;
    return snapshot.users.find(u => u.username === username) ?? null;
  };

  // Helper: Compute progress from baseline
  const computeProgress = (current: UserStats, baseline: SnapshotUserStats | null): UserStats => {
    if (!baseline) {
      // User not in snapshot yet - show as 0 progress (or full stats? usually 0 progress makes sense for 'Period Progress')
      // If user joined mid-week, their baseline should have been set to their start stats.
      // If baseline is null, it means there is NO snapshot at all for them.
      // Let's assume 0 progress.
      return {
        ...current,
        jobsApplied: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        total: 0,
        xp: 0,
        rank: 0,
      };
    }

    // Progress = Current - Baseline
    const jobsDelta = Math.max(0, current.jobsApplied - (baseline.jobsApplied || 0));
    const easyDelta = Math.max(0, current.easy - baseline.easy);
    const mediumDelta = Math.max(0, current.medium - baseline.medium);
    const hardDelta = Math.max(0, current.hard - baseline.hard);
    const totalDelta = Math.max(0, current.total - baseline.total);
    const xpDelta = (jobsDelta * 0.5) + (easyDelta * 1) + (mediumDelta * 2) + (hardDelta * 4);

    return {
      username: current.username,
      name: current.name,
      jobsApplied: jobsDelta,
      easy: easyDelta,
      medium: mediumDelta,
      hard: hardDelta,
      total: totalDelta,
      xp: xpDelta,
      rank: 0,
      error: current.error
    };
  };

  // Load stats for all users
  const loadAllStats = async (
    userList?: FirestoreUser[],
    weeklySnap?: LeaderboardSnapshot | null,
    monthlySnap?: LeaderboardSnapshot | null,
    yearlySnap?: LeaderboardSnapshot | null,
    preFetchedStats?: UserStats[]
  ) => {
    setLoading(true);
    try {
      const usersToFetch = userList || await loadUsersFromFirestore();
      setUsers(usersToFetch);

      if (usersToFetch.length === 0) {
        setUserStats([]);
        setWeeklyStats([]);
        setMonthlyStats([]);
        setYearlyStats([]);
        setLoading(false);
        return;
      }

      const currentWeeklySnapshot = weeklySnap !== undefined ? weeklySnap : weeklySnapshot;
      const currentMonthlySnapshot = monthlySnap !== undefined ? monthlySnap : monthlySnapshot;
      const currentYearlySnapshot = yearlySnap !== undefined ? yearlySnap : yearlySnapshot;

      let statsWithNames: UserStats[];

      if (preFetchedStats) {
        console.log('⚡ Using pre-fetched stats to avoid double API call');
        statsWithNames = preFetchedStats;
      } else {
        // Fetch all users with concurrency limit to avoid overwhelming the API
        const stats: UserStats[] = [];
        const BATCH_SIZE = 3;

        for (let i = 0; i < usersToFetch.length; i += BATCH_SIZE) {
          const batch = usersToFetch.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(u => fetchUserStats(u.username, u.jobsApplied || 0));
          const batchResults = await Promise.all(batchPromises);
          stats.push(...batchResults);

          // Small delay between batches if not the last batch
          if (i + BATCH_SIZE < usersToFetch.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        statsWithNames = stats.map((s, idx) => ({
          ...s,
          name: usersToFetch[idx]?.name,
        }));
      }

      // Sort Global (All Time)
      const sortedStats = [...statsWithNames].sort((a, b) => {
        if (b.xp === a.xp) return b.total - a.total;
        return b.xp - a.xp;
      });
      const rankedStats = sortedStats.map((stat, index) => ({ ...stat, rank: index + 1 }));
      setUserStats(rankedStats);

      // Helper to sort and rank
      const sortAndRank = (items: UserStats[]) => {
        return items
          .sort((a, b) => {
            if (b.xp === a.xp) return b.total - a.total;
            return b.xp - a.xp;
          })
          .map((stat, index) => ({ ...stat, rank: index + 1 }));
      };

      // Weekly
      const weeklyProgress = rankedStats.map(stat =>
        computeProgress(stat, findSnapshotUser(currentWeeklySnapshot, stat.username))
      );
      setWeeklyStats(sortAndRank(weeklyProgress));

      // Monthly
      const monthlyProgress = rankedStats.map(stat =>
        computeProgress(stat, findSnapshotUser(currentMonthlySnapshot, stat.username))
      );
      setMonthlyStats(sortAndRank(monthlyProgress));

      // Yearly
      const yearlyProgress = rankedStats.map(stat =>
        computeProgress(stat, findSnapshotUser(currentYearlySnapshot, stat.username))
      );
      setYearlyStats(sortAndRank(yearlyProgress));

    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync job counts
  const syncJobCounts = async () => {
    try {
      const jobsRef = collection(db, 'jobs');
      const jobsSnapshot = await getDocs(jobsRef);

      const jobCounts = new Map<string, number>();
      jobsSnapshot.docs.forEach(doc => {
        const jobData = doc.data() as Job;
        jobCounts.set(jobData.username, (jobCounts.get(jobData.username) || 0) + 1);
      });

      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);

      const updatePromises = usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data() as FirestoreUser;
        const actualJobCount = jobCounts.get(userData.username) || 0;
        const currentJobCount = userData.jobsApplied || 0;

        if (actualJobCount !== currentJobCount) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            jobsApplied: actualJobCount
          });
        }
      });
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error syncing job counts:', error);
    }
  };

  const computePrevStats = (endSnap: LeaderboardSnapshot, startSnap: LeaderboardSnapshot | null) => {
    const stats: UserStats[] = endSnap.users.map(endUser => {
      const startUser = startSnap?.users.find(u => u.username === endUser.username);

      const jobsDelta = Math.max(0, endUser.jobsApplied - (startUser?.jobsApplied || 0));
      const easyDelta = Math.max(0, endUser.easy - (startUser?.easy || 0));
      const mediumDelta = Math.max(0, endUser.medium - (startUser?.medium || 0));
      const hardDelta = Math.max(0, endUser.hard - (startUser?.hard || 0));

      // Recompute XP based on deltas
      const xpDelta = (jobsDelta * 0.5) + (easyDelta * 1) + (mediumDelta * 2) + (hardDelta * 4);

      return {
        username: endUser.username,
        name: endUser.name,
        jobsApplied: jobsDelta,
        easy: easyDelta,
        medium: mediumDelta,
        hard: hardDelta,
        total: easyDelta + mediumDelta + hardDelta,
        xp: xpDelta,
        rank: 0,
        error: null
      };
    });

    const ranked = stats.sort((a, b) => b.xp - a.xp).map((s, i) => ({ ...s, rank: i + 1 }));
    setPrevLeaderboardStats(ranked);
  };

  const handleViewPreviousLeaderboard = async (period: 'weekly' | 'monthly' | 'yearly') => {
    setLoadingPrevStats(true);
    setLeaderboardModalType(period);
    setPrevLeaderboardStats([]); // Clear old stats
    setPrevDataMissing(false);
    setShowLeaderboardModal(true);

    try {
      const now = new Date();
      let prevKey: string;
      // We need the snapshot that REPRESENTS the end of the previous period.
      // Usually, the 'current' snapshot (if we are in a new week) is the baseline for THIS week.
      // So 'currentSnap' is actually the START of this week (end of last week).

      let endSnap: LeaderboardSnapshot | null = null;
      let startSnap: LeaderboardSnapshot | null = null;

      if (period === 'weekly') {
        // Current Weekly Snapshot = Baseline for CURRENT week (Start of this week)
        // This effectively represents the state at the END of last week.
        endSnap = weeklySnapshot;

        // We need the snapshot from 1 week before that to be the START of last week.
        prevKey = getWeeklyPeriodKey(subWeeks(now, 1));
      } else if (period === 'monthly') {
        endSnap = monthlySnapshot;
        prevKey = getMonthlyPeriodKey(subMonths(now, 1));
      } else {
        endSnap = yearlySnapshot;
        prevKey = getYearlyPeriodKey(subYears(now, 1));
      }

      // Fetch start of previous period
      startSnap = await loadSnapshotByKey(period, prevKey);

      if (!startSnap) {
        console.warn(`Missing start snapshot for previous ${period} (Key: ${prevKey})`);
        setPrevDataMissing(true);
        setPrevLeaderboardStats([]);
        return;
      }

      if (endSnap) {
        computePrevStats(endSnap, startSnap);
      } else {
        // If we don't even have a current baseline, we essentially have no history at all
        setPrevDataMissing(true);
        setPrevLeaderboardStats([]);
      }

    } catch (e) {
      console.error(e);
      setPrevDataMissing(true);
      setPrevLeaderboardStats([]);
    } finally {
      setLoadingPrevStats(false);
    }
  };

  const loadAllData = async (usersOverride?: FirestoreUser[]) => {
    // 1. Sync Jobs
    await syncJobCounts();

    // 2. Load Users
    const currentUsers = usersOverride || await loadUsersFromFirestore();

    // 3. Get Current Stats to use for Snapshot Creation if needed
    // (This creates a slight double fetch if we load stats later, but needed for baseline integrity)
    // 3. Get Current Stats to use for Snapshot Creation if needed
    // (This creates a slight double fetch if we load stats later, but needed for baseline integrity)
    // We implement concurrency limiting here as well.
    const currentStatsRaw: UserStats[] = [];
    const BATCH_SIZE = 3;

    for (let i = 0; i < currentUsers.length; i += BATCH_SIZE) {
      const batch = currentUsers.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(u => fetchUserStats(u.username, u.jobsApplied || 0));
      const batchResults = await Promise.all(batchPromises);
      currentStatsRaw.push(...batchResults);

      if (i + BATCH_SIZE < currentUsers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // add names
    const currentStats: UserStats[] = currentStatsRaw.map((s, idx) => ({ ...s, name: currentUsers[idx]?.name }));

    // 4. Ensure Snapshots (Idempotent)
    const snapshots = await ensureSnapshotsForCurrentPeriods(currentStats);

    setWeeklySnapshot(snapshots.weekly);
    setMonthlySnapshot(snapshots.monthly);
    setYearlySnapshot(snapshots.yearly);

    // 5. Load Stats & Calculate Progress
    await loadAllStats(currentUsers, snapshots.weekly, snapshots.monthly, snapshots.yearly, currentStats);

    // 6. Load Jobs
    await loadAllJobs();
  };

  const dataLoaded = useRef(false);

  useEffect(() => {
    if (dataLoaded.current) return;
    dataLoaded.current = true;
    loadAllData();
  }, []);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-white flex items-center gap-3 leading-none">
                  <FaCode className="text-[#FFA116]" />
                  LeetBoard
                </h1>
              </div>
              <p className="text-gray-400 text-base flex items-center gap-2">
                <FaTrophy className="text-[#FFA116]" />
                Let's grind. Try to have fun. Get the offer and money.
              </p>
              <p className="text-gray-400 text-base flex items-center gap-2">
                <IoMdAlert className="text-[#FFA116]" />
                Submitting without understanding is lying to yourself.
              </p>
              <p className="text-gray-400 text-base flex items-center gap-2">
                <FaBoltLightning className="text-[#FFA116]" />
                XP: Job Apply = 0.5, Easy = 1, Medium = 2, Hard = 4.
              </p>
            </div>
            {/* Timer */}
            {timeUntilReset && activeTab !== 'all' && activeTab !== 'jobs' && (
              <div className="flex flex-col items-end justify-center text-gray-400">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">{resetPeriodLabel}</div>
                <div className="flex items-center gap-2 text-xl font-mono text-[#FFA116]">
                  <FaClock />
                  {formatTimeRemaining(timeUntilReset)}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Navigation Tabs */}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Toggle View for Leaderboard (Weekly/Monthly/Yearly) */}
        {(activeTab === 'weekly' || activeTab === 'monthly' || activeTab === 'yearly') && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => handleViewPreviousLeaderboard(activeTab)}
              className="flex items-center gap-2 px-4 py-2 bg-[#2d2d2d] hover:bg-[#333] border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              <FaListOl className="text-[#FFA116]" />
              View Prev. {activeTab === 'weekly' ? 'Week' : activeTab === 'monthly' ? 'Month' : 'Year'} Leaderboard
            </button>
          </div>
        )}

        {/* All Time View */}
        {activeTab === 'all' && (
          <>
            {loading && userStats.length === 0 ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-6">
                    <IoMdRefresh className="animate-spin h-16 w-16 text-[#FFA116]" />
                  </div>
                  <p className="text-gray-400 text-xl font-medium">Loading leaderboard...</p>
                </div>
              </div>
            ) : (
              <LeaderboardTable
                userStats={userStats}
              />
            )}
          </>
        )}

        {/* Weekly Stats */}
        {activeTab === 'weekly' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-6">
                    <IoMdRefresh className="animate-spin h-16 w-16 text-[#FFA116]" />
                  </div>
                  <p className="text-gray-400 text-xl font-medium">Loading weekly progress...</p>
                </div>
              </div>
            ) : weeklyStats.length === 0 ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
                  <FaTrophy className="text-4xl text-green-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No Data</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Waiting for data...
                </p>
              </div>
            ) : (
              <>
                {!weeklySnapshot && (
                  <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-yellow-200 text-sm">
                    ⚠️ No weekly baseline yet. Progress will show as 0 until a snapshot is captured.
                  </div>
                )}
                <LeaderboardTable
                  userStats={weeklyStats}
                />
              </>
            )}
          </>
        )}

        {/* Monthly Stats */}
        {activeTab === 'monthly' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-6">
                    <IoMdRefresh className="animate-spin h-16 w-16 text-[#FFA116]" />
                  </div>
                  <p className="text-gray-400 text-xl font-medium">Loading monthly progress...</p>
                </div>
              </div>
            ) : (
              <>
                <LeaderboardTable userStats={monthlyStats} />
              </>
            )}
          </>
        )}

        {/* Yearly Stats */}
        {activeTab === 'yearly' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-6">
                    <IoMdRefresh className="animate-spin h-16 w-16 text-[#FFA116]" />
                  </div>
                  <p className="text-gray-400 text-xl font-medium">Loading yearly progress...</p>
                </div>
              </div>
            ) : (
              <LeaderboardTable userStats={yearlyStats} />
            )}
          </>
        )}

        {/* Jobs Applied View */}
        {activeTab === 'jobs' && (
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label htmlFor="user-filter" className="text-gray-400 font-medium">
                  Filter by user:
                </label>
                <select
                  id="user-filter"
                  value={jobsFilter}
                  onChange={(e) => setJobsFilter(e.target.value)}
                  className="px-4 py-2 bg-[#262626] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                >
                  <option value="all">All Users</option>
                  {users.map(user => (
                    <option key={user.username} value={user.username}>
                      {user.username}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-400">
                Status: Applied → Assessment → Interview → Offer
              </div>
            </div>

            {/* Jobs Table */}
            {allJobs.length === 0 ? (
              <div className="text-center py-20">
                <h3 className="text-2xl font-bold text-white mb-3">No Jobs Yet</h3>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-800 shadow-2xl">
                <table className="min-w-full table-fixed">
                  <thead className="bg-[#262626]">
                    <tr>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Username</th>
                      <th className="w-[30%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Job Title</th>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Company</th>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Job URL</th>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="w-auto px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Date Applied</th>
                      <th className="w-[5%] px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {allJobs
                      .filter(job => jobsFilter === 'all' || job.username === jobsFilter)
                      .map((job, index) => {
                        const user = users.find(u => u.username === job.username);
                        const date = new Date(job.createdAt);
                        const formattedDate = date.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        });
                        const getStatusColor = (status: Job['status']) => {
                          switch (status) {
                            case 'Applied': return 'bg-blue-500 hover:bg-blue-400 text-white';
                            case 'Assessment': return 'bg-green-500 hover:bg-green-400 text-white';
                            case 'Interview': return 'bg-orange-600 hover:bg-orange-500 text-white';
                            case 'Offer': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
                            default: return 'bg-gray-500 hover:bg-gray-400 text-white';
                          }
                        };

                        return (
                          <tr key={job.id || index} className={`${index % 2 === 0 ? 'bg-[#262626]' : 'bg-[#2d2d2d]'} hover:bg-[#333333] transition-colors duration-150`}>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div>
                                <div className="text-base font-semibold text-white truncate">{job.username}</div>
                                {user?.name && <div className="text-sm text-gray-400 mt-1 truncate">{user.name}</div>}
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap truncate"><div className="text-base text-white truncate">{job.title}</div></td>
                            <td className="px-6 py-5 whitespace-nowrap truncate"><div className="text-base text-white">{job.company}</div></td>
                            <td className="px-6 py-5 whitespace-nowrap truncate">
                              <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">URL</a>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <button
                                onClick={() => job.id && updateJobStatus(job.id, getNextStatus(job.status))}
                                className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors ${getStatusColor(job.status)}`}
                              >
                                {job.status}
                              </button>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap"><div className="text-base text-white">{formattedDate}</div></td>
                            <td className="px-6 py-5 whitespace-nowrap text-right">
                              <button onClick={() => job.id && deleteJob(job.id)} className="text-gray-400 hover:text-red-500 transition-colors" aria-label="Delete job"><FaTrash /></button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Floating Add Button */}
        <button
          onClick={() => {
            setModalActionType('job');
            setShowUnifiedModal(true);
            if (users.length > 0) setSelectedJobUsername(users[0]?.username || '');
          }}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#FFA116] hover:bg-[#FFB84D] text-black rounded-full shadow-lg flex items-center justify-center text-2xl font-bold transition-all duration-200 hover:scale-110 z-40"
        >
          +
        </button>

        {/* Unified Add Modal */}
        {showUnifiedModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowUnifiedModal(false)}>
            <div className="bg-[#262626] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl h-[580px] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-2 mb-6 bg-[#1a1a1a] p-1 rounded-lg">
                <button type="button" onClick={() => setModalActionType('job')} className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 ${modalActionType === 'job' ? 'bg-blue-500 text-black' : 'text-gray-400 hover:text-gray-200'}`}>Add Job</button>
                <button type="button" onClick={() => setModalActionType('user')} className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 ${modalActionType === 'user' ? 'bg-[#FFA116] text-black' : 'text-gray-400 hover:text-gray-200'}`}>Add User</button>
              </div>

              {modalActionType === 'job' && (
                <form onSubmit={async (e) => { e.preventDefault(); if (await addJob()) setShowUnifiedModal(false); }} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
                      <select value={selectedJobUsername} onChange={(e) => setSelectedJobUsername(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                        {users.length === 0 ? <option value="">No users available</option> : users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                      </select>
                    </div>
                    <div><label className="block text-sm font-medium text-gray-400 mb-2">Job Title</label><input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400" /></div>
                    <div><label className="block text-sm font-medium text-gray-400 mb-2">Company</label><input type="text" value={jobCompany} onChange={(e) => setJobCompany(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400" /></div>
                    <div><label className="block text-sm font-medium text-gray-400 mb-2">Job URL</label><input type="url" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400" /></div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowUnifiedModal(false)} className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg">Cancel</button>
                    <button type="submit" disabled={!selectedJobUsername || !jobUrl.trim() || !jobTitle.trim() || !jobCompany.trim() || loading} className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 text-black font-semibold rounded-lg">{loading ? 'Saving...' : 'Save Job'}</button>
                  </div>
                </form>
              )}

              {modalActionType === 'user' && (
                <form onSubmit={async (e) => { e.preventDefault(); if (await addUser()) setShowUnifiedModal(false); }} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div><label className="block text-sm font-medium text-gray-400 mb-2">LeetCode Username</label><input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-[#FFA116]" /></div>
                    <div><label className="block text-sm font-medium text-gray-400 mb-2">Display Name</label><input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-[#FFA116]" /></div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowUnifiedModal(false)} className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg">Cancel</button>
                    <button type="submit" disabled={!newUsername.trim() || !newName.trim() || loading} className="flex-1 px-4 py-3 bg-[#FFA116] hover:bg-[#FFB84D] disabled:bg-gray-700 text-black font-semibold rounded-lg">{loading ? 'Adding...' : 'Add User'}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard Modal */}
        {showLeaderboardModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowLeaderboardModal(false)}>
            <div className="bg-[#262626] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl border border-gray-800" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <FaTrophy className="text-[#FFA116]" />
                Previous {leaderboardModalType ? (leaderboardModalType.charAt(0).toUpperCase() + leaderboardModalType.slice(1)) : ''} Leaders
              </h2>

              <div className="overflow-y-auto max-h-[60vh]">
                <table className="min-w-full">
                  <thead className="bg-[#1a1a1a] sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">User</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-[#9B5CF6] uppercase">XP Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {loadingPrevStats ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                          <IoMdRefresh className="animate-spin h-8 w-8 text-[#FFA116] mx-auto mb-2" />
                          Loading previous stats...
                        </td>
                      </tr>
                    ) : prevDataMissing ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400 bg-yellow-900/10 rounded-lg">
                          <div className="flex flex-col items-center gap-2">
                            <IoMdAlert className="text-yellow-500 text-2xl" />
                            <span className="font-medium text-yellow-200">Data Unavailable</span>
                            <span className="text-sm">
                              Historical data for this period hasn't been captured yet.
                              Wait for the next reset cycle!
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : prevLeaderboardStats.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                          No XP earned during this period.
                        </td>
                      </tr>
                    ) : (
                      prevLeaderboardStats.map((user) => (
                        <tr key={user.username} className="hover:bg-[#333]">
                          <td className="px-4 py-3 text-white font-mono">
                            <span className={`font-bold ${user.rank === 1 ? 'text-yellow-400 text-xl' :
                              user.rank === 2 ? 'text-gray-300 text-lg' :
                                user.rank === 3 ? 'text-amber-600 text-lg' :
                                  'text-gray-400'
                              }`}>
                              #{user.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white font-medium">{user.name || user.username}</td>
                          <td className="px-4 py-3 text-right font-bold text-[#9B5CF6]">{user.xp} XP</td>
                        </tr>
                      )))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-center text-gray-400">
        <p>We are all going to make it.</p>
        <p>
          If you want to contribute check the repository:&nbsp;
          <a
            href="https://github.com/developersbm/LeetBoard"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-gray-600 hover:underline"
          >
            LeetBoard
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;

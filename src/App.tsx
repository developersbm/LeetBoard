import { useState, useEffect } from 'react';
import { FaTrophy, FaCode, FaTrash } from 'react-icons/fa';
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
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import LeaderboardTable from './components/LeaderboardTable';
import TabNavigation from './components/TabNavigation';

interface DifficultyStats {
  jobsApplied: number;
  easy: number;
  medium: number;
  hard: number;
  total: number;
  xp: number;
}

interface UserStats extends DifficultyStats {
  username: string;
  name?: string;
  rank: number;
  error?: string | null;
}

type SnapshotPeriod = 'weekly' | 'monthly';

interface SnapshotUserStats {
  username: string;
  name?: string;
  jobsApplied: number;
  easy: number;
  medium: number;
  hard: number;
  total: number;
  xp: number;
}

interface FirestoreUser {
  id?: string;
  username: string;
  name?: string;
  jobsApplied?: number; // Denormalized count
}

interface LeaderboardSnapshot {
  id?: string;
  period: SnapshotPeriod;
  createdAt: string;
  users: SnapshotUserStats[];
}

interface Job {
  id?: string;
  username: string;
  title: string;
  company: string;
  url: string;
  status: 'Applied' | 'Assessment' | 'Interview' | 'Offer';
  createdAt: string;
}

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

interface LeetCodeResponse {
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

function App() {
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'jobs' | 'weekly' | 'monthly'>('all');
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [weeklySnapshot, setWeeklySnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [monthlySnapshot, setMonthlySnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<UserStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<UserStats[]>([]);
  const [selectedJobUsername, setSelectedJobUsername] = useState<string>('');
  const [jobUrl, setJobUrl] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [jobCompany, setJobCompany] = useState<string>('');
  const [modalActionType, setModalActionType] = useState<'user' | 'job'>('job');
  const [showUnifiedModal, setShowUnifiedModal] = useState<boolean>(false);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [jobsFilter, setJobsFilter] = useState<string>('all');

  // Load all jobs from Firestore for Jobs Applied page
  const loadAllJobs = async () => {
    try {
      const jobsRef = collection(db, 'jobs');
      const snapshot = await getDocs(jobsRef);
      const jobsList: Job[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<Job, 'id'>)
      }));
      
      // Sort by username A-Z, then by date
      jobsList.sort((a, b) => {
        if (a.username !== b.username) {
          return a.username.localeCompare(b.username);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      setAllJobs(jobsList);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  };

  // Fetch stats for a single user
  const fetchUserStats = async (username: string, jobsApplied: number = 0): Promise<UserStats> => {
    const url = `https://leetcode-stats-api.herokuapp.com/${username}`;
    const maxRetries = 2; // total attempts = 1 + maxRetries
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(url);

        // Retry on server errors (5xx)
        if (!response.ok) {
          if (response.status >= 500 && attempt < maxRetries) {
            attempt++;
            const backoff = 500 * Math.pow(2, attempt - 1);
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
        const backoff = 500 * Math.pow(2, attempt - 1);
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
      const userList: FirestoreUser[] = snapshot.docs.map(d => ({
        id: d.id,
        username: (d.data() as any).username as string,
        name: (d.data() as any).name as string | undefined,
      }));
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
      
      // Reload stats to reflect the new job
      await loadAllStats();
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
      
      // Reload all stats to update XP and rankings
      await loadAllStats();
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

    // Check if user already exists
    if (users.some(u => u.username === trimmedUsername)) {
      alert(`User "${trimmedUsername}" already exists!`);
      return false;
    }
    
    try {
      // First fetch the user's current stats to validate they exist on LeetCode
      setLoading(true);
      const userCurrentStats = await fetchUserStats(trimmedUsername);
      
      // Check if user exists on LeetCode
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
      
      await addDoc(collection(db, 'users'), {
        username: trimmedUsername,
        name: trimmedName,
        jobsApplied: 0, // Initialize job count
        createdAt: new Date().toISOString()
      });
      setNewUsername('');
      setNewName('');
      const updatedUsers = await loadUsersFromFirestore();
      
      // Add user to existing snapshots with current stats as baseline (include display name)
      await addUserToSnapshots(trimmedUsername, userCurrentStats, trimmedName);
      
      // Small delay to ensure Firestore has processed the updates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload snapshots
      const weekly = await loadLatestSnapshot('weekly');
      const monthly = await loadLatestSnapshot('monthly');
      
      setWeeklySnapshot(weekly);
      setMonthlySnapshot(monthly);
      
      // Recalculate rankings with updated snapshots
      await loadAllStats(updatedUsers, weekly, monthly);
      return true; // Indicate success
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user. Please try again.');
      setLoading(false);
      return false; // Indicate failure
    }
  };

  

  // Load latest snapshot for a period
  const loadLatestSnapshot = async (period: SnapshotPeriod): Promise<LeaderboardSnapshot | null> => {
    try {
      const snapshotsRef = collection(db, 'leaderboardSnapshots');
      const q = query(
        snapshotsRef,
        where('period', '==', period),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const snapshotData = {
          id: doc.id,
          ...doc.data()
        } as LeaderboardSnapshot;
        return snapshotData;
      }
      return null;
    } catch (error) {
      console.error(`Error loading ${period} snapshot:`, error);
      return null;
    }
  };

  // Add user to existing snapshots
  const addUserToSnapshots = async (username: string, userStats: UserStats, name?: string) => {
    try {
      const snapshotsRef = collection(db, 'leaderboardSnapshots');
      const snapshot = await getDocs(snapshotsRef);
      
      const newUserData = {
        username: username,
        name: name,
        jobsApplied: userStats.jobsApplied,
        easy: userStats.easy,
        medium: userStats.medium,
        hard: userStats.hard,
        total: userStats.total,
        xp: userStats.xp
      };
      
      // Add user to all existing snapshots
      const updatePromises = snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data() as LeaderboardSnapshot;
        
        // Check if user already exists in this snapshot
        if (!data.users.some(u => u.username === username)) {
          const updatedUsers = [...data.users, newUserData];
          // Atomically update the document
          await updateDoc(doc(db, 'leaderboardSnapshots', docSnapshot.id), {
            users: updatedUsers
          });
        }
      });
      
      await Promise.all(updatePromises);
      
      // If no snapshots exist, create initial ones
      if (snapshot.empty) {
        await addDoc(snapshotsRef, {
          period: 'weekly',
          createdAt: new Date().toISOString(),
          users: [newUserData]
        });
        await addDoc(snapshotsRef, {
          period: 'monthly',
          createdAt: new Date().toISOString(),
          users: [newUserData]
        });
      }
    } catch (error) {
      console.error('Error adding user to snapshots:', error);
    }
  };

  // Capture snapshot
  const captureSnapshot = async (period: SnapshotPeriod) => {
    try {
      // Ensure we have stats to capture
      if (userStats.length === 0) {
        return;
      }

      // Delete old snapshot of this period
      const snapshotsRef = collection(db, 'leaderboardSnapshots');
      const q = query(snapshotsRef, where('period', '==', period));
      const oldSnapshots = await getDocs(q);
      
      const deletePromises = oldSnapshots.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      await Promise.all(deletePromises);

      // Create new snapshot with current stats
      const snapshotData: Omit<LeaderboardSnapshot, 'id'> = {
        period,
        createdAt: new Date().toISOString(),
        users: userStats.map(user => ({
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

      await addDoc(snapshotsRef, snapshotData);
      
      // Reload the snapshot
      const newSnapshot = await loadLatestSnapshot(period);
      if (period === 'weekly') {
        setWeeklySnapshot(newSnapshot);
        // Recalculate rankings with new weekly snapshot
        await loadAllStats(undefined, newSnapshot, monthlySnapshot);
      } else {
        setMonthlySnapshot(newSnapshot);
        // Recalculate rankings with new monthly snapshot
        await loadAllStats(undefined, weeklySnapshot, newSnapshot);
      }
    } catch (error) {
      console.error(`Error capturing ${period} snapshot:`, error);
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
      // User not in snapshot yet - show as 0 progress
      return {
        username: current.username,
        name: current.name,
        jobsApplied: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        total: 0,
        xp: 0,
        rank: 0,
        error: current.error
      };
    }

    const jobsDelta = Math.max(0, current.jobsApplied - (baseline.jobsApplied || 0));
    const easyDelta = Math.max(0, current.easy - baseline.easy);
    const mediumDelta = Math.max(0, current.medium - baseline.medium);
    const hardDelta = Math.max(0, current.hard - baseline.hard);
    const xpDelta = (jobsDelta * 0.5) + (easyDelta * 1) + (mediumDelta * 2) + (hardDelta * 4);

    return {
      username: current.username,
      name: current.name,
      jobsApplied: jobsDelta,
      easy: easyDelta,
      medium: mediumDelta,
      hard: hardDelta,
      total: Math.max(0, current.total - baseline.total),
      xp: xpDelta,
      rank: 0,
      error: current.error
    };
  };

  // Load stats for all users
  const loadAllStats = async (userList?: FirestoreUser[], weeklySnap?: LeaderboardSnapshot | null, monthlySnap?: LeaderboardSnapshot | null) => {
    setLoading(true);

    try {
      const usersToFetch = userList || await loadUsersFromFirestore();
      
      if (usersToFetch.length === 0) {
        setUserStats([]);
        setWeeklyStats([]);
        setMonthlyStats([]);
        setLoading(false);
        return;
      }

      // Use passed snapshots or fall back to state
      const currentWeeklySnapshot = weeklySnap !== undefined ? weeklySnap : weeklySnapshot;
      const currentMonthlySnapshot = monthlySnap !== undefined ? monthlySnap : monthlySnapshot;

      // Fetch all users in parallel and attach display names from Firestore
      const stats = await Promise.all(
        usersToFetch.map((u: FirestoreUser) => fetchUserStats(u.username, u.jobsApplied || 0))
      );

      // Attach names from usersToFetch to the fetched stats (preserve order)
      const statsWithNames: UserStats[] = stats.map((s, idx) => ({
        ...s,
        name: usersToFetch[idx]?.name,
      }));

      // Sort by XP descending with total as tiebreaker
      const sortedStats = statsWithNames.sort((a: UserStats, b: UserStats) => {
        if (b.xp === a.xp) return b.total - a.total;
        return b.xp - a.xp;
      });

      // Assign ranks
      const rankedStats = sortedStats.map((stat: UserStats, index: number) => ({
        ...stat,
        rank: index + 1,
      }));

      setUserStats(rankedStats);
      
      // Calculate weekly progress (NOT lifetime totals)
      const weeklyProgress = rankedStats.map(stat => {
        const baselineUser = findSnapshotUser(currentWeeklySnapshot, stat.username);
        return computeProgress(stat, baselineUser);
      });
      
      // Sort by XP descending with total as tiebreaker
      const weeklyRanked = weeklyProgress
        .sort((a, b) => {
          if (b.xp === a.xp) return b.total - a.total;
          return b.xp - a.xp;
        })
        .map((stat, index) => ({ ...stat, rank: index + 1 }));
      setWeeklyStats(weeklyRanked);
      
      // Calculate monthly progress (NOT lifetime totals)
      const monthlyProgress = rankedStats.map(stat => {
        const baselineUser = findSnapshotUser(currentMonthlySnapshot, stat.username);
        return computeProgress(stat, baselineUser);
      });
      
      // Sort by XP descending with total as tiebreaker
      const monthlyRanked = monthlyProgress
        .sort((a, b) => {
          if (b.xp === a.xp) return b.total - a.total;
          return b.xp - a.xp;
        })
        .map((stat, index) => ({ ...stat, rank: index + 1 }));
      setMonthlyStats(monthlyRanked);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if snapshot needs reset
  const shouldResetWeeklySnapshot = (snapshot: LeaderboardSnapshot | null): boolean => {
    if (!snapshot) return false;
    
    const snapshotDate = new Date(snapshot.createdAt);
    const now = new Date();
    
    // Check if current date is Sunday (0) and snapshot is from a previous week
    const isSunday = now.getDay() === 0;
    const isNewWeek = now.getTime() - snapshotDate.getTime() > 7 * 24 * 60 * 60 * 1000;
    
    return isSunday && isNewWeek;
  };

  const shouldResetMonthlySnapshot = (snapshot: LeaderboardSnapshot | null): boolean => {
    if (!snapshot) return false;
    
    const snapshotDate = new Date(snapshot.createdAt);
    const now = new Date();
    
    // Check if current date is 1st of the month and snapshot is from a previous month
    const isFirstOfMonth = now.getDate() === 1;
    const isDifferentMonth = 
      snapshotDate.getMonth() !== now.getMonth() || 
      snapshotDate.getFullYear() !== now.getFullYear();
    
    return isFirstOfMonth && isDifferentMonth;
  };

  // Load users and snapshots on mount
  useEffect(() => {
    const initializeData = async () => {
      const users = await loadUsersFromFirestore();
      
      // Load snapshots
      const weekly = await loadLatestSnapshot('weekly');
      const monthly = await loadLatestSnapshot('monthly');
      
      setWeeklySnapshot(weekly);
      setMonthlySnapshot(monthly);
      
      // Recalculate stats with loaded snapshots
      await loadAllStats(users, weekly, monthly);
      
      // Load all jobs
      await loadAllJobs();
      
      // Check if snapshots need to be reset
      if (users.length > 0) {
        if (shouldResetWeeklySnapshot(weekly)) {
          setTimeout(() => captureSnapshot('weekly'), 1000);
        }
        
        if (shouldResetMonthlySnapshot(monthly)) {
          setTimeout(() => captureSnapshot('monthly'), 1000);
        }
      }
    };
    
    initializeData();
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
          </div>

        </div>

        {/* Navigation Tabs */}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

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
                <h3 className="text-2xl font-bold text-white mb-3">No Users Yet</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Add users to see weekly progress tracking.
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
            ) : monthlyStats.length === 0 ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
                  <FaTrophy className="text-4xl text-purple-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No Users Yet</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Add users to see monthly progress tracking.
                </p>
              </div>
              
            ) : (
              <>
                {!monthlySnapshot && (
                  <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-yellow-200 text-sm">
                    ⚠️ No monthly baseline yet. Progress will show as 0 until a snapshot is captured.
                  </div>
                )}
                <LeaderboardTable
                  userStats={monthlyStats}
                />
              </>
            )}
            
          </>
        )}

        {/* Jobs Applied View */}
        {activeTab === 'jobs' && (
          <div className="mt-8">
            {/* Filter Dropdown & Hint */}
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
                <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
                  <FaTrophy className="text-4xl text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No Jobs Yet</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Start adding job applications to track your progress!
                </p>
              </div>
            ) : allJobs.filter(job => jobsFilter === 'all' || job.username === jobsFilter).length === 0 ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
                  <FaTrophy className="text-4xl text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No Jobs Found</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Apply to jobs to see them here!
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-800 shadow-2xl">
                <table className="min-w-full table-fixed">
                  <thead className="bg-[#262626]">
                    <tr>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="w-[30%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Job Title
                      </th>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Job URL
                      </th>
                      <th className="w-[15%] px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="w-auto px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Date Applied
                      </th>
                      <th className="w-[5%] px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Action
                      </th>
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
                        
                        // Status badge colors
                        const getStatusColor = (status: Job['status']) => {
                          switch (status) {
                            case 'Applied':
                              return 'bg-blue-500 hover:bg-blue-400 text-white';
                                case 'Assessment':
                                  return 'bg-green-500 hover:bg-green-400 text-white';
                                case 'Interview':
                                  return 'bg-orange-600 hover:bg-orange-500 text-white';
                                case 'Offer':
                                  return 'bg-yellow-500 hover:bg-yellow-600 text-white';
                            default:
                              return 'bg-gray-500 hover:bg-gray-400 text-white';
                          }
                        };
                        
                        return (
                          <tr
                            key={job.id || index}
                            className={`${
                              index % 2 === 0 ? 'bg-[#262626]' : 'bg-[#2d2d2d]'
                            } hover:bg-[#333333] transition-colors duration-150`}
                          >
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div>
                                <div className="text-base font-semibold text-white truncate">
                                  {job.username}
                                </div>
                                {user?.name && (
                                  <div className="text-sm text-gray-400 mt-1 truncate">{user.name}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap truncate">
                              <div className="text-base text-white truncate">{job.title}</div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap truncate">
                              <div className="text-base text-white">{job.company}</div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap truncate">
                              <a
                                href={job.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 hover:underline"
                              >
                                URL
                              </a>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  if (job.id) {
                                    const nextStatus = getNextStatus(job.status);
                                    updateJobStatus(job.id, nextStatus);
                                  }
                                }}
                                className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors ${getStatusColor(
                                  job.status
                                )}`}
                              >
                                {job.status}
                              </button>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="text-base text-white">{formattedDate}</div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-right">
                              <button
                                onClick={() => {
                                  if (job.id) {
                                    deleteJob(job.id);
                                  }
                                }}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                                aria-label="Delete job"
                                title="Delete job"
                              >
                                <FaTrash />
                              </button>
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
            if (users.length > 0) {
              setSelectedJobUsername(users[0]?.username || '');
            }
          }}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#FFA116] hover:bg-[#FFB84D] text-black rounded-full shadow-lg flex items-center justify-center text-2xl font-bold transition-all duration-200 hover:scale-110 z-40"
          title="Add"
        >
          +
        </button>

        {/* Unified Add Modal with Segmented Control */}
        {showUnifiedModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowUnifiedModal(false)}>
            <div className="bg-[#262626] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl h-[580px] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Segmented Control */}
              <div className="flex gap-2 mb-6 bg-[#1a1a1a] p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setModalActionType('job')}
                  className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 ${
                    modalActionType === 'job'
                      ? 'bg-blue-500 text-black'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Add Job
                </button>
                <button
                  type="button"
                  onClick={() => setModalActionType('user')}
                  className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 ${
                    modalActionType === 'user'
                      ? 'bg-[#FFA116] text-black'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Add User
                </button>
              </div>

              {/* Add Job Form */}
              {modalActionType === 'job' && (
                <form onSubmit={async (e) => { 
                  e.preventDefault(); 
                  const success = await addJob();
                  if (success) {
                    setShowUnifiedModal(false);
                  }
                }} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="unified-job-username" className="block text-sm font-medium text-gray-400 mb-2">
                        Username
                      </label>
                      <select
                        id="unified-job-username"
                        value={selectedJobUsername}
                        onChange={(e) => setSelectedJobUsername(e.target.value)}
                        className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                        autoFocus
                      >
                        {users.length === 0 ? (
                          <option value="">No users available</option>
                        ) : (
                          users.map(user => (
                            <option key={user.username} value={user.username}>
                              {user.username}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="unified-job-title" className="block text-sm font-medium text-gray-400 mb-2">
                        Job Title
                      </label>
                      <input
                        type="text"
                        id="unified-job-title"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g., Software Engineer"
                        className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="unified-job-company" className="block text-sm font-medium text-gray-400 mb-2">
                        Company
                      </label>
                      <input
                        type="text"
                        id="unified-job-company"
                        value={jobCompany}
                        onChange={(e) => setJobCompany(e.target.value)}
                        placeholder="e.g., Google"
                        className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="unified-job-url" className="block text-sm font-medium text-gray-400 mb-2">
                        Job URL
                      </label>
                      <input
                        type="url"
                        id="unified-job-url"
                        value={jobUrl}
                        onChange={(e) => setJobUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowUnifiedModal(false); setJobUrl(''); setJobTitle(''); setJobCompany(''); }}
                      className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!selectedJobUsername || !jobUrl.trim() || !jobTitle.trim() || !jobCompany.trim() || loading}
                      className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-all duration-200"
                    >
                      {loading ? 'Saving...' : 'Save Job'}
                    </button>
                  </div>
                </form>
              )}

              {/* Add User Form */}
              {modalActionType === 'user' && (
                <form onSubmit={async (e) => { 
                  e.preventDefault(); 
                  const success = await addUser();
                  if (success) {
                    setShowUnifiedModal(false);
                  }
                }} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="unified-leetcode-username" className="block text-sm font-medium text-gray-400 mb-2">
                        LeetCode Username
                      </label>
                      <input
                        type="text"
                        id="unified-leetcode-username"
                        name="username"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Enter LeetCode username"
                        autoComplete="username"
                        autoFocus
                        className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-[#FFA116] transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="unified-display-name" className="block text-sm font-medium text-gray-400 mb-2">
                        Display Name
                      </label>
                      <input
                        type="text"
                        id="unified-display-name"
                        name="displayName"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Enter a name to display (e.g. 'Sebastian')"
                        className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-[#FFA116] transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowUnifiedModal(false); setNewUsername(''); setNewName(''); }}
                      className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newUsername.trim() || !newName.trim() || loading}
                      className="flex-1 px-4 py-3 bg-[#FFA116] hover:bg-[#FFB84D] disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-all duration-200 text-center"
                    >
                      {loading ? 'Adding...' : 'Add User'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

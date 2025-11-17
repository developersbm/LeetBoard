import { useState, useEffect } from 'react';
import { FaTrophy, FaCode } from 'react-icons/fa';
import { IoMdRefresh } from 'react-icons/io';
import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import LeaderboardTable from './components/LeaderboardTable';
import TabNavigation from './components/TabNavigation';

interface DifficultyStats {
  easy: number;
  medium: number;
  hard: number;
  total: number;
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
  easy: number;
  medium: number;
  hard: number;
  total: number;
}

interface FirestoreUser {
  id?: string;
  username: string;
  name?: string;
}

interface LeaderboardSnapshot {
  id?: string;
  period: SnapshotPeriod;
  createdAt: string;
  users: SnapshotUserStats[];
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
  const [activeTab, setActiveTab] = useState<'all' | 'weekly' | 'monthly'>('all');
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [weeklySnapshot, setWeeklySnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [monthlySnapshot, setMonthlySnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<UserStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<UserStats[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);

  // Fetch stats for a single user
  const fetchUserStats = async (username: string): Promise<UserStats> => {
    try {
      const response = await fetch(`https://leetcode-stats-api.herokuapp.com/${username}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: LeetCodeResponse = await response.json();

      // Check if the request was successful
      if (data.status !== 'success') {
        return {
          username,
          easy: 0,
          medium: 0,
          hard: 0,
          total: 0,
          rank: 0,
          error: 'User not found',
        };
      }

      const easy = data.easySolved;
      const medium = data.mediumSolved;
      const hard = data.hardSolved;
      const total = data.totalSolved;

      return {
        username,
        easy,
        medium,
        hard,
        total,
        rank: 0, // Will be assigned after sorting
        error: null,
      };
    } catch (error) {
      console.error(`Error fetching stats for ${username}:`, error);
      return {
        username,
        easy: 0,
        medium: 0,
        hard: 0,
        total: 0,
        rank: 0,
        error: error instanceof Error ? error.message : 'Error fetching data',
      };
    }
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
        alert(`Could not add user: "${trimmedUsername}" does not exist on LeetCode or the API is down.`);
        setLoading(false);
        return false;
      }
      
      await addDoc(collection(db, 'users'), {
        username: trimmedUsername,
        name: trimmedName,
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

  // Remove user from Firestore
  const removeUser = async (username: string) => {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const userDoc = snapshot.docs.find(doc => doc.data().username === username);
      
      if (userDoc) {
        // Delete user from users collection
        await deleteDoc(doc(db, 'users', userDoc.id));
        
        // Remove user from all snapshots
        const snapshotsRef = collection(db, 'leaderboardSnapshots');
        const snapshotsSnapshot = await getDocs(snapshotsRef);
        
        const updatePromises = snapshotsSnapshot.docs.map(async (snapshotDoc) => {
          const data = snapshotDoc.data() as LeaderboardSnapshot;
          
          // Check if user exists in this snapshot
          const userExists = data.users.some(u => u.username === username);
          if (userExists) {
            // Remove user from the users array
            const updatedUsers = data.users.filter(u => u.username !== username);
            
            // Update the snapshot document with the filtered users
            await deleteDoc(doc(db, 'leaderboardSnapshots', snapshotDoc.id));
            if (updatedUsers.length > 0) {
              // Only recreate if there are remaining users
              await addDoc(snapshotsRef, {
                ...data,
                users: updatedUsers
              });
            }
          }
        });
        
        await Promise.all(updatePromises);
        
        // Reload data
        const updatedUsers = await loadUsersFromFirestore();
        const weekly = await loadLatestSnapshot('weekly');
        const monthly = await loadLatestSnapshot('monthly');
        setWeeklySnapshot(weekly);
        setMonthlySnapshot(monthly);
        await loadAllStats(updatedUsers, weekly, monthly);
      }
    } catch (error) {
      console.error('Error removing user:', error);
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
        console.log(`Loaded ${period} snapshot:`, snapshotData);
        console.log(`   Users in snapshot:`, snapshotData.users);
        return snapshotData;
      }
      console.log(`No ${period} snapshot found in Firestore`);
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
        easy: userStats.easy,
        medium: userStats.medium,
        hard: userStats.hard,
        total: userStats.total
      };
      
      // Add user to all existing snapshots
      const updatePromises = snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data() as LeaderboardSnapshot;
        
        // Check if user already exists in this snapshot
        if (!data.users.some(u => u.username === username)) {
          const updatedUsers = [...data.users, newUserData];
          await deleteDoc(doc(db, 'leaderboardSnapshots', docSnapshot.id));
          await addDoc(snapshotsRef, {
            ...data,
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
        console.log(`No users to capture for ${period} snapshot`);
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
          easy: user.easy,
          medium: user.medium,
          hard: user.hard,
          total: user.total
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
        easy: 0,
        medium: 0,
        hard: 0,
        total: 0,
        rank: 0,
        error: current.error
      };
    }

    return {
      username: current.username,
      easy: Math.max(0, current.easy - baseline.easy),
      medium: Math.max(0, current.medium - baseline.medium),
      hard: Math.max(0, current.hard - baseline.hard),
      total: Math.max(0, current.total - baseline.total),
      rank: 0,
      error: current.error
    };
  };

  // Load stats for all users
  const loadAllStats = async (userList?: FirestoreUser[], weeklySnap?: LeaderboardSnapshot | null, monthlySnap?: LeaderboardSnapshot | null) => {
    setLoading(true);

    try {
      const usersToFetch = userList || users;
      
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

      console.log('📊 Computing stats with snapshots:', {
        weekly: currentWeeklySnapshot ? `${currentWeeklySnapshot.users.length} users` : 'null',
        monthly: currentMonthlySnapshot ? `${currentMonthlySnapshot.users.length} users` : 'null'
      });

      // Fetch all users in parallel and attach display names from Firestore
      const stats = await Promise.all(
        usersToFetch.map((u: FirestoreUser) => fetchUserStats(u.username))
      );

      // Attach names from usersToFetch to the fetched stats (preserve order)
      const statsWithNames: UserStats[] = stats.map((s, idx) => ({
        ...s,
        name: usersToFetch[idx]?.name,
      }));

      // Sort by total descending
      const sortedStats = statsWithNames.sort((a: UserStats, b: UserStats) => {
        return b.total - a.total;
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
        const progress = computeProgress(stat, baselineUser);
        console.log(`📈 Weekly progress for ${stat.username}:`, {
          current: { easy: stat.easy, medium: stat.medium, hard: stat.hard, total: stat.total },
          baseline: baselineUser,
          progress: { easy: progress.easy, medium: progress.medium, hard: progress.hard, total: progress.total }
        });
        return progress;
      });
      
      // Sort by total progress (problems solved since baseline)
      const weeklyRanked = weeklyProgress
        .sort((a, b) => b.total - a.total)
        .map((stat, index) => ({ ...stat, rank: index + 1 }));
      setWeeklyStats(weeklyRanked);
      
      // Calculate monthly progress (NOT lifetime totals)
      const monthlyProgress = rankedStats.map(stat => {
        const baselineUser = findSnapshotUser(currentMonthlySnapshot, stat.username);
        return computeProgress(stat, baselineUser);
      });
      
      // Sort by total progress (problems solved since baseline)
      const monthlyRanked = monthlyProgress
        .sort((a, b) => b.total - a.total)
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
      
      console.log('🔄 Setting snapshot states...');
      setWeeklySnapshot(weekly);
      setMonthlySnapshot(monthly);
      
      // Recalculate stats with loaded snapshots
      await loadAllStats(users, weekly, monthly);
      
      // Check if snapshots need to be reset
      if (users.length > 0) {
        if (shouldResetWeeklySnapshot(weekly)) {
          console.log('Resetting weekly snapshot (Sunday reset)');
          setTimeout(() => captureSnapshot('weekly'), 1000);
        }
        
        if (shouldResetMonthlySnapshot(monthly)) {
          console.log('Resetting monthly snapshot (1st of month reset)');
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
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <FaCode className="text-[#FFA116]" />
                LeetBoard
              </h1>
              <p className="text-gray-400 text-base flex items-center gap-2">
                <FaTrophy className="text-[#FFA116]" />
                Let's grind
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
                onRemoveUser={removeUser}
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
                  onRemoveUser={removeUser}
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
                  onRemoveUser={removeUser}
                />
              </>
            )}
          </>
        )}

        {/* Floating Add User Button */}
        <button
          onClick={() => setShowAddUserModal(true)}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#FFA116] hover:bg-[#FFB84D] text-black rounded-full shadow-lg flex items-center justify-center text-2xl font-bold transition-all duration-200 hover:scale-110"
          title="Add User"
        >
          +
        </button>

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddUserModal(false)}>
            <div className="bg-[#262626] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FaCode className="text-[#FFA116]" />
                  Add User
                </h2>
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="text-gray-400 hover:text-white text-2xl transition-colors"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={async (e) => { 
                e.preventDefault(); 
                const success = await addUser();
                if (success) {
                  setShowAddUserModal(false);
                }
              }} className="space-y-4">
                <div>
                  <label htmlFor="modal-leetcode-username" className="block text-sm font-medium text-gray-400 mb-2">
                    LeetCode Username
                  </label>
                  <input
                    type="text"
                    id="modal-leetcode-username"
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
                  <label htmlFor="modal-display-name" className="block text-sm font-medium text-gray-400 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    id="modal-display-name"
                    name="displayName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter a name to display (e.g. 'Sebastian')"
                    className="w-full px-4 py-3 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-[#FFA116] transition-colors"
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAddUserModal(false); setNewUsername(''); }}
                    className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newUsername.trim() || !newName.trim() || loading}
                    className="flex-1 px-4 py-3 bg-[#FFA116] hover:bg-[#FFB84D] disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-all duration-200"
                  >
                    {loading ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

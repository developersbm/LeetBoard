import { useState, useEffect } from 'react';
import { FaTrophy, FaCode } from 'react-icons/fa';
import { IoMdRefresh } from 'react-icons/io';
import { MdError } from 'react-icons/md';

// Hardcoded list of LeetCode usernames
// Edit this array to add/remove friends
const LEETCODE_USERNAMES = [
    'sebastianbastida',
];

interface DifficultyStats {
  easy: number;
  medium: number;
  hard: number;
  total: number;
}

interface UserStats extends DifficultyStats {
  username: string;
  rank: number;
  error?: string | null;
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
  const [activeTab, setActiveTab] = useState<'total' | 'weekly' | 'monthly'>('total');

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

  // Load stats for all users
  const loadAllStats = async () => {
    setLoading(true);

    try {
      // Fetch all users in parallel
      const statsPromises = LEETCODE_USERNAMES.map((username) =>
        fetchUserStats(username)
      );
      const stats = await Promise.all(statsPromises);

      // Sort by total descending
      const sortedStats = stats.sort((a, b) => {
        return b.total - a.total;
      });

      // Assign ranks
      const rankedStats = sortedStats.map((stat, index) => ({
        ...stat,
        rank: index + 1,
      }));

      setUserStats(rankedStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load stats on mount
  useEffect(() => {
    loadAllStats();
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
            <button
              onClick={loadAllStats}
              disabled={loading}
              className="px-6 py-3 bg-[#FFA116] hover:bg-[#FFB84D] disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:text-gray-500"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <IoMdRefresh className="animate-spin h-5 w-5" />
                  Refreshing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <IoMdRefresh className="h-5 w-5" />
                  Refresh Stats
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6 border-b border-gray-800">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('total')}
              className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'total'
                  ? 'border-[#FFA116] text-[#FFA116]'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Total Stats
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'monthly'
                  ? 'border-[#FFA116] text-[#FFA116]'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Monthly Stats
            </button>
            <button
              onClick={() => setActiveTab('weekly')}
              className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'weekly'
                  ? 'border-[#FFA116] text-[#FFA116]'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              Weekly Stats
            </button>
          </nav>
        </div>

        {/* Loading State */}
        {activeTab === 'total' && (
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
          /* Leaderboard Table */
          <div className="overflow-hidden rounded-xl border border-gray-800 shadow-2xl">
            <table className="min-w-full">
              <thead className="bg-[#262626]">
                <tr>
                  <th className="px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <span className="text-[#00B8A3]">Easy</span>
                  </th>
                  <th className="px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <span className="text-[#FFC01E]">Medium</span>
                  </th>
                  <th className="px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <span className="text-[#FF375F]">Hard</span>
                  </th>
                  <th className="px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {userStats.map((user, index) => (
                  <tr
                    key={user.username}
                    className={`${
                      index % 2 === 0 ? 'bg-[#262626]' : 'bg-[#2d2d2d]'
                    } hover:bg-[#333333] transition-colors duration-150`}
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${user.rank === 1 ? 'text-yellow-400' : user.rank === 2 ? 'text-gray-300' : user.rank === 3 ? 'text-amber-600' : 'text-white'}`}>
                          #{user.rank}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div>
                        <div className="text-base font-semibold text-white">
                          {user.username}
                        </div>
                        {user.error && (
                          <div className="text-xs text-red-400 mt-1 flex items-center gap-1">
                            <MdError />
                            {user.error}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <span className="text-base font-semibold text-[#00B8A3]">
                        {user.error ? 'N/A' : user.easy}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <span className="text-base font-semibold text-[#FFC01E]">
                        {user.error ? 'N/A' : user.medium}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <span className="text-base font-semibold text-[#FF375F]">
                        {user.error ? 'N/A' : user.hard}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <span className="text-base font-semibold text-gray-300">
                        {user.error ? 'N/A' : user.total}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}

        {/* Weekly Stats */}
        {activeTab === 'weekly' && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
              <FaTrophy className="text-4xl text-[#FFA116]" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Weekly Stats Coming Soon</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Track your weekly progress and compete with friends. This feature will automatically reset every week to show fresh rankings.
            </p>
          </div>
        )}

        {/* Monthly Stats */}
        {activeTab === 'monthly' && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
              <FaTrophy className="text-4xl text-[#FFA116]" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Monthly Stats Coming Soon</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Track your monthly progress and compete with friends. This feature will automatically reset every month to show fresh rankings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

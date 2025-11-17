import { FaTrophy } from 'react-icons/fa';
import { MdError } from 'react-icons/md';

interface UserStats {
  username: string;
  name?: string;
  rank: number;
  easy: number;
  medium: number;
  hard: number;
  total: number;
  xp: number;
  error?: string | null;
}


interface LeaderboardTableProps {
  userStats: UserStats[];
}

export default function LeaderboardTable({ 
  userStats, 
}: LeaderboardTableProps) {
  if (userStats.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-[#262626] rounded-full">
          <FaTrophy className="text-4xl text-[#FFA116]" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">No Users Yet</h3>
        <p className="text-gray-400 max-w-md mx-auto">
          Add your first LeetCode username above to get started!
        </p>
      </div>
    );
  }

  return (
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
              <span className="text-[#9B5CF6]">XP</span>
            </th>
            <th className="px-6 py-5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
              Total
            </th>
            {/* Commented out Action column - delete disabled in UI
            <th className="px-6 py-5 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
              Action
            </th>
            */}
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
                  <span className={`text-lg font-bold ${
                    user.rank === 1 ? 'text-yellow-400' : 
                    user.rank === 2 ? 'text-gray-300' : 
                    user.rank === 3 ? 'text-amber-600' : 
                    'text-white'
                  }`}>
                    #{user.rank}
                  </span>
                </div>
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <div>
                  <div className="text-base font-semibold text-white">
                    {user.username}
                  </div>
                  {user.name && (
                    <div className="text-sm text-gray-400 mt-1">{user.name}</div>
                  )}
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
                <span className="text-base font-semibold text-[#9B5CF6]">
                  {user.error ? 'N/A' : user.xp}
                </span>
              </td>
              <td className="px-6 py-5 whitespace-nowrap text-right">
                <span className="text-base font-semibold text-gray-300">
                  {user.error ? 'N/A' : user.total}
                </span>
              </td>
              {/* Action removed: delete button commented out
              <td className="px-6 py-5 whitespace-nowrap text-center">
                <button
                  onClick={() => onRemoveUser(user.username)}
                  className="text-red-400 hover:text-red-300 font-bold text-lg transition-colors"
                  title="Remove user"
                >
                  ✕
                </button>
              </td>
              */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

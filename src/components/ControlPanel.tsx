import { IoMdRefresh } from 'react-icons/io';

interface ControlPanelProps {
  newUsername: string;
  loading: boolean;
  onUsernameChange: (value: string) => void;
  onAddUser: () => void;
  onRefresh: () => void;
}

export default function ControlPanel({
  newUsername,
  loading,
  onUsernameChange,
  onAddUser,
  onRefresh
}: ControlPanelProps) {
  return (
    <div className="bg-[#262626] rounded-lg p-4 space-y-4">
      {/* Add User Section */}
      <form onSubmit={(e) => { e.preventDefault(); onAddUser(); }} className="flex gap-3">
        <input
          type="text"
          id="leetcode-username"
          name="username"
          value={newUsername}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder="Enter LeetCode username"
          autoComplete="username"
          className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white border border-gray-700 rounded-lg focus:outline-none focus:border-[#FFA116] transition-colors"
        />
        <button
          type="submit"
          disabled={!newUsername.trim()}
          className="px-6 py-2 bg-[#FFA116] hover:bg-[#FFB84D] disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-all duration-200"
        >
          Add User
        </button>
      </form>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200 flex items-center gap-2"
        >
          <IoMdRefresh className={loading ? "animate-spin h-4 w-4" : "h-4 w-4"} />
          {loading ? 'Refreshing...' : 'Refresh Stats'}
        </button>
      </div>
    </div>
  );
}

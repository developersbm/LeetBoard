interface TabNavigationProps {
  activeTab: 'all' | 'jobs' | 'weekly' | 'monthly' | 'yearly';
  onTabChange: (tab: 'all' | 'jobs' | 'weekly' | 'monthly' | 'yearly') => void;
}

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="flex gap-4 border-b border-gray-700 overflow-x-auto">
      <button
        onClick={() => onTabChange('all')}
        className={`px-6 py-3 font-semibold transition-all duration-200 whitespace-nowrap ${activeTab === 'all'
            ? 'text-[#FFA116] border-b-2 border-[#FFA116]'
            : 'text-gray-400 hover:text-gray-200'
          }`}
      >
        All Time
      </button>
      <button
        onClick={() => onTabChange('jobs')}
        className={`px-6 py-3 font-semibold transition-all duration-200 whitespace-nowrap ${activeTab === 'jobs'
            ? 'text-blue-400 border-b-2 border-blue-400'
            : 'text-gray-400 hover:text-gray-200'
          }`}
      >
        Jobs Applied
      </button>
      <button
        onClick={() => onTabChange('weekly')}
        className={`px-6 py-3 font-semibold transition-all duration-200 whitespace-nowrap ${activeTab === 'weekly'
            ? 'text-green-400 border-b-2 border-green-400'
            : 'text-gray-400 hover:text-gray-200'
          }`}
      >
        Weekly Progress
      </button>
      <button
        onClick={() => onTabChange('monthly')}
        className={`px-6 py-3 font-semibold transition-all duration-200 whitespace-nowrap ${activeTab === 'monthly'
            ? 'text-purple-400 border-b-2 border-purple-400'
            : 'text-gray-400 hover:text-gray-200'
          }`}
      >
        Monthly Progress
      </button>
      <button
        onClick={() => onTabChange('yearly')}
        className={`px-6 py-3 font-semibold transition-all duration-200 whitespace-nowrap ${activeTab === 'yearly'
            ? 'text-pink-400 border-b-2 border-pink-400'
            : 'text-gray-400 hover:text-gray-200'
          }`}
      >
        Yearly Progress
      </button>
    </div>
  );
}

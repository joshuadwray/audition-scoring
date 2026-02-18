'use client';

interface SessionHeaderProps {
  sessionName: string;
  role: 'admin' | 'judge';
  judgeName?: string;
  onLogout: () => void;
}

export default function SessionHeader({ sessionName, role, judgeName, onLogout }: SessionHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{sessionName}</h1>
        <p className="text-sm text-gray-500">
          {role === 'admin' ? 'Admin Dashboard' : `Judge: ${judgeName}`}
        </p>
      </div>
      <button
        onClick={onLogout}
        className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
      >
        Logout
      </button>
    </header>
  );
}

'use client';

interface MyScoresCardProps {
  groupNumber: number;
  materialName: string;
  submittedAt: string;
  dancerCount: number;
  onClick: () => void;
  isLocked: boolean;
}

export default function MyScoresCard({
  groupNumber,
  materialName,
  submittedAt,
  dancerCount,
  onClick,
  isLocked,
}: MyScoresCardProps) {
  const formattedTime = new Date(submittedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all text-left"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Group {groupNumber}</div>
          <div className="text-sm text-gray-500">{materialName}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">{formattedTime}</div>
          <div className="text-xs text-gray-400">{dancerCount} dancers</div>
        </div>
      </div>
      {isLocked && (
        <div className="mt-2 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
          Session locked - Read only
        </div>
      )}
    </button>
  );
}

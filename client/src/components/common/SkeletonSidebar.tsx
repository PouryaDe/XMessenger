import React from 'react';

export const SkeletonSidebar: React.FC = () => {
  return (
    <div className="p-2.5 space-y-2 pointer-events-none select-none animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((idx) => (
        <div
          key={idx}
          className="px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 bg-white/40 dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.05]"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {/* Avatar circle */}
            <div className="w-9 h-9 rounded-full bg-black/[0.06] dark:bg-white/[0.08] shrink-0" />

            {/* Text lines */}
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="h-3 bg-black/[0.07] dark:bg-white/[0.09] rounded-md w-1/3" />
              <div className="h-2.5 bg-black/[0.04] dark:bg-white/[0.05] rounded-md w-2/3" />
            </div>
          </div>

          {/* Time placeholder */}
          <div className="w-8 h-2 bg-black/[0.04] dark:bg-white/[0.05] rounded shrink-0" />
        </div>
      ))}
    </div>
  );
};

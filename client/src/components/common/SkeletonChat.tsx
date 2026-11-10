import React from 'react';

export const SkeletonChat: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col justify-end p-4 sm:p-6 space-y-4 overflow-hidden pointer-events-none select-none animate-pulse">
      {/* Date Pill Placeholder */}
      <div className="w-full flex justify-center mb-2">
        <div className="h-6 w-24 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-black/5 dark:border-white/5" />
      </div>

      {/* Bubble 1: Incoming */}
      <div className="flex items-end gap-2 justify-start max-w-[80%] sm:max-w-[65%]">
        <div className="rounded-[22px] rounded-bl-sm p-3.5 space-y-2 bg-white/50 dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] shadow-xs w-64">
          <div className="h-3.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-md w-4/5" />
          <div className="h-3.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-md w-3/5" />
          <div className="flex justify-end pt-1">
            <div className="h-2.5 bg-black/[0.04] dark:bg-white/[0.05] rounded w-10" />
          </div>
        </div>
      </div>

      {/* Bubble 2: Outgoing */}
      <div className="flex items-end gap-2 justify-end self-end max-w-[80%] sm:max-w-[65%]">
        <div className="rounded-[22px] rounded-br-sm p-3.5 space-y-2 bg-amber-500/10 dark:bg-amber-400/[0.08] border border-amber-500/15 dark:border-amber-400/15 shadow-xs w-48">
          <div className="h-3.5 bg-amber-500/15 dark:bg-amber-400/20 rounded-md w-full" />
          <div className="flex justify-end pt-1">
            <div className="h-2.5 bg-amber-500/10 dark:bg-amber-400/15 rounded w-12" />
          </div>
        </div>
      </div>

      {/* Bubble 3: Incoming (Longer message) */}
      <div className="flex items-end gap-2 justify-start max-w-[85%] sm:max-w-[70%]">
        <div className="rounded-[22px] rounded-bl-sm p-3.5 space-y-2.5 bg-white/50 dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] shadow-xs w-72 sm:w-80">
          <div className="h-3.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-md w-full" />
          <div className="h-3.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-md w-5/6" />
          <div className="h-3.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-md w-2/3" />
          <div className="flex justify-end pt-1">
            <div className="h-2.5 bg-black/[0.04] dark:bg-white/[0.05] rounded w-10" />
          </div>
        </div>
      </div>

      {/* Bubble 4: Outgoing */}
      <div className="flex items-end gap-2 justify-end self-end max-w-[80%] sm:max-w-[65%]">
        <div className="rounded-[22px] rounded-br-sm p-3.5 space-y-2 bg-amber-500/10 dark:bg-amber-400/[0.08] border border-amber-500/15 dark:border-amber-400/15 shadow-xs w-56">
          <div className="h-3.5 bg-amber-500/15 dark:bg-amber-400/20 rounded-md w-4/5" />
          <div className="h-3.5 bg-amber-500/15 dark:bg-amber-400/20 rounded-md w-1/2" />
          <div className="flex justify-end pt-1">
            <div className="h-2.5 bg-amber-500/10 dark:bg-amber-400/15 rounded w-12" />
          </div>
        </div>
      </div>
    </div>
  );
};

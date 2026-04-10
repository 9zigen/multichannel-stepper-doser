import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';

export const HeatmapSkeleton = (): React.ReactElement => (
  <div className="flex flex-col gap-4">
    <div>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-2 h-3 w-48" />
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
    <div className="flex gap-2">
      <div className="grid grid-rows-7 gap-2 pt-0.5">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-[18px] w-6" />
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, columnIndex) => (
          <div key={columnIndex} className="grid grid-rows-7 gap-2">
            {Array.from({ length: 7 }, (_, rowIndex) => (
              <Skeleton key={rowIndex} className="size-[18px] rounded-[4px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
    <div className="flex items-center gap-1.5">
      <Skeleton className="h-3 w-6" />
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="size-3 rounded-[3px]" />
      ))}
      <Skeleton className="h-3 w-6" />
    </div>
    <div className="space-y-2 border-t border-border/60 pt-4">
      <Skeleton className="h-5 w-24 rounded-full" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  </div>
);

export const DayDetailSkeleton = (): React.ReactElement => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-3 w-52" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
    <div className="space-y-0">
      <div className="flex gap-4 border-b border-border py-2">
        {['w-12', 'w-14', 'w-20', 'w-16', 'w-20', 'w-20'].map((width, index) => (
          <Skeleton key={index} className={`h-3 ${width}`} />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-border/50 py-2.5 last:border-0">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);


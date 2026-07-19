import { Skeleton, TableSkeleton } from "../skeleton";

export default function LeiteLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
          <Skeleton className="h-10 w-full sm:w-36" />
          <Skeleton className="h-10 w-full sm:w-36" />
        </div>
        <Skeleton className="hidden h-9 w-32 rounded-full sm:block" />
      </div>
      <Skeleton className="h-16 w-full rounded-2xl" />
      <TableSkeleton rows={8} cols={3} />
    </div>
  );
}

import { Skeleton, TableSkeleton } from "../skeleton";

export default function FinanceiroLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
          <Skeleton className="h-10 w-full sm:w-36" />
          <Skeleton className="h-10 w-full sm:w-36" />
        </div>
        <Skeleton className="hidden h-9 w-36 rounded-full sm:block" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>

      <TableSkeleton rows={8} cols={4} />
    </div>
  );
}

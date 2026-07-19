import { Skeleton, TableSkeleton } from "../skeleton";

export default function BezerrosLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <Skeleton className="hidden h-9 w-36 rounded-full sm:block" />
      </div>
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}

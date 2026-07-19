import { Skeleton, TableSkeleton } from "../skeleton";

export default function ReproducaoLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 pb-20 sm:pb-0">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full sm:max-w-xs" />
      <TableSkeleton rows={5} cols={6} />

      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <div className="h-[60px] bg-[#F2F4F6]/80" />
      <main className="flex-1 px-5 pb-10 space-y-4">
        <div className="py-6 px-1">
          <div className="h-8 w-36 bg-slate-200 animate-pulse rounded-lg mb-2" />
          <div className="h-6 w-20 bg-slate-200 animate-pulse rounded-lg" />
        </div>
        <div className="bg-white rounded-[28px] p-6 h-[180px] animate-pulse border border-slate-100" />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-[24px] p-4 h-[110px] animate-pulse border border-slate-100" />
          <div className="bg-white rounded-[24px] p-4 h-[110px] animate-pulse border border-slate-100" />
        </div>
        <div className="bg-white rounded-[28px] p-6 h-[180px] animate-pulse border border-slate-100" />
      </main>
    </div>
  );
}

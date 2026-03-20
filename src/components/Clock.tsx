"use client";

import { useEffect, useState } from "react";

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-right">
      <p className="text-[#4E5968] font-medium text-sm">
        {time.toLocaleDateString("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "short",
        })}
      </p>
      <p className="text-xl font-bold text-[#191F28]">
        {time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

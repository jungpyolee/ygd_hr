export default function Loading() {
  const size = 72;
  const frames = 6;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F2F4F6] font-pretendard">
      <style>{`
        @keyframes catRunFrames {
          from { background-position: 0 0; }
          to   { background-position: 0 -${size * frames}px; }
        }
        @keyframes catWalkLR {
          0%   { transform: translateX(-32px) scaleX(1);  }
          48%  { transform: translateX(32px)  scaleX(1);  }
          50%  { transform: translateX(32px)  scaleX(-1); }
          98%  { transform: translateX(-32px) scaleX(-1); }
          100% { transform: translateX(-32px) scaleX(1);  }
        }
        .cat-loading {
          animation: catWalkLR 2.4s linear infinite;
        }
        .cat-loading-sprite {
          width: ${size}px;
          height: ${size}px;
          background-image: url('/game/WhiteCatRun.png');
          background-size: ${size}px ${size * frames}px;
          background-repeat: no-repeat;
          background-position: 0 0;
          image-rendering: pixelated;
          animation: catRunFrames 0.6s steps(${frames}) infinite;
        }
      `}</style>

      <div className="flex flex-col items-center gap-4">
        <div className="cat-loading">
          <div className="cat-loading-sprite" />
        </div>
        <p className="text-[13px] text-[#8B95A1]">잠깐만요...</p>
      </div>
    </div>
  );
}

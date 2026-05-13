import React, { useRef, useState, useEffect } from 'react';
import { CableData, DotRef } from '../constants';
import { BreakoutSVG } from './BreakoutSVG';
import { X } from 'lucide-react';

interface CableNodeProps {
  cable: CableData;
  scale: number;
  selectedDots: DotRef[];
  selectedAnalysisDots?: DotRef[];
  glowTarget: DotRef | null;
  glowIntensity: number;
  onUpdate: (id: string, updates: Partial<CableData>) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onDotMouseDown: (e: React.MouseEvent, ref: DotRef) => void;
  onDotMouseUp: (e: React.MouseEvent, ref: DotRef) => void;
  onDotDoubleClick: (e: React.MouseEvent, ref: DotRef) => void;
  onDotHover: (e: React.MouseEvent, ref: DotRef, isEnter: boolean) => void;
  onDotClick?: (e: React.MouseEvent, ref: DotRef) => void;
}

export const CableNode: React.FC<CableNodeProps> = ({
  cable,
  scale,
  selectedDots,
  selectedAnalysisDots = [],
  glowTarget,
  glowIntensity,
  onUpdate,
  onDelete,
  onDragStart,
  onDotMouseDown,
  onDotMouseUp,
  onDotDoubleClick,
  onDotHover,
  onDotClick,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [trunkHeight, setTrunkHeight] = useState(80);
  const [leftHeight, setLeftHeight] = useState(0);
  const [rightHeight, setRightHeight] = useState(0);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lH = leftRef.current?.offsetHeight || 0;
    const rH = rightRef.current?.offsetHeight || 0;
    
    setLeftHeight(prev => prev !== lH ? lH : prev);
    setRightHeight(prev => prev !== rH ? rH : prev);
    setTrunkHeight(prev => {
      const next = Math.max(lH, rH, 140);
      return prev !== next ? next : prev;
    });
  }, [cable.leftExp, cable.rightExp, cable.tubes.length]);

  return (
    <div
      ref={nodeRef}
      className="absolute flex items-start select-none group z-20"
      style={{
        left: cable.x,
        top: cable.y,
      }}
    >
      {/* Delete Button */}
      <button
        onClick={() => onDelete(cable.id)}
        className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-red-600 border border-red-400 rounded-full text-white flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-50 hover:bg-red-500 pointer-events-auto"
      >
        <X size={12} strokeWidth={3} />
      </button>

      {/* Left Breakout */}
      <div ref={leftRef} id={`bo-left-${cable.id}`}>
        <BreakoutSVG
          cableId={cable.id}
          tubes={cable.tubes}
          side="left"
          expandedTubes={cable.leftExp}
          selectedDots={selectedDots}
          selectedAnalysisDots={selectedAnalysisDots}
          glowTarget={glowTarget}
          glowIntensity={glowIntensity}
          onToggleTube={(idx) => {
            const next = cable.leftExp.includes(idx)
              ? cable.leftExp.filter(i => i !== idx)
              : [...cable.leftExp, idx].sort((a,b) => a-b);
            onUpdate(cable.id, { leftExp: next });
          }}
          onDotMouseDown={onDotMouseDown}
          onDotMouseUp={onDotMouseUp}
          onDotDoubleClick={onDotDoubleClick}
          onDotHover={onDotHover}
          onDotClick={onDotClick}
        />
      </div>

      {/* Trunk */}
      <div
        onMouseDown={(e) => onDragStart(e, cable.id)}
        className="cable-trunk bg-linear-to-b from-[#2a2a2a] via-[#111] to-[#222] border-2 border-[#333] rounded-xl relative flex flex-col items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.07),inset_0_-2px_4px_rgba(0,0,0,0.5),0_4px_15px_rgba(0,0,0,0.6)] px-4 min-w-[160px] cursor-grab active:cursor-grabbing mx-0 z-10 shrink-0 pointer-events-auto"
        style={{ height: trunkHeight }}
      >
        <div className="absolute inset-x-4 inset-y-0 bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_6px,rgba(255,255,255,0.025)_6px,rgba(255,255,255,0.025)_7px)] rounded-lg pointer-events-none" />
        <div className="relative z-10 font-mono text-[0.65rem] text-[rgba(200,220,255,0.6)] tracking-widest text-center leading-relaxed flex flex-col items-center w-full">
          <textarea
            value={cable.name}
            onChange={(e) => onUpdate(cable.id, { name: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Asset Name"
            rows={2}
            className="cable-name-input text-sm text-white block glow-text mb-1 bg-transparent border-b border-transparent outline-none text-center w-full max-w-[140px] resize-none transition-all focus:border-[var(--accent)] hover:border-white/20 cursor-text overflow-hidden"
          />
          <strong className="text-[0.6rem] text-[rgba(255,255,255,0.4)] block mb-1 uppercase tracking-[2px]">{cable.fiberCount}F Trunk</strong>
          
          <div className="flex flex-col gap-1 w-full px-2 mt-2 border-t border-white/5 pt-2">
            <div className="flex items-center gap-1">
              <span className="text-[0.55rem] font-bold text-white/30 uppercase shrink-0">To:</span>
              <input
                type="text"
                value={cable.to || ''}
                onChange={(e) => onUpdate(cable.id, { to: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-white/5 focus:border-[var(--accent)] outline-none text-white/70 text-[0.6rem] transition-all w-full font-mono uppercase text-left truncate"
                placeholder="---"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[0.55rem] font-bold text-white/30 uppercase shrink-0">From:</span>
              <input
                type="text"
                value={cable.from || ''}
                onChange={(e) => onUpdate(cable.id, { from: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-white/5 focus:border-[var(--accent)] outline-none text-white/70 text-[0.6rem] transition-all w-full font-mono uppercase text-left truncate"
                placeholder="---"
              />
            </div>
          </div>

          <div className="mt-2 text-[0.5rem] opacity-30 tracking-[1px] uppercase">
            TIA-598-C • {cable.tubes.length} Tube{cable.tubes.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Right Breakout */}
      <div ref={rightRef} id={`bo-right-${cable.id}`}>
        <BreakoutSVG
          cableId={cable.id}
          tubes={cable.tubes}
          side="right"
          expandedTubes={cable.rightExp}
          selectedDots={selectedDots}
          selectedAnalysisDots={selectedAnalysisDots}
          glowTarget={glowTarget}
          glowIntensity={glowIntensity}
          onToggleTube={(idx) => {
            const next = cable.rightExp.includes(idx)
              ? cable.rightExp.filter(i => i !== idx)
              : [...cable.rightExp, idx].sort((a,b) => a-b);
            onUpdate(cable.id, { rightExp: next });
          }}
          onDotMouseDown={onDotMouseDown}
          onDotMouseUp={onDotMouseUp}
          onDotDoubleClick={onDotDoubleClick}
          onDotHover={onDotHover}
          onDotClick={onDotClick}
        />
      </div>
    </div>
  );
};

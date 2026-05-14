import React, { useRef, useState, useEffect } from 'react';
import { CableData, DotRef, Connection, LAYOUT } from '../constants';
import { BreakoutSVG } from './BreakoutSVG';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface CableNodeProps {
  cable: CableData;
  connections: Connection[];
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
  connections,
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

  const getVisibleTubes = () => {
    if (!cable.isCollapsed) return cable.tubes;
    return cable.tubes.filter((_, ti) => {
      return connections.some(conn => 
        (conn.from.cableId === cable.id && conn.from.tubeIdx === ti) ||
        (conn.to.cableId === cable.id && conn.to.tubeIdx === ti)
      );
    });
  };

  const visibleTubes = getVisibleTubes();
  const hiddenCount = cable.tubes.length - visibleTubes.length;

  useEffect(() => {
    const lH = leftRef.current?.offsetHeight || 0;
    const rH = rightRef.current?.offsetHeight || 0;
    
    setLeftHeight(prev => prev !== lH ? lH : prev);
    setRightHeight(prev => prev !== rH ? rH : prev);
    setTrunkHeight(prev => {
      const next = Math.max(lH, rH, 180);
      return prev !== next ? next : prev;
    });
  }, [cable.leftExp, cable.rightExp, cable.tubes.length, cable.isCollapsed, connections]);

  return (
    <div
      ref={nodeRef}
      className="absolute flex items-start select-none group z-20"
      style={{
        left: cable.x,
        top: cable.y,
      }}
    >
      {/* Top Controls Overlay */}
      <div className="absolute -top-8 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-auto">
        <button
          onClick={() => onUpdate(cable.id, { isCollapsed: !cable.isCollapsed })}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[0.6rem] font-black uppercase tracking-[1px] transition-all ${
            cable.isCollapsed 
              ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' 
              : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
          }`}
          title={cable.isCollapsed ? "Expand all tubes" : "Collapse unused tubes"}
        >
          {cable.isCollapsed ? <ChevronDown size={10} strokeWidth={3} /> : <ChevronUp size={10} strokeWidth={3} />}
          {cable.isCollapsed ? "Collapsed" : "Collapse"}
        </button>
        
        <button
          onClick={() => onDelete(cable.id)}
          className="w-6 h-6 bg-red-600/80 border border-red-400/50 rounded-full text-white flex items-center justify-center cursor-pointer hover:bg-red-500 transition-colors"
        >
          <X size={12} strokeWidth={3} />
        </button>
      </div>

      {/* Left Breakout */}
      <div ref={leftRef} id={`bo-left-${cable.id}`}>
        <BreakoutSVG
          cableId={cable.id}
          tubes={visibleTubes}
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
        className="cable-trunk bg-linear-to-b from-[#1a1a1a] via-[#050505] to-[#121212] border-4 border-black rounded-xl relative flex flex-col items-center justify-start shadow-[inset_0_2px_4px_rgba(255,255,255,0.07),inset_0_-2px_4px_rgba(0,0,0,0.5),0_4px_15px_rgba(0,0,0,0.6)] px-4 min-w-[160px] cursor-grab active:cursor-grabbing mx-0 z-10 shrink-0 pointer-events-auto py-6"
        style={{ height: trunkHeight }}
      >
        <div className="absolute inset-x-4 inset-y-0 bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_6px,rgba(255,255,255,0.025)_6px,rgba(255,255,255,0.025)_7px)] rounded-lg pointer-events-none" />
        <div className="relative z-10 font-mono text-[0.65rem] text-[rgba(200,220,255,0.6)] tracking-widest text-center leading-relaxed flex flex-col items-center w-full">
          <div className="flex flex-col items-center w-full mb-3 pb-2 border-b border-white/10">
            <span className="text-[0.55rem] font-black text-[var(--accent)] uppercase tracking-[3px] opacity-70 mb-1">LOCATION</span>
            <textarea
              value={cable.location || ''}
              onChange={(e) => onUpdate(cable.id, { location: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Building Name"
              rows={1}
              className="text-[1.05rem] font-bold text-white block glow-text bg-transparent border-none outline-none text-center w-full resize-none transition-all focus:text-[var(--accent)] placeholder:text-white/10 cursor-text overflow-hidden leading-tight"
            />
          </div>
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

          <div className="mt-2 text-[0.5rem] opacity-30 tracking-[1px] uppercase flex flex-col items-center gap-1">
            <span>TIA-598-C • {cable.tubes.length} Tube{cable.tubes.length > 1 ? 's' : ''}</span>
            {cable.isCollapsed && hiddenCount > 0 && (
              <span className="text-blue-400 font-bold">({hiddenCount} Empty Hidden)</span>
            )}
          </div>
        </div>
      </div>

      {/* Right Breakout */}
      <div ref={rightRef} id={`bo-right-${cable.id}`}>
        <BreakoutSVG
          cableId={cable.id}
          tubes={visibleTubes}
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

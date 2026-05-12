import React, { useRef } from 'react';
import { NetworkEquipment, DotRef, LAYOUT, Connection, findCircuitPath, dotsEqual } from '../constants';
import { X, Server, ArrowLeftRight } from 'lucide-react';

interface NetworkNodeProps {
  equipment: NetworkEquipment;
  scale: number;
  connections: Connection[];
  selectedDots: DotRef[];
  glowTarget: DotRef | null;
  glowIntensity: number;
  onUpdate: (id: string, updates: Partial<NetworkEquipment>) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onDotMouseDown: (e: React.MouseEvent, ref: DotRef) => void;
  onDotMouseUp: (e: React.MouseEvent, ref: DotRef) => void;
  onDotDoubleClick: (e: React.MouseEvent, ref: DotRef) => void;
  onDotHover: (e: React.MouseEvent, ref: DotRef, isEnter: boolean) => void;
  onUpdateCircuitName: (paths: Connection[], name: string) => void;
}

export const NetworkNode: React.FC<NetworkNodeProps> = ({
  equipment,
  connections,
  selectedDots,
  glowTarget,
  glowIntensity,
  onUpdate,
  onDelete,
  onDragStart,
  onDotMouseDown,
  onDotMouseUp,
  onDotDoubleClick,
  onDotHover,
  onUpdateCircuitName,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const isLeft = equipment.side === 'left';
  
  const portHeight = 30;
  const padding = 20;
  const headerHeight = 50;
  const totalHeight = headerHeight + equipment.ports * portHeight + padding;

  return (
    <div
      ref={nodeRef}
      className="absolute flex items-start select-none group"
      style={{
        left: equipment.x,
        top: equipment.y,
        flexDirection: isLeft ? 'row-reverse' : 'row',
      }}
    >
      {/* Delete Button */}
      <button
        onClick={() => onDelete(equipment.id)}
        className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-red-600 border border-red-400 rounded-full text-white flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-50 hover:bg-red-500"
      >
        <X size={12} strokeWidth={3} />
      </button>

      {/* Main Switch Chassis */}
      <div
        onMouseDown={(e) => onDragStart(e, equipment.id)}
        className="bg-linear-to-b from-[#2a2d3e] via-[#1a1c25] to-[#22242f] border-2 border-[#3d4251] rounded-xl relative flex flex-col shadow-[inset_0_2px_4px_rgba(255,255,255,0.07),inset_0_-2px_4px_rgba(0,0,0,0.5),0_10px_30px_rgba(0,0,0,0.8)] min-w-[240px] cursor-grab active:cursor-grabbing z-10 shrink-0 network-chassis"
        style={{ height: totalHeight }}
      >
        {/* Rack Ears / Mounting detail */}
        <div className={`absolute ${isLeft ? '-right-1.5' : '-left-1.5'} top-8 w-1.5 h-12 bg-[#333] border-${isLeft ? 'r' : 'l'} border-[#444] rounded-${isLeft ? 'r' : 'l'}`} />

        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <div className="p-1.5 bg-[var(--accent)]/10 rounded-lg border border-[var(--accent)]/20">
            <Server size={18} className="text-[var(--accent)]" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[0.5rem] font-bold text-white/30 uppercase shrink-0">Type:</span>
              <input
                type="text"
                value={equipment.name}
                onChange={(e) => onUpdate(equipment.id, { name: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-white/5 focus:border-[var(--accent)] outline-none text-white font-bold text-xs transition-all w-full"
                placeholder="Switch 01"
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[0.5rem] font-bold text-white/30 uppercase shrink-0">Bldg:</span>
              <input
                type="text"
                value={equipment.building}
                onChange={(e) => onUpdate(equipment.id, { building: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-white/5 focus:border-[var(--accent)] outline-none text-white/70 text-[0.65rem] transition-all w-full font-mono"
                placeholder="BUILDING-01"
              />
            </div>
            <span className="text-[0.55rem] text-white/40 tracking-[2px] uppercase font-mono mt-1">
              {equipment.ports}P INTERFACE
            </span>
          </div>
          <button 
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(equipment.id, { side: isLeft ? 'right' : 'left' });
            }}
            className="p-1.5 hover:bg-white/10 rounded border border-white/10 text-white/40 hover:text-[var(--accent)] transition-colors"
            title="Switch Side"
          >
            <ArrowLeftRight size={14} />
          </button>
        </div>

        {/* Ports Labels */}
        <div className="flex-1 px-4 py-2 flex flex-col gap-0 justify-around">
          {Array.from({ length: equipment.ports }).map((_, i) => {
             const ref: DotRef = { 
               equipmentId: equipment.id, 
               side: equipment.side, 
               tubeIdx: 0, 
               strandIdx: i 
             };
             const conn = connections.find(c => dotsEqual(c.from, ref) || dotsEqual(c.to, ref));
             const circuitName = conn?.circuitName || '';

             return (
                <div key={i} className={`flex items-center gap-2 h-[30px] group/item ${isLeft ? 'flex-row-reverse' : 'flex-row'}`}>
                 <span className="text-[0.6rem] font-mono text-white/30 w-4 shrink-0">{(i + 1).toString().padStart(2, '0')}</span>
                 <div className="relative flex-1 group/input">
                    <input 
                      type="text"
                      placeholder="PATCH ID"
                      className={`bg-transparent border-none outline-none text-[0.6rem] font-mono text-[var(--accent)] placeholder:text-white/5 w-full uppercase ${isLeft ? 'text-right' : 'text-left'}`}
                      value={circuitName}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const path = findCircuitPath(ref, connections);
                        onUpdateCircuitName(path, e.target.value);
                      }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/5 group-hover/input:bg-[var(--accent)]/30 transition-colors" />
                 </div>
               </div>
             );
          })}
        </div>
      </div>

      {/* Ports SVG Area */}
      <div className="relative">
        <svg 
          width={60} 
          height={totalHeight} 
          className="overflow-visible block"
        >
          {Array.from({ length: equipment.ports }).map((_, i) => {
            const portY = headerHeight + padding/2 + i * portHeight + portHeight/2;
            const dotX = isLeft ? -LAYOUT.FAN_GAP : LAYOUT.FAN_GAP;
            const startX = 0; 

            const ref: DotRef = { 
              equipmentId: equipment.id, 
              side: equipment.side, 
              tubeIdx: 0, 
              strandIdx: i 
            };

            const isSelected = selectedDots.some(d => 
              d.equipmentId === equipment.id && d.strandIdx === i
            );
            const isGlow = glowTarget && glowTarget.equipmentId === equipment.id && glowTarget.strandIdx === i;
            const glowSize = isGlow ? 4 + glowIntensity * 6 : 0;

            return (
              <g key={`port-${i}`} className="group/port">
                {/* Connection Line */}
                <path
                  d={`M${startX},${portY} L${dotX},${portY}`}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                  fill="none"
                />
                
                {/* Glow */}
                {(isGlow || isSelected) && (
                  <circle
                    cx={dotX}
                    cy={portY}
                    r={LAYOUT.STRAND_R + glowSize + (isSelected ? 4 : 0)}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeOpacity={glowIntensity || 0.8}
                    className="pointer-events-none animate-pulse"
                  />
                )}

                {/* Port Dot */}
                <circle
                  cx={dotX}
                  cy={portY}
                  r={LAYOUT.STRAND_R}
                  fill={isSelected ? "var(--accent)" : "#222"}
                  stroke={isSelected || isGlow ? "var(--accent)" : "rgba(255,255,255,0.4)"}
                  strokeWidth={isSelected || isGlow ? 2.5 : 1}
                  className="transition-all"
                  style={{
                    filter: (isSelected || isGlow) ? `drop-shadow(0 0 8px var(--accent))` : 'none'
                  }}
                />

                {/* Label */}
                <text
                  x={dotX + (isLeft ? -10 : 10)}
                  y={portY + 3}
                  textAnchor={isLeft ? 'end' : 'start'}
                  className={`font-mono text-[8px] pointer-events-none transition-colors ${
                    isSelected ? 'fill-[var(--accent)] font-bold' : 'fill-white/60'
                  }`}
                >
                  PORT {i + 1}
                </text>

                {/* Hit Area */}
                <circle 
                  cx={dotX} 
                  cy={portY} 
                  r={LAYOUT.STRAND_R + 15} 
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onDotMouseDown(e, ref);
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    onDotMouseUp(e, ref);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onDotDoubleClick(e, ref);
                  }}
                  onMouseEnter={(e) => onDotHover(e, ref, true)}
                  onMouseLeave={(e) => onDotHover(e, ref, false)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

import React from 'react';
import { Tube, LAYOUT, DotRef } from '../constants';

interface BreakoutSVGProps {
  cableId: string;
  tubes: Tube[];
  side: 'left' | 'right';
  expandedTubes: number[];
  selectedDots: DotRef[];
  selectedAnalysisDots?: DotRef[];
  glowTarget: DotRef | null;
  glowIntensity: number;
  onToggleTube: (index: number) => void;
  onDotMouseDown: (e: React.MouseEvent, ref: DotRef) => void;
  onDotMouseUp: (e: React.MouseEvent, ref: DotRef) => void;
  onDotDoubleClick: (e: React.MouseEvent, ref: DotRef) => void;
  onDotHover: (e: React.MouseEvent, ref: DotRef, isEnter: boolean) => void;
  onDotClick?: (e: React.MouseEvent, ref: DotRef) => void;
}

export const BreakoutSVG: React.FC<BreakoutSVGProps> = ({
  cableId,
  tubes,
  side,
  expandedTubes,
  selectedDots,
  selectedAnalysisDots = [],
  glowTarget,
  glowIntensity,
  onToggleTube,
  onDotMouseDown,
  onDotMouseUp,
  onDotDoubleClick,
  onDotHover,
  onDotClick,
}) => {
  const isLeft = side === 'left';
  const hasExp = expandedTubes.length > 0;
  const svgW = hasExp ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY;

  const expandH = LAYOUT.STRAND_PAD_V * 2 + 12 * LAYOUT.STRAND_STEP;
  const svgH = LAYOUT.TUBE_PAD + tubes.length * LAYOUT.TUBE_H + (expandedTubes.length * expandH) + LAYOUT.TUBE_PAD;

  const pillX = isLeft ? svgW - LAYOUT.PILL_INSET - LAYOUT.PILL_W : LAYOUT.PILL_INSET;
  const pillOutX = isLeft ? pillX + LAYOUT.PILL_W : pillX;
  const dotX = isLeft ? pillOutX - LAYOUT.FAN_GAP : pillOutX + LAYOUT.FAN_GAP;

  const tubeLabelX = isLeft ? pillX - LAYOUT.LABEL_GAP : pillX + LAYOUT.PILL_W + LAYOUT.LABEL_GAP;
  const tubeLabelAnchor = isLeft ? 'end' : 'start';

  let curY = LAYOUT.TUBE_PAD;

  return (
    <svg
      width={svgW}
      height={svgH}
      className="overflow-visible block select-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {tubes.map((tube, ti) => {
        const pillCY = curY + LAYOUT.TUBE_H / 2;
        const pillY = pillCY - LAYOUT.PILL_H / 2;
        const isExpanded = expandedTubes.includes(ti);
        const startY = curY;

        curY += LAYOUT.TUBE_H;
        let expansionContent = null;

        if (isExpanded) {
          const blockTop = curY + LAYOUT.STRAND_PAD_V;
          expansionContent = tube.strands.map((strand, si) => {
            if (!strand) return null;

            const dotCY = blockTop + si * LAYOUT.STRAND_STEP + LAYOUT.STRAND_STEP / 2;
            const cp1x = (pillOutX + dotX) / 2;
            const cp2x = (pillOutX + dotX) / 2;

            const isSelected = selectedDots.some(d => 
              d.cableId === cableId && 
              d.side === side && 
              d.tubeIdx === ti && 
              d.strandIdx === si
            );

            const isAnalysisSelected = selectedAnalysisDots.some(d => 
              d.cableId === cableId && 
              d.side === side && 
              d.tubeIdx === ti && 
              d.strandIdx === si
            );

            const isGlow = glowTarget && 
              glowTarget.cableId === cableId && 
              glowTarget.side === side && 
              glowTarget.tubeIdx === ti && 
              glowTarget.strandIdx === si;

            const glowSize = isGlow ? 4 + glowIntensity * 6 : 0;
            const glowOpacity = isGlow ? 0.3 + glowIntensity * 0.7 : 0;

            const ref: DotRef = { cableId, side, tubeIdx: ti, strandIdx: si };

            return (
              <g key={`strand-${si}`} className="group/strand">
                <path
                  d={`M${pillOutX},${pillCY} C${cp1x},${pillCY} ${cp2x},${dotCY} ${dotX},${dotCY}`}
                  stroke={strand.color.hex}
                  strokeWidth="1.3"
                  strokeOpacity="0.6"
                  fill="none"
                />
                
                {isGlow && (
                  <circle
                    cx={dotX}
                    cy={dotCY}
                    r={LAYOUT.STRAND_R + glowSize}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1 + glowIntensity * 2}
                    strokeOpacity={glowOpacity}
                    className="pointer-events-none"
                  />
                )}
                
                {/* Red Glow for Analysis Selection */}
                {isAnalysisSelected && (
                  <circle
                    cx={dotX}
                    cy={dotCY}
                    r={LAYOUT.STRAND_R + 8}
                    fill="none"
                    stroke="#ff0000"
                    strokeWidth="3"
                    className="pointer-events-none animate-pulse"
                    style={{ filter: 'drop-shadow(0 0 10px rgba(255,0,0,0.8))' }}
                  />
                )}

                <circle
                  cx={dotX}
                  cy={dotCY}
                  r={LAYOUT.STRAND_R}
                  fill={strand.color.hex}
                  stroke={isGlow ? "var(--accent)" : (isAnalysisSelected ? "#ff0000" : (isSelected ? "var(--accent)" : "rgba(255,255,255,0.4)"))}
                  strokeWidth={isGlow ? 2.5 : (isAnalysisSelected ? 3 : (isSelected ? 2 : 1))}
                  className="pointer-events-none transition-all"
                  style={{
                    filter: isAnalysisSelected ? `drop-shadow(0 0 8px #ff0000)` : (isSelected || isGlow) ? `drop-shadow(0 0 ${4 + (isGlow ? glowIntensity * 12 : 4)}px var(--accent))` : 'none'
                  }}
                />
                <text
                  x={dotX}
                  y={dotCY - LAYOUT.STRAND_R - 5}
                  textAnchor="middle"
                  className={`font-mono text-[9px] pointer-events-none transition-colors ${
                    isAnalysisSelected ? 'fill-red-400 font-black' : isSelected ? 'fill-[var(--accent)] font-bold' : 'fill-[rgba(210,235,255,0.95)]'
                  }`}
                  style={{ textShadow: '0 0 4px rgba(0,0,0,0.5)' }}
                >
                  {strand.label}
                </text>

                {/* Larger hit area for clicking fibers - MUST BE LAST TO BE ON TOP */}
                <circle 
                  cx={dotX} 
                  cy={dotCY} 
                  r={LAYOUT.STRAND_R + 15} 
                  fill="transparent"
                  className="cursor-pointer fiber-hit-area pointer-events-auto"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDotClick?.(e, ref);
                  }}
                  onMouseEnter={(e) => onDotHover(e, ref, true)}
                  onMouseLeave={(e) => onDotHover(e, ref, false)}
                />
              </g>
            );
          });
          curY += LAYOUT.STRAND_PAD_V * 2 + 12 * LAYOUT.STRAND_STEP;
        }

        return (
          <g key={`tube-${ti}`}>
            {/* Hit area */}
            <rect
              x={0}
              y={startY}
              width={svgW}
              height={LAYOUT.TUBE_H}
              fill="transparent"
              className="cursor-pointer pointer-events-auto"
              onClick={() => onToggleTube(ti)}
            />
            {/* Tube Label */}
            <text
              x={tubeLabelX}
              y={pillCY + 4}
              textAnchor={tubeLabelAnchor}
              className={`font-mono text-[9px] pointer-events-none ${
                isExpanded ? 'fill-[#00c8ff]' : 'fill-[rgba(180,210,255,0.75)]'
              }`}
            >
              {tube.label}
            </text>
            {/* Pill */}
            <rect
              x={pillX}
              y={pillY}
              width={LAYOUT.PILL_W}
              height={LAYOUT.PILL_H}
              rx={LAYOUT.PILL_RX}
              fill={`${tube.color.hex}cc`}
              stroke={isExpanded ? '#00c8ff' : 'rgba(255,255,255,0.3)'}
              strokeWidth={isExpanded ? '2' : '1.2'}
              className="cursor-pointer pointer-events-auto"
              onClick={() => onToggleTube(ti)}
            />
            {tube.binderColor && (
              <line
                x1={pillX + 2}
                y1={pillCY}
                x2={pillX + LAYOUT.PILL_W - 2}
                y2={pillCY}
                stroke={tube.binderColor}
                strokeWidth="2"
                strokeLinecap="round"
                className="pointer-events-none"
              />
            )}
            {expansionContent}
          </g>
        );
      })}
    </svg>
  );
};

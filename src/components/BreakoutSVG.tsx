import React from 'react';
import { Tube, LAYOUT, DotRef } from '../constants';

interface BreakoutSVGProps {
  cableId: string;
  tubes: Tube[];
  side: 'left' | 'right';
  expandedTubes: number[];
  selectedDots: DotRef[];
  glowTarget: DotRef | null;
  glowIntensity: number;
  onToggleTube: (index: number) => void;
  onDotMouseDown: (e: React.MouseEvent, ref: DotRef) => void;
  onDotMouseUp: (e: React.MouseEvent, ref: DotRef) => void;
  onDotDoubleClick: (e: React.MouseEvent, ref: DotRef) => void;
}

export const BreakoutSVG: React.FC<BreakoutSVGProps> = ({
  cableId,
  tubes,
  side,
  expandedTubes,
  selectedDots,
  glowTarget,
  glowIntensity,
  onToggleTube,
  onDotMouseDown,
  onDotMouseUp,
  onDotDoubleClick,
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

  const fiberLabelX = isLeft ? dotX - LAYOUT.STRAND_R - LAYOUT.FIBER_GAP : dotX + LAYOUT.STRAND_R + LAYOUT.FIBER_GAP;
  const fiberLabelAnchor = isLeft ? 'end' : 'start';

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

            const isGlow = glowTarget && 
              glowTarget.cableId === cableId && 
              glowTarget.side === side && 
              glowTarget.tubeIdx === ti && 
              glowTarget.strandIdx === si;

            const glowSize = isGlow ? 4 + glowIntensity * 6 : 0;
            const glowOpacity = isGlow ? 0.3 + glowIntensity * 0.7 : 0;

            return (
              <g key={`strand-${si}`}>
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
                <circle
                  cx={dotX}
                  cy={dotCY}
                  r={LAYOUT.STRAND_R}
                  fill={strand.color.hex}
                  stroke={isGlow ? "var(--accent)" : (isSelected ? "var(--accent)" : "rgba(255,255,255,0.4)")}
                  strokeWidth={isGlow ? 2.5 : (isSelected ? 2 : 1)}
                  className="cursor-pointer hover:stroke-white hover:stroke-2 transition-all"
                  style={{
                    filter: (isSelected || isGlow) ? `drop-shadow(0 0 ${4 + (isGlow ? glowIntensity * 12 : 4)}px var(--accent))` : 'none'
                  }}
                  onMouseDown={(e) => onDotMouseDown(e, { cableId, side, tubeIdx: ti, strandIdx: si })}
                  onMouseUp={(e) => onDotMouseUp(e, { cableId, side, tubeIdx: ti, strandIdx: si })}
                  onDoubleClick={(e) => onDotDoubleClick(e, { cableId, side, tubeIdx: ti, strandIdx: si })}
                />
                <text
                  x={fiberLabelX}
                  y={dotCY + 4}
                  textAnchor={fiberLabelAnchor}
                  className={`font-mono text-[8.5px] pointer-events-none transition-colors ${
                    isSelected ? 'fill-[var(--accent)] font-bold' : 'fill-[rgba(210,235,255,0.85)]'
                  }`}
                >
                  {`${strand.label} ${strand.color.name}`}
                </text>
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
              className="cursor-pointer"
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
              className="cursor-pointer"
              onClick={() => onToggleTube(ti)}
            />
            {expansionContent}
          </g>
        );
      })}
    </svg>
  );
};

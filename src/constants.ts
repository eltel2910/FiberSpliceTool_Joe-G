export interface TIAColor {
  name: string;
  hex: string;
  abb: string;
}

export const TIA_COLORS: TIAColor[] = [
  { name: 'Blue', hex: '#1a73e8', abb: 'BL' },
  { name: 'Orange', hex: '#f57c00', abb: 'OR' },
  { name: 'Green', hex: '#2e7d32', abb: 'GR' },
  { name: 'Brown', hex: '#8d6e63', abb: 'BR' },
  { name: 'Slate', hex: '#78909c', abb: 'SL' },
  { name: 'White', hex: '#e0e0e0', abb: 'WH' },
  { name: 'Red', hex: '#e53935', abb: 'RD' },
  { name: 'Black', hex: '#616161', abb: 'BK' },
  { name: 'Yellow', hex: '#fdd835', abb: 'YL' },
  { name: 'Violet', hex: '#8e24aa', abb: 'VI' },
  { name: 'Rose', hex: '#f48fb1', abb: 'RS' },
  { name: 'Aqua', hex: '#00acc1', abb: 'AQ' },
];

export interface Strand {
  index: number;
  color: TIAColor;
  label: string;
}

export interface Tube {
  index: number;
  color: TIAColor;
  binderColor: string | null;
  label: string;
  strands: (Strand | null)[];
}

export interface CableData {
  id: string;
  name: string;
  fiberCount: number;
  tubes: Tube[];
  x: number;
  y: number;
  leftExp: number[];
  rightExp: number[];
}

export interface WorkZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  description: string;
}

export const LAYOUT = {
  TUBE_H: 20,
  TUBE_PAD: 8,
  PILL_W: 26,
  PILL_H: 13,
  PILL_RX: 6,
  PILL_INSET: 2,
  STRAND_R: 6,
  STRAND_STEP: 32,
  STRAND_PAD_V: 12,
  FAN_GAP: 42,
  LABEL_GAP: 5,
  FIBER_GAP: 8,
  BO_TUBE_ONLY: 120,
  BO_EXPANDED: 240,
};

export interface Connection {
  id: string;
  from: DotRef;
  to: DotRef;
}

export interface DotRef {
  cableId: string;
  side: 'left' | 'right';
  tubeIdx: number;
  strandIdx: number;
}

export interface DraggingLine {
  from: DotRef;
  toX: number;
  toY: number;
}

export function getCableStructure(fiberCount: number): Tube[] {
  const tubeCount = Math.ceil(fiberCount / 12);
  return Array.from({ length: tubeCount }, (_, t) => {
    const tubeBaseIdx = t % 12;
    const baseColor = TIA_COLORS[tubeBaseIdx];
    let binderSuffix = "";
    let binderColor: string | null = null;
    
    if (t >= 12 && t < 24) {
      binderSuffix = "+BK";
      binderColor = "#000000";
    } else if (t >= 24 && t < 36) {
      binderSuffix = "+RD";
      binderColor = "#e53935";
    }

    const tubeLabel = `${baseColor.abb}${binderSuffix} (${(t + 1).toString().padStart(2, '0')})`;

    return {
      index: t + 1,
      color: baseColor,
      binderColor,
      label: tubeLabel,
      strands: TIA_COLORS.map((sc, si) => {
        const fiberNum = t * 12 + si + 1;
        return {
          index: si + 1,
          color: sc,
          label: `${sc.abb} (${fiberNum.toString().padStart(3, '0')})`,
        };
      }),
    };
  });
}

export function getDotWorldPos(cable: CableData, ref: DotRef): { x: number; y: number } {
  const isLeft = ref.side === 'left';
  const expandedTubes = isLeft ? cable.leftExp : cable.rightExp;
  const hasExp = expandedTubes.length > 0;
  const svgW = hasExp ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY;

  const expandH = LAYOUT.STRAND_PAD_V * 2 + 12 * LAYOUT.STRAND_STEP;

  let finalY = LAYOUT.TUBE_PAD;
  for(let i=0; i<ref.tubeIdx; i++) {
    finalY += LAYOUT.TUBE_H;
    if (expandedTubes.includes(i)) {
      finalY += expandH;
    }
  }
  
  const expansionStart = finalY + LAYOUT.TUBE_H;
  const blockStart = expansionStart + LAYOUT.STRAND_PAD_V;
  const localDotY = blockStart + ref.strandIdx * LAYOUT.STRAND_STEP + LAYOUT.STRAND_STEP / 2;

  const pillX = isLeft ? svgW - LAYOUT.PILL_INSET - LAYOUT.PILL_W : LAYOUT.PILL_INSET;
  const pillOutX = isLeft ? pillX + LAYOUT.PILL_W : pillX;
  const localDotX = isLeft ? pillOutX - LAYOUT.FAN_GAP : pillOutX + LAYOUT.FAN_GAP;

  const leftSVGWidth = (cable.leftExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY);
  const trunkWidth = 164; 

  let worldX = cable.x + localDotX;
  if (!isLeft) {
    worldX = cable.x + leftSVGWidth + trunkWidth + localDotX;
  }

  return { x: worldX, y: cable.y + localDotY };
}

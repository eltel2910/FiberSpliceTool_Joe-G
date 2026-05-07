export interface TIAColor {
  name: string;
  hex: string;
}

export const TIA_COLORS: TIAColor[] = [
  { name: 'Blue', hex: '#1a73e8' },
  { name: 'Orange', hex: '#f57c00' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Brown', hex: '#8d6e63' },
  { name: 'Slate', hex: '#78909c' },
  { name: 'White', hex: '#e0e0e0' },
  { name: 'Red', hex: '#e53935' },
  { name: 'Black', hex: '#616161' },
  { name: 'Yellow', hex: '#fdd835' },
  { name: 'Violet', hex: '#8e24aa' },
  { name: 'Rose', hex: '#f48fb1' },
  { name: 'Aqua', hex: '#00acc1' },
];

export interface Strand {
  index: number;
  color: TIAColor;
  label: string;
}

export interface Tube {
  index: number;
  color: TIAColor;
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

export const LAYOUT = {
  TUBE_H: 20,
  TUBE_PAD: 8,
  PILL_W: 26,
  PILL_H: 13,
  PILL_RX: 6,
  PILL_INSET: 2,
  STRAND_R: 6,
  STRAND_STEP: 19,
  STRAND_PAD_V: 8,
  FAN_GAP: 38,
  LABEL_GAP: 5,
  FIBER_GAP: 5,
  BO_TUBE_ONLY: 120,
  BO_EXPANDED: 210,
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
  return Array.from({ length: fiberCount / 12 }, (_, t) => ({
    index: t + 1,
    color: TIA_COLORS[t % 12],
    label: `T${t + 1} ${TIA_COLORS[t % 12].name}`,
    strands: TIA_COLORS.map((sc, si) => ({
      index: si + 1,
      color: sc,
      label: `F${t * 12 + si + 1}`,
    })),
  }));
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

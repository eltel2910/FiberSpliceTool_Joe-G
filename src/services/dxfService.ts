import Drawing from 'dxf-writer';
import { CableData, NetworkEquipment, Connection, WorkZone, getDotWorldPos, LAYOUT, TIA_COLORS } from '../constants';

export const exportToDXF = (
  cables: CableData[],
  equipments: NetworkEquipment[],
  connections: Connection[],
  workzones: WorkZone[]
) => {
  const drawing = new Drawing();
  drawing.setUnits('Millimeters');

  // AutoCAD Color Index (ACI)
  drawing.addLayer('Cables', Drawing.ACI.CYAN, 'CONTINUOUS');
  drawing.addLayer('Equipment', Drawing.ACI.MAGENTA, 'CONTINUOUS');
  drawing.addLayer('Workzones', Drawing.ACI.YELLOW, 'DASHED');
  drawing.addLayer('Text', Drawing.ACI.WHITE, 'CONTINUOUS');

  const TIA_ACI_MAP: Record<string, number> = {
    'Blue': 5,
    'Orange': 30,
    'Green': 3,
    'Brown': 24,
    'Slate': 8,
    'White': 7,
    'Red': 1,
    'Black': 250,
    'Yellow': 2,
    'Violet': 6,
    'Rose': 211,
    'Aqua': 4,
  };

  // Pre-create color layers
  TIA_COLORS.forEach(c => {
    drawing.addLayer(`Fiber_${c.name}`, TIA_ACI_MAP[c.name] || 7, 'CONTINUOUS');
    drawing.addLayer(`Conn_${c.name}`, TIA_ACI_MAP[c.name] || 7, 'CONTINUOUS');
  });
  drawing.addLayer('Conn_Default', Drawing.ACI.WHITE, 'CONTINUOUS');

  const getCADY = (y: number) => -y;

  const drawBox = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
    drawing.setActiveLayer(layer);
    drawing.drawPolyline([
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1]
    ], true);
  };

  const drawCurve = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
    drawing.setActiveLayer(layer);
    const mx = (x1 + x2) / 2;
    const points: [number, number][] = [];
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Cubic Bezier approximation
        const cx1 = mx;
        const cy1 = y1;
        const cx2 = mx;
        const cy2 = y2;
        
        const x = Math.pow(1-t, 3) * x1 + 3 * Math.pow(1-t, 2) * t * cx1 + 3 * (1-t) * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x2;
        const y = Math.pow(1-t, 3) * y1 + 3 * Math.pow(1-t, 2) * t * cy1 + 3 * (1-t) * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y2;
        points.push([x, getCADY(y)]);
    }
    drawing.drawPolyline(points);
  };

  // 1. Workzones
  workzones.forEach(zone => {
    drawBox(zone.x, getCADY(zone.y), zone.x + zone.width, getCADY(zone.y + zone.height), 'Workzones');
    drawing.setActiveLayer('Text');
    drawing.drawText(zone.x + 10, getCADY(zone.y + 20), 20, 0, zone.label);
  });

  // 2. Cables
  cables.forEach(cable => {
    const leftSVGWidth = (cable.leftExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY);
    const rightSVGWidth = (cable.rightExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY);
    const trunkWidth = 164;
    const expandH = LAYOUT.STRAND_PAD_V * 2 + 12 * LAYOUT.STRAND_STEP;
    
    const calculateFullH = (expanded: number[]) => {
        return LAYOUT.TUBE_PAD + cable.tubes.length * LAYOUT.TUBE_H + (expanded.length * expandH) + LAYOUT.TUBE_PAD;
    };
    
    const leftH = calculateFullH(cable.leftExp);
    const rightH = calculateFullH(cable.rightExp);
    const totalH = Math.max(leftH, rightH, 80);
    const totalW = leftSVGWidth + trunkWidth + rightSVGWidth;

    // Draw full boundary
    drawBox(cable.x, getCADY(cable.y), cable.x + totalW, getCADY(cable.y + totalH), 'Cables');
    
    // Draw internal partitions
    drawing.setActiveLayer('Cables');
    drawing.drawLine(cable.x + leftSVGWidth, getCADY(cable.y), cable.x + leftSVGWidth, getCADY(cable.y + totalH));
    drawing.drawLine(cable.x + leftSVGWidth + trunkWidth, getCADY(cable.y), cable.x + leftSVGWidth + trunkWidth, getCADY(cable.y + totalH));

    drawing.setActiveLayer('Text');
    drawing.drawText(cable.x + leftSVGWidth + 10, getCADY(cable.y + 35), 15, 0, cable.name);
    drawing.drawText(cable.x + leftSVGWidth + 10, getCADY(cable.y + 55), 8, 0, `${cable.fiberCount}F TRUNK`);

    // Draw dots for each side
    ['left', 'right'].forEach(side => {
        const isLeft = side === 'left';
        const expanded = isLeft ? cable.leftExp : cable.rightExp;
        const svgW = isLeft ? leftSVGWidth : rightSVGWidth;
        const pillX = isLeft ? svgW - LAYOUT.PILL_INSET - LAYOUT.PILL_W : LAYOUT.PILL_INSET;
        const pillOutX = isLeft ? pillX + LAYOUT.PILL_W : pillX;
        const dotX = isLeft ? pillOutX - LAYOUT.FAN_GAP : pillOutX + LAYOUT.FAN_GAP;
        const sideXOffset = isLeft ? 0 : leftSVGWidth + trunkWidth;

        let curY = cable.y + LAYOUT.TUBE_PAD;
        cable.tubes.forEach((tube, ti) => {
            const pillCY = curY + LAYOUT.TUBE_H / 2;
            const absolutePillX = cable.x + sideXOffset + pillX;
            const absolutePillOutX = cable.x + sideXOffset + pillOutX;
            
            const tubeLayer = `Fiber_${tube.color.name}`;
            drawing.setActiveLayer(tubeLayer);
            drawing.drawCircle(absolutePillX + LAYOUT.PILL_W / 2, getCADY(pillCY), 4);
            
            // Add tube label
            drawing.setActiveLayer('Text');
            const tubeTextX = isLeft ? absolutePillX - 50 : absolutePillX + LAYOUT.PILL_W + 5;
            drawing.drawText(tubeTextX, getCADY(pillCY + 2), 6, 0, tube.label);
            
            if (expanded.includes(ti)) {
                curY += LAYOUT.TUBE_H;
                const blockTop = curY + LAYOUT.STRAND_PAD_V;
                tube.strands.forEach((strand, si) => {
                    if (!strand) return;
                    const dotCY = blockTop + si * LAYOUT.STRAND_STEP + LAYOUT.STRAND_STEP / 2;
                    const absoluteDotX = cable.x + sideXOffset + dotX;
                    
                    const fiberLayer = `Fiber_${strand.color.name}`;
                    drawing.setActiveLayer(fiberLayer);
                    drawing.drawCircle(absoluteDotX, getCADY(dotCY), 2);
                    drawCurve(absolutePillOutX, pillCY, absoluteDotX, dotCY, fiberLayer);

                    // Add fiber strand label BL (001)
                    drawing.setActiveLayer('Text');
                    const tia = TIA_COLORS[si % 12];
                    const fiberNum = ti * 12 + si + 1;
                    const labelText = `${tia.abb} (${fiberNum.toString().padStart(3, '0')})`;
                    const textX = isLeft ? absoluteDotX - 45 : absoluteDotX + 8;
                    drawing.drawText(textX, getCADY(dotCY + 2), 5, 0, labelText);
                });
                curY += expandH;
            } else {
                curY += LAYOUT.TUBE_H;
            }
        });
    });
  });

  // 3. Equipment
  equipments.forEach(eq => {
    const w = 240;
    const h = 80 + (eq.ports * 30);
    drawBox(eq.x, getCADY(eq.y), eq.x + w, getCADY(eq.y + h), 'Equipment');
    drawing.setActiveLayer('Text');
    drawing.drawText(eq.x + 10, getCADY(eq.y + 35), 15, 0, eq.name);
    
    for (let i = 0; i < eq.ports; i++) {
        const portY = eq.y + 80 + (i * 30);
        const portX = eq.side === 'left' ? eq.x + w : eq.x;
        drawing.setActiveLayer('Equipment');
        drawing.drawCircle(portX, getCADY(portY), 5);
        drawing.setActiveLayer('Text');
        drawing.drawText(portX + (eq.side === 'left' ? 10 : -45), getCADY(portY + 2), 6, 0, `P-${i + 1}`);
    }
  });

  // 4. Connections
  drawing.setActiveLayer('Connections');
  connections.forEach(conn => {
    const getPos = (ref: any) => {
        if (ref.equipmentId) {
            const eq = equipments.find(e => e.id === ref.equipmentId);
            if (!eq) return { x: 0, y: 0 };
            const portY = eq.y + 80 + (ref.strandIdx * 30);
            const portX = eq.side === 'left' ? eq.x + 240 : eq.x;
            return { x: portX, y: portY };
        }
        const cab = cables.find(c => c.id === ref.cableId);
        if (!cab) return { x: 0, y: 0 };
        return getDotWorldPos(cab, ref);
    };

    const p1 = getPos(conn.from);
    const p2 = getPos(conn.to);
    
    // Draw curved connection line
    const mx1 = (p1.x + p2.x) / 2;
    const points: [number, number][] = [];
    const segments = 24;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Cubic Bezier approximation
        const x = Math.pow(1-t, 3) * p1.x + 3 * Math.pow(1-t, 2) * t * mx1 + 3 * (1-t) * Math.pow(t, 2) * mx1 + Math.pow(t, 3) * p2.x;
        const y = Math.pow(1-t, 3) * p1.y + 3 * Math.pow(1-t, 2) * t * p1.y + 3 * (1-t) * Math.pow(t, 2) * p2.y + Math.pow(t, 3) * p2.y;
        points.push([x, getCADY(y)]);
    }
    let connLayer = 'Conn_Default';
    if (conn.from.cableId) {
        const fiberIdx = (conn.from.tubeIdx * 12) + conn.from.strandIdx;
        const tia = TIA_COLORS[fiberIdx % 12];
        connLayer = `Conn_${tia.name}`;
    }
    
    drawing.setActiveLayer(connLayer);
    drawing.drawPolyline(points);
    
    if (conn.circuitName) {
        drawing.setActiveLayer('Text');
        const midT = 0.5;
        const tx = Math.pow(1-midT, 3) * p1.x + 3 * Math.pow(1-midT, 2) * midT * mx1 + 3 * (1-midT) * Math.pow(midT, 2) * mx1 + Math.pow(midT, 3) * p2.x;
        const ty = Math.pow(1-midT, 3) * p1.y + 3 * Math.pow(1-midT, 2) * midT * p1.y + 3 * (1-midT) * Math.pow(midT, 2) * p2.y + Math.pow(midT, 3) * p2.y;
        
        drawing.drawText(tx, getCADY(ty - 5), 8, 0, `CIRCUIT: ${conn.circuitName}`);
    }
  });

  return drawing.toDxfString();
};

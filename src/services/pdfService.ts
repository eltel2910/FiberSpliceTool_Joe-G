import { jsPDF } from 'jspdf';
import { CableData, NetworkEquipment, Connection, WorkZone, getDotWorldPos, TIA_COLORS, LAYOUT } from '../constants';

export const exportToPDF = (
  cables: CableData[],
  equipments: NetworkEquipment[],
  connections: Connection[],
  workzones: WorkZone[]
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3'
  });

  const scale = 0.15; 
  const offsetX = 20;
  const offsetY = 20;
  const toMM = (val: number) => val * scale;

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 420, 297, 'F');

  // Header Section
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, 400, 277);
  doc.line(10, 30, 410, 30);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('FIBERSYNC - NETWORK SCHEMATIC', 15, 23);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`PROJECT EXPORT: ${new Date().toLocaleDateString()}`, 350, 20);
  doc.text(`PAGE: 1 / 1`, 350, 25);

  // Bottom Border Info
  doc.line(10, 280, 410, 280);
  doc.setFontSize(8);
  doc.text('SYSTEM: FIBERSYNC NET-OPS v2.0 | DRAWING NO: FS-REF-' + Math.floor(Math.random()*10000), 15, 285);

  // 1. Workzones
  doc.setLineWidth(0.3);
  doc.setDrawColor(150, 150, 150);
  doc.setLineDashPattern([3, 2], 0);
  workzones.forEach(zone => {
    doc.rect(offsetX + toMM(zone.x), offsetY + toMM(zone.y), toMM(zone.width), toMM(zone.height));
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(zone.label.toUpperCase(), offsetX + toMM(zone.x) + 3, offsetY + toMM(zone.y) + 7);
  });
  doc.setLineDashPattern([], 0);

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

    const cx = offsetX + toMM(cable.x);
    const cy = offsetY + toMM(cable.y);
    const cw = toMM(totalW);
    const ch = toMM(totalH);

    doc.setFillColor(245, 250, 255);
    doc.setDrawColor(0, 50, 150);
    doc.setLineWidth(0.5);
    doc.rect(cx, cy, cw, ch, 'FD');
    
    // Partitions
    doc.line(cx + toMM(leftSVGWidth), cy, cx + toMM(leftSVGWidth), cy + ch);
    doc.line(cx + toMM(leftSVGWidth + trunkWidth), cy, cx + toMM(leftSVGWidth + trunkWidth), cy + ch);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(cable.name, cx + toMM(leftSVGWidth + trunkWidth / 2), cy + 10, { align: 'center' });

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
            
            const hex = tube.color.hex.replace('#', '');
            doc.setFillColor(parseInt(hex.substring(0,2), 16), parseInt(hex.substring(2,4), 16), parseInt(hex.substring(4,6), 16));
            doc.setDrawColor(0,0,0);
            const pillRectX = offsetX + toMM(absolutePillX);
            const pillRectY = offsetY + toMM(pillCY - 6.5);
            doc.rect(pillRectX, pillRectY, toMM(LAYOUT.PILL_W), toMM(LAYOUT.PILL_H), 'FD');

            // Add tube labels
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(5);
            const tubeTextX = isLeft ? pillRectX - 12 : pillRectX + toMM(LAYOUT.PILL_W) + 1;
            doc.text(tube.label, tubeTextX, pillRectY + 2.5);
            
            if (expanded.includes(ti)) {
                curY += LAYOUT.TUBE_H;
                const blockTop = curY + LAYOUT.STRAND_PAD_V;
                tube.strands.forEach((strand, si) => {
                    if (!strand) return;
                    const dotCY = blockTop + si * LAYOUT.STRAND_STEP + LAYOUT.STRAND_STEP / 2;
                    const absoluteDotX = cable.x + sideXOffset + dotX;
                    
                    const shex = strand.color.hex.replace('#', '');
                    doc.setDrawColor(parseInt(shex.substring(0,2), 16), parseInt(shex.substring(2,4), 16), parseInt(shex.substring(4,6), 16));
                    doc.setLineWidth(0.1);
                    
                    const p1x = offsetX + toMM(absolutePillOutX);
                    const p1y = offsetY + toMM(pillCY);
                    const p2x = offsetX + toMM(absoluteDotX);
                    const p2y = offsetY + toMM(dotCY);
                    const mx = (p1x + p2x) / 2;
                    
                    // Bezier path for PDF fan-out
                    doc.lines([[mx - p1x, 0, mx - p1x, p2y - p1y, p2x - p1x, p2y - p1y]], p1x, p1y, [1, 1], 'S', false);
                    
                    doc.setFillColor(parseInt(shex.substring(0,2), 16), parseInt(shex.substring(2,4), 16), parseInt(shex.substring(4,6), 16));
                    doc.circle(p2x, p2y, 0.8, 'F');

                    // Add strand label BL (001)
                    const fiberNum = ti * 12 + si + 1;
                    const labelText = `${strand.color.abb} (${fiberNum.toString().padStart(3, '0')})`;
                    doc.setFontSize(4);
                    doc.setTextColor(50, 50, 50);
                    const tx = isLeft ? p2x - 8 : p2x + 2;
                    doc.text(labelText, tx, p2y + 1);
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
    const ex = offsetX + toMM(eq.x);
    const ey = offsetY + toMM(eq.y);
    const ew = toMM(w);
    const eh = toMM(h);

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(ex, ey, ew, eh, 'FD');
    doc.setFillColor(230, 230, 240);
    doc.rect(ex, ey, ew, toMM(60), 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(eq.name, ex + 3, ey + 6);
    
    for (let i = 0; i < eq.ports; i++) {
        const portY = eq.y + 80 + (i * 30);
        const portX = eq.side === 'left' ? eq.x + 240 : eq.x;
        doc.setFillColor(255, 255, 255);
        doc.circle(offsetX + toMM(portX), offsetY + toMM(portY), 1.0, 'FD');
    }
  });

  // 4. Connections
  doc.setLineWidth(0.6);
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
    
    let color = [50, 50, 50];
    if (conn.from.cableId) {
        const fiberIdx = (conn.from.tubeIdx * 12) + conn.from.strandIdx;
        const hex = TIA_COLORS[fiberIdx % 12].hex.replace('#', '');
        color = [parseInt(hex.substring(0,2), 16), parseInt(hex.substring(2,4), 16), parseInt(hex.substring(4,6), 16)];
    }
    
    doc.setDrawColor(color[0], color[1], color[2]);
    const x1 = offsetX + toMM(p1.x);
    const y1 = offsetY + toMM(p1.y);
    const x2 = offsetX + toMM(p2.x);
    const y2 = offsetY + toMM(p2.y);
    const mx = (x1 + x2) / 2;

    doc.lines([[mx - x1, 0, mx - x1, y2 - y1, x2 - x1, y2 - y1]], x1, y1, [1, 1], 'S', false);
    
    if (conn.circuitName) {
        doc.setFontSize(5);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`CIRCUIT: ${conn.circuitName}`, (x1 + x2) / 2, (y1 + y2) / 2 - 1, { align: 'center' });
    }
  });

  doc.save(`fibersync_export_${new Date().toISOString().slice(0,10)}.pdf`);
};

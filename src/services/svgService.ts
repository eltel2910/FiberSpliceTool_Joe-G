import { CableData, NetworkEquipment, Connection, WorkZone, getDotWorldPos, TIA_COLORS, LAYOUT } from '../constants';

export const exportToSVG = (
  cables: CableData[],
  equipments: NetworkEquipment[],
  connections: Connection[],
  workzones: WorkZone[]
) => {
  // Calculate bounds
  const allPoints = [
    ...workzones.flatMap(z => [{ x: z.x, y: z.y }, { x: z.x + z.width, y: z.y + z.height }]),
    ...cables.flatMap(c => [{ x: c.x, y: c.y }, { x: c.x + 800, y: c.y + 400 }]),
    ...equipments.flatMap(e => [{ x: e.x, y: e.y }, { x: e.x + 300, y: e.y + e.ports * 40 }])
  ];

  const minX = Math.min(...allPoints.map(p => p.x)) - 100;
  const minY = Math.min(...allPoints.map(p => p.y)) - 100;
  const maxX = Math.max(...allPoints.map(p => p.x)) + 100;
  const maxY = Math.max(...allPoints.map(p => p.y)) + 100;
  
  const width = maxX - minX;
  const height = maxY - minY;

  const svgLines: string[] = [
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`,
    `<svg width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff" />`,
    
    // Grid (light grey)
    `  <defs>`,
    `    <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">`,
    `      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#f0f0f0" stroke-width="1"/>`,
    `    </pattern>`,
    `  </defs>`,
    `  <rect width="100%" height="100%" fill="url(#grid)" />`,

    `  <g id="workzones" opacity="0.6">`
  ];

  // 1. Workzones
  workzones.forEach(zone => {
    svgLines.push(`    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="8,4" />`);
    svgLines.push(`    <text x="${zone.x + 10}" y="${zone.y + 35}" fill="#999" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold">${zone.label.toUpperCase()}</text>`);
  });
  svgLines.push(`  </g>`);

  // 2. Cables
  svgLines.push(`  <g id="cables">`);
  cables.forEach(cable => {
    const leftSVGWidth = (cable.leftExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY);
    const rightSVGWidth = (cable.rightExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY);
    const trunkWidth = 164;
    const expandH = LAYOUT.STRAND_PAD_V * 2 + 12 * LAYOUT.STRAND_STEP;
    
    const calculateFullH = (expanded: number[]) => {
        const visibleTubes = cable.tubes.filter((_, ti) => 
            !cable.isCollapsed || connections.some(c => 
                (c.from.cableId === cable.id && c.from.tubeIdx === ti) || 
                (c.to.cableId === cable.id && c.to.tubeIdx === ti)
            )
        );
        return LAYOUT.TUBE_PAD + visibleTubes.length * LAYOUT.TUBE_H + (expanded.length * expandH) + LAYOUT.TUBE_PAD;
    };
    
    const leftH = calculateFullH(cable.leftExp);
    const rightH = calculateFullH(cable.rightExp);
    const totalH = Math.max(leftH, rightH, 80);
    const totalW = leftSVGWidth + trunkWidth + rightSVGWidth;

    // Outer Boundary
    svgLines.push(`    <rect x="${cable.x}" y="${cable.y}" width="${totalW}" height="${totalH}" fill="#cbd5e1" stroke="#000000" stroke-width="4" />`);
    
    // Partitions
    svgLines.push(`    <line x1="${cable.x + leftSVGWidth}" y1="${cable.y}" x2="${cable.x + leftSVGWidth}" y2="${cable.y + totalH}" stroke="#000000" stroke-width="1.5" />`);
    svgLines.push(`    <line x1="${cable.x + leftSVGWidth + trunkWidth}" y1="${cable.y}" x2="${cable.x + leftSVGWidth + trunkWidth}" y2="${cable.y + totalH}" stroke="#000000" stroke-width="1.5" />`);

    // Location and Title
    svgLines.push(`    <text x="${cable.x + leftSVGWidth + trunkWidth / 2}" y="${cable.y + 25}" fill="#0055aa" font-family="Helvetica" font-size="12" font-weight="black" text-anchor="middle" opacity="0.6">LOCATION</text>`);
    
    const locationLines = (cable.location || '---').split('\n');
    locationLines.forEach((line, i) => {
      svgLines.push(`    <text x="${cable.x + leftSVGWidth + trunkWidth / 2}" y="${cable.y + 50 + (i * 25)}" fill="#333" font-family="Helvetica" font-size="22" font-weight="bold" text-anchor="middle">${line}</text>`);
    });

    let nextY = 50 + (locationLines.length * 25);
    svgLines.push(`    <line x1="${cable.x + leftSVGWidth + 20}" y1="${cable.y + nextY - 5}" x2="${cable.x + leftSVGWidth + trunkWidth - 20}" y2="${cable.y + nextY - 5}" stroke="#eee" stroke-width="1" />`);

    const nameLines = cable.name.split('\n');
    nameLines.forEach((line, i) => {
      svgLines.push(`    <text x="${cable.x + leftSVGWidth + trunkWidth / 2}" y="${cable.y + nextY + 25 + (i * 25)}" fill="#000" font-family="Helvetica" font-size="18" font-weight="bold" text-anchor="middle">${line}</text>`);
    });
    
    let labelY = nextY + 25 + (nameLines.length * 25);
    svgLines.push(`    <text x="${cable.x + leftSVGWidth + trunkWidth / 2}" y="${cable.y + labelY}" fill="#666" font-family="Helvetica" font-size="12" text-anchor="middle">${cable.fiberCount}F TRUNK</text>`);
    
    if (cable.to) {
      labelY += 20;
      svgLines.push(`    <text x="${cable.x + leftSVGWidth + trunkWidth / 2}" y="${cable.y + labelY}" fill="#0055aa" font-family="Helvetica" font-size="11" font-weight="bold" text-anchor="middle">TO: ${cable.to}</text>`);
    }
    if (cable.from) {
      labelY += 15;
      svgLines.push(`    <text x="${cable.x + leftSVGWidth + trunkWidth / 2}" y="${cable.y + labelY}" fill="#0055aa" font-family="Helvetica" font-size="11" font-weight="bold" text-anchor="middle">FROM: ${cable.from}</text>`);
    }

    // Side Layouts
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
            const isVisible = !cable.isCollapsed || connections.some(c => 
                (c.from.cableId === cable.id && c.from.tubeIdx === ti) || 
                (c.to.cableId === cable.id && c.to.tubeIdx === ti)
            );
            if (!isVisible) return;

            const pillCY = curY + LAYOUT.TUBE_H / 2;
            const absolutePillX = cable.x + sideXOffset + pillX;
            const absolutePillOutX = cable.x + sideXOffset + pillOutX;
            
            // Tube Pill
            svgLines.push(`    <rect x="${absolutePillX}" y="${pillCY - 6}" width="${LAYOUT.PILL_W}" height="12" rx="6" fill="${tube.color.hex}" stroke="#333" stroke-width="1" />`);
            
            // Tube label
            const tubeTextX = isLeft ? absolutePillX - 65 : absolutePillX + LAYOUT.PILL_W + 5;
            svgLines.push(`    <text x="${tubeTextX}" y="${pillCY + 4}" fill="#000" font-family="monospace" font-size="12" font-weight="bold">${tube.label}</text>`);

            if (expanded.includes(ti)) {
                curY += LAYOUT.TUBE_H;
                const blockTop = curY + LAYOUT.STRAND_PAD_V;
                tube.strands.forEach((strand, si) => {
                    if (!strand) return;
                    const dotCY = blockTop + si * LAYOUT.STRAND_STEP + LAYOUT.STRAND_STEP / 2;
                    const absoluteDotX = cable.x + sideXOffset + dotX;
                    
                    const mx = (absolutePillOutX + absoluteDotX) / 2;
                    svgLines.push(`    <path d="M${absolutePillOutX},${pillCY} C${mx},${pillCY} ${mx},${dotCY} ${absoluteDotX},${dotCY}" stroke="${strand.color.hex}" stroke-width="1" fill="none" opacity="0.6" />`);
                    svgLines.push(`    <circle cx="${absoluteDotX}" cy="${dotCY}" r="4" fill="${strand.color.hex}" stroke="#666" stroke-width="0.5" />`);
                    
                    // Add strand label BL (001)
                    const fiberNum = ti * 12 + si + 1;
                    const labelText = `${strand.color.abb} (${fiberNum.toString().padStart(3, '0')})`;
                    const textX = isLeft ? absoluteDotX - 55 : absoluteDotX + 8;
                    svgLines.push(`    <text x="${textX}" y="${dotCY + 4}" fill="#333" font-family="monospace" font-size="10" font-weight="bold">${labelText}</text>`);
                });
                curY += expandH;
            } else {
                curY += LAYOUT.TUBE_H;
            }
        });
    });
  });
  svgLines.push(`  </g>`);

  // 3. Equipment
  svgLines.push(`  <g id="equipment">`);
  equipments.forEach(eq => {
    const w = 240;
    const h = 80 + (eq.ports * 30);
    svgLines.push(`    <rect x="${eq.x}" y="${eq.y}" width="${w}" height="${h}" fill="#fcfcfe" stroke="#000" stroke-width="2" />`);
    svgLines.push(`    <rect x="${eq.x}" y="${eq.y}" width="${w}" height="60" fill="#eee" stroke="#000" stroke-width="2" />`);
    svgLines.push(`    <text x="${eq.x + 15}" y="${eq.y + 40}" fill="#000" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="bold">${eq.name}</text>`);
    
    for (let i = 0; i < eq.ports; i++) {
        const portY = eq.y + 80 + (i * 30);
        const portX = eq.side === 'left' ? eq.x + w : eq.x;
        svgLines.push(`    <circle cx="${portX}" cy="${portY}" r="6" fill="#fff" stroke="#000" stroke-width="1.5" />`);
        svgLines.push(`    <text x="${portX + (eq.side === 'left' ? 12 : -45)}" y="${portY + 6}" fill="#444" font-family="monospace" font-size="14" font-weight="bold">P${i + 1}</text>`);
    }
  });
  svgLines.push(`  </g>`);

  // 4. Connections
  svgLines.push(`  <g id="connections">`);
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
        return getDotWorldPos(cab, ref, connections);
    };

    const p1 = getPos(conn.from);
    const p2 = getPos(conn.to);
    
    let color = '#333333';
    if (conn.from.cableId) {
        const fiberIdx = (conn.from.tubeIdx * 12) + conn.from.strandIdx;
        color = TIA_COLORS[fiberIdx % 12].hex;
    }

    const mx = (p1.x + p2.x) / 2;
    svgLines.push(`    <path d="M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" />`);
    
    if (conn.circuitName) {
      const midT = 0.5;
      const tx = Math.pow(1-midT, 3) * p1.x + 3 * Math.pow(1-midT, 2) * midT * mx + 3 * (1-midT) * Math.pow(midT, 2) * mx + Math.pow(midT, 3) * p2.x;
      const ty = Math.pow(1-midT, 3) * p1.y + 3 * Math.pow(1-midT, 2) * midT * p1.y + 3 * (1-midT) * Math.pow(midT, 2) * p2.y + Math.pow(midT, 3) * p2.y;
      svgLines.push(`    <text x="${tx}" y="${ty - 8}" fill="#000" font-family="Helvetica, Arial, sans-serif" font-size="12" text-anchor="middle" font-weight="bold">CIRCUIT: ${conn.circuitName}</text>`);
    }
  });
  svgLines.push(`  </g>`);

  svgLines.push(`</svg>`);

  return svgLines.join('\n');
};

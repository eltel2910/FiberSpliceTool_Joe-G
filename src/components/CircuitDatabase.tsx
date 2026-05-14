import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Connection, CableData, WorkZone, getDotWorldPos, TIA_COLORS, NetworkEquipment, LAYOUT } from '../constants';
import { X, Share2, Cable, Hash } from 'lucide-react';

interface Props {
  connections: Connection[];
  cables: CableData[];
  networkEquipments: NetworkEquipment[];
  workZones: WorkZone[];
  onClose: () => void;
}

export const CircuitDatabase: React.FC<Props> = ({ connections, cables, networkEquipments, workZones, onClose }) => {
  // Group unique circuit names
  const circuitNames = connections.map(c => c.circuitName).filter((n): n is string => !!n);
  const circuits: string[] = circuitNames
    .filter((name, index) => circuitNames.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const handleExport = async (names: string[]) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Circuit Database');

    // Define columns based on the requested format
    worksheet.columns = [
      { header: 'Hops', key: 'hops', width: 8 },
      { header: 'Location', key: 'location', width: 25 },
      { header: 'Circuit Name', key: 'circuitName', width: 20 },
      { header: 'Source', key: 'sourceCable', width: 20 },
      { header: 'Source Port', key: 'sourcePort', width: 12 },
      { header: 'S. Tube Color', key: 'sTubeColor', width: 15 },
      { header: 'S. Tube', key: 'sTube', width: 10 },
      { header: 'S. Strand Color', key: 'sStrandColor', width: 15 },
      { header: 'S. Fiber #', key: 'sFiberNum', width: 12 },
      { header: 'Dest', key: 'destCable', width: 20 },
      { header: 'Dest Port', key: 'destPort', width: 12 },
      { header: 'D. Tube Color', key: 'dTubeColor', width: 15 },
      { header: 'D. Tube', key: 'dTube', width: 10 },
      { header: 'D. Strand Color', key: 'dStrandColor', width: 15 },
      { header: 'D. Fiber #', key: 'dFiberNum', width: 12 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    headerRow.eachCell((cell, colNumber) => {
      if (colNumber <= 15) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF444444' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    });

    names.forEach(name => {
      const circuitConns = connections.filter(c => c.circuitName === name);
      
      const getPos = (ref: any) => {
        if (ref.equipmentId) {
          const eq = networkEquipments.find(e => e.id === ref.equipmentId);
          if (!eq) return { x: 0, y: 0 };
          const portHeight = 30;
          const padding = 20;
          const headerHeight = 50;
          const portY = eq.y + headerHeight + padding/2 + ref.strandIdx * portHeight + portHeight/2;
          const dotX = eq.x + (eq.side === 'left' ? -LAYOUT.FAN_GAP : LAYOUT.EQUIP_WIDTH + LAYOUT.FAN_GAP);
          return { x: dotX, y: portY };
        }
        const cab = cables.find(ca => ca.id === ref.cableId);
        if (!cab) return { x: 0, y: 0 };
        return getDotWorldPos(cab, ref, connections);
      };

      const dotsEqual = (a: any, b: any) => {
        if (!!a.equipmentId !== !!b.equipmentId) return false;
        if (a.equipmentId) return a.equipmentId === b.equipmentId && a.strandIdx === b.strandIdx;
        return a.cableId === b.cableId && a.tubeIdx === b.tubeIdx && a.strandIdx === b.strandIdx && a.side === b.side;
      };

      const getInternalDot = (dot: any) => {
        if (dot.equipmentId) return null;
        return { ...dot, side: dot.side === 'left' ? 'right' : 'left' };
      };

      // 1. Identify valid endpoints for the circuit
      const allDots: any[] = [];
      circuitConns.forEach(c => {
        allDots.push(c.from);
        allDots.push(c.to);
      });

      const endpoints = allDots.filter(dot => {
        const isExternal = dot.equipmentId || !circuitConns.some(c => dotsEqual(getInternalDot(dot), c.from) || dotsEqual(getInternalDot(dot), c.to));
        const connCount = circuitConns.filter(c => dotsEqual(c.from, dot) || dotsEqual(c.to, dot)).length;
        return connCount === 1; // Leaf node in this segments set
      });

      let startDot = endpoints.length > 0 
        ? endpoints.sort((a,b) => getPos(a).x - getPos(b).x)[0]
        : circuitConns[0].from;

      // 2. Walk the circuit logic
      const orderedRows: any[] = [];
      const visitedConns = new Set<string>();
      let walkDot = startDot;
      let hopCount = 1;

      const processConn = (c: Connection, fromDot: any, toDot: any) => {
        const sourceCableObj = cables.find(cab => cab.id === fromDot.cableId);
        const sourceEquipObj = networkEquipments.find(e => e.id === fromDot.equipmentId);
        const destCableObj = cables.find(cab => cab.id === toDot.cableId);
        const destEquipObj = networkEquipments.find(e => e.id === toDot.equipmentId);

        const sourceName = sourceEquipObj 
          ? `${sourceEquipObj.name} (${sourceEquipObj.building})` 
          : (sourceCableObj?.name || 'Unknown');
        const destName = destEquipObj 
          ? `${destEquipObj.name} (${destEquipObj.building})` 
          : (destCableObj?.name || 'Unknown');
        
        const location = sourceCableObj?.location || destCableObj?.location || 'N/A';
        
        return {
          hops: hopCount++,
          location,
          circuitName: name,
          sourceCable: sourceName,
          sourcePort: fromDot.equipmentId ? `PORT ${fromDot.strandIdx + 1}` : fromDot.side.toUpperCase(),
          sTubeColor: fromDot.cableId ? TIA_COLORS[fromDot.tubeIdx % 12].abb : 'N/A',
          sTube: fromDot.cableId ? fromDot.tubeIdx + 1 : 'N/A',
          sStrandColor: fromDot.cableId ? TIA_COLORS[fromDot.strandIdx % 12].abb : 'N/A',
          sFiberNum: fromDot.cableId ? (12 * fromDot.tubeIdx) + fromDot.strandIdx + 1 : fromDot.strandIdx + 1,
          destCable: destName,
          destPort: toDot.equipmentId ? `PORT ${toDot.strandIdx + 1}` : toDot.side.toUpperCase(),
          dTubeColor: toDot.cableId ? TIA_COLORS[toDot.tubeIdx % 12].abb : 'N/A',
          dTube: toDot.cableId ? toDot.tubeIdx + 1 : 'N/A',
          dStrandColor: toDot.cableId ? TIA_COLORS[toDot.strandIdx % 12].abb : 'N/A',
          dFiberNum: toDot.cableId ? (12 * toDot.tubeIdx) + toDot.strandIdx + 1 : toDot.strandIdx + 1,
        };
      };

      while (true) {
        // Find connection attached to walkDot
        const nextConn = circuitConns.find(c => !visitedConns.has(c.id) && (dotsEqual(c.from, walkDot) || dotsEqual(c.to, walkDot)));
        if (!nextConn) break;

        visitedConns.add(nextConn.id);
        const otherDot = dotsEqual(nextConn.from, walkDot) ? nextConn.to : nextConn.from;
        
        // Add row for this segment
        orderedRows.push(processConn(nextConn, walkDot, otherDot));

        // Jump across cable if applicable
        if (!otherDot.equipmentId) {
          const oppositeDot = getInternalDot(otherDot);
          const hasMore = circuitConns.some(c => !visitedConns.has(c.id) && (dotsEqual(c.from, oppositeDot) || dotsEqual(c.to, oppositeDot)));
          if (hasMore) {
            walkDot = oppositeDot;
            continue;
          }
        }
        walkDot = otherDot;
      }

      // 3. Add rows to worksheet
      orderedRows.forEach(p => {
        const row = worksheet.addRow(p);
        row.eachCell((cell, colNumber) => {
          if (colNumber <= 15) {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      // Handle any skipped connections (orphaned or circular parts not reached by walk)
      const skippedConns = circuitConns.filter(c => !visitedConns.has(c.id));
      skippedConns.forEach(c => {
        // Default left-to-right for orphans
        const p1 = getPos(c.from);
        const p2 = getPos(c.to);
        const isSwap = p1.x > p2.x;
        const row = worksheet.addRow({
          ...processConn(c, isSwap ? c.to : c.from, isSwap ? c.from : c.to),
          hops: '-'
        });
        row.eachCell((cell, colNumber) => {
          if (colNumber <= 15) {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });
    });


    // Cleanup redundant header border application as it's now handled in eachCell loop above

    // Write buffer and save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = names.length === 1 
      ? `${names[0].replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.xlsx` 
      : "circuit_database_master_report.xlsx";
    saveAs(blob, filename);
  };

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="fixed inset-x-0 bottom-0 top-20 z-[1100] bg-[#0a0c12]/95 backdrop-blur-3xl flex flex-col p-8 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <Share2 className="text-[var(--accent)] w-6 h-6" />
              <h1 className="text-2xl font-bold tracking-[4px] text-white uppercase font-mono">Splice Circuit Database</h1>
            </div>
            <p className="text-[0.7rem] font-mono text-white/40 tracking-widest pl-1 uppercase">Persistent connectivity inventory & audit trail</p>
          </div>
          <div className="flex items-center gap-4">
            {circuits.length > 0 && (
              <button 
                onClick={() => handleExport(circuits)}
                className="px-4 py-2 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-lg text-[0.6rem] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all uppercase tracking-widest"
              >
                Export All
              </button>
            )}
            <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {circuits.length === 0 ? (
            <div className="h-full flex items-center justify-center border border-dashed border-white/10 rounded-3xl opacity-40">
              <div className="text-center font-mono space-y-2">
                <Hash size={32} className="mx-auto mb-4" />
                <p className="text-sm">NO NAMED CIRCUITS DETECTED</p>
                <p className="text-[0.6rem] tracking-widest uppercase">Inspect a fiber trace to assign a persistent ID</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {circuits.map(name => {
                const connCount = connections.filter(c => c.circuitName === name).length;
                return (
                  <div key={name} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:border-[var(--accent)]/30 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[var(--accent)] font-mono text-xs font-bold tracking-widest bg-[var(--accent)]/10 px-3 py-1 rounded-full uppercase truncate max-w-[80%]">
                        {name}
                      </span>
                      <div className="flex items-center gap-2 text-white/20">
                         <Hash size={12} />
                         <span className="text-[0.6rem] font-mono">{connCount} SEGMENTS</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 group-hover:bg-black/60 transition-colors">
                        <div className="flex items-center gap-2 text-[0.65rem] text-white/40 font-mono mb-2 uppercase tracking-wider">
                          <Cable size={10} /> Topology Preview
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex gap-1">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex-1 bg-[var(--accent)]/30 rounded-sm animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                          ))}
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleExport([name])}
                        className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[0.65rem] font-mono text-white/60 hover:text-white transition-all uppercase tracking-widest font-bold"
                      >
                        Export Report
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

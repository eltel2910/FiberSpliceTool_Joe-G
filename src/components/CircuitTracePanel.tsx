import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Connection, CableData, DotRef, findCircuitPath, dotsEqual, WorkZone, getDotWorldPos, NetworkEquipment, LAYOUT } from '../constants';
import { X, Save, Share2, List, Trash2 } from 'lucide-react';

interface Props {
  startDots: DotRef[];
  connections: Connection[];
  cables: CableData[];
  networkEquipments: NetworkEquipment[];
  workZones: WorkZone[];
  onUpdateCircuitName: (path: Connection[], name: string) => void;
  onClose: () => void;
}

export const CircuitTracePanel: React.FC<Props> = ({ startDots, connections, cables, networkEquipments, workZones, onUpdateCircuitName, onClose }) => {
  const [tracedCircuits, setTracedCircuits] = useState<{
    id: string;
    connections: Connection[];
    name: string;
    segments: any[];
    isExpanded: boolean;
  }[]>([]);
  
  const [batchName, setBatchName] = useState('');
  const [startNumber, setStartNumber] = useState(1);

  // Helper to find work zone for a connection
  const getWorkZoneLabel = (conn: Connection) => {
    const c1 = cables.find(c => c.id === conn.from.cableId);
    const c2 = cables.find(c => c.id === conn.to.cableId);
    if (!c1 || !c2) return null;
    
    const p1 = getDotWorldPos(c1, conn.from);
    const p2 = getDotWorldPos(c2, conn.to);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    
    return workZones.find(z => 
      midX >= z.x && midX <= z.x + z.width &&
      midY >= z.y && midY <= z.y + z.height
    )?.label;
  };

  const getDotLabel = (ref: DotRef) => {
    const cable = cables.find(c => c.id === ref.cableId);
    if (!cable) return 'Unknown Cable';
    const tube = cable.tubes[ref.tubeIdx];
    const strand = tube.strands[ref.strandIdx];
    if (!strand) return `${cable.name} - T_${tube.label}`;
    return `${cable.name} - T_${tube.label} / F_${strand.label}`;
  };

  const getPos = (ref: DotRef) => {
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
    return getDotWorldPos(cab, ref);
  };

  // Internal helper to build segments for a SPECIFIC path
  const buildSegmentsForPath = (pathConnections: Connection[]) => {
    if (pathConnections.length === 0) return [];
    
    const allSegments: { type: 'splice' | 'internal' | 'endpoint'; from: string; to: string; name?: string; cableId?: string }[] = [];
    const processedSplices = new Set<string>();

    const nodesInCircuit = new Set<string>();
    pathConnections.forEach(c => {
        nodesInCircuit.add(JSON.stringify(c.from));
        nodesInCircuit.add(JSON.stringify(c.to));
    });
    
    const endpoints: DotRef[] = [];
    nodesInCircuit.forEach(nodeJson => {
        const dot = JSON.parse(nodeJson) as DotRef;
        const connCount = pathConnections.filter(c => dotsEqual(c.from, dot) || dotsEqual(c.to, dot)).length;
        if (connCount === 1) endpoints.push(dot);
    });

    let walk = endpoints.length > 0 
      ? endpoints.sort((a,b) => getPos(a).x - getPos(b).x)[0]
      : pathConnections[0].from;

    const visitedSplices = new Set<string>();
    const visitedInternals = new Set<string>();
    
    let iterations = 0;
    while (iterations < 100) {
      const p1 = getPos(walk);
      const splice = pathConnections.find(c => (dotsEqual(c.from, walk) || dotsEqual(c.to, walk)) && !visitedSplices.has(c.id));
      if (splice) {
        visitedSplices.add(splice.id);
        const next = dotsEqual(splice.from, walk) ? splice.to : splice.from;
        const p2 = getPos(next);
        
        if (!processedSplices.has(splice.id)) {
          const isSwap = p1.x > p2.x;
          allSegments.push({
            type: 'splice',
            from: getDotLabel(isSwap ? next : walk),
            to: getDotLabel(isSwap ? walk : next),
            name: splice.circuitName || getWorkZoneLabel(splice)
          });
          processedSplices.add(splice.id);
        }
        
        walk = next;
        iterations++;
        continue;
      }

      if (!walk.equipmentId) {
          const internalKey = `${walk.cableId}-${walk.tubeIdx}-${walk.strandIdx}`;
          if (!visitedInternals.has(internalKey)) {
            const otherSide: 'left' | 'right' = walk.side === 'left' ? 'right' : 'left';
            const internalDot: DotRef = { ...walk, side: otherSide };
            const hasAnythingFurther = pathConnections.some(c => (dotsEqual(c.from, internalDot) || dotsEqual(c.to, internalDot)) && !visitedSplices.has(c.id));
            
            if (hasAnythingFurther) {
              visitedInternals.add(internalKey);
              const cable = cables.find(c => c.id === walk.cableId);
              const p2 = getPos(internalDot);
              const isSwap = p1.x > p2.x;
              
              allSegments.push({
                type: 'internal',
                from: isSwap ? `${otherSide.toUpperCase()} PORT` : `${walk.side.toUpperCase()} PORT`,
                to: isSwap ? `${walk.side.toUpperCase()} PORT` : `${otherSide.toUpperCase()} PORT`,
                name: `INTERNAL: ${cable?.name || 'CABLE'}`
              });
              walk = internalDot;
              iterations++;
              continue;
            }
          }
      }
      break;
    }
    return allSegments;
  };

  useEffect(() => {
    // 1. Trace all dots
    const results = startDots.map(dot => {
      const p = findCircuitPath(dot, connections);
      return { dot, p };
    });

    // 2. Group findings by path (using sorted connection IDs as key)
    const groups = new Map<string, { connections: Connection[]; firstDot: DotRef }>();
    results.forEach(({ dot, p }) => {
      if (p.length === 0) {
        // Handle unconnected dot as a "pathless" circuit
        const key = `unconnected-${JSON.stringify(dot)}`;
        groups.set(key, { connections: [], firstDot: dot });
        return;
      }
      const key = p.map(c => c.id).sort().join('|');
      if (!groups.has(key)) {
        groups.set(key, { connections: p, firstDot: dot });
      }
    });

    // 3. Create initial state
    const initialCircuits = Array.from(groups.values()).map(g => {
      const existingName = g.connections.find(c => c.circuitName)?.circuitName || '';
      return {
        id: g.connections.length > 0 ? g.connections.map(c => c.id).sort().join('|') : `unconnected-${JSON.stringify(g.firstDot)}`,
        connections: g.connections,
        name: existingName,
        segments: buildSegmentsForPath(g.connections),
        isExpanded: startDots.length === 1 // Auto expand if only one
      };
    });

    setTracedCircuits(prev => {
      // Simple check to avoid redundant updates if logically same
      if (prev.length === initialCircuits.length && 
          prev.every((c, i) => c.id === initialCircuits[i].id && c.name === initialCircuits[i].name)) {
        return prev;
      }
      return initialCircuits;
    });
  }, [startDots, connections]);

  const handleUpdateBatchName = (val: string) => {
    setBatchName(val);
    setTracedCircuits(prev => prev.map(c => ({ ...c, name: val })));
  };

  const handleAutoSequence = () => {
    setTracedCircuits(prev => prev.map((c, i) => ({
      ...c,
      name: batchName ? `${batchName} - ${startNumber + i}` : `Circuit ${startNumber + i}`
    })));
  };

  const handleSaveAll = () => {
    tracedCircuits.forEach(circuit => {
      if (circuit.connections.length > 0) {
        onUpdateCircuitName(circuit.connections, circuit.name);
      }
    });
  };

  return (
    <motion.div 
      initial={{ x: 450, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 450, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-24 right-4 w-[450px] bg-[#0a0c12]/98 border border-white/20 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(30,144,255,0.1)] z-[1000] backdrop-blur-3xl flex flex-col max-h-[85vh] ring-1 ring-white/10 overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-linear-to-r from-white/[0.05] to-transparent">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Share2 size={14} className="text-[var(--accent)]" />
            <h2 className="text-[0.75rem] font-bold tracking-[3px] text-white uppercase font-mono">
              Batch Fiber Analysis
            </h2>
          </div>
          <p className="text-[0.55rem] font-mono text-white/40 tracking-wider uppercase">
            {tracedCircuits.length} Disjoint Circuits Identified
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors group">
          <X size={18} className="text-white/40 group-hover:text-white" />
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
        {/* Batch Operations */}
        {tracedCircuits.length > 1 && (
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[0.6rem] uppercase font-mono text-white/30 tracking-[1px]">Batch Operations</label>
              <span className="text-[0.5rem] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono uppercase">Fast Fill</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.5rem] uppercase font-mono text-white/20 ml-1">Base Name</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="e.g. MUSIC"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                  <button 
                    onClick={() => handleUpdateBatchName(batchName)}
                    className="px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[0.55rem] text-white/60 font-mono uppercase transition-all whitespace-nowrap"
                  >
                    Set All
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 flex items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.5rem] uppercase font-mono text-white/20 ml-1">Start #</label>
                  <input 
                    type="number"
                    value={startNumber}
                    onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                    className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                </div>
                <button 
                  onClick={handleAutoSequence}
                  className="flex-1 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-400 py-2.5 rounded-xl text-[0.6rem] font-bold font-mono tracking-widest uppercase transition-all flex items-center justify-center gap-2 group"
                >
                  <List size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                  Auto-Sequence
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {tracedCircuits.map((circuit, cIdx) => (
            <div key={circuit.id} className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden transition-all hover:border-[var(--accent)]/30">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer group"
                onClick={() => setTracedCircuits(prev => prev.map((c, i) => i === cIdx ? { ...c, isExpanded: !c.isExpanded } : c))}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                    <span className="text-[0.65rem] font-bold font-mono text-white tracking-widest uppercase">
                      {circuit.name || `CIRCUIT_${String(cIdx + 1).padStart(2, '0')}`}
                    </span>
                  </div>
                  <span className="text-[0.5rem] font-mono text-white/30 ml-3.5 uppercase">{circuit.segments.length} Hops • {circuit.connections.length > 0 ? 'Splice Root' : 'Unconnected'}</span>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (circuit.connections.length > 0) {
                        onUpdateCircuitName(circuit.connections, circuit.name);
                      }
                    }}
                    className="p-1.5 hover:bg-[var(--accent)]/10 text-white/40 hover:text-[var(--accent)] transition-all flex items-center gap-2"
                   >
                     <Save size={14} />
                     <span className="text-[0.55rem] font-mono font-bold uppercase">Save</span>
                   </button>
                   <AnimatePresence>
                     <motion.div
                       animate={{ rotate: circuit.isExpanded ? 180 : 0 }}
                       className="text-white/20"
                     >
                       <X size={14} className="rotate-45" />
                     </motion.div>
                   </AnimatePresence>
                </div>
              </div>

              <AnimatePresence>
                {circuit.isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/5 bg-white/[0.02]"
                  >
                    <div className="p-4 space-y-4">
                      <div className="space-y-2">
                         <label className="text-[0.55rem] uppercase font-mono text-white/40 tracking-[1px] ml-1">Circuit Name</label>
                         <input 
                          type="text" 
                          value={circuit.name}
                          onChange={(e) => setTracedCircuits(prev => prev.map((c, i) => i === cIdx ? { ...c, name: e.target.value } : c))}
                          placeholder="e.g. CORE_S1_P24"
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--accent)] transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-1 mt-4">
                        <label className="text-[0.55rem] uppercase font-mono text-white/40 tracking-[1px] ml-1">Trace Topology</label>
                        <div className="space-y-2 relative pt-2">
                          <div className="absolute left-2.5 top-2 bottom-2 w-px bg-white/5" />
                          {circuit.segments.map((seg, sIdx) => (
                            <div key={sIdx} className="relative pl-7 pb-3 last:pb-0">
                               <div className={`absolute left-2 top-1.5 w-1 h-1 rounded-full bg-[#12151c] border z-10 ${
                                seg.type === 'internal' ? 'border-white/20' : 'border-[var(--accent)]'
                              }`} />
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[0.55rem] font-mono text-white group-hover:text-[var(--accent)]">{seg.from}</span>
                                  <div className="h-px flex-1 bg-white/5" />
                                  <span className="text-[0.55rem] font-mono text-white/60">{seg.to}</span>
                                </div>
                                <span className="text-[0.45rem] font-mono text-white/20 uppercase tracking-wider">{seg.name || (seg.type === 'internal' ? 'Internal Link' : 'Splice')}</span>
                              </div>
                            </div>
                          ))}
                          {circuit.segments.length === 0 && (
                            <div className="text-[0.55rem] font-mono text-red-400 p-2 italic bg-red-400/5 rounded">NO PATH FOUND - Connector is not spliced</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 border-t border-white/10 bg-white/[0.04] flex gap-3">
        <button 
          onClick={onClose}
          className="flex-1 py-3 rounded-xl border border-white/10 text-white/40 text-[0.65rem] font-mono hover:bg-white/5 transition-all text-center tracking-[2px] uppercase font-bold"
        >
          Cancel
        </button>
        <button 
          onClick={() => {
            handleSaveAll();
            onClose();
          }}
          disabled={tracedCircuits.every(c => c.connections.length === 0)}
          className="flex-2 py-3 rounded-xl bg-[var(--accent)] text-[#0a0c12] text-[0.65rem] font-mono hover:brightness-110 transition-all text-center tracking-[2px] uppercase font-bold flex items-center justify-center gap-2 disabled:opacity-30"
        >
          <Save size={14} />
          Save All Circuits
        </button>
      </div>
    </motion.div>
  );
};

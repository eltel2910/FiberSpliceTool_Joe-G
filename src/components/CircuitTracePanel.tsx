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
  const [path, setPath] = useState<Connection[]>([]);
  const [circuitName, setCircuitName] = useState('');
  
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

  useEffect(() => {
    const combinedPaths = startDots.flatMap(dot => findCircuitPath(dot, connections));
    // Remove duplicates
    const uniqueConnections = Array.from(new Map(combinedPaths.map(c => [c.id, c])).values()) as Connection[];
    
    setPath(uniqueConnections);
    // Find if any connection in path already has a name
    const existingName = uniqueConnections.find(c => c.circuitName)?.circuitName || '';
    setCircuitName(existingName);
  }, [startDots, connections]);

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

  // Build the logical list of nodes in the paths
  const buildTraceNodes = () => {
    if (path.length === 0) {
      return startDots.map(dot => ({
        type: 'endpoint' as const,
        from: getDotLabel(dot),
        to: 'NOT CONNECTED',
        name: undefined
      }));
    }

    // For multiple start dots, we'll group nodes by the starting point's circuit
    const allSegments: { type: 'splice' | 'internal' | 'endpoint'; from: string; to: string; name?: string; cableId?: string }[] = [];
    const processedSplices = new Set<string>();

    // 1. Group path connections into disjoint sets (circuits)
    // 2. For each set, find the leftmost node
    // 3. Walk from that leftmost node
    
    const circuitGroups: Connection[][] = [];
    const connPool = [...path];
    
    while(connPool.length > 0) {
        const first = connPool.shift()!;
        const group = [first];
        let expanded = true;
        while(expanded) {
            expanded = false;
            for(let i=0; i<connPool.length; i++) {
                const other = connPool[i];
                if (group.some(c => dotsEqual(c.from, other.from) || dotsEqual(c.from, other.to) || dotsEqual(c.to, other.from) || dotsEqual(c.to, other.to))) {
                    group.push(connPool.splice(i, 1)[0]);
                    i--;
                    expanded = true;
                }
            }
        }
        circuitGroups.push(group);
    }

    circuitGroups.forEach(circuit => {
      // Find leftmost endpoint of this circuit
      const nodesInCircuit = new Set<string>();
      circuit.forEach(c => {
          nodesInCircuit.add(JSON.stringify(c.from));
          nodesInCircuit.add(JSON.stringify(c.to));
      });
      
      const endpoints: DotRef[] = [];
      nodesInCircuit.forEach(nodeJson => {
          const dot = JSON.parse(nodeJson) as DotRef;
          const connCount = circuit.filter(c => dotsEqual(c.from, dot) || dotsEqual(c.to, dot)).length;
          if (connCount === 1) endpoints.push(dot);
      });

      let walk = endpoints.length > 0 
        ? endpoints.sort((a,b) => getPos(a).x - getPos(b).x)[0]
        : circuit[0].from;

      const visitedSplices = new Set<string>();
      const visitedInternals = new Set<string>();
      
      let iterations = 0;
      while (iterations < 100) {
        // Always orientation left-to-right
        const p1 = getPos(walk);
        
        // 1. Try Splice
        const splice = circuit.find(c => (dotsEqual(c.from, walk) || dotsEqual(c.to, walk)) && !visitedSplices.has(c.id));
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

        // 2. Try Internal
        if (!walk.equipmentId) {
            const internalKey = `${walk.cableId}-${walk.tubeIdx}-${walk.strandIdx}`;
            if (!visitedInternals.has(internalKey)) {
              const otherSide: 'left' | 'right' = walk.side === 'left' ? 'right' : 'left';
              const internalDot: DotRef = { ...walk, side: otherSide };
              const hasAnythingFurther = circuit.some(c => (dotsEqual(c.from, internalDot) || dotsEqual(c.to, internalDot)) && !visitedSplices.has(c.id));
              
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
    });
    
    return allSegments;
  };

  const traceSegments = buildTraceNodes();

  return (
    <motion.div 
      initial={{ x: 450, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 450, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-24 right-4 w-96 bg-[#0a0c12]/98 border border-white/20 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(30,144,255,0.1)] z-[1000] backdrop-blur-3xl flex flex-col max-h-[85vh] ring-1 ring-white/10 overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-linear-to-r from-white/[0.05] to-transparent">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Share2 size={14} className="text-[var(--accent)]" />
            <h2 className="text-[0.75rem] font-bold tracking-[3px] text-white uppercase font-mono">
              {startDots.length > 1 ? `Multi-Circuit Analysis (${startDots.length})` : 'Circuit Analysis'}
            </h2>
          </div>
          <p className="text-[0.55rem] font-mono text-white/40 tracking-wider uppercase">
            {startDots.length > 1 ? 'Batch processing selected fibers' : 'End-to-end splice tracer'}
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors group">
          <X size={18} className="text-white/40 group-hover:text-white" />
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <label className="text-[0.65rem] uppercase font-mono text-[var(--accent)] tracking-[2px] font-bold">Metadata</label>
            <span className="text-[0.55rem] font-mono text-white/20">IDENTIFIER_V1.0</span>
          </div>
          <div className="flex flex-col gap-2">
            <input 
              type="text" 
              value={circuitName}
              onChange={(e) => setCircuitName(e.target.value)}
              placeholder="Assign Circuit Tag (e.g. NET_BACKHAUL_01)..."
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/50 transition-all placeholder:text-white/10 font-mono"
            />
            <button 
              onClick={() => onUpdateCircuitName(path, circuitName)}
              disabled={path.length === 0 && startDots.length === 0}
              className="w-full bg-[var(--accent)] text-[#0a0c12] py-3 rounded-xl text-[0.7rem] font-bold font-mono hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-30 disabled:pointer-events-none"
            >
              <Save size={14} className="group-hover:scale-110 transition-transform" />
              {startDots.length > 1 ? 'APPLY TO ALL SELECTED' : 'APPLY TO ENTIRE PATH'}
            </button>
            {path.length === 0 && (
              <p className="text-[0.55rem] text-red-400 font-mono italic px-1">NOTE: CONNECTION REQUIRED TO PERSIST NAME</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <label className="text-[0.65rem] uppercase font-mono text-white/40 tracking-[2px]">Topology details</label>
            <div className="flex items-center gap-2">
               <List size={12} className="text-white/20" />
               <span className="text-[0.55rem] font-mono text-[var(--accent)] font-bold">{traceSegments.length} HOPS</span>
            </div>
          </div>
          
          <div className="space-y-2 relative">
            <div className="absolute left-4 top-4 bottom-4 w-px bg-white/10" />
            
            {traceSegments.map((seg, i) => (
              <div key={i} className="relative pl-10 pb-4 last:pb-0">
                <div className={`absolute left-3 top-2 w-2.5 h-2.5 rounded-full bg-[#12151c] border-2 z-10 ${
                  seg.type === 'internal' ? 'border-dashed border-white/40' : 'border-[var(--accent)]'
                }`} />
                
                <div className={`border rounded-xl p-4 space-y-3 transition-colors group ${
                  seg.type === 'internal' 
                    ? 'bg-white/[0.02] border-white/5 border-dashed' 
                    : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.06]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.5rem] font-mono text-white/20 uppercase">
                      {seg.type === 'internal' ? 'Cable Internal' : (seg.name ? seg.name : `Segment ${String(i+1).padStart(2, '0')}`)}
                    </span>
                    {seg.name && (
                      <span className={`text-[0.55rem] font-mono px-2 py-0.5 rounded-full border ${
                        seg.type === 'internal'
                          ? 'text-white/40 border-white/10 bg-white/5'
                          : 'text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20 shadow-[0_0_8px_rgba(0,210,255,0.2)]'
                      }`}>
                        {seg.name}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        seg.type === 'internal' ? 'bg-white/20' : 'bg-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                      }`} />
                      <div className="flex flex-col">
                        <span className="text-[0.55rem] text-white/40 font-mono uppercase">Origin</span>
                        <span className="text-[0.7rem] text-white font-mono">{seg.from}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        seg.type === 'internal' ? 'bg-white/20' : 'bg-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                      }`} />
                      <div className="flex flex-col">
                        <span className="text-[0.55rem] text-white/40 font-mono uppercase">Destination</span>
                        <span className="text-[0.7rem] text-white font-mono">{seg.to}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-white/10 bg-white/[0.02]">
        <button 
          onClick={onClose}
          className="w-full py-3 rounded-xl border border-white/10 text-white/60 text-[0.7rem] font-mono hover:bg-white/5 transition-all text-center tracking-[2px] uppercase font-bold"
        >
          Close Inspector
        </button>
      </div>
    </motion.div>
  );
};

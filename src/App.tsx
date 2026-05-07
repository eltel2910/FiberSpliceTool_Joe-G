import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Maximize, ZoomIn, ZoomOut, MousePointer2, Move, Cable, Download, Square } from 'lucide-react';
import { toPng } from 'html-to-image';
import { TIA_COLORS, getCableStructure, CableData, Connection, DotRef, DraggingLine, getDotWorldPos, WorkZone } from './constants';
import { CableNode } from './components/CableNode';
import { WorkZoneDialog } from './components/WorkZoneDialog';
import { Trash2 } from 'lucide-react';

export default function App() {
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number, y: number }, end: { x: number, y: number } } | null>(null);
  const [tool, setTool] = useState<'select' | 'workzone'>('select');
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [editingWorkZone, setEditingWorkZone] = useState<WorkZone | null>(null);

  const [cables, setCables] = useState<CableData[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedDots, setSelectedDots] = useState<DotRef[]>([]);
  const [draggingLine, setDraggingLine] = useState<DraggingLine | null>(null);
  const [glowTarget, setGlowTarget] = useState<DotRef | null>(null);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggingCableId, setDraggingCableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedCount, setSelectedCount] = useState(48);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  // Pan / Selection Box logic
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Center click (1) or Right click (2) for panning
    if (e.button === 1 || e.button === 2) {
      setIsPanning(true);
      return;
    }

    // Left click logic
    if (e.button === 0) {
      if (target.closest('.cable-trunk')) return;
      if (target.closest('input')) return;
      if (target.closest('select')) return;
      if (target.closest('button')) return;
      if (target.tagName === 'circle' && target.classList.contains('cursor-pointer')) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left - pan.x) / scale;
      const y = (e.clientY - rect.top - pan.y) / scale;

      setSelectionBox({ start: { x, y }, end: { x, y } });
      
      if (tool === 'select' && !e.ctrlKey && !e.metaKey) {
        setSelectedDots([]);
      }
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - pan.x) / scale;
    const y = (e.clientY - rect.top - pan.y) / scale;
    setMousePos({ x: Math.round(x), y: Math.round(y) });

    if (isPanning) {
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }

    if (selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, end: { x, y } } : null);
      
      if (tool === 'select') {
        const xMin = Math.min(selectionBox.start.x, x);
        const xMax = Math.max(selectionBox.start.x, x);
        const yMin = Math.min(selectionBox.start.y, y);
        const yMax = Math.max(selectionBox.start.y, y);

        const newlySelected: DotRef[] = [];
        cables.forEach(cable => {
          ['left', 'right'].forEach(sideStr => {
            const side = sideStr as 'left' | 'right';
            const expandedTubes = side === 'left' ? cable.leftExp : cable.rightExp;
            if (expandedTubes.length === 0) return;

            expandedTubes.forEach(exp => {
              cable.tubes[exp].strands.forEach((_, sIdx) => {
                const ref: DotRef = { cableId: cable.id, side, tubeIdx: exp, strandIdx: sIdx };
                const pos = getDotWorldPos(cable, ref);
                if (pos.x >= xMin && pos.x <= xMax && pos.y >= yMin && pos.y <= yMax) {
                  newlySelected.push(ref);
                }
              });
            });
          });
        });
        setSelectedDots(prev => {
          if (e.ctrlKey || e.metaKey) {
            const combined = [...prev];
            newlySelected.forEach(ns => {
              if (!combined.some(c => c.cableId === ns.cableId && c.side === ns.side && c.strandIdx === ns.strandIdx)) {
                combined.push(ns);
              }
            });
            return combined;
          }
          return newlySelected;
        });
      }
    }

    if (draggingCableId) {
      const rx = (e.clientX - rect.left - pan.x) / scale - dragOffset.x;
      const ry = (e.clientY - rect.top - pan.y) / scale - dragOffset.y;
      setCables((prev) =>
        prev.map((c) => (c.id === draggingCableId ? { ...c, x: rx, y: ry } : c))
      );
    }

    if (draggingLine) {
      // Find nearest dot for magnetism and glow
      let nearestDist = Infinity;
      let nearestRef: DotRef | null = null;
      let nearestPos = { x: 0, y: 0 };

      // We only want to snap to available dots that aren't the source
      cables.forEach(cable => {
        ['left', 'right'].forEach(sideStr => {
          const side = sideStr as 'left' | 'right';
          const expandedTubes = side === 'left' ? cable.leftExp : cable.rightExp;
          if (expandedTubes.length === 0) return;

          expandedTubes.forEach(expIdx => {
            // Only check dots in the expanded tube
            cable.tubes[expIdx].strands.forEach((strand, sIdx) => {
              if (!strand) return;
              
              const ref: DotRef = { cableId: cable.id, side, tubeIdx: expIdx, strandIdx: sIdx };
              
              // Skip source dot
              if (ref.cableId === draggingLine.from.cableId && 
                  ref.side === draggingLine.from.side && 
                  ref.tubeIdx === draggingLine.from.tubeIdx && 
                  ref.strandIdx === draggingLine.from.strandIdx) return;

              const pos = getDotWorldPos(cable, ref);
              const dist = Math.sqrt((pos.x - x)**2 + (pos.y - y)**2);

              if (dist < nearestDist) {
                nearestDist = dist;
                nearestRef = ref;
                nearestPos = pos;
              }
            });
          });
        });
      });

      let finalToX = x;
      let finalToY = y;
      let intensity = 0;
      let targetRef: DotRef | null = null;

      const GLOW_DIST = 150;
      const SNAP_DIST = 60;

      if (nearestDist < GLOW_DIST) {
        targetRef = nearestRef;
        intensity = 1 - (nearestDist / GLOW_DIST);
        if (nearestDist < SNAP_DIST) {
          finalToX = nearestPos.x;
          finalToY = nearestPos.y;
          intensity = 1; // Full glow when snapped
        }
      }

      setGlowTarget(targetRef);
      setGlowIntensity(intensity);
      setDraggingLine(prev => prev ? { ...prev, toX: finalToX, toY: finalToY } : null);
    }
  }, [isPanning, draggingCableId, pan, scale, dragOffset, draggingLine, cables, selectionBox, tool]);

  const handleMouseUp = () => {
    if (draggingLine && glowTarget) {
      completePatch(glowTarget);
    }
    
    if (selectionBox && tool === 'workzone') {
      const width = Math.abs(selectionBox.end.x - selectionBox.start.x);
      const height = Math.abs(selectionBox.end.y - selectionBox.start.y);
      
      if (width > 20 && height > 20) {
        const newZone: WorkZone = {
          id: Math.random().toString(36).substr(2, 9),
          x: Math.min(selectionBox.start.x, selectionBox.end.x),
          y: Math.min(selectionBox.start.y, selectionBox.end.y),
          width,
          height,
          label: 'New Work Zone',
          description: '',
        };
        // setWorkZones(prev => [...prev, newZone]); // Delayed until confirmed in prompt
        setEditingWorkZone(newZone);
      }
    }

    setIsPanning(false);
    setDraggingCableId(null);
    setDraggingLine(null);
    setGlowTarget(null);
    setGlowIntensity(0);
    setSelectionBox(null);
  };

  // Zoom logic
  const handleWheel = (e: React.WheelEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('select')) return;
    
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ns = Math.min(4, Math.max(0.1, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    
    setPan(p => ({
      x: mx - (mx - p.x) * ns / scale,
      y: my - (my - p.y) * ns / scale,
    }));
    setScale(ns);
  };

  const zoomIn = () => {
    const ns = Math.min(4, scale * 1.2);
    setScale(ns);
  };
  const zoomOut = () => {
    const ns = Math.max(0.1, scale / 1.2);
    setScale(ns);
  };
  const resetView = () => {
    setPan({ x: window.innerWidth / 2 - 250, y: window.innerHeight / 2 - 100 });
    setScale(1);
  };

  const addCable = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - pan.x) / scale - 300 : 100;
    const cy = rect ? (rect.height / 2 - pan.y) / scale - 100 : 100;

    const newCable: CableData = {
      id,
      name: `CABLE-${cables.length + 1}`,
      fiberCount: selectedCount,
      tubes: getCableStructure(selectedCount),
      x: cx + cables.length * 20,
      y: cy + cables.length * 20,
      leftExp: [],
      rightExp: [],
    };
    setCables((prev) => [...prev, newCable]);
  };

  const handleDownload = async () => {
    if (!worldRef.current) return;
    
    const world = worldRef.current;
    
    // Add export mode class to trigger dark on white styles
    world.classList.add('export-mode');
    
    // Sync input values to DOM attributes so html-to-image captures them
    const inputs = world.querySelectorAll('input');
    inputs.forEach(input => {
      input.setAttribute('value', (input as HTMLInputElement).value);
    });
    
    try {
      // Give the browser a moment to repaint with the new class
      await new Promise(r => setTimeout(r, 300));
      
      const dataUrl = await toPng(world, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      
      const link = document.createElement('a');
      link.download = `fibersync-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      world.classList.remove('export-mode');
    }
  };

  const handleDotDoubleClick = (e: React.MouseEvent, ref: DotRef) => {
    e.stopPropagation();
    
    // 1. Remove connections attached to this dot
    setConnections(prev => prev.filter(conn => {
      const isFrom = conn.from.cableId === ref.cableId && 
                     conn.from.side === ref.side && 
                     conn.from.tubeIdx === ref.tubeIdx && 
                     conn.from.strandIdx === ref.strandIdx;
      const isTo = conn.to.cableId === ref.cableId && 
                   conn.to.side === ref.side && 
                   conn.to.tubeIdx === ref.tubeIdx && 
                   conn.to.strandIdx === ref.strandIdx;
      return !isFrom && !isTo;
    }));

    // 2. Clear selection for this dot if it was selected
    setSelectedDots(prev => prev.filter(d => 
      !(d.cableId === ref.cableId && d.tubeIdx === ref.tubeIdx && d.strandIdx === ref.strandIdx)
    ));
  };

  const updateCable = (id: string, updates: Partial<CableData>) => {
    setCables((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteCable = (id: string) => {
    setCables((prev) => prev.filter((c) => c.id !== id));
    setConnections((prev) => prev.filter(conn => conn.from.cableId !== id && conn.to.cableId !== id));
  };

  const handleCableDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const cable = cables.find(c => c.id === id);
    if (!cable) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingCableId(id);
    setDragOffset({
      x: (e.clientX - rect.left - pan.x) / scale - cable.x,
      y: (e.clientY - rect.top - pan.y) / scale - cable.y,
    });
  };

  const completePatch = (targetRef: DotRef) => {
    if (!draggingLine) return;

    // Determine the source group
    const isSourceSelected = selectedDots.some(d => 
      d.cableId === draggingLine.from.cableId && 
      d.side === draggingLine.from.side && 
      d.tubeIdx === draggingLine.from.tubeIdx && 
      d.strandIdx === draggingLine.from.strandIdx
    );

    const sources = isSourceSelected ? selectedDots : [draggingLine.from];
    
    // Sort sources to ensure sequential patching
    const sortedSources = [...sources].sort((a, b) => {
      if (a.tubeIdx !== b.tubeIdx) return a.tubeIdx - b.tubeIdx;
      return a.strandIdx - b.strandIdx;
    });

    // Find the relative offset for each source strand from the first one
    const firstSource = sortedSources[0];
    const newConns: Connection[] = [];

    sortedSources.forEach((src) => {
      // Calculate relative strand offset
      const tubeOffset = src.tubeIdx - firstSource.tubeIdx;
      const strandOffset = src.strandIdx - firstSource.strandIdx;
      
      const targetTubeIdx = targetRef.tubeIdx + tubeOffset;
      const targetStrandIdx = targetRef.strandIdx + strandOffset;

      const targetCable = cables.find(c => c.id === targetRef.cableId);
      if (!targetCable) return;

      // Check if target tube/strand exists and is NOT null
      if (targetTubeIdx >= 0 && targetTubeIdx < targetCable.tubes.length && 
          targetStrandIdx >= 0 && targetStrandIdx < 12 &&
          targetCable.tubes[targetTubeIdx].strands[targetStrandIdx] !== null) {
        
        // Avoid self-connection
        if (src.cableId === targetRef.cableId && 
            src.side === targetRef.side && 
            src.tubeIdx === targetTubeIdx && 
            src.strandIdx === targetStrandIdx) return;

        newConns.push({
          id: Math.random().toString(36).substr(2, 9),
          from: src,
          to: {
            cableId: targetRef.cableId,
            side: targetRef.side,
            tubeIdx: targetTubeIdx,
            strandIdx: targetStrandIdx
          }
        });
      }
    });

    setConnections(prev => [...prev, ...newConns]);
    if (!isSourceSelected) {
      setSelectedDots([]);
    }
  };

  const handleDotMouseDown = (e: React.MouseEvent, ref: DotRef) => {
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      setSelectedDots(prev => {
        const isSelected = prev.find(d => 
          d.cableId === ref.cableId && 
          d.side === ref.side && 
          d.tubeIdx === ref.tubeIdx && 
          d.strandIdx === ref.strandIdx
        );
        if (isSelected) {
          return prev.filter(d => d !== isSelected);
        } else {
          return [...prev, ref];
        }
      });
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - pan.x) / scale;
    const y = (e.clientY - rect.top - pan.y) / scale;

    setDraggingLine({ from: ref, toX: x, toY: y });
  };

  const handleDotMouseUp = (e: React.MouseEvent, targetRef: DotRef) => {
    if (!draggingLine) return;
    e.stopPropagation();
    completePatch(targetRef);
    setDraggingLine(null);
  };

  useEffect(() => {
    resetView();
    addCable();
  }, []);

  return (
    <div className="h-screen w-screen bg-[var(--bg)] flex flex-col overflow-hidden futuristic-grid">
      <header className="fixed top-0 left-0 right-0 h-14 bg-[rgba(10,12,18,0.8)] backdrop-blur-md border-b border-[rgba(255,255,255,0.05)] z-[100] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center">
              <Cable className="w-5 h-5 text-[#0a0c12]" />
            </div>
            <h1 className="font-bold text-lg tracking-tight glow-text whitespace-nowrap uppercase">
              FIBER<span className="text-[var(--accent)]">SYNC</span>
            </h1>
          </div>
          
          <div className="h-6 w-[1px] bg-white/10 mx-2" />

          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all text-[0.7rem] font-mono group z-[110] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            DOWNLOAD PNG
          </button>

          <div className="h-6 w-[1px] bg-white/10 mx-2" />

          <div className="flex bg-[#1a1c25] p-1 rounded-lg border border-white/5 mx-2">
            <button 
              onClick={() => setTool('select')}
              className={`px-3 py-1.5 rounded text-[0.7rem] font-mono flex items-center gap-2 transition-all ${
                tool === 'select' ? 'bg-[var(--accent)] text-[#0a0c12] font-bold shadow-[0_0_10px_rgba(0,210,255,0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              SELECT
            </button>
            <button 
              onClick={() => setTool('workzone')}
              className={`px-3 py-1.5 rounded text-[0.7rem] font-mono flex items-center gap-2 transition-all ${
                tool === 'workzone' ? 'bg-[var(--accent)] text-[#0a0c12] font-bold shadow-[0_0_10px_rgba(0,210,255,0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              WORK ZONE
            </button>
          </div>

          <div className="flex bg-[#1a1c25] p-1 rounded-lg border border-white/5 opacity-50 grayscale pointer-events-none">
            <div className="px-3 py-1.5 text-[0.7rem] font-mono flex items-center gap-2 text-white/40">
              <Move className="w-3.5 h-3.5" />
              RIGHT-DRAG TO PAN
            </div>
            <div className="px-3 py-1.5 text-[0.7rem] font-mono flex items-center gap-2 text-white/40 border-l border-white/5">
              <MousePointer2 className="w-3.5 h-3.5" />
              LEFT-CLICK TO SELECT
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap ml-4">
            <select 
              value={selectedCount}
              onChange={(e) => setSelectedCount(parseInt(e.target.value))}
              className="bg-[var(--panel2)] border border-[var(--border)] text-[var(--text)] font-sans text-[0.8rem] px-3 py-1.5 rounded cursor-pointer hover:border-[var(--accent)] transition-colors outline-none"
            >
              {[12, 24, 48, 96, 144, 432].map(count => (
                <option key={count} value={count}>{count}-Fiber</option>
              ))}
            </select>
            <button 
              onClick={addCable}
              className="flex items-center gap-2 bg-linear-to-br from-[#003a55] to-[#005f8a] border border-[var(--accent)] text-white text-[0.8rem] font-semibold tracking-wider px-3 py-1.5 rounded cursor-pointer hover:from-[#005f8a] hover:to-[#0090cc] shadow-[0_0_10px_rgba(0,200,255,0.2)] transition-all active:scale-95"
            >
              <Plus size={14} /> INSERT CABLE
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <button 
            onClick={() => { setConnections([]); }}
            className="flex items-center gap-2 border border-[#4a2a2a] text-red-400 text-[0.75rem] px-3 py-1.5 rounded cursor-pointer hover:border-red-500 hover:text-red-300 transition-colors"
          >
            CLEAR ALL PATCHES
          </button>
          <div className="font-mono text-[0.7rem] text-[var(--text-dim)] whitespace-nowrap flex gap-4">
            <span>X: {mousePos.x}</span>
            <span>Y: {mousePos.y}</span>
            <span>ZOOM: {Math.round(scale * 100)}%</span>
          </div>
        </div>
      </header>


      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-default"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div 
          ref={worldRef}
          className="absolute inset-0 origin-[0_0] will-change-transform"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {/* Selection Box overlay */}
          {selectionBox && (
            <div 
              className={`absolute border pointer-events-none z-[1000] selection-box-overlay ${
                tool === 'workzone' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[#3b82f6] bg-[#3b82f6]/10'
              }`}
              style={{
                left: Math.min(selectionBox.start.x, selectionBox.end.x),
                top: Math.min(selectionBox.start.y, selectionBox.end.y),
                width: Math.abs(selectionBox.end.x - selectionBox.start.x),
                height: Math.abs(selectionBox.end.y - selectionBox.start.y),
              }}
            />
          )}

          {/* Work Zones Layer */}
          {workZones.map(zone => (
            <div 
              key={zone.id}
              className="absolute border-2 border-dashed border-white/20 bg-white/[0.02] rounded-lg group"
              style={{
                left: zone.x,
                top: zone.y,
                width: zone.width,
                height: zone.height,
              }}
            >
              <div className="absolute -top-8 left-0 flex items-start gap-3 max-w-[400px]">
                <div className="bg-white/10 backdrop-blur-sm border border-white/10 px-2 py-1.5 rounded text-[0.7rem] font-mono text-white/90 shadow-xl flex items-start gap-2">
                  <Square size={10} className="text-[var(--accent)] mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-bold whitespace-pre-wrap break-words">{zone.label}</span>
                    {zone.description && <span className="opacity-50 text-[0.6rem] leading-relaxed break-words line-clamp-2">{zone.description}</span>}
                  </div>
                </div>
                <button 
                  onClick={() => setWorkZones(prev => prev.filter(z => z.id !== zone.id))}
                  className="w-5 h-5 bg-red-500/10 border border-red-500/20 text-red-500/40 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/20 transition-all cursor-pointer"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}

          {/* Connections Layer */}
          <svg className="absolute inset-0 pointer-events-none w-[10000px] h-[10000px] -translate-x-[5000px] -translate-y-[5000px]">
            <g transform="translate(5000, 5000)">
              {connections.map(conn => {
                const c1 = cables.find(c => c.id === conn.from.cableId);
                const c2 = cables.find(c => c.id === conn.to.cableId);
                if (!c1 || !c2) return null;

                const p1 = getDotWorldPos(c1, conn.from);
                const p2 = getDotWorldPos(c2, conn.to);
                
                const tubeColor = c1.tubes[conn.from.tubeIdx].strands[conn.from.strandIdx].color.hex;
                
                // Curved path
                const dx = Math.abs(p1.x - p2.x);
                const cp1x = p1.x + (p1.x < p2.x ? dx/2 : -dx/2);
                const cp2x = p2.x + (p1.x < p2.x ? -dx/2 : dx/2);

                return (
                  <path 
                    key={conn.id}
                    d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                    stroke={tubeColor}
                    strokeWidth="2.5"
                    fill="none"
                    strokeOpacity="0.8"
                    className="drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]"
                  />
                );
              })}

              {draggingLine && (() => {
                const isSourceSelected = selectedDots.some(d => 
                  d.cableId === draggingLine.from.cableId && 
                  d.side === draggingLine.from.side && 
                  d.tubeIdx === draggingLine.from.tubeIdx && 
                  d.strandIdx === draggingLine.from.strandIdx
                );

                const sources = isSourceSelected ? selectedDots : [draggingLine.from];
                const sortedSources = [...sources].sort((a, b) => {
                  if (a.tubeIdx !== b.tubeIdx) return a.tubeIdx - b.tubeIdx;
                  return a.strandIdx - b.strandIdx;
                });
                const firstSource = sortedSources[0];

                return sortedSources.map((src, i) => {
                  const srcCable = cables.find(c => c.id === src.cableId);
                  if (!srcCable) return null;
                  const pStart = getDotWorldPos(srcCable, src);
                  const tubeColor = srcCable.tubes[src.tubeIdx].strands[src.strandIdx].color.hex;
                  
                  // Calculate offsets relative to the primary drag target
                  const tubeOff = src.tubeIdx - firstSource.tubeIdx;
                  const strandOff = src.strandIdx - firstSource.strandIdx;
                  
                  // The offset in Y is approximately (tubeOff * STRAND_PAD_V_STUFF... + strandOff * STEP)
                  // But we can just use the target mouse pos + offset if we want parallel lines
                  // Or better: parallel lines relative to the first line's endpoint
                  const targetX = draggingLine.toX;
                  const targetY = draggingLine.toY + (tubeOff * (20 + 2 * 8 + 12 * 19)) + (strandOff * 19);
                  // Wait, that Y math is complex. Let's just use strand step for now.
                  const estimatedTargetY = draggingLine.toY + (tubeOff * (20 + 16 + 228)) + (strandOff * 19);

                  const dx = Math.abs(pStart.x - targetX);
                  const cp1x = pStart.x + (pStart.x < targetX ? dx/2 : -dx/2);
                  const cp2x = targetX + (pStart.x < targetX ? -dx/2 : dx/2);

                  return (
                    <path 
                      key={`drag-${i}`}
                      d={`M${pStart.x},${pStart.y} C${cp1x},${pStart.y} ${cp2x},${estimatedTargetY} ${targetX},${estimatedTargetY}`}
                      stroke={tubeColor}
                      strokeWidth="2"
                      strokeDasharray="5,3"
                      fill="none"
                      strokeOpacity="0.5"
                    />
                  );
                });
              })()}
            </g>
          </svg>

          {cables.map(cable => (
            <CableNode 
              key={cable.id}
              cable={cable}
              scale={scale}
              selectedDots={selectedDots}
              glowTarget={glowTarget}
              glowIntensity={glowIntensity}
              onUpdate={updateCable}
              onDelete={deleteCable}
              onDragStart={handleCableDragStart}
              onDotMouseDown={handleDotMouseDown}
              onDotMouseUp={handleDotMouseUp}
              onDotDoubleClick={handleDotDoubleClick}
            />
          ))}
        </div>

        <div className="fixed bottom-15 left-5 flex flex-col gap-1 z-[200]">
          <button onClick={zoomIn} className="w-8 h-8 bg-[var(--panel2)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] shadow-md flex items-center justify-center transition-all active:scale-90">
            <ZoomIn size={16} />
          </button>
          <button onClick={zoomOut} className="w-8 h-8 bg-[var(--panel2)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] shadow-md flex items-center justify-center transition-all active:scale-90">
            <ZoomOut size={16} />
          </button>
          <div className="font-mono text-[0.6rem] text-[var(--text-dim)] text-center mt-0.5">{Math.round(scale * 100)}%</div>
        </div>

        <div className="fixed bottom-4 right-4 bg-[rgba(10,13,18,0.92)] border border-[var(--border)] rounded-lg p-3 z-[200] backdrop-blur-md min-w-[200px] shadow-2xl">
          <h3 className="text-[0.65rem] text-[var(--text-dim)] tracking-[2px] uppercase mb-2 font-mono">TIA-598-C Color Code</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {TIA_COLORS.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[0.68rem] text-[rgba(200,220,255,0.75)] font-mono">
                <div className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0" style={{ background: c.hex }} />
                <span>{i + 1}. {c.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 pointer-events-none text-[0.7rem] text-[var(--text-dim)] font-mono tracking-widest uppercase opacity-60 z-[200] hidden md:block">
          SCROLL to zoom • RIGHT-CLICK/WHEEL to pan • LEFT-CLICK to interact • DOUBLE-CLICK fiber to DELETE connection
        </div>

        <AnimatePresence>
          {editingWorkZone && (
            <WorkZoneDialog 
              workZone={editingWorkZone}
              onSave={(updated) => {
                setWorkZones(prev => [...prev, updated]);
                setEditingWorkZone(null);
              }}
              onCancel={() => setEditingWorkZone(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

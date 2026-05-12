import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Maximize, ZoomIn, ZoomOut, MousePointer2, Move, Cable, Download, Square, Share2, Zap, BoxSelect, FileCode, Trash2, Database, ImageIcon, FileType, ChevronDown, Copy, Folder } from 'lucide-react';
import { toPng } from 'html-to-image';
import { saveAs } from 'file-saver';
import { exportToDXF } from './services/dxfService';
import { exportToPDF } from './services/pdfService';
import { exportToSVG } from './services/svgService';
import { TIA_COLORS, getCableStructure, CableData, Connection, DotRef, DraggingLine, getDotWorldPos, WorkZone, dotsEqual, findCircuitPath, NetworkEquipment, LAYOUT } from './constants';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from './services/firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp, Timestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { CableNode } from './components/CableNode';
import { NetworkNode } from './components/NetworkNode';
import { WorkZoneDialog } from './components/WorkZoneDialog';
import { CircuitTracePanel } from './components/CircuitTracePanel';
import { CircuitDatabase } from './components/CircuitDatabase';
import { Tooltip } from './components/Tooltip';
import { ProjectList } from './components/ProjectList';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [projects, setProjects] = useState<{id: string, name: string, updatedAt: any}[]>([]);
  const [showProjectList, setShowProjectList] = useState(false);

  const [tooltip, setTooltip] = useState<{ x: number, y: number, content: React.ReactNode, visible: boolean }>({
    x: 0, y: 0, content: '', visible: false
  });
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number, y: number }, end: { x: number, y: number } } | null>(null);
  const [showCircuitList, setShowCircuitList] = useState(false);
  const [tool, setTool] = useState<'select' | 'workzone' | 'analysis'>('select');
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [editingWorkZone, setEditingWorkZone] = useState<WorkZone | null>(null);

  const [cables, setCables] = useState<CableData[]>([]);
  const [networkEquipments, setNetworkEquipments] = useState<NetworkEquipment[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedDots, setSelectedDots] = useState<DotRef[]>([]);
  const [draggingLine, setDraggingLine] = useState<DraggingLine | null>(null);
  const [glowTarget, setGlowTarget] = useState<DotRef | null>(null);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggingCableId, setDraggingCableId] = useState<string | null>(null);
  const [draggingEquipId, setDraggingEquipId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [alignmentGuides, setAlignmentGuides] = useState<{ x: number | null, y: number | null }>({ x: null, y: null });
  const [selectedCount, setSelectedCount] = useState(48);
  const [selectedPortCount, setSelectedPortCount] = useState(8);
  const [equipmentType, setEquipmentType] = useState('EQUIP-xx');
  const [equipmentBuilding, setEquipmentBuilding] = useState('BUILDING-xx');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedAnalysisDots, setSelectedAnalysisDots] = useState<DotRef[]>([]);

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
      if (target.classList.contains('cursor-pointer') || target.classList.contains('fiber-hit-area')) return;

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

  const getNodeWorldPos = useCallback((ref: DotRef) => {
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
    const cable = cables.find(c => c.id === ref.cableId);
    if (!cable) return { x: 0, y: 0 };
    return getDotWorldPos(cable, ref);
  }, [cables, networkEquipments]);

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
                const pos = getNodeWorldPos(ref);
                if (pos.x >= xMin && pos.x <= xMax && pos.y >= yMin && pos.y <= yMax) {
                  newlySelected.push(ref);
                }
              });
            });
          });
        });

        networkEquipments.forEach(eq => {
          for(let i=0; i<eq.ports; i++) {
            const ref: DotRef = { equipmentId: eq.id, side: eq.side, tubeIdx: 0, strandIdx: i };
            const pos = getNodeWorldPos(ref);
            if (pos.x >= xMin && pos.x <= xMax && pos.y >= yMin && pos.y <= yMax) {
              newlySelected.push(ref);
            }
          }
        });

        setSelectedDots(prev => {
          if (e.ctrlKey || e.metaKey) {
            const combined = [...prev];
            newlySelected.forEach(ns => {
              if (!combined.some(c => dotsEqual(c, ns))) {
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
      
      // Snap to grid (20px)
      const snappedX = Math.round(rx / 20) * 20;
      const snappedY = Math.round(ry / 20) * 20;

      // Detection for alignment guides
      let guideX: number | null = null;
      let guideY: number | null = null;

      cables.forEach(c => {
        if (c.id === draggingCableId) return;
        if (Math.abs(snappedX - c.x) < 5) guideX = c.x;
        if (Math.abs(snappedY - c.y) < 5) guideY = c.y;
      });
      networkEquipments.forEach(e => {
        if (Math.abs(snappedX - e.x) < 5) guideX = e.x;
        if (Math.abs(snappedY - e.y) < 5) guideY = e.y;
      });

      setAlignmentGuides({ x: guideX, y: guideY });

      setCables((prev) =>
        prev.map((c) => (c.id === draggingCableId ? { ...c, x: guideX ?? snappedX, y: guideY ?? snappedY } : c))
      );
    }

    if (draggingEquipId) {
      const rx = (e.clientX - rect.left - pan.x) / scale - dragOffset.x;
      const ry = (e.clientY - rect.top - pan.y) / scale - dragOffset.y;
      
      // Snap to grid (20px)
      const snappedX = Math.round(rx / 20) * 20;
      const snappedY = Math.round(ry / 20) * 20;

      // Detection for alignment guides
      let guideX: number | null = null;
      let guideY: number | null = null;

      cables.forEach(c => {
        if (Math.abs(snappedX - c.x) < 5) guideX = c.x;
        if (Math.abs(snappedY - c.y) < 5) guideY = c.y;
      });
      networkEquipments.forEach(e => {
        if (e.id === draggingEquipId) return;
        if (Math.abs(snappedX - e.x) < 5) guideX = e.x;
        if (Math.abs(snappedY - e.y) < 5) guideY = e.y;
      });

      setAlignmentGuides({ x: guideX, y: guideY });

      setNetworkEquipments((prev) =>
        prev.map((e) => (e.id === draggingEquipId ? { ...e, x: guideX ?? snappedX, y: guideY ?? snappedY } : e))
      );
    }

    if (draggingLine) {
      // Find nearest dot for magnetism and glow
      let nearestDist = Infinity;
      let nearestRef: DotRef | null = null;
      let nearestPos = { x: 0, y: 0 };

      const checkDot = (ref: DotRef) => {
        // Skip source dot
        if (dotsEqual(ref, draggingLine.from)) return;

        const pos = getNodeWorldPos(ref);
        const dist = Math.sqrt((pos.x - x)**2 + (pos.y - y)**2);

        if (dist < nearestDist) {
          nearestDist = dist;
          nearestRef = ref;
          nearestPos = pos;
        }
      };

      cables.forEach(cable => {
        ['left', 'right'].forEach(sideStr => {
          const side = sideStr as 'left' | 'right';
          const expandedTubes = side === 'left' ? cable.leftExp : cable.rightExp;
          expandedTubes.forEach(expIdx => {
            cable.tubes[expIdx].strands.forEach((strand, sIdx) => {
              if (!strand) return;
              checkDot({ cableId: cable.id, side, tubeIdx: expIdx, strandIdx: sIdx });
            });
          });
        });
      });

      networkEquipments.forEach(eq => {
        for(let i=0; i<eq.ports; i++) {
          checkDot({ equipmentId: eq.id, side: eq.side, tubeIdx: 0, strandIdx: i });
        }
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
  }, [isPanning, draggingCableId, draggingEquipId, pan, scale, dragOffset, draggingLine, cables, networkEquipments, selectionBox, tool, getNodeWorldPos]);

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingLine) {
      if (glowTarget) {
        completePatch(glowTarget);
      }
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
    setDraggingEquipId(null);
    setDraggingLine(null);
    setGlowTarget(null);
    setGlowIntensity(0);
    setSelectionBox(null);
    setAlignmentGuides({ x: null, y: null });
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
    const id = Math.random().toString(36).substring(2, 11);
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - pan.x) / scale - 90 : 100;
    const cy = rect ? (rect.height / 2 - pan.y) / scale - 150 : 100;

    const newCable: CableData = {
      id,
      name: `CABLE-${cables.length + 1}`,
      fiberCount: selectedCount,
      tubes: getCableStructure(selectedCount),
      x: Math.round(cx),
      y: Math.round(cy),
      leftExp: [],
      rightExp: [],
    };
    setCables((prev) => [...prev, newCable]);
  };

  const addNetworkEquipment = () => {
    const id = Math.random().toString(36).substring(2, 11);
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - pan.x) / scale - 120 : 100;
    const cy = rect ? (rect.height / 2 - pan.y) / scale - 100 : 100;

    const newEquip: NetworkEquipment = {
      id,
      name: equipmentType,
      building: equipmentBuilding,
      ports: selectedPortCount,
      x: Math.round(cx),
      y: Math.round(cy),
      side: 'right',
    };
    setNetworkEquipments((prev) => [...prev, newEquip]);
  };

  const handleDXFExport = () => {
    try {
      const dxf = exportToDXF(cables, networkEquipments, connections, workZones);
      const blob = new Blob([dxf], { type: 'application/dxf' });
      saveAs(blob, `fibersync_export_${new Date().toISOString().slice(0,10)}.dxf`);
    } catch (error) {
      console.error('DXF Export failed:', error);
    }
  };

  const handleSVGExport = () => {
    try {
      const svg = exportToSVG(cables, networkEquipments, connections, workZones);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      saveAs(blob, `fibersync_export_${new Date().toISOString().slice(0,10)}.svg`);
    } catch (error) {
      console.error('SVG Export failed:', error);
    }
  };

  const handlePDFExport = () => {
    try {
      exportToPDF(cables, networkEquipments, connections, workZones);
    } catch (error) {
      console.error('PDF Export failed:', error);
    }
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
    setConnections(prev => prev.filter(conn => !dotsEqual(conn.from, ref) && !dotsEqual(conn.to, ref)));

    // 2. Clear selection for this dot if it was selected
    setSelectedDots(prev => prev.filter(d => !dotsEqual(d, ref)));
  };

  const updateCable = (id: string, updates: Partial<CableData>) => {
    setCables((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const updateEquipment = (id: string, updates: Partial<NetworkEquipment>) => {
    setNetworkEquipments((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const deleteCable = (id: string) => {
    setCables((prev) => prev.filter((c) => c.id !== id));
    setConnections((prev) => prev.filter(conn => conn.from.cableId !== id && conn.to.cableId !== id));
  };

  const deleteEquipment = (id: string) => {
    setNetworkEquipments((prev) => prev.filter((e) => e.id !== id));
    setConnections((prev) => prev.filter(conn => conn.from.equipmentId !== id && conn.to.equipmentId !== id));
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

  const handleEquipDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const equip = networkEquipments.find(eq => eq.id === id);
    if (!equip) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingEquipId(id);
    setDragOffset({
      x: (e.clientX - rect.left - pan.x) / scale - equip.x,
      y: (e.clientY - rect.top - pan.y) / scale - equip.y,
    });
  };

  const completePatch = (targetRef: DotRef) => {
    if (!draggingLine) return;

    // Determine the source group
    const isSourceSelected = selectedDots.some(d => dotsEqual(d, draggingLine.from));

    const sources = isSourceSelected ? selectedDots : [draggingLine.from];
    
    // Sort sources to ensure sequential patching
    const sortedSources = [...sources].sort((a, b) => {
      if (a.equipmentId || b.equipmentId) return 0; // Don't sort equipment groups for now
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

      if (targetRef.equipmentId) {
        const targetEquip = networkEquipments.find(e => e.id === targetRef.equipmentId);
        if (!targetEquip) return;
        
        if (targetStrandIdx >= 0 && targetStrandIdx < targetEquip.ports) {
          if (dotsEqual(src, { ...targetRef, strandIdx: targetStrandIdx })) return;
          newConns.push({
            id: Math.random().toString(36).substr(2, 9),
            from: src,
            to: { ...targetRef, strandIdx: targetStrandIdx }
          });
        }
        return;
      }

      const targetCable = cables.find(c => c.id === targetRef.cableId);
      if (!targetCable) return;

      // Check if target tube/strand exists and is NOT null
      if (targetTubeIdx >= 0 && targetTubeIdx < targetCable.tubes.length && 
          targetStrandIdx >= 0 && targetStrandIdx < 12 &&
          targetCable.tubes[targetTubeIdx].strands[targetStrandIdx] !== null) {
        
        // Avoid self-connection
        if (dotsEqual(src, {
            ...targetRef,
            tubeIdx: targetTubeIdx,
            strandIdx: targetStrandIdx
          })) return;

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
    setTooltip(t => ({ ...t, visible: false }));

    if (tool === 'analysis') {
      return; 
    }

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

  const handleDotHover = (e: React.MouseEvent, ref: DotRef, isEnter: boolean) => {
    if (!isEnter) {
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    let content: React.ReactNode;
    if (ref.equipmentId) {
      const eq = networkEquipments.find(e => e.id === ref.equipmentId);
      content = (
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-col -gap-0.5">
            <span className="text-[var(--accent)] font-bold text-xs uppercase leading-tight">{eq?.name}</span>
            <span className="text-white/40 text-[0.55rem] font-mono uppercase tracking-tighter">{eq?.building}</span>
          </div>
          <span className="text-white/50 text-[0.6rem] font-mono mt-1 border-t border-white/5 pt-1">PORT {ref.strandIdx + 1}</span>
        </div>
      );
    } else {
      const cable = cables.find(c => c.id === ref.cableId);
      const tube = cable?.tubes[ref.tubeIdx];
      const strand = tube?.strands[ref.strandIdx];
      content = (
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--accent)] font-bold text-xs uppercase">{cable?.name}</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tube?.color.hex }} />
            <span className="text-white/70 text-[0.65rem] font-mono">TUBE {ref.tubeIdx + 1} ({tube?.color.abb})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: strand?.color.hex }} />
            <span className="text-white/70 text-[0.65rem] font-mono">FIBER {ref.strandIdx + 1} ({strand?.color.abb})</span>
          </div>
        </div>
      );
    }

    setTooltip({
      x: e.clientX,
      y: e.clientY,
      content,
      visible: true
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Load the last updated project for this user
        loadLastProject(u.uid);
      } else {
        // Reset state on logout if needed
        setActiveProjectId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadLastProject = async (uid: string) => {
    try {
      const q = query(collection(db, 'projects'), where('ownerId', '==', uid));
      const snapshot = await getDocs(q);
      const projectList = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'Untitled',
        updatedAt: doc.data().updatedAt
      }));
      setProjects(projectList);
      
      if (!snapshot.empty) {
        const latest = snapshot.docs.sort((a, b) => {
          const tA = (a.data().updatedAt as Timestamp)?.toMillis() || 0;
          const tB = (b.data().updatedAt as Timestamp)?.toMillis() || 0;
          return tB - tA;
        })[0];
        
        loadProjectData(latest.id, latest.data());
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    }
  };

  const loadProjectData = (id: string, data: any) => {
    setActiveProjectId(id);
    setProjectName(data.name || 'Untitled Project');
    setCables(data.cables || []);
    setNetworkEquipments(data.networkEquipments || []);
    setConnections(data.connections || []);
    setWorkZones(data.workZones || []);
  };

  const saveToCloud = async (forceNew = false) => {
    if (!user) {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        console.error('Login failed', err);
        return;
      }
      return;
    }

    setIsSaving(true);
    try {
      const isNew = forceNew || !activeProjectId;
      const projectId = isNew ? Math.random().toString(36).substr(2, 9) : activeProjectId!;
      const projectRef = doc(db, 'projects', projectId);
      
      const payload: any = {
        name: projectName,
        ownerId: user.uid,
        cables,
        networkEquipments,
        connections,
        workZones,
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        payload.createdAt = serverTimestamp();
        await setDoc(projectRef, payload);
        setActiveProjectId(projectId);
      } else {
        await updateDoc(projectRef, payload);
      }

      // Refresh project list
      const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
      const snapshot = await getDocs(q);
      setProjects(snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'Untitled',
        updatedAt: doc.data().updatedAt
      })));

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `projects/${activeProjectId}`);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    resetView();
  }, []);

  return (
    <div className={`h-screen w-screen relative flex flex-col overflow-hidden transition-colors duration-500 ${tool === 'analysis' ? 'bg-[#0a2fd1]' : 'bg-[var(--bg)]'} futuristic-grid`}>
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#0a0c12]/95 backdrop-blur-3xl border-b border-white/5 z-[100] flex items-center px-4 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-linear-to-br from-[#00d2ff] to-[#0088ff] rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(0,210,255,0.2)]">
            <Cable className="w-6 h-6 text-[#0a0c12] stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <input 
              type="text" 
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="text-white font-black tracking-tight text-sm leading-tight bg-transparent border-b border-transparent hover:border-white/20 focus:border-[var(--accent)] outline-none transition-all w-40"
              spellCheck={false}
            />
            <span className="text-[0.45rem] font-mono text-white/30 tracking-[4px] uppercase mt-0.5">FIBER HUB v2.0</span>
          </div>
        </div>
        
        <div className="h-10 w-[2px] bg-white/10 shrink-0 mx-2" />

        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={() => setShowProjectList(true)}
            className="p-2 py-1.5 hover:bg-white/5 rounded-lg text-white/50 hover:text-white transition-all flex items-center gap-2 border border-transparent hover:border-white/10"
            title="Open Project"
          >
            <Folder size={16} className="text-[var(--accent)]" />
            <span className="text-[0.55rem] font-bold hidden md:inline uppercase tracking-widest">Open</span>
          </button>
          <button 
            onClick={() => saveToCloud(true)}
            className="p-2 py-1.5 hover:bg-white/5 rounded-lg text-white/50 hover:text-white transition-all flex items-center gap-2 border border-transparent hover:border-white/10"
            title="Save As"
          >
            <Copy size={16} />
            <span className="text-[0.55rem] font-bold hidden md:inline uppercase tracking-widest">Save As</span>
          </button>
        </div>

        <div className="h-6 w-[1px] bg-white/10 shrink-0 mx-2" />

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 py-1">
          {/* Main Controls */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 shrink-0">
            {[
              { id: 'select', icon: MousePointer2, label: 'SELECT' },
              { id: 'analysis', icon: Share2, label: 'TRACE' },
              { id: 'workzone', icon: Square, label: 'ZONE' },
            ].map(t => (
              <button 
                key={t.id}
                onClick={() => setTool(t.id as any)}
                className={`px-4 py-2 rounded-lg text-[0.6rem] font-bold tracking-widest uppercase flex items-center gap-2 transition-all ${
                  tool === t.id 
                    ? 'bg-[var(--accent)] text-[#0a0c12] shadow-[0_0_15px_rgba(0,210,255,0.4)] scale-105 z-10' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <button 
            onClick={() => setShowCircuitList(!showCircuitList)}
            className={`px-4 py-2 rounded-xl text-[0.6rem] font-bold tracking-widest uppercase flex items-center gap-2 transition-all shrink-0 ${
              showCircuitList 
                ? 'bg-[var(--accent)] text-[#0a0c12]' 
                : 'bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">DATABASE</span>
          </button>

          <div className="h-6 w-[1px] bg-white/5 shrink-0" />

          {/* Create Objects */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center bg-white/10 rounded-xl border border-white/20 overflow-hidden shadow-2xl">
              <div className="px-3 py-1.5 bg-black/40 border-r border-white/10 relative group/sel">
                <select 
                  value={selectedCount}
                  onChange={(e) => setSelectedCount(parseInt(e.target.value))}
                  className="bg-transparent text-[rgba(0,210,255,1)] font-mono text-[0.7rem] outline-none cursor-pointer appearance-none text-center min-w-[4.5rem] font-black pr-4"
                >
                  {[12, 24, 48, 96, 144, 432].map(count => (
                    <option key={count} value={count} className="bg-[#0a0c12] text-white">{count}F</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--accent)] pointer-events-none opacity-50" />
              </div>
              <button 
                onClick={addCable}
                className="flex items-center gap-2 bg-[var(--accent)] text-[#0a0c12] text-[0.65rem] font-black px-5 py-2.5 transition-all hover:brightness-110 active:scale-95 whitespace-nowrap"
              >
                <Plus size={14} className="stroke-[3]" /> CABLE
              </button>
            </div>

            <div className="flex items-center bg-white/10 rounded-xl border border-white/20 overflow-hidden shadow-2xl">
              <div className="flex flex-col border-r border-white/10 bg-black/40">
                <div className="flex items-center gap-1.5 px-2 py-0.5 border-b border-white/5">
                  <span className="text-[0.45rem] font-bold text-white/30 uppercase">Type:</span>
                  <input 
                    type="text"
                    value={equipmentType}
                    onChange={(e) => setEquipmentType(e.target.value)}
                    className="bg-transparent text-white font-mono text-[0.6rem] outline-none w-20 px-1"
                  />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5">
                  <span className="text-[0.45rem] font-bold text-white/30 uppercase">Bldg:</span>
                  <input 
                    type="text"
                    value={equipmentBuilding}
                    onChange={(e) => setEquipmentBuilding(e.target.value)}
                    className="bg-transparent text-white font-mono text-[0.6rem] outline-none w-20 px-1"
                  />
                </div>
              </div>
              <div className="px-3 py-1.5 bg-black/40 border-r border-white/10 relative group/port self-stretch flex items-center">
                <select 
                  value={selectedPortCount}
                  onChange={(e) => setSelectedPortCount(parseInt(e.target.value))}
                  className="bg-transparent text-[#a78bfa] font-mono text-[0.7rem] outline-none cursor-pointer appearance-none text-center min-w-[3.5rem] font-black pr-4"
                >
                  {[1, 2, 4, 6, 8, 12, 16, 24, 48, 96].map(count => (
                    <option key={count} value={count} className="bg-[#0a0c12] text-white">{count}P</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a78bfa] pointer-events-none opacity-50" />
              </div>
              <button 
                onClick={addNetworkEquipment}
                className="flex items-center gap-2 bg-[#8b5cf6] text-white text-[0.65rem] font-black px-5 py-2.5 transition-all hover:bg-[#9d72f9] active:scale-95 whitespace-nowrap self-stretch"
              >
                <Plus size={14} className="stroke-[3]" /> EQUIP
              </button>
            </div>
          </div>
        </div>

        {/* Export Group */}
        <div className="flex items-center gap-2 ml-auto shrink-0 pr-2">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button 
              title={user ? (isSaving ? "Saving..." : "Save Status") : "Login to Save"}
              onClick={() => saveToCloud(false)}
              disabled={isSaving}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                user 
                  ? 'text-[var(--accent)] hover:bg-[var(--accent)]/10' 
                  : 'text-white/40 hover:text-white hover:bg-white/10'
              }`}
            >
              <Zap size={18} className={isSaving ? 'animate-spin' : ''} />
              {user && <span className="text-[0.6rem] font-bold hidden lg:inline">{isSaving ? 'SAVING...' : 'SAVE'}</span>}
            </button>
            <div className="w-[1px] h-4 bg-white/10 mx-1 self-center" />
            <button 
              title="Export Image"
              onClick={handleDownload}
              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
            >
              <ImageIcon size={18} />
            </button>
            <button 
              title="Export SVG (Vector/Visio)"
              onClick={handleSVGExport}
              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all border-l border-white/5"
            >
              <BoxSelect size={18} />
            </button>
            <button 
              title="Export DXF (AutoCAD)"
              onClick={handleDXFExport}
              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all border-l border-white/5"
            >
              <FileCode size={18} />
            </button>
            <button 
              title="Export PDF"
              onClick={handlePDFExport}
              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all border-l border-white/5"
            >
              <FileType size={18} />
            </button>
          </div>
          
          <button 
            onClick={() => { if(confirm("Erase all schematic data?")) { setConnections([]); setCables([]); setNetworkEquipments([]); setWorkZones([]); } }}
            className="p-3 hover:bg-red-500/10 rounded-xl text-red-500/40 hover:text-red-500 transition-all ml-2"
            title="Wipe Project"
          >
            <Trash2 size={18} />
          </button>
        {/* User Info / Auth */}
        <div className="flex items-center gap-3 pl-2 ml-2 border-l border-white/5">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end hidden md:flex">
                <span className="text-[0.6rem] font-bold text-white leading-none">{user.displayName}</span>
                <button 
                  onClick={() => signOut(auth)}
                  className="text-[0.5rem] font-mono text-white/30 hover:text-[var(--accent)] transition-all uppercase tracking-widest"
                >
                  SIGNOUT
                </button>
              </div>
              <img 
                src={user.photoURL || ''} 
                className="w-8 h-8 rounded-lg border border-white/10" 
                referrerPolicy="no-referrer"
                alt="user"
              />
            </div>
          ) : (
            <button 
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[0.6rem] font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest"
            >
              SIGN IN
            </button>
          )}
        </div>
      </div>
    </header>


      <Tooltip {...tooltip} />

      <ProjectList 
        isOpen={showProjectList}
        onClose={() => setShowProjectList(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={async (id) => {
          const docRef = doc(db, 'projects', id);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            loadProjectData(id, snap.data());
          }
          setShowProjectList(false);
        }}
        onDelete={async (id) => {
          try {
            await deleteDoc(doc(db, 'projects', id));
            setProjects(prev => prev.filter(p => p.id !== id));
            if (activeProjectId === id) {
              setActiveProjectId(null);
              setProjectName('Untitled Project');
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
          }
        }}
      />

      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${
          tool === 'select' 
            ? 'cursor-crosshair' 
            : tool === 'trace' 
            ? 'cursor-pointer' 
            : 'cursor-cell'
        }`}
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
          {tool === 'analysis' && (
            <div className="absolute inset-0 pointer-events-none bg-blue-500/5 animate-pulse" />
          )}

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

          {/* Alignment Guides */}
          <svg className="absolute inset-0 pointer-events-none overflow-visible z-[10]">
            {alignmentGuides.x !== null && (
              <line 
                x1={alignmentGuides.x} y1="-10000" 
                x2={alignmentGuides.x} y2="10000" 
                stroke="rgba(0, 210, 255, 0.4)" 
                strokeWidth="1" 
                strokeDasharray="4 4" 
              />
            )}
            {alignmentGuides.y !== null && (
              <line 
                x1="-10000" y1={alignmentGuides.y} 
                x2="10000" y2={alignmentGuides.y} 
                stroke="rgba(0, 210, 255, 0.4)" 
                strokeWidth="1" 
                strokeDasharray="4 4" 
              />
            )}
          </svg>

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
          <svg className="absolute inset-0 w-[10000px] h-[10000px] -translate-x-[5000px] -translate-y-[5000px] pointer-events-none">
            <g transform="translate(5000, 5000)" className="pointer-events-auto">
              {connections.map(conn => {
                const p1 = getNodeWorldPos(conn.from);
                const p2 = getNodeWorldPos(conn.to);
                
                let tubeColor = '#3b82f6';
                if (conn.from.cableId) {
                  const c1 = cables.find(c => c.id === conn.from.cableId);
                  if (c1) tubeColor = c1.tubes[conn.from.tubeIdx].strands[conn.from.strandIdx].color.hex;
                } else if (conn.to.cableId) {
                  const c2 = cables.find(c => c.id === conn.to.cableId);
                  if (c2) tubeColor = c2.tubes[conn.to.tubeIdx].strands[conn.to.strandIdx].color.hex;
                }
                
                // Curved path
                const dx = Math.abs(p1.x - p2.x);
                const cp1x = p1.x + (p1.x < p2.x ? dx/2 : -dx/2);
                const cp2x = p2.x + (p1.x < p2.x ? -dx/2 : dx/2);

                const isInspected = selectedAnalysisDots.some(dot => 
                  dotsEqual(dot, conn.from) || 
                  dotsEqual(dot, conn.to) || 
                  findCircuitPath(dot, connections).some(p => p.id === conn.id)
                );

                return (
                  <g 
                    key={conn.id} 
                    className={`group ${tool === 'analysis' ? 'cursor-help' : 'cursor-pointer'}`} 
                    onClick={(e) => {
                      if (tool === 'analysis') {
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedAnalysisDots(prev => {
                            if (prev.some(d => dotsEqual(d, conn.from))) {
                              return prev.filter(d => !dotsEqual(d, conn.from));
                            }
                            return [...prev, conn.from];
                          });
                        } else {
                          setSelectedAnalysisDots([conn.from]);
                        }
                      }
                    }}
                  >
                    {/* Hit area */}
                    <path 
                      d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                      stroke="transparent"
                      strokeWidth="15"
                      fill="none"
                      className="pointer-events-auto"
                    />
                    <path 
                      d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                      stroke={tubeColor}
                      strokeWidth={isInspected ? "4" : "2.5"}
                      fill="none"
                      strokeOpacity={isInspected ? "1" : "0.8"}
                      className="drop-shadow-[0_0_5px_rgba(255,255,255,0.2)] transition-all"
                    />
                    {conn.circuitName && (
                      <g className="pointer-events-none">
                        <text
                          x={(p1.x + p2.x) / 2}
                          y={(p1.y + p2.y) / 2 - 11}
                          textAnchor="middle"
                          className="fill-[#ff0000] text-[7px] font-mono font-black tracking-wider uppercase"
                        >
                          {conn.circuitName.length > 20 ? conn.circuitName.substring(0, 17) + '...' : conn.circuitName}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {selectedAnalysisDots.length > 0 && (() => {
                const allPaths = selectedAnalysisDots.flatMap(dot => findCircuitPath(dot, connections));
                return cables.map(cable => {
                  return cable.tubes.flatMap((tube, ti) => 
                    tube.strands.map((strand, si) => {
                      if (!strand) return null;
                      const dLeft: DotRef = { cableId: cable.id, side: 'left', tubeIdx: ti, strandIdx: si };
                      const dRight: DotRef = { cableId: cable.id, side: 'right', tubeIdx: ti, strandIdx: si };
                      
                      const isPart = selectedAnalysisDots.some(dot => dotsEqual(dot, dLeft) || dotsEqual(dot, dRight)) ||
                                    allPaths.some(c => dotsEqual(c.from, dLeft) || dotsEqual(c.to, dLeft) ||
                                                        dotsEqual(c.from, dRight) || dotsEqual(c.to, dRight));
                      
                      if (!isPart) return null;

                      const p1 = getDotWorldPos(cable, dLeft);
                      const p2 = getDotWorldPos(cable, dRight);
                      
                      return (
                        <line 
                          key={`trace-internal-${cable.id}-${ti}-${si}`}
                          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                          stroke="#ff3b3b"
                          strokeWidth="3.5"
                          strokeDasharray="12,6"
                          className="drop-shadow-[0_0_15px_rgba(255,59,59,0.5)] opacity-80"
                        >
                          <animate 
                            attributeName="stroke-dashoffset" 
                            from="100" to="0" 
                            dur="5s" 
                            repeatCount="indefinite" 
                          />
                        </line>
                      );
                    })
                  );
                });
              })()}



              {draggingLine && (() => {
                const isSourceSelected = selectedDots.some(d => dotsEqual(d, draggingLine.from));

                const sources = isSourceSelected ? selectedDots : [draggingLine.from];
                const sortedSources = [...sources].sort((a, b) => {
                  if (a.equipmentId || b.equipmentId) return 0;
                  if (a.tubeIdx !== b.tubeIdx) return a.tubeIdx - b.tubeIdx;
                  return a.strandIdx - b.strandIdx;
                });
                const firstSource = sortedSources[0];

                return sortedSources.map((src, i) => {
                  const pStart = getNodeWorldPos(src);
                  let tubeColor = '#3b82f6';
                  if (src.cableId) {
                    const srcCable = cables.find(c => c.id === src.cableId);
                    if (srcCable) tubeColor = srcCable.tubes[src.tubeIdx].strands[src.strandIdx].color.hex;
                  }
                  
                  // Calculate offsets relative to the primary drag target
                  const tubeOff = (src.tubeIdx || 0) - (firstSource.tubeIdx || 0);
                  const strandOff = src.strandIdx - firstSource.strandIdx;
                  
                  const targetX = draggingLine.toX;
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
              selectedAnalysisDots={selectedAnalysisDots}
              glowTarget={glowTarget}
              glowIntensity={glowIntensity}
              onUpdate={updateCable}
              onDelete={deleteCable}
              onDragStart={handleCableDragStart}
              onDotMouseDown={handleDotMouseDown}
              onDotMouseUp={handleDotMouseUp}
              onDotDoubleClick={handleDotDoubleClick}
              onDotHover={handleDotHover}
              onDotClick={(e, ref) => {
                if (tool === 'analysis') {
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedAnalysisDots(prev => {
                      if (prev.some(d => dotsEqual(d, ref))) {
                        return prev.filter(d => !dotsEqual(d, ref));
                      }
                      return [...prev, ref];
                    });
                  } else {
                    setSelectedAnalysisDots([ref]);
                  }
                }
              }}
            />
          ))}

          {networkEquipments.map(eq => (
            <NetworkNode
              key={eq.id}
              equipment={eq}
              connections={connections}
              scale={scale}
              selectedDots={selectedDots}
              glowTarget={glowTarget}
              glowIntensity={glowIntensity}
              onUpdate={updateEquipment}
              onDelete={deleteEquipment}
              onDragStart={handleEquipDragStart}
              onDotMouseDown={handleDotMouseDown}
              onDotMouseUp={handleDotMouseUp}
              onDotDoubleClick={handleDotDoubleClick}
              onDotHover={handleDotHover}
              onUpdateCircuitName={(paths, name) => {
                const pathIds = new Set(paths.map(p => p.id));
                setConnections(prev => prev.map(c => 
                  pathIds.has(c.id) ? { ...c, circuitName: name } : c
                ));
              }}
            />
          ))}
        </div>

        <div className="fixed bottom-15 left-5 flex flex-col gap-1 z-[200]">
          <div className="bg-[var(--panel2)] border border-[var(--border)] rounded px-2 py-1 mb-1 shadow-md">
             <div className="font-mono text-[0.55rem] text-[var(--text-dim)] flex flex-col gap-0.5">
               <span>X: {mousePos.x}</span>
               <span>Y: {mousePos.y}</span>
             </div>
          </div>
          <button onClick={zoomIn} className="w-8 h-8 bg-[var(--panel2)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] shadow-md flex items-center justify-center transition-all active:scale-90">
            <ZoomIn size={16} />
          </button>
          <button onClick={zoomOut} className="w-8 h-8 bg-[var(--panel2)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] shadow-md flex items-center justify-center transition-all active:scale-90">
            <ZoomOut size={16} />
          </button>
          <div className="font-mono text-[0.6rem] text-[var(--text-dim)] text-center mt-0.5">{Math.round(scale * 100)}%</div>
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

        <AnimatePresence>
          {showCircuitList && (
            <CircuitDatabase 
              connections={connections}
              cables={cables}
              networkEquipments={networkEquipments}
              workZones={workZones}
              onClose={() => setShowCircuitList(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedAnalysisDots.length > 0 && (
            <CircuitTracePanel 
              startDots={selectedAnalysisDots}
              connections={connections}
              cables={cables}
              networkEquipments={networkEquipments}
              workZones={workZones}
              onUpdateCircuitName={(paths, name) => {
                const pathIds = new Set(paths.map(p => p.id));
                setConnections(prev => prev.map(c => 
                  pathIds.has(c.id) ? { ...c, circuitName: name } : c
                ));
              }}
              onClose={() => setSelectedAnalysisDots([])}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

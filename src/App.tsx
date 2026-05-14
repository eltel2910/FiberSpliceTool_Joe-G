import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Maximize, MousePointer2, Move, Cable, Download, Square, Share2, Zap, BoxSelect, FileCode, Trash2, Database, ImageIcon, FileType, ChevronDown, Copy, Folder, Layers, Settings, Printer, Server } from 'lucide-react';
import { toPng, toJpeg } from 'html-to-image';
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
  const [tool, setTool] = useState<'select' | 'workzone' | 'analysis' | 'bulk-delete' | 'vfl'>('select');
  const [bulkSelectedConnectionIds, setBulkSelectedConnectionIds] = useState<string[]>([]);
  const [vflCircuit, setVflCircuit] = useState<Connection[]>([]);
  const [openMenu, setOpenMenu] = useState<'cable' | 'equip' | null>(null);
  const menuTimeoutRef = useRef<number | null>(null);

  const handleMenuEnter = (m: 'cable' | 'equip') => {
    if (menuTimeoutRef.current) window.clearTimeout(menuTimeoutRef.current);
    setOpenMenu(m);
  };

  const handleMenuLeave = () => {
    menuTimeoutRef.current = window.setTimeout(() => {
      setOpenMenu(null);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (menuTimeoutRef.current) window.clearTimeout(menuTimeoutRef.current);
    };
  }, []);

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
  const [selectedAnalysisDots, setSelectedAnalysisDots] = useState<DotRef[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  const initialSelectedDotsRef = useRef<DotRef[]>([]);
  const initialSelectedAnalysisDotsRef = useRef<DotRef[]>([]);

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
      if (target.closest('.bulk-delete-fiber')) return;

      const isLasso = tool === 'select' || tool === 'workzone' || tool === 'bulk-delete' || tool === 'vfl' || (tool === 'analysis' && e.ctrlKey);
      
      if (isLasso) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = (e.clientX - rect.left - pan.x) / scale;
        const y = (e.clientY - rect.top - pan.y) / scale;

        setSelectionBox({ start: { x, y }, end: { x, y } });
        
        if (tool === 'bulk-delete') {
          if (!e.ctrlKey && !e.metaKey) {
            setBulkSelectedConnectionIds([]);
          }
        } else if (e.ctrlKey || e.metaKey) {
          initialSelectedDotsRef.current = [...selectedDots];
          initialSelectedAnalysisDotsRef.current = [...selectedAnalysisDots];
        } else {
          initialSelectedDotsRef.current = [];
          initialSelectedAnalysisDotsRef.current = [];
          setSelectedDots([]);
          setSelectedAnalysisDots([]);
        }
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
      const svgW = LAYOUT.FAN_GAP + 20;
      const dotX = eq.side === 'left' 
        ? eq.x + 10 
        : eq.x + LAYOUT.EQUIP_WIDTH + LAYOUT.FAN_GAP;
      return { x: dotX, y: portY };
    }
    const cable = cables.find(c => c.id === ref.cableId);
    if (!cable) return { x: 0, y: 0 };
    return getDotWorldPos(cable, ref, connections);
  }, [cables, networkEquipments, connections]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - pan.x) / scale;
    const y = (e.clientY - rect.top - pan.y) / scale;

    if (isPanning) {
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }

    if (selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, end: { x, y } } : null);
      
      if (tool === 'select' || tool === 'bulk-delete' || tool === 'vfl' || (tool === 'analysis' && e.ctrlKey)) {
        const xMin = Math.min(selectionBox.start.x, x);
        const xMax = Math.max(selectionBox.start.x, x);
        const yMin = Math.min(selectionBox.start.y, y);
        const yMax = Math.max(selectionBox.start.y, y);

        if (tool === 'bulk-delete') {
          const newlySelected: string[] = [];
          connections.forEach(conn => {
            const p1 = getNodeWorldPos(conn.from);
            const p2 = getNodeWorldPos(conn.to);
            // Simple check: if either end is in box, or center is in box
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;
            
            const isP1In = p1.x >= xMin && p1.x <= xMax && p1.y >= yMin && p1.y <= yMax;
            const isP2In = p2.x >= xMin && p2.x <= xMax && p2.y >= yMin && p2.y <= yMax;
            const isCenterIn = cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax;

            if (isP1In || isP2In || isCenterIn) {
              newlySelected.push(conn.id);
            }
          });

          setBulkSelectedConnectionIds(prev => {
            const base = (e.ctrlKey || e.metaKey) ? prev : [];
            const combined = [...base];
            newlySelected.forEach(id => {
              if (!combined.includes(id)) combined.push(id);
            });
            return combined;
          });
          return;
        }

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

        if (tool === 'analysis') {
          const base = (e.ctrlKey || e.metaKey) ? initialSelectedAnalysisDotsRef.current : [];
          const combined = [...base];
          newlySelected.forEach(ns => {
            if (!combined.some(c => dotsEqual(c, ns))) {
              combined.push(ns);
            }
          });
          
          setSelectedAnalysisDots(prev => {
            if (prev.length === combined.length && prev.every(p => combined.some(c => dotsEqual(p, c)))) return prev;
            return combined;
          });
        } else {
          const base = (e.ctrlKey || e.metaKey) ? initialSelectedDotsRef.current : [];
          const combined = [...base];
          newlySelected.forEach(ns => {
            if (!combined.some(c => dotsEqual(c, ns))) {
              combined.push(ns);
            }
          });
          
          setSelectedDots(prev => {
            if (prev.length === combined.length && prev.every(p => combined.some(c => dotsEqual(p, c)))) return prev;
            return combined;
          });
        }
      }
    }

    if (draggingCableId || draggingEquipId) {
      const draggingId = draggingCableId || draggingEquipId;
      const rx = (e.clientX - rect.left - pan.x) / scale - dragOffset.x;
      const ry = (e.clientY - rect.top - pan.y) / scale - dragOffset.y;
      
      const snappedX = Math.round(rx / 20) * 20;
      const snappedY = Math.round(ry / 20) * 20;

      let guideX: number | null = null;
      let guideY: number | null = null;

      const getWidth = (obj: any) => {
        if ('fiberCount' in obj) {
          const lW = obj.leftExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY;
          const rW = obj.rightExp.length > 0 ? LAYOUT.BO_EXPANDED : LAYOUT.BO_TUBE_ONLY;
          return lW + 164 + rW;
        }
        return 300; // NetworkNode approx
      };

      const getHeight = (obj: any) => {
        if ('fiberCount' in obj) {
          const baseH = LAYOUT.TUBE_PAD * 2 + obj.tubes.length * LAYOUT.TUBE_H;
          const expandedCount = Math.max(obj.leftExp.length, obj.rightExp.length);
          const expH = expandedCount * (LAYOUT.STRAND_PAD_V * 2 + 12 * LAYOUT.STRAND_STEP);
          return Math.max(140, baseH + expH);
        }
        return 50 + obj.ports * 30 + 20; // NetworkNode totalHeight
      };

      const draggingObj = cables.find(c => c.id === draggingId) || networkEquipments.find(ne => ne.id === draggingId);
      if (draggingObj) {
        const dW = getWidth(draggingObj);
        const dH = getHeight(draggingObj);
        const OPTIMAL_SPACING = 100;

        const others = [
          ...cables.filter(c => c.id !== draggingId),
          ...networkEquipments.filter(e => e.id !== draggingId)
        ];

        others.forEach(other => {
          const oW = getWidth(other);
          const oH = getHeight(other);

          // Edge alignment (current behavior)
          if (Math.abs(snappedX - other.x) < 10) guideX = other.x;
          if (Math.abs(snappedY - other.y) < 10) guideY = other.y;
          
          // Spacing alignment X
          // 1. Dragging right of other
          if (Math.abs(snappedX - (other.x + oW + OPTIMAL_SPACING)) < 15) {
            guideX = other.x + oW + OPTIMAL_SPACING;
          }
          // 2. Dragging left of other
          if (Math.abs((snappedX + dW) - (other.x - OPTIMAL_SPACING)) < 15) {
            guideX = other.x - OPTIMAL_SPACING - dW;
          }

          // Spacing alignment Y
          // 1. Dragging below other
          if (Math.abs(snappedY - (other.y + oH + OPTIMAL_SPACING)) < 15) {
            guideY = other.y + oH + OPTIMAL_SPACING;
          }
          // 2. Dragging above other
          if (Math.abs((snappedY + dH) - (other.y - OPTIMAL_SPACING)) < 15) {
            guideY = other.y - OPTIMAL_SPACING - dH;
          }
        });
      }

      setAlignmentGuides(prev => {
        if (prev.x === guideX && prev.y === guideY) return prev;
        return { x: guideX, y: guideY };
      });

      if (draggingCableId) {
        setCables(prev => prev.map(c => c.id === draggingCableId ? { ...c, x: guideX ?? snappedX, y: guideY ?? snappedY } : c));
      } else {
        setNetworkEquipments(prev => prev.map(e => e.id === draggingEquipId ? { ...e, x: guideX ?? snappedX, y: guideY ?? snappedY } : e));
      }
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
      setDraggingLine(prev => {
        if (!prev) return null;
        if (prev.toX === finalToX && prev.toY === finalToY) return prev;
        return { ...prev, toX: finalToX, toY: finalToY };
      });
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

  const handleJPEGExport = async () => {
    if (!worldRef.current) return;
    
    const world = worldRef.current;
    
    // Add export mode class to trigger dark on white styles
    world.classList.add('export-mode');
    
    // Sync input/textarea values to DOM attributes so html-to-image captures them
    const inputs = world.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      if (input.tagName.toLowerCase() === 'textarea') {
        input.textContent = (input as HTMLTextAreaElement).value;
      } else {
        input.setAttribute('value', (input as HTMLInputElement).value);
      }
    });
    
    try {
      // Give the browser a moment to repaint with the new class
      await new Promise(r => setTimeout(r, 400));
      
      const dataUrl = await toJpeg(world, {
        backgroundColor: '#ffffff',
        pixelRatio: 4, // High resolution
        quality: 1.0,
      });
      
      const link = document.createElement('a');
      link.download = `fibersync-highres-${new Date().getTime()}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('JPEG Export failed:', err);
    } finally {
      world.classList.remove('export-mode');
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Clear confirm state if selection changes or tool changes
  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [bulkSelectedConnectionIds.length, tool]);

  const handleExecuteBulkDelete = () => {
    const idsToRemove = new Set(bulkSelectedConnectionIds);
    setConnections(prev => prev.filter(c => !idsToRemove.has(c.id)));
    setBulkSelectedConnectionIds([]);
    setShowDeleteConfirm(false);
  };

  const handleDownload = async () => {
    if (!worldRef.current) return;
    
    const world = worldRef.current;
    
    // Add export mode class to trigger dark on white styles
    world.classList.add('export-mode');
    
    // Sync input/textarea values to DOM attributes so html-to-image captures them
    const inputs = world.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      if (input.tagName.toLowerCase() === 'textarea') {
        input.textContent = (input as HTMLTextAreaElement).value;
      } else {
        input.setAttribute('value', (input as HTMLInputElement).value);
      }
    });
    
    try {
      // Give the browser a moment to repaint with the new class
      await new Promise(r => setTimeout(r, 300));
      
      const dataUrl = await toPng(world, {
        backgroundColor: '#ffffff',
        pixelRatio: 3, // Increased from 2 for better detail
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
    document.title = 'Fiber Splice Tool Pro';
    resetView();
  }, []);

  return (
    <div className={`h-screen w-screen relative flex flex-col overflow-hidden transition-colors duration-500 ${tool === 'analysis' ? 'bg-[#0a2fd1]' : 'bg-[var(--bg)]'} futuristic-grid`}>
      {/* PROFESSIONAL DUAL-AXIS UI */}
      
      {/* 1. Header (Primary Metadata & Global Actions) */}
      <header className="fixed top-0 left-0 right-0 z-[100] flex flex-col shadow-2xl">
        {/* Row 1: Workspace Identity & Sync */}
        <div className="h-14 bg-[#0a0c12]/98 backdrop-blur-3xl border-b border-white/5 flex items-center px-6 justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-linear-to-br from-[#00d2ff] to-[#0088ff] rounded-xl flex items-center justify-center shadow-[0_0_25px_rgba(0,210,255,0.3)]">
                <Cable className="w-5 h-5 text-[#0a0c12] stroke-[2.5]" />
              </div>
              <div className="flex flex-col">
                <span className="text-[0.45rem] font-black text-[var(--accent)] tracking-[4px] uppercase leading-none mb-1">FIBER SPLICE TOOL PRO</span>
                <input 
                  type="text" 
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="project-input w-64 text-sm"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="h-8 w-px bg-white/5 mx-2" />

            <div className="flex items-center gap-1 group">
              <button onClick={() => setShowProjectList(true)} className="icon-btn-refined px-3" title="Open Project">
                <Folder size={15} className="text-[var(--accent)]" />
                <span className="text-[0.55rem] font-bold uppercase tracking-[2px] hidden lg:inline">Workspaces</span>
              </button>
              <button onClick={() => saveToCloud(true)} className="icon-btn-refined px-3" title="Save As New">
                <Copy size={14} />
                <span className="text-[0.55rem] font-bold uppercase tracking-[2px] hidden lg:inline text-white/40 group-hover:text-white transition-colors">Duplicate</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-4 border-r border-white/5 pr-4 leading-tight">
              <div className="flex items-center gap-1.5 font-bold tracking-wider">
                <span className="text-[0.95rem] text-white/50">Created By:</span>
                <a 
                  href="https://www.linkedin.com/in/georgegodby/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[0.95rem] text-white/80 hover:text-[var(--accent)] transition-colors"
                >
                  Joe Godby - <span className="underline decoration-white/20">linkedin.com/in/georgegodby/</span>
                </a>
              </div>
              <a 
                href="https://buymeacoffee.com/broadbandengineering" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-[0.8rem] font-bold text-[var(--accent)] hover:brightness-125 transition-all mt-1"
              >
                Please Help Support: <span className="underline opacity-80 italic tracking-wide">https://buymeacoffee.com/broadbandengineering</span>
              </a>
            </div>

            <div className={`flex items-center gap-2.5 px-4 py-1.5 rounded-full border transition-all ${isSaving ? 'bg-orange-500/10 border-orange-500/30' : 'bg-green-500/5 border-green-500/20'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isSaving ? 'bg-orange-500 animate-pulse' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'}`} />
              <span className="text-[0.55rem] font-mono text-white/50 uppercase tracking-widest font-bold">
                {isSaving ? 'Relaying to Cloud...' : 'Encrypted & Synced'}
              </span>
            </div>

            <div className="h-6 w-px bg-white/5 mx-1" />

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-[0.6rem] font-bold text-white tracking-tight leading-none">{user.displayName}</span>
                  <button onClick={() => signOut(auth)} className="text-[0.45rem] font-mono text-white/20 hover:text-red-400 transition-colors uppercase tracking-[2px]">Log Out</button>
                </div>
                <img src={user.photoURL || ''} referrerPolicy="no-referrer" className="w-8 h-8 rounded-xl border border-white/10 shadow-lg" alt="P" />
              </div>
            ) : (
              <button 
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="bg-[var(--accent)] text-[#0a0c12] px-5 py-2 rounded-xl text-[0.65rem] font-black uppercase tracking-[2px] hover:brightness-110 transition-all active:scale-95"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Secondary Features & Export Suite */}
        <div className="h-12 bg-[#0d1017]/96 backdrop-blur-3xl border-b border-white/5 flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="ribbon-group">
              <button 
                onClick={() => setShowCircuitList(!showCircuitList)}
                className={`flex items-center gap-2.5 px-4 py-1.5 rounded-lg transition-all ${showCircuitList ? 'bg-[var(--accent)] text-[#0a0c12] font-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
              >
                <Database size={14} className={showCircuitList ? 'text-[#0a0c12]' : 'text-[var(--accent)]'} />
                <span className="text-[0.55rem] font-bold uppercase tracking-[2px]">Circuit Database</span>
              </button>
            </div>
            
            <div className="h-4 w-px bg-white/10" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[0.5rem] font-mono text-white/20 uppercase tracking-[3px] mr-2">Export Protocol</span>
            <div className="ribbon-group">
              <button onClick={handleDownload} className="export-btn" title="Download PNG (3x Resolution)"><ImageIcon size={14} /></button>
              <button onClick={handleJPEGExport} className="export-btn border-l border-white/5" title="High Res JPEG (Ultra Quality)"><FileType size={14} className="text-orange-400" /></button>
              <button onClick={handleSVGExport} className="export-btn border-l border-white/5" title="Vector (Visio/CAD)"><BoxSelect size={14} /></button>
              <button onClick={handleDXFExport} className="export-btn border-l border-white/5" title="Engineering DXF"><FileCode size={14} /></button>
              <button onClick={handlePDFExport} className="export-btn border-l border-white/5" title="Inspection PDF"><Printer size={14} /></button>
            </div>
            <button 
              onClick={() => { if(confirm("Permanently wipe current workspace?")) { setConnections([]); setCables([]); setNetworkEquipments([]); setWorkZones([]); } }}
              className="p-2 hover:bg-red-500/10 rounded-lg text-red-500/30 hover:text-red-500 transition-all ml-4"
              title="Wipe Current View"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Side Toolbar (Interaction & Creation) */}
      <aside className="fixed left-0 top-[104px] bottom-0 w-20 bg-[#0a0c12]/98 backdrop-blur-3xl border-r border-white/5 z-[100] flex flex-col items-center py-8 gap-10">
        <div className="flex flex-col items-center gap-4">
          {[
            { id: 'select', icon: MousePointer2, label: 'Selection' },
            { id: 'analysis', icon: Share2, label: 'Circuit Naming Tool' },
            { id: 'vfl', icon: Zap, label: 'VFL Laser' },
            { id: 'workzone', icon: Square, label: 'Zone Boundary' },
            { id: 'bulk-delete', icon: Trash2, label: 'Bulk Delete' },
          ].map(t => (
            <div key={t.id} className="relative group">
              <button 
                onClick={() => {
                  setTool(t.id as any);
                  if (t.id !== 'bulk-delete') {
                    setBulkSelectedConnectionIds([]);
                  }
                  if (t.id !== 'vfl') {
                    setVflCircuit([]);
                  }
                }}
                className={`sidebar-tool-btn ${tool === t.id ? 'active' : ''} ${t.id === 'bulk-delete' ? 'hover:bg-red-500/20 text-red-400' : ''} ${t.id === 'vfl' ? 'hover:bg-red-500/20 text-red-500' : ''}`}
              >
                <t.icon size={19} />
                <div className="sidebar-label">{t.label} Tool</div>
              </button>
            </div>
          ))}
        </div>

        <div className="w-10 h-px bg-white/5" />

        <div className="flex flex-col items-center gap-5">
          
          {/* Cable Entry Menu */}
          <div 
            className="relative"
            onMouseEnter={() => handleMenuEnter('cable')}
            onMouseLeave={handleMenuLeave}
          >
            <button 
              onClick={() => { addCable(); setOpenMenu(null); }}
              className="w-12 h-12 bg-[var(--accent)] text-[#0a0c12] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,210,255,0.4)] hover:scale-105 active:scale-95 transition-all z-20"
            >
              <Plus size={22} className="stroke-[3]" />
              <div className="sidebar-label text-white">Assemble Cable Trunk</div>
            </button>
            
            <AnimatePresence>
              {openMenu === 'cable' && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute left-[64px] top-0 z-[200] pl-4"
                >
                  <div className="bg-[#0f121a]/95 backdrop-blur-2xl border border-white/10 p-4 rounded-2xl shadow-3xl flex flex-col gap-3 min-w-[220px]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-[0.45rem] font-black text-white/40 uppercase tracking-[3px]">Trunk Density</span>
                      <span className="text-[0.55rem] font-black text-[var(--accent)] font-mono">{selectedCount}F</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[12, 24, 48, 96, 144, 432].map(count => (
                        <button 
                          key={count} 
                          onClick={(e) => { e.stopPropagation(); setSelectedCount(count); }}
                          className={`py-2 rounded-xl text-[0.65rem] font-mono border transition-all ${selectedCount === count ? 'bg-[var(--accent)] text-[#0a0c12] border-[var(--accent)] font-black' : 'bg-white/5 border-white/10 text-white/30 hover:text-white hover:bg-white/10'}`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div 
            className="relative"
            onMouseEnter={() => handleMenuEnter('equip')}
            onMouseLeave={handleMenuLeave}
          >
            <button 
              onClick={() => { addNetworkEquipment(); setOpenMenu(null); }}
              className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95 transition-all z-20"
            >
              <Server size={22} />
              <div className="sidebar-label">Install Hardware Node</div>
            </button>
            <AnimatePresence>
              {openMenu === 'equip' && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute left-[64px] top-[-80px] z-[200] pl-4"
                >
                  <div className="bg-[#0f121a]/95 backdrop-blur-2xl border border-white/10 p-5 rounded-3xl shadow-3xl flex flex-col gap-4 min-w-[240px]">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[0.4rem] uppercase font-black text-white/20 tracking-widest ml-1">Rack Capacity</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[2, 4, 8, 12, 16, 24, 48, 96].map(count => (
                            <button 
                              key={count} 
                              onClick={(e) => { e.stopPropagation(); setSelectedPortCount(count); }}
                              className={`py-2 rounded-xl text-[0.6rem] font-mono border transition-all ${selectedPortCount === count ? 'bg-indigo-500 text-white border-indigo-400 font-bold' : 'bg-white/5 border-white/10 text-white/30'}`}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-[0.4rem] uppercase font-black text-white/20 tracking-widest ml-1">Asset Information</label>
                        <input 
                          type="text"
                          value={equipmentType}
                          onChange={(e) => setEquipmentType(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[0.65rem] text-white outline-none focus:border-indigo-400 font-mono transition-all placeholder:text-white/10"
                          placeholder="Interface Type..."
                        />
                        <input 
                          type="text"
                          value={equipmentBuilding}
                          onChange={(e) => setEquipmentBuilding(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[0.65rem] text-white outline-none focus:border-indigo-400 font-mono transition-all placeholder:text-white/10"
                          placeholder="Building Code..."
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-auto pb-8 flex flex-col items-center gap-2">
           <button 
             onClick={() => resetView()}
             className="sidebar-tool-btn"
             title="Recenter"
           >
             <Maximize size={20} />
             <div className="sidebar-label">Relens View</div>
           </button>
           <span className="text-[0.55rem] font-mono text-white/20 select-none">{Math.round(scale * 100)}%</span>
        </div>
      </aside>

      {/* 3. Main Design Canvas (View Container) */}
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
        className={`flex-1 relative overflow-hidden transition-all duration-300 mt-[104px] ml-20 ${
          tool === 'select' 
            ? 'cursor-crosshair' 
            : tool === 'analysis' || tool === 'vfl'
            ? 'cursor-pointer' 
            : tool === 'bulk-delete'
            ? 'cursor-default'
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

          {tool === 'bulk-delete' && (
            <div className="absolute inset-0 pointer-events-none bg-pink-500/10 animate-pulse duration-[3000ms]" />
          )}

          {/* Selection Box overlay */}
          {selectionBox && (
            <div 
              className={`absolute border pointer-events-none z-[1000] selection-box-overlay ${
                tool === 'workzone' 
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10' 
                  : tool === 'analysis' 
                  ? 'border-[#a3ff00] bg-[#a3ff00]/10'
                  : 'border-[#3b82f6] bg-[#3b82f6]/10'
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
                stroke="#f59e0b" 
                strokeWidth="2" 
                strokeDasharray="4 4" 
                style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.8))' }}
              />
            )}
            {alignmentGuides.y !== null && (
              <line 
                x1="-10000" y1={alignmentGuides.y} 
                x2="10000" y2={alignmentGuides.y} 
                stroke="#f59e0b" 
                strokeWidth="2" 
                strokeDasharray="4 4" 
                style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.8))' }}
              />
            )}
          </svg>

          {/* Work Zones Layer */}
          {workZones.map(zone => (
            <div 
              key={zone.id}
              className="absolute border-2 border-dashed border-white/20 bg-white/[0.02] rounded-lg group pointer-events-none"
              style={{
                left: zone.x,
                top: zone.y,
                width: zone.width,
                height: zone.height,
              }}
            >
              <div className="absolute -top-8 left-0 flex items-start gap-3 max-w-[400px] pointer-events-auto">
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
          <svg className="absolute inset-0 pointer-events-none overflow-visible z-30">
            <g className="pointer-events-none">
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

                const isBulkSelected = bulkSelectedConnectionIds.includes(conn.id);
                const isVflActive = vflCircuit.some(c => c.id === conn.id);

                return (
                  <g 
                    key={conn.id} 
                    className={`group ${tool === 'analysis' || tool === 'vfl' ? 'cursor-help' : tool === 'bulk-delete' ? 'cursor-pointer pointer-events-auto bulk-delete-fiber' : 'cursor-pointer'}`} 
                    onClick={(e) => {
                      if (tool === 'bulk-delete') {
                        e.stopPropagation();
                        setBulkSelectedConnectionIds(prev => 
                          prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id]
                        );
                        return;
                      }
                      if (tool === 'vfl') {
                        e.stopPropagation();
                        const path = findCircuitPath(conn.from, connections);
                        setVflCircuit(path);
                        return;
                      }
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
                    <path 
                      d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                      stroke="transparent"
                      strokeWidth="15"
                      fill="none"
                      className={(tool === 'analysis' || tool === 'bulk-delete' || tool === 'vfl') ? 'pointer-events-auto' : 'pointer-events-none'}
                    />
                    {isInspected && (
                      <path 
                        d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                        stroke="#a3ff00"
                        strokeWidth="6"
                        fill="none"
                        className="opacity-50 blur-[2px]"
                      />
                    )}
                    <path 
                      d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                      stroke={isBulkSelected ? "#ff3b3b" : (isInspected ? "#a3ff00" : tubeColor)}
                      strokeWidth={isBulkSelected ? "5" : (isInspected ? "4" : "2.5")}
                      fill="none"
                      strokeOpacity={(isInspected || isBulkSelected) ? "1" : "0.8"}
                      className={`drop-shadow-[0_0_5px_rgba(255,255,255,0.2)] transition-all ${isInspected ? 'animate-pulse' : ''} ${isBulkSelected ? 'drop-shadow-[0_0_8px_rgba(255,59,59,0.8)]' : ''}`}
                    />
                    {isVflActive && (
                      <>
                        <motion.path 
                          d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                          stroke="#32ff00"
                          strokeWidth="8"
                          fill="none"
                          strokeOpacity="0.4"
                          className="blur-[6px] pointer-events-none"
                        />
                        <motion.path 
                          d={`M${p1.x},${p1.y} C${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`}
                          stroke="#32ff00"
                          strokeWidth="4"
                          fill="none"
                          strokeDasharray="15 25"
                          animate={{ 
                            strokeDashoffset: [0, -80],
                            opacity: [0.7, 1, 0.7]
                          }}
                          transition={{ 
                            strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: "linear" },
                            opacity: { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
                          }}
                          className="drop-shadow-[0_0_15px_#32ff00] drop-shadow-[0_0_5px_#fff] z-50 pointer-events-none"
                        />
                      </>
                    )}
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

                      const p1 = getDotWorldPos(cable, dLeft, connections);
                      const p2 = getDotWorldPos(cable, dRight, connections);
                      
                      return (
                        <line 
                          key={`trace-internal-${cable.id}-${ti}-${si}`}
                          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                          stroke="#a3ff00"
                          strokeWidth="4"
                          className="drop-shadow-[0_0_15px_rgba(163,255,0,0.6)] opacity-90"
                        />
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
              connections={connections}
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
                } else if (tool === 'vfl') {
                  const path = findCircuitPath(ref, connections);
                  setVflCircuit(path);
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
                } else if (tool === 'vfl') {
                  const path = findCircuitPath(ref, connections);
                  setVflCircuit(path);
                }
              }}
              onUpdateCircuitName={(paths, name) => {
                const pathIds = new Set(paths.map(p => p.id));
                setConnections(prev => prev.map(c => 
                  pathIds.has(c.id) ? { ...c, circuitName: name } : c
                ));
              }}
            />
          ))}
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

        <AnimatePresence>
          {tool === 'bulk-delete' && bulkSelectedConnectionIds.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-6 bg-[#1a0a0c]/95 backdrop-blur-2xl border border-red-500/30 px-6 py-4 rounded-3xl shadow-[0_20px_50px_rgba(239,68,68,0.2)]"
            >
              <div className="flex flex-col">
                <span className="text-red-400 font-black text-xs uppercase tracking-[3px] leading-none mb-1">Bulk Deletion Mode</span>
                <span className="text-white/60 text-[0.6rem] font-mono uppercase tracking-[1px]">{bulkSelectedConnectionIds.length} FIBERS MARKED FOR TERMINATION</span>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div className="flex items-center gap-3">
                <button 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showDeleteConfirm) {
                      setShowDeleteConfirm(false);
                    } else {
                      setBulkSelectedConnectionIds([]);
                    }
                  }}
                  className="px-4 py-2 text-[0.6rem] font-black text-white/40 hover:text-white uppercase tracking-[2px] transition-colors pointer-events-auto"
                >
                  {showDeleteConfirm ? 'Cancel' : 'Clear'}
                </button>
                <button 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showDeleteConfirm) {
                      handleExecuteBulkDelete();
                    } else {
                      setShowDeleteConfirm(true);
                    }
                  }}
                  className={`${showDeleteConfirm ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-500 hover:bg-red-600'} text-white px-6 py-2.5 rounded-xl text-[0.65rem] font-black uppercase tracking-[2px] shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] transition-all flex items-center gap-2 pointer-events-auto`}
                >
                  <Trash2 size={14} />
                  {showDeleteConfirm ? 'CONFIRM PERMANENT DELETE' : 'Execute Deletion'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FolderOpen, Clock, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface ProjectListProps {
  isOpen: boolean;
  onClose: () => void;
  projects: {id: string, name: string, updatedAt: any}[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  activeProjectId: string | null;
}

export const ProjectList: React.FC<ProjectListProps> = ({ 
  isOpen, 
  onClose, 
  projects, 
  onSelect, 
  onDelete,
  activeProjectId 
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen size={18} className="text-[var(--accent)]" />
              <h2 className="text-white font-bold tracking-tight">Saved Projects</h2>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {projects.length === 0 ? (
              <div className="py-12 text-center text-white/20 italic text-sm">
                No projects saved yet
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {projects.map((p) => (
                  <div 
                    key={p.id}
                    className={`group flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                      activeProjectId === p.id 
                        ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/20' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                    onClick={() => onSelect(p.id)}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-white font-medium truncate">{p.name}</span>
                      <div className="flex items-center gap-1 text-white/30 text-[0.65rem] font-mono uppercase">
                        <Clock size={10} />
                        {p.updatedAt?.toDate?.()?.toLocaleString() || 'Just now'}
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this project?')) onDelete(p.id);
                      }}
                      className="p-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-black/20 border-t border-white/10 flex justify-end gap-2">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-white/40 hover:text-white text-xs font-bold transition-all"
            >
              CANCEL
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WorkZone } from '../constants';
import { X, Save, Info } from 'lucide-react';

interface Props {
  workZone: WorkZone;
  onSave: (updated: WorkZone) => void;
  onCancel: () => void;
}

export const WorkZoneDialog: React.FC<Props> = ({ workZone, onSave, onCancel }) => {
  const [label, setLabel] = useState(workZone.label);
  const [description, setDescription] = useState(workZone.description);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-[#12151c] border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <h2 className="text-sm font-bold tracking-wider text-white uppercase font-mono">Create Work Zone</h2>
          </div>
          <button onClick={onCancel} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[0.65rem] uppercase font-mono text-white/40 tracking-widest pl-1">Workzone Label Name</label>
            <input 
              autoFocus
              type="text" 
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              placeholder="e.g. PRIMARY HUB CABINET (MAX 100 CHARS)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-white/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[0.65rem] uppercase font-mono text-white/40 tracking-widest pl-1 flex items-center gap-1">
              <Info size={10} /> Additional Information
            </label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Enter site details, enclosure type, or notes..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-white/20 resize-none"
            />
          </div>
        </div>

        <div className="p-4 bg-white/[0.02] border-t border-white/5 flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 text-xs font-mono hover:bg-white/5 transition-all"
          >
            CANCEL
          </button>
          <button 
            onClick={() => onSave({ ...workZone, label, description })}
            className="flex-1 py-2 rounded-lg bg-[var(--accent)] text-[#0a0c12] text-xs font-bold font-mono hover:brightness-110 shadow-[0_0_20px_rgba(0,210,255,0.2)] transition-all flex items-center justify-center gap-2"
          >
            <Save size={14} /> SAVE ZONE
          </button>
        </div>
      </motion.div>
    </div>
  );
};

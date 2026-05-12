import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TooltipProps {
  x: number;
  y: number;
  content: string | React.ReactNode;
  visible: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ x, y, content, visible }) => {
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 5 }}
          className="fixed z-[9999] pointer-events-none"
          style={{ 
            left: position.x + 15, 
            top: position.y + 15 
          }}
        >
          <div className="bg-[#0a0c12]/90 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl px-3 py-2 flex flex-col gap-1 min-w-[120px]">
             {content}
             <div className="absolute top-2 -left-1.5 w-3 h-3 bg-[#0a0c12] border-l border-t border-white/20 rotate-45" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

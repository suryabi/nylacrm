import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Users, TrendingUp } from 'lucide-react';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    
    const timer = setTimeout(() => {
      navigate(user ? '/home' : '/login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate, user, loading]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      data-testid="splash-screen"
    >
      {/* Gradient Background */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
        }}
      />
      
      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Ambient glow */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
        animate={{ opacity: [0.15, 0.25, 0.15], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Logo and Text */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 text-center"
      >
        <motion.div
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="flex flex-col items-center"
        >
          {/* Icon cluster */}
          <motion.div 
            className="relative mb-8"
            animate={{ 
              boxShadow: [
                '0 0 40px rgba(59,130,246,0.15)',
                '0 0 60px rgba(59,130,246,0.25)',
                '0 0 40px rgba(59,130,246,0.15)',
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-2xl">
              <BarChart3 size={44} className="text-white" strokeWidth={1.5} />
            </div>
            <motion.div 
              className="absolute -top-3 -right-3 w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, type: "spring" }}
            >
              <TrendingUp size={18} className="text-white" />
            </motion.div>
            <motion.div 
              className="absolute -bottom-2 -left-3 w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: "spring" }}
            >
              <Users size={16} className="text-white" />
            </motion.div>
          </motion.div>

          <motion.h1
            className="text-3xl font-bold text-white tracking-tight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Sales CRM
          </motion.h1>
          <motion.p 
            className="text-sm text-slate-400 mt-2 font-medium tracking-wide" 
            data-testid="splash-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            Manage. Track. Grow.
          </motion.p>
          
          {/* Loading indicator */}
          <motion.div
            className="mt-10 flex gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 bg-blue-400/60 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

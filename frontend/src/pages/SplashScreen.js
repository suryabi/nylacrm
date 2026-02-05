import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';
const MOUNTAIN_BG = 'https://images.unsplash.com/photo-1761589951732-2795cd6ecdbf?crop=entropy&cs=srgb&fm=jpg&q=85';

export default function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/login');
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      data-testid="splash-screen"
    >
      {/* Misty Green Mountains Background */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${MOUNTAIN_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      {/* Overlay for better logo visibility */}
      <div className="absolute inset-0 bg-black/20" />
      
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
          {/* Circular Logo */}
          <div className="h-40 w-40 rounded-full bg-white p-2 shadow-2xl mb-6 overflow-hidden">
            <img src={NYLA_LOGO} alt="Nyla Air Water" className="w-full h-full object-cover rounded-full" />
          </div>
          <p className="text-2xl text-white font-light drop-shadow-lg" data-testid="splash-subtitle">
            Sales CRM
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

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
      {/* Animated Gradient Background - Deep forest greens */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #0d3320 0%, #1a4a35 25%, #0f3d2a 50%, #143d2d 75%, #0a2818 100%)',
        }}
      />
      
      {/* Animated mountain silhouettes */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Far mountains - slowest */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[60%]"
          initial={{ x: 0 }}
          animate={{ x: [0, -20, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: `
              linear-gradient(180deg, transparent 0%, rgba(10, 40, 24, 0.3) 100%),
              url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320'%3E%3Cpath fill='%23143d2d' d='M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z'%3E%3C/path%3E%3C/svg%3E")
            `,
            backgroundSize: 'cover',
            backgroundPosition: 'bottom',
          }}
        />
        
        {/* Mid mountains */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[45%]"
          initial={{ x: 0 }}
          animate={{ x: [0, 15, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320'%3E%3Cpath fill='%230f3d2a' d='M0,256L60,240C120,224,240,192,360,186.7C480,181,600,203,720,224C840,245,960,267,1080,261.3C1200,256,1320,224,1380,208L1440,192L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundSize: 'cover',
            backgroundPosition: 'bottom',
          }}
        />
        
        {/* Near mountains */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[30%]"
          initial={{ x: 0 }}
          animate={{ x: [0, -10, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320'%3E%3Cpath fill='%230a2818' d='M0,288L80,272C160,256,320,224,480,224C640,224,800,256,960,261.3C1120,267,1280,245,1360,234.7L1440,224L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundSize: 'cover',
            backgroundPosition: 'bottom',
          }}
        />
      </div>

      {/* Animated Fog Layers */}
      {/* Fog Layer 1 - Slowest, most transparent */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 20%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 80%, transparent 100%)',
          filter: 'blur(40px)',
        }}
      />
      
      {/* Fog Layer 2 - Medium speed */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ x: '100%' }}
        animate={{ x: '-100%' }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(200,230,210,0.05) 30%, rgba(200,230,210,0.12) 50%, rgba(200,230,210,0.05) 70%, transparent 100%)',
          filter: 'blur(50px)',
        }}
      />
      
      {/* Fog Layer 3 - Faster, denser */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ x: '-50%' }}
        animate={{ x: '150%' }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(180,210,190,0.04) 25%, rgba(180,210,190,0.1) 50%, rgba(180,210,190,0.04) 75%, transparent 100%)',
          filter: 'blur(60px)',
        }}
      />
      
      {/* Fog Layer 4 - Bottom mist */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none"
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: 'linear-gradient(to top, rgba(200,220,210,0.25) 0%, rgba(200,220,210,0.1) 50%, transparent 100%)',
          filter: 'blur(20px)',
        }}
      />
      
      {/* Fog Layer 5 - Floating mist patches */}
      <motion.div
        className="absolute top-[20%] left-0 right-0 h-[30%] pointer-events-none"
        initial={{ x: '50%', opacity: 0.2 }}
        animate={{ x: '-50%', opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(220,240,230,0.15) 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />
      
      {/* Subtle particle/dust effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 1px, transparent 1px),
                           radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 1px, transparent 1px),
                           radial-gradient(circle at 40% 40%, rgba(255,255,255,0.08) 1px, transparent 1px),
                           radial-gradient(circle at 60% 60%, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: '100px 100px, 150px 150px, 80px 80px, 120px 120px',
          animation: 'drift 30s linear infinite',
        }}
      />
      
      {/* Ambient light glow */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-[50%] pointer-events-none"
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(150,200,170,0.15) 0%, transparent 60%)',
        }}
      />

      {/* Vignette overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,20,10,0.4) 100%)',
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
          {/* Circular Logo with glow */}
          <motion.div 
            className="h-40 w-40 rounded-full bg-white p-2 shadow-2xl mb-6 overflow-hidden"
            animate={{ 
              boxShadow: [
                '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 30px rgba(150, 200, 170, 0.2)',
                '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 50px rgba(150, 200, 170, 0.3)',
                '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 30px rgba(150, 200, 170, 0.2)',
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <img src={NYLA_LOGO} alt="Nyla Air Water" className="w-full h-full object-cover rounded-full" />
          </motion.div>
          <motion.p 
            className="text-2xl text-white font-light drop-shadow-lg" 
            data-testid="splash-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            Sales CRM
          </motion.p>
          
          {/* Loading indicator */}
          <motion.div
            className="mt-8 flex gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-white/60 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
      
      {/* CSS Animation for particles */}
      <style>{`
        @keyframes drift {
          0% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(10px) translateY(-10px); }
          100% { transform: translateX(0) translateY(0); }
        }
      `}</style>
    </div>
  );
}

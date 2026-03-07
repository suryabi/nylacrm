import React, { useState, useEffect } from 'react';
import { Trophy, Sparkles, Star } from 'lucide-react';

/**
 * CelebrationAnimation Component
 * 
 * A premium, elegant celebration effect that triggers when a lead is marked as Won
 * or converted to Active Customer.
 * 
 * Features:
 * - CSS-based confetti burst animation
 * - Success badge with customizable message
 * - Lightweight and performant
 * - Works on desktop and mobile
 * - Non-blocking UI interaction
 */

const CelebrationAnimation = ({ 
  show, 
  onComplete, 
  type = 'won', // 'won' or 'customer'
  leadName = '' 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [particles, setParticles] = useState([]);

  // Brand-aligned celebration colors
  const celebrationColors = [
    '#10B981', // Emerald (primary brand color)
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#F59E0B', // Amber/Gold
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
  ];

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      
      // Generate particles for confetti effect
      const newParticles = [];
      const particleCount = 50;
      
      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100, // Start position (%)
          delay: Math.random() * 0.5, // Stagger the burst
          duration: 2 + Math.random() * 2, // 2-4 seconds
          color: celebrationColors[Math.floor(Math.random() * celebrationColors.length)],
          size: 6 + Math.random() * 8, // 6-14px
          rotation: Math.random() * 360,
          type: Math.random() > 0.5 ? 'circle' : 'rect', // Mix shapes
        });
      }
      setParticles(newParticles);

      // Clean up after animation completes
      const timer = setTimeout(() => {
        setIsVisible(false);
        setParticles([]);
        if (onComplete) onComplete();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!isVisible) return null;

  const getMessage = () => {
    if (type === 'customer') {
      return {
        title: 'Customer Activated!',
        subtitle: leadName ? `${leadName} is now an active customer` : 'Lead converted successfully',
        icon: Sparkles,
      };
    }
    return {
      title: 'Lead Won!',
      subtitle: leadName ? `Congratulations on winning ${leadName}` : 'Great job closing this deal',
      icon: Trophy,
    };
  };

  const message = getMessage();
  const IconComponent = message.icon;

  return (
    <>
      {/* Inline styles for keyframes */}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-20px) rotate(0deg) scale(1);
            opacity: 1;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg) scale(0.5);
            opacity: 0;
          }
        }
        
        @keyframes confetti-sway {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(30px);
          }
          75% {
            transform: translateX(-30px);
          }
        }
        
        @keyframes badge-pop {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.1);
          }
          70% {
            transform: translate(-50%, -50%) scale(0.95);
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
        }
        
        @keyframes badge-exit {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0;
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        
        @keyframes star-burst {
          0% {
            transform: scale(0) rotate(0deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.2) rotate(180deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(360deg);
            opacity: 0;
          }
        }
        
        .confetti-particle {
          position: absolute;
          top: -20px;
          pointer-events: none;
          animation: confetti-fall linear forwards;
        }
        
        .confetti-sway {
          animation: confetti-sway ease-in-out infinite;
          animation-duration: 0.8s;
        }
        
        .celebration-badge {
          animation: badge-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .celebration-badge.exit {
          animation: badge-exit 0.4s ease-out forwards;
        }
        
        .shimmer-effect {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.3) 50%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 2s linear infinite;
        }
        
        .star-particle {
          animation: star-burst 1.5s ease-out forwards;
        }
      `}</style>

      {/* Overlay container */}
      <div 
        className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
        data-testid="celebration-overlay"
      >
        {/* Confetti particles */}
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="confetti-particle"
            style={{
              left: `${particle.x}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
            }}
          >
            <div 
              className="confetti-sway"
              style={{
                animationDelay: `${particle.delay}s`,
              }}
            >
              {particle.type === 'circle' ? (
                <div
                  style={{
                    width: particle.size,
                    height: particle.size,
                    backgroundColor: particle.color,
                    borderRadius: '50%',
                    transform: `rotate(${particle.rotation}deg)`,
                    boxShadow: `0 2px 8px ${particle.color}40`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: particle.size,
                    height: particle.size * 0.6,
                    backgroundColor: particle.color,
                    borderRadius: '2px',
                    transform: `rotate(${particle.rotation}deg)`,
                    boxShadow: `0 2px 8px ${particle.color}40`,
                  }}
                />
              )}
            </div>
          </div>
        ))}

        {/* Sparkle stars around the badge */}
        {[...Array(6)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute star-particle"
            style={{
              top: `${35 + (Math.random() * 30)}%`,
              left: `${35 + (Math.random() * 30)}%`,
              animationDelay: `${0.1 + i * 0.15}s`,
            }}
          >
            <Star 
              className="text-amber-400 fill-amber-400" 
              style={{ 
                width: 12 + Math.random() * 12,
                height: 12 + Math.random() * 12,
              }} 
            />
          </div>
        ))}

        {/* Success badge */}
        <div 
          className="celebration-badge absolute top-1/3 left-1/2"
          style={{
            animationDelay: '0.2s',
          }}
        >
          <div className="relative">
            {/* Glow effect */}
            <div 
              className="absolute inset-0 rounded-2xl blur-xl opacity-50"
              style={{
                background: type === 'customer' 
                  ? 'linear-gradient(135deg, #10B981, #3B82F6)' 
                  : 'linear-gradient(135deg, #F59E0B, #10B981)',
                transform: 'scale(1.2)',
              }}
            />
            
            {/* Badge content */}
            <div 
              className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl px-8 py-6 border border-slate-200 dark:border-slate-700"
              style={{
                minWidth: '280px',
              }}
            >
              {/* Shimmer overlay */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <div className="shimmer-effect absolute inset-0 opacity-30" />
              </div>
              
              <div className="relative flex flex-col items-center text-center">
                {/* Icon with gradient background */}
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                  style={{
                    background: type === 'customer' 
                      ? 'linear-gradient(135deg, #10B981, #3B82F6)' 
                      : 'linear-gradient(135deg, #F59E0B, #10B981)',
                  }}
                >
                  <IconComponent className="w-8 h-8 text-white" />
                </div>
                
                {/* Title */}
                <h3 
                  className="text-xl font-bold mb-1"
                  style={{
                    background: type === 'customer' 
                      ? 'linear-gradient(135deg, #10B981, #3B82F6)' 
                      : 'linear-gradient(135deg, #F59E0B, #10B981)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {message.title}
                </h3>
                
                {/* Subtitle */}
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-[220px]">
                  {message.subtitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CelebrationAnimation;

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, RotateCcw, Trophy, Hash, Users, X } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Types ---
interface BallData {
  id: number;
  number: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Participant {
  id: number;
  timestamp: string;
  name: string;
  email: string;
  phone: string;
  propertyType?: string;
  investmentRange?: string;
  timePeriod?: string;
  areas?: string;
}

const BALL_COLORS = [
  'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 
  'bg-violet-500', 'bg-fuchsia-500', 'bg-orange-500', 'bg-lime-500'
];

// --- Components ---

const Ball = ({ number, color, size = 'md', className = '' }: { number: number, color: string, size?: 'sm' | 'md' | 'lg', className?: string }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg'
  };

  return (
    <div className={`rounded-full flex items-center justify-center font-bold text-white shadow-inner relative overflow-hidden ${sizeClasses[size]} ${color} ${className}`}>
      {/* 3D Shading effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
      <div className="absolute top-1 left-1 w-1/3 h-1/3 bg-white/30 rounded-full blur-[1px] pointer-events-none" />
      <span className="relative z-10 drop-shadow-md">{number}</span>
    </div>
  );
};

export default function App() {
  // --- State ---
  const [startNum, setStartNum] = useState(1);
  const [endNum, setEndNum] = useState(50);
  const [numWinners, setNumWinners] = useState(1);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  
  const [balls, setBalls] = useState<BallData[]>([]);
  const [winners, setWinners] = useState<number[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<number | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showWinnerDetails, setShowWinnerDetails] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);

  // --- API Functions ---
  const fetchParticipantsFromSheets = async (start: number, end: number): Promise<Participant[]> => {
    try {
      // Use direct fetch since script returns JSON, not JSONP
      const url = `https://script.google.com/macros/s/AKfycbwCUWBZDaV-qZPzjiaaCsOvW-jh3p_xZdiN3rT9GXiqrleURE6JLVA7rMUBj50L6EMj/exec?start=${start}&end=${end}`;
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors', // Try no-cors to avoid CORS issues
        headers: {
          'Accept': 'application/json',
        }
      });
      
      // With no-cors, we can't read the response directly
      // So we'll use a different approach - create a proxy request
      if (response.type === 'opaque') {
        // Fall back to JSONP by adding callback parameter
        return new Promise((resolve, reject) => {
          const callbackName = `jsonpCallback_${Date.now()}`;
          const jsonpUrl = `${url}&callback=${callbackName}`;
          
          (window as any)[callbackName] = (data: any) => {
            delete (window as any)[callbackName];
            document.head.removeChild(script);
            
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(Array.isArray(data) ? data : []);
            }
          };
          
          const script = document.createElement('script');
          script.src = jsonpUrl;
          script.onerror = () => {
            delete (window as any)[callbackName];
            document.head.removeChild(script);
            reject(new Error('Failed to load script'));
          };
          
          setTimeout(() => {
            if ((window as any)[callbackName]) {
              delete (window as any)[callbackName];
              document.head.removeChild(script);
              reject(new Error('Request timeout'));
            }
          }, 10000);
          
          document.head.appendChild(script);
        });
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching participants:', error);
      throw new Error('Unable to fetch data from Google Sheets. The game will continue in frontend-only mode.');
    }
  };

  // --- Initialization ---
  const initBalls = () => {
    const newBalls: BallData[] = [];
    
    // Handle case where inputs are cleared
    if (startNum === 0 || endNum === startNum + 1) {
      setBalls([]);
      setWinners([]);
      setCurrentWinner(null);
      setIsPicking(false);
      return;
    }
    
    const count = endNum - startNum + 1;
    const radius = 120; // Radius of the glass case

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (radius - 20);
      newBalls.push({
        id: i,
        number: startNum + i,
        color: BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)],
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
      });
    }
    setBalls(newBalls);
    setWinners([]);
    setCurrentWinner(null);
    setIsPicking(false);
  };

  useEffect(() => {
    initBalls();
  }, [startNum, endNum]);

  // --- Physics Loop ---
  useEffect(() => {
    const update = () => {
      if (isSpinning) {
        setBalls(prev => prev.map(ball => {
          let { x, y, vx, vy } = ball;
          
          // Add some "spinning" force towards the center or random jitter
          vx += (Math.random() - 0.5) * 4;
          vy += (Math.random() - 0.5) * 4;
          
          // Friction/Damping (lower friction for more chaos)
          vx *= 0.995;
          vy *= 0.995;

          x += vx;
          y += vy;

          // Boundary check (Circle)
          const dist = Math.sqrt(x * x + y * y);
          const maxDist = 120 - 15; // Case radius minus ball radius
          if (dist > maxDist) {
            const angle = Math.atan2(y, x);
            x = Math.cos(angle) * maxDist;
            y = Math.sin(angle) * maxDist;
            // Reflect velocity with a bit of extra "bounce"
            const nx = Math.cos(angle);
            const ny = Math.sin(angle);
            const dot = vx * nx + vy * ny;
            vx = (vx - 2 * dot * nx) * 0.9;
            vy = (vy - 2 * dot * ny) * 0.9;
          }

          return { ...ball, x, y, vx, vy };
        }));
      }
      requestRef.current = requestAnimationFrame(update);
    };

    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isSpinning]);

  // --- Actions ---
  const handleSpin = async () => {
    if (isSpinning || isPicking || balls.length === 0 || winners.length >= numWinners) return;

    setIsSpinning(true);
    
    // Spin for a few seconds
    setTimeout(async () => {
      setIsSpinning(false);
      setIsPicking(true);
      await pickAllWinners();
      setIsPicking(false);
    }, 3000);
  };

  const pickAllWinners = async () => {
    let currentWinnersCount = winners.length;
    const targetWinnersCount = numWinners;
    const currentWinnersList = [...winners];

    while (currentWinnersCount < targetWinnersCount) {
      const available = balls.filter(b => !currentWinnersList.includes(b.number));
      if (available.length === 0) break;

      const winner = available[Math.floor(Math.random() * available.length)];
      
      // Start exit animation
      setIsExiting(true);
      setCurrentWinner(winner.number);

      // Wait for the ball to "exit" the pipe (animation duration)
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Add to winners list
      currentWinnersList.push(winner.number);
      setWinners([...currentWinnersList]);
      
      // Reset exit state for next ball
      setIsExiting(false);
      setCurrentWinner(null);
      currentWinnersCount++;

      // Small pause between balls
      if (currentWinnersCount < targetWinnersCount) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Celebrate at the end
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Show winner details modal after a short delay
    setTimeout(() => {
      setShowWinnerDetails(true);
    }, 1000);
  };

  const resetGame = () => {
    setWinners([]);
    setCurrentWinner(null);
    setIsSpinning(false);
    setIsPicking(false);
    setShowWinnerDetails(false);
    initBalls();
  };

  const handleSaveAndRestart = async () => {
    setIsLoadingData(true);
    setDataError(null);
    
    try {
      // Fetch participants from Google Sheets
      const fetchedParticipants = await fetchParticipantsFromSheets(startNum, endNum);
      setParticipants(fetchedParticipants);
      
      // Reset and restart the game
      resetGame();
      setIsAdminOpen(false);
    } catch (error) {
      console.error('Failed to fetch participants:', error);
      setDataError('Failed to fetch data from Google Sheets. Game will continue with frontend-only mode.');
      
      // Still reset the game even if data fetch fails
      resetGame();
      setIsAdminOpen(false);
    } finally {
      setIsLoadingData(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl font-black tracking-tight text-slate-800 mb-2 flex items-center justify-center gap-2">
          <Trophy className="text-amber-500 w-8 h-8" />
          LUCKY BALL SPINNER
        </h1>
        <p className="text-slate-500 font-medium">Pick your winners with style</p>
      </motion.div>

      {/* Main Game Area */}
      <div className="relative flex flex-col items-center">
        {/* The Glass Case */}
        <motion.div 
          animate={isSpinning ? {
            x: [0, -2, 2, -2, 2, 0],
            y: [0, 1, -1, 1, -1, 0],
          } : {}}
          transition={{
            duration: 0.1,
            repeat: Infinity,
            ease: "linear"
          }}
          className="relative w-72 h-72 rounded-full border-8 border-slate-200 bg-white/40 backdrop-blur-sm shadow-2xl flex items-center justify-center overflow-hidden z-10"
        >
          {/* Glass Reflection */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none z-20" />
          <div className="absolute top-4 left-10 w-20 h-10 bg-white/20 rounded-full blur-xl pointer-events-none z-20 rotate-[-20deg]" />
          
          {/* Balls Container */}
          <div className="relative w-full h-full">
            {balls.map((ball) => (
              <motion.div
                key={ball.id}
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  x: ball.x,
                  y: ball.y,
                  marginLeft: -16, // Half of ball size
                  marginTop: -16,
                }}
                animate={isSpinning ? {
                  scale: [1, 1.1, 1],
                  rotate: [0, 360],
                } : {}}
                transition={isSpinning ? {
                  duration: 0.5,
                  repeat: Infinity,
                  ease: "linear"
                } : {}}
              >
                <Ball 
                  number={ball.number} 
                  color={ball.color} 
                  size="sm" 
                  className={winners.includes(ball.number) ? 'opacity-0' : ''} 
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* The Pipe */}
        <motion.div 
          animate={isExiting ? {
            x: [0, -1, 1, -1, 1, 0],
          } : {}}
          transition={{ duration: 0.2, repeat: 1 }}
          className="relative -mt-6 w-20 h-32 bg-gradient-to-b from-slate-300 to-slate-400 rounded-b-2xl shadow-lg z-0 flex items-end justify-center overflow-hidden"
        >
          {/* Pipe Interior Shadow */}
          <div className="absolute inset-0 bg-black/10 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-8 bg-black/20 blur-sm" />
          
          {/* Exiting Ball Animation */}
          <AnimatePresence mode="wait">
            {isExiting && currentWinner !== null && (
              <motion.div
                key={currentWinner}
                initial={{ y: -140, opacity: 0, scale: 0.7 }}
                animate={{ 
                  y: 180, 
                  opacity: [0, 1, 1, 0],
                  scale: [0.7, 1.1, 1.1, 1],
                }}
                transition={{ 
                  duration: 1.2, 
                  ease: [0.32, 0, 0.67, 0], // easeInCubic
                  times: [0, 0.1, 0.8, 1]
                }}
                className="absolute top-0 z-10"
              >
                <Ball 
                  number={currentWinner} 
                  color={BALL_COLORS[currentWinner % BALL_COLORS.length]} 
                  size="md" 
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* The Exit Hole (Visual) */}
        <div className="absolute top-[260px] w-16 h-4 bg-black/40 rounded-full blur-[2px] z-10" />

        {/* Controls */}
        <div className="mt-16 flex gap-4 items-center">
          <button
            onClick={handleSpin}
            disabled={isSpinning || isPicking || winners.length >= numWinners}
            className={`px-8 py-4 rounded-full font-bold text-white shadow-xl flex items-center gap-2 transition-all active:scale-95 ${
              isSpinning || isPicking || winners.length >= numWinners
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600 hover:shadow-emerald-200'
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            {isSpinning ? 'SPINNING...' : isPicking ? 'PICKING WINNERS...' : 'SPIN NOW'}
          </button>

          <button
            onClick={resetGame}
            className="p-4 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-md active:scale-95"
            title="Reset Game"
          >
            <RotateCcw className="w-6 h-6" />
          </button>

          <button
            onClick={() => setIsAdminOpen(true)}
            className="p-4 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-md active:scale-95"
            title="Admin Panel"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Winners Display */}
      <div className="mt-12 w-full max-w-2xl">
        <h2 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Winners ({winners.length}/{numWinners})
        </h2>
        <div className="flex flex-wrap gap-4 justify-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[100px]">
          {winners.length === 0 && !isExiting && (
            <p className="text-slate-400 italic">No winners yet. Spin the ball!</p>
          )}
          {winners.map((num, idx) => (
            <motion.div
              key={`${num}-${idx}`}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              whileHover={{ scale: 1.1 }}
              className="relative group"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 bg-white blur-md opacity-0 group-hover:opacity-40 transition-opacity rounded-full" />
              
              <div className="absolute -top-2 -left-2 bg-amber-400 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm z-20">
                {idx + 1}
              </div>
              <Ball 
                number={num} 
                color={BALL_COLORS[num % BALL_COLORS.length]} 
                size="md" 
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-500" />
                  Game Settings
                </h3>
                <button 
                  onClick={() => setIsAdminOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-600 flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    BALL RANGE
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-xs text-slate-400 uppercase font-bold">Start</span>
                      <input 
                        type="number" 
                        value={startNum === 0 ? '' : startNum}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            setStartNum(0);
                          } else {
                            const numValue = parseInt(value);
                            setStartNum(isNaN(numValue) ? 0 : numValue);
                          }
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        placeholder="Enter start number"
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-xs text-slate-400 uppercase font-bold">End</span>
                      <input 
                        type="number" 
                        value={endNum === startNum + 1 ? '' : endNum}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            setEndNum(startNum + 1);
                          } else {
                            const numValue = parseInt(value);
                            setEndNum(isNaN(numValue) ? startNum + 1 : numValue);
                          }
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                        placeholder="Enter end number"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-600 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    NUMBER OF WINNERS
                  </label>
                  <input 
                    type="number" 
                    value={numWinners}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setNumWinners(1);
                      } else {
                        const numValue = parseInt(value);
                        setNumWinners(isNaN(numValue) ? 1 : numValue);
                      }
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                    placeholder="Enter number of winners"
                  />
                  <p className="text-xs text-slate-400">Total balls: {startNum === 0 || endNum === startNum + 1 ? 0 : endNum - startNum + 1}</p>
                </div>

                <button
                  onClick={handleSaveAndRestart}
                  disabled={isLoadingData}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoadingData ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      FETCHING DATA...
                    </>
                  ) : (
                    'SAVE & RESTART'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer info */}
      <div className="mt-auto pt-8 text-slate-400 text-sm font-medium">
        Designed for fun & luck
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {dataError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg max-w-sm"
          >
            <p className="text-sm font-medium">{dataError}</p>
            <button 
              onClick={() => setDataError(null)}
              className="mt-2 text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Winner Details Modal */}
      <AnimatePresence>
        {showWinnerDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWinnerDetails(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Winner Details
                </h3>
                <button 
                  onClick={() => setShowWinnerDetails(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {winners.length === 0 ? (
                  <p className="text-slate-400 text-center">No winners selected yet.</p>
                ) : (
                  <div className="space-y-4">
                    {winners.map((winnerId, index) => {
                      const participant = participants.find(p => p.id === winnerId);
                      return (
                        <motion.div
                          key={winnerId}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                {index + 1}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                
                                {participant ? (
                                  <span className="text-lg font-semibold text-slate-700">{participant.name}</span>
                                ) : (
                                  <span className="text-lg text-slate-500 italic">No participant data available</span>
                                )}
                              </div>
                              {participant && (
                                <div className="text-sm text-slate-600 space-y-1">
                                  <p><span className="font-medium">Phone:</span> {participant.phone}</p>
                                  
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50">
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowWinnerDetails(false)}
                    className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowWinnerDetails(false);
                      resetGame();
                    }}
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors"
                  >
                    New Game
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

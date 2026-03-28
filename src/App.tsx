import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Search, MapPin, Navigation, Zap, Camera, Wind, Users, ArrowRight, Sparkles, X, Menu, Compass, Clock, Ruler, ChevronRight, ChevronDown, AlertTriangle, User, Bike, Train, Car, Info, LogIn, LogOut, Map as MapIcon, Shield, ShieldOff, Heart, Flag, Briefcase, Home, Star, Bookmark, MoreVertical, Plus, List } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { VIBES, type RouteVibe, type RouteOption } from './types';
import { auth, db, signIn, logOut, handleFirestoreError } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, updateDoc, onSnapshot, collection, query, where, serverTimestamp } from 'firebase/firestore';

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full bg-black flex flex-col items-center justify-center p-8 text-center gap-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center border-2 border-red-500/40">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-display uppercase italic text-red-500">Something went wrong</h2>
            <p className="text-white/60 text-sm max-w-sm">
              {this.state.error?.message?.includes('auth/unauthorized-domain') 
                ? "This domain is not authorized in the Firebase Console. Please add it to the 'Authorized domains' list."
                : "An unexpected error occurred. Please refresh the page or check your connection."}
            </p>
            {this.state.error?.message && (
              <pre className="mt-4 p-4 bg-white/5 rounded-xl text-[10px] font-mono text-white/40 overflow-auto max-w-full">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="bg-white text-black font-display text-xl px-8 py-3 rounded-2xl neo-brutal"
          >
            REFRESH
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Types for Squad ---
interface SquadMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  location?: { latitude: number; longitude: number };
  isLocationOn: boolean;
  lastSeen?: any;
  color?: string; // Assigned color for map marker
}

interface VibeCheck {
  from: string;
  fromName: string;
  timestamp: any;
}

export default function App() {
  const [currentView, setCurrentView] = useState<'explore' | 'squad' | 'saved'>('explore');
  const [savedTab, setSavedTab] = useState<'lists' | 'labeled' | 'maps'>('lists');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLocationOn, setIsLocationOn] = useState(false);
  const [squadMembers, setSquadMembers] = useState<SquadMember[]>([]);
  const [incomingVibeCheck, setIncomingVibeCheck] = useState<VibeCheck | null>(null);
  
  const [destination, setDestination] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedVibe, setSelectedVibe] = useState<RouteVibe>(VIBES[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [isFocused, setIsFocused] = useState(false);

  // Mock data for Saved View
  const savedLists = [
    { id: 'fav', name: 'Favorites', icon: <Heart className="w-5 h-5 text-red-500" />, places: 5, isPrivate: true },
    { id: 'rest', name: 'Restaurants', icon: <List className="w-5 h-5 text-blue-400" />, places: 11, isPrivate: true },
    { id: 'want', name: 'Want to go', icon: <Flag className="w-5 h-5 text-green-500" />, places: 17, isPrivate: true },
    { id: 'travel', name: 'Travel plans', icon: <Car className="w-5 h-5 text-cyan-500" />, places: 1, isPrivate: true },
    { id: 'quotes', name: 'Quotes ❤️', icon: <List className="w-5 h-5 text-pink-400" />, places: 0, isPrivate: true },
    { id: 'saved', name: 'Saved places', icon: <Bookmark className="w-5 h-5 text-blue-500" />, places: 0, isPrivate: true },
    { id: 'starred', name: 'Starred places', icon: <Star className="w-5 h-5 text-yellow-500" />, places: 0, isPrivate: true },
  ];

  const labeledPlaces = [
    { id: 'home', label: 'Home', address: 'Shiv Sagar Apartments', icon: <Home className="w-5 h-5 text-blue-400" /> },
    { id: 'work', label: 'Work', address: 'Ryan International School Chembur - ICSE', icon: <Briefcase className="w-5 h-5 text-cyan-500" /> },
  ];

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        // Sync user profile to Firestore
        const userRef = doc(db, 'users', user.uid);
        setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName || 'Anonymous',
          photoURL: user.photoURL || '',
          isLocationOn: isLocationOn,
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(e => handleFirestoreError(e, 'write', 'users'));
      }
    });
    return () => unsubscribe();
  }, [isLocationOn]);

  // Squad Listener
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'users'), where('isLocationOn', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const members: SquadMember[] = [];
      const colors = ['#FF00E5', '#00FF00', '#00F0FF', '#FF6B00', '#7000FF', '#FF0000'];
      
      snapshot.forEach((doc) => {
        if (doc.id !== currentUser.uid) {
          const data = doc.data() as SquadMember;
          // Assign a color based on UID hash
          const colorIdx = Math.abs(data.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
          members.push({ ...data, color: colors[colorIdx] });
        }
      });
      setSquadMembers(members);
    }, (error) => handleFirestoreError(error, 'list', 'users'));
    return () => unsubscribe();
  }, [currentUser]);

  // Vibe Check Listener
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'vibeChecks'), 
      where('to', '==', currentUser.uid),
      where('timestamp', '>', new Date(Date.now() - 10000)) // Only recent ones
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as VibeCheck;
          setIncomingVibeCheck(data);
          setTimeout(() => setIncomingVibeCheck(null), 5000);
        }
      });
    }, (error) => console.error("VibeCheck Error:", error));
    
    return () => unsubscribe();
  }, [currentUser]);

  // Location Sync
  useEffect(() => {
    if (!currentUser || !isLocationOn) return;

    const updateLocation = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      
      const userRef = doc(db, 'users', currentUser.uid);
      updateDoc(userRef, {
        location: { latitude, longitude },
        lastSeen: serverTimestamp()
      }).catch(e => handleFirestoreError(e, 'update', `users/${currentUser.uid}`));
    };

    const watchId = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => console.error("Error watching location:", error),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentUser, isLocationOn]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => console.error("Error getting location:", error)
      );
    }
  }, []);

  // Debounced suggestions
  useEffect(() => {
    const timer = setTimeout(() => {
      if (destination.trim().length > 1 && !isSearching && isFocused) {
        fetchSuggestions(destination);
      } else {
        setSuggestions([]);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [destination, isSearching, isFocused]);

  const fetchSuggestions = async (input: string) => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    setIsSuggesting(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Suggest 5 real place names for: "${input}". 
        Location: ${userLocation ? `${userLocation.latitude}, ${userLocation.longitude}` : 'Unknown'}.
        Return ONLY JSON array of strings.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: userLocation || { latitude: 40.7128, longitude: -74.0060 }
            }
          }
        }
      });
      const text = response.text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (Array.isArray(data)) {
            setSuggestions(data.slice(0, 5));
          }
        } catch (e) {
          console.error("JSON Parse Error:", e);
        }
      }
    } catch (error) {
      console.error("Suggestions Error:", error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleFTW = async (targetDestination?: string) => {
    const finalDest = targetDestination || destination;
    if (!finalDest) return;
    
    setSuggestions([]);
    setDestination(finalDest);
    setIsLoading(true);
    setRoutes([]);
    setExpandedRoute(null);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find 3 possible navigation routes to "${finalDest}" with a focus on the "${selectedVibe.name}" vibe. 
        Current location: ${userLocation ? `${userLocation.latitude}, ${userLocation.longitude}` : 'Unknown'}.
        
        For each route, provide:
        1. Transport mode (walk, bike, transit, or car).
        2. Crowd level (low, medium, high) - especially important for "Low Anxiety".
        3. Safety alerts (e.g., well-lit areas, construction, busy crossings).
        
        Return ONLY a JSON array of route options in the following format:
        [
          {
            "id": "string",
            "title": "string",
            "duration": "string",
            "distance": "string",
            "summary": "string",
            "vibeMatch": number,
            "transportMode": "walk" | "bike" | "transit" | "car",
            "crowdLevel": "low" | "medium" | "high",
            "safetyAlerts": ["string"],
            "steps": [
              { "instruction": "string", "distance": "string" }
            ]
          }
        ]`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: userLocation || { latitude: 40.7128, longitude: -74.0060 }
            }
          }
        },
      });

      const text = response.text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setRoutes(data);
        setIsSearching(true);
      }
    } catch (error) {
      console.error("FTW Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Squad Map Component ---
  const SquadMap = () => {
    // A stylized map interface
    // Scale: 0.001 degrees (approx 111m) = 40 pixels
    const SCALE = 40000; 

    return (
      <div className="relative w-full aspect-square bg-white/5 rounded-[40px] overflow-hidden border-2 border-white/10 neo-brutal">
        {/* Stylized Grid Lines */}
        <div className="absolute inset-0 opacity-20" 
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        
        {/* Center Point (User) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="relative">
            <div className="absolute inset-0 bg-neon-green blur-md animate-pulse" />
            <div className="w-12 h-12 rounded-full border-4 border-black bg-neon-green flex items-center justify-center relative z-10 overflow-hidden shadow-xl">
              {currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="text-black w-6 h-6" />
              )}
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border border-neon-green/30">
              Me
            </div>
          </div>
        </div>

        {/* Squad Members */}
        {squadMembers.map((member, idx) => {
          // Calculate relative position based on lat/lng
          let x = 0;
          let y = 0;

          if (userLocation && member.location) {
            // Longitude difference (X)
            x = (member.location.longitude - userLocation.longitude) * SCALE;
            // Latitude difference (Y) - negate because Y increases downwards in CSS
            y = -(member.location.latitude - userLocation.latitude) * SCALE;
          } else {
            // Fallback: scatter them if no real location data
            const angle = (idx * (360 / squadMembers.length)) * (Math.PI / 180);
            const radius = 80 + (idx * 10);
            x = Math.cos(angle) * radius;
            y = Math.sin(angle) * radius;
          }

          // Clamp to map boundaries
          const mapSize = 400; // Approx size in pixels
          x = Math.max(-mapSize/2 + 20, Math.min(mapSize/2 - 20, x));
          y = Math.max(-mapSize/2 + 20, Math.min(mapSize/2 - 20, y));

          return (
            <motion.div 
              key={member.uid}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, x, y }}
              transition={{ type: 'spring', damping: 15 }}
              className="absolute top-1/2 left-1/2 z-10"
              style={{ marginLeft: -20, marginTop: -20 }}
            >
              <div className="relative group cursor-pointer">
                <div 
                  className={cn(
                    "absolute inset-0 blur-sm opacity-50 group-hover:opacity-100 transition-opacity",
                    incomingVibeCheck?.from === member.uid && "animate-ping opacity-100 bg-neon-pink"
                  )}
                  style={{ backgroundColor: member.color || '#FF00E5' }}
                />
                <div 
                  className="w-10 h-10 rounded-full border-2 border-black bg-white flex items-center justify-center relative z-10 overflow-hidden shadow-lg"
                  style={{ borderColor: member.color || '#FF00E5' }}
                >
                  {member.photoURL ? (
                    <img src={member.photoURL} alt={member.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: member.color || '#FF00E5' }}
                    >
                      {member.displayName[0]}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border border-white/10">
                  {member.displayName.split(' ')[0]}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Map Accents */}
        <div className="absolute top-10 left-10 flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/10">
          <Compass className="w-4 h-4 text-neon-green animate-spin-slow" />
          <span className="text-[10px] font-mono uppercase tracking-widest">Live Radar</span>
        </div>
      </div>
    );
  };

  const getCrowdColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'high': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getTransportIcon = (mode: string) => {
    switch (mode) {
      case 'walk': return <User className="w-4 h-4" />;
      case 'bike': return <Bike className="w-4 h-4" />;
      case 'transit': return <Train className="w-4 h-4" />;
      case 'car': return <Car className="w-4 h-4" />;
      default: return <Navigation className="w-4 h-4" />;
    }
  };

  const sendVibeCheck = async (member: SquadMember) => {
    if (!currentUser) return;
    try {
      await setDoc(doc(collection(db, 'vibeChecks')), {
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Friend',
        to: member.uid,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error sending vibe check:", e);
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signIn();
    } catch (error: any) {
      console.error("Sign In Error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        setAuthError("Domain not authorized. Please add this URL to the Firebase Console.");
      } else {
        setAuthError(error.message || "Failed to sign in.");
      }
    }
  };

  return (
    <ErrorBoundary>
      <div className="h-screen w-full bg-black flex flex-col items-center justify-start p-4 font-sans relative overflow-hidden">
      {/* Vibe Check Notification */}
      <AnimatePresence>
        {incomingVibeCheck && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-xs"
          >
            <div className="glass p-4 rounded-2xl border-2 border-neon-pink flex items-center gap-4 shadow-[0_0_30px_rgba(255,0,229,0.3)]">
              <div className="w-10 h-10 bg-neon-pink rounded-full flex items-center justify-center animate-bounce">
                <Heart className="text-white w-6 h-6 fill-current" />
              </div>
              <div>
                <p className="font-bold text-sm">{incomingVibeCheck.fromName} sent a Vibe Check!</p>
                <p className="text-[10px] text-white/40 uppercase font-mono tracking-widest">They're thinking of you</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-neon-pink/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-neon-green/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full flex justify-between items-center z-10 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center neo-brutal">
            <Navigation className="text-black w-6 h-6 fill-current" />
          </div>
          <div className="flex flex-col -space-y-1">
            <h1 className="font-display text-4xl tracking-tighter italic">FTW</h1>
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/40">Find The Way</span>
          </div>
        </div>
        <button className="p-2 glass rounded-full">
          <Menu className="w-6 h-6" />
        </button>
      </header>

      <main className="w-full max-w-md flex flex-col gap-6 z-10 flex-1 overflow-y-auto no-scrollbar pb-24">
        {currentView === 'explore' ? (
          <>
            {/* Hero Section */}
            {!isSearching && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <h2 className="text-5xl font-display leading-[0.9] uppercase">
                  Where we <br /> 
                  <span className="text-neon-green italic">going?</span>
                </h2>
                <p className="text-white/60 font-mono text-sm uppercase tracking-widest">Navigation for the next gen</p>
              </motion.div>
            )}

            {/* Search Bar */}
            <div className="relative group">
              <input 
                type="text" 
                placeholder="Search destination..."
                value={destination}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFTW()}
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-5 pl-14 focus:border-neon-green focus:outline-none transition-all text-xl font-medium placeholder:text-white/20"
              />
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-neon-green transition-colors" />
              
              {isSuggesting && isFocused && (
                <div className="absolute right-16 top-1/2 -translate-y-1/2">
                  <Sparkles className="w-4 h-4 text-neon-green animate-spin" />
                </div>
              )}

              <AnimatePresence>
                {suggestions.length > 0 && isFocused && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.1 }}
                    className="absolute top-full left-0 right-0 mt-2 glass rounded-2xl overflow-hidden z-50 shadow-2xl"
                  >
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setDestination(suggestion);
                          handleFTW(suggestion);
                        }}
                        className="w-full p-4 text-left hover:bg-white/10 flex items-center gap-3 transition-colors border-b border-white/5 last:border-none"
                      >
                        <MapPin className="w-4 h-4 text-white/40" />
                        <span className="font-medium">{suggestion}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {destination && (
                <button 
                  onClick={() => handleFTW()}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-neon-green text-black p-2 rounded-xl neo-brutal-green hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isLoading ? <Sparkles className="animate-spin w-6 h-6" /> : <ArrowRight className="w-6 h-6" />}
                </button>
              )}
            </div>

            {/* Vibe Selector */}
            {!isSearching && (
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-white/40">Select Your Vibe</h3>
                  <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded uppercase font-bold">4 Styles</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {VIBES.map((vibe) => (
                    <button
                      key={vibe.id}
                      onClick={() => setSelectedVibe(vibe)}
                      className={cn(
                        "p-4 rounded-2xl flex flex-col gap-3 transition-all border-2",
                        selectedVibe.id === vibe.id 
                          ? "bg-white text-black border-white scale-[1.02]" 
                          : "bg-white/5 text-white border-white/5 hover:border-white/20"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        selectedVibe.id === vibe.id ? "bg-black text-white" : "bg-white/10"
                      )}>
                        {vibe.id === 'fast' && <Zap className="w-5 h-5" />}
                        {vibe.id === 'scenic' && <Camera className="w-5 h-5" />}
                        {vibe.id === 'chill' && <Wind className="w-5 h-5" />}
                        {vibe.id === 'social' && <Users className="w-5 h-5" />}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-lg leading-tight">{vibe.name}</p>
                        <p className={cn(
                          "text-[10px] leading-tight opacity-60",
                          selectedVibe.id === vibe.id ? "text-black" : "text-white"
                        )}>{vibe.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Routes Section */}
            <AnimatePresence>
              {isSearching && routes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => setIsSearching(false)}
                      className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span className="font-mono text-[10px] uppercase tracking-widest">New Search</span>
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1 bg-neon-green/10 rounded-full border border-neon-green/20">
                      <Navigation className="w-3 h-3 text-neon-green" />
                      <span className="text-[10px] text-neon-green font-bold uppercase">{routes.length} Routes Found</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {routes.map((route) => (
                      <div 
                        key={route.id}
                        className={cn(
                          "glass rounded-3xl overflow-hidden transition-all border-2",
                          expandedRoute === route.id ? "border-neon-green" : "border-white/10"
                        )}
                      >
                        <button 
                          onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)}
                          className="w-full p-5 text-left flex flex-col gap-3"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <div className="bg-white/10 p-1.5 rounded-lg text-white">
                                  {getTransportIcon(route.transportMode)}
                                </div>
                                <h4 className="font-bold text-xl">{route.title}</h4>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className={cn("w-2 h-2 rounded-full", getCrowdColor(route.crowdLevel))} />
                                <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                                  {route.crowdLevel} Crowd
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg">
                              <Sparkles className="w-3 h-3 text-neon-green" />
                              <span className="text-[10px] font-bold">{route.vibeMatch}% Match</span>
                            </div>
                          </div>
                          
                          <p className="text-white/60 text-sm">{route.summary}</p>
                          
                          {route.safetyAlerts && route.safetyAlerts.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {route.safetyAlerts.map((alert, i) => (
                                <div key={i} className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">
                                  <AlertTriangle className="w-3 h-3 text-red-500" />
                                  <span className="text-[9px] font-bold text-red-500 uppercase">{alert}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-widest text-neon-green">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {route.duration}
                            </div>
                            <div className="flex items-center gap-1">
                              <Ruler className="w-3 h-3" />
                              {route.distance}
                            </div>
                          </div>

                          <div className="w-full flex justify-center pt-2">
                            {expandedRoute === route.id ? <ChevronDown className="w-4 h-4 text-white/20" /> : <ChevronRight className="w-4 h-4 text-white/20" />}
                          </div>
                        </button>

                        <AnimatePresence>
                          {expandedRoute === route.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-white/10 bg-white/5"
                            >
                              <div className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h5 className="font-mono text-[10px] uppercase tracking-widest text-white/40">Step-by-Step</h5>
                                  <div className="flex items-center gap-1 text-neon-blue">
                                    <Info className="w-3 h-3" />
                                    <span className="text-[9px] font-bold uppercase">Safety Verified</span>
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  {route.steps.map((step, idx) => (
                                    <div key={idx} className="flex gap-4">
                                      <div className="flex flex-col items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-neon-green" />
                                        {idx !== route.steps.length - 1 && <div className="w-0.5 flex-1 bg-white/10" />}
                                      </div>
                                      <div className="flex-1 pb-4">
                                        <p className="text-sm font-medium">{step.instruction}</p>
                                        <p className="text-[10px] font-mono text-white/40 uppercase mt-1">{step.distance}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button className="w-full bg-neon-green text-black font-display text-xl p-4 rounded-xl neo-brutal-green">
                                  GO NOW
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick Destinations */}
            {!isSearching && (
              <div className="space-y-4">
                <h3 className="font-mono text-xs uppercase tracking-widest text-white/40">Recent Spots</h3>
                <div className="flex flex-col gap-2">
                  {['Thrift Store', 'Matcha Cafe', 'Co-working Space'].map((spot) => (
                    <button 
                      key={spot}
                      onClick={() => handleFTW(spot)}
                      className="w-full p-4 glass rounded-2xl flex items-center justify-between group hover:bg-white/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-neon-green group-hover:text-black transition-colors">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <span className="font-medium">{spot}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : currentView === 'squad' ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-6"
          >
            {/* Squad Header */}
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h2 className="text-4xl font-display uppercase italic">The <span className="text-neon-pink">Squad</span></h2>
                <p className="text-white/40 font-mono text-[10px] uppercase tracking-widest">Live Location Sharing</p>
              </div>
              <button 
                onClick={() => currentUser ? logOut() : handleSignIn()}
                className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/20 transition-all"
              >
                {currentUser ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                <span className="font-bold text-xs uppercase">{currentUser ? 'Sign Out' : 'Sign In'}</span>
              </button>
            </div>

            {authError && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-500 uppercase">Authorization Error</p>
                  <p className="text-[10px] text-white/60">{authError}</p>
                </div>
              </motion.div>
            )}

            {!currentUser ? (
              <div className="glass p-8 rounded-[40px] flex flex-col items-center text-center gap-6 border-2 border-white/10">
                <div className="w-20 h-20 bg-neon-pink/20 rounded-full flex items-center justify-center border-2 border-neon-pink/40 animate-pulse">
                  <Users className="w-10 h-10 text-neon-pink" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">Join the Radar</h3>
                  <p className="text-white/60 text-sm">Sign in with Google to see where your friends are and share your vibe.</p>
                </div>
                <button 
                  onClick={handleSignIn}
                  className="w-full bg-white text-black font-display text-xl p-4 rounded-2xl neo-brutal flex items-center justify-center gap-3"
                >
                  <LogIn className="w-6 h-6" />
                  CONNECT NOW
                </button>
              </div>
            ) : (
              <>
                {/* Location Toggle */}
                <div className="glass p-6 rounded-[32px] flex items-center justify-between border-2 border-white/10">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                      isLocationOn ? "bg-neon-green/20 text-neon-green" : "bg-white/5 text-white/40"
                    )}>
                      {isLocationOn ? <Shield className="w-6 h-6" /> : <ShieldOff className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="font-bold text-lg leading-tight">Live Location</p>
                      <p className="text-[10px] text-white/40 uppercase font-mono tracking-widest">
                        {isLocationOn ? 'Visible to Squad' : 'Hidden from Radar'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsLocationOn(!isLocationOn)}
                    className={cn(
                      "w-14 h-8 rounded-full relative transition-colors p-1",
                      isLocationOn ? "bg-neon-green" : "bg-white/10"
                    )}
                  >
                    <motion.div 
                      animate={{ x: isLocationOn ? 24 : 0 }}
                      className="w-6 h-6 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>

                {/* Live Map */}
                <SquadMap />

                {/* Squad List */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-white/40">Active Members</h3>
                    <span className="text-[10px] font-bold text-neon-pink">{squadMembers.length} Online</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {squadMembers.length === 0 ? (
                      <div className="p-8 text-center glass rounded-3xl border border-dashed border-white/10">
                        <p className="text-white/40 text-sm italic">No friends on the radar yet...</p>
                      </div>
                    ) : (
                      squadMembers.map((member) => (
                        <div key={member.uid} className="glass p-4 rounded-2xl flex items-center justify-between border border-white/10">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-10 h-10 rounded-full border-2 overflow-hidden"
                              style={{ borderColor: member.color || '#FF00E5' }}
                            >
                              {member.photoURL ? (
                                <img src={member.photoURL} alt={member.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div 
                                  className="w-full h-full flex items-center justify-center text-white font-bold"
                                  style={{ backgroundColor: member.color || '#FF00E5' }}
                                >
                                  {member.displayName[0]}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{member.displayName}</p>
                              <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                                <span className="text-[9px] text-white/40 uppercase font-mono tracking-widest">Live Now</span>
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => sendVibeCheck(member)}
                            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
                          >
                            <Heart className="w-4 h-4 text-neon-pink group-active:scale-150 transition-transform" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-6"
          >
            {/* Saved Header */}
            <div className="space-y-4">
              <div className="flex justify-around border-b border-white/10">
                {['lists', 'labeled', 'maps'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSavedTab(tab as any)}
                    className={cn(
                      "pb-2 px-4 font-bold text-sm uppercase tracking-widest transition-all relative",
                      savedTab === tab ? "text-neon-blue" : "text-white/40"
                    )}
                  >
                    {tab}
                    {savedTab === tab && (
                      <motion.div 
                        layoutId="savedTabUnderline"
                        className="absolute bottom-0 left-0 right-0 h-1 bg-neon-blue rounded-full"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {savedTab === 'lists' && (
              <div className="space-y-6">
                <button className="w-full bg-neon-blue/10 border-2 border-neon-blue/20 text-neon-blue p-4 rounded-2xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest hover:bg-neon-blue/20 transition-all">
                  <Plus className="w-5 h-5" />
                  New list
                </button>

                <div className="flex flex-col gap-1">
                  {savedLists.map((list) => (
                    <div key={list.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-all cursor-pointer group rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-colors">
                          {list.icon}
                        </div>
                        <div>
                          <p className="font-bold text-lg leading-tight">{list.name}</p>
                          <p className="text-[10px] text-white/40 uppercase font-mono tracking-widest">
                            {list.isPrivate ? 'Private' : 'Public'} • {list.places} places
                          </p>
                        </div>
                      </div>
                      <button className="p-2 text-white/40 hover:text-white transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savedTab === 'labeled' && (
              <div className="flex flex-col gap-1">
                {labeledPlaces.map((place) => (
                  <div key={place.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-all cursor-pointer group rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-colors">
                        {place.icon}
                      </div>
                      <div>
                        <p className="font-bold text-lg leading-tight">{place.label}</p>
                        <p className="text-[10px] text-white/40 uppercase font-mono tracking-widest">
                          {place.address}
                        </p>
                      </div>
                    </div>
                    <button className="p-2 text-white/40 hover:text-white transition-colors">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {savedTab === 'maps' && (
              <div className="p-8 text-center glass rounded-[40px] border-2 border-dashed border-white/10">
                <div className="w-16 h-16 bg-neon-blue/20 rounded-full flex items-center justify-center border-2 border-neon-blue/40 mx-auto mb-4">
                  <MapIcon className="w-8 h-8 text-neon-blue" />
                </div>
                <h3 className="text-xl font-bold mb-2">No Saved Maps</h3>
                <p className="text-white/60 text-sm">Download maps for offline use or save your favorite routes here.</p>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm glass rounded-3xl p-2 flex justify-between items-center z-50">
        <button 
          onClick={() => setCurrentView('explore')}
          className={cn(
            "flex-1 py-3 flex flex-col items-center gap-1 transition-colors",
            currentView === 'explore' ? "text-neon-green" : "text-white/40 hover:text-white"
          )}
        >
          <Navigation className={cn("w-6 h-6", currentView === 'explore' && "fill-current")} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Explore</span>
        </button>
        <button 
          onClick={() => setCurrentView('squad')}
          className={cn(
            "flex-1 py-3 flex flex-col items-center gap-1 transition-colors",
            currentView === 'squad' ? "text-neon-pink" : "text-white/40 hover:text-white"
          )}
        >
          <Users className={cn("w-6 h-6", currentView === 'squad' && "fill-current")} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Squad</span>
        </button>
        <div className="w-12 h-12 bg-neon-green rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,255,0,0.3)] -translate-y-4 border-4 border-black cursor-pointer hover:scale-110 transition-transform">
          <Sparkles className="text-black w-6 h-6" />
        </div>
        <button className="flex-1 py-3 flex flex-col items-center gap-1 text-white/40 hover:text-white transition-colors">
          <Camera className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Vibes</span>
        </button>
        <button 
          onClick={() => setCurrentView('saved')}
          className={cn(
            "flex-1 py-3 flex flex-col items-center gap-1 transition-colors",
            currentView === 'saved' ? "text-neon-blue" : "text-white/40 hover:text-white"
          )}
        >
          <MapPin className={cn("w-6 h-6", currentView === 'saved' && "fill-current")} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Saved</span>
        </button>
      </nav>
    </div>
    </ErrorBoundary>
  );
}

export interface Step {
  instruction: string;
  distance: string;
}

export interface RouteOption {
  id: string;
  title: string;
  duration: string;
  distance: string;
  summary: string;
  steps: Step[];
  vibeMatch: number; // 0-100
  transportMode: 'walk' | 'bike' | 'transit' | 'car';
  crowdLevel: 'low' | 'medium' | 'high'; // low=green, medium=yellow, high=red
  safetyAlerts?: string[];
}

export interface RouteVibe {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface Location {
  lat: number;
  lng: number;
  address: string;
  name: string;
}

export const VIBES: RouteVibe[] = [
  {
    id: 'fast',
    name: 'Speedrun',
    icon: 'Zap',
    description: 'Get there ASAP. No distractions.',
    color: 'text-yellow-400',
  },
  {
    id: 'scenic',
    name: 'Main Character',
    icon: 'Camera',
    description: 'The most aesthetic route for your story.',
    color: 'text-pink-500',
  },
  {
    id: 'chill',
    name: 'Low Anxiety',
    icon: 'Wind',
    description: 'Quiet streets, fewer crowds, pure peace.',
    color: 'text-cyan-400',
  },
  {
    id: 'social',
    name: 'Hotspot',
    icon: 'Users',
    description: 'Pass by the trendiest spots on the way.',
    color: 'text-purple-500',
  },
];

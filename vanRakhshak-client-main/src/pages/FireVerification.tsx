import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFireAlerts, getFireAlertByDeviceId } from '@/api/fireAlerts';
import { getWeatherData, type WeatherData as ApiWeatherData } from '@/api/weatherApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  MapPin, 
  Thermometer, 
  Droplets, 
  Wind, 
  Flame, 
  Brain, 
  Shield,
  Navigation,
  Clock,
  Activity,
  Leaf,
  Mountain,
  Satellite,
  Cpu,
  Server
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Leaflet imports for map
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Turf.js for spatial analysis
import * as turf from '@turf/turf';

// Types
interface SensorReading {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  humidity: number;
  temp: number;
  smoke: number;
  isFire: boolean;
  timestamp: string;
  name: string;
  status: string;
}

interface MLPrediction {
  id: string;
  timestamp: string;
  input_data: {
    temperature: number;
    humidity: number;
    smoke: number;
    temp_max: number;
    temp_min: number;
    wind_speed: number;
    wind_gust: number;
  };
  prediction: number;
  level: string;
  emoji: string;
  message: string;
  probabilities?: Record<string, number>;
  status: 'processing' | 'completed' | 'failed';
}

interface ForestBoundary {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    name: string;
    type: string;
    area_km2?: number;
    district?: string;
    established?: string;
  };
}

// Realistic Uttarakhand Forest Boundaries with actual forest shapes
const UTTARAKHAND_FOREST_BOUNDARIES: ForestBoundary[] = [
  // Jim Corbett National Park
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.7644, 29.5311],
        [78.8234, 29.5511],
        [78.8834, 29.5211],
        [78.9234, 29.4911],
        [78.9434, 29.4511],
        [78.9234, 29.4111],
        [78.8834, 29.3911],
        [78.8434, 29.3711],
        [78.8034, 29.3511],
        [78.7634, 29.3711],
        [78.7234, 29.3911],
        [78.7034, 29.4211],
        [78.7134, 29.4511],
        [78.7334, 29.4811],
        [78.7444, 29.5111],
        [78.7644, 29.5311]
      ]]
    },
    properties: {
      name: 'Jim Corbett National Park',
      type: 'National Park',
      area_km2: 520.8,
      district: 'Nainital, Pauri Garhwal',
      established: '1936'
    }
  },
  // Rajaji National Park
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [77.8441, 30.1122],
        [78.0441, 30.1422],
        [78.1241, 30.1122],
        [78.1541, 30.0822],
        [78.1741, 30.0422],
        [78.1541, 30.0022],
        [78.1141, 29.9722],
        [78.0741, 29.9522],
        [78.0341, 29.9322],
        [77.9941, 29.9422],
        [77.9541, 29.9622],
        [77.9241, 29.9922],
        [77.9041, 30.0222],
        [77.9141, 30.0522],
        [77.9341, 30.0822],
        [77.8441, 30.1122]
      ]]
    },
    properties: {
      name: 'Rajaji National Park',
      type: 'National Park',
      area_km2: 820.4,
      district: 'Haridwar, Dehradun, Pauri Garhwal',
      established: '1983'
    }
  },
  // Valley of Flowers National Park
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.5822, 30.7233],
        [79.6022, 30.7333],
        [79.6222, 30.7233],
        [79.6322, 30.7133],
        [79.6422, 30.7033],
        [79.6322, 30.6933],
        [79.6222, 30.6833],
        [79.6122, 30.6733],
        [79.6022, 30.6633],
        [79.5922, 30.6733],
        [79.5822, 30.6833],
        [79.5722, 30.6933],
        [79.5622, 30.7033],
        [79.5722, 30.7133],
        [79.5822, 30.7233]
      ]]
    },
    properties: {
      name: 'Valley of Flowers National Park',
      type: 'National Park',
      area_km2: 87.5,
      district: 'Chamoli',
      established: '1982'
    }
  },
  // Nanda Devi National Park
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.7344, 30.4455],
        [79.8544, 30.4755],
        [79.9044, 30.4455],
        [79.9344, 30.4155],
        [79.9544, 30.3855],
        [79.9344, 30.3555],
        [79.9044, 30.3255],
        [79.8744, 30.2955],
        [79.8444, 30.2755],
        [79.8144, 30.2855],
        [79.7844, 30.3055],
        [79.7544, 30.3255],
        [79.7344, 30.3555],
        [79.7244, 30.3855],
        [79.7344, 30.4155],
        [79.7344, 30.4455]
      ]]
    },
    properties: {
      name: 'Nanda Devi National Park',
      type: 'National Park',
      area_km2: 630.3,
      district: 'Chamoli',
      established: '1982'
    }
  },
  // Gangotri National Park
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.9122, 30.9233],
        [79.1122, 30.9533],
        [79.1822, 30.9233],
        [79.2122, 30.8933],
        [79.2322, 30.8633],
        [79.2122, 30.8333],
        [79.1822, 30.8033],
        [79.1522, 30.7733],
        [79.1222, 30.7533],
        [79.0922, 30.7633],
        [79.0622, 30.7833],
        [79.0322, 30.8033],
        [79.0122, 30.8333],
        [79.0022, 30.8633],
        [79.0122, 30.8933],
        [78.9122, 30.9233]
      ]]
    },
    properties: {
      name: 'Gangotri National Park',
      type: 'National Park',
      area_km2: 2390.0,
      district: 'Uttarkashi',
      established: '1989'
    }
  },
  // Govind Pashu Vihar Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.3422, 31.0833],
        [78.5422, 31.1133],
        [78.6222, 31.0833],
        [78.6522, 31.0533],
        [78.6722, 31.0233],
        [78.6522, 30.9933],
        [78.6222, 30.9633],
        [78.5922, 30.9333],
        [78.5622, 30.9133],
        [78.5322, 30.9233],
        [78.5022, 30.9433],
        [78.4722, 30.9633],
        [78.4422, 30.9933],
        [78.4322, 31.0233],
        [78.4422, 31.0533],
        [78.3422, 31.0833]
      ]]
    },
    properties: {
      name: 'Govind Pashu Vihar Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 958.0,
      district: 'Uttarkashi',
      established: '1955'
    }
  },
  // Kedarnath Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.0644, 30.6811],
        [79.2644, 30.7111],
        [79.3444, 30.6811],
        [79.3744, 30.6511],
        [79.3944, 30.6211],
        [79.3744, 30.5911],
        [79.3444, 30.5611],
        [79.3144, 30.5311],
        [79.2844, 30.5111],
        [79.2544, 30.5211],
        [79.2244, 30.5411],
        [79.1944, 30.5611],
        [79.1644, 30.5911],
        [79.1544, 30.6211],
        [79.1644, 30.6511],
        [79.0644, 30.6811]
      ]]
    },
    properties: {
      name: 'Kedarnath Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 975.2,
      district: 'Chamoli, Rudraprayag',
      established: '1972'
    }
  },
  // Askot Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [80.4422, 29.9233],
        [80.5622, 29.9533],
        [80.6222, 29.9233],
        [80.6522, 29.8933],
        [80.6722, 29.8633],
        [80.6522, 29.8333],
        [80.6222, 29.8033],
        [80.5922, 29.7733],
        [80.5622, 29.7533],
        [80.5322, 29.7633],
        [80.5022, 29.7833],
        [80.4722, 29.8033],
        [80.4422, 29.8333],
        [80.4322, 29.8633],
        [80.4422, 29.8933],
        [80.4422, 29.9233]
      ]]
    },
    properties: {
      name: 'Askot Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 600.0,
      district: 'Pithoragarh',
      established: '1986'
    }
  },
  // Binsar Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.6844, 29.6911],
        [79.7244, 29.7111],
        [79.7444, 29.6911],
        [79.7544, 29.6711],
        [79.7644, 29.6511],
        [79.7544, 29.6311],
        [79.7444, 29.6111],
        [79.7244, 29.5911],
        [79.7044, 29.5811],
        [79.6844, 29.5911],
        [79.6644, 29.6111],
        [79.6544, 29.6311],
        [79.6444, 29.6511],
        [79.6544, 29.6711],
        [79.6644, 29.6911],
        [79.6844, 29.6911]
      ]]
    },
    properties: {
      name: 'Binsar Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 47.04,
      district: 'Almora',
      established: '1988'
    }
  },
  // Mussoorie Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.0322, 30.4633],
        [78.1322, 30.4833],
        [78.1722, 30.4633],
        [78.1922, 30.4333],
        [78.2022, 30.4033],
        [78.1922, 30.3733],
        [78.1722, 30.3433],
        [78.1522, 30.3233],
        [78.1322, 30.3133],
        [78.1122, 30.3233],
        [78.0922, 30.3433],
        [78.0722, 30.3733],
        [78.0622, 30.4033],
        [78.0722, 30.4333],
        [78.0922, 30.4633],
        [78.0322, 30.4633]
      ]]
    },
    properties: {
      name: 'Mussoorie Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 10.82,
      district: 'Dehradun',
      established: '1993'
    }
  },
  // Sonanadi Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.8844, 29.6233],
        [78.9644, 29.6433],
        [79.0044, 29.6233],
        [79.0244, 29.5933],
        [79.0344, 29.5633],
        [79.0244, 29.5333],
        [79.0044, 29.5033],
        [78.9844, 29.4833],
        [78.9644, 29.4733],
        [78.9444, 29.4833],
        [78.9244, 29.5033],
        [78.9044, 29.5333],
        [78.8944, 29.5633],
        [78.9044, 29.5933],
        [78.9244, 29.6233],
        [78.8844, 29.6233]
      ]]
    },
    properties: {
      name: 'Sonanadi Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 301.18,
      district: 'Pauri Garhwal',
      established: '1987'
    }
  },
  // Nandhaur Wildlife Sanctuary
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.4022, 29.3833],
        [79.4822, 29.4033],
        [79.5222, 29.3833],
        [79.5422, 29.3533],
        [79.5522, 29.3233],
        [79.5422, 29.2933],
        [79.5222, 29.2633],
        [79.5022, 29.2433],
        [79.4822, 29.2333],
        [79.4622, 29.2433],
        [79.4422, 29.2633],
        [79.4222, 29.2933],
        [79.4122, 29.3233],
        [79.4222, 29.3533],
        [79.4422, 29.3833],
        [79.4022, 29.3833]
      ]]
    },
    properties: {
      name: 'Nandhaur Wildlife Sanctuary',
      type: 'Wildlife Sanctuary',
      area_km2: 269.96,
      district: 'Nainital, Champawat',
      established: '2012'
    }
  },
  // Local Forest 1 - Tehri Region
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.416878, 30.369623], // 1st point
        [78.419245, 30.361441], // 2nd point
        [78.408173, 30.363292], // 3rd point
        [78.410233, 30.371068], // 4th point
        [78.416878, 30.369623]  // Close the polygon
      ]]
    },
    properties: {
      name: 'Tehri Forest Area 1',
      type: 'Reserved Forest',
      area_km2: 12.5,
      district: 'Tehri Garhwal',
      established: '1985'
    }
  },
  // Local Forest 2 - Tehri Region
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.426713, 30.390172], // 1st point
        [78.430832, 30.384175], // 2nd point
        [78.421305, 30.371661], // 3rd point
        [78.413409, 30.376548], // 4th point
        [78.426713, 30.390172]  // Close the polygon
      ]]
    },
    properties: {
      name: 'Tehri Forest Area 2',
      type: 'Reserved Forest',
      area_km2: 15.2,
      district: 'Tehri Garhwal',
      established: '1988'
    }
  },
  // Local Forest 3 - Tehri Region
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.386995, 30.349993], // 1st point
        [78.388884, 30.346780], // 2nd point
        [78.382854, 30.347706], // 3rd point
        [78.387189, 30.349428], // 4th point
        [78.386995, 30.349993]  // Close the polygon
      ]]
    },
    properties: {
      name: 'Tehri Forest Area 3',
      type: 'Reserved Forest',
      area_km2: 8.7,
      district: 'Tehri Garhwal',
      established: '1990'
    }
  },
  // Local Forest 4 - Tehri Region
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.481396, 30.355406], // 1st point
        [78.471442, 30.357887], // 2nd point
        [78.473138, 30.364052], // 3rd point
        [78.480562, 30.361238], // 4th point
        [78.481396, 30.355406]  // Close the polygon
      ]]
    },
    properties: {
      name: 'Tehri Forest Area 4',
      type: 'Reserved Forest',
      area_km2: 11.3,
      district: 'Tehri Garhwal',
      established: '1987'
    }
  }
];

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const fireIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE3LjY2IDExQzE4Ljk2IDEwLjQ3IDIwLjA2IDkuNDIgMjAuODIgOC4xQzIxLjU4IDYuNzggMjIgNS4yNCAyMiAzLjVDMjIgMy4wNyAyMS45IDIuNjUgMjEuNzQgMi4yNkMxOS41MSAzLjQ5IDE3LjY2IDUuNDIgMTYuNTQgNy44NkMxNS40MiAxMC4zIDE1LjA3IDEzLjA4IDE1LjUgMTUuNEMxNS41NyAxNi4wMSAxNS44NCAxNi41OSAxNi4yOCAxNy4wN0MxNi43MiAxNy41NSAxNy4zMSAxNy44OSAxNy45NiAxOC4wNEMxOC42MSAxOC4xOSAxOS4yOCAxOC4xMyAxOS45MSAxNy44OEMyMC41NCAxNy42MyAyMS4wOSAxNy4xOSAyMS41IDE2LjYyQzIxLjkxIDE2LjA1IDIyLjE2IDE1LjM2IDIyLjIzIDE0LjY0QzIyLjMgMTMuOTIgMjIuMTggMTMuMTkgMjEuODkgMTIuNTNDMjEuNiAxMS44NyAyMS4xNSAxMS4zIDIwLjU5IDEwLjg3QzIwLjAzIDEwLjQ0IDE5LjM3IDEwLjE2IDE4LjY3IDEwLjA2QzE4LjI0IDEwLjAxIDE3LjgxIDEwLjA3IDE3LjQxIDEwLjI0QzE3LjAxIDEwLjQxIDE2LjY2IDEwLjY4IDE2LjM5IDExLjA0QzE2LjEyIDExLjQgMTUuOTQgMTEuODMgMTUuODggMTIuMjhDMTUuODIgMTIuNzMgMTUuODggMTMuMTkgMTYuMDYgMTMuNjFDMTYuMjQgMTQuMDMgMTYuNTMgMTQuNCAxNi45MiAxNC42OEMxNy4zMSAxNC45NiAxNy43OCAxNS4xMyAxOC4yNyAxNS4xN0MxOC43NiAxNS4yMSAxOS4yNSAxNS4xMiAxOS42OSAxNC45MkMyMC4xMyAxNC43MiAyMC41IDE0LjQxIDIwLjc2IDE0LjAyQzIxLjAyIDEzLjYzIDIxLjE2IDEzLjE3IDIxLjE2IDEyLjdDMjEuMTYgMTIuMjMgMjEuMDIgMTEuNzcgMjAuNzYgMTEuMzhDMjAuNSAxMC45OSAyMC4xMyAxMC42OCAxOS42OSAxMC40OEMxOS4yNSAxMC4yOCAxOC43NiAxMC4xOSAxOC4yNyAxMC4yM0MxNy43OCAxMC4yNyAxNy4zMSAxMC40NCAxNi45MiAxMC43MkMxNi41MyAxMS4wIDE2LjI0IDExLjM3IDE2LjA2IDExLjc5QzE1Ljg4IDEyLjIxIDE1LjgyIDEyLjY3IDE1Ljg4IDEzLjEyQzE1Ljk0IDEzLjU3IDE2LjEyIDE0LjAxIDE2LjM5IDE0LjM2QzE2LjY2IDE0LjcxIDE3LjAxIDE0Ljk4IDE3LjQxIDE1LjE1QzE3LjgxIDE1LjMyIDE4LjI0IDE1LjM4IDE4LjY3IDE1LjMzQzE5LjEgMTUuMjggMTkuNTEgMTUuMTIgMTkuODUgMTQuODdDMjAuMTkgMTQuNjIgMjAuNDUgMTQuMjggMjAuNiAxMy44OEMyMC43NSAxMy40OCAyMC43OSAxMy4wNCAyMC43MiAxMi42MkMyMC42NSAxMi4yIDIwLjQ3IDExLjggMjAuMiAxMS40NkMxOS45MyAxMS4xMiAxOS41OCAxMC44NSAxOS4xOCAxMC42OEMxOC43OCAxMC41MSAxOC4zNCAxMC40NSAxNy45IDEwLjUxQzE3LjQ2IDEwLjU3IDE3LjA0IDEwLjc0IDE2LjY4IDExLjAxQzE2LjMyIDExLjI4IDE2LjAzIDExLjY0IDE1LjgzIDEyLjA2QzE1LjYzIDEyLjQ4IDE1LjUzIDEyLjk1IDE1LjU0IDEzLjQyQzE1LjU1IDEzLjg5IDE1LjY3IDE0LjM1IDE1Ljg5IDE0Ljc2QzE2LjExIDE1LjE3IDE2LjQyIDE1LjUyIDE2LjggMTUuNzhDMTcuMTggMTYuMDQgMTcuNjIgMTYuMiAxOC4wOCAxNi4yNUMxOC41NCAxNi4zIDE5LjAxIDE2LjI0IDE5LjQ1IDE2LjA3QzE5Ljg5IDE1LjkgMjAuMjggMTUuNjMgMjAuNTkgMTUuMjdDMjAuOSAxNC45MSAyMS4xMiAxNC40NyAyMS4yMyAxNC4wMkMyMS4zNCAxMy41NyAyMS4zNCAxMy4wOSAyMS4yMiAxMi42NEMyMS4xIDEyLjE5IDIwLjg3IDExLjc3IDIwLjU0IDExLjQyQzIwLjIxIDExLjA3IDE5LjggMTAuOCAxOS4zMyAxMC42M0MxOC44NiAxMC40NiAxOC4zNSAxMC40IDE3Ljg1IDEwLjQ2QzE3LjM1IDEwLjUyIDE2Ljg4IDEwLjcgMTYuNDcgMTAuOTlDMTYuMDYgMTEuMjggMTUuNzIgMTEuNjcgMTUuNDggMTIuMTJDMTUuMjQgMTIuNTcgMTUuMTEgMTMuMDggMTUuMSAxMy42QzE1LjA5IDE0LjEyIDE1LjIgMTQuNjMgMTUuNDIgMTUuMDlDMTUuNjQgMTUuNTUgMTUuOTcgMTUuOTUgMTYuMzggMTYuMjZDMTYuNzkgMTYuNTcgMTcuMjcgMTYuNzggMTcuNzggMTYuODdDMTguMjkgMTYuOTYgMTguODIgMTYuOTMgMTkuMzIgMTYuNzhDMTkuODIgMTYuNjMgMjAuMjcgMTYuMzcgMjAuNjQgMTYuMDJDMjEuMDEgMTUuNjcgMjEuMjkgMTUuMjQgMjEuNDYgMTQuNzZDMjEuNjMgMTQuMjggMjEuNjkgMTMuNzYgMjEuNjMgMTMuMjVDMjEuNTcgMTIuNzQgMjEuNCAxMi4yNSAyMS4xMiAxMS44MkMyMC44NCAxMS4zOSAyMC40NiAxMS4wMiAyMC4wMiAxMC43NEMxOS41OCAxMC40NiAxOS4wOCAxMC4yOSAxOC41NiAxMC4yNUMxOC4wNCAxMC4yMSAxNy41MiAxMC4zIDE3LjA0IDEwLjUyQzE2LjU2IDEwLjc0IDE2LjE0IDExLjA4IDE1LjggMTEuNTFDMTUuNDYgMTEuOTQgMTUuMjIgMTIuNDUgMTUuMDkgMTMuMDFDMTQuOTYgMTMuNTcgMTQuOTUgMTQuMTUgMTUuMDYgMTQuNzJDMTUuMTcgMTUuMjkgMTUuNCAxNS44MiAxNS43MyAxNi4yOEMxNi4wNiAxNi43NCAxNi40OSAxNy4xMSAxNi45OSAxNy4zOEMxNy40OSAxNy42NSAxOC4wNSAxNy44MSAxOC42MiAxNy44NUMxOS4xOSAxNy44OSAxOS43NiAxNy44MSAyMC4zIDE3LjYyQzIwLjg0IDE3LjQzIDIxLjMzIDE3LjEzIDIxLjc1IDE2LjczQzIyLjE3IDE2LjMzIDIyLjUxIDE1Ljg0IDIyLjczIDE1LjI5QzIyLjk1IDE0Ljc0IDIzLjA1IDE0LjE0IDIzLjAyIDEzLjU0QzIyLjk5IDEyLjk0IDIyLjgzIDEyLjM1IDIyLjU1IDExLjgyQzIyLjI3IDExLjI5IDIxLjg4IDEwLjgzIDIxLjQxIDEwLjQ3QzIwLjk0IDEwLjExIDIwLjQgOS44NiAxOS44MiA5LjczQzE5LjI0IDkuNiAxOC42NCA5LjYgMTguMDYgOS43MkMxNy40OCA5Ljg0IDE2LjkzIDEwLjA4IDE2LjQ1IDEwLjQ0QzE1Ljk3IDEwLjggMTUuNTcgMTEuMjcgMTUuMjggMTEuODJDMTQuOTkgMTIuMzcgMTQuODIgMTIuOTkgMTQuNzggMTMuNjNDMTQuNzQgMTQuMjcgMTQuODMgMTQuOTEgMTUuMDUgMTUuNTFDMTUuMjcgMTYuMTEgMTUuNjIgMTYuNjYgMTYuMDcgMTcuMTNDMTYuNTIgMTcuNiAxNy4wNyAxNy45NyAxNy42OCAxOC4yM0MxOC4yOSAxOC40OSAxOC45NSAxOC42MiAxOS42MiAxOC42MkMyMC4yOSAxOC42MiAyMC45NSAxOC40OSAyMS41NiAxOC4yM0MyMi4xNyAxNy45NyAyMi43MiAxNy42IDIzLjE3IDE3LjEzQzIzLjYyIDE2LjY2IDIzLjk3IDE2LjExIDI0LjE5IDE1LjUxQzI0LjQxIDE0LjkxIDI0LjUgMTQuMjcgMjQuNDYgMTMuNjNDMjQuNDIgMTIuOTkgMjQuMjUgMTIuMzcgMjMuOTYgMTEuODJDMjMuNjcgMTEuMjcgMjMuMjcgMTAuOCAyMi43OSAxMC40NEMyMi4zMSAxMC4wOCAyMS43NiA5Ljg0IDIxLjE4IDkuNzJDMjAuNiA5LjYgMTkuOTkgOS42IDE5LjQxIDkuNzNDMTguODMgOS44NiAxOC4yOSAxMC4xMSAxNy44MiAxMC40N0MxNy4zNSAxMC44MyAxNi45NiAxMS4yOSAxNi42OCAxMS44MkMxNi40IDEyLjM1IDE2LjI0IDEyLjk0IDE2LjIxIDEzLjU0QzE2LjE4IDE0LjE0IDE2LjI4IDE0Ljc0IDE2LjUgMTUuMjlDMTYuNzIgMTUuODQgMTcuMDYgMTYuMzMgMTcuNDggMTYuNzNDMTcuOSAxNy4xMyAxOC4zOSAxNy40MyAxOC45MyAxNy42MkMxOS40NyAxNy44MSAyMC4wNCAxNy44OSAyMC42MSAxNy44NUMyMS4xOCAxNy44MSAyMS43NCAxNy42NSAyMi4yNCAxNy4zOEMyMi43NCAxNy4xMSAyMy4xNyAxNi43NCAyMy41IDE2LjI4QzIzLjgzIDE1LjgyIDI0LjA2IDE1LjI5IDI0LjE3IDE0LjcyQzI0LjI4IDE0LjE1IDI0LjI3IDEzLjU3IDI0LjE0IDEzLjAxQzI0LjAxIDEyLjQ1IDIzLjc3IDExLjk0IDIzLjQzIDExLjUxQzIzLjA5IDExLjA4IDIyLjY3IDEwLjc0IDIyLjE5IDEwLjUyQzIxLjcxIDEwLjMgMjEuMTkgMTAuMjEgMjAuNjcgMTAuMjVDMjAuMTUgMTAuMjkgMTkuNjUgMTAuNDYgMTkuMjEgMTAuNzRDMTguNzcgMTEuMDIgMTguMzkgMTEuMzkgMTguMTEgMTEuODJDMTcuODMgMTIuMjUgMTcuNjYgMTIuNzQgMTcuNiAxMy4yNUMxNy41NCAxMy43NiAxNy42IDE0LjI4IDE3Ljc3IDE0Ljc2QzE3Ljk0IDE1LjI0IDE4LjIyIDE1LjY3IDE4LjU5IDE2LjAyQzE4Ljk2IDE2LjM3IDE5LjQxIDE2LjYzIDE5LjkxIDE2Ljc4QzIwLjQxIDE2LjkzIDIwLjk0IDE2Ljk2IDIxLjQ1IDE2Ljg3QzIxLjk2IDE2Ljc4IDIyLjQ0IDE2LjU3IDIyLjg1IDE2LjI2QzIzLjI2IDE1Ljk1IDIzLjU5IDE1LjU1IDIzLjgxIDE1LjA5QzI0LjAzIDE0LjYzIDI0LjE0IDE0LjEyIDI0LjEzIDEzLjZDMjQuMTIgMTMuMDggMjMuOTkgMTIuNTcgMjMuNzUgMTIuMTJDMjMuNTEgMTEuNjcgMjMuMTcgMTEuMjggMjIuNzYgMTAuOTlDMjIuMzUgMTAuNyAyMS44OCAxMC41MiAyMS4zOCAxMC40NkMyMC44OCAxMC40IDIwLjM3IDEwLjQ2IDE5LjkgMTAuNjNDMTkuNDMgMTAuOCAxOS4wMiAxMS4wNyAxOC42OSAxMS40MkMxOC4zNiAxMS43NyAxOC4xMyAxMi4xOSAxOC4wMSAxMi42NEMxNy44OSAxMy4wOSAxNy44OSAxMy41NyAxOC4wIDE0LjAyQzE4LjExIDE0LjQ3IDE4LjMzIDE0LjkxIDE4LjY0IDE1LjI3QzE4Ljk1IDE1LjYzIDE5LjM0IDE1LjkgMTkuNzggMTYuMDdDMjAuMjIgMTYuMjQgMjAuNjkgMTYuMyAyMS4xNSAxNi4yNUMyMS42MSAxNi4yIDIyLjA1IDE2LjA0IDIyLjQzIDE1Ljc4QzIyLjgxIDE1LjUyIDIzLjEyIDE1LjE3IDIzLjM0IDE0Ljc2QzIzLjU2IDE0LjM1IDIzLjU2IDEzLjg5IDIzLjY5IDEzLjQyQzIzLjcgMTIuOTUgMjMuNiAxMi40OCAyMy40IDEyLjA2QzIzLjIgMTEuNjQgMjIuOTEgMTEuMjggMjIuNTUgMTEuMDFDMjIuMTkgMTAuNzQgMjEuNzcgMTAuNTcgMjEuMzMgMTAuNTFDMjAuODkgMTAuNDUgMjAuNDUgMTAuNTEgMjAuMDUgMTAuNjhDMTkuNjUgMTAuODUgMTkuMyAxMS4xMiAxOS4wMyAxMS40NkMxOC43NiAxMS44IDE4LjU4IDEyLjIgMTguNTEgMTIuNjJDMTguNDQgMTMuMDQgMTguNDggMTMuNDggMTguNjMgMTMuODhDMTguNzggMTQuMjggMTkuMDQgMTQuNjIgMTkuMzggMTQuODdDMTkuNzIgMTUuMTIgMjAuMTMgMTUuMjggMjAuNTYgMTUuMzNDMjAuOTkgMTUuMzggMjEuNDIgMTUuMzIgMjEuODIgMTUuMTVDMjIuMjIgMTQuOTggMjIuNTcgMTQuNzEgMjIuODQgMTQuMzZDMjMuMTEgMTQuMDEgMjMuMjkgMTMuNTcgMjMuMzUgMTMuMTJDMjMuNDEgMTIuNjcgMjMuMzUgMTIuMjEgMjMuMTcgMTEuNzlDMjIuOTkgMTEuMzcgMjIuNyAxMS4wIDIyLjMxIDEwLjcyQzIxLjkyIDEwLjQ0IDIxLjQ1IDEwLjI3IDIwLjk2IDEwLjIzQzIwLjQ3IDEwLjE5IDE5Ljk4IDEwLjI4IDE5LjU0IDEwLjQ4QzE5LjEgMTAuNjggMTguNzMgMTAuOTkgMTguNDcgMTEuMzhDMTguMjEgMTEuNzcgMTguMDcgMTIuMjMgMTguMDcgMTIuN0MxOC4wNyAxMy4xNyAxOC4yMSAxMy42MyAxOC40NyAxNC4wMkMxOC43MyAxNC40MSAxOS4xIDE0LjcyIDE5LjU0IDE0LjkyQzE5Ljk4IDE1LjEyIDIwLjQ3IDE1LjIxIDIwLjk2IDE1LjE3QzIxLjQ1IDE1LjEzIDIxLjkyIDE0Ljk2IDIyLjMxIDE0LjY4QzIyLjcgMTQuNCAyMi45OSAxNC4wMyAyMy4xNyAxMy42MUMyMy4zNSAxMy4xOSAyMy40MSAxMi43MyAyMy4zNSAxMi4yOEMyMy4yOSAxMS44MyAyMy4xMSAxMS40IDIyLjg0IDExLjA0QzIyLjU3IDEwLjY4IDIyLjIyIDEwLjQxIDIxLjgyIDEwLjI0QzIxLjQyIDEwLjA3IDIwLjk5IDEwLjAxIDIwLjU2IDEwLjA2QzIwLjEzIDEwLjExIDE5LjcxIDEwLjI3IDE5LjM1IDEwLjUzQzE4Ljk5IDEwLjc5IDE4LjcgMTEuMTQgMTguNSAxMS41NUMxOC4zIDExLjk2IDE4LjE5IDEyLjQyIDE4LjE5IDEyLjg5QzE4LjE5IDEzLjM2IDE4LjMgMTMuODIgMTguNSAxNC4yM0MxOC43IDE0LjY0IDE4Ljk5IDE1IDE5LjM1IDE1LjI3QzE5LjcxIDE1LjU0IDIwLjEzIDE1LjcxIDIwLjU2IDE1Ljc3QzIwLjk5IDE1LjgzIDIxLjQyIDE1Ljc3IDIxLjgyIDE1LjZDMjIuMjIgMTUuNDMgMjIuNTcgMTUuMTYgMjIuODQgMTQuODBDMjMuMTEgMTQuNDQgMjMuMjkgMTQuMDEgMjMuMzUgMTMuNTZDMjMuNDEgMTMuMTEgMjMuMzUgMTIuNjUgMjMuMTcgMTIuMjNDMjIuOTkgMTEuODEgMjIuNyAxMS40NCAyMi4zMSAxMS4xNkMyMS45MiAxMC44OCAyMS40NSAxMC43MSAyMC45NiAxMC42N0MyMC40NyAxMC42MyAxOS45OCAxMC43MiAxOS41NCAxMC45MkMxOS4xIDExLjEyIDE4LjczIDExLjQzIDE4LjQ3IDExLjgyQzE4LjIxIDEyLjIxIDE4LjA3IDEyLjY3IDE4LjA3IDEzLjE0QzE4LjA3IDEzLjYxIDE4LjIxIDE0LjA3IDE4LjQ3IDE0LjQ2QzE4LjczIDE0Ljg1IDE5LjEgMTUuMTYgMTkuNTQgMTUuMzZDMjAuMTUgMTUuNjQgMjAuODMgMTUuNjQgMjEuNDQgMTUuMzZDMjIuMDUgMTUuMDggMjIuNDkgMTQuNTQgMjIuNjIgMTMuODlDMjIuNzUgMTMuMjQgMjIuNTUgMTIuNTYgMjIuMDggMTIuMDdDMjEuNjEgMTEuNTggMjAuOTMgMTEuMzQgMjAuMjIgMTEuMzRIMTcuNjZaIiBmaWxsPSJyZWQiLz4KPC9zdmc+',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const sensorIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMzODg4ZmYiIHN0cm9rZT0iIzE3NjFiMyIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjQiIGZpbGw9IiNmZmYiLz4KPC9zdmc+',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// REAL ML Model API Call - ONLY THIS ONE IS USED
const predictFireWithML = async (data: {
  temperature: number;
  humidity: number;
  smoke: number;
  temp_max: number;
  temp_min: number;
  wind_speed: number;
  wind_gust: number;
}): Promise<{
  prediction: number;
  level: string;
  emoji: string;
  message: string;
  probabilities?: Record<string, number>;
}> => {
  const response = await fetch('https://forest-fire-api2.onrender.com/predict', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`ML API error: ${response.status}`);
  }

  const result = await response.json();
  return result;
};

// Forest checking function using Turf.js
const checkIfInForest = (lat: number, lng: number, forestBoundaries: ForestBoundary[]): { isInForest: boolean; forestName?: string; forestType?: string } => {
  const point = turf.point([lng, lat]);
  
  for (const forest of forestBoundaries) {
    const polygon = turf.polygon(forest.geometry.coordinates as number[][][]);
    if (turf.booleanPointInPolygon(point, polygon)) {
      return { 
        isInForest: true, 
        forestName: forest.properties.name,
        forestType: forest.properties.type
      };
    }
  }
  
  return { isInForest: false };
};

// Map controller component
const MapController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, 10);
  }, [center, map]);
  
  return null;
};

// Function to get forest color based on type
const getForestColor = (forestType: string) => {
  switch (forestType) {
    case 'National Park':
      return { fillColor: '#22c55e', color: '#16a34a' };
    case 'Wildlife Sanctuary':
      return { fillColor: '#3b82f6', color: '#1d4ed8' };
    case 'Reserved Forest':
      return { fillColor: '#eab308', color: '#ca8a04' };
    default:
      return { fillColor: '#22c55e', color: '#16a34a' };
  }
};

// Helper function to get prediction display info
const getPredictionDisplayInfo = (prediction: MLPrediction) => {
  if (prediction.status === 'processing') {
    return {
      color: 'purple',
      icon: Activity,
      title: 'Analysis in Progress',
      description: 'Processing sensor data...',
      badge: 'PROCESSING',
      badgeClass: 'bg-purple-500'
    };
  }
  
  if (prediction.status === 'failed') {
    return {
      color: 'gray',
      icon: XCircle,
      title: 'Analysis Failed',
      description: 'Failed to get analysis',
      badge: 'ERROR',
      badgeClass: 'bg-gray-500'
    };
  }

  // Handle ML API predictions (0, 1, 2)
  switch (prediction.prediction) {
    case 1: // High Risk
      return {
        color: 'red',
        icon: XCircle,
        title: 'Fire Risk Detected',
        description: prediction.message,
        badge: 'HIGH RISK',
        badgeClass: 'bg-red-500'
      };
    case 2: // Borderline
      return {
        color: 'orange',
        icon: AlertTriangle,
        title: 'Borderline Risk',
        description: prediction.message,
        badge: 'BORDERLINE',
        badgeClass: 'bg-orange-500'
      };
    case 0: // Safe
    default:
      return {
        color: 'green',
        icon: CheckCircle,
        title: 'No Fire Risk',
        description: prediction.message,
        badge: 'LOW RISK',
        badgeClass: 'bg-emerald-500'
      };
  }
};

const FireVerification: React.FC = () => {
  const [selectedSensorId, setSelectedSensorId] = useState<string>('');
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [mlPredictions, setMlPredictions] = useState<MLPrediction[]>([]);
  const [isMlProcessing, setIsMlProcessing] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    sensorAlert: boolean;
    mlPrediction: number; // 0, 1, 2 from API
    inForest: boolean;
    finalVerdict: 'CONFIRMED' | 'FALSE_ALARM' | 'INCONCLUSIVE';
    confidence: number;
  } | null>(null);
  
  const navigate = useNavigate();
  const mapRef = useRef<L.Map>(null);

  // Fetch all available sensors
  const { data: allSensorsData, isLoading: isLoadingSensors } = useQuery({
    queryKey: ['allFireAlerts'],
    queryFn: getFireAlerts,
    refetchInterval: 10000,
  });

  // Fetch selected sensor data
  const { data: apiResponse, isLoading: isLoadingSensor } = useQuery({
    queryKey: ['fireAlerts', selectedSensorId],
    queryFn: () => selectedSensorId ? getFireAlertByDeviceId(selectedSensorId) : null,
    refetchInterval: 5000,
    enabled: !!selectedSensorId,
  });

  // Process sensor data
  useEffect(() => {
    if (apiResponse && selectedSensorId) {
      const newReading: SensorReading = {
        id: apiResponse.id || Date.now().toString(),
        deviceId: apiResponse.deviceId,
        latitude: apiResponse.latitude,
        longitude: apiResponse.longitude,
        humidity: apiResponse.humidity,
        temp: apiResponse.temp,
        smoke: apiResponse.smoke,
        isFire: apiResponse.isFire,
        timestamp: apiResponse.timestamp || new Date().toISOString(),
        name: `Sensor ${apiResponse.deviceId}`,
        status: apiResponse.isFire ? 'warning' : 'active'
      };

      setSensorReadings(prev => [newReading, ...prev.slice(0, 10)]);
    }
  }, [apiResponse, selectedSensorId]);

  // Process ML prediction using REAL API - ONLY THIS PREDICTION IS USED
  const processMlPrediction = useCallback(async (reading: SensorReading) => {
    const predictionId = `ml-api-${Date.now()}`;
    
    // Prepare input data according to your ML model requirements
    const inputData = {
      temperature: reading.temp,
      humidity: reading.humidity,
      smoke: reading.smoke,
      temp_max: reading.temp + 5, // Using same calculation as before
      temp_min: reading.temp - 5,
      wind_speed: 5, // Default values - replace with actual weather data if available
      wind_gust: 7
    };

    // Add processing prediction
    const processingPrediction: MLPrediction = {
      id: predictionId,
      timestamp: new Date().toISOString(),
      input_data: inputData,
      prediction: 0,
      level: 'Processing',
      emoji: '⏳',
      message: 'AI analysis in progress...',
      status: 'processing'
    };

    setMlPredictions(prev => [processingPrediction, ...prev.slice(0, 5)]);
    setIsMlProcessing(true);

    try {
      const result = await predictFireWithML(inputData);
      
      const completedPrediction: MLPrediction = {
        ...processingPrediction,
        prediction: result.prediction,
        level: result.level,
        emoji: result.emoji,
        message: result.message,
        probabilities: result.probabilities,
        status: 'completed'
      };

      setMlPredictions(prev => 
        prev.map(p => p.id === predictionId ? completedPrediction : p)
      );

      return completedPrediction;
    } catch (error) {
      console.error('ML Prediction error:', error);
      const failedPrediction: MLPrediction = {
        ...processingPrediction,
        level: 'Error',
        emoji: '❌',
        message: 'Failed to get AI analysis',
        status: 'failed'
      };

      setMlPredictions(prev => 
        prev.map(p => p.id === predictionId ? failedPrediction : p)
      );
      
      return null;
    } finally {
      setIsMlProcessing(false);
    }
  }, []);

  // Run verification when new readings arrive
  useEffect(() => {
    if (sensorReadings.length > 0) {
      const latestReading = sensorReadings[0];
      
      // Check if in forest
      const forestCheck = checkIfInForest(
        latestReading.latitude, 
        latestReading.longitude, 
        UTTARAKHAND_FOREST_BOUNDARIES
      );

      // Process ML API prediction
      if (latestReading.isFire) {
        processMlPrediction(latestReading).then((mlResult) => {
          if (mlResult) {
            // Calculate final verdict based ONLY on sensor alert and ML prediction
            const sensorAlert = latestReading.isFire;
            const mlPrediction = mlResult.prediction; // 0, 1, 2 from API
            const inForest = forestCheck.isInForest;
            
            let finalVerdict: 'CONFIRMED' | 'FALSE_ALARM' | 'INCONCLUSIVE' = 'INCONCLUSIVE';
            let confidence = 0;

            // Simplified verification logic using only ML API
            if (sensorAlert && mlPrediction === 1 && inForest) {
              finalVerdict = 'CONFIRMED';
              confidence = 95;
            } else if (sensorAlert && mlPrediction === 1) {
              finalVerdict = 'CONFIRMED';
              confidence = 85;
            } else if (!sensorAlert && mlPrediction === 0) {
              finalVerdict = 'FALSE_ALARM';
              confidence = 90;
            } else if (sensorAlert && !inForest) {
              finalVerdict = 'FALSE_ALARM';
              confidence = 75;
            } else if (mlPrediction === 2) {
              finalVerdict = 'INCONCLUSIVE';
              confidence = 60;
            } else {
              finalVerdict = 'INCONCLUSIVE';
              confidence = 50;
            }

            setVerificationResult({
              sensorAlert,
              mlPrediction,
              inForest,
              finalVerdict,
              confidence
            });
          }
        });
      } else {
        // If no sensor alert, set false alarm
        setVerificationResult({
          sensorAlert: false,
          mlPrediction: 0,
          inForest: forestCheck.isInForest,
          finalVerdict: 'FALSE_ALARM',
          confidence: 90
        });
      }
    }
  }, [sensorReadings, processMlPrediction]);

  const availableSensors = allSensorsData?.map((device: any) => ({
    id: device._id || device.id,
    deviceId: device.deviceId || device.id,
    name: device.name || `Sensor ${device.deviceId}`,
    isFire: device.isfire || device.isFire || false
  })) || [];

  const latestReading = sensorReadings[0];
  const latestMlPrediction = mlPredictions[0];
  const forestCheck = latestReading ? 
    checkIfInForest(latestReading.latitude, latestReading.longitude, UTTARAKHAND_FOREST_BOUNDARIES) : 
    { isInForest: false };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/20 to-red-50/30 backdrop-blur-sm">
      {/* Header */}
      <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-red-800 to-orange-600 bg-clip-text text-transparent">
                Fire Verification System
              </h1>
              <div className="text-sm text-slate-600">
                AI-powered fire alert validation with ML Model Analysis
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/monitoring')}
            className="border-blue-500 text-blue-600 hover:bg-blue-50"
          >
            Back to Monitoring
          </Button>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Sensor Selection */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <Satellite className="w-6 h-6 text-blue-600" />
              Select Sensor for Verification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableSensors.map(sensor => (
                <Card 
                  key={sensor.deviceId}
                  className={`cursor-pointer transition-all duration-300 hover:shadow-lg border-2 ${
                    selectedSensorId === sensor.deviceId 
                      ? 'border-blue-500 bg-blue-50' 
                      : sensor.isFire 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-slate-200'
                  }`}
                  onClick={() => setSelectedSensorId(sensor.deviceId)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{sensor.name}</div>
                        <div className="text-sm text-slate-600">ID: {sensor.deviceId}</div>
                      </div>
                      <Badge variant={sensor.isFire ? "destructive" : "default"}>
                        {sensor.isFire ? 'ALERT' : 'NORMAL'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Map */}
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <MapPin className="w-6 h-6 text-green-600" />
                Uttarakhand Forest Map & Location Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-96 rounded-lg overflow-hidden">
                <MapContainer
                  center={[30.0668, 79.0193]} // Uttarakhand center
                  zoom={8}
                  style={{ height: '100%', width: '100%' }}
                  ref={mapRef}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  
                  {/* Forest Boundaries */}
                  {UTTARAKHAND_FOREST_BOUNDARIES.map((forest, index) => {
                    const colors = getForestColor(forest.properties.type);
                    return (
                      <Polygon
                        key={index}
                        positions={forest.geometry.coordinates[0].map(coord => [coord[1], coord[0]])}
                        pathOptions={{
                          fillColor: colors.fillColor,
                          fillOpacity: 0.4,
                          color: colors.color,
                          weight: 2,
                          opacity: 0.8
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <strong>{forest.properties.name}</strong><br />
                            Type: {forest.properties.type}<br />
                            Area: {forest.properties.area_km2} km²<br />
                            {forest.properties.district && `District: ${forest.properties.district}`}<br />
                            {forest.properties.established && `Established: ${forest.properties.established}`}
                          </div>
                        </Popup>
                      </Polygon>
                    );
                  })}
                  
                  {/* Sensor Marker */}
                  {latestReading && (
                    <Marker
                      position={[latestReading.latitude, latestReading.longitude]}
                      icon={latestReading.isFire ? fireIcon : sensorIcon}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>{latestReading.name}</strong><br />
                          Status: {latestReading.isFire ? 'FIRE ALERT' : 'Normal'}<br />
                          Temp: {latestReading.temp}°C<br />
                          Smoke: {latestReading.smoke} ppm<br />
                          Location: {forestCheck.isInForest ? `INSIDE ${forestCheck.forestName}` : 'OUTSIDE FOREST'}<br />
                          {forestCheck.forestType && `Type: ${forestCheck.forestType}`}
                        </div>
                      </Popup>
                    </Marker>
                  )}
                  
                  <MapController center={latestReading ? [latestReading.latitude, latestReading.longitude] : [30.0668, 79.0193]} />
                </MapContainer>
              </div>
              
              {/* Location Analysis */}
              {latestReading && (
                <div className="p-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        forestCheck.isInForest ? 'bg-green-100' : 'bg-slate-100'
                      }`}>
                        <Leaf className={`w-5 h-5 ${
                          forestCheck.isInForest ? 'text-green-600' : 'text-slate-600'
                        }`} />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">
                          Location: {forestCheck.isInForest ? `Inside ${forestCheck.forestName}` : 'Outside Forest Area'}
                        </div>
                        <div className="text-sm text-slate-600">
                          {forestCheck.forestType || 'Non-forest area'}
                        </div>
                      </div>
                    </div>
                    <Badge variant={forestCheck.isInForest ? "default" : "secondary"} className={
                      forestCheck.isInForest ? "bg-green-500" : "bg-slate-500"
                    }>
                      {forestCheck.isInForest ? forestCheck.forestType?.toUpperCase() || 'FOREST' : 'NON-FOREST'}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Verification Data */}
          <div className="space-y-6">
            {/* Sensor Reading */}
            {latestReading && (
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <Activity className="w-6 h-6 text-blue-600" />
                    Sensor Data Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <Thermometer className="w-8 h-8 text-red-500 mx-auto mb-2" />
                      <div className="text-lg font-bold text-slate-800">{latestReading.temp}°C</div>
                      <div className="text-xs text-slate-600">Temperature</div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <Droplets className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                      <div className="text-lg font-bold text-slate-800">{latestReading.humidity}%</div>
                      <div className="text-xs text-slate-600">Humidity</div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <Wind className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <div className="text-lg font-bold text-slate-800">{latestReading.smoke} ppm</div>
                      <div className="text-xs text-slate-600">Smoke Level</div>
                    </div>
                  </div>
                  
                  <div className={`p-4 rounded-xl border-2 ${
                    latestReading.isFire 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-emerald-300 bg-emerald-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {latestReading.isFire ? (
                          <XCircle className="w-6 h-6 text-red-600" />
                        ) : (
                          <CheckCircle className="w-6 h-6 text-emerald-600" />
                        )}
                        <div>
                          <div className="font-semibold text-slate-800">
                            Sensor Fire Alert: {latestReading.isFire ? 'DETECTED' : 'CLEAR'}
                          </div>
                          <div className="text-sm text-slate-600">
                            Last update: {new Date(latestReading.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <Badge variant={latestReading.isFire ? "destructive" : "default"}>
                        {latestReading.isFire ? 'ALERT' : 'NORMAL'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ML API Prediction */}
            {latestMlPrediction && (
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <Brain className="w-6 h-6 text-purple-600" />
                    AI Fire Detection Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`p-4 rounded-xl border-2 ${
                    latestMlPrediction.status === 'processing' 
                      ? 'border-purple-300 bg-purple-50 animate-pulse' 
                      : latestMlPrediction.prediction === 1
                      ? 'border-red-300 bg-red-50'
                      : latestMlPrediction.prediction === 2
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-emerald-300 bg-emerald-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const displayInfo = getPredictionDisplayInfo(latestMlPrediction);
                          const IconComponent = displayInfo.icon;
                          return <IconComponent className={`w-5 h-5 text-${displayInfo.color}-600`} />;
                        })()}
                        <div>
                          <div className="font-semibold text-slate-800">
                            {getPredictionDisplayInfo(latestMlPrediction).title}
                          </div>
                          <div className="text-sm text-slate-600">
                            {latestMlPrediction.status === 'completed' ? latestMlPrediction.level : 'Processing...'}
                          </div>
                        </div>
                      </div>
                      <Badge className={getPredictionDisplayInfo(latestMlPrediction).badgeClass}>
                        {getPredictionDisplayInfo(latestMlPrediction).badge}
                      </Badge>
                    </div>
                  </div>

                  {latestMlPrediction.status === 'completed' && latestMlPrediction.probabilities && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-700">Probability Distribution:</div>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        {Object.entries(latestMlPrediction.probabilities).map(([key, value]) => (
                          <div key={key} className="text-center p-1 bg-slate-50 rounded">
                            <div className="font-medium text-slate-700">
                              {key === '0' ? 'Safe' : key === '1' ? 'High Risk' : 'Borderline'}
                            </div>
                            <div className="text-slate-900 font-bold">{(value * 100).toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Final Verification Result */}
            {verificationResult && (
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <Shield className="w-6 h-6 text-orange-600" />
                    Final Verification Result
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Verification Steps */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {verificationResult.sensorAlert ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        )}
                        <span className="font-medium">Sensor Fire Alert</span>
                      </div>
                      <Badge variant={verificationResult.sensorAlert ? "destructive" : "default"}>
                        {verificationResult.sensorAlert ? 'DETECTED' : 'CLEAR'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {verificationResult.mlPrediction === 1 ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : verificationResult.mlPrediction === 2 ? (
                          <AlertTriangle className="w-5 h-5 text-orange-600" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        )}
                        <span className="font-medium">ML Model Analysis</span>
                      </div>
                      <Badge variant={
                        verificationResult.mlPrediction === 1 ? "destructive" : 
                        verificationResult.mlPrediction === 2 ? "secondary" : "default"
                      }>
                        {verificationResult.mlPrediction === 1 ? 'HIGH RISK' : 
                         verificationResult.mlPrediction === 2 ? 'BORDERLINE' : 'LOW RISK'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {verificationResult.inForest ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-slate-600" />
                        )}
                        <span className="font-medium">Forest Location</span>
                      </div>
                      <Badge variant={verificationResult.inForest ? "default" : "secondary"}>
                        {verificationResult.inForest ? 'INSIDE FOREST' : 'OUTSIDE FOREST'}
                      </Badge>
                    </div>
                  </div>

                  {/* Final Verdict */}
                  <div className={`p-5 rounded-xl border-2 text-center ${
                    verificationResult.finalVerdict === 'CONFIRMED'
                      ? 'border-red-300 bg-red-50'
                      : verificationResult.finalVerdict === 'FALSE_ALARM'
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-amber-300 bg-amber-50'
                  }`}>
                    <div className="flex flex-col items-center gap-3">
                      {verificationResult.finalVerdict === 'CONFIRMED' ? (
                        <Flame className="w-12 h-12 text-red-600 animate-pulse" />
                      ) : verificationResult.finalVerdict === 'FALSE_ALARM' ? (
                        <CheckCircle className="w-12 h-12 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-12 h-12 text-amber-600" />
                      )}
                      
                      <div>
                        <div className="text-2xl font-bold text-slate-800 mb-2">
                          {verificationResult.finalVerdict === 'CONFIRMED' 
                            ? '🔥 FIRE CONFIRMED' 
                            : verificationResult.finalVerdict === 'FALSE_ALARM'
                            ? '✅ FALSE ALARM'
                            : '⚠️ INCONCLUSIVE'
                          }
                        </div>
                        <div className="text-sm text-slate-600">
                          Combined Confidence: {verificationResult.confidence}%
                        </div>
                      </div>
                    </div>
                    
                    <Progress 
                      value={verificationResult.confidence} 
                      className={`h-3 mt-4 ${
                        verificationResult.finalVerdict === 'CONFIRMED'
                          ? 'bg-red-200'
                          : verificationResult.finalVerdict === 'FALSE_ALARM'
                          ? 'bg-emerald-200'
                          : 'bg-amber-200'
                      }`}
                    />
                  </div>

                  {/* Recommended Action */}
                  <div className="text-center">
                    <div className="text-sm font-medium text-slate-700 mb-2">Recommended Action:</div>
                    <div className="text-lg font-semibold">
                      {verificationResult.finalVerdict === 'CONFIRMED' 
                        ? '🚨 IMMEDIATE RESPONSE REQUIRED - DEPLOY FIREFIGHTING TEAMS'
                        : verificationResult.finalVerdict === 'FALSE_ALARM'
                        ? '✅ CONTINUE MONITORING - NO IMMEDIATE ACTION'
                        : '📡 GATHER MORE DATA - INCREASE MONITORING FREQUENCY'
                      }
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Empty State */}
        {!selectedSensorId && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-slate-100 rounded-2xl">
                  <Mountain className="w-12 h-12 text-slate-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">
                    No Sensor Selected
                  </h3>
                  <div className="text-slate-600 max-w-md">
                    Select a sensor from the list above to begin the fire verification process. 
                    The system will analyze sensor data, AI predictions from the ML Model API, and forest location to provide a comprehensive fire alert assessment.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default FireVerification;
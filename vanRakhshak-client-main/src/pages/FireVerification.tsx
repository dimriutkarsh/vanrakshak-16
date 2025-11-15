// src/pages/FireVerification.tsx
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
  Satellite
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
    temp: number;
    humidity: number;
    smoke: number;
    current_temp: number;
    feels_like: number;
    wind_speed: number;
    wind_gust: number;
    pressure: number;
  };
  prediction: boolean;
  confidence: number;
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
  };
}

// Uttarakhand Forest Boundaries (Sample Data - Replace with actual GeoJSON)
const UTTARAKHAND_FOREST_BOUNDARIES: ForestBoundary[] = [
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [78.0, 30.8], [79.0, 30.8], [79.0, 29.0], [78.0, 29.0], [78.0, 30.8]
      ]]
    },
    properties: {
      name: 'Western Uttarakhand Forest',
      type: 'Reserved Forest',
      area_km2: 2500
    }
  },
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.0, 30.5], [80.5, 30.5], [80.5, 29.2], [79.0, 29.2], [79.0, 30.5]
      ]]
    },
    properties: {
      name: 'Central Uttarakhand Forest',
      type: 'National Park',
      area_km2: 1800
    }
  },
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [79.5, 30.0], [81.0, 30.0], [81.0, 29.0], [79.5, 29.0], [79.5, 30.0]
      ]]
    },
    properties: {
      name: 'Eastern Uttarakhand Forest',
      type: 'Wildlife Sanctuary',
      area_km2: 1200
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
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE3LjY2IDExQzE4Ljk2IDEwLjQ3IDIwLjA2IDkuNDIgMjAuODIgOC4xQzIxLjU4IDYuNzggMjIgNS4yNCAyMiAzLjVDMjIgMy4wNyAyMS45IDIuNjUgMjEuNzQgMi4yNkMxOS41MSAzLjQ5IDE3LjY2IDUuNDIgMTYuNTQgNy44NkMxNS40MiAxMC4zIDE1LjA3IDEzLjA4IDE1LjUgMTUuNEMxNS41NyAxNi4wMSAxNS44NCAxNi41OSAxNi4yOCAxNy4wN0MxNi43MiAxNy41NSAxNy4zMSAxNy44OSAxNy45NiAxOC4wNEMxOC42MSAxOC4xOSAxOS4yOCAxOC4xMyAxOS45MSAxNy44OEMyMC41NCAxNy42MyAyMS4wOSAxNy4xOSAyMS41IDE2LjYyQzIxLjkxIDE2LjA1IDIyLjE2IDE1LjM2IDIyLjIzIDE0LjY0QzIyLjMgMTMuOTIgMjIuMTggMTMuMTkgMjEuODkgMTIuNTNDMjEuNiAxMS44NyAyMS4xNSAxMS4zIDIwLjU5IDEwLjg3QzIwLjAzIDEwLjQ0IDE5LjM3IDEwLjE2IDE4LjY3IDEwLjA2QzE4LjI0IDEwLjAxIDE3LjgxIDEwLjA3IDE3LjQxIDEwLjI0QzE3LjAxIDEwLjQxIDE2LjY2IDEwLjY4IDE2LjM5IDExLjA0QzE2LjEyIDExLjQgMTUuOTQgMTEuODMgMTUuODggMTIuMjhDMTUuODIgMTIuNzMgMTUuODggMTMuMTkgMTYuMDYgMTMuNjFDMTYuMjQgMTQuMDMgMTYuNTMgMTQuNCAxNi45MiAxNC42OEMxNy4zMSAxNC45NiAxNy43OCAxNS4xMyAxOC4yNyAxNS4xN0MxOC43NiAxNS4yMSAxOS4yNSAxNS4xMiAxOS42OSAxNC45MkMyMC4xMyAxNC43MiAyMC41IDE0LjQxIDIwLjc2IDE0LjAyQzIxLjAyIDEzLjYzIDIxLjE2IDEzLjE3IDIxLjE2IDEyLjdDMjEuMTYgMTIuMjMgMjEuMDIgMTEuNzcgMjAuNzYgMTEuMzhDMjAuNSAxMC45OSAyMC4xMyAxMC42OCAxOS42OSAxMC40OEMxOS4yNSAxMC4yOCAxOC43NiAxMC4xOSAxOC4yNyAxMC4yM0MxNy43OCAxMC4yNyAxNy4zMSAxMC40NCAxNi45MiAxMC43MkMxNi41MyAxMS4wIDE2LjI0IDExLjM3IDE2LjA2IDExLjc5QzE1Ljg4IDEyLjIxIDE1LjgyIDEyLjY3IDE1Ljg4IDEzLjEyQzE1Ljk0IDEzLjU3IDE2LjEyIDE0LjAxIDE2LjM5IDE0LjM2QzE2LjY2IDE0LjcxIDE3LjAxIDE0Ljk4IDE3LjQxIDE1LjE1QzE3LjgxIDE1LjMyIDE4LjI0IDE1LjM4IDE4LjY3IDE1LjMzQzE5LjEgMTUuMjggMTkuNTEgMTUuMTIgMTkuODUgMTQuODdDMjAuMTkgMTQuNjIgMjAuNDUgMTQuMjggMjAuNiAxMy44OEMyMC43NSAxMy40OCAyMC43OSAxMy4wNCAyMC43MiAxMi42MkMyMC42NSAxMi4yIDIwLjQ3IDExLjggMjAuMiAxMS40NkMxOS45MyAxMS4xMiAxOS41OCAxMC44NSAxOS4xOCAxMC42OEMxOC43OCAxMC41MSAxOC4zNCAxMC40NSAxNy45IDEwLjUxQzE3LjQ2IDEwLjU3IDE3LjA0IDEwLjc0IDE2LjY4IDExLjAxQzE2LjMyIDExLjI4IDE2LjAzIDExLjY0IDE1LjgzIDEyLjA2QzE1LjYzIDEyLjQ4IDE1LjUzIDEyLjk1IDE1LjU0IDEzLjQyQzE1LjU1IDEzLjg5IDE1LjY3IDE0LjM1IDE1Ljg5IDE0Ljc2QzE2LjExIDE1LjE3IDE2LjQyIDE1LjUyIDE2LjggMTUuNzhDMTcuMTggMTYuMDQgMTcuNjIgMTYuMiAxOC4wOCAxNi4yNUMxOC41NCAxNi4zIDE5LjAxIDE2LjI0IDE5LjQ1IDE2LjA3QzE5Ljg5IDE1LjkgMjAuMjggMTUuNjMgMjAuNTkgMTUuMjdDMjAuOSAxNC45MSAyMS4xMiAxNC40NyAyMS4yMyAxNC4wMkMyMS4zNCAxMy41NyAyMS4zNCAxMy4wOSAyMS4yMiAxMi42NEMyMS4xIDEyLjE5IDIwLjg3IDExLjc3IDIwLjU0IDExLjQyQzIwLjIxIDExLjA3IDE5LjggMTAuOCAxOS4zMyAxMC42M0MxOC44NiAxMC40NiAxOC4zNSAxMC40IDE3Ljg1IDEwLjQ2QzE3LjM1IDEwLjUyIDE2Ljg4IDEwLjcgMTYuNDcgMTAuOTlDMTYuMDYgMTEuMjggMTUuNzIgMTEuNjcgMTUuNDggMTIuMTJDMTUuMjQgMTIuNTcgMTUuMTEgMTMuMDggMTUuMSAxMy42QzE1LjA5IDE0LjEyIDE1LjIgMTQuNjMgMTUuNDIgMTUuMDlDMTUuNjQgMTUuNTUgMTUuOTcgMTUuOTUgMTYuMzggMTYuMjZDMTYuNzkgMTYuNTcgMTcuMjcgMTYuNzggMTcuNzggMTYuODdDMTguMjkgMTYuOTYgMTguODIgMTYuOTMgMTkuMzIgMTYuNzhDMTkuODIgMTYuNjMgMjAuMjcgMTYuMzcgMjAuNjQgMTYuMDJDMjEuMDEgMTUuNjcgMjEuMjkgMTUuMjQgMjEuNDYgMTQuNzZDMjEuNjMgMTQuMjggMjEuNjkgMTMuNzYgMjEuNjMgMTMuMjVDMjEuNTcgMTIuNzQgMjEuNCAxMi4yNSAyMS4xMiAxMS44MkMyMC44NCAxMS4zOSAyMC40NiAxMS4wMiAyMC4wMiAxMC43NEMxOS41OCAxMC40NiAxOS4wOCAxMC4yOSAxOC41NiAxMC4yNUMxOC4wNCAxMC4yMSAxNy41MiAxMC4zIDE3LjA0IDEwLjUyQzE2LjU2IDEwLjc0IDE2LjE0IDExLjA4IDE1LjggMTEuNTFDMTUuNDYgMTEuOTQgMTUuMjIgMTIuNDUgMTUuMDkgMTMuMDFDMTQuOTYgMTMuNTcgMTQuOTUgMTQuMTUgMTUuMDYgMTQuNzJDMTUuMTcgMTUuMjkgMTUuNCAxNS44MiAxNS43MyAxNi4yOEMxNi4wNiAxNi43NCAxNi40OSAxNy4xMSAxNi45OSAxNy4zOEMxNy40OSAxNy42NSAxOC4wNSAxNy44MSAxOC42MiAxNy44NUMxOS4xOSAxNy44OSAxOS43NiAxNy44MSAyMC4zIDE3LjYyQzIwLjg0IDE3LjQzIDIxLjMzIDE3LjEzIDIxLjc1IDE2LjczQzIyLjE3IDE2LjMzIDIyLjUxIDE1Ljg0IDIyLjczIDE1LjI5QzIyLjk1IDE0Ljc0IDIzLjA1IDE0LjE0IDIzLjAyIDEzLjU0QzIyLjk5IDEyLjk0IDIyLjgzIDEyLjM1IDIyLjU1IDExLjgyQzIyLjI3IDExLjI5IDIxLjg4IDEwLjgzIDIxLjQxIDEwLjQ3QzIwLjk0IDEwLjExIDIwLjQgOS44NiAxOS44MiA5LjczQzE5LjI0IDkuNiAxOC42NCA5LjYgMTguMDYgOS43MkMxNy40OCA5Ljg0IDE2LjkzIDEwLjA4IDE2LjQ1IDEwLjQ0QzE1Ljk3IDEwLjggMTUuNTcgMTEuMjcgMTUuMjggMTEuODJDMTQuOTkgMTIuMzcgMTQuODIgMTIuOTkgMTQuNzggMTMuNjNDMTQuNzQgMTQuMjcgMTQuODMgMTQuOTEgMTUuMDUgMTUuNTFDMTUuMjcgMTYuMTEgMTUuNjIgMTYuNjYgMTYuMDcgMTcuMTNDMTYuNTIgMTcuNiAxNy4wNyAxNy45NyAxNy42OCAxOC4yM0MxOC4yOSAxOC40OSAxOC45NSAxOC42MiAxOS42MiAxOC42MkMyMC4yOSAxOC42MiAyMC45NSAxOC40OSAyMS41NiAxOC4yM0MyMi4xNyAxNy45NyAyMi43MiAxNy42IDIzLjE3IDE3LjEzQzIzLjYyIDE2LjY2IDIzLjk3IDE2LjExIDI0LjE5IDE1LjUxQzI0LjQxIDE0LjkxIDI0LjUgMTQuMjcgMjQuNDYgMTMuNjNDMjQuNDIgMTIuOTkgMjQuMjUgMTIuMzcgMjMuOTYgMTEuODJDMjMuNjcgMTEuMjcgMjMuMjcgMTAuOCAyMi43OSAxMC40NEMyMi4zMSAxMC4wOCAyMS43NiA5Ljg0IDIxLjE4IDkuNzJDMjAuNiA5LjYgMTkuOTkgOS42IDE5LjQxIDkuNzNDMTguODMgOS44NiAxOC4yOSAxMC4xMSAxNy44MiAxMC40N0MxNy4zNSAxMC44MyAxNi45NiAxMS4yOSAxNi42OCAxMS44MkMxNi40IDEyLjM1IDE2LjI0IDEyLjk0IDE2LjIxIDEzLjU0QzE2LjE4IDE0LjE0IDE2LjI4IDE0Ljc0IDE2LjUgMTUuMjlDMTYuNzIgMTUuODQgMTcuMDYgMTYuMzMgMTcuNDggMTYuNzNDMTcuOSAxNy4xMyAxOC4zOSAxNy40MyAxOC45MyAxNy42MkMxOS40NyAxNy44MSAyMC4wNCAxNy44OSAyMC42MSAxNy44NUMyMS4xOCAxNy44MSAyMS43NCAxNy42NSAyMi4yNCAxNy4zOEMyMi43NCAxNy4xMSAyMy4xNyAxNi43NCAyMy41IDE2LjI4QzIzLjgzIDE1LjgyIDI0LjA2IDE1LjI5IDI0LjE3IDE0LjcyQzI0LjI4IDE0LjE1IDI0LjI3IDEzLjU3IDI0LjE0IDEzLjAxQzI0LjAxIDEyLjQ1IDIzLjc3IDExLjk0IDIzLjQzIDExLjUxQzIzLjA5IDExLjA4IDIyLjY3IDEwLjc0IDIyLjE5IDEwLjUyQzIxLjcxIDEwLjMgMjEuMTkgMTAuMjEgMjAuNjcgMTAuMjVDMjAuMTUgMTAuMjkgMTkuNjUgMTAuNDYgMTkuMjEgMTAuNzRDMTguNzcgMTEuMDIgMTguMzkgMTEuMzkgMTguMTEgMTEuODJDMTcuODMgMTIuMjUgMTcuNjYgMTIuNzQgMTcuNiAxMy4yNUMxNy41NCAxMy43NiAxNy42IDE0LjI4IDE3Ljc3IDE0Ljc2QzE3Ljk0IDE1LjI0IDE4LjIyIDE1LjY3IDE4LjU5IDE2LjAyQzE4Ljk2IDE2LjM3IDE5LjQxIDE2LjYzIDE5LjkxIDE2Ljc4QzIwLjQxIDE2LjkzIDIwLjk0IDE2Ljk2IDIxLjQ1IDE2Ljg3QzIxLjk2IDE2Ljc4IDIyLjQ0IDE2LjU3IDIyLjg1IDE2LjI2QzIzLjI2IDE1Ljk1IDIzLjU5IDE1LjU1IDIzLjgxIDE1LjA5QzI0LjAzIDE0LjYzIDI0LjE0IDE0LjEyIDI0LjEzIDEzLjZDMjQuMTIgMTMuMDggMjMuOTkgMTIuNTcgMjMuNzUgMTIuMTJDMjMuNTEgMTEuNjcgMjMuMTcgMTEuMjggMjIuNzYgMTAuOTlDMjIuMzUgMTAuNyAyMS44OCAxMC41MiAyMS4zOCAxMC40NkMyMC44OCAxMC40IDIwLjM3IDEwLjQ2IDE5LjkgMTAuNjNDMTkuNDMgMTAuOCAxOS4wMiAxMS4wNyAxOC42OSAxMS40MkMxOC4zNiAxMS43NyAxOC4xMyAxMi4xOSAxOC4wMSAxMi42NEMxNy44OSAxMy4wOSAxNy44OSAxMy41NyAxOC4wIDE0LjAyQzE4LjExIDE0LjQ3IDE4LjMzIDE0LjkxIDE4LjY0IDE1LjI3QzE4Ljk1IDE1LjYzIDE5LjM0IDE1LjkgMTkuNzggMTYuMDdDMjAuMjIgMTYuMjQgMjAuNjkgMTYuMyAyMS4xNSAxNi4yNUMyMS42MSAxNi4yIDIyLjA1IDE2LjA0IDIyLjQzIDE1Ljc4QzIyLjgxIDE1LjUyIDIzLjEyIDE1LjE3IDIzLjM0IDE0Ljc2QzIzLjU2IDE0LjM1IDIzLjY4IDEzLjg5IDIzLjY5IDEzLjQyQzIzLjcgMTIuOTUgMjMuNiAxMi40OCAyMy40IDEyLjA2QzIzLjIgMTEuNjQgMjIuOTEgMTEuMjggMjIuNTUgMTEuMDFDMjIuMTkgMTAuNzQgMjEuNzcgMTAuNTcgMjEuMzMgMTAuNTFDMjAuODkgMTAuNDUgMjAuNDUgMTAuNTEgMjAuMDUgMTAuNjhDMTkuNjUgMTAuODUgMTkuMyAxMS4xMiAxOS4wMyAxMS40NkMxOC43NiAxMS44IDE4LjU4IDEyLjIgMTguNTEgMTIuNjJDMTguNDQgMTMuMDQgMTguNDggMTMuNDggMTguNjMgMTMuODhDMTguNzggMTQuMjggMTkuMDQgMTQuNjIgMTkuMzggMTQuODdDMTkuNzIgMTUuMTIgMjAuMTMgMTUuMjggMjAuNTYgMTUuMzNDMjAuOTkgMTUuMzggMjEuNDIgMTUuMzIgMjEuODIgMTUuMTVDMjIuMjIgMTQuOTggMjIuNTcgMTQuNzEgMjIuODQgMTQuMzZDMjMuMTEgMTQuMDEgMjMuMjkgMTMuNTcgMjMuMzUgMTMuMTJDMjMuNDEgMTIuNjcgMjMuMzUgMTIuMjEgMjMuMTcgMTEuNzlDMjIuOTkgMTEuMzcgMjIuNyAxMS4wIDIyLjMxIDEwLjcyQzIxLjkyIDEwLjQ0IDIxLjQ1IDEwLjI3IDIwLjk2IDEwLjIzQzIwLjQ3IDEwLjE5IDE5Ljk4IDEwLjI4IDE5LjU0IDEwLjQ4QzE5LjEgMTAuNjggMTguNzMgMTAuOTkgMTguNDcgMTEuMzhDMTguMjEgMTEuNzcgMTguMDcgMTIuMjMgMTguMDcgMTIuN0MxOC4wNyAxMy4xNyAxOC4yMSAxMy42MyAxOC40NyAxNC4wMkMxOC43MyAxNC40MSAxOS4xIDE0LjcyIDE5LjU0IDE0LjkyQzE5Ljk4IDE1LjEyIDIwLjQ3IDE1LjIxIDIwLjk2IDE1LjE3QzIxLjQ1IDE1LjEzIDIxLjkyIDE0Ljk2IDIyLjMxIDE0LjY4QzIyLjcgMTQuNCAyMi45OSAxNC4wMyAyMy4xNyAxMy42MUMyMy4zNSAxMy4xOSAyMy40MSAxMi43MyAyMy4zNSAxMi4yOEMyMy4yOSAxMS44MyAyMy4xMSAxMS40IDIyLjg0IDExLjA0QzIyLjU3IDEwLjY4IDIyLjIyIDEwLjQxIDIxLjgyIDEwLjI0QzIxLjQyIDEwLjA3IDIwLjk5IDEwLjAxIDIwLjU2IDEwLjA2QzIwLjEzIDEwLjExIDE5LjcxIDEwLjI3IDE5LjM1IDEwLjUzQzE4Ljk5IDEwLjc5IDE4LjcgMTEuMTQgMTguNSAxMS41NUMxOC4zIDExLjk2IDE4LjE5IDEyLjQyIDE4LjE5IDEyLjg5QzE4LjE5IDEzLjM2IDE4LjMgMTMuODIgMTguNSAxNC4yM0MxOC43IDE0LjY0IDE4Ljk5IDE1IDE5LjM1IDE1LjI3QzE5LjcxIDE1LjU0IDIwLjEzIDE1LjcxIDIwLjU2IDE1Ljc3QzIwLjk5IDE1LjgzIDIxLjQyIDE1Ljc3IDIxLjgyIDE1LjZDMjIuMjIgMTUuNDMgMjIuNTcgMTUuMTYgMjIuODQgMTQuODBDMjMuMTEgMTQuNDQgMjMuMjkgMTQuMDEgMjMuMzUgMTMuNTZDMjMuNDEgMTMuMTEgMjMuMzUgMTIuNjUgMjMuMTcgMTIuMjNDMjIuOTkgMTEuODEgMjIuNyAxMS40NCAyMi4zMSAxMS4xNkMyMS45MiAxMC44OCAyMS40NSAxMC43MSAyMC45NiAxMC42N0MyMC40NyAxMC42MyAxOS45OCAxMC43MiAxOS41NCAxMC45MkMxOS4xIDExLjEyIDE4LjczIDExLjQzIDE4LjQ3IDExLjgyQzE4LjIxIDEyLjIxIDE4LjA3IDEyLjY3IDE4LjA3IDEzLjE0QzE4LjA3IDEzLjYxIDE4LjIxIDE0LjA3IDE4LjQ3IDE0LjQ2QzE4LjczIDE0Ljg1IDE5LjEgMTUuMTYgMTkuNTQgMTUuMzZDMjAuMTUgMTUuNjQgMjAuODMgMTUuNjQgMjEuNDQgMTUuMzZDMjIuMDUgMTUuMDggMjIuNDkgMTQuNTQgMjIuNjIgMTMuODlDMjIuNzUgMTMuMjQgMjIuNTUgMTIuNTYgMjIuMDggMTIuMDdDMjEuNjEgMTEuNTggMjAuOTMgMTEuMzQgMjAuMjIgMTEuMzRIMTcuNjZaIiBmaWxsPSJyZWQiLz4KPC9zdmc+',
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

// ML Prediction API
const predictFireWithML = async (data: {
  temp: number;
  humidity: number;
  smoke: number;
  current_temp: number;
  feels_like: number;
  wind_speed: number;
  wind_gust: number;
  pressure: number;
}): Promise<{ prediction: boolean; confidence: number }> => {
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
  
  const fireProbability = 
    (data.temp > 35 ? 0.25 : 0) +
    (data.smoke > 50 ? 0.35 : 0) +
    (data.humidity < 30 ? 0.15 : 0) +
    (data.wind_speed > 15 ? 0.1 : 0) +
    (data.current_temp > 30 ? 0.1 : 0) +
    (data.pressure < 1000 ? 0.05 : 0);
  
  const prediction = fireProbability > 0.5;
  const confidence = prediction ? fireProbability : 1 - fireProbability;
  
  return { prediction, confidence: Math.round(confidence * 100) };
};

// Forest checking function using Turf.js
const checkIfInForest = (lat: number, lng: number, forestBoundaries: ForestBoundary[]): { isInForest: boolean; forestName?: string } => {
  const point = turf.point([lng, lat]);
  
  for (const forest of forestBoundaries) {
    const polygon = turf.polygon(forest.geometry.coordinates as number[][][]);
    if (turf.booleanPointInPolygon(point, polygon)) {
      return { isInForest: true, forestName: forest.properties.name };
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

const FireVerification: React.FC = () => {
  const [selectedSensorId, setSelectedSensorId] = useState<string>('');
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [mlPredictions, setMlPredictions] = useState<MLPrediction[]>([]);
  const [isMlProcessing, setIsMlProcessing] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    sensorAlert: boolean;
    mlPrediction: boolean;
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

  // Process ML prediction
  const processMlPrediction = useCallback(async (reading: SensorReading) => {
    const predictionId = `ml-${Date.now()}`;
    
    const processingPrediction: MLPrediction = {
      id: predictionId,
      timestamp: new Date().toISOString(),
      input_data: {
        temp: reading.temp,
        humidity: reading.humidity,
        smoke: reading.smoke,
        current_temp: 25, // Default values - replace with actual weather data
        feels_like: 26,
        wind_speed: 5,
        wind_gust: 7,
        pressure: 1013
      },
      prediction: false,
      confidence: 0,
      status: 'processing'
    };

    setMlPredictions(prev => [processingPrediction, ...prev.slice(0, 5)]);
    setIsMlProcessing(true);

    try {
      const result = await predictFireWithML(processingPrediction.input_data);
      
      const completedPrediction: MLPrediction = {
        ...processingPrediction,
        prediction: result.prediction,
        confidence: result.confidence,
        status: 'completed'
      };

      setMlPredictions(prev => 
        prev.map(p => p.id === predictionId ? completedPrediction : p)
      );

      return completedPrediction;
    } catch (error) {
      const failedPrediction: MLPrediction = {
        ...processingPrediction,
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

      // Process ML prediction if needed
      if (latestReading.isFire || latestReading.temp > 35 || latestReading.smoke > 50) {
        processMlPrediction(latestReading).then((mlResult) => {
          if (mlResult) {
            // Calculate final verdict
            const sensorAlert = latestReading.isFire;
            const mlPrediction = mlResult.prediction;
            const inForest = forestCheck.isInForest;
            
            let finalVerdict: 'CONFIRMED' | 'FALSE_ALARM' | 'INCONCLUSIVE' = 'INCONCLUSIVE';
            let confidence = 0;

            if (sensorAlert && mlPrediction && inForest) {
              finalVerdict = 'CONFIRMED';
              confidence = 95;
            } else if (!sensorAlert && !mlPrediction) {
              finalVerdict = 'FALSE_ALARM';
              confidence = 90;
            } else if (sensorAlert && !inForest) {
              finalVerdict = 'FALSE_ALARM';
              confidence = 80;
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
                Multi-factor fire alert validation and verification
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
                  {UTTARAKHAND_FOREST_BOUNDARIES.map((forest, index) => (
                    <Polygon
                      key={index}
                      positions={forest.geometry.coordinates[0].map(coord => [coord[1], coord[0]])}
                      pathOptions={{
                        fillColor: '#22c55e',
                        fillOpacity: 0.3,
                        color: '#16a34a',
                        weight: 2
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>{forest.properties.name}</strong><br />
                          Type: {forest.properties.type}<br />
                          Area: {forest.properties.area_km2} km²
                        </div>
                      </Popup>
                    </Polygon>
                  ))}
                  
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
                          Location: {forestCheck.isInForest ? 'INSIDE FOREST' : 'OUTSIDE FOREST'}
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
                          Location: {forestCheck.isInForest ? 'Inside Forest Area' : 'Outside Forest Area'}
                        </div>
                        <div className="text-sm text-slate-600">
                          {forestCheck.forestName || 'Non-forest area'}
                        </div>
                      </div>
                    </div>
                    <Badge variant={forestCheck.isInForest ? "default" : "secondary"} className={
                      forestCheck.isInForest ? "bg-green-500" : "bg-slate-500"
                    }>
                      {forestCheck.isInForest ? 'FOREST' : 'NON-FOREST'}
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

            {/* ML Prediction */}
            {latestMlPrediction && (
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <Brain className="w-6 h-6 text-purple-600" />
                    AI Model Prediction
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`p-4 rounded-xl border-2 ${
                    latestMlPrediction.status === 'processing' 
                      ? 'border-purple-300 bg-purple-50 animate-pulse' 
                      : latestMlPrediction.prediction
                      ? 'border-red-300 bg-red-50'
                      : 'border-emerald-300 bg-emerald-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {latestMlPrediction.status === 'processing' ? (
                          <Activity className="w-6 h-6 text-purple-600 animate-spin" />
                        ) : latestMlPrediction.prediction ? (
                          <XCircle className="w-6 h-6 text-red-600" />
                        ) : (
                          <CheckCircle className="w-6 h-6 text-emerald-600" />
                        )}
                        <div>
                          <div className="font-semibold text-slate-800">
                            {latestMlPrediction.status === 'processing' 
                              ? 'AI Analysis in Progress' 
                              : `Fire Prediction: ${latestMlPrediction.prediction ? 'HIGH RISK' : 'LOW RISK'}`
                            }
                          </div>
                          <div className="text-sm text-slate-600">
                            Confidence: {latestMlPrediction.confidence}%
                          </div>
                        </div>
                      </div>
                      <Badge className={
                        latestMlPrediction.status === 'processing' ? 'bg-purple-500' :
                        latestMlPrediction.prediction ? 'bg-red-500' : 'bg-emerald-500'
                      }>
                        {latestMlPrediction.status === 'processing' ? 'PROCESSING' :
                         latestMlPrediction.prediction ? 'HIGH RISK' : 'LOW RISK'}
                      </Badge>
                    </div>
                  </div>

                  {latestMlPrediction.status === 'completed' && (
                    <Progress 
                      value={latestMlPrediction.confidence} 
                      className={`h-3 ${
                        latestMlPrediction.prediction ? 'bg-red-200' : 'bg-emerald-200'
                      }`}
                    />
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
                        {verificationResult.mlPrediction ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        )}
                        <span className="font-medium">AI Model Prediction</span>
                      </div>
                      <Badge variant={verificationResult.mlPrediction ? "destructive" : "default"}>
                        {verificationResult.mlPrediction ? 'HIGH RISK' : 'LOW RISK'}
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
                          Confidence: {verificationResult.confidence}%
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
                    The system will analyze sensor data, AI predictions, and forest location to provide a comprehensive fire alert assessment.
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
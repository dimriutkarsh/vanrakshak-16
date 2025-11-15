import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wind, MapPin, Thermometer, AlertTriangle, Navigation, RefreshCw, Compass, Flame, Clock, Shield, Users, AlertCircle, TrendingUp, Map } from 'lucide-react';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Import your API functions
import { getFireAlerts, getFireAlertByDeviceId, type AlertData } from '@/api/fireAlerts';
import { getWeatherData, type WeatherData as WeatherDataType } from '@/api/weatherApi';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface SensorData {
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

// Create quarter-circle sector (90-degree arc) in wind direction
const createWindSector = (
  centerLat: number,
  centerLng: number,
  windDirection: number,
  radius: number,
  color: string
) => {
  // Convert to direction wind is blowing TO (where fire spreads)
  const directionTo = (windDirection + 180) % 360;
  const centerRad = (directionTo * Math.PI) / 180;
  
  // Create 90-degree sector (45 degrees on each side of center)
  const sectorAngle = 45; // 45 degrees each side = 90 degree total sector
  const steps = 20;
  const points = [];
  
  // Start at center
  points.push([centerLat, centerLng]);
  
  // Create arc points for the sector
  for (let i = -sectorAngle; i <= sectorAngle; i += sectorAngle / steps) {
    const angle = (directionTo + i) * Math.PI / 180;
    const pointLat = centerLat + (radius * Math.cos(angle) / 111000);
    const pointLng = centerLng + (radius * Math.sin(angle) / (111000 * Math.cos(centerLat * Math.PI / 180)));
    points.push([pointLat, pointLng]);
  }
  
  // Close the polygon back to center
  points.push([centerLat, centerLng]);
  
  return L.polygon(points, {
    color: color,
    fillColor: color,
    fillOpacity: 0.3,
    weight: 2,
    className: 'wind-sector'
  });
};

// Calculate fire spread areas with directional sectors
const calculateFireSpreadAreas = (
  centerLat: number,
  centerLng: number,
  weatherData: WeatherDataType,
  fireIntensity: number
) => {
  // Fixed radii for different zones
  const activeRadius = 200; // meters
  const highRiskRadius = 500; // meters
  const mediumRiskRadius = 900; // meters
  
  return [
    {
      lat: centerLat,
      lng: centerLng,
      radius: activeRadius,
      type: 'immediate-fire',
      popupTitle: 'Active Fire Zone',
      riskLevel: 'Extreme',
      color: '#dc2626',
      strokeColor: '#991b1b',
      description: 'Active burning area - Extreme danger'
    },
    {
      lat: centerLat,
      lng: centerLng,
      radius: highRiskRadius,
      type: 'high-risk',
      popupTitle: 'High Risk Zone',
      riskLevel: 'High',
      color: '#ea580c',
      strokeColor: '#c2410c',
      description: 'Immediate fire spread risk - Evacuate immediately'
    },
    {
      lat: centerLat,
      lng: centerLng,
      radius: mediumRiskRadius,
      type: 'medium-risk',
      popupTitle: 'Medium Risk Zone',
      riskLevel: 'Medium',
      color: '#eab308',
      strokeColor: '#a16207',
      description: 'Potential fire spread - Prepare for evacuation'
    }
  ];
};

// Create fire icon
const createFireIcon = () => {
  return L.divIcon({
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 24px;
          height: 24px;
          background: linear-gradient(45deg, #dc2626, #f59e0b);
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 
            0 0 0 3px #dc2626,
            0 6px 20px rgba(220, 38, 38, 0.8);
          animation: firePulse 1.5s infinite;
          position: relative;
          z-index: 2;
        "></div>
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 40px;
          height: 40px;
          background: rgba(220, 38, 38, 0.3);
          border-radius: 50%;
          animation: fireGlow 2s infinite;
        "></div>
      </div>
      <style>
        @keyframes firePulse {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0 0 0 3px #dc2626, 0 6px 20px rgba(220, 38, 38, 0.8);
          }
          50% { 
            transform: scale(1.1);
            box-shadow: 0 0 0 4px #dc2626, 0 8px 25px rgba(220, 38, 38, 1);
          }
        }
        @keyframes fireGlow {
          0%, 100% { 
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          50% { 
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 0.5;
          }
        }
      </style>
    `,
    className: 'fire-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Create wind arrow
const createWindArrow = (direction: number, speed: number) => {
  const animationDuration = Math.max(0.8, 3 - (speed / 3));
  const arrowSize = Math.min(40, 24 + speed * 2);
  const correctedDirection = (direction + 180) % 360;
  
  return L.divIcon({
    html: `
      <div style="
        position: relative;
        width: ${arrowSize}px;
        height: ${arrowSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="${arrowSize}" height="${arrowSize}" viewBox="0 0 40 40" style="
          transform: rotate(${correctedDirection}deg);
          filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));
          animation: windFlow ${animationDuration}s infinite;
        ">
          <defs>
            <linearGradient id="windGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#1e40af;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
            </linearGradient>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="url(#windGradient)"/>
            </marker>
          </defs>
          <line x1="10" y1="20" x2="30" y2="20" 
                stroke="url(#windGradient)" 
                stroke-width="3" 
                marker-end="url(#arrowhead)"
                stroke-linecap="round"/>
        </svg>
      </div>
      <style>
        @keyframes windFlow {
          0% { transform: rotate(${correctedDirection}deg) scale(0.9); opacity: 0.7; }
          50% { transform: rotate(${correctedDirection}deg) scale(1.1); opacity: 1; }
          100% { transform: rotate(${correctedDirection}deg) scale(0.9); opacity: 0.7; }
        }
      </style>
    `,
    className: 'wind-arrow',
    iconSize: [arrowSize, arrowSize],
    iconAnchor: [arrowSize/2, arrowSize/2],
  });
};

// Create fire spread direction arrow (dotted line with arrowhead)
const createFireSpreadDirectionArrow = (
  startLat: number,
  startLng: number,
  direction: number,
  distance: number
) => {
  // Convert to direction wind is blowing TO (where fire spreads)
  const directionTo = (direction + 180) % 360;
  const rad = (directionTo * Math.PI) / 180;
  
  const endLat = startLat + (distance * Math.cos(rad) / 111);
  const endLng = startLng + (distance * Math.sin(rad) / (111 * Math.cos(startLat * Math.PI / 180)));
  
  return L.polyline([[startLat, startLng], [endLat, endLng]], {
    color: '#dc2626',
    weight: 4,
    opacity: 0.8,
    dashArray: '10, 10',
    className: 'fire-spread-arrow'
  });
};

// Helper function to convert degrees to cardinal direction
const getWindDirection = (degrees: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

const PossibleAffectedAreasMap: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherDataType | null>(null);
  const [affectedAreas, setAffectedAreas] = useState<any[]>([]);
  const [map, setMap] = useState<L.Map | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);

  // Convert AlertData to SensorData format
  const convertAlertToSensorData = (alert: AlertData): SensorData => {
    return {
      id: alert.id,
      deviceId: alert.deviceId,
      latitude: alert.latitude,
      longitude: alert.longitude,
      humidity: alert.humidity,
      temp: alert.temp,
      smoke: alert.smoke,
      isFire: alert.isFire,
      timestamp: alert.timestamp,
      name: `Sensor ${alert.deviceId}`,
      status: alert.isFire ? 'active' : 'inactive'
    };
  };

  // Calculate fire intensity based on sensor data
  const calculateFireIntensity = (sensor: SensorData): number => {
    let intensity = 0;
    
    if (sensor.temp > 100) intensity += 40;
    else if (sensor.temp > 80) intensity += 30;
    else if (sensor.temp > 60) intensity += 20;
    else if (sensor.temp > 40) intensity += 10;
    
    if (sensor.smoke > 800) intensity += 40;
    else if (sensor.smoke > 600) intensity += 30;
    else if (sensor.smoke > 400) intensity += 20;
    else if (sensor.smoke > 200) intensity += 10;
    
    if (sensor.humidity > 80) intensity -= 20;
    else if (sensor.humidity > 60) intensity -= 10;
    
    return Math.max(1, Math.min(10, intensity / 10));
  };

  // Calculate estimated spread rate based on conditions
  const calculateSpreadRate = (): string => {
    if (!weatherData || !sensorData) return 'Moderate';
    
    const windSpeed = weatherData.wind_speed;
    const humidity = sensorData.humidity;
    const temp = sensorData.temp;
    
    if (windSpeed > 8 && humidity < 30 && temp > 80) return 'Very Fast';
    if (windSpeed > 6 && humidity < 40 && temp > 70) return 'Fast';
    if (windSpeed > 4 && humidity < 50) return 'Moderate';
    return 'Slow';
  };

  // Fetch live sensor data from API
  const fetchLiveSensorData = async (deviceId?: string): Promise<SensorData | null> => {
    try {
      let alertData: AlertData | null = null;
      
      if (deviceId) {
        alertData = await getFireAlertByDeviceId(deviceId);
      } else {
        const allAlerts = await getFireAlerts();
        const activeFire = allAlerts.find(alert => alert.isFire);
        if (activeFire) {
          alertData = activeFire;
        } else if (allAlerts.length > 0) {
          alertData = allAlerts[0];
        }
      }
      
      if (alertData) {
        return convertAlertToSensorData(alertData);
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching live sensor data:', error);
      throw error;
    }
  };

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      try {
        let sensor: SensorData | null = null;
        
        const navData = location.state?.sensorData;
        if (navData) {
          sensor = navData;
        } else {
          const urlParams = new URLSearchParams(location.search);
          const deviceId = urlParams.get('deviceId') || localStorage.getItem('lastDeviceId');
          sensor = await fetchLiveSensorData(deviceId || undefined);
        }
        
        if (sensor) {
          setSensorData(sensor);
          
          const weather = await getWeatherData(sensor.latitude, sensor.longitude);
          setWeatherData(weather);
          
          const fireIntensity = calculateFireIntensity(sensor);
          const areas = calculateFireSpreadAreas(
            sensor.latitude,
            sensor.longitude,
            weather,
            fireIntensity
          );
          setAffectedAreas(areas);
          
          localStorage.setItem('lastSensorData', JSON.stringify(sensor));
          localStorage.setItem('lastDeviceId', sensor.deviceId);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        const fallbackData = localStorage.getItem('lastSensorData');
        if (fallbackData) {
          const sensor = JSON.parse(fallbackData);
          setSensorData(sensor);
          
          const mockWeather: WeatherDataType = {
            temp: 25,
            feels_like: 26,
            humidity: 60,
            pressure: 1013,
            wind_speed: 5.5,
            wind_deg: 45,
            wind_gust: 7.0,
            visibility: 10000,
            description: 'clear sky',
            icon: '01d'
          };
          setWeatherData(mockWeather);
          
          const fireIntensity = calculateFireIntensity(sensor);
          const areas = calculateFireSpreadAreas(
            sensor.latitude,
            sensor.longitude,
            mockWeather,
            fireIntensity
          );
          setAffectedAreas(areas);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [location]);

  // Initialize map
  useEffect(() => {
    if (!sensorData || !mapRef.current || isMapInitialized) return;

    if (!map) {
      const leafletMap = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: true
      }).setView(
        [sensorData.latitude, sensorData.longitude], 
        14
      );

      L.control.zoom({
        position: 'topright'
      }).addTo(leafletMap);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        minZoom: 3,
      }).addTo(leafletMap);

      setMap(leafletMap);
      setIsMapInitialized(true);
    }

    return () => {
      if (map) {
        map.remove();
        setMap(null);
        setIsMapInitialized(false);
      }
    };
  }, [sensorData, isMapInitialized, map]);

  // Add markers and overlays to map
  useEffect(() => {
    if (map && sensorData && affectedAreas.length > 0 && weatherData) {
      // Clear existing layers
      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer);
        }
      });

      const center = [sensorData.latitude, sensorData.longitude] as [number, number];
      const fireSpreadDirection = getWindDirection((weatherData.wind_deg + 180) % 360);

      // Add fire zones as directional sectors (quarter-circles)
      affectedAreas.forEach((area) => {
        const sector = createWindSector(
          area.lat,
          area.lng,
          weatherData.wind_deg,
          area.radius,
          area.color
        )
        .addTo(map)
        .bindPopup(`
          <div class="p-4 min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg">
            <div class="text-center mb-3">
              <div class="w-10 h-10 mx-auto mb-2 bg-${area.type === 'immediate-fire' ? 'red' : area.type === 'high-risk' ? 'orange' : 'yellow'}-500 rounded-full flex items-center justify-center">
                <div class="w-4 h-4 bg-white rounded-full"></div>
              </div>
              <h3 class="text-lg font-bold text-${area.type === 'immediate-fire' ? 'red' : area.type === 'high-risk' ? 'orange' : 'yellow'}-700 mb-1">
                ${area.popupTitle}
              </h3>
              <div class="text-sm text-gray-600 font-medium">${area.description}</div>
            </div>
            <div class="space-y-3">
              <div class="bg-gray-50 p-3 rounded">
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div class="text-gray-600 font-medium">Risk Level</div>
                    <div class="font-bold text-${area.type === 'immediate-fire' ? 'red' : area.type === 'high-risk' ? 'orange' : 'yellow'}-700">${area.riskLevel}</div>
                  </div>
                  <div>
                    <div class="text-gray-600 font-medium">Spread Distance</div>
                    <div class="font-bold text-gray-800">${area.radius} m</div>
                  </div>
                </div>
              </div>
              <div class="bg-${area.type === 'immediate-fire' ? 'red' : area.type === 'high-risk' ? 'orange' : 'yellow'}-50 p-3 rounded">
                <div class="text-sm font-medium text-${area.type === 'immediate-fire' ? 'red' : area.type === 'high-risk' ? 'orange' : 'yellow'}-800">
                  ${area.type === 'immediate-fire' ? '🔥 Active burning area' : 
                    area.type === 'high-risk' ? '⚠️ Immediate evacuation required' : 
                    '📡 Prepare for evacuation'}
                </div>
              </div>
              <div class="bg-blue-50 p-3 rounded">
                <div class="text-sm text-blue-700">
                  <strong>Spread Direction:</strong> ${fireSpreadDirection}
                </div>
              </div>
            </div>
          </div>
        `);
      });

      // Add fire spread direction arrow (dotted line from center)
      const fireSpreadArrow = createFireSpreadDirectionArrow(
        sensorData.latitude,
        sensorData.longitude,
        weatherData.wind_deg,
        0.01 // distance in degrees
      ).addTo(map);

      // Add label for fire spread direction
      const arrowEndLat = sensorData.latitude + (0.012 * Math.cos(((weatherData.wind_deg + 180) % 360 * Math.PI) / 180));
      const arrowEndLng = sensorData.longitude + (0.012 * Math.sin(((weatherData.wind_deg + 180) % 360 * Math.PI) / 180));
      
      L.marker([arrowEndLat, arrowEndLng], {
        icon: L.divIcon({
          html: `
            <div style="
              background: rgba(220, 38, 38, 0.9);
              color: white;
              padding: 8px 12px;
              border-radius: 8px;
              font-weight: bold;
              font-size: 14px;
              border: 2px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              white-space: nowrap;
            ">
              🔥 Fire spreading toward ${fireSpreadDirection}
            </div>
          `,
          className: 'fire-spread-label',
          iconSize: [200, 40],
          iconAnchor: [100, 20],
        })
      }).addTo(map);

      // Add fire center marker
      L.marker(center, {
        icon: createFireIcon()
      })
      .addTo(map)
      .bindPopup(`
        <div class="p-4 min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg">
          <div class="text-center mb-3">
            <div class="w-12 h-12 mx-auto mb-2 bg-red-500 rounded-full flex items-center justify-center">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <h3 class="text-lg font-bold text-red-900 mb-1">Active Fire Detected</h3>
            <div class="text-sm text-gray-600 font-medium">${sensorData.deviceId}</div>
          </div>
          <div class="space-y-3">
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span class="text-gray-700 font-medium">Temperature</span>
              <span class="font-bold text-red-600">${sensorData.temp}°C</span>
            </div>
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span class="text-gray-700 font-medium">Smoke Level</span>
              <span class="font-bold text-gray-700">${sensorData.smoke} ppm</span>
            </div>
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span class="text-gray-700 font-medium">Humidity</span>
              <span class="font-bold text-blue-600">${sensorData.humidity}%</span>
            </div>
          </div>
          <div class="mt-3 p-2 bg-red-50 rounded text-center">
            <div class="text-xs text-red-700 font-medium">Fire Intensity</div>
            <div class="text-sm font-bold text-red-800">Level ${calculateFireIntensity(sensorData)}/10</div>
          </div>
          <div class="mt-3 p-2 bg-orange-50 rounded text-center">
            <div class="text-xs text-orange-700 font-medium">Spread Direction</div>
            <div class="text-sm font-bold text-orange-800">🔥 Spreading toward ${fireSpreadDirection}</div>
          </div>
        </div>
      `);

      // Add wind arrow (positioned slightly offset for visibility)
      const windOffset = 0.001; // small offset for visibility
      const windRad = (weatherData.wind_deg * Math.PI) / 180;
      const arrowLat = sensorData.latitude + (windOffset * Math.cos(windRad));
      const arrowLng = sensorData.longitude + (windOffset * Math.sin(windRad));
      
      L.marker([arrowLat, arrowLng], {
        icon: createWindArrow(weatherData.wind_deg, weatherData.wind_speed),
        zIndexOffset: 1000
      }).addTo(map).bindTooltip(`Wind: ${getWindDirection(weatherData.wind_deg)} at ${weatherData.wind_speed.toFixed(1)} m/s`);

      // Fit map to show all elements
      const largestRadius = 900; // medium risk radius
      const bounds = L.latLngBounds([
        [sensorData.latitude - (largestRadius / 111000), sensorData.longitude - (largestRadius / (111000 * Math.cos(sensorData.latitude * Math.PI / 180)))],
        [sensorData.latitude + (largestRadius / 111000), sensorData.longitude + (largestRadius / (111000 * Math.cos(sensorData.latitude * Math.PI / 180)))]
      ]);
      
      setTimeout(() => {
        map.fitBounds(bounds.pad(0.1), {
          animate: true,
          duration: 1
        });
      }, 100);
    }
  }, [map, sensorData, affectedAreas, weatherData]);

  const handleRefreshData = async () => {
    if (!sensorData) return;
    
    setIsLoading(true);
    try {
      const freshSensorData = await fetchLiveSensorData(sensorData.deviceId);
      if (freshSensorData) {
        setSensorData(freshSensorData);
        
        const freshWeatherData = await getWeatherData(freshSensorData.latitude, freshSensorData.longitude);
        setWeatherData(freshWeatherData);
        
        const fireIntensity = calculateFireIntensity(freshSensorData);
        const areas = calculateFireSpreadAreas(
          freshSensorData.latitude,
          freshSensorData.longitude,
          freshWeatherData,
          fireIntensity
        );
        setAffectedAreas(areas);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!sensorData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Sensor Data Available</h2>
            <p className="text-gray-600 mb-6">Please select a sensor from the monitoring page first.</p>
            <Button onClick={() => navigate('/monitoring')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Monitoring
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fireIntensity = sensorData ? calculateFireIntensity(sensorData) : 0;
  const fireSpreadDirection = weatherData ? getWindDirection((weatherData.wind_deg + 180) % 360) : 'N/A';
  const spreadRate = calculateSpreadRate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/monitoring')}
            className="text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Monitoring
          </Button>
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <Flame className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fire Spread Analysis</h1>
              <p className="text-sm text-gray-600">Spreading toward {fireSpreadDirection}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">
            Fire Intensity: <span className="font-bold text-red-600">Level {fireIntensity}/10</span>
          </div>
          <Button 
            onClick={handleRefreshData} 
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Updating...' : 'Refresh Live Data'}
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Map and Information Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Map Container */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="bg-white border-b">
                <CardTitle className="flex items-center gap-3">
                  <MapPin className="w-6 h-6 text-red-500" />
                  <span>Fire Spread Prediction Map</span>
                  <div className="flex gap-3 ml-auto text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                      <span>Active Fire</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span>High Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <span>Medium Risk</span>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 relative">
                <div 
                  ref={mapRef}
                  className="w-full h-96 lg:h-[600px] rounded-b-lg"
                />
                {isLoading && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-b-lg">
                    <div className="flex items-center gap-3 bg-white p-6 rounded-lg border border-gray-200">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <div>
                        <div className="text-gray-800 font-semibold">Updating Live Data</div>
                        <div className="text-sm text-gray-600">Recalculating fire spread zones...</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Information Cards Below Map */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Fire Spread Analysis Card */}
              <Card className="border border-orange-200 shadow-sm">
                <CardHeader className="bg-orange-50 border-b border-orange-200">
                  <CardTitle className="flex items-center gap-3 text-orange-800">
                    <TrendingUp className="w-5 h-5" />
                    <span>Fire Spread Analysis</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                      <div className="text-sm text-gray-600 mb-1">Spread Rate</div>
                      <div className={`text-lg font-bold ${
                        spreadRate === 'Very Fast' ? 'text-red-600' :
                        spreadRate === 'Fast' ? 'text-orange-600' :
                        spreadRate === 'Moderate' ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {spreadRate}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-orange-100">
                      <div className="text-sm text-gray-600 mb-1">Direction</div>
                      <div className="text-lg font-bold text-blue-600">{fireSpreadDirection}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                      <Compass className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-blue-800">Primary Spread Direction</div>
                        <div className="text-xs text-blue-700">Fire is primarily moving toward {fireSpreadDirection} due to wind patterns</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-yellow-800">Spread Factors</div>
                        <div className="text-xs text-yellow-700">
                          {weatherData && `Wind: ${weatherData.wind_speed.toFixed(1)} m/s, `}
                          {sensorData && `Humidity: ${sensorData.humidity}%, Temp: ${sensorData.temp}°C`}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Emergency Response Card */}
              <Card className="border border-red-200 shadow-sm">
                <CardHeader className="bg-red-50 border-b border-red-200">
                  <CardTitle className="flex items-center gap-3 text-red-800">
                    <Shield className="w-5 h-5" />
                    <span>Emergency Response</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-red-100 rounded-lg">
                      <Users className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-red-800">Immediate Actions</div>
                        <ul className="text-xs text-red-700 list-disc list-inside space-y-1 mt-1">
                          <li>Evacuate high-risk zones immediately</li>
                          <li>Follow emergency service instructions</li>
                          <li>Move perpendicular to wind direction</li>
                        </ul>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <Map className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-green-800">Safe Zones</div>
                        <div className="text-xs text-green-700">
                          Move to areas opposite wind direction, avoid canyons and dense vegetation
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-600 text-center">
                      Last updated: {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Column - Sidebar Cards */}
          <div className="space-y-6">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="bg-white border-b">
                <CardTitle className="flex items-center gap-3">
                  <Thermometer className="w-5 h-5 text-red-600" />
                  <span>Fire Source Analysis</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-gray-700 font-medium">Device ID:</span>
                  <span className="font-bold text-gray-900">{sensorData.deviceId}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-gray-700 font-medium">Temperature:</span>
                  <span className="font-bold text-red-600">{sensorData.temp}°C</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-gray-700 font-medium">Humidity:</span>
                  <span className="font-bold text-blue-600">{sensorData.humidity}%</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-gray-700 font-medium">Smoke Level:</span>
                  <span className="font-bold text-gray-700">{sensorData.smoke} ppm</span>
                </div>
                <div className="p-3 bg-red-50 rounded border border-red-200">
                  <div className="text-center">
                    <div className="text-sm text-red-700 font-medium mb-1">Fire Intensity</div>
                    <div className="text-xl font-bold text-red-800">Level {fireIntensity}/10</div>
                    <div className="text-xs text-red-600 mt-1">
                      {fireIntensity >= 8 ? 'Extreme fire danger' :
                       fireIntensity >= 6 ? 'High fire danger' :
                       fireIntensity >= 4 ? 'Moderate fire danger' : 'Low fire danger'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="bg-white border-b">
                <CardTitle className="flex items-center gap-3">
                  <Wind className="w-5 h-5 text-blue-600" />
                  <span>Wind Impact Analysis</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {weatherData ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 p-4 rounded border text-center">
                        <div className="text-sm text-gray-600 mb-2">Wind Speed</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {weatherData.wind_speed.toFixed(1)} m/s
                        </div>
                      </div>
                      <div className="bg-blue-50 p-4 rounded border text-center">
                        <div className="text-sm text-gray-600 mb-2">Direction</div>
                        <div className="text-xl font-bold text-blue-600">
                          {getWindDirection(weatherData.wind_deg)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-orange-50 p-4 rounded border">
                      <div className="flex items-center gap-2 mb-3">
                        <Flame className="w-5 h-5 text-orange-600" />
                        <span className="font-semibold text-orange-800">Fire Spread Direction</span>
                      </div>
                      <p className="text-sm text-orange-700">
                        Fire is spreading toward <strong>{fireSpreadDirection}</strong>. 
                        {weatherData.wind_speed > 8 ? ' High winds accelerating spread.' : 
                         weatherData.wind_speed > 4 ? ' Moderate winds pushing spread.' : 
                         ' Light winds limiting rapid spread.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                    <p className="text-gray-500">Loading live weather data...</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="bg-white border-b">
                <CardTitle className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <span>Risk Zones Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-4">
                  <div className="bg-red-50 p-4 rounded border">
                    <h4 className="font-bold text-red-800 mb-3">Directional Risk Zones</h4>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center p-2 bg-red-100 rounded">
                        <div className="text-red-700 font-bold text-lg">
                          {affectedAreas.filter(a => a.type === 'immediate-fire').length}
                        </div>
                        <div className="text-red-600">Active Fire</div>
                        <div className="text-xs text-gray-600">200m radius</div>
                      </div>
                      <div className="text-center p-2 bg-orange-100 rounded">
                        <div className="text-orange-700 font-bold text-lg">
                          {affectedAreas.filter(a => a.type === 'high-risk').length}
                        </div>
                        <div className="text-orange-600">High Risk</div>
                        <div className="text-xs text-gray-600">500m radius</div>
                      </div>
                      <div className="text-center p-2 bg-yellow-100 rounded">
                        <div className="text-yellow-700 font-bold text-lg">
                          {affectedAreas.filter(a => a.type === 'medium-risk').length}
                        </div>
                        <div className="text-yellow-600">Medium Risk</div>
                        <div className="text-xs text-gray-600">900m radius</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-red-600 rounded text-white">
                      <Flame className="w-4 h-4" />
                      <div>
                        <span className="text-sm font-bold">Active Fire Zone</span>
                        <p className="text-xs opacity-90">Immediate burning area - Extreme danger</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-orange-500 rounded text-white">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <div>
                        <span className="text-sm font-bold">High Risk Zone</span>
                        <p className="text-xs opacity-90">Immediate evacuation required</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-yellow-500 rounded text-white">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                      <div>
                        <span className="text-sm font-bold">Medium Risk Zone</span>
                        <p className="text-xs opacity-90">Prepare for evacuation</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PossibleAffectedAreasMap;
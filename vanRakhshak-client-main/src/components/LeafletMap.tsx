// src/components/LeafletMap.tsx
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SensorData } from '@/types/sensor';

interface LeafletMapProps {
  sensors: SensorData[];
  onSensorClick?: (sensor: SensorData) => void;
  selectedSensorId?: string;
  className?: string;
  showMeshNetwork?: boolean;
}

// Mesh network configuration - realistic for 3km² area
const MESH_CONFIG = {
  MOTHER_SENSOR: {
    latitude: 30.387496,
    longitude: 78.462447,
    range: 1000, // Reduced to 1km for better visualization
    name: "Central Hub Station"
  },
  MAX_RANGE: 3000, // 3km² area
  CONNECTION_OPTIONS: {
    color: '#3b82f6',
    weight: 1.5,
    opacity: 0.5,
    dashArray: '4, 4'
  },
  STRONG_CONNECTION_OPTIONS: {
    color: '#10b981',
    weight: 2,
    opacity: 0.7,
    dashArray: 'none'
  }
};

// Utility function to create base64 SVG icons
const toBase64 = (str: string): string => {
  try {
    return typeof window !== 'undefined'
      ? window.btoa(unescape(encodeURIComponent(str)))
      : Buffer.from(str).toString('base64');
  } catch (e) {
    return typeof window !== 'undefined' ? window.btoa(str) : Buffer.from(str).toString('base64');
  }
};

// Calculate distance between two coordinates in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Create sensor icon based on status
const createSensorIcon = (sensor: SensorData, isSelected: boolean = false, isMother: boolean = false) => {
  const size = isSelected ? 28 : isMother ? 32 : 22;
  
  let color = '#22c55e'; // green for normal
  let innerIcon = '';
  let pulseEffect = '';
  
  if (isMother) {
    color = '#7c3aed'; // purple for mother sensor
    innerIcon = '<rect x="9" y="9" width="6" height="6" rx="1" fill="white" fill-opacity="0.9"/>';
    pulseEffect = '<circle cx="12" cy="12" r="8" stroke="white" stroke-width="1" fill="none" opacity="0.6"><animate attributeName="r" from="8" to="12" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite"/></circle>';
  } else if (sensor.isFire) {
    color = '#ef4444'; // red for fire
    innerIcon = '<path d="M12 7v5l3 1.5" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none"/>';
    // Small pulsing effect for fire alerts
    pulseEffect = '<circle cx="12" cy="12" r="6" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.4"><animate attributeName="r" from="6" to="9" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite"/></circle>';
  } else if (sensor.status === 'warning' || sensor.temp > 35 || sensor.smoke > 50) {
    color = '#f59e0b'; // orange for warning
    innerIcon = '<path d="M12 8v4m0 4h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>';
  } else {
    innerIcon = '<circle cx="12" cy="12" r="3" fill="white" fill-opacity="0.8"/>';
  }

  const svgString = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="${isSelected ? '2.5' : '2'}"/>
    ${pulseEffect}
    ${innerIcon}
    ${isSelected ? '<circle cx="12" cy="12" r="7" stroke="white" stroke-width="1" fill="none" opacity="0.8"/>' : ''}
  </svg>`;

  const dataUrl = `data:image/svg+xml;base64,${toBase64(svgString)}`;

  return L.icon({
    iconUrl: dataUrl,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
};

export interface LeafletMapHandle {
  zoomToSensor: (sensor: SensorData) => void;
  zoomToMeshNetwork: () => void;
}

const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(({ 
  sensors, 
  onSensorClick, 
  selectedSensorId,
  className = "",
  showMeshNetwork = true
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const circlesRef = useRef<L.Circle[]>([]);
  const connectionsRef = useRef<L.Polyline[]>([]);
  const meshCircleRef = useRef<L.Circle | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map focused on mother sensor location
    const mapInstance = L.map(mapRef.current, {
      preferCanvas: true,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      zoomSnap: 0.5
    }).setView([MESH_CONFIG.MOTHER_SENSOR.latitude, MESH_CONFIG.MOTHER_SENSOR.longitude], 13);

    // Add tile layer with better contrast for sensors
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(mapInstance);

    // Add zoom control to bottom right
    mapInstance.zoomControl.setPosition('bottomright');

    mapInstanceRef.current = mapInstance;
    setMapReady(true);

    // Fix map rendering
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 100);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    zoomToSensor: (sensor: SensorData) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([sensor.latitude, sensor.longitude], 16, { animate: true });
        
        const marker = markersRef.current.find(m => {
          const latLng = m.getLatLng();
          return latLng.lat === sensor.latitude && latLng.lng === sensor.longitude;
        });
        
        if (marker) {
          setTimeout(() => marker.openPopup(), 300);
        }
      }
    },
    zoomToMeshNetwork: () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView(
          [MESH_CONFIG.MOTHER_SENSOR.latitude, MESH_CONFIG.MOTHER_SENSOR.longitude], 
          12, 
          { animate: true }
        );
      }
    }
  }));

  // Function to create mesh network connections
  const createMeshConnections = (map: L.Map, validSensors: SensorData[]) => {
    // Remove existing connections
    connectionsRef.current.forEach(connection => {
      if (map.hasLayer(connection)) map.removeLayer(connection);
    });
    connectionsRef.current = [];

    // Remove existing mesh circle
    if (meshCircleRef.current && map.hasLayer(meshCircleRef.current)) {
      map.removeLayer(meshCircleRef.current);
    }

    if (!showMeshNetwork) return;

    // Add subtle mesh network coverage circle (smaller and more subtle)
    meshCircleRef.current = L.circle(
      [MESH_CONFIG.MOTHER_SENSOR.latitude, MESH_CONFIG.MOTHER_SENSOR.longitude],
      {
        radius: MESH_CONFIG.MOTHER_SENSOR.range,
        color: '#7c3aed',
        fillColor: '#7c3aed',
        fillOpacity: 0.05, // Very subtle fill
        weight: 1,
        opacity: 0.3,
        dashArray: '8, 8'
      }
    ).addTo(map);

    // Create connections between mother sensor and child sensors
    validSensors.forEach(sensor => {
      const distance = calculateDistance(
        MESH_CONFIG.MOTHER_SENSOR.latitude,
        MESH_CONFIG.MOTHER_SENSOR.longitude,
        sensor.latitude,
        sensor.longitude
      );

      // Only create connection if within range
      if (distance <= MESH_CONFIG.MAX_RANGE) {
        const isStrongConnection = distance <= 800;
        const connection = L.polyline(
          [
            [MESH_CONFIG.MOTHER_SENSOR.latitude, MESH_CONFIG.MOTHER_SENSOR.longitude],
            [sensor.latitude, sensor.longitude]
          ],
          isStrongConnection ? MESH_CONFIG.STRONG_CONNECTION_OPTIONS : MESH_CONFIG.CONNECTION_OPTIONS
        ).addTo(map);

        // Add subtle tooltip with distance
        connection.bindTooltip(
          `${Math.round(distance)}m • ${isStrongConnection ? 'Strong' : 'Good'}`,
          { 
            permanent: false, 
            direction: 'center',
            className: 'connection-tooltip'
          }
        );

        connectionsRef.current.push(connection);
      }
    });

    // Create connections between nearby child sensors (within 500m of each other)
    validSensors.forEach((sensor1, index) => {
      validSensors.slice(index + 1).forEach(sensor2 => {
        const distance = calculateDistance(
          sensor1.latitude,
          sensor1.longitude,
          sensor2.latitude,
          sensor2.longitude
        );

        // Create subtle peer-to-peer connections between nearby sensors
        if (distance <= 500) {
          const peerConnection = L.polyline(
            [
              [sensor1.latitude, sensor1.longitude],
              [sensor2.latitude, sensor2.longitude]
            ],
            {
              color: '#6b7280',
              weight: 1,
              opacity: 0.3,
              dashArray: '2, 4'
            }
          ).addTo(map);

          connectionsRef.current.push(peerConnection);
        }
      });
    });
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Remove existing markers and circles
    markersRef.current.forEach(marker => {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    });
    markersRef.current = [];

    circlesRef.current.forEach(circle => {
      if (map.hasLayer(circle)) map.removeLayer(circle);
    });
    circlesRef.current = [];

    // Filter sensors to only include those with valid coordinates from API
    const validSensors = sensors.filter(sensor => 
      sensor.latitude !== undefined && 
      sensor.longitude !== undefined &&
      !isNaN(sensor.latitude) && 
      !isNaN(sensor.longitude) &&
      sensor.latitude !== 0 && 
      sensor.longitude !== 0
    );

    // Add mother sensor to the display
    const motherSensorData: SensorData = {
      id: 'mother-sensor',
      deviceId: 'HUB-001',
      name: MESH_CONFIG.MOTHER_SENSOR.name,
      latitude: MESH_CONFIG.MOTHER_SENSOR.latitude,
      longitude: MESH_CONFIG.MOTHER_SENSOR.longitude,
      temp: 26,
      humidity: 58,
      smoke: 8,
      status: 'optimal',
      isFire: false,
      timestamp: new Date().toISOString()
    };

    const allSensorsToDisplay = [motherSensorData, ...validSensors];

    // Create mesh network connections
    createMeshConnections(map, validSensors);

    // Add markers for all sensors
    allSensorsToDisplay.forEach((sensor) => {
      const isSelected = selectedSensorId === sensor.id;
      const isMother = sensor.id === 'mother-sensor';
      const icon = createSensorIcon(sensor, isSelected, isMother);

      const marker = L.marker([sensor.latitude, sensor.longitude], { icon }).addTo(map);
      
      const lastUpdate = new Date(sensor.timestamp).toLocaleString();
      
      marker.bindPopup(`
        <div style="padding:12px; min-width:220px; font-family: system-ui, sans-serif;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${isMother ? '#7c3aed' : sensor.isFire ? '#ef4444' : sensor.status === 'warning' ? '#f59e0b' : '#22c55e'}; margin-right: 8px;"></div>
            <h3 style="margin:0; font-weight:600; color:${isMother ? '#7c3aed' : '#1f2937'}; font-size:14px;">
              ${sensor.name || sensor.deviceId} ${isMother ? '📡' : ''}
            </h3>
          </div>
          <div style="font-size:12px; color:#4b5563; line-height:1.4;">
            <div><strong>Device ID:</strong> ${sensor.deviceId}</div>
            ${!isMother ? `
              <div><strong>Temperature:</strong> <span style="color:${sensor.temp > 35 ? '#ef4444' : '#059669'}">${sensor.temp}°C</span></div>
              <div><strong>Humidity:</strong> ${sensor.humidity}%</div>
              <div><strong>Smoke:</strong> <span style="color:${sensor.smoke > 50 ? '#ef4444' : '#059669'}">${sensor.smoke} ppm</span></div>
              <div><strong>Status:</strong> <span style="color:${sensor.isFire ? '#ef4444' : sensor.status === 'warning' ? '#f59e0b' : '#059669'}; font-weight:500">${sensor.isFire ? '🔥 Fire Alert' : sensor.status}</span></div>
            ` : `
              <div><strong>Type:</strong> <span style="color:#7c3aed">Central Hub</span></div>
              <div><strong>Coverage:</strong> ${MESH_CONFIG.MAX_RANGE/1000}km²</div>
              <div><strong>Connected Nodes:</strong> <span style="color:#059669">${validSensors.length}</span></div>
            `}
            <div style="margin-top:4px; color:#6b7280; font-size:11px;"><strong>Last Update:</strong> ${lastUpdate}</div>
          </div>
          ${!isMother ? `
            <div style="margin-top: 12px;">
              <a href="https://www.google.com/maps/dir/?api=1&destination=${sensor.latitude},${sensor.longitude}" 
                 target="_blank" 
                 style="background: #059669; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 11px; font-weight:500; transition: background 0.2s;">
                Get Directions
              </a>
            </div>
          ` : ''}
        </div>
      `);

      // Add click event
      marker.on('click', () => {
        onSensorClick?.(sensor);
      });

      markersRef.current.push(marker);

      // Add subtle alert circle for sensors with fire alerts (smaller size)
      if (sensor.isFire && !isMother) {
        const circle = L.circle([sensor.latitude, sensor.longitude], {
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.15, // Reduced opacity
          weight: 1,
          opacity: 0.6,
          radius: 150 // Reduced from 500m to 150m
        }).addTo(map);
        
        circlesRef.current.push(circle);
      }
    });

    // If we have valid sensors, adjust the map view to show them
    if (allSensorsToDisplay.length > 0) {
      const group = L.featureGroup([...markersRef.current, ...circlesRef.current, ...connectionsRef.current]);
      if (meshCircleRef.current) {
        group.addLayer(meshCircleRef.current);
      }
      map.fitBounds(group.getBounds().pad(0.05)); // Reduced padding for tighter view
    }

    // Ensure map is properly rendered
    setTimeout(() => {
      map.invalidateSize();
    }, 50);

  }, [sensors, selectedSensorId, mapReady, onSensorClick, showMeshNetwork]);

  const validSensorsCount = sensors.filter(sensor => 
    sensor.latitude !== undefined && 
    sensor.longitude !== undefined &&
    !isNaN(sensor.latitude) && 
    !isNaN(sensor.longitude) &&
    sensor.latitude !== 0 && 
    sensor.longitude !== 0
  ).length;

  const activeConnections = connectionsRef.current.length;

  return (
    <div className={`${className} relative`}>
      <div ref={mapRef} className="absolute inset-0 rounded-lg" />
      
      {/* Enhanced Legend Card */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-3 z-[1000] max-w-[200px]">
        <h3 className="font-semibold text-gray-800 text-sm mb-2">Forest Mesh Network</h3>
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <span>Central Hub:</span>
            <span className="font-medium text-purple-600">1</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Field Sensors:</span>
            <span className="font-medium text-green-600">{validSensorsCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Coverage:</span>
            <span className="font-medium text-blue-600">3km²</span>
          </div>
        </div>
        
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 mr-2 flex-shrink-0"></div>
            <span className="text-xs text-gray-700">Central Hub</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2 flex-shrink-0"></div>
            <span className="text-xs text-gray-700">Normal</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2 flex-shrink-0"></div>
            <span className="text-xs text-gray-700">Fire Alert</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-orange-500 mr-2 flex-shrink-0"></div>
            <span className="text-xs text-gray-700">Warning</span>
          </div>
        </div>

        {showMeshNetwork && (
          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="flex items-center mb-1">
              <div className="w-3 h-0.5 bg-blue-500 mr-2"></div>
              <span className="text-xs text-gray-700">Network Link</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-0.5 bg-gray-400 mr-2 opacity-50"></div>
              <span className="text-xs text-gray-700">Peer Link</span>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Network Status Indicator */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-3 z-[1000] min-w-[140px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-700">Network</span>
          <div className={`w-2 h-2 rounded-full ${validSensorsCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
        </div>
        <div className="text-xs text-gray-600 space-y-0.5">
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={`font-medium ${validSensorsCount > 0 ? 'text-green-600' : 'text-gray-500'}`}>
              {validSensorsCount > 0 ? 'Active' : 'Offline'}
            </span>
          </div>
          {showMeshNetwork && (
            <div className="flex justify-between">
              <span>Links:</span>
              <span className="font-medium text-blue-600">{activeConnections}</span>
            </div>
          )}
        </div>
      </div>

      {/* Scale Control */}
      <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm border border-gray-200 z-[1000]">
        <div className="text-xs text-gray-600 font-medium">3km² Coverage</div>
      </div>
    </div>
  );
});

// Add custom CSS for connection tooltips
const style = document.createElement('style');
style.textContent = `
  .connection-tooltip {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: #4b5563;
    font-weight: 500;
  }
`;
document.head.appendChild(style);

LeafletMap.displayName = 'LeafletMap';

export default LeafletMap;
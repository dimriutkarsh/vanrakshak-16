// src/pages/LiveMonitoring.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFireAlerts, getFireAlertByDeviceId } from '@/api/fireAlerts';
import { getWeatherData, type WeatherData as ApiWeatherData } from '@/api/weatherApi';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LogOut, 
  Thermometer, 
  Droplets, 
  Wind, 
  AlertTriangle, 
  Clock, 
  MapPin, 
  Monitor, 
  Flame, 
  RefreshCw, 
  Activity, 
  Brain, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Shield, 
  Satellite, 
  Cpu, 
  Navigation,
  Verified,
  AlertCircle
} from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useParams, useNavigate } from 'react-router-dom';
import { SensorData } from '@/types/sensor';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

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
  weatherData?: {
    temp_max: number;
    temp_min: number;
    wind_speed: number;
    wind_gust: number;
    current_temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
    description: string;
  };
}

interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  visibility: number;
  description: string;
  icon: string;
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
  confidence?: number;
  probabilities?: Record<string, number>;
  status: 'processing' | 'completed' | 'failed';
}

interface FireAlertSession {
  id: string;
  deviceId: string;
  startTime: string;
  endTime: string | null;
  readings: SensorReading[];
  mlPredictions: MLPrediction[];
  maxTemp: number;
  minTemp: number;
  avgTemp: number;
  maxSmoke: number;
  minSmoke: number;
  avgSmoke: number;
  maxHumidity: number;
  minHumidity: number;
  avgHumidity: number;
  status: 'active' | 'completed';
  mlConfirmed: boolean;
}

// REAL ML Prediction API Call
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

// Convert API data to SensorData format
const convertApiToSensorData = (apiDevices: any[]): SensorData[] => {
  if (!apiDevices || !Array.isArray(apiDevices)) return [];

  return apiDevices.map(device => {
    const deviceId = device.deviceId || device.id || (device._id ? `DEV-${device._id.slice(-4)}` : 'DEV-unknown');
    const id = device._id || device.id || deviceId;

    return {
      id: id,
      deviceId: deviceId,
      latitude: device.latitude || 0,
      longitude: device.longitude || 0,
      humidity: device.humidity || 0,
      temp: device.temp || device.temperature || 0,
      smoke: device.smoke || 0,
      isFire: device.isfire || device.isFire || false,
      timestamp: device.lastUpdate || device.timestamp || new Date().toISOString(),
      name: device.name || `Sensor ${deviceId}`,
      status: device.isfire || device.isFire ? 'warning' : 'active',
    };
  });
};

// Process weather data
const processWeatherData = (weatherData: ApiWeatherData): WeatherData => {
  return {
    temp: weatherData.temp,
    feels_like: weatherData.feels_like,
    humidity: weatherData.humidity,
    pressure: weatherData.pressure,
    wind_speed: weatherData.wind_speed,
    wind_deg: weatherData.wind_deg,
    wind_gust: weatherData.wind_gust,
    visibility: weatherData.visibility,
    description: weatherData.description,
    icon: weatherData.icon
  };
};

// Function to process and store weather data with readings
const processReadingWithWeather = (reading: SensorReading, weather: WeatherData | null): SensorReading => {
  if (!weather) return reading;
  
  return {
    ...reading,
    weatherData: {
      temp_max: weather.temp + 5,
      temp_min: weather.temp - 5,
      wind_speed: weather.wind_speed,
      wind_gust: weather.wind_gust || 0,
      current_temp: weather.temp,
      feels_like: weather.feels_like,
      humidity: weather.humidity,
      pressure: weather.pressure,
      description: weather.description
    }
  };
};

const LiveMonitoring: React.FC = () => {
  const [selectedSensorId, setSelectedSensorId] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [isMonitoringFire, setIsMonitoringFire] = useState<boolean>(false);
  const [activeSessions, setActiveSessions] = useState<FireAlertSession[]>([]);
  const [completedSessions, setCompletedSessions] = useState<FireAlertSession[]>([]);
  const [currentSession, setCurrentSession] = useState<FireAlertSession | null>(null);
  const [lastProcessedTimestamp, setLastProcessedTimestamp] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mlPredictions, setMlPredictions] = useState<MLPrediction[]>([]);
  const [isMlProcessing, setIsMlProcessing] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);
  const [showVerificationButton, setShowVerificationButton] = useState<boolean>(false);
  const { sensorId } = useParams();
  const navigate = useNavigate();

  // Fetch all available sensors from API
  const { 
    data: allSensorsData, 
    isLoading: isLoadingSensors, 
    refetch: refetchSensors,
    error: sensorsError 
  } = useQuery({
    queryKey: ['allFireAlerts'],
    queryFn: getFireAlerts,
    refetchInterval: 10000,
  });

  // Convert API data to sensor format
  const availableSensors = convertApiToSensorData(allSensorsData || []);

  // Get sensor ID from URL parameters if available
  useEffect(() => {
    if (sensorId) {
      setSelectedSensorId(sensorId);
      setIsMonitoringFire(true);
      setSensorReadings([]);
      setLastProcessedTimestamp('');
    }
  }, [sensorId]);

  // Fetch data for the selected sensor
  const { 
    data: apiResponse, 
    isLoading: isLoadingSensor, 
    error: sensorError, 
    refetch: refetchSensor 
  } = useQuery({
    queryKey: ['fireAlerts', selectedSensorId],
    queryFn: () => selectedSensorId ? getFireAlertByDeviceId(selectedSensorId) : null,
    refetchInterval: 5000,
    enabled: !!selectedSensorId,
  });

  // Fetch weather data when sensor is selected or readings update
  const fetchWeatherData = useCallback(async (lat: number, lon: number) => {
    if (!lat || !lon) return;
    
    setIsLoadingWeather(true);
    try {
      const apiWeatherData = await getWeatherData(lat, lon);
      const processedData = processWeatherData(apiWeatherData);
      setWeatherData(processedData);
    } catch (error) {
      console.error('Error fetching weather data:', error);
    } finally {
      setIsLoadingWeather(false);
    }
  }, []);

  // Load saved sessions on component mount
  useEffect(() => {
    const savedSessions = JSON.parse(localStorage.getItem('fireAlertSessions') || '[]');
    setCompletedSessions(savedSessions);
  }, []);

  // Check if reading is a duplicate
  const isDuplicateReading = useCallback((newReading: SensorReading, existingReadings: SensorReading[]) => {
    return existingReadings.some(reading => 
      reading.timestamp === newReading.timestamp &&
      reading.temp === newReading.temp &&
      reading.humidity === newReading.humidity &&
      reading.smoke === newReading.smoke
    );
  }, []);

  // Process REAL ML prediction for a reading
  const processMlPrediction = useCallback(async (reading: SensorReading, weather: WeatherData | null) => {
    if (!weather || !reading.weatherData) return;

    const predictionId = `ml-${Date.now()}`;
    
    // Add processing prediction
    const processingPrediction: MLPrediction = {
      id: predictionId,
      timestamp: new Date().toISOString(),
      input_data: {
        temperature: reading.temp,
        humidity: reading.humidity,
        smoke: reading.smoke,
        temp_max: reading.weatherData.temp_max,
        temp_min: reading.weatherData.temp_min,
        wind_speed: reading.weatherData.wind_speed,
        wind_gust: reading.weatherData.wind_gust
      },
      prediction: 0,
      level: 'Processing',
      emoji: '⏳',
      message: 'Analyzing data...',
      status: 'processing'
    };

    setMlPredictions(prev => [processingPrediction, ...prev.slice(0, 9)]);
    setIsMlProcessing(true);

    try {
      const result = await predictFireWithML(processingPrediction.input_data);
      
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
        message: 'Failed to analyze data',
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

  // Convert API data to sensor format and store readings history
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

      setSensorReadings(prev => {
        if (isDuplicateReading(newReading, prev)) {
          return prev;
        }
        
        // Enhance reading with weather data if available
        const enhancedReading = weatherData 
          ? processReadingWithWeather(newReading, weatherData)
          : newReading;
        
        const updatedReadings = [enhancedReading, ...prev].slice(0, 20);
        setLastUpdate(new Date());
        
        // Trigger ML prediction for ALL readings to get real ML analysis
        if (weatherData && enhancedReading.weatherData) {
          processMlPrediction(enhancedReading, weatherData);
        }
        
        return updatedReadings;
      });
    }
  }, [apiResponse, selectedSensorId, isDuplicateReading, processMlPrediction, weatherData]);

  // Update weather data when sensor readings change
  useEffect(() => {
    if (selectedSensorId && sensorReadings.length > 0) {
      const latestReading = sensorReadings[0];
      fetchWeatherData(latestReading.latitude, latestReading.longitude);
    }
  }, [selectedSensorId, sensorReadings, fetchWeatherData]);

  // Show verification button ONLY when API indicates fire or ML confirms
  useEffect(() => {
    if (sensorReadings.length > 0) {
      const latestReading = sensorReadings[0];
      
      // Check if API indicates fire OR latest ML prediction indicates fire (prediction === 1)
      const latestMlPrediction = mlPredictions[0];
      const mlIndicatesFire = latestMlPrediction?.status === 'completed' && latestMlPrediction.prediction === 1;
      
      const shouldShowVerification = latestReading.isFire || mlIndicatesFire;
      
      setShowVerificationButton(shouldShowVerification);
      
      // Auto-hide after 30 seconds if conditions return to normal
      if (shouldShowVerification) {
        const timer = setTimeout(() => {
          const currentLatest = sensorReadings[0];
          const currentLatestMl = mlPredictions[0];
          const currentMlIndicatesFire = currentLatestMl?.status === 'completed' && currentLatestMl.prediction === 1;
          
          if (!currentLatest.isFire && !currentMlIndicatesFire) {
            setShowVerificationButton(false);
          }
        }, 30000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [sensorReadings, mlPredictions]);

  // Handle session tracking with REAL ML integration
  useEffect(() => {
    if (sensorReadings.length > 0 && weatherData) {
      const latestReading = sensorReadings[0];
      
      const plainReading = {
        id: latestReading.id,
        deviceId: latestReading.deviceId,
        latitude: latestReading.latitude,
        longitude: latestReading.longitude,
        humidity: latestReading.humidity,
        temp: latestReading.temp,
        smoke: latestReading.smoke,
        isFire: latestReading.isFire,
        timestamp: latestReading.timestamp,
        name: latestReading.name,
        status: latestReading.status,
        weatherData: latestReading.weatherData
      };
      
      // Check ML predictions for this device
      const recentMlPredictions = mlPredictions.filter(pred => 
        pred.input_data.temperature === latestReading.temp &&
        pred.input_data.humidity === latestReading.humidity &&
        pred.input_data.smoke === latestReading.smoke &&
        pred.status === 'completed'
      );

      // ML confirms fire if prediction === 1
      const mlConfirmed = recentMlPredictions.some(pred => pred.prediction === 1);
      
      // Start session only if API indicates fire OR ML confirms fire
      const shouldStartSession = latestReading.isFire || mlConfirmed;
      
      if (shouldStartSession && !currentSession) {
        const newSession: FireAlertSession = {
          id: `session-${Date.now()}`,
          deviceId: plainReading.deviceId,
          startTime: plainReading.timestamp,
          endTime: null,
          readings: [plainReading],
          mlPredictions: recentMlPredictions,
          maxTemp: plainReading.temp,
          minTemp: plainReading.temp,
          avgTemp: plainReading.temp,
          maxSmoke: plainReading.smoke,
          minSmoke: plainReading.smoke,
          avgSmoke: plainReading.smoke,
          maxHumidity: plainReading.humidity,
          minHumidity: plainReading.humidity,
          avgHumidity: plainReading.humidity,
          status: 'active',
          mlConfirmed
        };
        
        setCurrentSession(newSession);
        setActiveSessions(prev => [...prev, newSession]);
      }
      
      else if (shouldStartSession && currentSession) {
        const updatedSession = {
          ...currentSession,
          readings: [plainReading, ...currentSession.readings.slice(0, 49)],
          mlPredictions: [...recentMlPredictions, ...currentSession.mlPredictions].slice(0, 20),
          maxTemp: Math.max(currentSession.maxTemp, plainReading.temp),
          minTemp: Math.min(currentSession.minTemp, plainReading.temp),
          maxSmoke: Math.max(currentSession.maxSmoke, plainReading.smoke),
          minSmoke: Math.min(currentSession.minSmoke, plainReading.smoke),
          maxHumidity: Math.max(currentSession.maxHumidity, plainReading.humidity),
          minHumidity: Math.min(currentSession.minHumidity, plainReading.humidity),
          mlConfirmed: currentSession.mlConfirmed || mlConfirmed
        };
        
        const totalReadings = updatedSession.readings.length;
        updatedSession.avgTemp = updatedSession.readings.reduce((sum, r) => sum + r.temp, 0) / totalReadings;
        updatedSession.avgSmoke = updatedSession.readings.reduce((sum, r) => sum + r.smoke, 0) / totalReadings;
        updatedSession.avgHumidity = updatedSession.readings.reduce((sum, r) => sum + r.humidity, 0) / totalReadings;
        
        setCurrentSession(updatedSession);
        setActiveSessions(prev => 
          prev.map(session => 
            session.id === updatedSession.id ? updatedSession : session
          )
        );
      }
      
      else if (!shouldStartSession && currentSession) {
        const completedSession = {
          ...currentSession,
          endTime: plainReading.timestamp,
          status: 'completed' as const
        };
        
        setCurrentSession(null);
        setActiveSessions(prev => prev.filter(session => session.id !== completedSession.id));
        
        setCompletedSessions(prev => [completedSession, ...prev.slice(0, 9)]);
        
        const savedSessions = JSON.parse(localStorage.getItem('fireAlertSessions') || '[]');
        localStorage.setItem('fireAlertSessions', JSON.stringify([completedSession, ...savedSessions.slice(0, 9)]));
      }
    }
  }, [sensorReadings, currentSession, mlPredictions, weatherData]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetchSensor();
    await refetchSensors();
    
    if (selectedSensorId && sensorReadings.length > 0) {
      const latestReading = sensorReadings[0];
      await fetchWeatherData(latestReading.latitude, latestReading.longitude);
    }
    
    setLastUpdate(new Date());
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleFireVerification = () => {
    if (sensorReadings.length > 0) {
      navigate('/fire-verification', { 
        state: { 
          sensorData: sensorReadings[0],
          sensorId: selectedSensorId,
          mlPredictions: mlPredictions
        } 
      });
    } else {
      navigate('/fire-verification');
    }
  };

  // UPDATED: Only use API's isFire field for status
  const getStatusColor = (sensor: SensorReading) => {
    if (sensor.isFire) return 'text-red-600';
    return 'text-green-600';
  };

  const getStatusText = (sensor: SensorReading) => {
    if (sensor.isFire) return 'FIRE DETECTED';
    return 'NORMAL';
  };

  const getStatusBadgeVariant = (sensor: SensorReading) => {
    if (sensor.isFire) return 'destructive';
    return 'default';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (startTime: string, endTime: string | null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const seconds = ((diffMs % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  const handleManualSensorSelect = (deviceId: string) => {
    setSelectedSensorId(deviceId);
    setIsMonitoringFire(false);
    setSensorReadings([]);
    setMlPredictions([]);
    setWeatherData(null);
    setLastProcessedTimestamp('');
    navigate(`/monitoring/${deviceId}`);
  };

  const handleMainSite = () => {
    window.location.href = "https://dimriutkarsh.github.io/Van-updated/";
  };

  const handleDashboard = () => {
    navigate('/dashboard');
  };

  const handleReports = () => {
    navigate('/reports');
  };

  const handleAffectingAreas = () => {
    if (sensorReadings.length > 0) {
      navigate('/affected-areas', { 
        state: { sensorData: sensorReadings[0] } 
      });
    } else {
      navigate('/affected-areas');
    }
  };

  const handleLogout = () => {
    window.location.href = "https://dimriutkarsh.github.io/Van-updated/login.html";
  };

  // Calculate metrics for enhanced display
  const currentSensor = availableSensors.find(sensor => sensor.deviceId === selectedSensorId);
  const totalSensors = availableSensors.length;
  const activeSensorsCount = availableSensors.filter(s => s.status === 'active').length;
  const warningSensorsCount = availableSensors.filter(s => s.status === 'warning').length;

  // Get latest ML prediction
  const latestMlPrediction = mlPredictions[0];

  // Get latest sensor reading
  const latestReading = sensorReadings[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/50 backdrop-blur-sm">
      {/* Enhanced Header with Glass Effect */}
      <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="text-slate-700 hover:bg-slate-100 p-2 rounded-lg transition-all duration-200" />
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl shadow-lg">
              <Satellite className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                Forest Fire Monitoring
              </h1>
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${isLoadingSensor ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                  {isLoadingSensor ? 'Updating data...' : 'Real-time monitoring active'}
                </div>
                {isMlProcessing && (
                  <div className="flex items-center gap-1 text-blue-600">
                    <Brain className="w-3 h-3" />
                    AI Analysis Active
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-slate-100 transition-all duration-200"
            onClick={handleMainSite}
          >
            Main Site
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-slate-100 transition-all duration-200"
            onClick={handleDashboard}
          >
            Dashboard
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-slate-100 transition-all duration-200"
            onClick={handleReports}
          >
            Reports
          </Button>

          {/* Show Affecting Areas Button - Permanent */}
          <Button
            variant="outline"
            size="sm"
            className="border-blue-500 text-blue-600 hover:bg-blue-50 transition-all duration-200"
            onClick={handleAffectingAreas}
            disabled={!latestReading}
          >
            <Navigation className="w-4 h-4 mr-2" />
            Affecting Areas
          </Button>

          {/* Fire Verification Button - Shows during alerts */}
          {showVerificationButton && (
            <Button
              variant="default"
              size="sm"
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg transition-all duration-200 animate-pulse"
              onClick={handleFireVerification}
            >
              <Verified className="w-4 h-4 mr-2" />
              Verify Fire Alert
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 transition-all duration-200"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Enhanced Main Content */}
      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Alert Banner - Shows when verification is available */}
        {showVerificationButton && (
          <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 rounded-xl shadow-lg animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6" />
                <div>
                  <h3 className="font-bold text-lg">Fire Alert Detected!</h3>
                  <p className="text-orange-100">
                    {latestReading?.isFire 
                      ? `Fire detected by sensor ${latestReading.deviceId}.` 
                      : `AI analysis indicates fire risk for sensor ${latestReading?.deviceId}.`
                    }
                    Click "Verify Fire Alert" for comprehensive analysis.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="bg-white text-red-600 hover:bg-white/90 font-semibold"
                onClick={handleFireVerification}
              >
                <Verified className="w-4 h-4 mr-2" />
                Verify Now
              </Button>
            </div>
          </div>
        )}

        {/* Enhanced Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">Total Sensors</CardTitle>
              <div className="h-9 w-9 rounded-full bg-blue-100 group-hover:bg-blue-200 transition-colors duration-300 flex items-center justify-center">
                <Monitor className="w-4 h-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">{totalSensors}</div>
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
                  {activeSensorsCount} Active
                </Badge>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                  {warningSensorsCount} Alerts
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">Active Sessions</CardTitle>
              <div className="h-9 w-9 rounded-full bg-red-100 group-hover:bg-red-200 transition-colors duration-300 flex items-center justify-center">
                <Flame className="w-4 h-4 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">{activeSessions.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                {activeSessions.length > 0 ? 'Fire alerts monitoring' : 'No active fires'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">Current Sensor</CardTitle>
              <div className="h-9 w-9 rounded-full bg-emerald-100 group-hover:bg-emerald-200 transition-colors duration-300 flex items-center justify-center">
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-slate-800 truncate">
                {currentSensor?.name || 'None Selected'}
              </div>
              <div className="text-xs text-slate-500">
                {selectedSensorId ? 'Live monitoring' : 'Select sensor to start'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">AI Analysis</CardTitle>
              <div className="h-9 w-9 rounded-full bg-purple-100 group-hover:bg-purple-200 transition-colors duration-300 flex items-center justify-center">
                <Brain className="w-4 h-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">
                {mlPredictions.filter(p => p.status === 'completed' && p.prediction === 1).length}
              </div>
              <div className="text-xs text-slate-500">
                {isMlProcessing ? 'Processing...' : 'Fire predictions'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sensor Selection Card - Enhanced */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Cpu className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-slate-800">Sensor Control Center</CardTitle>
                  <div className="text-sm text-slate-600 mt-1">
                    Select and monitor sensor data in real-time
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                {isMonitoringFire && (
                  <Badge variant="destructive" className="animate-pulse px-3 py-1">
                    <Flame className="w-3 h-3 mr-1" />
                    Alert Mode
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <Select value={selectedSensorId} onValueChange={handleManualSensorSelect}>
                  <SelectTrigger className="w-full h-12 border-slate-300 focus:ring-2 focus:ring-blue-500/20">
                    <SelectValue placeholder="Choose a sensor to monitor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingSensors ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading sensors...
                        </div>
                      </SelectItem>
                    ) : availableSensors.length > 0 ? (
                      availableSensors.map(sensor => (
                        <SelectItem key={sensor.deviceId} value={sensor.deviceId}>
                          <div className="flex items-center gap-3 py-1">
                            <div className={`w-2 h-2 rounded-full ${
                              sensor.isFire ? 'bg-red-500 animate-pulse' : 
                              sensor.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}></div>
                            <div>
                              <div className="font-medium text-slate-800">{sensor.name}</div>
                              <div className="text-xs text-slate-500">ID: {sensor.deviceId}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-sensors" disabled>No sensors available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-4">
                {isLoadingSensor && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading live sensor data...
                  </div>
                )}
                {sensorError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                    Sensor connection error
                  </div>
                )}
                {sensorsError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                    Sensors list error
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Reading Display - Enhanced with Permanent Affecting Areas Button */}
        {latestReading && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader className={`pb-4 ${
              latestReading.isFire 
                ? 'bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200' 
                : 'bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200'
            }`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    latestReading.isFire ? 'bg-red-100' : 'bg-emerald-100'
                  }`}>
                    <Activity className={`w-5 h-5 ${
                      latestReading.isFire ? 'text-red-600' : 'text-emerald-600'
                    }`} />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-800">
                      Live Reading: {latestReading.name}
                    </CardTitle>
                    <div className="text-sm text-slate-600 flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4" />
                      Location: {latestReading.latitude.toFixed(4)}, {latestReading.longitude.toFixed(4)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={getStatusBadgeVariant(latestReading)} className={
                    latestReading.isFire ? "animate-pulse px-3 py-1" : "px-3 py-1"
                  }>
                    {latestReading.isFire && <Flame className="w-3 h-3 mr-1" />}
                    {getStatusText(latestReading)}
                  </Badge>
                  {/* Permanent Affecting Areas Button in Current Reading Header */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-green-600 text-green-700 hover:bg-green-50 transition-all duration-200"
                    onClick={handleAffectingAreas}
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Affecting Areas
                  </Button>
                  <div className="text-sm text-slate-500">
                    Updated: {formatTimestamp(latestReading.timestamp)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Real-time Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                <Card className="bg-white border-0 shadow-md hover:shadow-lg transition-all duration-300">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
                      <Thermometer className="w-5 h-5 text-red-500" />
                      Temperature
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-slate-800">{latestReading.temp}°C</div>
                    <Progress 
                      value={Math.min(latestReading.temp, 100)} 
                      className="h-2 mt-3 bg-slate-200"
                    />
                  </CardContent>
                </Card>

                <Card className="bg-white border-0 shadow-md hover:shadow-lg transition-all duration-300">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
                      <Droplets className="w-5 h-5 text-blue-500" />
                      Humidity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-slate-800">{latestReading.humidity}%</div>
                    <Progress 
                      value={latestReading.humidity} 
                      className="h-2 mt-3 bg-slate-200"
                    />
                  </CardContent>
                </Card>

                <Card className="bg-white border-0 shadow-md hover:shadow-lg transition-all duration-300">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
                      <Wind className="w-5 h-5 text-slate-500" />
                      Smoke Level
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-slate-800">{latestReading.smoke} ppm</div>
                    <Progress 
                      value={Math.min(latestReading.smoke, 100)} 
                      className="h-2 mt-3 bg-slate-200"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Weather Data Display from Real API */}
              {weatherData && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                      <Wind className="w-5 h-5 text-blue-600" />
                      Live Weather Conditions
                    </h4>
                    {isLoadingWeather && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Updating weather...
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="text-sm font-medium text-blue-700 mb-1">Temperature</div>
                      <div className="text-xl font-bold text-blue-900">{weatherData.temp}°C</div>
                      <div className="text-xs text-blue-600">Current</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="text-sm font-medium text-blue-700 mb-1">Feels Like</div>
                      <div className="text-xl font-bold text-blue-900">{weatherData.feels_like}°C</div>
                      <div className="text-xs text-blue-600">Perceived</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="text-sm font-medium text-blue-700 mb-1">Wind Speed</div>
                      <div className="text-xl font-bold text-blue-900">{weatherData.wind_speed} m/s</div>
                      <div className="text-xs text-blue-600">
                        {weatherData.wind_gust ? `Gust: ${weatherData.wind_gust}m/s` : 'Steady wind'}
                      </div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="text-sm font-medium text-blue-700 mb-1">Humidity</div>
                      <div className="text-xl font-bold text-blue-900">{weatherData.humidity}%</div>
                      <div className="text-xs text-blue-600 capitalize">{weatherData.description}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons Section */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                {/* Show Possible Affected Areas Button */}
                <Button
                  onClick={handleAffectingAreas}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105"
                  size="lg"
                >
                  <Navigation className="w-5 h-5 mr-2" />
                  Show Possible Affected Areas
                </Button>

                {/* Fire Verification Button - Prominent during alerts */}
                {showVerificationButton && (
                  <Button
                    onClick={handleFireVerification}
                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 animate-pulse"
                    size="lg"
                  >
                    <Verified className="w-5 h-5 mr-2" />
                    Verify Fire Alert
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* REAL ML Prediction Analysis Section */}
        {(isMlProcessing || mlPredictions.length > 0) && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-800">AI Fire Detection Analysis</CardTitle>
                    <div className="text-sm text-slate-600">
                      Real ML model analyzing environmental data
                    </div>
                  </div>
                </div>
                {isMlProcessing && (
                  <Badge className="bg-purple-100 text-purple-700 px-3 py-1">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Analyzing
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current ML Prediction Status */}
              {latestMlPrediction && (
                <div className={`p-5 rounded-xl border-2 transition-all duration-300 ${
                  latestMlPrediction.status === 'processing' 
                    ? 'border-purple-300 bg-purple-50/50 animate-pulse' 
                    : latestMlPrediction.prediction === 1
                    ? 'border-red-300 bg-red-50/50'
                    : latestMlPrediction.prediction === 2
                    ? 'border-amber-300 bg-amber-50/50'
                    : 'border-emerald-300 bg-emerald-50/50'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {latestMlPrediction.status === 'processing' ? (
                        <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                      ) : latestMlPrediction.prediction === 1 ? (
                        <XCircle className="w-6 h-6 text-red-600" />
                      ) : latestMlPrediction.prediction === 2 ? (
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                      ) : (
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg text-slate-800">
                          {latestMlPrediction.level} {latestMlPrediction.emoji}
                        </h3>
                        <div className="text-sm text-slate-600">
                          {latestMlPrediction.message}
                        </div>
                      </div>
                    </div>
                    <Badge className={
                      latestMlPrediction.status === 'processing' ? 'bg-purple-500' :
                      latestMlPrediction.prediction === 1 ? 'bg-red-500' : 
                      latestMlPrediction.prediction === 2 ? 'bg-amber-500' : 'bg-emerald-500'
                    }>
                      {latestMlPrediction.status === 'processing' ? 'PROCESSING' :
                       latestMlPrediction.prediction === 1 ? 'HIGH RISK' :
                       latestMlPrediction.prediction === 2 ? 'BORDERLINE' : 'LOW RISK'}
                    </Badge>
                  </div>
                  
                  {latestMlPrediction.status === 'completed' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Analysis Time:</span>
                          <span className="font-medium text-slate-800">{formatTimestamp(latestMlPrediction.timestamp)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Risk Level:</span>
                          <span className="font-medium text-slate-800">{latestMlPrediction.level}</span>
                        </div>
                        {latestMlPrediction.probabilities && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Confidence:</span>
                            <span className="font-medium text-slate-800">
                              {Math.max(...Object.values(latestMlPrediction.probabilities)) * 100}%
                            </span>
                          </div>
                        )}
                      </div>
                      {latestMlPrediction.probabilities && (
                        <div className="space-y-1">
                          {Object.entries(latestMlPrediction.probabilities).map(([key, value]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-slate-600">Class {key}:</span>
                              <span className="font-medium text-slate-800">{(value * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ML Prediction Input Data */}
              {latestMlPrediction && (
                <div>
                  <h4 className="font-semibold text-lg mb-4 text-slate-800 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />
                    Analysis Input Parameters
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Sensor Temp
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.temperature}°C
                      </div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Sensor Humidity
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.humidity}%
                      </div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Smoke Level
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.smoke} ppm
                      </div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Max Temp
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.temp_max}°C
                      </div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Min Temp
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.temp_min}°C
                      </div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Wind Speed
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.wind_speed} m/s
                      </div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
                        Wind Gust
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {latestMlPrediction.input_data.wind_gust} m/s
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ML Prediction History */}
              {mlPredictions.length > 1 && (
                <div>
                  <h4 className="font-semibold text-lg mb-3 text-slate-800">Prediction History</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {mlPredictions.slice(1).map((prediction) => (
                      <div key={prediction.id} className={`p-3 rounded-lg border transition-all duration-200 ${
                        prediction.prediction === 1 ? 'bg-red-50 border-red-200' : 
                        prediction.prediction === 2 ? 'bg-amber-50 border-amber-200' : 
                        'bg-emerald-50 border-emerald-200'
                      }`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            {prediction.status === 'completed' ? (
                              prediction.prediction === 1 ? (
                                <XCircle className="w-4 h-4 text-red-600" />
                              ) : prediction.prediction === 2 ? (
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                              ) : (
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                              )
                            ) : (
                              <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                            )}
                            <span className="font-medium text-slate-800">
                              {prediction.level} {prediction.emoji}
                            </span>
                          </div>
                          <span className="text-sm text-slate-500">
                            {formatTimestamp(prediction.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reading History - Enhanced */}
        {sensorReadings.length > 1 && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Clock className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-slate-800">Reading History</CardTitle>
                  <div className="text-sm text-slate-600">
                    Recent sensor data recordings and trends
                  </div>
                </div>
                <Badge variant="outline" className="ml-auto bg-slate-100 text-slate-700">
                  {sensorReadings.length} records
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <div className="space-y-3 p-6">
                  {sensorReadings.slice(1).map((reading, index) => (
                    <div 
                      key={`${reading.timestamp}-${index}`} 
                      className={`p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                        reading.isFire 
                          ? 'bg-red-50 border-red-200 animate-pulse' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-800">{formatTimestamp(reading.timestamp)}</span>
                          <Badge variant={getStatusBadgeVariant(reading)} className="text-xs">
                            {getStatusText(reading)}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500">
                          Device: {reading.deviceId}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4 text-red-500" />
                          <span className="font-medium text-slate-800">{reading.temp}°C</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Droplets className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-slate-800">{reading.humidity}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Wind className="w-4 h-4 text-slate-500" />
                          <span className="font-medium text-slate-800">{reading.smoke} ppm</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Sessions - Enhanced */}
        {activeSessions.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl border-red-200">
            <CardHeader className="pb-4 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Flame className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-red-800">Active Fire Alert Sessions</CardTitle>
                  <div className="text-sm text-red-600">
                    Ongoing fire detection and monitoring sessions
                  </div>
                </div>
                <Badge variant="destructive" className="ml-auto animate-pulse px-3 py-1">
                  {activeSessions.length} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {activeSessions.map(session => (
                  <div key={session.id} className="p-4 border border-red-200 rounded-xl bg-red-50 animate-pulse">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold text-red-800 text-lg">Device: {session.deviceId}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="animate-pulse">
                          ACTIVE FIRE
                        </Badge>
                        {session.mlConfirmed && (
                          <Badge className="bg-purple-500 text-white">
                            <Brain className="w-3 h-3 mr-1" />
                            AI Confirmed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-red-600 font-medium">Started:</span>
                        <div className="font-semibold text-red-800">{formatTimestamp(session.startTime)}</div>
                      </div>
                      <div>
                        <span className="text-red-600 font-medium">Duration:</span>
                        <div className="font-semibold text-red-800">{formatDuration(session.startTime, session.endTime)}</div>
                      </div>
                      <div>
                        <span className="text-red-600 font-medium">Max Temp:</span>
                        <div className="font-semibold text-red-800">{session.maxTemp.toFixed(1)}°C</div>
                      </div>
                      <div>
                        <span className="text-red-600 font-medium">Max Smoke:</span>
                        <div className="font-semibold text-red-800">{session.maxSmoke} ppm</div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-red-600">Readings collected:</span>
                        <span className="font-semibold text-red-800 ml-1">{session.readings.length} records</span>
                      </div>
                      <div>
                        <span className="text-red-600">ML Predictions:</span>
                        <span className="font-semibold text-red-800 ml-1">{session.mlPredictions.length}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* System Status - Enhanced */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-600">
                    Auto-refresh: 5 seconds
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-600">
                    Last updated: {lastUpdate.toLocaleTimeString()}
                  </span>
                </div>
                {isMlProcessing && (
                  <div className="flex items-center gap-2 text-purple-600">
                    <Brain className="w-4 h-4 animate-pulse" />
                    <span className="text-sm">AI Analysis in progress</span>
                  </div>
                )}
              </div>
              <Badge variant={sensorError ? "destructive" : "default"} className={
                sensorError ? "" : "bg-emerald-500 hover:bg-emerald-600"
              }>
                {sensorError ? "Connection Error" : "System Operational"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Empty State - Enhanced */}
        {!selectedSensorId && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-slate-100 rounded-2xl">
                  <Monitor className="w-12 h-12 text-slate-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">
                    No Sensor Selected
                  </h3>
                  <div className="text-slate-600 max-w-md">
                    Choose a sensor from the dropdown above to start real-time monitoring and AI-powered fire detection analysis.
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

export default LiveMonitoring;
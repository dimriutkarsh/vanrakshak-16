// src/pages/Reports.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Calendar, Clock, Thermometer, Droplets, Wind, MapPin, AlertTriangle, Trash2, BarChart3, Download, Activity } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface FireAlertSession {
  id: string;
  deviceId: string;
  startTime: string;
  endTime: string | null;
  readings: SensorReading[];
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
  mlPredictions?: any[];
  mlConfirmed?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const Reports: React.FC = () => {
  const [sessions, setSessions] = useState<FireAlertSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<FireAlertSession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const navigate = useNavigate();

  useEffect(() => {
    const savedSessions = JSON.parse(localStorage.getItem('fireAlertSessions') || '[]');
    setSessions(savedSessions);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDuration = (start: string, end: string | null) => {
    if (!end) return 'Ongoing';
    
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const durationMs = endTime - startTime;
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handleMainSite = () => {
    navigate('/');
  };

  const handleDashboard = () => {
    navigate('/dashboard');
  };

  const handleLiveMonitoring = () => {
    navigate('/live-monitoring');
  };

  const getStatusColor = (reading: SensorReading) => {
    if (reading.isFire) return 'text-red-600';
    if (reading.temp > 35 || reading.smoke > 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStatusText = (reading: SensorReading) => {
    if (reading.isFire) return 'FIRE_DETECTED';
    if (reading.temp > 35 || reading.smoke > 50) return 'WARNING';
    return 'NORMAL';
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click event
    setSessionToDelete(sessionId);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (sessionToDelete) {
      const updatedSessions = sessions.filter(session => session.id !== sessionToDelete);
      setSessions(updatedSessions);
      localStorage.setItem('fireAlertSessions', JSON.stringify(updatedSessions));
      
      // If the deleted session was selected, clear the selection
      if (selectedSession && selectedSession.id === sessionToDelete) {
        setSelectedSession(null);
      }
      
      setSessionToDelete(null);
      setShowDeleteDialog(false);
    }
  };

  const cancelDelete = () => {
    setSessionToDelete(null);
    setShowDeleteDialog(false);
  };

  // Prepare chart data for the selected session
  const chartData = useMemo(() => {
    if (!selectedSession) return [];
    
    return selectedSession.readings.map(reading => ({
      time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: reading.timestamp,
      temp: reading.temp,
      smoke: reading.smoke,
      humidity: reading.humidity,
      isFire: reading.isFire ? 1 : 0,
      status: reading.isFire ? 'Fire' : (reading.temp > 35 || reading.smoke > 50 ? 'Warning' : 'Normal')
    }));
  }, [selectedSession]);

  // Prepare severity distribution data
  const severityData = useMemo(() => {
    if (!selectedSession) return [];
    
    const normal = selectedSession.readings.filter(r => !r.isFire && r.temp <= 35 && r.smoke <= 50).length;
    const warning = selectedSession.readings.filter(r => !r.isFire && (r.temp > 35 || r.smoke > 50)).length;
    const fire = selectedSession.readings.filter(r => r.isFire).length;
    
    return [
      { name: 'Normal', value: normal, color: '#10B981' },
      { name: 'Warning', value: warning, color: '#F59E0B' },
      { name: 'Fire', value: fire, color: '#EF4444' }
    ];
  }, [selectedSession]);

  // Calculate statistics for the session
  const sessionStats = useMemo(() => {
    if (!selectedSession) return null;
    
    const fireReadings = selectedSession.readings.filter(r => r.isFire).length;
    const warningReadings = selectedSession.readings.filter(r => !r.isFire && (r.temp > 35 || r.smoke > 50)).length;
    const normalReadings = selectedSession.readings.filter(r => !r.isFire && r.temp <= 35 && r.smoke <= 50).length;
    
    // Find peak fire time
    let peakFireTime = null;
    if (fireReadings > 0) {
      const fireTimestamps = selectedSession.readings
        .filter(r => r.isFire)
        .map(r => new Date(r.timestamp).getTime());
      
      const avgFireTime = fireTimestamps.reduce((a, b) => a + b, 0) / fireTimestamps.length;
      peakFireTime = new Date(avgFireTime).toLocaleTimeString();
    }

    // Calculate weather statistics if available
    const readingsWithWeather = selectedSession.readings.filter(r => r.weatherData);
    let weatherStats = null;
    if (readingsWithWeather.length > 0) {
      const weatherData = readingsWithWeather.map(r => r.weatherData!);
      weatherStats = {
        maxAirTemp: Math.max(...weatherData.map(w => w.temp_max)),
        minAirTemp: Math.min(...weatherData.map(w => w.temp_min)),
        avgWindSpeed: weatherData.reduce((sum, w) => sum + w.wind_speed, 0) / weatherData.length,
        maxWindGust: Math.max(...weatherData.map(w => w.wind_gust)),
        avgPressure: weatherData.reduce((sum, w) => sum + w.pressure, 0) / weatherData.length,
      };
    }
    
    return {
      totalReadings: selectedSession.readings.length,
      fireReadings,
      warningReadings,
      normalReadings,
      firePercentage: (fireReadings / selectedSession.readings.length * 100).toFixed(1),
      warningPercentage: (warningReadings / selectedSession.readings.length * 100).toFixed(1),
      normalPercentage: (normalReadings / selectedSession.readings.length * 100).toFixed(1),
      peakFireTime,
      weatherStats,
      hasWeatherData: readingsWithWeather.length > 0
    };
  }, [selectedSession]);

  // Enhanced CSV export with all 7 required columns and proper formatting
  const exportSessionData = () => {
    if (!selectedSession) return;
    
    const headers = [
      'temperature',
      'humidity', 
      'smoke',
      'temp_max',
      'temp_min',
      'wind_speed',
      'wind_gust'
    ];

    // Prepare data with proper fallbacks for missing weather data
    const data = selectedSession.readings.map(reading => {
      const weather = reading.weatherData;
      
      // Use actual sensor temperature for temperature column
      // For weather temp_max and temp_min, use calculated values or fallbacks
      return [
        reading.temp,                    // temperature (sensor)
        reading.humidity,               // humidity (sensor)
        reading.smoke,                  // smoke (sensor)
        weather?.temp_max || (reading.temp + 2).toFixed(1),  // temp_max (weather or calculated)
        weather?.temp_min || (reading.temp - 2).toFixed(1),  // temp_min (weather or calculated)
        weather?.wind_speed || '0',     // wind_speed (weather)
        weather?.wind_gust || '0'       // wind_gust (weather)
      ];
    });

    // Create CSV content with proper formatting
    const csvContent = [
      headers.join(','),  // Header row
      ...data.map(row => row.join(','))  // Data rows
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `sensor_data_${selectedSession.deviceId}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Enhanced export all sessions with proper data handling
  const exportAllSessions = () => {
    if (sessions.length === 0) return;

    const headers = [
      'temperature',
      'humidity',
      'smoke', 
      'temp_max',
      'temp_min',
      'wind_speed',
      'wind_gust',
      'device_id',
      'timestamp',
      'session_id'
    ];

    const allData = sessions.flatMap(session => 
      session.readings.map(reading => {
        const weather = reading.weatherData;
        
        return [
          reading.temp,                    // temperature
          reading.humidity,               // humidity
          reading.smoke,                  // smoke
          weather?.temp_max || (reading.temp + 2).toFixed(1),  // temp_max
          weather?.temp_min || (reading.temp - 2).toFixed(1),  // temp_min
          weather?.wind_speed || '0',     // wind_speed
          weather?.wind_gust || '0',      // wind_gust
          reading.deviceId,               // device_id
          reading.timestamp,              // timestamp
          session.id                      // session_id
        ];
      })
    );

    const csvContent = [
      headers.join(','),
      ...allData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `complete_sensor_dataset_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to generate a PDF report (placeholder)
  const generatePDFReport = () => {
    alert("PDF generation functionality would be implemented here. This would typically use a library like jsPDF or browser print functionality.");
  };

  // Function to preview CSV data
  const previewCSVData = () => {
    if (!selectedSession) return null;

    const sampleData = selectedSession.readings.slice(0, 5).map(reading => {
      const weather = reading.weatherData;
      return {
        temperature: reading.temp,
        humidity: reading.humidity,
        smoke: reading.smoke,
        temp_max: weather?.temp_max || (reading.temp + 2).toFixed(1),
        temp_min: weather?.temp_min || (reading.temp - 2).toFixed(1),
        wind_speed: weather?.wind_speed || 0,
        wind_gust: weather?.wind_gust || 0
      };
    });

    return sampleData;
  };

  const csvPreview = previewCSVData();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/50">
      {/* Enhanced Header */}
      <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="text-slate-700 hover:bg-slate-100 p-2 rounded-lg transition-all duration-200" />
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl shadow-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                Fire Alert Reports & Analytics
              </h1>
              <p className="text-sm text-slate-600">
                Historical fire alert sessions, analytics, and data export
              </p>
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
            onClick={handleLiveMonitoring}
          >
            Live Monitoring
          </Button>

          {sessions.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              className="border-green-600 text-green-600 hover:bg-green-50 transition-all duration-200"
              onClick={exportAllSessions}
            >
              <Download className="w-4 h-4 mr-2" />
              Export All Data
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 transition-all duration-200"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {sessions.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-slate-100 rounded-2xl">
                <BarChart3 className="w-12 h-12 text-slate-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">No Fire Alert Sessions Recorded</h2>
                <p className="text-slate-600 max-w-md">
                  Fire alert sessions will appear here after they are detected and resolved in the Live Monitoring section.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Session List */}
            <div className="lg:col-span-1">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold text-slate-800">
                      Fire Alert Sessions
                    </CardTitle>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {sessions.length} total
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {sessions.map(session => (
                      <Card 
                        key={session.id} 
                        className={`cursor-pointer p-4 transition-all duration-200 hover:shadow-lg border-2 relative ${
                          selectedSession?.id === session.id 
                            ? 'border-blue-500 bg-blue-50/50' 
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setSelectedSession(session)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-6 w-6 text-slate-400 hover:text-red-500"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-slate-800">Device: {session.deviceId}</h3>
                            <p className="text-sm text-slate-500 mt-1">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {new Date(session.startTime).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge 
                            className={
                              session.status === 'completed' 
                                ? 'bg-green-100 text-green-800 border-green-200' 
                                : 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse'
                            }
                          >
                            {session.status === 'completed' ? 'Completed' : 'Active'}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                          <div className="flex items-center">
                            <Thermometer className="w-3 h-3 mr-2 text-red-500" />
                            <div>
                              <div className="font-medium text-slate-800">{session.maxTemp.toFixed(1)}°C</div>
                              <div className="text-xs text-slate-500">Max Temp</div>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <Wind className="w-3 h-3 mr-2 text-slate-500" />
                            <div>
                              <div className="font-medium text-slate-800">{session.maxSmoke}ppm</div>
                              <div className="text-xs text-slate-500">Max Smoke</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center text-slate-600">
                            <Clock className="w-3 h-3 mr-1" />
                            {getDuration(session.startTime, session.endTime)}
                          </div>
                          <div className="text-slate-500 text-xs">
                            {session.readings.length} readings
                          </div>
                        </div>
                        
                        {session.mlConfirmed && (
                          <div className="mt-2 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full inline-flex items-center">
                            <span className="w-1.5 h-1.5 bg-purple-600 rounded-full mr-1"></span>
                            AI Confirmed
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Session Details */}
            <div className="lg:col-span-2">
              {selectedSession ? (
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                  <CardHeader className="pb-4 border-b border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Activity className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <CardTitle className="text-xl font-bold text-slate-800">
                            Session Analysis: {selectedSession.deviceId}
                          </CardTitle>
                          <p className="text-sm text-slate-600">
                            Detailed sensor data and analytics for this fire alert session
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedSession.mlConfirmed && (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                            <span className="w-1.5 h-1.5 bg-purple-600 rounded-full mr-1"></span>
                            AI Confirmed
                          </Badge>
                        )}
                        <Badge className={
                          selectedSession.status === 'completed' 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse'
                        }>
                          {selectedSession.status === 'completed' ? 'Completed' : 'Active'}
                        </Badge>
                      </div>
                    </div>

                    {/* Export Buttons */}
                    <div className="flex flex-wrap gap-3 mt-4">
                      <Button 
                        size="sm" 
                        onClick={exportSessionData}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV (7 Columns)
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={generatePDFReport}
                        className="border-blue-600 text-blue-600 hover:bg-blue-50"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Generate PDF Report
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6">
                    {/* Session Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-1">Start Time</p>
                        <p className="text-lg font-bold text-slate-800">
                          {new Date(selectedSession.startTime).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(selectedSession.startTime).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-1">Duration</p>
                        <p className="text-lg font-bold text-slate-800">
                          {getDuration(selectedSession.startTime, selectedSession.endTime)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedSession.endTime ? 'Completed' : 'In Progress'}
                        </p>
                      </div>
                      <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-1">Total Readings</p>
                        <p className="text-lg font-bold text-slate-800">{selectedSession.readings.length}</p>
                        <p className="text-xs text-slate-500">Data points</p>
                      </div>
                      <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-1">Device ID</p>
                        <p className="text-lg font-bold text-slate-800 font-mono text-sm">
                          {selectedSession.deviceId}
                        </p>
                        <p className="text-xs text-slate-500">Sensor Device</p>
                      </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                      <TabsList className="grid grid-cols-4 mb-8 bg-slate-100 p-1 rounded-lg">
                        <TabsTrigger 
                          value="overview" 
                          className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
                        >
                          Overview
                        </TabsTrigger>
                        <TabsTrigger 
                          value="charts" 
                          className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
                        >
                          Charts
                        </TabsTrigger>
                        <TabsTrigger 
                          value="analysis" 
                          className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
                        >
                          Analysis
                        </TabsTrigger>
                        <TabsTrigger 
                          value="export" 
                          className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
                        >
                          Data Export
                        </TabsTrigger>
                      </TabsList>

                      {/* Overview Tab */}
                      <TabsContent value="overview" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <Card className="border-0 shadow-md">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center gap-2 text-base">
                                <Thermometer className="w-5 h-5 text-red-500" />
                                Temperature Statistics
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-slate-600">Maximum:</span>
                                <span className="font-bold text-red-600">{selectedSession.maxTemp.toFixed(1)}°C</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Minimum:</span>
                                <span className="font-bold text-blue-600">{selectedSession.minTemp.toFixed(1)}°C</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Average:</span>
                                <span className="font-bold text-slate-800">{selectedSession.avgTemp.toFixed(1)}°C</span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-0 shadow-md">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center gap-2 text-base">
                                <Wind className="w-5 h-5 text-slate-500" />
                                Smoke Statistics
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-slate-600">Maximum:</span>
                                <span className="font-bold text-red-600">{selectedSession.maxSmoke} ppm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Minimum:</span>
                                <span className="font-bold text-blue-600">{selectedSession.minSmoke} ppm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Average:</span>
                                <span className="font-bold text-slate-800">{selectedSession.avgSmoke.toFixed(1)} ppm</span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-0 shadow-md">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center gap-2 text-base">
                                <Droplets className="w-5 h-5 text-blue-500" />
                                Humidity Statistics
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-slate-600">Maximum:</span>
                                <span className="font-bold text-red-600">{selectedSession.maxHumidity}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Minimum:</span>
                                <span className="font-bold text-blue-600">{selectedSession.minHumidity}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-600">Average:</span>
                                <span className="font-bold text-slate-800">{selectedSession.avgHumidity.toFixed(1)}%</span>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Severity Distribution */}
                        <Card className="border-0 shadow-md">
                          <CardHeader>
                            <CardTitle className="text-lg">Severity Distribution</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={severityData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {severityData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip />
                                  <Legend />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      {/* Charts Tab */}
                      <TabsContent value="charts" className="space-y-6">
                        <Card className="border-0 shadow-md">
                          <CardHeader>
                            <CardTitle className="text-lg">Temperature Trend Over Time</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis 
                                    dataKey="time" 
                                    stroke="#64748b"
                                    fontSize={12}
                                  />
                                  <YAxis 
                                    stroke="#64748b"
                                    fontSize={12}
                                  />
                                  <Tooltip 
                                    contentStyle={{ 
                                      backgroundColor: 'white', 
                                      border: '1px solid #e2e8f0',
                                      borderRadius: '8px'
                                    }}
                                  />
                                  <Legend />
                                  <Line 
                                    type="monotone" 
                                    dataKey="temp" 
                                    stroke="#ef4444" 
                                    strokeWidth={2}
                                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }}
                                    name="Temperature (°C)" 
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-0 shadow-md">
                          <CardHeader>
                            <CardTitle className="text-lg">Smoke Level Analysis</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis 
                                    dataKey="time" 
                                    stroke="#64748b"
                                    fontSize={12}
                                  />
                                  <YAxis 
                                    stroke="#64748b"
                                    fontSize={12}
                                  />
                                  <Tooltip 
                                    contentStyle={{ 
                                      backgroundColor: 'white', 
                                      border: '1px solid #e2e8f0',
                                      borderRadius: '8px'
                                    }}
                                  />
                                  <Legend />
                                  <Area 
                                    type="monotone" 
                                    dataKey="smoke" 
                                    stroke="#8884d8" 
                                    fill="#8884d8" 
                                    fillOpacity={0.3}
                                    strokeWidth={2}
                                    name="Smoke Level (ppm)" 
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      {/* Analysis Tab */}
                      <TabsContent value="analysis" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <Card className="border-0 shadow-md">
                            <CardHeader>
                              <CardTitle className="text-lg">Risk Assessment</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <div className="flex justify-between mb-2">
                                  <span className="text-slate-700">Temperature Risk</span>
                                  <span className={`font-semibold ${
                                    selectedSession.maxTemp > 60 ? 'text-red-600' : 
                                    selectedSession.maxTemp > 40 ? 'text-amber-600' : 'text-green-600'
                                  }`}>
                                    {selectedSession.maxTemp > 60 ? 'High' : 
                                     selectedSession.maxTemp > 40 ? 'Medium' : 'Low'}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2.5">
                                  <div 
                                    className={`h-2.5 rounded-full ${
                                      selectedSession.maxTemp > 60 ? 'bg-red-500' : 
                                      selectedSession.maxTemp > 40 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(selectedSession.maxTemp, 100)}%` }}
                                  ></div>
                                </div>
                              </div>

                              <div>
                                <div className="flex justify-between mb-2">
                                  <span className="text-slate-700">Smoke Risk</span>
                                  <span className={`font-semibold ${
                                    selectedSession.maxSmoke > 100 ? 'text-red-600' : 
                                    selectedSession.maxSmoke > 50 ? 'text-amber-600' : 'text-green-600'
                                  }`}>
                                    {selectedSession.maxSmoke > 100 ? 'High' : 
                                     selectedSession.maxSmoke > 50 ? 'Medium' : 'Low'}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2.5">
                                  <div 
                                    className={`h-2.5 rounded-full ${
                                      selectedSession.maxSmoke > 100 ? 'bg-red-500' : 
                                      selectedSession.maxSmoke > 50 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(selectedSession.maxSmoke, 100)}%` }}
                                  ></div>
                                </div>
                              </div>

                              <div>
                                <div className="flex justify-between mb-2">
                                  <span className="text-slate-700">Overall Fire Risk</span>
                                  <span className={`font-semibold ${
                                    selectedSession.maxTemp > 60 || selectedSession.maxSmoke > 100 ? 'text-red-600' : 
                                    selectedSession.maxTemp > 40 || selectedSession.maxSmoke > 50 ? 'text-amber-600' : 'text-green-600'
                                  }`}>
                                    {selectedSession.maxTemp > 60 || selectedSession.maxSmoke > 100 ? 'High' : 
                                     selectedSession.maxTemp > 40 || selectedSession.maxSmoke > 50 ? 'Medium' : 'Low'}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2.5">
                                  <div 
                                    className={`h-2.5 rounded-full ${
                                      selectedSession.maxTemp > 60 || selectedSession.maxSmoke > 100 ? 'bg-red-500' : 
                                      selectedSession.maxTemp > 40 || selectedSession.maxSmoke > 50 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(
                                      (selectedSession.maxTemp / 100 * 50) + (selectedSession.maxSmoke / 200 * 50), 
                                      100
                                    )}%` }}
                                  ></div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-0 shadow-md">
                            <CardHeader>
                              <CardTitle className="text-lg">Session Insights</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {sessionStats && (
                                <div className="space-y-3 text-sm">
                                  <div className="flex justify-between py-2 border-b border-slate-100">
                                    <span className="text-slate-600">Total Readings Analyzed:</span>
                                    <span className="font-semibold">{sessionStats.totalReadings}</span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-slate-100">
                                    <span className="text-slate-600">Normal Conditions:</span>
                                    <span className="font-semibold text-green-600">
                                      {sessionStats.normalReadings} ({sessionStats.normalPercentage}%)
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-slate-100">
                                    <span className="text-slate-600">Warning Conditions:</span>
                                    <span className="font-semibold text-amber-600">
                                      {sessionStats.warningReadings} ({sessionStats.warningPercentage}%)
                                    </span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-slate-100">
                                    <span className="text-slate-600">Fire Detections:</span>
                                    <span className="font-semibold text-red-600">
                                      {sessionStats.fireReadings} ({sessionStats.firePercentage}%)
                                    </span>
                                  </div>
                                  {selectedSession.mlPredictions && (
                                    <div className="flex justify-between py-2 border-b border-slate-100">
                                      <span className="text-slate-600">AI Predictions:</span>
                                      <span className="font-semibold text-purple-600">
                                        {selectedSession.mlPredictions.length}
                                      </span>
                                    </div>
                                  )}
                                  {sessionStats.peakFireTime && (
                                    <div className="flex justify-between py-2">
                                      <span className="text-slate-600">Peak Fire Activity:</span>
                                      <span className="font-semibold">{sessionStats.peakFireTime}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </TabsContent>

                      {/* Data Export Tab */}
                      <TabsContent value="export" className="space-y-6">
                        <Card className="border-0 shadow-md">
                          <CardHeader>
                            <CardTitle className="text-lg">CSV Data Export</CardTitle>
                            <p className="text-sm text-slate-600">
                              Export sensor data in CSV format with all 7 required columns for your dataset.
                            </p>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div className="flex gap-3">
                                <Button 
                                  onClick={exportSessionData}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Export This Session (CSV)
                                </Button>
                                <Button 
                                  onClick={exportAllSessions}
                                  variant="outline"
                                  className="border-blue-600 text-blue-600 hover:bg-blue-50"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Export All Sessions
                                </Button>
                              </div>

                              {/* CSV Preview */}
                              {csvPreview && (
                                <div>
                                  <h4 className="font-semibold text-slate-800 mb-3">Data Preview (First 5 rows):</h4>
                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                          {Object.keys(csvPreview[0]).map((header) => (
                                            <th key={header} className="text-left p-3 font-semibold text-slate-700">
                                              {header}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {csvPreview.map((row, index) => (
                                          <tr key={index} className="border-b border-slate-100 last:border-b-0">
                                            {Object.values(row).map((value: any, cellIndex) => (
                                              <td key={cellIndex} className="p-3 text-slate-600">
                                                {value}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-2">
                                    The exported CSV will include all {selectedSession.readings.length} readings with the 7 required columns.
                                  </p>
                                </div>
                              )}

                              {/* Column Information */}
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-semibold text-blue-800 mb-2">Exported Columns:</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">temperature</span>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">humidity</span>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">smoke</span>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">temp_max</span>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">temp_min</span>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">wind_speed</span>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                                    <span className="text-blue-700">wind_gust</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl p-8 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-slate-100 rounded-2xl">
                      <AlertTriangle className="w-12 h-12 text-slate-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 mb-2">Select a Session</h2>
                      <p className="text-slate-600">
                        Choose a fire alert session from the list to view detailed analytics and export data.
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-white border-0 shadow-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-800">Delete Session?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600">
                This action cannot be undone. This will permanently delete the fire alert session
                and all its associated sensor data from the system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={cancelDelete}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete} 
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Delete Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default Reports;
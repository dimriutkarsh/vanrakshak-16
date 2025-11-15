// src/components/SensorSelector.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor, Flame, RefreshCw, Cpu } from 'lucide-react';
import { SensorData } from '@/types/sensor';

interface SensorSelectorProps {
  availableSensors: SensorData[];
  selectedSensorId: string;
  onSensorSelect: (deviceId: string) => void;
  isLoadingSensors: boolean;
  isMonitoringFire: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const SensorSelector: React.FC<SensorSelectorProps> = ({
  availableSensors,
  selectedSensorId,
  onSensorSelect,
  isLoadingSensors,
  isMonitoringFire,
  onRefresh,
  isRefreshing
}) => {
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg rounded-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-gray-900 flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Monitor className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            Select Sensor for Monitoring
            <p className="text-sm font-normal text-gray-600 mt-1">
              Choose a sensor to view real-time environmental data
            </p>
          </div>
          {isMonitoringFire && (
            <span className="flex items-center gap-2 text-sm text-red-600 bg-red-100 px-3 py-1 rounded-full ml-auto">
              <Flame className="w-4 h-4" />
              Fire Alert Mode Active
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="ml-auto"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Select value={selectedSensorId} onValueChange={onSensorSelect}>
            <SelectTrigger className="w-full sm:w-80 bg-white border-gray-300 rounded-xl h-12">
              <SelectValue placeholder="Choose a sensor to monitor" />
            </SelectTrigger>
            <SelectContent>
              {isLoadingSensors ? (
                <SelectItem value="loading" disabled>
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                    Loading sensors...
                  </div>
                </SelectItem>
              ) : availableSensors.length > 0 ? (
                availableSensors.map(sensor => (
                  <SelectItem key={sensor.deviceId} value={sensor.deviceId}>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-gray-400" />
                      {sensor.name || `Sensor ${sensor.deviceId}`}
                      {sensor.isFire && (
                        <Flame className="w-3 h-3 text-red-500 ml-auto" />
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-sensors" disabled>
                  No sensors available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};

export default SensorSelector;
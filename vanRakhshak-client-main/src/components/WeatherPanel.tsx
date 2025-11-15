// src/components/WeatherPanel.tsx
import React from 'react';
import { Wind, Thermometer, Droplets, Gauge } from 'lucide-react';

interface WeatherPanelProps {
  weatherData: any;
}

const WeatherPanel: React.FC<WeatherPanelProps> = ({ weatherData }) => {
  const getWindDirection = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  if (!weatherData) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-xl border border-blue-200">
        <div className="flex items-center gap-3 mb-4">
          <Wind className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="font-semibold text-gray-900">Weather Data</h3>
            <p className="text-sm text-gray-600">Loading current conditions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-xl border border-blue-200">
      <div className="flex items-center gap-3 mb-6">
        <Wind className="w-6 h-6 text-blue-600" />
        <div>
          <h3 className="font-semibold text-gray-900">Live Weather Conditions</h3>
          <p className="text-sm text-gray-600 capitalize">{weatherData.description}</p>
        </div>
        {weatherData.icon && (
          <img 
            src={`https://openweathermap.org/img/wn/${weatherData.icon}.png`} 
            alt={weatherData.description}
            className="w-10 h-10 ml-auto"
          />
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <WeatherMetric
          icon={Thermometer}
          label="Temperature"
          value={`${weatherData.temp}°C`}
          subValue={`Feels like ${weatherData.feels_like}°C`}
        />
        <WeatherMetric
          icon={Wind}
          label="Wind"
          value={`${weatherData.wind_speed} m/s`}
          subValue={getWindDirection(weatherData.wind_deg)}
        />
        <WeatherMetric
          icon={Droplets}
          label="Humidity"
          value={`${weatherData.humidity}%`}
        />
        <WeatherMetric
          icon={Gauge}
          label="Pressure"
          value={`${weatherData.pressure} hPa`}
          subValue={`Visibility ${weatherData.visibility / 1000}km`}
        />
      </div>
    </div>
  );
};

const WeatherMetric: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
}> = ({ icon: Icon, label, value, subValue }) => (
  <div className="text-center p-3 bg-white/50 rounded-lg border border-blue-100">
    <Icon className="w-5 h-5 text-blue-600 mx-auto mb-2" />
    <p className="text-sm text-gray-600">{label}</p>
    <p className="text-lg font-bold text-blue-700">{value}</p>
    {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
  </div>
);

export default WeatherPanel;
// src/components/StatusIndicator.tsx
import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StatusIndicatorProps {
  reading: {
    isFire: boolean;
    temp: number;
    smoke: number;
  };
  size?: 'sm' | 'lg';
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ reading, size = 'md' }) => {
  const getStatusConfig = () => {
    if (reading.isFire) {
      return {
        text: 'FIRE DETECTED',
        color: 'text-red-600 bg-red-100',
        icon: AlertTriangle,
        pulse: true
      };
    }
    if (reading.temp > 35 || reading.smoke > 50) {
      return {
        text: 'WARNING',
        color: 'text-yellow-600 bg-yellow-100',
        icon: AlertTriangle,
        pulse: false
      };
    }
    return {
      text: 'NORMAL',
      color: 'text-green-600 bg-green-100',
      icon: CheckCircle,
      pulse: false
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Badge 
      variant="secondary" 
      className={`${config.color} ${config.pulse ? 'animate-pulse' : ''} ${
        size === 'lg' ? 'px-4 py-2 text-base' : 'px-3 py-1 text-sm'
      }`}
    >
      <Icon className={`${size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} mr-1`} />
      {config.text}
    </Badge>
  );
};

export default StatusIndicator;
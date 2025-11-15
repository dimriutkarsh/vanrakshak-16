// src/components/SessionTracker.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame, Clock } from 'lucide-react';

interface SessionTrackerProps {
  activeSessions: any[];
  currentSession: any;
  sensorReadings: any[];
  completedSessions: any[];
}

const SessionTracker: React.FC<SessionTrackerProps> = ({
  activeSessions,
  currentSession,
  sensorReadings,
  completedSessions
}) => {
  const formatDuration = (startTime: string, endTime: string | null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const seconds = ((diffMs % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  if (activeSessions.length === 0) return null;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg rounded-2xl border-l-4 border-l-red-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-red-700">
          <div className="bg-red-100 p-2 rounded-lg">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            Active Fire Alert Sessions
            <p className="text-sm font-normal text-red-600 mt-1">
              {activeSessions.length} ongoing fire detection{activeSessions.length > 1 ? 's' : ''}
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activeSessions.map(session => (
            <div key={session.id} className="p-4 border border-red-200 rounded-xl bg-red-50/50 backdrop-blur-sm">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Device: {session.deviceId}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Started: {new Date(session.startTime).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Badge variant="destructive" className="animate-pulse">
                    🔥 ACTIVE FIRE SESSION
                  </Badge>
                  <Badge variant="outline">
                    <Clock className="w-3 h-3 mr-1" />
                    Duration: {formatDuration(session.startTime, session.endTime)}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <SessionMetric label="Max Temp" value={`${session.maxTemp.toFixed(1)}°C`} />
                <SessionMetric label="Max Smoke" value={`${session.maxSmoke} ppm`} />
                <SessionMetric label="Avg Temp" value={`${session.avgTemp.toFixed(1)}°C`} />
                <SessionMetric label="Readings" value={`${session.readings.length} records`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const SessionMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white p-3 rounded-lg border text-center">
    <span className="text-gray-600 text-sm">{label}</span>
    <p className="font-semibold text-gray-900 mt-1">{value}</p>
  </div>
);

export default SessionTracker;
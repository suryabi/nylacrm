import React from 'react';
import { format } from 'date-fns';
import { Card } from '../ui/card';
import {
  Loader2, Clock, Sun, Cloud, CloudRain, CloudSnow, CloudLightning,
  Wind, Droplets, MapPin
} from 'lucide-react';

// Weather code to icon mapping
const getWeatherIcon = (code) => {
  if (code === 0) return <Sun className="h-8 w-8 text-yellow-500" />;
  if (code >= 1 && code <= 3) return <Cloud className="h-8 w-8 text-gray-400" />;
  if (code >= 45 && code <= 48) return <Cloud className="h-8 w-8 text-gray-500" />;
  if (code >= 51 && code <= 67) return <CloudRain className="h-8 w-8 text-blue-400" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="h-8 w-8 text-blue-200" />;
  if (code >= 80 && code <= 82) return <CloudRain className="h-8 w-8 text-blue-500" />;
  if (code >= 85 && code <= 86) return <CloudSnow className="h-8 w-8 text-blue-300" />;
  if (code >= 95 && code <= 99) return <CloudLightning className="h-8 w-8 text-purple-500" />;
  return <Sun className="h-8 w-8 text-yellow-500" />;
};

const getWeatherDescription = (code) => {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 56 && code <= 57) return 'Freezing drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing rain';
  if (code >= 71 && code <= 75) return 'Snowfall';
  if (code === 77) return 'Snow grains';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code >= 96 && code <= 99) return 'Thunderstorm with hail';
  return 'Unknown';
};

// Format session time (seconds to HH:MM:SS)
const formatSessionTime = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function WeatherTimeWidget({ weather, weatherLoading, locationName, currentTime, activeTime }) {
  return (
    <Card className="p-4 bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-900/30 dark:to-indigo-900/20 border-sky-200 dark:border-sky-700/50 min-w-[280px]">
      <div className="flex items-center gap-4">
        {/* Weather */}
        <div className="flex items-center gap-3">
          {weatherLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          ) : weather ? (
            <>
              {getWeatherIcon(weather.weather_code)}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-sky-700 dark:text-sky-300">
                    {Math.round(weather.temperature_2m)}°C
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{getWeatherDescription(weather.weather_code)}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <MapPin className="h-3 w-3" />
                  <span>{locationName}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Weather unavailable</div>
          )}
        </div>
        
        {/* Divider */}
        <div className="w-px h-12 bg-border" />
        
        {/* Digital Clock */}
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-indigo-700 dark:text-indigo-300 tracking-wider">
            {format(currentTime, 'HH:mm')}
            <span className="text-lg text-indigo-400 dark:text-indigo-500">{format(currentTime, ':ss')}</span>
          </div>
          <p className="text-xs text-muted-foreground">{format(currentTime, 'a')}</p>
        </div>
      </div>
      
      {/* Weather details */}
      {weather && !weatherLoading && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-sky-200/50 dark:border-sky-700/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Droplets className="h-3 w-3" />
            <span>{weather.relative_humidity_2m}% humidity</span>
          </div>
          <div className="flex items-center gap-1">
            <Wind className="h-3 w-3" />
            <span>{Math.round(weather.wind_speed_10m)} km/h</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            <span>Session: {formatSessionTime(activeTime)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

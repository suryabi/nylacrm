import React from 'react';
import { format } from 'date-fns';
import { Card } from '../ui/card';
import {
  Loader2, Clock, Sun, Cloud, CloudRain, CloudSnow, CloudLightning,
  Wind, Droplets, MapPin, Timer
} from 'lucide-react';

// Weather code to icon mapping
const getWeatherIcon = (code) => {
  if (code === 0) return <Sun className="h-7 w-7 text-amber-500" />;
  if (code >= 1 && code <= 3) return <Cloud className="h-7 w-7 text-slate-400" />;
  if (code >= 45 && code <= 48) return <Cloud className="h-7 w-7 text-slate-500" />;
  if (code >= 51 && code <= 67) return <CloudRain className="h-7 w-7 text-blue-400" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="h-7 w-7 text-blue-200" />;
  if (code >= 80 && code <= 82) return <CloudRain className="h-7 w-7 text-blue-500" />;
  if (code >= 85 && code <= 86) return <CloudSnow className="h-7 w-7 text-blue-300" />;
  if (code >= 95 && code <= 99) return <CloudLightning className="h-7 w-7 text-purple-500" />;
  return <Sun className="h-7 w-7 text-amber-500" />;
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
    <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 w-full lg:w-auto">
      {/* Mobile Layout */}
      <div className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
        {/* Digital Clock - Primary */}
        <div className="text-center sm:text-right sm:pr-6 sm:border-r border-slate-200 dark:border-slate-700 w-full sm:w-auto">
          <div className="flex items-baseline justify-center sm:justify-end gap-1">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800 dark:text-white font-mono">
              {format(currentTime, 'HH:mm')}
            </span>
            <span className="text-lg sm:text-xl text-slate-400 dark:text-slate-500 font-mono">
              {format(currentTime, ':ss')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">
            {format(currentTime, 'a')}
          </p>
        </div>
        
        {/* Weather & Location Row - Horizontal on mobile */}
        <div className="flex items-center justify-center sm:justify-start gap-4 sm:gap-3 w-full sm:w-auto">
          {/* Weather */}
          <div className="flex items-center gap-2 sm:gap-3">
            {weatherLoading ? (
              <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin text-primary" />
            ) : weather ? (
              <>
                <div className="p-1.5 sm:p-2 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/20">
                  {getWeatherIcon(weather.weather_code)}
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                      {Math.round(weather.temperature_2m)}°
                    </span>
                    <span className="text-xs sm:text-sm text-muted-foreground">C</span>
                  </div>
                  <p className="text-xs text-muted-foreground hidden sm:block">{getWeatherDescription(weather.weather_code)}</p>
                </div>
              </>
            ) : (
              <div className="text-xs sm:text-sm text-muted-foreground">Weather unavailable</div>
            )}
          </div>
          
          {/* Location & Session - Compact on mobile */}
          <div className="sm:pl-6 sm:border-l border-slate-200 dark:border-slate-700 space-y-0.5 sm:space-y-1.5">
            {locationName && (
              <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[80px] sm:max-w-none">{locationName}</span>
              </div>
            )}
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs">
              <Timer className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium font-mono">
                {formatSessionTime(activeTime)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

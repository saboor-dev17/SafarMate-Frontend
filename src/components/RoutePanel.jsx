import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownUp, Plus, X, Car, Bike, PersonStanding, Navigation, Loader2,
  Ban, Play, CloudSun, ShieldAlert,
} from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { apiComputeRoute } from '@/api/route';
import { apiWeatherAlongRoute } from '@/api/weather';
import { apiSafetyAlongRoute } from '@/api/safety';
import LocationPickerInput from './LocationPickerInput.jsx';
import toast from 'react-hot-toast';

export default function RoutePanel() {
  const {
    origin, destination, waypoints, transportMode, avoidFeatures,
    setOrigin, setDestination, addWaypoint, setWaypointAt, removeWaypoint,
    setTransportMode, setRoutes, routes, activeRouteIdx, clearRoute,
    toggleAvoid,
    isNavigating, startNavigation,
    weather, weatherLoading, setWeather, setWeatherLoading,
    safety, safetyLoading, setSafety, setSafetyLoading,
  } = useMapStore();

  const [loading, setLoading] = useState(false);

  const compute = async () => {
    if (!origin || !destination) return toast.error('Set origin and destination');
    if (waypoints.some((w) => !w || typeof w.lat !== 'number'))
      return toast.error('Pick a location for every stop');

    setLoading(true);
    try {
      const allPoints = [origin, ...waypoints, destination];
      const coords = allPoints.map((p) => [p.lng, p.lat]);
      const { data } = await apiComputeRoute({
        coordinates: coords,
        mode: transportMode,
        alternatives: true,
        avoidFeatures,
      });
      const r = data.data || [];
      setRoutes(r);
      if (r.length === 0) toast.error('No route found between these points');
    } catch (e) {
      console.error(e);
      const msg =
        e.response?.data?.message ||
        e.response?.data?.upstream?.error?.message ||
        'Failed to compute route';
      toast.error(msg, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckWeather = async () => {
    const route = routes[activeRouteIdx];
    if (!route?.geometry?.coordinates?.length) return toast.error('Compute a route first');
    setWeatherLoading(true);
    const tid = toast.loading('Checking weather along your route…');
    try {
      const { data } = await apiWeatherAlongRoute({
        coordinates: route.geometry.coordinates,
        totalDistance: route.distance,
        totalDuration: route.duration,
        departAt: new Date().toISOString(),
      });
      setWeather(data.data);
      toast.dismiss(tid);
      const s = data.data?.summary;
      if (s?.willRain)                    toast.success(`Rain expected — ${s.rainSampleCount} location(s)`, { icon: '🌧️' });
      else if (s?.overallRisk === 'severe') toast.error('Hazardous weather along route', { icon: '⛈️' });
      else                                 toast.success('Weather looks good — clear skies', { icon: '☀️' });
    } catch (err) {
      toast.dismiss(tid);
      toast.error(err.response?.data?.message || 'Failed to check weather');
    } finally {
      setWeatherLoading(false);
    }
  };

  const handleCheckSafety = async () => {
    const route = routes[activeRouteIdx];
    if (!route?.geometry?.coordinates?.length) return toast.error('Compute a route first');
    setSafetyLoading(true);
    const tid = toast.loading('Scoring road safety along your route…');
    try {
      const { data } = await apiSafetyAlongRoute({ coordinates: route.geometry.coordinates });
      setSafety(data.data);
      toast.dismiss(tid);
      const s = data.data?.summary;
      if (s?.worstBand === 'dangerous' || s?.worstBand === 'risky')
        toast.error(`${s.riskySegmentCount} risky segment(s) on this route`, { icon: '⚠️' });
      else if (s?.segmentCount)
        toast.success(`Average safety score ${s.averageScore}/100`, { icon: '🛡️' });
      else
        toast('No scored segments found near this route yet', { icon: 'ℹ️' });
    } catch (err) {
      toast.dismiss(tid);
      toast.error(err.response?.data?.message || 'Failed to check safety score');
    } finally {
      setSafetyLoading(false);
    }
  };

  const handleStart = () => {
    if (!routes[activeRouteIdx]) return toast.error('Compute a route first');
    startNavigation();
    toast.success('🚗 Navigation started — drive safely!');
  };

  const swap = () => {
    if (!origin && !destination) return;
    setOrigin(destination);
    setDestination(origin);
  };

  const modes = [
    { v: 'driving',    icon: Car,            label: 'Car' },
    { v: 'motorcycle', icon: Bike,           label: 'Bike' },
    { v: 'walking',    icon: PersonStanding, label: 'Walk' },
  ];

  const avoidOpts = [
    { v: 'highways', label: 'Highways' },
    { v: 'tollways', label: 'Tolls' },
    { v: 'ferries',  label: 'Ferries' },
  ];

  const activeRoute = routes[activeRouteIdx];

  if (isNavigating) return null;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-strong rounded-2xl p-4 w-full"
    >
      {/* Travel mode selector */}
      <div className="flex items-center gap-2 mb-3">
        {modes.map(({ v, icon: Icon, label }) => (
          <button
            key={v}
            onClick={() => setTransportMode(v)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition ${
              transportMode === v
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'
            }`}
          >
            <Icon size={14} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Location inputs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <LocationPickerInput
              value={origin}
              onChange={setOrigin}
              placeholder="Choose starting point"
              dotColor="bg-emerald-500"
              showMyLocation
            />
          </div>
          <button onClick={swap} className="btn-icon shrink-0" title="Swap">
            <ArrowDownUp size={16} />
          </button>
        </div>

        {waypoints.map((wp, i) => (
          <div key={i} className="flex items-center gap-2 pl-5 relative">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <LocationPickerInput
                value={wp}
                onChange={(v) => setWaypointAt(i, v)}
                placeholder={`Stop ${i + 1}`}
                dotColor="bg-amber-500"
              />
            </div>
            <button onClick={() => removeWaypoint(i)} className="btn-icon shrink-0" title="Remove stop">
              <X size={14} />
            </button>
          </div>
        ))}

        <LocationPickerInput
          value={destination}
          onChange={setDestination}
          placeholder="Choose destination"
          dotColor="bg-rose-500"
        />
      </div>

      {/* Add stop */}
      <div className="flex items-center justify-end mt-3">
        <button
          onClick={() => addWaypoint(null)}
          className="text-xs text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:underline flex items-center gap-1"
        >
          <Plus size={12} />
          Add stop
        </button>
      </div>

      {/* Avoid options */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <Ban size={11} /> Avoid:
        </span>
        {avoidOpts.map(({ v, label }) => {
          const on = avoidFeatures.includes(v);
          return (
            <button
              key={v}
              onClick={() => toggleAvoid(v)}
              className={`text-[11px] px-2 py-1 rounded-full border transition ${
                on
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                  : 'border-slate-300 dark:border-white/10 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Get Route + Clear */}
      <div className="flex gap-2 mt-3">
        <button onClick={compute} className="btn-primary flex-1" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Navigation size={16} className="shrink-0" />}
          <span>{loading ? 'Routing…' : 'Get Route'}</span>
        </button>
        <button onClick={clearRoute} className="btn-ghost shrink-0">Clear</button>
      </div>

      {/* Action buttons — shown once a route is computed */}
      {activeRoute && (
        <div className="mt-3 space-y-2">

          {/* Row 1: Weather + Start */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCheckWeather}
              disabled={weatherLoading}
              className="py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/30 transition active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed text-sm"
            >
              {weatherLoading
                ? <Loader2 size={16} className="animate-spin shrink-0" />
                : <CloudSun size={16} className="shrink-0" />
              }
              <span className="truncate">{weather ? 'Refresh' : 'Weather'}</span>
            </button>

            <button
              onClick={handleStart}
              className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/30 transition active:scale-[.98] text-sm"
            >
              <Play size={16} fill="currentColor" className="shrink-0" />
              <span>Start</span>
            </button>
          </div>

          {/* Row 2: Safety Score — full width */}
          <button
            onClick={handleCheckSafety}
            disabled={safetyLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/30 transition active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          >
            {safetyLoading
              ? <Loader2 size={16} className="animate-spin shrink-0" />
              : <ShieldAlert size={16} className="shrink-0" />
            }
            <span>{safety ? 'Refresh Safety Score' : 'Check Safety Score'}</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
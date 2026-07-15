import { useState } from 'react';
import {
  HeartPulse, Fuel, Utensils, Shield, Car, Zap, Pill, Banknote, Loader2, X,
} from 'lucide-react';
import { apiGetNearby } from '@/api/nearby';
import { useMapStore } from '@/store/mapStore';
import toast from 'react-hot-toast';

const cats = [
  { key: 'hospital',    icon: HeartPulse, label: 'Hospital' },
  { key: 'fuel',        icon: Fuel,       label: 'Fuel'     },
  { key: 'restaurant',  icon: Utensils,   label: 'Food'     },
  { key: 'police',      icon: Shield,     label: 'Police'   },
  { key: 'parking',     icon: Car,        label: 'Parking'  },
  { key: 'ev_charging', icon: Zap,        label: 'EV'       },
  { key: 'pharmacy',    icon: Pill,       label: 'Pharmacy' },
  { key: 'atm',         icon: Banknote,   label: 'ATM'      },
];

/**
 * NearbyPlacesPanel
 *
 * Props:
 *   compact {boolean}  — compact navigation mode: smaller padding, no header text
 */
export default function NearbyPlacesPanel({ compact = false }) {
  const {
    userLocation, setNearby, nearbyCategory, nearbyPlaces, clearNearby,
  } = useMapStore();

  const [loading, setLoading] = useState(null);

  const fetchCat = async (key) => {
    if (!userLocation)
      return toast.error('Waiting for your location… (allow GPS)');

    // If clicking the active category, clear it
    if (nearbyCategory === key) {
      clearNearby();
      return;
    }

    setLoading(key);
    const tid = toast.loading(`Searching ${cats.find(c => c.key === key)?.label || key} near you…`);
    try {
      const { data } = await apiGetNearby({
        lat: userLocation.lat,
        lng: userLocation.lng,
        category: key,
        radius: 5000,
      });
      const places = data.data || [];
      setNearby(key, places);
      toast.dismiss(tid);
      if (places.length === 0)
        toast(`No ${key.replace('_', ' ')} found within 5 km`, { icon: 'ℹ️' });
      else
        toast.success(`Found ${places.length} ${cats.find(c => c.key === key)?.label || key}`);
    } catch (err) {
      toast.dismiss(tid);
      console.error('Nearby error:', err);
      toast.error(err.response?.data?.message || `Could not fetch ${key.replace('_', ' ')}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`glass-strong rounded-2xl ${compact ? 'p-2' : 'p-3'}`}>
      {/* Header — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nearby
          </p>
          {nearbyPlaces.length > 0 && (
            <button
              onClick={clearNearby}
              className="text-[11px] text-rose-500 hover:underline flex items-center gap-1"
            >
              <X size={11} /> Clear ({nearbyPlaces.length})
            </button>
          )}
        </div>
      )}

      {/* Compact header */}
      {compact && (
        <div className="flex items-center justify-between px-1 pb-1.5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
            📍 Nearby
          </p>
          {nearbyPlaces.length > 0 && (
            <button
              onClick={clearNearby}
              className="text-[10px] text-rose-500 hover:underline flex items-center gap-0.5"
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Category grid */}
      <div className={`grid grid-cols-4 ${compact ? 'gap-1' : 'gap-2'}`}>
        {cats.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => fetchCat(key)}
            disabled={loading !== null}
            className={`flex flex-col items-center gap-1 rounded-xl transition disabled:opacity-50 ${
              compact ? 'p-1.5 text-[10px]' : 'p-2 text-xs'
            } ${
              nearbyCategory === key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'
            }`}
          >
            {loading === key ? (
              <Loader2 size={compact ? 14 : 18} className="animate-spin" />
            ) : (
              <Icon size={compact ? 14 : 18} />
            )}
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
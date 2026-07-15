import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Camera, RotateCcw, Siren, Loader2,
  CheckCircle2, AlertTriangle, ShieldX, FolderOpen,
} from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { apiTriggerSOS } from '@/api/sos';
import toast from 'react-hot-toast';

const STEP = {
  CAMERA:    'camera',
  PREVIEW:   'preview',
  CONFIRM:   'confirm',
  SUBMITTING:'submitting',
  DONE:      'done',
  BLOCKED:   'blocked',
  ERROR:     'error',
};
const COUNTDOWN_S = 3;

const SEV_COLOR = {
  minor:'text-emerald-600',moderate:'text-amber-500',
  severe:'text-orange-500',critical:'text-rose-600',unavailable:'text-slate-400',
};
const SEV_BG = {
  minor:'bg-emerald-600',moderate:'bg-amber-500',
  severe:'bg-orange-500',critical:'bg-rose-600',unavailable:'bg-slate-400',
};
const VRD_COLOR = {
  likely_genuine:'text-emerald-600',uncertain:'text-amber-500',
  likely_spoofed:'text-rose-600',unavailable:'text-slate-400',
};

const Badge = ({ color, children }) => (
  <span className={`${color} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
    {children}
  </span>
);

const Bar = ({ value, color }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{width:`${Math.round((value??0)*100)}%`}} />
    </div>
    <span className="text-xs w-8 text-right font-semibold text-slate-600 dark:text-slate-300">
      {value!=null?`${Math.round(value*100)}%`:'N/A'}
    </span>
  </div>
);

export default function SOSModal({ open, onClose }) {
  const userLocation = useMapStore((s) => s.userLocation);

  const [step,       setStep]       = useState(STEP.CAMERA);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [result,     setResult]     = useState(null);
  const [countdown,  setCountdown]  = useState(COUNTDOWN_S);

  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const streamRef     = useRef(null);
  const blobRef       = useRef(null);
  const timerRef      = useRef(null);
  const fileInputRef  = useRef(null);
  // ★ KEY FIX: this ref prevents React StrictMode double-invocation of submit()
  const isSubmittingRef = useRef(false);

  // ── camera ──────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        { video: { facingMode: { ideal: 'environment' } }, audio: false }
      );
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      toast.error('Camera permission required — please allow and try again.');
      onClose();
    }
  }, [onClose]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (open) { setStep(STEP.CAMERA); startCamera(); }
    else stopCamera();
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  useEffect(() => {
    if (step === STEP.CAMERA && videoRef.current && streamRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [step]);

  // ── capture ──────────────────────────────────────────────────────────────────
  const capture = () => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url); stopCamera(); setStep(STEP.PREVIEW);
    }, 'image/jpeg', 0.88);
  };

  // ── gallery upload ────────────────────────────────────────────────────────────
  const handleGalleryUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    blobRef.current = file;
    const url = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(url); stopCamera(); setStep(STEP.PREVIEW);
  };

  const retake = async () => {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    blobRef.current = null; setResult(null);
    isSubmittingRef.current = false;
    setStep(STEP.CAMERA); await startCamera();
  };

  // ── countdown ─────────────────────────────────────────────────────────────────
  // Uses recursive setTimeout (NOT setInterval + setState updater) to avoid
  // React 18 StrictMode calling submit() twice due to double-invocation of
  // state updater functions.
  const startCountdown = () => {
    isSubmittingRef.current = false;
    setCountdown(COUNTDOWN_S);
    setStep(STEP.CONFIRM);
    let c = COUNTDOWN_S;
    const tick = () => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        submit();           // called directly from timeout — NOT from a state setter
      } else {
        timerRef.current = setTimeout(tick, 1000);
      }
    };
    timerRef.current = setTimeout(tick, 1000);
  };

  const cancelCountdown = () => {
    clearTimeout(timerRef.current);
    isSubmittingRef.current = false;
    setStep(STEP.PREVIEW);
  };

  // ── submit ────────────────────────────────────────────────────────────────────
  const submit = async () => {
    // ★ Guard: if already submitting (StrictMode double-call or user rapid-tap), bail out
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (!blobRef.current) { isSubmittingRef.current = false; return; }
    if (!userLocation) {
      toast.error('Still waiting for GPS — try again.');
      isSubmittingRef.current = false;
      setStep(STEP.PREVIEW); return;
    }
    setStep(STEP.SUBMITTING);

    const fd = new FormData();
    fd.append('image',  blobRef.current, 'sos.jpg');
    fd.append('lat',    userLocation.lat);
    fd.append('lng',    userLocation.lng);
    fd.append('reason', 'road_accident');

    try {
      const { data } = await apiTriggerSOS(fd);
      setResult(data.data);
      setStep(data.data?.emailBlocked ? STEP.BLOCKED : STEP.DONE);
    } catch (err) {
      // 429 from dedup guard means a duplicate was caught on the backend
      const msg = err?.response?.data?.message || 'Failed to send SOS. Check your connection.';
      if (err?.response?.status === 429) {
        toast.error('Alert already sent — please wait a moment.');
        setStep(STEP.DONE);
      } else {
        setErrorMsg(msg);
        setStep(STEP.ERROR);
      }
      isSubmittingRef.current = false;
    }
  };

  // ── cleanup ───────────────────────────────────────────────────────────────────
  const handleClose = () => {
    clearTimeout(timerRef.current);
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); blobRef.current = null;
    setResult(null); setErrorMsg('');
    isSubmittingRef.current = false;
    setStep(STEP.CAMERA); onClose();
  };

  const cv = result?.cvAssessment;

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
          <motion.div key="card"
            initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
            transition={{type:'spring',stiffness:300,damping:28}}
            className="relative w-full max-w-[340px] rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-2xl max-h-[90dvh] overflow-y-auto">

            {/* Close button */}
            {step !== STEP.SUBMITTING && (
              <button onClick={handleClose}
                className="absolute top-3 right-3 z-10 h-7 w-7 grid place-items-center rounded-full bg-black/40 hover:bg-black/60 text-white"
                aria-label="Close">
                <X size={14} />
              </button>
            )}

            {/* ── CAMERA ── */}
            {step === STEP.CAMERA && (
              <div className="flex flex-col">
                <div className="relative bg-black">
                  <p className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-white text-xs font-medium px-2 py-1 bg-black/50 rounded-full whitespace-nowrap">
                    Point at the emergency scene
                  </p>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[3/4] object-cover" />
                </div>
                <div className="p-4 space-y-2">
                  <button onClick={capture}
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30">
                    <Camera size={20} /> Capture Photo
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                    <span className="text-[10px] text-slate-400">or (for testing)</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                  </div>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold flex items-center justify-center gap-2 text-sm">
                    <FolderOpen size={16} /> Choose from Gallery
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*"
                    className="hidden" onChange={handleGalleryUpload} />
                </div>
              </div>
            )}

            {/* ── PREVIEW ── */}
            {step === STEP.PREVIEW && (
              <div className="flex flex-col">
                <div className="relative bg-black">
                  <img src={previewUrl} alt="SOS capture" className="w-full aspect-[3/4] object-cover" />
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                    CV will analyse this photo before sending
                  </p>
                  <div className="flex gap-2">
                    <button onClick={retake}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 font-semibold flex items-center justify-center gap-1.5 text-sm">
                      <RotateCcw size={14} /> Retake
                    </button>
                    <button onClick={startCountdown}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-1.5 text-sm shadow-lg shadow-rose-500/30">
                      <Siren size={14} /> Send SOS
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── CONFIRM ── */}
            {step === STEP.CONFIRM && (
              <div className="p-8 flex flex-col items-center gap-5 text-center">
                <motion.div key={countdown}
                  initial={{scale:1.4,opacity:0}} animate={{scale:1,opacity:1}}
                  className="h-20 w-20 rounded-full bg-rose-100 dark:bg-rose-900/40 ring-4 ring-rose-500/30 grid place-items-center">
                  <span className="text-rose-600 dark:text-rose-400 text-3xl font-black">{countdown}</span>
                </motion.div>
                <div>
                  <p className="font-bold text-lg">Sending SOS…</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">CV will verify the photo.</p>
                </div>
                <button onClick={cancelCountdown}
                  className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 font-semibold text-sm">
                  Cancel
                </button>
              </div>
            )}

            {/* ── SUBMITTING ── */}
            {step === STEP.SUBMITTING && (
              <div className="p-10 flex flex-col items-center gap-3 text-center">
                <Loader2 size={40} className="animate-spin text-rose-500" />
                <p className="font-semibold">Analysing &amp; sending…</p>
                <p className="text-xs text-slate-400">Do not close the app</p>
              </div>
            )}

            {/* ── DONE ── */}
            {step === STEP.DONE && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-black text-base">Alert Sent</p>
                    <p className="text-xs text-slate-400">
                      {cv?.cvSource === 'cloud_vision' ? 'Google Cloud Vision' : 'OpenCV heuristic'}
                    </p>
                  </div>
                </div>

                {cv && (
                  <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3 space-y-3">

                    {/* Severity */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Severity</p>
                      <div className="flex items-center gap-2">
                        <Badge color={SEV_BG[cv.severityLabel] || 'bg-slate-400'}>
                          {(cv.severityLabel||'N/A').toUpperCase()}
                        </Badge>
                        <span className={`text-lg font-black ${SEV_COLOR[cv.severityLabel]||'text-slate-400'}`}>
                          {cv.severityScore!=null?`${cv.severityScore} / 5`:'N/A'}
                        </span>
                      </div>
                      {cv.violenceLikelihood && (
                        <p className="text-xs text-slate-500 mt-1">
                          Violence: <span className="font-semibold">{cv.violenceLikelihood}</span>
                          {cv.medicalLikelihood ? ` · Medical: ${cv.medicalLikelihood}` : ''}
                        </p>
                      )}
                      <div className="mt-2 space-y-1.5">
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">Blood indicator</p>
                          <Bar value={cv.bloodLikelihood} color="bg-rose-500" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">Damage indicator</p>
                          <Bar value={cv.damageLikelihood} color="bg-orange-500" />
                        </div>
                      </div>
                    </div>

                    {/* Authenticity */}
                    <div className="pt-2 border-t border-slate-200 dark:border-white/10">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Authenticity</p>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold capitalize ${VRD_COLOR[cv.authenticityVerdict]||'text-slate-400'}`}>
                          {(cv.authenticityVerdict||'N/A').replace(/_/g,' ')}
                        </span>
                        <span className="text-xs text-slate-500">
                          {cv.authenticityScore!=null?`${cv.authenticityScore}/100`:'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Labels (Cloud Vision only) */}
                    {cv.topLabels?.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Scene labels</p>
                        <div className="flex flex-wrap gap-1">
                          {cv.topLabels.map((l) => (
                            <span key={l} className="text-[10px] bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">{l}</span>
                          ))}
                        </div>
                        {cv.accidentKw?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {cv.accidentKw.map((k) => (
                              <span key={k} className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">{k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {result?.emailError && (
                  <p className="text-xs text-amber-500 text-center">Email issue — event was still recorded.</p>
                )}

                <button onClick={handleClose}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 font-semibold text-sm hover:bg-slate-200">
                  Close
                </button>
              </div>
            )}

            {/* ── BLOCKED ── */}
            {step === STEP.BLOCKED && (
              <div className="p-5 flex flex-col items-center gap-3 text-center">
                <ShieldX size={48} className="text-rose-500" />
                <div>
                  <p className="font-black text-xl text-rose-600 dark:text-rose-400">Image Not Verified</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    CV flagged this as a likely spoofed image. No alert was sent.
                  </p>
                </div>
                {cv && (
                  <div className="w-full rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-3 text-left space-y-1">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-400">CV Result — Rejected</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Verdict</span>
                      <span className="font-bold text-rose-600 capitalize">{(cv.authenticityVerdict||'').replace(/_/g,' ')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Score</span>
                      <span className="font-bold text-rose-600">{cv.authenticityScore!=null?`${cv.authenticityScore}/100`:'N/A'}</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 w-full">
                  <button onClick={handleClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 font-semibold text-sm">Cancel</button>
                  <button onClick={retake} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm">Retake</button>
                </div>
              </div>
            )}

            {/* ── ERROR ── */}
            {step === STEP.ERROR && (
              <div className="p-8 flex flex-col items-center gap-4 text-center">
                <AlertTriangle size={52} className="text-amber-500" />
                <div>
                  <p className="font-black text-xl">Could not send</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{errorMsg}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleClose} className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 font-semibold text-sm">Cancel</button>
                  <button onClick={submit} className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm">Retry</button>
                </div>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
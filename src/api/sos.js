import api from './axios';

/**
 * POST /api/sos/trigger
 *
 * formData must contain:
 *   image  — Blob (JPEG from canvas.toBlob)
 *   lat    — number (GPS latitude)
 *   lng    — number (GPS longitude)
 *   reason — string (default 'road_accident')
 *
 * Do NOT manually set Content-Type — axios auto-sets the correct
 * multipart/form-data boundary when it receives a FormData payload.
 * Setting it manually (a common mistake) breaks the upload.
 */
export const apiTriggerSOS = (formData) =>
  api.post('/sos/trigger', formData);
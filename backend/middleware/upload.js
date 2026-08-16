const multer = require('multer');

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Images are kept in memory only, never written to local disk: this backend
// runs locally per-install (one instance per teacher/student machine) while
// all installs share one central database. A disk-stored file would only
// ever be visible to whichever machine's backend received the upload —
// invisible to every other machine. Encoding to a base64 data URI and
// storing it directly in the DB row (same pattern already used for webcam
// proctoring snapshots) makes the image travel with the exam data itself.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Only PNG, JPEG, WEBP, or GIF images are allowed'));
    return;
  }
  cb(null, true);
};

const uploadQuestionImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = { uploadQuestionImage };

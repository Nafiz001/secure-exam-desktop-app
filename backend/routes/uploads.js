const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadQuestionImage: uploadMiddleware } = require('../middleware/upload');
const { uploadQuestionImage } = require('../controllers/uploadController');

router.post(
  '/question-image',
  protect,
  authorize('teacher'),
  (req, res, next) => {
    uploadMiddleware.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
      }
      next();
    });
  },
  uploadQuestionImage
);

module.exports = router;

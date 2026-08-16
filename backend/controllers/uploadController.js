/**
 * Handle a single question-option image upload (Teacher only).
 * Returns the image as a base64 data URI rather than a file path — see
 * middleware/upload.js for why (local-disk storage doesn't survive across
 * the multiple machines that share this app's central database).
 * POST /api/uploads/question-image
 */
const uploadQuestionImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image file provided'
    });
  }

  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

  res.status(201).json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: dataUri
    }
  });
};

module.exports = { uploadQuestionImage };

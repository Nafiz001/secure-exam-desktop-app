/**
 * Handle a single question-option image upload (Teacher only).
 * POST /api/uploads/question-image
 */
const uploadQuestionImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image file provided'
    });
  }

  res.status(201).json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: `/uploads/questions/${req.file.filename}`
    }
  });
};

module.exports = { uploadQuestionImage };

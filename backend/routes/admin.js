const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createTeacher,
  createStudent,
  uploadStudents,
  listUsers,
  toggleUserStatus,
  getStats
} = require('../controllers/adminController');

const adminOnly = [protect, authorize('admin')];

router.get('/stats',                  ...adminOnly, getStats);
router.get('/users',                  ...adminOnly, listUsers);
router.post('/create-teacher',        ...adminOnly, createTeacher);
router.post('/create-student',        ...adminOnly, createStudent);
router.post('/upload-students',       ...adminOnly, uploadStudents);
router.put('/users/:id/status',       ...adminOnly, toggleUserStatus);

module.exports = router;

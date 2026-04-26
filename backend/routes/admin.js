const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createTeacher,
  createStudent,
  uploadStudents,
  listUsers,
  toggleUserStatus,
  getStats,
  updateUser,
  deleteUser,
} = require('../controllers/adminController');

const adminOnly = [protect, authorize('admin')];

router.get('/stats',                  ...adminOnly, getStats);
router.get('/users',                  ...adminOnly, listUsers);
router.post('/create-teacher',        ...adminOnly, createTeacher);
router.post('/create-student',        ...adminOnly, createStudent);
router.post('/upload-students',       ...adminOnly, uploadStudents);
router.put('/users/:id/status',       ...adminOnly, toggleUserStatus);
router.put('/users/:id',              ...adminOnly, updateUser);
router.delete('/users/:id',           ...adminOnly, deleteUser);

module.exports = router;

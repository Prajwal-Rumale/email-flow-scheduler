const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const auth = require('../middleware/auth');

// @route   GET /api/templates
// @desc    Get all templates for a user
// @access  Private
router.get('/templates', auth, async (req, res) => {
  try {
    const templates = await Template.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(templates);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/templates
// @desc    Add a new template
// @access  Private
router.post('/templates', auth, async (req, res) => {
  const { name, subject, body } = req.body;
  
  try {
    // Create new template
    const template = new Template({
      name,
      subject,
      body,
      user: req.user.id
    });
    
    // Save template
    await template.save();
    
    res.status(201).json(template);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/templates/:id
// @desc    Delete a template
// @access  Private
router.delete('/templates/:id', auth, async (req, res) => {
  try {
    // Find template
    const template = await Template.findById(req.params.id);
    
    // Check if template exists
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    // Check if user owns template
    if (template.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    // Delete template
    await template.deleteOne();
    
    res.json({ message: 'Template removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

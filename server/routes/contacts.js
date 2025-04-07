const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const auth = require('../middleware/auth');

// @route   GET /api/contacts
// @desc    Get all contacts for a user
// @access  Private
router.get('/contacts', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/contacts
// @desc    Add a new contact
// @access  Private
router.post('/contacts', auth, async (req, res) => {
  const { name, email } = req.body;
  
  try {
    // Check if contact already exists
    const existingContact = await Contact.findOne({ 
      user: req.user.id,
      email
    });
    
    if (existingContact) {
      return res.status(400).json({ message: 'Contact with this email already exists' });
    }
    
    // Create new contact
    const contact = new Contact({
      name,
      email,
      user: req.user.id
    });
    
    // Save contact
    await contact.save();
    
    res.status(201).json(contact);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/contacts/:id
// @desc    Delete a contact
// @access  Private
router.delete('/contacts/:id', auth, async (req, res) => {
  try {
    // Find contact
    const contact = await Contact.findById(req.params.id);
    
    // Check if contact exists
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    
    // Check if user owns contact
    if (contact.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    // Delete contact
    await contact.deleteOne();
    
    res.json({ message: 'Contact removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

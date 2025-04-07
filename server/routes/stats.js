const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const Template = require('../models/Template');
const Flow = require('../models/Flow');
const EmailSchedule = require('../models/EmailSchedule');
const auth = require('../middleware/auth');

// @route   GET /api/stats
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    // Count contacts, templates, flows, and emails
    const contactCount = await Contact.countDocuments({ user: req.user.id });
    const templateCount = await Template.countDocuments({ user: req.user.id });
    const flowCount = await Flow.countDocuments({ user: req.user.id });
    const emailsSent = await EmailSchedule.countDocuments({ 
      flow: { $in: await Flow.find({ user: req.user.id }).distinct('_id') },
      sent: true
    });
    const emailsScheduled = await EmailSchedule.countDocuments({ 
      flow: { $in: await Flow.find({ user: req.user.id }).distinct('_id') },
      sent: false
    });
    
    // Recent flows
    const recentFlows = await Flow.find({ user: req.user.id })
      .sort({ lastUpdated: -1 })
      .limit(5);
    
    // Recent contacts
    const recentContacts = await Contact.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      counts: {
        contacts: contactCount,
        templates: templateCount,
        flows: flowCount,
        emailsSent,
        emailsScheduled
      },
      recent: {
        flows: recentFlows,
        contacts: recentContacts
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

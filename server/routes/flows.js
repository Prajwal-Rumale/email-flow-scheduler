const express = require('express');
const router = express.Router();
const Flow = require('../models/Flow');
const Contact = require('../models/Contact');
const EmailSchedule = require('../models/EmailSchedule');
const Template = require('../models/Template');
const agenda = require('../config/agenda');
const auth = require('../middleware/auth');

// @route   GET /api/flows/:id
// @desc    Get a specific flow by ID
// @access  Private
router.get('/flows/:id', auth, async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id);
    
    // Check if flow exists
    if (!flow) {
      return res.status(404).json({ message: 'Flow not found' });
    }
    
    // Check if user owns flow
    if (flow.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    res.json(flow);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/flows
// @desc    Get all flows for a user
// @access  Private
router.get('/flows', auth, async (req, res) => {
  try {
    const flows = await Flow.find({ user: req.user.id }).sort({ lastUpdated: -1 });
    res.json(flows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/flows
// @desc    Create a new flow
// @access  Private
router.post('/flows', auth, async (req, res) => {
  const flowData = req.body;
  
  try {
    // Create new flow
    const flow = new Flow({
      name: flowData.name || 'Untitled Flow',
      nodes: flowData.nodes || [],
      edges: flowData.edges || [],
      user: req.user.id
    });
    
    // Save flow
    await flow.save();
    
    // If the flow contains email nodes, schedule emails
    if (flowData.isActivated && flowData.nodes && flowData.nodes.length > 0) {
      await scheduleEmailsForFlow(flow, req.user.id);
    }
    
    res.status(201).json(flow);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/flows/:id
// @desc    Update a flow
// @access  Private
router.put('/flows/:id', auth, async (req, res) => {
  const flowData = req.body;
  
  try {
    // Find flow
    let flow = await Flow.findById(req.params.id);
    
    // Check if flow exists
    if (!flow) {
      return res.status(404).json({ message: 'Flow not found' });
    }
    
    // Check if user owns flow
    if (flow.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    // Update flow
    flow.name = flowData.name || flow.name;
    flow.nodes = flowData.nodes || flow.nodes;
    flow.edges = flowData.edges || flow.edges;
    flow.lastUpdated = Date.now();
    
    // Save flow
    await flow.save();
    
    // If the flow is activated, reschedule emails
    if (flowData.isActivated) {
      // Cancel any existing schedules
      await EmailSchedule.deleteMany({ flow: flow._id, sent: false });
      
      // Create new schedules
      await scheduleEmailsForFlow(flow, req.user.id);
    }
    
    res.json(flow);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/flows/:id
// @desc    Delete a flow
// @access  Private
router.delete('/flows/:id', auth, async (req, res) => {
  try {
    // Find flow
    const flow = await Flow.findById(req.params.id);
    
    // Check if flow exists
    if (!flow) {
      return res.status(404).json({ message: 'Flow not found' });
    }
    
    // Check if user owns flow
    if (flow.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    // Delete flow
    await flow.deleteOne();
    
    // Delete any scheduled emails for this flow
    await EmailSchedule.deleteMany({ flow: req.params.id });
    
    res.json({ message: 'Flow removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to schedule emails for a flow
async function scheduleEmailsForFlow(flow, userId) {
  // Get all contacts
  const contacts = await Contact.find({ user: userId });
  
  if (contacts.length === 0) {
    return;
  }
  
  // Find start nodes (nodes with no incoming edges)
  const startNodes = flow.nodes.filter(node => {
    return !flow.edges.some(edge => edge.target === node.id);
  });
  
  // For each contact, schedule emails starting from start nodes
  for (const contact of contacts) {
    for (const startNode of startNodes) {
      await scheduleNodeForContact(flow, startNode, contact, 0);
    }
  }
}

// Helper function to schedule a node for a contact
async function scheduleNodeForContact(flow, node, contact, cumulativeDelay) {
  // Only process email nodes
  if (node.type === 'email' && node.data && node.data.templateId) {
    const template = await Template.findById(node.data.templateId);
    
    if (template) {
      // Schedule this email
      const delayInMinutes = cumulativeDelay;
      const scheduledTime = new Date(Date.now() + delayInMinutes * 60 * 1000);
      
      const emailSchedule = new EmailSchedule({
        flow: flow._id,
        contact: contact._id,
        nodeId: node.id,
        templateId: template._id,
        subject: template.subject,
        body: template.body,
        scheduledFor: scheduledTime
      });
      
      await emailSchedule.save();
      
      // Schedule with Agenda
      agenda.schedule(scheduledTime, 'send email', {
        scheduleId: emailSchedule._id
      });
    }
  }
  
  // If this is a delay node, add to cumulative delay
  if (node.type === 'delay' && node.data && node.data.delayMinutes) {
    cumulativeDelay += parseInt(node.data.delayMinutes) || 0;
  }
  
  // Find child nodes
  const childEdges = flow.edges.filter(edge => edge.source === node.id);
  for (const edge of childEdges) {
    const childNode = flow.nodes.find(n => n.id === edge.target);
    if (childNode) {
      await scheduleNodeForContact(flow, childNode, contact, cumulativeDelay);
    }
  }
}

module.exports = router;
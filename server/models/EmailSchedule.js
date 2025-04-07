const mongoose = require('mongoose');

const EmailScheduleSchema = new mongoose.Schema({
  flow: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flow',
    required: true
  },
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  nodeId: {
    type: String,
    required: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template'
  },
  scheduledFor: {
    type: Date,
    required: true
  },
  subject: String,
  body: String,
  sent: {
    type: Boolean,
    default: false
  },
  sentAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('EmailSchedule', EmailScheduleSchema);

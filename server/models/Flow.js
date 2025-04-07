const mongoose = require('mongoose');

const NodeSchema = new mongoose.Schema({
  id: String,
  type: String,
  position: {
    x: Number,
    y: Number
  },
  data: mongoose.Schema.Types.Mixed,
});

const EdgeSchema = new mongoose.Schema({
  id: String,
  source: String,
  target: String,
  type: String
});

const FlowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  nodes: [NodeSchema],
  edges: [EdgeSchema],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Flow', FlowSchema);

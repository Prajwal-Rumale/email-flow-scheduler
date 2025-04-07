
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Agenda = require('agenda');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/email-sequence-builder';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Initialize Agenda (job scheduler)
const agenda = new Agenda({ db: { address: MONGODB_URI, collection: 'jobs' } });

// Initialize Nodemailer (email sender)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Define Mongoose Models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  company: { type: String },
  addedOn: { type: Date, default: Date.now }
});

const flowSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: 'Untitled Flow' },
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const emailSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  flowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flow' },
  recipientEmail: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  scheduledDate: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'sent', 'failed'], default: 'scheduled' },
  metadata: { type: Object }
});

const User = mongoose.model('User', userSchema);
const Contact = mongoose.model('Contact', contactSchema);
const Flow = mongoose.model('Flow', flowSchema);
const Email = mongoose.model('Email', emailSchema);

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// Define Agenda Jobs
agenda.define('send email', async (job) => {
  try {
    const { emailId } = job.attrs.data;
    
    // Retrieve email from database
    const email = await Email.findById(emailId);
    if (!email) {
      console.error(`Email not found: ${emailId}`);
      return;
    }
    
    // Prepare email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email.recipientEmail,
      subject: email.subject,
      html: email.body,
    };
    
    // Send email
    await transporter.sendMail(mailOptions);
    
    // Update status
    email.status = 'sent';
    await email.save();
    
    console.log(`Email sent to ${email.recipientEmail}`);
  } catch (error) {
    console.error('Error sending email:', error);
    
    // Update status if we can
    if (job.attrs.data.emailId) {
      try {
        const email = await Email.findById(job.attrs.data.emailId);
        if (email) {
          email.status = 'failed';
          await email.save();
        }
      } catch (err) {
        console.error('Error updating email status:', err);
      }
    }
  }
});

// Start Agenda
(async function() {
  await agenda.start();
  console.log('Agenda started');
})();

// API Routes

// Authentication Routes
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword
    });
    
    await user.save();
    
    // Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error during login' });
  }
});

// Flow Routes
app.post('/api/flows', authenticateToken, async (req, res) => {
  try {
    const { nodes, edges } = req.body;
    
    // Find existing flow or create new one
    let flow = await Flow.findOne({ userId: req.user.id });
    
    if (flow) {
      // Update existing flow
      flow.nodes = nodes;
      flow.edges = edges;
      flow.updatedAt = new Date();
      await flow.save();
    } else {
      // Create new flow
      flow = new Flow({
        userId: req.user.id,
        nodes,
        edges
      });
      await flow.save();
    }
    
    res.status(200).json({ success: true, flow });
  } catch (error) {
    console.error('Flow save error:', error);
    res.status(500).json({ error: 'Error saving flow' });
  }
});

app.get('/api/flows', authenticateToken, async (req, res) => {
  try {
    const flow = await Flow.findOne({ userId: req.user.id });
    
    if (!flow) {
      return res.status(404).json({ error: 'No flows found' });
    }
    
    res.status(200).json({ flow });
  } catch (error) {
    console.error('Flow retrieval error:', error);
    res.status(500).json({ error: 'Error retrieving flows' });
  }
});

// Contacts Routes
app.post('/api/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, email, company } = req.body;
    
    const contact = new Contact({
      userId: req.user.id,
      name,
      email,
      company
    });
    
    await contact.save();
    
    res.status(201).json({ success: true, contact });
  } catch (error) {
    console.error('Contact save error:', error);
    res.status(500).json({ error: 'Error saving contact' });
  }
});

app.post('/api/contacts/bulk', authenticateToken, async (req, res) => {
  try {
    const { contacts } = req.body;
    
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided' });
    }
    
    const contactsToSave = contacts.map(contact => ({
      userId: req.user.id,
      name: contact.name,
      email: contact.email,
      company: contact.company
    }));
    
    const savedContacts = await Contact.insertMany(contactsToSave);
    
    res.status(201).json({ success: true, contacts: savedContacts });
  } catch (error) {
    console.error('Bulk contact save error:', error);
    res.status(500).json({ error: 'Error saving contacts' });
  }
});

app.get('/api/contacts', authenticateToken, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user.id });
    
    res.status(200).json({ contacts });
  } catch (error) {
    console.error('Contact retrieval error:', error);
    res.status(500).json({ error: 'Error retrieving contacts' });
  }
});

// Email Scheduling Routes
app.post('/api/schedule-email', authenticateToken, async (req, res) => {
  try {
    const { recipientEmail, subject, body, sendAt, metadata } = req.body;
    
    // Create email record
    const email = new Email({
      userId: req.user.id,
      recipientEmail,
      subject,
      body,
      scheduledDate: new Date(sendAt),
      metadata
    });
    
    await email.save();
    
    // Schedule job
    await agenda.schedule(new Date(sendAt), 'send email', { emailId: email._id });
    
    res.status(200).json({ success: true, email });
  } catch (error) {
    console.error('Email scheduling error:', error);
    res.status(500).json({ error: 'Error scheduling email' });
  }
});

app.post('/api/schedule-sequence', authenticateToken, async (req, res) => {
  try {
    const { sequence } = req.body;
    
    if (!sequence || !sequence.sourceNodeData) {
      return res.status(400).json({ error: 'Invalid sequence data' });
    }
    
    // Handle bulk contacts if they exist in the source node
    if (sequence.sourceNodeData.contacts && Array.isArray(sequence.sourceNodeData.contacts)) {
      const contacts = sequence.sourceNodeData.contacts;
      
      for (const contact of contacts) {
        let cumulativeDelay = 0;
        
        for (const step of sequence.steps) {
          if (step.type === 'delay') {
            // Calculate delay in milliseconds
            const delayMs = calculateDelayInMs(step.delay, step.delayUnit);
            cumulativeDelay += delayMs;
          } else if (step.type === 'email') {
            // Replace template variables in subject and body
            let subject = step.data.subject || '';
            let body = step.data.body || '';
            
            subject = subject.replace(/{name}/g, contact.name || '')
                          .replace(/{company}/g, contact.company || '');
            
            body = body.replace(/{name}/g, contact.name || '')
                      .replace(/{company}/g, contact.company || '');
            
            // Schedule the email with the accumulated delay
            const scheduledDate = new Date(Date.now() + cumulativeDelay);
            
            // Create email record
            const email = new Email({
              userId: req.user.id,
              recipientEmail: contact.email,
              subject,
              body,
              scheduledDate,
              metadata: {
                contactName: contact.name,
                company: contact.company,
                sequenceId: sequence._id
              }
            });
            
            await email.save();
            
            // Schedule job
            await agenda.schedule(scheduledDate, 'send email', { emailId: email._id });
          }
        }
      }
    } else {
      // Process as a single recipient sequence
      let cumulativeDelay = 0;
      const recipientEmail = sequence.sourceNodeData.recipientEmail || 'test@example.com';
      
      for (const step of sequence.steps) {
        if (step.type === 'delay') {
          // Calculate delay in milliseconds
          const delayMs = calculateDelayInMs(step.delay, step.delayUnit);
          cumulativeDelay += delayMs;
        } else if (step.type === 'email') {
          // Schedule the email with the accumulated delay
          const scheduledDate = new Date(Date.now() + cumulativeDelay);
          
          // Create email record
          const email = new Email({
            userId: req.user.id,
            recipientEmail,
            subject: step.data.subject,
            body: step.data.body,
            scheduledDate,
            metadata: {
              sourceName: sequence.sourceNodeData.name,
              sequenceId: sequence._id
            }
          });
          
          await email.save();
          
          // Schedule job
          await agenda.schedule(scheduledDate, 'send email', { emailId: email._id });
        }
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Sequence scheduling error:', error);
    res.status(500).json({ error: 'Error scheduling sequence' });
  }
});

app.post('/api/bulk-schedule', authenticateToken, async (req, res) => {
  try {
    const { contacts, interval } = req.body;
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided' });
    }
    
    const delayMs = interval * 60 * 1000; // Convert minutes to milliseconds
    let cumulativeDelay = 0;
    
    // Schedule emails for each contact with increasing delay
    for (const contact of contacts) {
      const scheduledDate = new Date(Date.now() + cumulativeDelay);
      
      // Create email record
      const email = new Email({
        userId: req.user.id,
        recipientEmail: contact.email,
        subject: `Message for ${contact.name}`,
        body: `Hello ${contact.name},\n\nThis is a message for ${contact.name} at ${contact.company}.\n\nRegards,\nYour Name`,
        scheduledDate,
        metadata: {
          contactName: contact.name,
          company: contact.company,
          bulkScheduled: true
        }
      });
      
      await email.save();
      
      // Schedule job
      await agenda.schedule(scheduledDate, 'send email', { emailId: email._id });
      
      // Increase the delay for the next email
      cumulativeDelay += delayMs;
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Bulk scheduling error:', error);
    res.status(500).json({ error: 'Error scheduling bulk emails' });
  }
});

// Helper function to calculate delay in milliseconds
function calculateDelayInMs(duration, unit) {
  switch (unit) {
    case 'minutes':
      return duration * 60 * 1000;
    case 'hours':
      return duration * 60 * 60 * 1000;
    case 'days':
      return duration * 24 * 60 * 60 * 1000;
    default:
      return duration * 60 * 60 * 1000; // Default to hours
  }
}

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
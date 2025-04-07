const Agenda = require('agenda');
const nodemailer = require('nodemailer');
const EmailSchedule = require('../models/EmailSchedule');
const Contact = require('../models/Contact');

// Connect to MongoDB
const agenda = new Agenda({
  db: {
    address: process.env.MONGODB_URI || 'mongodb://localhost:27017/email-sequence-builder',
    collection: 'agendaJobs'
  }
});

// Create email transporter
let transporter;

if (process.env.NODE_ENV === 'production') {
  // Production email settings
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
} else {
  // Development email settings (using ethereal.email for testing)
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: 'ethereal.user@ethereal.email', // Replace with actual ethereal credentials
      pass: 'ethereal.password'             // Replace with actual ethereal credentials
    }
  });
}

// Define Agenda job for sending emails
agenda.define('send email', async (job) => {
  const { scheduleId } = job.attrs.data;
  
  try {
    // Find the email schedule
    const schedule = await EmailSchedule.findById(scheduleId)
      .populate('contact')
      .populate('templateId');
    
    if (!schedule || schedule.sent) {
      return;
    }
    
    // Get contact information
    const contact = await Contact.findById(schedule.contact);
    
    if (!contact) {
      return;
    }
    
    // Process template variables if needed
    let emailBody = schedule.body;
    let emailSubject = schedule.subject;
    
    // Replace placeholders with actual values
    const replacements = {
      '{{name}}': contact.name,
      '{{email}}': contact.email,
      '{{date}}': new Date().toLocaleDateString()
    };
    
    for (const [placeholder, value] of Object.entries(replacements)) {
      emailBody = emailBody.replace(new RegExp(placeholder, 'g'), value);
      emailSubject = emailSubject.replace(new RegExp(placeholder, 'g'), value);
    }
    
    // Send the email
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@emailsequence.app',
      to: contact.email,
      subject: emailSubject,
      html: emailBody
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    
    // Mark as sent
    schedule.sent = true;
    schedule.sentAt = new Date();
    await schedule.save();
  } catch (err) {
    console.error('Error sending email:', err);
  }
});

// Start Agenda
(async function() {
  await agenda.start();
  console.log('Agenda started');
})();

module.exports = agenda;
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: 'ae668a001@smtp-brevo.com',
    pass: 'F1dvLBqKjD026T5n'
  }
});

async function main() {
  const info = await transporter.sendMail({
    from: '"Vocaply" <uzairsarwar3423@gmail.com>',
    to: 'uzairsarwar3423@gmail.com',
    subject: 'Test Email from Vocaply',
    text: 'This is a test email.'
  });
  console.log('Message sent: %s', info.messageId);
}

main().catch(console.error);

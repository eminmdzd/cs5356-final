import sgMail from '@sendgrid/mail';

// Initialize SendGrid API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('SENDGRID_API_KEY not found in environment variables. Email functionality will not work.');
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using SendGrid
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.error('Cannot send email: SENDGRID_API_KEY not configured');
    return false;
  }

  try {
    const msg = {
      to,
      from: 'audiobookemins@gmail.com', // Replace with your verified sender
      subject,
      text: text || html.replace(/<[^>]*>/g, ''), // Plain text version
      html,
    };

    await sgMail.send(msg);
    console.log(`Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Send a notification email when an audiobook is completed
 */
export async function sendAudiobookCompletionEmail({
  to,
  audiobookTitle,
  audiobookId,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
}: {
  to: string;
  audiobookTitle: string;
  audiobookId: string;
  appUrl?: string;
}): Promise<boolean> {
  const audiobookUrl = `${appUrl}/audiobooks/${audiobookId}`;
  
  const subject = `Your audiobook "${audiobookTitle}" is ready`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4f46e5;">Your audiobook is ready!</h1>
      <p>Good news! Your audiobook <strong>${audiobookTitle}</strong> has been successfully generated and is now ready for you to listen.</p>
      <div style="margin: 30px 0;">
        <a href="${audiobookUrl}" style="background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Listen to Your Audiobook
        </a>
      </div>
      <p>You can access your audiobook at any time by logging into your account.</p>
      <p>Thank you for using our service!</p>
      <p style="font-size: 0.8em; color: #666; margin-top: 30px;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html,
  });
}
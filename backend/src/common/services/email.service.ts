import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const emailUser = this.config.get<string>('EMAIL_USER');
    const emailPass = this.config.get<string>('EMAIL_PASS');

    this.fromAddress = `"Task Manager" <${emailUser}>`;

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  // ─── Gửi email tổng quát ──────────────────────────────────────────────────────
  async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(
        `Email sent to ${options.to} | Subject: "${options.subject}"`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to send email to ${options.to}`, message);
      throw new Error(`Email delivery failed: ${message}`);
    }
  }

  // ─── Gửi OTP đăng ký ─────────────────────────────────────────────────────────
  async sendOtpEmail(email: string, otp: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Your Task Manager OTP Code',
      html: this.buildOtpEmailHtml(otp, 'Verify Your Account', 'registration'),
      text: `Your OTP is: ${otp}\n\nThis code is only valid for 5 minutes.`,
    });
  }

  // ─── Gửi OTP reset mật khẩu ──────────────────────────────────────────────────
  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.get<string>('EMAIL_USER'),
        pass: this.config.get<string>('EMAIL_PASS'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    try {
      await transport.sendMail({
        from: this.fromAddress,
        to: email,
        subject: 'Your Task Manager Password Reset Code',
        html: this.buildOtpEmailHtml(
          otp,
          'Reset Your Password',
          'password reset',
        ),
        text: `Your password reset OTP is: ${otp}\n\nThis code is only valid for 5 minutes.`,
      });
    } catch {
      this.logger.warn(
        'Password reset delivery failed; request may be retried after cooldown.',
      );
      throw new Error('Password reset delivery unavailable');
    } finally {
      transport.close();
    }
  }

  // ─── Gửi email nhắc nhở Task đến hạn ────────────────────────────────────────
  async sendTaskReminderEmail(options: {
    to: string;
    taskTitle: string;
    dueDate: string;
    organizationName: string;
    taskId: string;
    organizationId: string;
  }): Promise<void> {
    const clientUrl = this.config.get<string>('CLIENT_URL');
    const taskLink = `${clientUrl}/${options.organizationId}/tasks/${options.taskId}`;
    await this.sendEmail({
      to: options.to,
      subject: `Task Reminder: "${options.taskTitle}" is due today`,
      html: this.buildReminderEmailHtml({ ...options, taskLink }),
      text:
        `Reminder: Task "${options.taskTitle}" is due today (${options.dueDate}).\n` +
        `Organization: ${options.organizationName}` +
        `Link: ${taskLink}`,
    });
  }

  // ─── Gửi lời mời tham gia Organization ──────────────────────────────────────
  async sendOrganizationInvitationEmail(options: {
    to: string;
    organizationName: string;
    organizationId: string;
    invitedByName: string;
    acceptLink?: string;
  }): Promise<void> {
    const clientUrl = this.config.get<string>('CLIENT_URL');
    const organizationLink =
      options.acceptLink ||
      `${clientUrl}/organizations/${options.organizationId}`;
    await this.sendEmail({
      to: options.to,
      subject: `You're invited to join ${options.organizationName} on Task Manager`,
      html: this.buildOrganizationInvitationEmailHtml({
        ...options,
        organizationLink,
      }),
      text:
        `${options.invitedByName} has invited you to join "${options.organizationName}" organization.\n` +
        `Join here: ${organizationLink}`,
    });
  }

  // ─── Gửi email thông báo Admin khi Member nộp task chờ duyệt ────────────────
  async sendApprovalRequestEmail(options: {
    to: string;
    taskTitle: string;
    taskId: string;
    organizationId: string;
    submittedByName: string;
  }): Promise<void> {
    const clientUrl = this.config.get<string>('CLIENT_URL');
    const taskLink = `${clientUrl}/${options.organizationId}/tasks/${options.taskId}`;
    await this.sendEmail({
      to: options.to,
      subject: `[Action Required] Task "${options.taskTitle}" is pending your approval`,
      html: this.buildApprovalRequestEmailHtml({ ...options, taskLink }),
      text:
        `${options.submittedByName} has submitted task "${options.taskTitle}" for your approval.\n` +
        `Review it here: ${taskLink}`,
    });
  }

  // ─── HTML template Organization Invitation ────────────────────────────────────
  private buildOrganizationInvitationEmailHtml(options: {
    organizationName: string;
    organizationLink: string;
    invitedByName: string;
  }): string {
    const { organizationName, organizationLink, invitedByName } = options;
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Organization Invitation</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="500" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#10b981,#059669);padding:32px;text-align:center;">
                  <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:-0.5px;">Task Manager</h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">You're Invited to Join</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 32px;">
                  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                    <strong>${invitedByName}</strong> has invited you to join <strong>${organizationName}</strong> on Task Manager!
                  </p>

                  <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:4px;padding:20px 24px;margin:0 0 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Organization</span>
                          <p style="color:#111827;font-size:16px;font-weight:700;margin:4px 0 0;">${organizationName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Invited By</span>
                          <p style="color:#374151;font-size:15px;margin:4px 0 0;">${invitedByName}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</span>
                          <p style="color:#f59e0b;font-size:15px;font-weight:600;margin:4px 0 0;">⏳ Pending Acceptance</p>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${organizationLink}"
                       style="background: linear-gradient(135deg, #10b981, #059669);
                              color: #ffffff;
                              padding: 14px 28px;
                              text-decoration: none;
                              border-radius: 6px;
                              font-weight: bold;
                              font-size: 15px;
                              display: inline-block;
                              box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);">
                      Accept Invitation
                    </a>
                  </div>

                  <p style="color:#6b7280;font-size:13px;margin:0;text-align:center;">
                    Log in to Task Manager and accept this invitation to join the organization.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="color:#9ca3af;font-size:12px;margin:0;">
                    This is an automated notification from Task Manager. Please do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  // ─── HTML template Approval Request ──────────────────────────────────────────
  private buildApprovalRequestEmailHtml(options: {
    taskTitle: string;
    taskLink: string;
    submittedByName: string;
  }): string {
    const { taskTitle, taskLink, submittedByName } = options;
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Approval Request</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="500" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:32px;text-align:center;">
                  <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:-0.5px;">Task Manager</h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Task Approval Request</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 32px;">
                  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                    <strong>${submittedByName}</strong> has submitted a task for your review and approval.
                  </p>

                  <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:20px 24px;margin:0 0 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Task</span>
                          <p style="color:#111827;font-size:16px;font-weight:700;margin:4px 0 0;">${taskTitle}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</span>
                          <p style="color:#3b82f6;font-size:15px;font-weight:600;margin:4px 0 0;">⏳ Pending Approval</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Submitted By</span>
                          <p style="color:#374151;font-size:15px;margin:4px 0 0;">${submittedByName}</p>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${taskLink}"
                       style="background: linear-gradient(135deg, #3b82f6, #6366f1);
                              color: #ffffff;
                              padding: 14px 28px;
                              text-decoration: none;
                              border-radius: 6px;
                              font-weight: bold;
                              font-size: 15px;
                              display: inline-block;
                              box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);">
                      Review &amp; Approve Task
                    </a>
                  </div>

                  <p style="color:#6b7280;font-size:13px;margin:0;text-align:center;">
                    Log in to Task Manager to approve or reject this task.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="color:#9ca3af;font-size:12px;margin:0;">
                    This is an automated notification from Task Manager. Please do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  // ─── HTML template Task Reminder ─────────────────────────────────────────────
  private buildReminderEmailHtml(options: {
    taskTitle: string;
    dueDate: string;
    organizationName: string;
    taskLink: string;
  }): string {
    const { taskTitle, dueDate, organizationName, taskLink } = options;
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Task Reminder</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="500" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px;text-align:center;">
                  <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:-0.5px;">Task Manager</h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Task Due Today Reminder</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 32px;">
                  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                    You have a task that is <strong>due today</strong>. Please review and complete it on time.
                  </p>
                  
                  <div style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:4px;padding:20px 24px;margin:0 0 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Task</span>
                          <p style="color:#111827;font-size:16px;font-weight:700;margin:4px 0 0;">${taskTitle}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Due Date</span>
                          <p style="color:#ef4444;font-size:15px;font-weight:600;margin:4px 0 0;">${dueDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px;">
                          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Organization</span>
                          <p style="color:#374151;font-size:15px;margin:4px 0 0;">${organizationName}</p>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${taskLink}" 
                       style="background: linear-gradient(135deg, #f59e0b, #ef4444);
                              color: #ffffff;
                              padding: 14px 28px;
                              text-decoration: none;
                              border-radius: 6px;
                              font-weight: bold;
                              font-size: 15px;
                              display: inline-block;
                              box-shadow: 0 4px 10px rgba(239, 68, 68, 0.25);">
                      View Task Details
                    </a>
                  </div>

                  <p style="color:#6b7280;font-size:13px;margin:0;text-align:center;">
                    Log in to Task Manager to view and update the task status.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="color:#9ca3af;font-size:12px;margin:0;">
                    This is an automated reminder from Task Manager. Please do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  // ─── HTML template OTP ───────────────────────────────────────────────────────
  private buildOtpEmailHtml(
    otp: string,
    title: string,
    context: string,
  ): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="500" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
                  <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:-0.5px;">Task Manager</h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${title}</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:40px 32px;">
                  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                    You requested a <strong>${context}</strong> OTP. Use the code below to continue:
                  </p>
                  <!-- OTP Box -->
                  <div style="background:#f3f4f6;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px;">
                    <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#4f46e5;font-family:monospace;">
                      ${otp}
                    </span>
                  </div>
                  <p style="color:#6b7280;font-size:13px;margin:0;">
                    ⏳ This code expires in <strong>5 minutes</strong>. Do not share it with anyone.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="color:#9ca3af;font-size:12px;margin:0;">
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }
}

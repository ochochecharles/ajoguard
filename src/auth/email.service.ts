import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(
      this.configService.getOrThrow<string>('RESEND_API_KEY'),
    );
    this.fromAddress = this.configService.getOrThrow<string>('RESEND_FROM');
  }

  async sendOtp(email: string, name: string, otp: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to: email,
        subject: 'Your AjoGuard Login Code',
        html: this.buildOtpEmail(name, otp),
      });
      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${email}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async sendWelcome(
    email: string,
    name: string,
    groupName: string,
  ): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to: email,
        subject: `Welcome to AjoGuard — ${groupName}`,
        html: this.buildWelcomeEmail(name, groupName),
      });
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to ${email}: ${(error as Error).message}`,
      );
      // Don't throw — welcome email failure shouldn't block member creation
    }
  }


  // ─── Email templates ──────────────────────────────────

  private buildOtpEmail(name: string, otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0;padding:0;background:#f4f3ef;font-family:'Helvetica Neue',Arial,sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
          <tr>
            <td align="center">
              <table width="480" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:16px;overflow:hidden;
                       border:1px solid #d8d6ce">

                <!-- Header -->
                <tr>
                  <td style="background:#0a0a0f;padding:28px 36px">
                    <div style="font-size:22px;font-weight:800;
                                color:#c8f03c;letter-spacing:-0.5px">
                      AjoGuard
                    </div>
                    <div style="font-size:11px;color:#7a7a96;
                                letter-spacing:2px;text-transform:uppercase;
                                margin-top:4px">
                      Savings Intelligence
                    </div>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:36px">
                    <p style="font-size:15px;color:#0a0a0f;margin:0 0 8px">
                      Hi ${name},
                    </p>
                    <p style="font-size:14px;color:#4a4a62;margin:0 0 28px;
                               line-height:1.6">
                      Here is your one-time login code for AjoGuard.
                      Enter this code to access your group dashboard.
                    </p>

                    <!-- OTP Box -->
                    <div style="background:#f4f3ef;border-radius:12px;
                                padding:28px;text-align:center;
                                border:1px solid #d8d6ce;margin-bottom:28px">
                      <div style="font-size:11px;color:#7a7a96;
                                  letter-spacing:2px;text-transform:uppercase;
                                  margin-bottom:12px">
                        Your Login Code
                      </div>
                      <div style="font-size:42px;font-weight:700;
                                  letter-spacing:12px;color:#0a0a0f">
                        ${otp}
                      </div>
                      <div style="font-size:12px;color:#7a7a96;margin-top:12px">
                        Expires in 5 minutes
                      </div>
                    </div>

                    <!-- Warning -->
                    <div style="background:#fef9c3;border-radius:8px;
                                padding:12px 16px;margin-bottom:24px">
                      <p style="font-size:12px;color:#92400e;margin:0">
                        ⚠️ Do not share this code with anyone.
                        AjoGuard will never ask for your code.
                      </p>
                    </div>

                    <p style="font-size:13px;color:#7a7a96;margin:0;
                               line-height:1.6">
                      If you did not request this code, you can safely
                      ignore this email. Your account remains secure.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f4f3ef;padding:20px 36px;
                             border-top:1px solid #d8d6ce">
                    <p style="font-size:11px;color:#7a7a96;margin:0;
                               text-align:center">
                      AjoGuard — Bringing trust to informal savings groups
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

  private buildWelcomeEmail(name: string, groupName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0;padding:0;background:#f4f3ef;
                   font-family:'Helvetica Neue',Arial,sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
          <tr>
            <td align="center">
              <table width="480" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:16px;overflow:hidden;
                       border:1px solid #d8d6ce">

                <!-- Header -->
                <tr>
                  <td style="background:#0a0a0f;padding:28px 36px">
                    <div style="font-size:22px;font-weight:800;
                                color:#c8f03c;letter-spacing:-0.5px">
                      AjoGuard
                    </div>
                    <div style="font-size:11px;color:#7a7a96;
                                letter-spacing:2px;text-transform:uppercase;
                                margin-top:4px">
                      Savings Intelligence
                    </div>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:36px">
                    <p style="font-size:15px;color:#0a0a0f;margin:0 0 8px">
                      Welcome, ${name}! 🎉
                    </p>
                    <p style="font-size:14px;color:#4a4a62;
                               margin:0 0 24px;line-height:1.6">
                      You have been added as the collector for
                      <strong>${groupName}</strong> on AjoGuard.
                    </p>

                    <div style="background:#f4f3ef;border-radius:12px;
                                padding:20px;margin-bottom:24px;
                                border:1px solid #d8d6ce">
                      <p style="font-size:13px;color:#0a0a0f;
                                 font-weight:600;margin:0 0 8px">
                        How to log in:
                      </p>
                      <ol style="font-size:13px;color:#4a4a62;
                                  margin:0;padding-left:20px;line-height:2">
                        <li>Go to the AjoGuard dashboard</li>
                        <li>Enter this email address</li>
                        <li>Enter the 6-digit code sent to your email</li>
                        <li>Access your group dashboard</li>
                      </ol>
                    </div>

                    <p style="font-size:13px;color:#7a7a96;margin:0;line-height:1.6">
                      If you were not expecting this email, please
                      contact whoever manages your savings group.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f4f3ef;padding:20px 36px;
                             border-top:1px solid #d8d6ce">
                    <p style="font-size:11px;color:#7a7a96;margin:0;
                               text-align:center">
                      AjoGuard — Bringing trust to informal savings groups
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
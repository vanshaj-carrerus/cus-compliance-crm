import crypto from "crypto";
import nodemailer from "nodemailer";
import { connectDB } from "@/lib/mongodb";
import { VerificationCode } from "@/lib/models/VerificationCode";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { corsPreflightResponse, jsonWithCors } from "@/lib/cors";

export async function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function POST(request: Request) {
  try {
    await connectDB();
    const body = (await request.json()) as { email?: string };
    const email = normalizeEmail(body.email || "");

    if (!isValidEmail(email)) {
      return jsonWithCors(
        request,
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const code = crypto.randomInt(100000, 999999).toString();

    await VerificationCode.deleteOne({ email });
    await VerificationCode.create({
      email,
      code,
      expires: Date.now() + 10 * 60 * 1000,
    });

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      throw new Error("Missing EMAIL_USER or EMAIL_PASS");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: emailUser, pass: emailPass },
    });

    await transporter.sendMail({
      from: `CareerUS Compliance <${emailUser}>`,
      to: email,
      subject: "CareerUS CRM — Verification Code",
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#eaf5f5;color:#203a40;">
  <table role="presentation" style="border-collapse:collapse;width:100%;max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 14px 34px rgba(63,103,108,.09);">
    <tr>
      <td style="background:#15999a;color:#fff;padding:24px;text-align:center;">
        <h1 style="margin:0;font-size:22px;">CareerUS Compliance CRM</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;text-align:center;">
        <p style="margin:0 0 12px;line-height:1.5;">Your verification code is:</p>
        <div style="font-size:28px;font-weight:700;color:#15999a;letter-spacing:4px;margin:20px 0;padding:12px 20px;background:#eaf5f5;border-radius:8px;display:inline-block;">${code}</div>
        <p style="margin:12px 0 0;line-height:1.5;color:#70868b;">It expires in 10 minutes.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;text-align:center;font-size:12px;color:#70868b;background:#f1f7f7;">
        <p style="margin:0;">This is an automated message. Do not reply.</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    return jsonWithCors(request, { message: "Verification code sent" });
  } catch (error) {
    console.error("send-code error:", error);
    return jsonWithCors(
      request,
      {
        error: "Failed to send verification code",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { phone, username } = await req.json();

    if (!phone || !phone.match(/^\d{10}$/)) {
      return NextResponse.json({ success: false, message: "Invalid 10-digit phone number" }, { status: 400 });
    }

    // 1. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // 2. Save OTP to DB
    // Assuming search by username if provided, or just update by phone if unique
    if (username) {
        await pool.query(
            "UPDATE users SET phone = $1, otp = $2, otp_expiry = $3, is_verified = FALSE WHERE username = $4",
            [phone, otp, otpExpiry, username]
        );
    } else {
        // Find user by phone to update
        await pool.query(
            "UPDATE users SET otp = $1, otp_expiry = $2, is_verified = FALSE WHERE phone = $3",
            [otp, otpExpiry, phone]
        );
    }

    // 3. Send via Fast2SMS
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
      console.error("FAST2SMS_API_KEY is missing");
      // Return success in dev mode but log it
      return NextResponse.json({ 
          success: true, 
          message: "OTP generated (Dev mode: API key missing)",
          dev_otp: otp // Only for debugging
      });
    }

    try {
      const response = await axios.post(
        "https://www.fast2sms.com/dev/bulkV2",
        {
          route: "q",
          numbers: phone,
          message: `Your ChatSync verification OTP is: ${otp}. Valid for 5 minutes.`
        },
        {
          headers: {
            authorization: apiKey,
            "Content-Type": "application/json"
          }
        }
      );

      if (response.data.return) {
        return NextResponse.json({ success: true, message: "OTP sent successfully" });
      } else {
        return NextResponse.json({ 
          success: false, 
          message: `Fast2SMS Error: ${response.data.message || "Please complete website verification on Fast2SMS."}`,
          debug: response.data 
        }, { status: 400 });
      }
    } catch (apiErr: any) {
      const apiData = apiErr.response?.data;
      console.error("Fast2SMS API Error:", apiData || apiErr.message);
      return NextResponse.json({ 
        success: false, 
        message: apiData?.message || "Failed to send OTP. Ensure your Fast2SMS account is verified." 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Send OTP Error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

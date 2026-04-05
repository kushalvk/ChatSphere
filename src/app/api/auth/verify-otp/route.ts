import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { phone, otp, username } = await req.json();

    if (!phone || !otp) {
      return NextResponse.json({ success: false, message: "Missing phone or OTP" }, { status: 400 });
    }

    // 1. Fetch user by phone/username
    let userRes;
    if (username) {
        userRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    } else {
        userRes = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
    }

    if (userRes.rows.length === 0) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const user = userRes.rows[0];

    // 2. Validate OTP
    if (user.otp !== otp) {
      return NextResponse.json({ success: false, message: "Invalid OTP" }, { status: 400 });
    }

    // 3. Check Expiry
    if (new Date() > new Date(user.otp_expiry)) {
      return NextResponse.json({ success: false, message: "OTP expired" }, { status: 410 });
    }

    // 4. Mark Verified
    await pool.query(
      "UPDATE users SET is_verified = TRUE, otp = NULL, otp_expiry = NULL WHERE id = $1",
      [user.id]
    );

    return NextResponse.json({ 
        success: true, 
        message: "Mobile verified successfully",
        is_verified: true
    });

  } catch (error: any) {
    console.error("Verify OTP Error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

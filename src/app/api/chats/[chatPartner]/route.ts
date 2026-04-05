import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// DELETE Entire Chat for User (DELETE /api/chats/:chatPartner)
export async function DELETE(req: NextRequest, props: { params: Promise<{ chatPartner: string }> }) {
  const { chatPartner } = await props.params;
  try {
    const username = req.headers.get("X-Username");

    if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Mark entire chat as deleted for THIS user:
    await pool.query(
      `INSERT INTO chat_user_status (username, chat_partner, is_deleted, deleted_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (username, chat_partner) DO UPDATE SET is_deleted = TRUE, deleted_at = NOW()`,
      [username, chatPartner]
    );

    return NextResponse.json({ success: true, chatPartner });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

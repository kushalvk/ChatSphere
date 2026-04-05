import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// EDIT Message (PUT /api/messages/:id)
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const { content } = await req.json();
    const username = req.headers.get("X-Username");

    if (!username || !content || !content.trim()) {
      return NextResponse.json({ error: "Unauthorized or empty content" }, { status: 400 });
    }

    const check = await pool.query("SELECT from_user, is_deleted FROM messages WHERE id = $1", [id]);
    if (check.rows.length === 0) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (check.rows[0].from_user !== username) return NextResponse.json({ error: "Forbidden: You don't own this message" }, { status: 403 });
    if (check.rows[0].is_deleted) return NextResponse.json({ error: "Cannot edit deleted message" }, { status: 400 });

    await pool.query("UPDATE messages SET message = $1, is_edited = TRUE WHERE id = $2", [content, id]);
    
    return NextResponse.json({ success: true, messageId: id, newContent: content, isEdited: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE Message (DELETE /api/messages/:id)
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const username = req.headers.get("X-Username");

    if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const check = await pool.query("SELECT from_user FROM messages WHERE id = $1", [id]);
    if (check.rows.length === 0) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (check.rows[0].from_user !== username) return NextResponse.json({ error: "Forbidden: You don't own this message" }, { status: 403 });

    await pool.query(
      "UPDATE messages SET message = 'This message was deleted', is_deleted = TRUE WHERE id = $1",
      [id]
    );

    return NextResponse.json({ success: true, messageId: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

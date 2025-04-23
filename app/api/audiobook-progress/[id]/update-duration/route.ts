import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/database/db';
import { audiobooks } from '@/database/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Verify user is authenticated
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the id from params
    const { id } = await params;

    // Parse the request body to get the duration
    const body = await req.json();
    const { duration } = body;

    if (typeof duration !== 'number' || duration <= 0) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }

    // Verify the audiobook belongs to the user
    const audiobook = await db.query.audiobooks.findFirst({
      where: and(
        eq(audiobooks.id, id),
        eq(audiobooks.userId, session.user.id)
      ),
    });

    if (!audiobook) {
      return NextResponse.json({ error: 'Audiobook not found' }, { status: 404 });
    }

    // Update the audiobook duration
    await db
      .update(audiobooks)
      .set({ duration })
      .where(
        and(
          eq(audiobooks.id, id),
          eq(audiobooks.userId, session.user.id)
        )
      );

    console.log(`Updated duration for audiobook ${id} from ${audiobook.duration} to ${duration} seconds`);

    return NextResponse.json({ success: true, duration });
  } catch (error) {
    console.error('Error updating audiobook duration:', error);
    return NextResponse.json({ error: 'Failed to update duration' }, { status: 500 });
  }
}
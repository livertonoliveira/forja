import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { readAlertsFile, writeAlertsFile } from './_store';

const AlertCreateSchema = z.object({
  project: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9]+$/, 'project must be uppercase letters/digits'),
  threshold_usd: z.number().positive('threshold_usd must be > 0').finite().max(1_000_000),
  period: z.enum(['month', 'week', 'day']),
  notifyVia: z.array(z.enum(['slack', 'email'])),
  slackWebhookUrl: z
    .string()
    .regex(
      /^https:\/\/hooks\.slack\.com\/services\//,
      'slackWebhookUrl must be a valid Slack webhook URL (https://hooks.slack.com/services/...)'
    )
    .optional(),
  budgetCap: z.boolean().default(false),
});

export async function GET(): Promise<NextResponse> {
  try {
    const data = await readAlertsFile();
    return NextResponse.json(data.alerts, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const result = AlertCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'validation error', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const data = await readAlertsFile();

    if (data.alerts.length >= 100) {
      return NextResponse.json({ error: 'alert limit reached' }, { status: 429 });
    }

    const newAlert = { id: randomUUID(), ...result.data };
    data.alerts = [...data.alerts, newAlert];
    await writeAlertsFile(data);

    return NextResponse.json(newAlert, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

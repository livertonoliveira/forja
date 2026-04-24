import { redirect, notFound } from 'next/navigation';
import { UUID_RE } from '@/lib/validation';

export default function FindingDirectPage({
  params,
}: {
  params: { runId: string; findingId: string };
}) {
  if (!UUID_RE.test(params.findingId)) notFound();
  redirect(`/runs/${params.runId}?findingId=${params.findingId}`);
}

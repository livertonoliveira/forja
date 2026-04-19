import Link from 'next/link';
import { gateBadgeColors } from '@/lib/ui-constants';

interface IssueSummary {
  issueId: string;
  runCount: number;
  lastGate: 'pass' | 'warn' | 'fail' | null;
  lastRun: string;
}

export default async function IssuesPage() {
  const res = await fetch('http://localhost:4242/api/issues', { next: { revalidate: 30 } });
  const issues: IssueSummary[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-100 mb-6">Issues</h1>
      {issues.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma issue encontrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-3 pr-6 font-medium">Issue</th>
                <th className="pb-3 pr-6 font-medium">Runs</th>
                <th className="pb-3 pr-6 font-medium">Last Gate</th>
                <th className="pb-3 font-medium">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.issueId} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-6 font-mono text-gray-300">
                    <Link href={`/issues/${issue.issueId}`} className="hover:text-white transition-colors">
                      {issue.issueId}
                    </Link>
                  </td>
                  <td className="py-3 pr-6 text-gray-400">{issue.runCount}</td>
                  <td className="py-3 pr-6">
                    {issue.lastGate ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${gateBadgeColors[issue.lastGate]}`}>
                        {issue.lastGate}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {new Date(issue.lastRun).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

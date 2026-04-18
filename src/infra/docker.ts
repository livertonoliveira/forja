import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function checkDockerAvailable(): Promise<void> {
  try {
    await execAsync('docker version --format json', { maxBuffer: 10 * 1024 * 1024 });
  } catch {
    throw new Error('Docker não encontrado. Instale Docker Desktop em https://docs.docker.com/get-docker/');
  }
}

export async function composeUp(): Promise<void> {
  await execAsync('docker compose up -d', { cwd: process.cwd() });
}

export async function composeDown(): Promise<void> {
  await execAsync('docker compose down', { cwd: process.cwd() });
}

export async function composeStatus(): Promise<string> {
  const { stdout } = await execAsync('docker compose ps', { cwd: process.cwd() });
  return stdout;
}

export async function waitForHealthy(serviceName: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  // skip the first 10s matching the compose healthcheck start_period
  await new Promise<void>((resolve) => setTimeout(resolve, 10000));

  while (Date.now() < deadline) {
    const { stdout } = await execAsync('docker compose ps --format json', { cwd: process.cwd() });

    const lines = stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const service = JSON.parse(line) as { Name?: string; Service?: string; Health?: string; Status?: string };
      const name = service.Name ?? service.Service ?? '';
      if (name === serviceName || name.includes(serviceName)) {
        if (service.Health === 'healthy' || service.Status?.includes('healthy')) {
          return;
        }
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Timeout aguardando serviço ficar saudável');
}

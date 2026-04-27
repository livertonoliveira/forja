// negative fixture: only error message logged, no secrets
declare const auth: { verify: (userId: string) => Promise<void> };

async function login(userId: string) {
  try {
    await auth.verify(userId);
  } catch (err: any) {
    console.error('Login failed for user:', userId, err.message);
  }
}

export { login };

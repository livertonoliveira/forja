// positive fixture: password logged in error handler
declare const auth: { verify: (password: string) => Promise<void> };

async function login(password: string) {
  try {
    await auth.verify(password);
  } catch (err) {
    console.error('Login failed', { password, err });
  }
}

export { login };

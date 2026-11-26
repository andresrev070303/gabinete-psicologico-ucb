import { AuthenticationFailure } from './authentication.contracts.js';

/** Shares the memory budget between password verification and generation. */
export class PasswordWorkLimiter {
  private running = false;
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running) throw new AuthenticationFailure('busy');
    this.running = true;
    try {
      return await work();
    } finally {
      this.running = false;
    }
  }
}

export class DomainError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

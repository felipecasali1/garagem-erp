export class StaleRecordError<T = unknown> extends Error {
  constructor(
    message: string,
    readonly current: T | null,
  ) {
    super(message);
    this.name = "StaleRecordError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = "ERROR",
    readonly status = 400,
    readonly detail = "",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function redact(message: string): string {
  return message.replace(/https?:\/\/[^@\s/]+@/gi, "https://***@");
}

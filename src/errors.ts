import { TaggedError } from "better-result";

export class DatabaseError extends TaggedError("DatabaseError")<{
  message: string;
}>() {}

export class CommandError extends TaggedError("CommandError")<{
  command: string;
  message: string;
}>() {}

export class ProjectDetectionError extends TaggedError("ProjectDetectionError")<{
  message: string;
}>() {}

export class ExportError extends TaggedError("ExportError")<{
  message: string;
}>() {}

export class ParseError extends TaggedError("ParseError")<{
  message: string;
}>() {}

export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  switch (typeof error) {
    case "string":
      return error;
    case "number":
    case "boolean":
    case "bigint":
      return String(error);
    case "symbol":
      return error.description == null ? "Symbol()" : `Symbol(${error.description})`;
    case "undefined":
      return "undefined";
    case "function":
      return "function";
    case "object":
      if (error === null) {
        return "null";
      }

      try {
        return JSON.stringify(error) ?? "Unknown error";
      } catch {
        return "Unknown error";
      }
  }
}

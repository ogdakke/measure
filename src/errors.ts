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

// "Employee" = a row in `users` (the only staff table — Clerk-synced, no
// separate employees table) whose email is on the Yullr domain.
import { query } from "../db";

const EMPLOYEE_DOMAIN = "@yullr.com";

export interface EmployeeMailbox {
  id: string;
  email: string;
}

export async function listEmployeeMailboxes(): Promise<EmployeeMailbox[]> {
  return query<EmployeeMailbox>(
    `SELECT id, email FROM users WHERE email ILIKE $1 ORDER BY email`,
    [`%${EMPLOYEE_DOMAIN}`]
  );
}

export function isEmployeeEmail(addr: string, employeeEmails: Set<string>): boolean {
  return employeeEmails.has(addr.toLowerCase());
}

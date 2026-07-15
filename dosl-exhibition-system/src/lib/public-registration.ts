export type PublicRegistrationDbError = {
  code?: string;
  message?: string;
};

type MutationResult<T> = {
  data: T | null;
  error: PublicRegistrationDbError | null;
};

export interface PublicRegistrationRepository {
  findVisitorByEmail(email: string): Promise<{ id: string } | null>;
  insertVisitor(
    values: { email: string } & Record<string, unknown>,
  ): Promise<MutationResult<{ id: string }>>;
  findRegistration(
    exhibitionId: string,
    visitorId: string,
  ): Promise<{ id: string } | null>;
  generateTicketCode(): Promise<string>;
  insertRegistration(
    values: {
      exhibition_id: string;
      visitor_id: string;
      ticket_code: string;
    } & Record<string, unknown>,
  ): Promise<MutationResult<{ id: string }>>;
}

export type PublicRegistrationFailureStage =
  | "visitor"
  | "ticket"
  | "registration";

export class PublicRegistrationPersistenceError extends Error {
  public readonly stage: PublicRegistrationFailureStage;
  public readonly dbError?: PublicRegistrationDbError | null;

  constructor(
    stage: PublicRegistrationFailureStage,
    dbError?: PublicRegistrationDbError | null,
  ) {
    super(`Public registration failed at ${stage}`);
    this.name = "PublicRegistrationPersistenceError";
    this.stage = stage;
    this.dbError = dbError;
  }
}

export interface PersistPublicRegistrationInput {
  email: string;
  visitorValues: Record<string, unknown>;
  registrationValues: {
    exhibition_id: string;
  } & Record<string, unknown>;
}

export interface PersistPublicRegistrationResult {
  /** Internal use only. Never include this value in the public API response. */
  registrationId: string;
  created: boolean;
}

/**
 * Saves an unauthenticated public registration without ever changing an
 * existing visitor. Email ownership has not been proven at this point, so an
 * existing visitor record must be treated as read-only.
 */
export async function persistPublicRegistration(
  repository: PublicRegistrationRepository,
  input: PersistPublicRegistrationInput,
): Promise<PersistPublicRegistrationResult> {
  let visitor = await repository.findVisitorByEmail(input.email);

  if (!visitor) {
    const inserted = await repository.insertVisitor({
      ...input.visitorValues,
      email: input.email,
    });

    if (inserted.data) {
      visitor = inserted.data;
    } else if (inserted.error?.code === "23505") {
      // A concurrent request may have inserted the same normalized email.
      // Fetch it as read-only; never apply this request's profile values.
      visitor = await repository.findVisitorByEmail(input.email);
    }

    if (!visitor) {
      throw new PublicRegistrationPersistenceError(
        "visitor",
        inserted.error,
      );
    }
  }

  const existing = await repository.findRegistration(
    input.registrationValues.exhibition_id,
    visitor.id,
  );
  if (existing) {
    return { registrationId: existing.id, created: false };
  }

  let ticketCode: string;
  try {
    ticketCode = await repository.generateTicketCode();
  } catch (error) {
    throw new PublicRegistrationPersistenceError("ticket", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const insertedRegistration = await repository.insertRegistration({
    ...input.registrationValues,
    visitor_id: visitor.id,
    ticket_code: ticketCode,
  });

  if (insertedRegistration.data) {
    return {
      registrationId: insertedRegistration.data.id,
      created: true,
    };
  }

  if (insertedRegistration.error?.code === "23505") {
    // The unique exhibition/visitor pair may have been inserted concurrently.
    const concurrent = await repository.findRegistration(
      input.registrationValues.exhibition_id,
      visitor.id,
    );
    if (concurrent) {
      return { registrationId: concurrent.id, created: false };
    }
  }

  throw new PublicRegistrationPersistenceError(
    "registration",
    insertedRegistration.error,
  );
}

/**
 * New and duplicate registrations intentionally receive the exact same body.
 * Ticket secrets are delivered only to the submitted email address.
 */
export function publicRegistrationAccepted() {
  return {
    success: true as const,
    message:
      "受付が完了しました。チケットのご案内をご入力のメールアドレスへ送信しました。",
  };
}

export function publicRegistrationEmailFailed() {
  return {
    success: false as const,
    error:
      "確認メールを送信できませんでした。時間をおいて、同じメールアドレスで再度お試しください。",
  };
}

/**
 * Interprets the identifier-free response used by the public registration
 * screen. A bare `success: true` is not enough to show the safe completion UX.
 */
export function getPublicRegistrationCompletionMessage(
  response: unknown,
): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const value = response as { success?: unknown; message?: unknown };
  return value.success === true && typeof value.message === "string"
    ? value.message
    : null;
}

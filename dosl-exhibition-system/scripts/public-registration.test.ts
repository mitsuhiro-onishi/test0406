import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPublicRegistrationCompletionMessage,
  persistPublicRegistration,
  publicRegistrationAccepted,
  publicRegistrationEmailFailed,
  type PublicRegistrationRepository,
} from "../src/lib/public-registration.ts";

type Visitor = {
  id: string;
  email: string;
  last_name: string;
  first_name: string;
  company_name?: string | null;
};

type Registration = {
  id: string;
  exhibition_id: string;
  visitor_id: string;
  ticket_code: string;
};

function createRepository() {
  const visitors: Visitor[] = [];
  const registrations: Registration[] = [];
  let visitorSequence = 0;
  let registrationSequence = 0;
  let ticketSequence = 0;

  const repository: PublicRegistrationRepository = {
    async findVisitorByEmail(email) {
      return (
        visitors.find((visitor) => visitor.email.toLowerCase() === email) ?? null
      );
    },
    async insertVisitor(values) {
      if (
        visitors.some(
          (visitor) => visitor.email.toLowerCase() === values.email.toLowerCase(),
        )
      ) {
        return { data: null, error: { code: "23505" } };
      }

      const visitor = {
        id: `visitor-${++visitorSequence}`,
        ...values,
      } as Visitor;
      visitors.push(visitor);
      return { data: { id: visitor.id }, error: null };
    },
    async findRegistration(exhibitionId, visitorId) {
      const registration = registrations.find(
        (item) =>
          item.exhibition_id === exhibitionId && item.visitor_id === visitorId,
      );
      return registration ? { id: registration.id } : null;
    },
    async generateTicketCode() {
      return `SECRET-${++ticketSequence}`;
    },
    async insertRegistration(values) {
      if (
        registrations.some(
          (item) =>
            item.exhibition_id === values.exhibition_id &&
            item.visitor_id === values.visitor_id,
        )
      ) {
        return { data: null, error: { code: "23505" } };
      }

      const registration = {
        id: `registration-${++registrationSequence}`,
        ...values,
      } as Registration;
      registrations.push(registration);
      return { data: { id: registration.id }, error: null };
    },
  };

  return { repository, visitors, registrations };
}

test("公開再登録: 既存visitorを変更せず、登録識別子をレスポンスに漏らさない", async () => {
  const { repository, visitors, registrations } = createRepository();

  const first = await persistPublicRegistration(repository, {
    email: "victim@example.com",
    visitorValues: {
      last_name: "山田",
      first_name: "花子",
      company_name: "被害者株式会社",
    },
    registrationValues: {
      exhibition_id: "exhibition-1",
      status: "confirmed",
    },
  });
  const originalVisitor = structuredClone(visitors[0]);
  const originalTicketCode = registrations[0].ticket_code;

  const duplicate = await persistPublicRegistration(repository, {
    email: "victim@example.com",
    visitorValues: {
      last_name: "攻撃者",
      first_name: "太郎",
      company_name: "改ざん会社",
    },
    registrationValues: {
      exhibition_id: "exhibition-1",
      status: "confirmed",
    },
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.deepEqual(visitors[0], originalVisitor);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].ticket_code, originalTicketCode);

  const newRegistrationResponse = publicRegistrationAccepted();
  const duplicateResponse = publicRegistrationAccepted();
  assert.deepEqual(duplicateResponse, newRegistrationResponse);
  assert.equal("ticket_code" in duplicateResponse, false);
  assert.equal("registration_id" in duplicateResponse, false);
  assert.equal(JSON.stringify(duplicateResponse).includes(originalTicketCode), false);
  assert.equal(JSON.stringify(duplicateResponse).includes(duplicate.registrationId), false);

  const emailFailureResponse = publicRegistrationEmailFailed();
  assert.equal("ticket_code" in emailFailureResponse, false);
  assert.equal("registration_id" in emailFailureResponse, false);
});

test("登録画面: 一般化された成功応答でメール案内の完了画面へ遷移する", () => {
  const response = publicRegistrationAccepted();

  assert.equal(
    getPublicRegistrationCompletionMessage(response),
    response.message,
  );
  assert.equal(
    getPublicRegistrationCompletionMessage({ success: true }),
    null,
  );
  assert.equal(
    getPublicRegistrationCompletionMessage({
      success: false,
      error: "登録に失敗しました",
    }),
    null,
  );
});

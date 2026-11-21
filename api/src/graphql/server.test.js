import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { yoga } from "./server.js";

describe("GraphQL API integration", () => {
  it("svarar på en GraphQL-fråga", async () => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "{ __typename }",
      }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.__typename).toBe("Query");
  });
});

describe("Autentisering", () => {
  it("nekar createTour utan inloggning", async () => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation {
            createTour(input: {
              title: "Test"
              startedAt: "2026-10-22"
              distanceM: 100
            }) {
              id
            }
          }
        `,
      }),
    });

    const result = await response.json();

    expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  const createTourWithToken = async (token) => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `
          mutation {
            createTour(input: {
              title: "Forged test"
              startedAt: "2026-10-22"
              distanceM: 100
            }) {
              id
            }
          }
        `,
      }),
    });
    return response.json();
  };

  const editorClaims = { id: 1, email: "editor@example.com", role: "editor" };

  it("nekar en förfalskad JWT med alg:none", async () => {
    const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const forgedToken = `${base64url({ alg: "none", typ: "JWT" })}.${base64url(editorClaims)}.`;

    const result = await createTourWithToken(forgedToken);

    expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  // Låser fixen: jsonwebtoken nekar alg:none redan själv, men utan algorithms: ["HS256"]
  // godtas en token signerad med samma hemlighet och en annan algoritm (HS512).
  it("nekar en JWT signerad med annan algoritm än HS256", async () => {
    const token = jwt.sign(editorClaims, config.jwtSecret, { algorithm: "HS512" });

    const result = await createTourWithToken(token);

    expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });
});

describe("PostgreSQL integration", () => {
  it("hämtar guider från databasen", async () => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "{ guides { id slug title } }",
      }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.errors).toBeUndefined();
    expect(result.data.guides.length).toBeGreaterThan(0);
  });
});

describe("PostgreSQL turer", () => {
  it("hämtar turer från databasen", async () => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "{ tours(limit: 2) { id title distanceM } }",
      }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.errors).toBeUndefined();
    expect(result.data.tours).toHaveLength(2);
  });
});

describe("PostgreSQL enskild guide", () => {
  it("hämtar en guide med slug", async () => {
    const guidesResponse = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "{ guides { id slug } }",
      }),
    });

    const guidesResult = await guidesResponse.json();
    expect(guidesResult.errors).toBeUndefined();

    const selectedGuide = guidesResult.data.guides[0];
    expect(selectedGuide).toBeDefined();

    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query Guide($slug: String!) {
            guide(slug: $slug) {
              id
              slug
              title
            }
          }
        `,
        variables: { slug: selectedGuide.slug },
      }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.errors).toBeUndefined();
    expect(result.data.guide.id).toBe(selectedGuide.id);
  });
});

describe("MongoDB integration", () => {
  it("kan skriva och läsa ett dokument i MongoDB", async () => {
    const { mongo, toursCollection } = await import("../db/mongo.js");

    const testId = `vitest-${process.pid}-${Date.now()}`;

    try {
      await mongo.connect();

      await toursCollection().insertOne({
        tour_id: testId,
        title: "Vitest integration",
        logs: [{ lat: 59.3, lon: 18.0 }],
      });

      const tour = await toursCollection().findOne({ tour_id: testId });

      expect(tour).not.toBeNull();
      expect(tour.title).toBe("Vitest integration");
      expect(tour.logs).toHaveLength(1);
    } finally {
      await toursCollection().deleteOne({ tour_id: testId });
      await mongo.close();
    }
  });
});
describe("N+1 regression", () => {
  it("begränsar antalet databasfrågor med DataLoader", async () => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          {
            tours(limit: 50) {
              id
              title
              user {
                id
                displayName
              }
              guide {
                id
                title
              }
              photoCount
            }
          }
        `,
      }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.errors).toBeUndefined();
    expect(result.data.tours.length).toBeGreaterThan(0);

    expect(result.extensions.databasfragor).toBeTypeOf("number");
    expect(result.extensions.databasfragor).toBeLessThanOrEqual(4);
  });
});

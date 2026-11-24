
export const typeDefs = /* GraphQL */ `
  type Guide {
    id: ID!
    slug: String!
    title: String!
    region: String!
    difficulty: String!
    lengthKm: Float!
    bodyHtml: String!
    heroImage: String
    published: Boolean!
    updatedAt: String!
    "Editorial notices for this guide, fetched from the CMS"
    notices: [Notice!]!
  }

  "A piece of text inside a paragraph. Rich text as data: the client decides how bold text and links look."
  type TextRun {
    text: String!
    bold: Boolean!
    italic: Boolean!
    "Where the run links to, if it is a link"
    href: String
  }

  type Paragraph {
    runs: [TextRun!]!
  }

  "An editorial notice. The content lives in the CMS, not in the database."
  type Notice {
    id: ID!
    title: String!
    "info or warning: what the notice IS, not what colour it has"
    level: String!
    body: [Paragraph!]!
    "Which guide the notice applies to. Null means it applies to all of Utpost"
    guideSlug: String
    "published, draft or changed. Anything other than published is only visible in preview"
    status: String!
  }

  type User {
    id: ID!
    displayName: String!
    role: String!
    createdAt: String!
  }

  type Photo {
    id: ID!
    filename: String!
    width: Int!
    height: Int!
    createdAt: String!
  }

  type TourLog {
    id: ID!
    recordedAt: String!
    lat: Float!
    lon: Float!
    elevationM: Int
    heartRate: Int
    note: String
  }

  type Tour {
    id: ID!
    title: String!
    startedAt: String!
    distanceM: Int!
    notes: String
    photoCount: Int!
    user: User!
    guide: Guide
    photos: [Photo!]!
    logs: [TourLog!]!
  }

  input CreateTourInput {
    title: String!
    guideId: ID
    startedAt: String!
    distanceM: Int!
    notes: String
  }

  type Query {
    guides: [Guide!]!
    guide(slug: String!): Guide
    "Editorial notices. preview: true also shows drafts and requires the editor role"
    notices(preview: Boolean = false): [Notice!]!
    tours(limit: Int): [Tour!]!
    tour(id: ID!): Tour
  }

  type Mutation {
    createTour(input: CreateTourInput!): Tour!
  }
`;
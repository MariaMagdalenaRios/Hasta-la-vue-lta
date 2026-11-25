/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Guides {\n    guides {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      excerpt\n      heroImage\n      published\n      updatedAt\n    }\n  }\n": typeof types.GuidesDocument,
    "\n  query Tours($limit: Int) {\n    tours(limit: $limit) {\n      id\n      title\n      distanceM\n      photoCount\n      user {\n        displayName\n      }\n      guide {\n        title\n      }\n    }\n  }\n": typeof types.ToursDocument,
    "\n  query GuideDetail($slug: String!) {\n    guide(slug: $slug) {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      body {\n        type\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n        items {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n      notices {\n        id\n        title\n        level\n        status\n        guideSlug\n        body {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n    }\n  }\n": typeof types.GuideDetailDocument,
    "\n  query Home($preview: Boolean = false) {\n    guides {\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n    }\n    tours(limit: 5) {\n      id\n      title\n      distanceM\n    }\n    notices(preview: $preview) {\n      id\n      title\n      level\n      status\n      guideSlug\n      body {\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n      }\n    }\n  }\n": typeof types.HomeDocument,
};
const documents: Documents = {
    "\n  query Guides {\n    guides {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      excerpt\n      heroImage\n      published\n      updatedAt\n    }\n  }\n": types.GuidesDocument,
    "\n  query Tours($limit: Int) {\n    tours(limit: $limit) {\n      id\n      title\n      distanceM\n      photoCount\n      user {\n        displayName\n      }\n      guide {\n        title\n      }\n    }\n  }\n": types.ToursDocument,
    "\n  query GuideDetail($slug: String!) {\n    guide(slug: $slug) {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      body {\n        type\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n        items {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n      notices {\n        id\n        title\n        level\n        status\n        guideSlug\n        body {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n    }\n  }\n": types.GuideDetailDocument,
    "\n  query Home($preview: Boolean = false) {\n    guides {\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n    }\n    tours(limit: 5) {\n      id\n      title\n      distanceM\n    }\n    notices(preview: $preview) {\n      id\n      title\n      level\n      status\n      guideSlug\n      body {\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n      }\n    }\n  }\n": types.HomeDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Guides {\n    guides {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      excerpt\n      heroImage\n      published\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query Guides {\n    guides {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      excerpt\n      heroImage\n      published\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Tours($limit: Int) {\n    tours(limit: $limit) {\n      id\n      title\n      distanceM\n      photoCount\n      user {\n        displayName\n      }\n      guide {\n        title\n      }\n    }\n  }\n"): (typeof documents)["\n  query Tours($limit: Int) {\n    tours(limit: $limit) {\n      id\n      title\n      distanceM\n      photoCount\n      user {\n        displayName\n      }\n      guide {\n        title\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GuideDetail($slug: String!) {\n    guide(slug: $slug) {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      body {\n        type\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n        items {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n      notices {\n        id\n        title\n        level\n        status\n        guideSlug\n        body {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GuideDetail($slug: String!) {\n    guide(slug: $slug) {\n      id\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n      body {\n        type\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n        items {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n      notices {\n        id\n        title\n        level\n        status\n        guideSlug\n        body {\n          runs {\n            text\n            bold\n            italic\n            href\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Home($preview: Boolean = false) {\n    guides {\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n    }\n    tours(limit: 5) {\n      id\n      title\n      distanceM\n    }\n    notices(preview: $preview) {\n      id\n      title\n      level\n      status\n      guideSlug\n      body {\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Home($preview: Boolean = false) {\n    guides {\n      slug\n      title\n      region\n      difficulty\n      lengthKm\n    }\n    tours(limit: 5) {\n      id\n      title\n      distanceM\n    }\n    notices(preview: $preview) {\n      id\n      title\n      level\n      status\n      guideSlug\n      body {\n        runs {\n          text\n          bold\n          italic\n          href\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;
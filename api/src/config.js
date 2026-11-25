try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch (error) {
  // Docker and production provide variables through the process environment.
  if (error.code !== 'ENOENT') throw error;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  mongoUrl: process.env.MONGO_URL,
  jwtSecret: process.env.JWT_SECRET,
  //port: 4000,
  port: Number(process.env.PORT) || 4000,
  gitSha: process.env.GIT_SHA || 'dev',
  uploadDir: './uploads',
  imageFunctionUrl: process.env.IMAGE_FUNCTION_URL,
  imageFunctionKey: process.env.IMAGE_FUNCTION_KEY,
  cmsSpaceId: process.env.CONTENTFUL_SPACE_ID ?? '',
  cmsEnvironment: process.env.CONTENTFUL_ENVIRONMENT ?? 'master',
  cmsDeliveryToken: process.env.CONTENTFUL_DELIVERY_TOKEN ?? '',
  cmsPreviewToken: process.env.CONTENTFUL_PREVIEW_TOKEN ?? '',
  cmsCacheSeconds: Number(process.env.CMS_CACHE_SECONDS ?? 60),
  // Fredagens labb: hemligheten som CMS:et skickar med när det anropar /api/cms/webhook. Tom = webhooken är stängd.
  cmsWebhookSecret: process.env.CMS_WEBHOOK_SECRET ?? '',
};
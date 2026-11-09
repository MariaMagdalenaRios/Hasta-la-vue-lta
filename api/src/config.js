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
};
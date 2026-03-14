import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import express from 'express';
import { AppModule } from './app.module';

const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

// Creating the express instance correctly
const expressApp = express();

async function bootstrap() {
  try {
    console.log('Starting application...');
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );
    console.log('App created successfully');

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    app.enableCors({
      origin: FRONTEND_ORIGIN,
      credentials: true,
    });

    console.log('Configurations applied');

    // If not in production, start the HTTP server
    if (process.env.NODE_ENV !== 'production') {
      await app.listen(process.env.PORT || 3001);
      console.log('Application running on port:', process.env.PORT || 3001);
    } else {
      await app.init();
      console.log('Application initialized in serverless mode');
    }

    return app;
  } catch (error) {
    console.error('Error starting application:', error);
    throw error;
  }
}

// For local development
if (process.env.NODE_ENV !== 'production') {
  bootstrap();
}

// For Vercel
export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  const instance = app.getHttpAdapter().getInstance();
  return instance(req, res);
}

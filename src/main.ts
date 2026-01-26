import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import 'dotenv/config';
import express from 'express';
import { AppModule } from './app.module';

// Criando a instância do express corretamente
const expressApp = express();

async function bootstrap() {
  try {
    console.log('Iniciando aplicação...');
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );
    console.log('App criado com sucesso');

    app.useGlobalPipes(new ValidationPipe());
    app.enableCors({
      origin: '*',
    });

    console.log('Configurações aplicadas');

    // Se não estiver em produção, inicia o servidor HTTP
    if (process.env.NODE_ENV !== 'production') {
      await app.listen(process.env.PORT || 3001);
      console.log('Aplicação rodando na porta:', process.env.PORT || 3001);
    } else {
      await app.init();
      console.log('Aplicação inicializada em modo serverless');
    }

    return app;
  } catch (error) {
    console.error('Erro ao iniciar aplicação:', error);
    throw error;
  }
}

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  bootstrap();
}

// Para Vercel
export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  const instance = app.getHttpAdapter().getInstance();
  return instance(req, res);
}

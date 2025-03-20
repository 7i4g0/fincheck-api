import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    console.log('Iniciando aplicação...');
    const app = await NestFactory.create(AppModule);
    console.log('App criado com sucesso');

    app.useGlobalPipes(new ValidationPipe());
    app.enableCors({
      origin: '*',
    });

    console.log('Configurações aplicadas');
    await app.listen(process.env.PORT || 3001);
    console.log('Aplicação rodando na porta:', process.env.PORT || 3001);
  } catch (error) {
    console.error('Erro ao iniciar aplicação:', error);
    throw error;
  }
}

if (process.env.NODE_ENV !== 'production') {
  bootstrap();
}

export default bootstrap;

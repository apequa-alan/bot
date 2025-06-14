import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT', 3000);

  try {
    await app.listen(port);
    console.log(`Application is running on port ${port}`);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Please try a different port.`,
      );
      process.exit(1);
    }
    throw error;
  }
}

bootstrap();

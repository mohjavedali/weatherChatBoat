import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/weather/weather.module.js';
import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
// Explicitly load env configuration before instantiation
dotenv.config();
async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule);
    // Enable Cross-Origin Resource Sharing (CORS) for external frontends
    app.enableCors();
    // Set global API route prefix (Optional: converts url to http://localhost:3000/api/weather/query)
    app.setGlobalPrefix('api');
    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`🚀 Weather Agent Microservice is running on: http://localhost:${port}`);
}
bootstrap();

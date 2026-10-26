import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

@Module({
    imports: [],
    controllers: [WeatherController], // Registered directly here
    providers: [WeatherService],      // Registered directly here
})
export class AppModule { }

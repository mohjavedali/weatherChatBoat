import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
export const weatherTool = tool(async ({ location }) => {
    try {
        // Replace with your preferred weather API endpoint and API key
        const apiKey = process.env.WEATHER_API_KEY;
        const response = await axios.get(`https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=London`);
        const { main, weather } = response.data;
        return `The current weather in ${location} is ${weather[0].description} with a temperature of ${main.temp}°C and humidity of ${main.humidity}%.`;
    }
    catch (error) {
        return `Could not fetch weather for ${location}. Error: ${error.message}`;
    }
}, {
    name: 'fetch_weather',
    description: 'Fetches the current real-time weather conditions for a given city or location.',
    schema: z.object({
        location: z.string().describe('The city and state/country, e.g., San Francisco, CA or London, UK'),
    }),
});

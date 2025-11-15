export interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  visibility: number;
  description: string;
  icon: string;
}

export const getWeatherData = async (lat: number, lon: number): Promise<WeatherData> => {
  // Validate coordinates
  if (!lat || !lon || lat === 0 || lon === 0) {
    throw new Error('Invalid coordinates provided');
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=070b8d1eb7f4b59140b6788d2bb9e26f&units=metric`
    );

    if (!response.ok) {
      throw new Error(`Weather API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('Weather API Response:', data); // For debugging
    
    if (!data.main || !data.weather || !data.weather[0]) {
      throw new Error('Invalid weather data structure received');
    }
    
    return {
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      wind_speed: data.wind?.speed || 0,
      wind_deg: data.wind?.deg || 0,
      wind_gust: data.wind?.gust,
      visibility: data.visibility,
      description: data.weather[0].description,
      icon: data.weather[0].icon
    };
  } catch (error) {
    console.error('Error fetching weather data:', error);
    // Instead of mock data, re-throw the error to handle it in the component
    throw new Error(`Failed to fetch weather data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};